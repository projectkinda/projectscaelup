// The guided-settings flow as a pure state machine, so the screen only draws
// the state and the transitions can be tested without a phone.
//
//   disclosure -> steps -> detected -> done
//        |          |  \-> help (restricted settings / not found / skip)
//        v          v
//     declined   exited / skipped
//
// "detected" means the permission turned on; "done" fires the hand-off.

export type GuidePhase =
  | 'disclosure'
  | 'steps'
  | 'detected'
  | 'done'
  | 'declined'
  | 'skipped'
  | 'exited';

export type GuideState = {
  phase: GuidePhase;
  step: number;
  stepCount: number;
  helpOpen: boolean;
  /** The person opened App info to allow restricted settings. */
  restrictedOpened: boolean;
  /** Set when the manual "I've turned it on" check found it still off. */
  notice: 'still-off' | null;
};

export type GuideEvent =
  | { type: 'AGREE' }
  | { type: 'DECLINE' }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'ENABLED_CHECKED'; enabled: boolean; manual: boolean }
  | { type: 'OPEN_HELP' }
  | { type: 'CLOSE_HELP' }
  | { type: 'APP_INFO_OPENED' }
  | { type: 'RETRY' }
  | { type: 'SKIP' }
  | { type: 'FINISH' };

/** Someone who already agreed (earlier, or before the permission was revoked) skips the disclosure. */
export function initialGuideState(options: {
  consented: boolean;
  stepCount: number;
}): GuideState {
  return {
    phase: options.consented ? 'steps' : 'disclosure',
    step: 0,
    stepCount: options.stepCount,
    helpOpen: false,
    restrictedOpened: false,
    notice: null,
  };
}

export function isGuideFinished(phase: GuidePhase): boolean {
  return phase === 'done' || phase === 'declined' || phase === 'skipped' || phase === 'exited';
}

export function guideReducer(state: GuideState, event: GuideEvent): GuideState {
  if (isGuideFinished(state.phase)) {
    return state;
  }

  switch (event.type) {
    case 'AGREE':
      return state.phase === 'disclosure'
        ? { ...state, phase: 'steps', step: 0 }
        : state;

    case 'DECLINE':
      return state.phase === 'disclosure' ? { ...state, phase: 'declined' } : state;

    case 'NEXT':
      if (state.phase !== 'steps' || state.step >= state.stepCount - 1) {
        return state;
      }
      return { ...state, step: state.step + 1, notice: null };

    case 'BACK':
      if (state.phase === 'disclosure') {
        return { ...state, phase: 'exited' };
      }
      if (state.phase !== 'steps') {
        return state;
      }
      if (state.step === 0) {
        return { ...state, phase: 'exited' };
      }
      return { ...state, step: state.step - 1, notice: null };

    case 'ENABLED_CHECKED':
      if (state.phase !== 'steps') {
        return state;
      }
      if (event.enabled) {
        return { ...state, phase: 'detected', helpOpen: false, notice: null };
      }
      // A background poll that finds it off says nothing; only the person's
      // own check gets the "still off" message.
      return event.manual && state.notice !== 'still-off'
        ? { ...state, notice: 'still-off' }
        : state;

    case 'OPEN_HELP':
      return state.phase === 'steps' ? { ...state, helpOpen: true } : state;

    case 'CLOSE_HELP':
      return state.helpOpen ? { ...state, helpOpen: false } : state;

    case 'APP_INFO_OPENED':
      // After allowing restricted settings the next job is the switch, the last step.
      return state.phase === 'steps'
        ? {
            ...state,
            helpOpen: false,
            restrictedOpened: true,
            step: state.stepCount - 1,
            notice: null,
          }
        : state;

    case 'RETRY':
      // "Can't find it": go back to the step that explains the list.
      return state.phase === 'steps'
        ? { ...state, helpOpen: false, step: Math.min(1, state.stepCount - 1), notice: null }
        : state;

    case 'SKIP':
      return state.phase === 'steps' ? { ...state, phase: 'skipped', helpOpen: false } : state;

    case 'FINISH':
      return state.phase === 'detected' ? { ...state, phase: 'done' } : state;

    default:
      return state;
  }
}
