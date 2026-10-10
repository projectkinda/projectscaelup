import type { FocusCoachCardSectionId } from './focusCoachCardSections';
import type {
  FocusCoachDiagnosisDetail,
  FocusCoachResult,
  FocusCoachState,
} from './focusCoach';
import { formatDuration } from './durationFormat';

const DISALLOWED_WORDS = /\b(failed|lazy|bad)\b/i;

export const HEADLINE_VARIANTS = {
  up: [
    'Your clean focus is up {delta} compared to your 3 sessions before.',
    'Clean focus is up {delta} lately.',
  ],
  down: [
    'Your clean focus is down {delta} compared to your 3 sessions before.',
    'Clean focus is down {delta} lately.',
  ],
  steady: [
    'Your clean focus is steady compared to your 3 sessions before.',
    'Clean focus is holding steady lately.',
  ],
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

export function lockedTeaserCopy(
  id: FocusCoachCardSectionId,
  coach: FocusCoachResult,
) {
  switch (id) {
    case 'clean_trend':
      return coach.cleanTrend
        ? `Last ${coach.cleanTrend.points.length} sessions`
        : null;
    case 'last_session':
      return coach.lastSession
        ? `${formatDuration(coach.lastSession.cleanSeconds)} clean`
        : null;
    case 'away':
      return coach.away ? 'Time away from your flagged apps' : null;
    case 'diagnosis':
      return coach.diagnosis
        ? 'A pattern in how your sessions start to slip'
        : null;
    case 'experiment':
      return coach.experiment ? 'A weekly experiment is ready' : null;
  }
}

export function formatDiagnosisDetail(
  detail: FocusCoachDiagnosisDetail,
  weakEvidence: boolean,
) {
  const evidenceCount =
    detail.kind === 'best_window'
      ? detail.sessionsInWindow
      : detail.brokenCount;
  const evidenceSuffix = ` Based on ${evidenceCount} sessions.${
    weakEvidence ? ' Early signal, it may change.' : ''
  }`;
  const fallback = `Pattern detail is based on ${evidenceCount} sessions.`;
  let copy: string;

  switch (detail.kind) {
    case 'early_breaker':
      copy = `Your first break usually comes about ${formatDuration(
        detail.typicalFirstBreakSeconds,
      )} into a ${formatDuration(detail.typicalPlannedSeconds)} session.`;
      break;
    case 'late_breaker':
      copy = `You usually hold on for about ${formatDuration(
        detail.typicalFirstBreakSeconds,
      )} of a ${formatDuration(
        detail.typicalPlannedSeconds,
      )} session before the first break.`;
      break;
    case 'best_window': {
      const differenceSeconds = Math.max(
        0,
        detail.windowMedianCleanSeconds - detail.overallMedianCleanSeconds,
      );
      copy = `Your cleanest sessions start in the ${detail.window}, about ${formatDuration(
        differenceSeconds,
      )} cleaner than your average.`;
      break;
    }
    case 'app_heavy':
      copy = `About ${Math.round(
        detail.sharePct,
      )}% of your first breaks are a flagged app.`;
      break;
    case 'camera_heavy':
      copy = `About ${Math.round(
        detail.sharePct,
      )}% of your first breaks are stepping away from the camera.`;
      break;
  }

  return safeCopyLine(`${copy}${evidenceSuffix}`, fallback);
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
    Math.abs(deltaSeconds) < 60 ? 'steady' : deltaSeconds > 0 ? 'up' : 'down';
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
