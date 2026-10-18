import { liveTimerRemainingMs, pausedLiveTimerTimeoutMs } from './liveTimerState';

export function liveTimerLabel(name: string): string {
  return name.trim().slice(0, 40) || 'Focus';
}

type Mirror = { state: 'running'; endsAtMs: number; label: string }
  | { state: 'paused'; remainingMs: number; label: string } | null;

export type LiveTimerNative = {
  startLiveTimer(endsAtMs: number, label: string): void;
  pauseLiveTimer(remainingMs: number, timeoutMs: number): void;
  resumeLiveTimer(endsAtMs: number): void;
  stopLiveTimer(): void;
};

/** Serializes best-effort mirror updates. Permission UI never holds up session actions. */
export function createLiveTimerController({ native, requestPermission, now = Date.now }: {
  native: LiveTimerNative;
  requestPermission: (stillActive: () => boolean) => Promise<boolean>;
  now?: () => number;
}) {
  let mirror: Mirror = null;
  let revision = 0;
  let session = 0;
  let needsStart = false;
  let queue = Promise.resolve();

  const publish = () => {
    const expected = ++revision;
    queue = queue.then(() => {
      if (expected !== revision) return;
      try {
        if (mirror && needsStart) {
          needsStart = false;
          // A coalesced start -> pause still initializes the new session's label
          // and dismissal token. A zero deadline initializes without posting.
          native.startLiveTimer(mirror.state === 'running' ? mirror.endsAtMs : 0, mirror.label);
          if (mirror.state === 'running') return;
        }
        if (!mirror) native.stopLiveTimer();
        else if (mirror.state === 'paused') {
          native.pauseLiveTimer(mirror.remainingMs, pausedLiveTimerTimeoutMs(mirror.remainingMs));
        } else if (liveTimerRemainingMs(mirror.endsAtMs, now()) === 0) native.stopLiveTimer();
        else native.resumeLiveTimer(mirror.endsAtMs);
      } catch { /* A notification must never fail a session. */ }
    }).catch(() => {});
    return queue;
  };

  return {
    startLiveTimer({ endsAtMs, label }: { endsAtMs: number; label: string }) {
      const currentSession = ++session;
      mirror = { state: 'running', endsAtMs, label: liveTimerLabel(label) };
      needsStart = true;
      const posted = publish();
      // The permission result republishes CURRENT state, never a stale start snapshot.
      void (async () => {
        try {
          const granted = await requestPermission(() => mirror !== null && session === currentSession);
          if (granted && mirror !== null && session === currentSession) await publish();
        } catch { /* Permission failures are optional. */ }
      })();
      return posted;
    },
    pauseLiveTimer({ remainingMs }: { remainingMs: number }) {
      mirror = { state: 'paused', remainingMs, label: mirror?.label ?? 'Focus' };
      return publish();
    },
    resumeLiveTimer({ endsAtMs }: { endsAtMs: number }) {
      mirror = { state: 'running', endsAtMs, label: mirror?.label ?? 'Focus' };
      return publish();
    },
    stopLiveTimer() {
      mirror = null;
      needsStart = false;
      session += 1;
      return publish();
    },
  };
}
