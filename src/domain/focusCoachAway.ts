import type { AwayDisplay } from './awayTime';
import type { FocusCoachAway, FocusCoachSession } from './focusCoach';

type CoachPlatform = 'android' | 'ios' | string;

export function buildFocusCoachAway({
  display,
  latestSession,
  platform,
}: {
  display: AwayDisplay;
  latestSession: FocusCoachSession | null;
  platform: CoachPlatform;
}): FocusCoachAway | null {
  if (platform !== 'android' || display.kind === 'hidden') {
    return null;
  }

  const afterSessionVerified =
    latestSession?.afterSessionAwayVerified === true;

  return {
    sinceLastUseSeconds: display.seconds,
    display: display.kind,
    afterSessionSeconds: afterSessionVerified
      ? latestSession?.afterSessionAwaySeconds ?? null
      : null,
    afterSessionVerified,
  };
}

export async function safeLoadFocusCoachAway({
  loadDisplay,
  latestSession,
  platform,
}: {
  loadDisplay: () => Promise<AwayDisplay>;
  latestSession: FocusCoachSession | null;
  platform: CoachPlatform;
}): Promise<FocusCoachAway | null> {
  if (platform !== 'android') {
    return null;
  }

  try {
    return buildFocusCoachAway({
      display: await loadDisplay(),
      latestSession,
      platform,
    });
  } catch (error) {
    console.warn('Failed to load coach away data:', error);
    return null;
  }
}
