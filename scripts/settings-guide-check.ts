/// <reference types="node" />
// Pure checks for the guided-settings flow: phone -> variant mapping, the
// disclosure -> steps -> detected -> done state machine, and the consent record.
// Run: npx tsx scripts/settings-guide-check.ts
import assert from 'node:assert/strict';

import { isConsentValid, serializeConsent } from '../src/domain/consentRecord';
import {
  APP_NAME,
  guideFor,
  VARIANT_IDS,
  VARIANTS,
  variantForDevice,
} from '../src/domain/settingsGuideConfig';
import {
  guideReducer,
  initialGuideState,
  isGuideFinished,
  type GuideEvent,
  type GuideState,
} from '../src/domain/settingsGuideMachine';

// ---- manufacturer -> variant -------------------------------------------------
const mapping: [string | null | undefined, string | null | undefined, string][] = [
  ['samsung', 'samsung', 'samsung'],
  ['Samsung', undefined, 'samsung'],
  ['Google', 'google', 'google'],
  [null, 'Pixel', 'google'],
  ['motorola', 'motorola', 'google'],
  ['HMD Global', 'Nokia', 'google'],
  ['unknown', 'google', 'google'], // brand alone is enough
  ['Xiaomi', 'Redmi', 'generic'],
  ['OnePlus', 'OnePlus', 'generic'],
  ['vivo', 'vivo', 'generic'],
  ['', '', 'generic'],
  [undefined, undefined, 'generic'],
];
for (const [manufacturer, brand, expected] of mapping) {
  assert.equal(
    variantForDevice({ manufacturer, brand }).id,
    expected,
    `${manufacturer}/${brand} -> ${expected}`,
  );
}
const seen = new Map<string, string>();
for (const id of VARIANT_IDS) {
  for (const maker of VARIANTS[id].manufacturers) {
    assert.equal(maker, maker.toLowerCase(), `${maker} must be lowercase`);
    assert.equal(seen.get(maker), undefined, `${maker} listed in two variants`);
    seen.set(maker, id);
  }
}
assert.equal(VARIANTS.samsung.appsListLabel, 'Installed apps');
assert.equal(VARIANTS.google.appsListLabel, 'Downloaded apps');
assert.equal(VARIANTS.generic.appsListLabel, 'Installed apps (or Downloaded apps)');
assert.deepEqual(
  VARIANT_IDS.map(id => VARIANTS[id].look),
  ['cards', 'flat', 'divided'],
);

// ---- guide content -----------------------------------------------------------
for (const id of VARIANT_IDS) {
  for (const permission of ['accessibility', 'overlay'] as const) {
    const guide = guideFor(permission, VARIANTS[id]);
    assert.ok(guide.steps.length >= 2, `${permission}/${id} has steps`);
    for (const step of guide.steps) {
      assert.ok(step.scene.a11y.startsWith('Illustration:'), 'every drawing has a spoken label');
      assert.ok(step.primaryLabel && step.title && step.instruction);
      if (step.scene.highlight !== undefined) {
        assert.ok(step.scene.rows[step.scene.highlight], 'highlight points at a real row');
      }
    }
    assert.ok(guide.help.notFound.retryLabel && guide.help.skip.consequence);
    assert.equal(guide.disclosure.agreeLabel, 'Agree and continue');
    assert.equal(guide.disclosure.declineLabel, 'Not now');
  }
}
const samsungA11y = guideFor('accessibility', VARIANTS.samsung);
assert.equal(samsungA11y.disclosure.title, 'Let ScaleUp see which app is open');
assert.equal(samsungA11y.steps.length, 3);
assert.equal(
  samsungA11y.steps[0].scene.a11y,
  'Illustration: Accessibility settings with Installed apps highlighted',
);
assert.equal(
  guideFor('accessibility', VARIANTS.google).steps[1].instruction,
  `Tap Downloaded apps. Then tap ${APP_NAME}.`,
);
assert.equal(
  guideFor('accessibility', VARIANTS.generic).steps[1].instruction,
  `Tap Installed apps (or Downloaded apps). Then tap ${APP_NAME}.`,
);
assert.equal(samsungA11y.stillOffNotice, 'It still looks off. Check step 3.');
assert.ok(samsungA11y.help.restricted, 'accessibility has the restricted-settings help');
assert.deepEqual(samsungA11y.help.restricted?.steps, [
  'Open App info.',
  'Tap the three dots at the top right.',
  'Tap Allow restricted settings.',
]);
assert.notEqual(
  guideFor('accessibility', VARIANTS.samsung).consentKey,
  guideFor('overlay', VARIANTS.samsung).consentKey,
);

// ---- state machine -----------------------------------------------------------
function run(state: GuideState, ...events: GuideEvent[]) {
  return events.reduce(guideReducer, state);
}
const fresh = () => initialGuideState({ consented: false, stepCount: 3 });
const ENABLED: GuideEvent = { type: 'ENABLED_CHECKED', enabled: true, manual: false };

