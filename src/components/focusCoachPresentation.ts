import { formatDuration } from '../domain/durationFormat';
import type { FocusCoachExperiment, FocusCoachExperimentId } from '../domain/focusCoach';

// Presentation only: a distant suggested goal must not flatten the actual data.
export function cleanTrendGeometry(values: number[], suggestionMinutes: number | null) {
  const largest = Math.max(0, ...values);
  const goal = suggestionMinutes === null ? null : suggestionMinutes * 60;
  const visibleGoal = goal !== null && goal <= largest * 3 ? goal : null;
  const maximum = Math.max(1, largest, visibleGoal ?? 0);
  return {
    goalY: visibleGoal === null ? null : 50 - (visibleGoal / maximum) * 44,
    points: values.map((value, index) => ({
      x: values.length === 1 ? 80 : 6 + (index / (values.length - 1)) * 148,
      y: 50 - Math.max(value > 0 ? 4 : 0, (value / maximum) * 44),
    })),
  };
}

// The model tracks elapsed days, not adherence; lastResult belongs to the previous week.
export function experimentDaysDone(experiment: FocusCoachExperiment, now = Date.now()) {
  if (experiment.result !== null) return 7;
  const elapsed = now - Date.parse(experiment.startedAt);
  return Number.isFinite(elapsed) ? Math.max(0, Math.min(7, Math.floor(elapsed / 86400000))) : 0;
}

export const SHORT_EXPERIMENT_COPY: Record<FocusCoachExperimentId, string> = {
  morning_session: 'One morning session',
  shorter_sessions: 'Slightly shorter sessions',
  phone_out_of_reach: 'Phone out of reach',
  five_minute_break: '5 min breaks between sessions',
};

export function durationInWords(seconds: number) {
  const value = Math.max(0, Math.round(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remainder = value % 60;
  return [hours ? `${hours} ${hours === 1 ? 'hour' : 'hours'}` : '', minutes ? `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}` : '',
    remainder || value === 0 ? `${remainder} ${remainder === 1 ? 'second' : 'seconds'}` : ''].filter(Boolean).join(' ');
}

export function tileDuration(seconds: number) {
  return seconds < 60 ? formatDuration(seconds)
    : formatDuration(seconds).replace(/ min/g, 'm').replace(/ sec/g, 's').replace(/ /g, '');
}