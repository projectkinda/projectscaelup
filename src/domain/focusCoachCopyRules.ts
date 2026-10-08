import type { FocusCoachState } from './focusCoach';

const DISALLOWED_WORDS = /\b(failed|lazy|bad)\b/i;

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
