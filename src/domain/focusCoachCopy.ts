import { getAppState, setAppState } from '../data/appStateRepository';
import {
  type FocusCoachDiagnosis,
  type FocusCoachExperimentId,
  type FocusCoachExperimentStatus,
  type FocusCoachResult,
  type FocusCoachState,
} from './focusCoach';
import { formatDuration } from './sessionHistory';

const DISALLOWED_WORDS = /\b(failed|lazy|bad)\b/i;

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
    'The first break tends to arrive late, so the session length is close to useful.',
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
  phone_out_of_reach: 'put flagged apps out of reach',
  five_minute_break: 'take a 5 minute break between sessions',
};

const EXPERIMENT_RESULT_COPY: Record<FocusCoachExperimentStatus, string> = {
  worked: 'Last week’s experiment helped.',
  didnt_work: 'Last week’s experiment did not clearly help.',
  unclear: 'Last week’s experiment needs more sessions before it says much.',
};

function fillTemplate(template: string, slots: Slots) {
  return template.replace(/\{(now|before|suggested|experiment|n)\}/g, (_, key) =>
    slots[key as keyof Slots],
  );
}

function assertAllowed(copy: string) {
  if (DISALLOWED_WORDS.test(copy)) {
    throw new Error('Focus coach copy contains a disallowed word.');
  }
}

async function nextVariantIndex(state: FocusCoachState, count: number) {
  const key = `coach_last_variant_${state}`;
  const stored = await getAppState(key);
  const previous = stored === null ? -1 : Number.parseInt(stored, 10);
  const next = Number.isFinite(previous) ? (previous + 1) % count : 0;
  await setAppState(key, String(next));
  return next;
}

export function experimentLabel(id: FocusCoachExperimentId | null) {
  return id ? EXPERIMENT_COPY[id] : EXPERIMENT_COPY.five_minute_break;
}

export async function buildFocusCoachCopy(
  result: FocusCoachResult,
): Promise<Pick<FocusCoachResult, 'historyCopy' | 'suggestionCopy'>> {
  const variants = STATE_VARIANTS[result.state];
  const variantIndex = await nextVariantIndex(result.state, variants.length);
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
  const experimentResultCopy = result.experiment?.result
    ? EXPERIMENT_RESULT_COPY[result.experiment.result]
    : null;
  const historyCopy = [stateCopy, diagnosisCopy, experimentResultCopy]
    .filter(Boolean)
    .join(' ');
  const suggestionCopy =
    result.suggestionMinutes !== null
      ? `Suggested: ${result.suggestionMinutes} min`
      : null;

  assertAllowed(historyCopy);
  if (suggestionCopy) {
    assertAllowed(suggestionCopy);
  }

  return { historyCopy, suggestionCopy };
}
