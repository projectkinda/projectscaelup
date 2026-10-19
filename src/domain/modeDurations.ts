import type { SessionMode } from './sessionModes';

// Shared by the wheels, custom-mode defaults, and persisted duration resolution.
export const TIMER_MAX_MINUTES = 60;
export const TIMER_MAX_SECONDS = 59;
export const TIMER_MAX_TOTAL_SECONDS = TIMER_MAX_MINUTES * 60 + TIMER_MAX_SECONDS;
export const CUSTOM_MODE_DEFAULT_MINUTES = 25;
export const MODE_DURATION_KEY_PREFIX = 'modeDurationSeconds:';
export type ModeDurations = Readonly<Record<string, number | undefined>>;

export function modeDurationKey(modeId: string): string {
  return MODE_DURATION_KEY_PREFIX + modeId;
}

export function clampSessionSeconds(seconds: number): number {
  return Number.isFinite(seconds) ? Math.max(0, Math.min(TIMER_MAX_TOTAL_SECONDS, Math.trunc(seconds))) : 0;
}

export function isValidDefaultMinutes(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= TIMER_MAX_MINUTES;
}

/** Only explicit edits are cached. Merely visiting a mode must not freeze its default. */
export function withModeDuration(memory: ModeDurations, modeId: string, seconds: number): ModeDurations {
  return { ...memory, [modeId]: clampSessionSeconds(seconds) };
}

export function resolveModeDuration(
  mode: Pick<SessionMode, 'id' | 'defaultMinutes'> | undefined,
  remembered: ModeDurations = {},
  memory: ModeDurations = {},
): number | undefined {
  if (!mode) return undefined;
  const edited = memory[mode.id];
  const stored = remembered[mode.id];
  if (typeof edited === 'number' && Number.isFinite(edited)) return clampSessionSeconds(edited);
  if (typeof stored === 'number' && Number.isFinite(stored)) return clampSessionSeconds(stored);
  return clampSessionSeconds(mode.defaultMinutes * 60);
}
