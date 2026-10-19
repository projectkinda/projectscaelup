import { warn } from '../domain/releaseLog';
﻿export const DEV_SAMPLE_SESSION_IDS_KEY = 'dev_sample_session_ids';
const listeners = new Set<() => void>();
export function subscribeCoachDataChanges(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function notifyCoachDataChanged() {
  for (const listener of listeners) {
    try { listener(); } catch (error) { warn('Could not refresh coach data:', error); }
  }
}