// Happy path: disclosure -> steps -> detected -> done.
let state = fresh();
assert.equal(state.phase, 'disclosure');
state = run(state, { type: 'AGREE' });
assert.deepEqual([state.phase, state.step], ['steps', 0]);
state = run(state, { type: 'NEXT' }, { type: 'NEXT' });
assert.equal(state.step, 2);
state = run(state, { type: 'NEXT' });
assert.equal(state.step, 2, 'cannot go past the last step');
state = run(state, ENABLED);
assert.equal(state.phase, 'detected');
state = run(state, { type: 'FINISH' });
assert.equal(state.phase, 'done');
assert.equal(run(state, { type: 'BACK' }), state, 'a finished flow ignores events');

// Settings is never reachable before agreeing: nothing else leaves the disclosure.
for (const event of [
  { type: 'NEXT' },
  ENABLED,
  { type: 'OPEN_HELP' },
  { type: 'SKIP' },
  { type: 'FINISH' },
  { type: 'APP_INFO_OPENED' },
] as GuideEvent[]) {
  assert.equal(run(fresh(), event).phase, 'disclosure', `${event.type} cannot skip the disclosure`);
}

// Not now / back from the disclosure leave without consent.
assert.equal(run(fresh(), { type: 'DECLINE' }).phase, 'declined');
assert.equal(run(fresh(), { type: 'BACK' }).phase, 'exited');

// Someone who already agreed skips straight to the steps.
assert.equal(initialGuideState({ consented: true, stepCount: 3 }).phase, 'steps');

// Back walks through the steps, then leaves.
state = run(fresh(), { type: 'AGREE' }, { type: 'NEXT' }, { type: 'NEXT' }, { type: 'BACK' });
assert.equal(state.step, 1);
state = run(state, { type: 'BACK' });
assert.deepEqual([state.phase, state.step], ['steps', 0]);
assert.equal(run(state, { type: 'BACK' }).phase, 'exited');

// Detection is accepted from any step, and a poll that finds it off changes nothing.
const onStep = run(fresh(), { type: 'AGREE' }, { type: 'NEXT' });
assert.equal(run(onStep, { type: 'ENABLED_CHECKED', enabled: false, manual: false }), onStep);
assert.equal(run(onStep, ENABLED).phase, 'detected');

// "I've turned it on" while still off says so; the next real change clears it.
state = run(onStep, { type: 'ENABLED_CHECKED', enabled: false, manual: true });
assert.equal(state.notice, 'still-off');
assert.equal(run(state, { type: 'NEXT' }).notice, null);
assert.equal(run(state, ENABLED).notice, null);
assert.equal(
  run(onStep, { type: 'ENABLED_CHECKED', enabled: true, manual: true }).phase,
  'detected',
  'manual check that finds it on succeeds',
);

// Restricted-settings path: stuck on the switch, open App info, come back, detected.
state = run(
  fresh(),
  { type: 'AGREE' },
  { type: 'NEXT' },
  { type: 'NEXT' },
  { type: 'ENABLED_CHECKED', enabled: false, manual: true },
  { type: 'OPEN_HELP' },
);
assert.equal(state.helpOpen, true);
state = run(state, { type: 'APP_INFO_OPENED' });
assert.deepEqual(
  [state.phase, state.helpOpen, state.restrictedOpened, state.step, state.notice],
  ['steps', false, true, 2, null],
);
state = run(state, ENABLED, { type: 'FINISH' });
assert.equal(state.phase, 'done');

// Opening App info from an early step jumps to the switch step.
state = run(fresh(), { type: 'AGREE' }, { type: 'OPEN_HELP' }, { type: 'APP_INFO_OPENED' });
assert.equal(state.step, 2);

// Detection while the sheet is open closes it and succeeds.
state = run(fresh(), { type: 'AGREE' }, { type: 'OPEN_HELP' }, ENABLED);
assert.deepEqual([state.phase, state.helpOpen], ['detected', false]);

// Can't find it: Retry returns to the list step; Close keeps the step.
state = run(fresh(), { type: 'AGREE' }, { type: 'NEXT' }, { type: 'NEXT' }, { type: 'OPEN_HELP' });
assert.equal(run(state, { type: 'CLOSE_HELP' }).step, 2);
state = run(state, { type: 'RETRY' });
assert.deepEqual([state.helpOpen, state.step], [false, 1]);

// Skip for now ends the flow without the permission.
state = run(fresh(), { type: 'AGREE' }, { type: 'OPEN_HELP' }, { type: 'SKIP' });
assert.deepEqual([state.phase, state.helpOpen], ['skipped', false]);
assert.ok(isGuideFinished(state.phase));

// Two-step guides (overlay) behave the same.
const two = initialGuideState({ consented: true, stepCount: 2 });
assert.equal(run(two, { type: 'NEXT' }, { type: 'NEXT' }).step, 1);
assert.equal(run(two, { type: 'APP_INFO_OPENED' }).step, 1);

// ---- consent record ----------------------------------------------------------
const at = new Date('2026-10-19T08:30:00.000Z');
const record = serializeConsent(at);
assert.deepEqual(JSON.parse(record), { version: 1, at: at.toISOString() });
assert.equal(isConsentValid(record), true);
assert.equal(isConsentValid(null), false);
assert.equal(isConsentValid('true'), false);
assert.equal(isConsentValid('{"version":1,"at":"nope"}'), false);
assert.equal(isConsentValid(serializeConsent(at, 0)), false, 'older wording asks again');

console.log('settings-guide-check: ok');
