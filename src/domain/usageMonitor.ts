import { ensureSchema, getDatabase } from '../data/database';
import { UsageTrackingModule } from './usageTrackingModule';

type AppUsageState = {
  cumulativeMs: number;
  hasCountedThisVisit: boolean;
  lastTickAt: number | null;
};

const APP_TOUCH_THRESHOLD_MS = 30_000;
const IGNORED_PACKAGES = new Set(['com.android.systemui']);

function shouldIgnorePackage(appIdentifier: string) {
  const normalized = appIdentifier.toLowerCase();
  return (
    IGNORED_PACKAGES.has(appIdentifier) ||
    normalized.includes('inputmethod') ||
    normalized.includes('keyboard')
  );
}

export function startUsageMonitor(
  sessionId: number,
  flaggedAppIdentifiers: string[],
) {
  const usageByApp: Record<string, AppUsageState> = {};
  flaggedAppIdentifiers.forEach(id => {
    usageByApp[id] = {
      cumulativeMs: 0,
      hasCountedThisVisit: false,
      lastTickAt: null,
    };
  });

  let currentForegroundApp: string | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const stopThresholdLoop = () => {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  const crossedThreshold = (state: AppUsageState) =>
    state.lastTickAt !== null &&
    !state.hasCountedThisVisit &&
    state.cumulativeMs + (Date.now() - state.lastTickAt) >=
      APP_TOUCH_THRESHOLD_MS;

  const crossedAtMs = (state: AppUsageState) =>
    (state.lastTickAt as number) +
    Math.max(0, APP_TOUCH_THRESHOLD_MS - state.cumulativeMs);

  const recordAppTouch = async (
    appIdentifier: string,
    occurredAtMs: number,
  ) => {
    const database = await getDatabase();
    await ensureSchema(database);
    await database.runAsync(
      `
        INSERT INTO distraction_events (
          session_id,
          type,
          app_identifier,
          occurred_at
        )
        VALUES (?, 'app_touched', ?, ?);
      `,
      [sessionId, appIdentifier, new Date(occurredAtMs).toISOString()],
    );
  };

  const checkAndRecord = (appIdentifier: string) => {
    const currentState = usageByApp[appIdentifier];
    if (!currentState || !crossedThreshold(currentState)) {
      return;
    }

    currentState.hasCountedThisVisit = true;
    const occurredAtMs = crossedAtMs(currentState);
    recordAppTouch(appIdentifier, occurredAtMs).catch(error => {
      console.warn('Failed to record app usage distraction:', error);
    });
  };

  const leaveCurrentApp = () => {
    stopThresholdLoop();

    if (!currentForegroundApp) {
      return;
    }

    const currentState = usageByApp[currentForegroundApp];
    if (currentState?.lastTickAt) {
      checkAndRecord(currentForegroundApp);
      currentState.cumulativeMs += Date.now() - currentState.lastTickAt;
      currentState.lastTickAt = null;
      currentState.hasCountedThisVisit = false;
    }
  };

  const startThresholdLoop = (appIdentifier: string) => {
    stopThresholdLoop();
    intervalId = setInterval(() => {
      checkAndRecord(appIdentifier);
    }, 1000);
  };

  const unsubscribe = UsageTrackingModule.onAppUsageTick(({ appIdentifier }) => {
    if (
      appIdentifier === currentForegroundApp ||
      shouldIgnorePackage(appIdentifier)
    ) {
      return;
    }

    leaveCurrentApp();
    currentForegroundApp = appIdentifier;

    const nextState = usageByApp[appIdentifier];
    if (!nextState) {
      return;
    }

    nextState.lastTickAt = Date.now();
    startThresholdLoop(appIdentifier);
  });

  return () => {
    leaveCurrentApp();
    unsubscribe();
  };
}
