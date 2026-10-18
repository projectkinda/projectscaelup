import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { pauseLiveTimer, resumeLiveTimer, startLiveTimer, stopLiveTimer } from './androidLiveTimer';
import { liveTimerSnapshot } from './liveTimerState';

/** Mirrors transitions, not ticks. Home stays mounted while other tabs are visible. */
export function useAndroidLiveTimer(source: Parameters<typeof liveTimerSnapshot>[0], modeName: string) {
  const snapshot = liveTimerSnapshot(source);
  const runningEnd = snapshot.state === 'running' ? snapshot.endsAtMs : null;
  const pausedRemaining = snapshot.state === 'paused' ? snapshot.remainingMs : null;
  const sessionGone = source.remainingSeconds === null;
  const started = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (sessionGone) started.current = false;
    if (runningEnd !== null) {
      if (!started.current) {
        started.current = true;
        void startLiveTimer({ endsAtMs: runningEnd, label: modeName });
      } else void resumeLiveTimer({ endsAtMs: runningEnd });
    } else if (pausedRemaining !== null) void pauseLiveTimer({ remainingMs: pausedRemaining });
    else void stopLiveTimer();
  }, [pausedRemaining, runningEnd, sessionGone, modeName]);

  useEffect(() => () => { if (Platform.OS === 'android') void stopLiveTimer(); }, []);
}
