import type { CoachNote, PendingNote, FocusCoachResult } from './focusCoach';

export type FocusCoachCardState = 'too_early' | 'ready_free' | 'ready_paid';
export type CoachLockedRow = { count: number; icons: CoachNote['icon'][]; weeklyTest: boolean };
export type FocusCoachCardSelection = {
  state: FocusCoachCardState;
  headline: string;
  evidenceCount: number;
  notes: CoachNote[];
  pending: PendingNote[];
  lockedRow: CoachLockedRow | null;
  experiment: FocusCoachResult['experiment'];
  nextStep: FocusCoachResult['nextStep'];
  tooEarlyRemaining: number;
  progress: { done: number; total: number };
};

// The free payload contains only its unlocked note and value-free lock hints.
export function selectCoachCardSections({ isPaid, result, platform }: {
  isPaid: boolean; result: FocusCoachResult; platform: string;
}): FocusCoachCardSelection {
  const common = {
    headline: result.headline, evidenceCount: result.evidenceCount,
    tooEarlyRemaining: result.tooEarlyRemaining,
    progress: { done: result.validCount, total: result.baselineTarget },
  };
  if (result.validCount < result.baselineTarget) return {
    ...common, state: 'too_early', notes: [], pending: [], lockedRow: null, experiment: null, nextStep: null,
  };
  const notes = result.notes.filter(note => platform === 'android' || note.id !== 'rest_before').slice(0, 3);
  const experiment = result.experiment?.result === null ? result.experiment : null;
  const pending = result.pending.filter(row => !result.notes.some(note => note.id === row.id) && (platform === 'android' || row.id !== 'rest_before'));
  if (isPaid) return { ...common, state: 'ready_paid', notes, pending: pending.slice(0, 3 - notes.length), experiment, nextStep: result.nextStep, lockedRow: null };
  const hidden = notes.slice(1);
  return {
    ...common, state: 'ready_free', notes: notes.slice(0, 1), pending: notes.length === 0 ? pending.slice(0, 3) : [], experiment: null, nextStep: null,
    lockedRow: hidden.length || experiment ? { count: hidden.length, icons: hidden.map(note => note.icon), weeklyTest: Boolean(experiment) } : null,
  };
}
