import { MAX_PAUSE_SECONDS } from './pauseRules';

/** Milliseconds until a source timer's deadline; no timer state is created here. */
export function liveTimerRemainingMs(endsAtMs: number, nowMs = Date.now()) {
  return Number.isFinite(endsAtMs) && Number.isFinite(nowMs)
    ? Math.max(0, endsAtMs - nowMs) : 0;
}

/** A paused mirror must not become an immortal notification after process death. */
export function pausedLiveTimerTimeoutMs(remainingMs: number) {
  return Number.isFinite(remainingMs) && remainingMs > 0
    ? remainingMs + MAX_PAUSE_SECONDS * 1000 : 0;
}

export type LiveTimerSnapshot =
  | { state: 'running'; endsAtMs: number }
  | { state: 'paused'; remainingMs: number }
  | { state: 'ended' };

export function liveTimerSnapshot({ remainingSeconds, endsAtMs, isPaused, awaitingEndChoice }: {
  remainingSeconds: number | null;
  endsAtMs: number | null;
  isPaused: boolean;
  awaitingEndChoice: boolean;
}): LiveTimerSnapshot {
  if (remainingSeconds === null || !Number.isFinite(remainingSeconds) || remainingSeconds <= 0 || awaitingEndChoice) {
    return { state: 'ended' };
  }
  if (isPaused) return { state: 'paused', remainingMs: remainingSeconds * 1000 };
  return endsAtMs !== null && Number.isFinite(endsAtMs)
    ? { state: 'running', endsAtMs } : { state: 'ended' };
}
