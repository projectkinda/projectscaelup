import type { CoachLockedRow } from './focusCoachCardSections';
import {
  type FocusCoachAwayInsight,
  type FocusCoachAwayInsightType,
  type FocusCoachExperimentId,
  type FocusCoachResult,
  type FocusCoachState,
  type SuggestionReason,
} from './focusCoach';
import {
  coachVariantKey,
  safeCopyLine,
  selectHistoryHeadlineCopy,
  selectCoachVariantIndex,
  type StoredCoachVariant,
} from './focusCoachCopyRules';
import { formatApproxDuration, formatDuration } from './durationFormat';

type Slots = {
  now: string;
  before: string;
  suggested: string;
  experiment: string;
  n: string;
};

export const STATE_VARIANTS: Record<FocusCoachState, string[]> = {
  building_baseline: [
    '{n} of 5 sessions to find your typical clean stretch.',
    '{n} of 5 sessions in. A few more will make this useful.',
    '{n} of 5 sessions logged for your typical clean stretch.',
  ],
  steady: [
    'This week: {experiment}.',
    'Your typical clean stretch is {now}. Next: {suggested}.',
    'Next: {experiment}.',
  ],
  slipping: [
    'Clean stretches dipped lately. Next: {suggested}.',
    'Your typical clean stretch is {now}. Next: {suggested}.',
    'This week: {experiment}.',
  ],
  improving: [
    'Clean stretches are up lately. Next: {suggested}.',
    'Your typical clean stretch is {now}. Next: {suggested}.',
    'Next: {experiment}.',
  ],
  plateau: [
    'This week: {experiment}.',
    'Your typical clean stretch is {now}. Next: {suggested}.',
    'Next: {experiment}.',
  ],
};

export function suggestionCaption(reason: SuggestionReason | null, addsFiveMinutes = true) {
  switch (reason) {
    case 'step_up': return addsFiveMinutes ? 'Your last 3 stayed clean. Add 5 min.' : 'Your last 3 stayed clean.';
    case 'ease_down': return 'Last 2 slipped. Shorter is fine.';
    case 'floor': return 'A short start is fine. Build from here.';
    case 'repeat': return 'Same as last time. Build on it.';
    case null: return '';
  }
}

export const EXPERIMENT_COPY: Record<FocusCoachExperimentId, string> = {
  morning_session: 'schedule one morning session',
  shorter_sessions: 'choose a slightly shorter session',
  phone_out_of_reach: 'put your phone out of reach',
  five_minute_break: 'take a 5 min break between sessions',
};

const AWAY_INSIGHT_COPY: Record<FocusCoachAwayInsightType, string[]> = {
  longer_breaks_cleaner: [
    'Sessions after a longer break stayed clean for about {diff} more of the session.',
    'After longer breaks, about {diff} more of the session stayed clean.',
  ],
  shorter_breaks_cleaner: [
    'Sessions after shorter breaks stayed clean for about {diff} more of the session.',
    'After shorter breaks, about {diff} more of the session stayed clean.',
  ],
  break_lengths_similar: [
    'Clean focus looks similar after shorter and longer breaks.',
    'Break length is not showing a clear clean-focus difference yet.',
  ],
};

export function fillTemplate(template: string, slots: Slots) {
  return template.replace(/\{(now|before|suggested|experiment|n)\}/g, (_, key) =>
    slots[key as keyof Slots],
  );
}

function parseStoredVariant(value: string | null): StoredCoachVariant | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<StoredCoachVariant>;
    if (
      typeof parsed.index !== 'number' ||
      typeof parsed.validCount !== 'number'
    ) {
      return null;
    }

    return {
      index: parsed.index,
      validCount: parsed.validCount,
    };
  } catch {
    return null;
  }
}

