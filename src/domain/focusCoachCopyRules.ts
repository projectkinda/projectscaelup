import type {
  FocusCoachState,
} from './focusCoach';

const DISALLOWED_WORDS = /\b(failed|lazy|bad|baseline)\b/i;

export const HEADLINE_VARIANTS = {
  up: ['Clean stretches are up {delta} from earlier.', 'Clean stretches are up {delta} lately.'],
  down: ['Clean stretches dipped {delta} lately. A shorter session may help.', 'Clean stretches are down {delta} from earlier.'],
  steady: ['Clean stretches are steady. Keep the next session simple.', 'Clean stretches are holding steady lately.'],
} as const;

export type StoredCoachVariant = {
  index: number;
  validCount: number;
};

export function safeCopyLine(copy: string, fallback: string) {
  if (DISALLOWED_WORDS.test(copy)) {
    console.warn('Focus coach copy contained a disallowed word.');
    return fallback;
  }

  return copy;
}

export function selectCoachVariantIndex({
  stored,
  validCount,
  variantCount,
  stateChanged,
}: {
  stored: StoredCoachVariant | null;
  validCount: number;
  variantCount: number;
  stateChanged: boolean;
}) {
  if (!stored) {
    return 0;
  }

  if (stateChanged || validCount > stored.validCount) {
    return (stored.index + 1) % variantCount;
  }

  return stored.index;
}

export function coachVariantKey(state: FocusCoachState) {
  return `coach_variant_${state}`;
}

export function selectHistoryHeadlineCopy({
  deltaSeconds,
  stored,
  validCount,
  formatDelta,
}: {
  deltaSeconds: number | null | undefined;
  stored: StoredCoachVariant | null;
  validCount: number;
  formatDelta: (seconds: number) => string;
}) {
  if (deltaSeconds === null || deltaSeconds === undefined) {
    return null;
  }

  const direction =
    deltaSeconds === 0 ? 'steady' : deltaSeconds > 0 ? 'up' : 'down';
  const variants = HEADLINE_VARIANTS[direction];
  const index = selectCoachVariantIndex({
    stored,
    validCount,
    variantCount: variants.length,
    stateChanged: false,
  });

  return {
    direction,
    index,
    text: variants[index].replace(
      '{delta}',
      formatDelta(Math.abs(deltaSeconds)),
    ),
  };
}
