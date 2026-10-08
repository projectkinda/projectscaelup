import { getAppState, setAppState } from '../data/appStateRepository';
import {
  type FocusCoachDiagnosis,
  type FocusCoachAwayInsightType,
  type FocusCoachExperimentId,
  type FocusCoachExperimentStatus,
  type FocusCoachResult,
  type FocusCoachState,
} from './focusCoach';
import {
  coachVariantKey,
  safeCopyLine,
  selectCoachVariantIndex,
  type StoredCoachVariant,
} from './focusCoachCopyRules';
import { formatDuration } from './sessionHistory';

type Slots = {
  now: string;
  before: string;
  suggested: string;
  experiment: string;
  n: string;
};

const STATE_VARIANTS: Record<FocusCoachState, string[]> = {
  building_baseline: [
    '{n} of 5 sessions to find your baseline.',
    '{n} of 5 sessions in. A few more will make this useful.',
    '{n} of 5 sessions logged for your baseline.',
  ],
  steady: [
    'Your baseline is forming around {now}. Try {experiment} this week.',
    'You are holding near {now}. Suggested next length: {suggested}.',
    'Current clean length is {now}. Keep the next session simple: {experiment}.',
  ],
  slipping: [
    'This looks like a rougher stretch: {now}, down from {before}. Try {experiment}.',
    'Clean time is softer right now at {now}. Suggested length: {suggested}.',
    'A rougher stretch so far: {now} now, {before} before. {experiment} is a reasonable test.',
  ],
  improving: [
    'Clean time is moving up: {now}, from {before}. Suggested length: {suggested}.',
    'You are trending upward so far. Current clean length: {now}.',
    'Nice upward pattern: {now} now, {before} before. Try {experiment} next.',
  ],
  plateau: [
    'Clean time is steady at {now}. A small experiment: {experiment}.',
    'You are around {now}. Suggested next length: {suggested}.',
    'This looks stable so far. Current clean length: {now}; try {experiment}.',
  ],
};

const DIAGNOSIS_COPY: Record<FocusCoachDiagnosis, string> = {
  early_breaker:
    'The first break tends to arrive early, so shorter sessions may be easier to protect.',
  late_breaker:
    'The first break tends to come late, so you are close to finishing most sessions clean.',
  best_window:
    'Some times of day are cleaner than others, so timing may matter.',
  app_heavy:
    'Flagged apps are the most common first break, so distance from the phone may help.',
  camera_heavy:
    'Camera absence is the most common first break, so a shorter target may fit better.',
};

const EXPERIMENT_COPY: Record<FocusCoachExperimentId, string> = {
  morning_session: 'try one morning session',
  shorter_sessions: 'try a slightly shorter session',
  phone_out_of_reach: 'put your phone out of reach',
  five_minute_break: 'take a 5 minute break between sessions',
};

const EXPERIMENT_RESULT_COPY: Record<FocusCoachExperimentStatus, string> = {
  worked: "Last week's experiment helped.",
  didnt_work: "Last week's experiment did not clearly help.",
  unclear: "Last week's experiment needs more sessions before it says much.",
};

const AWAY_INSIGHT_COPY: Record<FocusCoachAwayInsightType, string[]> = {
  longer_breaks_cleaner: [
    'Sessions after a longer break ran about {diff} cleaner.',
    'Longer breaks are pairing with about {diff} more clean focus.',
  ],
  shorter_breaks_cleaner: [
    'Sessions after shorter breaks ran about {diff} cleaner.',
    'Shorter breaks are pairing with about {diff} more clean focus.',
  ],
  break_lengths_similar: [
    'Clean focus looks similar after shorter and longer breaks.',
    'Break length is not showing a clear clean-focus difference yet.',
  ],
};

const HEADLINE_VARIANTS = {
  up: [
    'Your clean focus is up {delta} over your last 5 sessions.',
    'Clean focus is up {delta} across your latest sessions.',
  ],
  down: [
    'Your clean focus is down {delta} over your last 5 sessions.',
    'Clean focus is lower by {delta} across your latest sessions.',
  ],
  steady: [
    'Your clean focus is steady over your last 5 sessions.',
    'Clean focus is holding steady across your latest sessions.',
  ],
} as const;

function fillTemplate(template: string, slots: Slots) {
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

async function nextCopyVariantIndex(key: string, validCount: number, count: number) {
  const storedValue = await getAppState(key);
  const next = selectCoachVariantIndex({
    stored: parseStoredVariant(storedValue),
    validCount,
    variantCount: count,
    stateChanged: false,
  });
  await setAppState(key, JSON.stringify({ index: next, validCount }));
  return next;
}

export function experimentLabel(id: FocusCoachExperimentId | null) {
  return id ? EXPERIMENT_COPY[id] : EXPERIMENT_COPY.five_minute_break;
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
      : 'after baseline';
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
  const diagnosisCopy = result.diagnosis
    ? `${result.weakEvidence ? 'So far, ' : ''}${DIAGNOSIS_COPY[
        result.diagnosis
      ].replace(/^./, char => char.toLowerCase())}`
    : null;
  const experimentResult =
    result.experiment?.result ?? result.experiment?.lastResult;
  const experimentResultCopy = experimentResult
    ? EXPERIMENT_RESULT_COPY[experimentResult]
    : null;
  const awayInsightCopy = result.awayInsight
    ? (() => {
        const variants = AWAY_INSIGHT_COPY[result.awayInsight.typeLine];
        const index = Math.min(
          variants.length - 1,
          Math.abs(result.awayInsight.verifiedSessionCount) % variants.length,
        );
        return variants[index].replace(
          '{diff}',
          formatDuration(Math.abs(result.awayInsight.differenceSeconds)),
        );
      })()
    : null;
  const fallbackCopy = `Current clean length is ${now}.`;
  const historyCopy = safeCopyLine(
    [stateCopy, diagnosisCopy, experimentResultCopy, awayInsightCopy]
      .filter(Boolean)
      .join(' '),
    fallbackCopy,
  );
  const historyHeadline =
    result.cleanTrend?.deltaSeconds !== null &&
    result.cleanTrend?.deltaSeconds !== undefined
      ? await (async () => {
          const delta = result.cleanTrend?.deltaSeconds ?? 0;
          const direction =
            Math.abs(delta) < 60 ? 'steady' : delta > 0 ? 'up' : 'down';
          const variants = HEADLINE_VARIANTS[direction];
          const index = await nextCopyVariantIndex(
            `coach_headline_${direction}`,
            result.validCount,
            variants.length,
          );
          return safeCopyLine(
            variants[index].replace(
              '{delta}',
              formatDuration(Math.abs(delta)),
            ),
            `Current clean length is ${now}.`,
          );
        })()
      : null;
  const suggestionCopy =
    result.suggestionMinutes !== null
      ? `Suggested: ${result.suggestionMinutes} min`
      : null;

  return {
    historyHeadline,
    historyCopy,
    suggestionCopy: suggestionCopy
      ? safeCopyLine(
          suggestionCopy,
          `Suggested: ${result.suggestionMinutes} min`,
        )
      : null,
  };
}
