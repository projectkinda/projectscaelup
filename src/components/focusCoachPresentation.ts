import type { FocusCoachExperiment } from '../domain/focusCoach';

// The model tracks elapsed days, not adherence; lastResult belongs to the previous week.
export function experimentDaysDone(experiment: FocusCoachExperiment, now = Date.now()) {
  if (experiment.result !== null) return 7;
  const elapsed = now - Date.parse(experiment.startedAt);
  return Number.isFinite(elapsed) ? Math.max(0, Math.min(7, Math.floor(elapsed / 86400000))) : 0;
}