async function nextVariantIndex(
  state: FocusCoachState,
  validCount: number,
  count: number,
) {
  const { getAppState, setAppState } = await import('../data/appStateRepository');
  const key = coachVariantKey(state);
  const lastStateKey = 'coach_variant_last_state';
  const [storedValue, lastState] = await Promise.all([
    getAppState(key),
    getAppState(lastStateKey),
  ]);
  const next = selectCoachVariantIndex({
    stored: parseStoredVariant(storedValue),
    validCount,
    variantCount: count,
    stateChanged: lastState !== null && lastState !== state,
  });
  await setAppState(key, JSON.stringify({ index: next, validCount }));
  await setAppState(lastStateKey, state);
  return next;
}

async function nextHistoryHeadline(deltaSeconds: number, validCount: number) {
  const probe = selectHistoryHeadlineCopy({
    deltaSeconds,
    stored: null,
    validCount,
    formatDelta: formatApproxDuration,
  });
  if (!probe) {
    return null;
  }

  const { getAppState, setAppState } = await import('../data/appStateRepository');
  const key = `coach_headline_${probe.direction}`;
  const storedValue = await getAppState(key);
  const selected = selectHistoryHeadlineCopy({
    deltaSeconds,
    stored: parseStoredVariant(storedValue),
    validCount,
    formatDelta: formatApproxDuration,
  });
  if (!selected) {
    return null;
  }

  await setAppState(key, JSON.stringify({ index: selected.index, validCount }));
  return selected.text;
}

export function experimentLabel(id: FocusCoachExperimentId | null) {
  return id ? EXPERIMENT_COPY[id] : EXPERIMENT_COPY.five_minute_break;
}

export function formatAwayInsightCopy(insight: FocusCoachAwayInsight) {
  const variants = AWAY_INSIGHT_COPY[insight.typeLine];
  const index = Math.min(
    variants.length - 1,
    Math.abs(insight.verifiedSessionCount) % variants.length,
  );
  return variants[index].replace(
    '{diff}',
    `${Math.round(Math.abs(insight.differencePct))}%`,
  );
}

export async function buildFocusCoachCopy(
  result: FocusCoachResult,
): Promise<Pick<FocusCoachResult, 'historyHeadline' | 'historyCopy' | 'suggestionCopy'>> {
  const variants = STATE_VARIANTS[result.state];
  const variantIndex = await nextVariantIndex(
    result.state,
    result.validCount,
    variants.length,
  );
  const now =
    result.currentCleanSeconds !== null
      ? formatDuration(result.currentCleanSeconds)
      : 'not enough data yet';
  const before =
    result.beforeCleanSeconds !== null
      ? formatDuration(result.beforeCleanSeconds)
      : 'your earlier window';
  const suggested =
    result.suggestionMinutes !== null
      ? `${result.suggestionMinutes} min`
      : 'after 5 sessions';
  const experiment =
    result.experiment?.id !== undefined
      ? experimentLabel(result.experiment.id)
      : experimentLabel(null);
  const stateCopy = fillTemplate(variants[variantIndex], {
    now,
    before,
    suggested,
    experiment,
    n: String(result.validCount),
  });
  const fallbackCopy = `Your typical clean stretch is ${now}.`;
  const historyCopy = safeCopyLine(stateCopy, fallbackCopy);
  const historyHeadline =
    result.cleanTrend?.deltaSeconds !== null &&
    result.cleanTrend?.deltaSeconds !== undefined
      ? await (async () => {
          const delta = result.cleanTrend?.deltaSeconds ?? 0;
          const headline = await nextHistoryHeadline(delta, result.validCount);
          return safeCopyLine(
            headline ?? `Your typical clean stretch is ${now}.`,
            `Your typical clean stretch is ${now}.`,
          );
        })()
      : null;
  const suggestionCopy =
    result.suggestionMinutes !== null
      ? `Try ${result.suggestionMinutes} min`
      : null;

  return {
    historyHeadline,
    historyCopy,
    suggestionCopy: suggestionCopy
      ? safeCopyLine(
          suggestionCopy,
          `Try ${result.suggestionMinutes} min`,
        )
      : null,
  };
}
// Finished narrative copy stays here; the engine supplies only measured values.
export const COACH_COPY = {
  title: 'Focus coach', loading: 'Loading coach', tooEarly: 'Too early to spot a pattern.',
  morePatterns: 'More patterns show up after a few more sessions.', earlyRead: 'Early read',
  gettingLonger: 'Your clean stretches are getting longer.',
  gettingShorter: 'Your clean stretches have been shorter lately. That happens.',
  weeklyTest: 'A weekly test', morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening',
  shortBreak: 'Short break', longBreak: 'Long break', shorter: 'Shorter', longer: 'Longer', zero: '0',
} as const;
export const MORE_PATTERNS_COPY = COACH_COPY.morePatterns;

