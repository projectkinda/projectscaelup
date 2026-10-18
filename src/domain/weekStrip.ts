export type ThisWeek = { days: boolean[]; todayIndex: number };

// Construct local calendar midnights, rather than adding 24-hour durations:
// DST weeks can contain 167 or 169 hours while still having seven days.
export function localWeekBoundaries(now: Date): Date[] {
  const mondayOffset = (now.getDay() + 6) % 7;
  return Array.from({ length: 8 }, (_, index) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset + index),
  );
}

// Inputs are completion timestamps, already filtered with completed = 1.
// Boundaries can be supplied explicitly when a caller owns timezone conversion.
export function buildWeekStrip(
  completedAt: readonly string[], now: Date, boundaries: readonly Date[] = localWeekBoundaries(now),
): ThisWeek {
  const todayIndex = (now.getDay() + 6) % 7;
  const timestamps = completedAt.map(value => Date.parse(value)).filter(Number.isFinite);
  const days = Array.from({ length: 7 }, (_, index) => index <= todayIndex && timestamps.some(time =>
    time >= boundaries[index].getTime() && time < boundaries[index + 1].getTime() && time <= now.getTime(),
  ));
  return { days, todayIndex };
}
