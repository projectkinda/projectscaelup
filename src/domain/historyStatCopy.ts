export type HistoryStatValues = {
  currentStreak: number; bestStreak: number; totalSessionsCompleted: number; focusedToday: boolean;
};
export const STAT_WEEK_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const HISTORY_STAT_COPY = { week: 'This week', current: 'day streak', best: 'best streak' };
export function statInteger(value: number) { return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0; }
export function statSessionLabel(count: number) { return count === 1 ? 'session' : 'sessions'; }
export function weekCountCopy(count: number) { return `${count} of 7 days`; }
export function historyStatLine(values: HistoryStatValues) {
  const total = statInteger(values.totalSessionsCompleted);
  const current = statInteger(values.currentStreak);
  const best = statInteger(values.bestStreak);
  if (total === 0) return 'Your first focus session starts your streak.';
  if (values.focusedToday && current >= best) return "You're on your best streak. Keep it going.";
  if (values.focusedToday) {
    const remaining = best - current;
    return `${remaining} more ${remaining === 1 ? 'day' : 'days'} to tie your best.`;
  }
  if (current > 0) return `Focus today to keep your ${current}-day streak.`;
  return 'Focus today to start a new streak.';
}
export function statAccessibility(name: 'current' | 'sessions' | 'best', value: number) {
  const count = statInteger(value);
  return name === 'sessions' ? `Total sessions: ${count} ${statSessionLabel(count)}`
    : `${name === 'current' ? 'Current streak' : 'Best streak'}: ${count} ${count === 1 ? 'day' : 'days'}`;
}
export function weekDayAccessibility(index: number, focused: boolean, todayIndex: number) {
  const status = focused ? 'focused' : index > todayIndex ? 'upcoming' : 'no focused session';
  return `${WEEKDAYS[index]}: ${status}${index === todayIndex ? ', today' : ''}`;
}