export function lockedTeaserCopy(row: CoachLockedRow) {
  return [lockedNotesCopy(row.count), row.weeklyTest ? COACH_COPY.weeklyTest : null].filter(Boolean).join(' \u00b7 ');
}

// External labels are optional; opaque identifiers and unsafe text never become copy.
export function readableCoachLabel(value: string | null | undefined, maximum = 30) {
  const label = value?.trim().replace(/\s+/g, ' ');
  return label && label.length <= maximum &&
    !/\b(?:baseline|median|ratio|diagnosis|failed|lazy|bad)\b|[{}<>]|(?:[a-z0-9_-]+\.)+[a-z0-9_-]+|ios:/i.test(label)
    ? label : null;
}
export function triggerNoteCopy(source: string | null, camera: boolean, hits: number, total: number) {
  if (camera) return `You looked away from the screen in ${hits} of your last ${total} sessions.`;
  return `${source ?? 'Your phone'} pulled you out in ${hits} of your last ${total} sessions.`;
}
export function slipTimingCopy(seconds: number) {
  return seconds < 60 ? 'Your slips usually start within the first minute.'
    : `Your slips usually start around minute ${Math.round(seconds / 60)}.`;
}
export function bestWindowCopy(best: string, worst: string, difference: number) {
  return `${best} are your best. You stay clean about ${formatApproxDuration(difference)} longer than in the ${worst}.`;
}
export function bestLengthCopy(shortMinutes: number, longMinutes: number, shorterWins: boolean) {
  return shorterWins
    ? `Your ~${shortMinutes}-minute sessions stay clean more often than your ~${longMinutes}-minute ones.`
    : `Your longer sessions (~${longMinutes} min) hold up better than your ~${shortMinutes}-minute ones.`;
}
export function bestModeCopy(best: string, worst: string) { return `${best} sessions run cleaner than ${worst}.`; }
export function restBeforeCopy(insight: FocusCoachAwayInsight) {
  const difference = Math.round(Math.abs(insight.differencePct));
  return insight.typeLine === 'longer_breaks_cleaner'
    ? `After a longer break you stayed clean for about ${difference}% more of the session.`
    : insight.typeLine === 'shorter_breaks_cleaner'
      ? `After a shorter break you stayed clean for about ${difference}% more of the session.`
      : 'You stayed clean about as often after shorter and longer breaks.';
}
export function consistencyCopy(days: number) {
  return days === 7 ? 'You focused every day this week.' : `You focused on ${days} of the last 7 days.`;
}
export function narrativeHeadlineCopy(typical: number | null, change: 'up' | 'down' | null, current: number | null) {
  if (typical !== null && typical >= 60) return `You hold focus for about ${formatApproxDuration(typical)}, then something pulls you out.`;
  if (change === 'up') return COACH_COPY.gettingLonger;
  if (change === 'down') return COACH_COPY.gettingShorter;
  return `Your typical clean stretch is ${formatApproxDuration(current ?? 0)}.`;
}
export function nextStepCopy(minutes: number, reason: SuggestionReason | null, window: string | null, addsFive: boolean) {
  return window ? `Try ${minutes} min in the ${window}.`
    : `Try ${minutes} min. ${suggestionCaption(reason, addsFive)}`.trim();
}
export function evidenceLabel(count: number) { return `Last ${count} ${count === 1 ? 'session' : 'sessions'}`; }
export function remainingSessionsCopy(count: number) { return `${count} more ${count === 1 ? 'session' : 'sessions'}`; }
export function coachFootnote(minimumSeconds: number) { return `Sessions shorter than ${formatDuration(minimumSeconds)} don't count.`; }
export function lockedNotesCopy(count: number) { return count > 0 ? `${count} more ${count === 1 ? 'note' : 'notes'}` : null; }
export const SHORT_EXPERIMENT_COPY: Record<FocusCoachExperimentId, string> = {
  morning_session: 'one morning session',
  shorter_sessions: 'shorter sessions',
  phone_out_of_reach: 'phone out of reach',
  five_minute_break: '5 min breaks',
};
export function weeklyTestCopy(id: FocusCoachExperimentId, day: number) {
  return `This week's test: ${SHORT_EXPERIMENT_COPY[id]}. Day ${day} of 7.`;
}
export function slipVisualCopy(typical: number, maximum: number) {
  return `Slips usually start after ${formatApproxDuration(typical)} of a ${formatApproxDuration(maximum)} session.`;
}
export function dotsVisualCopy(hits: number, total: number) {
  return `${hits} of your last ${total} sessions had this first distraction.`;
}
export function barsVisualCopy(items: {label: string; value: number}[], unit: 'seconds' | 'percent') {
  return items.map(item => `${item.label}: ${unit === 'percent' ? Math.round(item.value) + '% clean' : formatApproxDuration(item.value) + ' clean'}`).join('; ');
}
export function weekVisualCopy(days: boolean[]) {
  return `${days.filter(Boolean).length} focus days in the last 7 days; the last dot is today.`;
}
export const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export const COACH_WINDOW_LABELS = { morning: 'Mornings', afternoon: 'Afternoons', evening: 'Evenings' } as const;

