import type { FocusCoachResult } from './focusCoach';

export type FocusCoachCardSectionId =
  | 'clean_trend'
  | 'last_session'
  | 'away'
  | 'diagnosis'
  | 'experiment';

export type FocusCoachCardState = 'baseline' | 'ready_free' | 'ready_paid';

export type FocusCoachCardSection = {
  id: FocusCoachCardSectionId;
  locked: boolean;
};

export function selectCoachCardSections({
  isPaid,
  result,
  platform,
}: {
  isPaid: boolean;
  result: FocusCoachResult;
  platform: string;
}): {
  state: FocusCoachCardState;
  sections: FocusCoachCardSection[];
  lockedSections: FocusCoachCardSectionId[];
} {
  if (result.validCount < result.baselineTarget) {
    return { state: 'baseline', sections: [], lockedSections: [] };
  }

  const locked = !isPaid;
  const sections: FocusCoachCardSection[] = [];

  if (result.cleanTrend !== null) {
    sections.push({ id: 'clean_trend', locked });
  }
  if (result.lastSession !== null) {
    sections.push({ id: 'last_session', locked });
  }
  if (
    platform === 'android' &&
    result.away !== null &&
    result.away.display !== 'hidden' &&
    result.away.sinceLastUseSeconds !== null
  ) {
    sections.push({ id: 'away', locked });
  }
  if (result.diagnosis !== null) {
    sections.push({ id: 'diagnosis', locked });
  }
  if (result.experiment !== null) {
    sections.push({ id: 'experiment', locked });
  }

  return {
    state: isPaid ? 'ready_paid' : 'ready_free',
    sections,
    lockedSections: sections
      .filter(section => section.locked)
      .map(section => section.id),
  };
}
