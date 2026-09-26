import { ensureSchema, getDatabase } from '../data/database';
import { UsageTrackingModule } from './usageTrackingModule';

type AppUsageState = {
  cumulativeMs: number;
  hasCountedThisVisit: boolean;
  lastTickAt: number | null;
};

const APP_TOUCH_THRESHOLD_MS = 30_000;

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

  const closePreviousApp = () => {
    if (!currentForegroundApp) {
      return;
    }

    const currentState = usageByApp[currentForegroundApp];
    if (currentState?.lastTickAt) {
      currentState.cumulativeMs += Date.now() - currentState.lastTickAt;
      currentState.lastTickAt = null;
      currentState.hasCountedThisVisit = false;
    }
  };

  const recordIfThresholdReached = async (appIdentifier: string) => {
    const currentState = usageByApp[appIdentifier];
    if (!currentState?.lastTickAt || currentState.hasCountedThisVisit) {
      return;
    }

    const visitMs = Date.now() - currentState.lastTickAt;
    if (currentState.cumulativeMs + visitMs < APP_TOUCH_THRESHOLD_MS) {
      return;
    }

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
      [sessionId, appIdentifier, new Date().toISOString()],
    );
    currentState.hasCountedThisVisit = true;
  };

  const startThresholdLoop = (appIdentifier: string) => {
    stopThresholdLoop();
    intervalId = setInterval(() => {
      recordIfThresholdReached(appIdentifier).catch(error => {
        console.warn('Failed to record app usage distraction:', error);
      });
    }, 1000);
  };

  const unsubscribe = UsageTrackingModule.onAppUsageTick(({ appIdentifier }) => {
    closePreviousApp();
    stopThresholdLoop();
    currentForegroundApp = appIdentifier;

    const nextState = usageByApp[appIdentifier];
    if (!nextState) {
      return;
    }

    nextState.lastTickAt = Date.now();
    startThresholdLoop(appIdentifier);
  });

  return () => {
    closePreviousApp();
    stopThresholdLoop();
    unsubscribe();
  };
}