export function percentValueCopy(value: number) { return `${Math.round(value)}%`; }

export function progressVisualCopy(done: number, total: number) { return `${done} of ${total} focus sessions completed.`; }
export const PENDING_NOTE_COPY = {
  top_trigger: { title: 'What pulls you out most', hint: 'Shows up once it has seen a few breaks.' },
  slip_timing: { title: 'When your focus usually breaks', hint: 'Shows up once it has seen a few breaks.' },
  best_window: { title: 'Your best time of day', hint: 'Try sessions at different times of day.' },
  best_length: { title: 'Your best session length', hint: 'Mix short and long sessions, a few of each.' },
  best_mode: { title: 'Your best mode', hint: 'Use a second mode a few times.' },
  rest_before: { title: 'Whether rest helps', hint: 'Needs a few more sessions with away time tracked.' },
  consistency: { title: 'How regularly you focus', hint: 'Focus on another day this week.' },
} as const;
export const COMING_UP_COPY = 'Coming up';
export function pendingProgressCopy(id: keyof typeof PENDING_NOTE_COPY, have: number, need: number) {
  const unit = id === 'top_trigger' || id === 'slip_timing' ? 'breaks seen'
    : id === 'consistency' ? 'days' : id === 'rest_before' ? 'sessions' : null;
  return unit ? `${have} of ${need} ${unit}` : null;
}
export function pendingAccessibilityCopy(note: { title: string; hint: string; have: number; need: number }) {
  return `${note.title}. Not available yet. ${note.hint} Progress: ${note.have} of ${note.need}.`;
}
export function weeklyTestTitle(id: FocusCoachExperimentId) { return `This week's test: ${SHORT_EXPERIMENT_COPY[id]}`; }
export function experimentDayCopy(day: number) { return `Day ${day} of 7`; }
export const COACH_SAMPLE_COPY = {
  load: 'Load sample sessions', remove: 'Remove sample sessions',
  failed: 'Could not update sample sessions', retry: 'Try again in a moment.',
};
