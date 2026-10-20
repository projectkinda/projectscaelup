/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts, { JsxEmit, ModuleKind, transpileModule } from 'typescript';

const files = ['src/components/DevAppRulesControls.tsx', 'src/components/DevCoachSampleControls.tsx',
  'src/data/appRulesRepository.ts', 'src/data/coachSampleRepository.ts', 'src/data/coachSeedRepository.ts',
  'src/data/focusCoachRepository.ts', 'src/screens/SettingsScreen.tsx', 'src/domain/androidLiveTimer.ts', 'src/components/PaywallScreen.tsx', 'src/domain/releaseLog.ts', 'src/domain/appPicker.ts'];
for (const file of files) assert(!/\b__DEV__\b/.test(readFileSync(file, 'utf8')), file + ': tools must follow the build flag');
function compile(source: string) {
  return transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } }).outputText;
}
function load(file: string, enabled: boolean, dev: boolean, platform = 'android') {
  let touchedDatabase = false;
  const module = { exports: {} as any };
  const dependencies = (id: string): any => {
    if (id === 'react') return { useState: (initial: any) => [typeof initial === 'function' ? initial() : initial === true ? false : initial, () => {}],
      useMemo: (fn: () => unknown) => fn(), useCallback: (fn: unknown) => fn, useEffect: () => {}, useRef: (current: unknown) => ({ current }) };
    if (id === 'react/jsx-runtime') return require('react/jsx-runtime');
    if (id === 'react-native') return { Platform: { OS: platform }, StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
      useWindowDimensions: () => ({ height: 640, width: 360, fontScale: 1 }), View: 'View', Pressable: 'Pressable', ScrollView: 'ScrollView', Modal: 'Modal' };
    if (id.endsWith('/paywall')) return { DEV_FLAGS: { tierSwitcher: enabled }, TIER_SWITCHER_ENABLED: enabled, getTestTierOverride: () => null,
      PAYWALL_LAYOUT: 'list', PAYWALL_COPY: { modes: { title: 'Create more modes with Pro', subtitle: 'Custom modes are available with Pro.' } }, proFeaturesFor: () => [], flaggedAppSlots: () => 3, canAddFlaggedApp: () => true, FREE_TIER_APP_CAP: 3 };
    if (id.endsWith('/database')) return { getDatabase: async () => { touchedDatabase = true; throw Error('Unexpected database access'); } };
    if (id.endsWith('/releaseLog')) return { warn: () => {} };
    if (id.endsWith('/tokens')) return { colors: {}, layout: { bottomNavHeight: 92 } };
    if (id.endsWith('/typography')) return { typography: { subheading: { lineHeight: 26 }, caption: { lineHeight: 18 } } };
    if (id.endsWith('/AppText')) return { Text: 'Text' };
    if (id.endsWith('/focusCoachCopy')) return { COACH_SAMPLE_COPY: {} };
    if (id.endsWith('/PaywallProvider')) return { usePaywall: () => ({ show: () => {} }) };
    if (id.endsWith('/useIsPaidUser')) return { useIsPaidUser: () => false };
    if (id.endsWith('/androidLiveTimer')) return { getLiveTimerStyleOverride: () => null };
    if (id.endsWith('/AppPickerList')) return { filterAppsForPicker: () => [] };
    if (id.endsWith('/awayPlatform')) return { isAwayTrackingSupported: () => platform === 'android' };
    if (id.endsWith('/DevAwayControls')) return { DevAwayControls: () => null };
    if (id.endsWith('/DevAppRulesControls')) return load(files[0], enabled, dev, platform).api;
    if (id.endsWith('/DevCoachSampleControls')) return load(files[1], enabled, dev, platform).api;
    if (id === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
    return {};
  };
  runInNewContext(compile(readFileSync(file, 'utf8')), { exports: module.exports, require: dependencies, __DEV__: dev, console });
  return { api: module.exports, touchedDatabase: () => touchedDatabase };
}
function render(node: any): { texts: string[]; ids: string[] } {
  const result = { texts: [] as string[], ids: [] as string[] };
  function visit(value: any) {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (typeof value === 'string' || typeof value === 'number') { result.texts.push(String(value)); return; }
    if (!value || typeof value !== 'object') return;
    if (typeof value.type === 'function') { visit(value.type(value.props)); return; }
    if (value.props?.testID) result.ids.push(value.props.testID);
    visit(value.props?.children);
  }
  visit(node); return result;
}
async function testStoredOverride(enabled: boolean) {
  const source = readFileSync('App.tsx', 'utf8'), ast = ts.createSourceFile('App.tsx', source, 99, true, 4);
  let loader = '';
  function visit(n: ts.Node) { if (ts.isFunctionDeclaration(n) && n.name?.text === 'loadTestTierOverride') loader = n.getText(ast); ts.forEachChild(n, visit); }
  visit(ast); assert(loader);
  const key = source.match(/const TEST_TIER_OVERRIDE_KEY = '([^']+)'/)![1];
  assert.equal(key, 'test_tier_override');
  const removed: string[] = [], read: string[] = [], values: unknown[] = [];
  let ready = false;
  await runInNewContext(`(async () => { let cancelled = false; ${loader}; await loadTestTierOverride(); })()`, {
    TIER_SWITCHER_ENABLED: enabled, TEST_TIER_OVERRIDE_KEY: key, setTestTierOverride: (value: unknown) => values.push(value),
    removeAppState: async (value: string) => removed.push(value), getAppState: async (value: string) => { read.push(value); return 'paid'; },
    parseStoredTier: (value: string) => value === 'paid' || value === 'free' ? value : null, setTierReady: (value: boolean) => { ready = value; }, warn: () => {},
  });
  assert(ready); assert.deepEqual(removed, enabled ? [] : [key]); assert.deepEqual(read, enabled ? [key] : []); assert.deepEqual(values, enabled ? ['paid'] : [null]);
}
function testActualFlags(env: string | undefined, dev: boolean | undefined, variant = 'release') {
  const module = { exports: {} as any }, warnings: unknown[][] = [];
  runInNewContext(compile(readFileSync('src/domain/paywall.ts', 'utf8')), { exports: module.exports, process: { env: { EXPO_PUBLIC_TEST_TOOLS: env, EXPO_PUBLIC_BUILD_VARIANT: variant } }, __DEV__: dev,
    console: { warn: (...args: unknown[]) => warnings.push(args) } });
  const enabled = dev === true || env === '1';
  assert.equal(module.exports.DEV_FLAGS.tierSwitcher, enabled);
  assert.equal(module.exports.TIER_SWITCHER_ENABLED, enabled);
  assert.equal(module.exports.DEV_FLAGS.forcePaidUser, false);
  assert.equal(module.exports.DEV_FLAGS.resetOnboarding, false);
  assert.equal(module.exports.DEV_FLAGS.iosOnboardingPreview, false);
  module.exports.setTestTierOverride('paid');
  assert.equal(module.exports.getTestTierOverride(), enabled ? 'paid' : null);
  assert.equal(module.exports.isPaidUser(), enabled);
  assert.equal(warnings.length, enabled && dev !== true && variant !== 'qa' ? 1 : 0);
}
async function main() {
  testActualFlags('1', undefined);
  for (const dev of [true, false]) {
    testActualFlags(undefined, dev);
    testActualFlags('1', dev); // A non-QA production bundle warns, and the release verifier rejects it.
    testActualFlags('1', dev, 'qa');
    for (const enabled of [false, true]) {
      assert.equal(load(files[0], enabled, dev).api.DevAppRulesControls({ flaggedPackages: [] }) !== null, enabled);
      assert.equal(load(files[1], enabled, dev).api.DevCoachSampleControls() !== null, enabled);
      assert.equal(load(files[0], enabled, dev, 'ios').api.DevAppRulesControls({ flaggedPackages: [] }), null);
      const settings = render(load('src/screens/SettingsScreen.tsx', enabled, dev).api.SettingsScreen({ isActive: true, onNavigate: () => {} }));
      const text = settings.texts.join(' ');
      for (const label of ['Coach dev seeding', 'Test tier (testing only)', 'Live timer style:', 'App picker diagnostics', 'Restart onboarding']) assert.equal(text.includes(label), enabled, label);
      assert.equal(settings.ids.includes('coach-sample-controls'), enabled);
      assert.equal(settings.ids.includes('dev-app-rules'), enabled);
      assert(!text.includes('RevenueCat entitlement check pending.'));
      const paywall = render(load('src/components/PaywallScreen.tsx', enabled, dev).api.PaywallScreen({ feature: 'modes', onClose: () => {} }));
      assert(paywall.texts.includes('Upgrade to Pro'));
      assert.equal(paywall.texts.includes('Purchases coming soon'), enabled);
      assert(paywall.texts.includes('Not now'));
      await testStoredOverride(enabled);
    }
    for (const [file, actions] of [
      ['src/data/coachSampleRepository.ts', ['loadSampleSessions', 'removeSampleSessions']],
      ['src/data/coachSeedRepository.ts', ['seedCoachSessions', 'clearSeededCoachSessions']],
    ] as const) {
      const guarded = load(file, false, dev);
      for (const action of actions) await assert.rejects(() => guarded.api[action]('rising'));
      assert.equal(guarded.touchedDatabase(), false);
    }
    const rules = load('src/data/appRulesRepository.ts', false, dev);
    assert.equal((await rules.api.createDevTestRule('example.app', 'schedule')).ok, false);
    await rules.api.clearDevAppRules();
    assert.equal(rules.touchedDatabase(), false);
  }
  const paywallSource = readFileSync('src/domain/paywall.ts', 'utf8');
  assert(paywallSource.includes("process.env.EXPO_PUBLIC_TEST_TOOLS === '1'") && paywallSource.includes('RELEASE WARNING'));
  assert(paywallSource.includes("process.env.EXPO_PUBLIC_BUILD_VARIANT !== 'qa'"));
  const nativeBuild = readFileSync('modules/live-timer/android/build.gradle', 'utf8');
  assert(nativeBuild.includes("debug { buildConfigField 'boolean', 'TEST_TOOLS_ENABLED', 'true' }"));
  assert(nativeBuild.includes("release { buildConfigField 'boolean', 'TEST_TOOLS_ENABLED', 'false' }"));
  assert(nativeBuild.includes("qa {"));
  const { inspectBundle, inspectQaBundle, variantForBundle } = require('./verify-release-bundle.cjs');
  assert.equal(variantForBundle('F:\\repo\\android\\app\\build\\generated\\assets\\react\\qa\\index.android.bundle'), 'qa');
  assert.equal(variantForBundle('/qa/repo/android/app/build/generated/assets/react/release/index.android.bundle'), 'release');
  const names = ['tierSwitcher', 'forcePaidUser', 'resetOnboarding', 'iosOnboardingPreview'];
  for (const enabledName of names) {
    assert.throws(() => inspectBundle('const flags = {' + names.map(name => name + ':' + (name === enabledName)).join(',') + '}'), /must all be false/);
  }
  assert.equal(inspectBundle('const flags = { tierSwitcher: typeof false !== "undefined" && false, forcePaidUser:false, resetOnboarding:false, iosOnboardingPreview:false }').tierSwitcher, false);
  assert.throws(() => inspectBundle('const flags = { tierSwitcher: __DEV__, forcePaidUser:false, resetOnboarding:false, iosOnboardingPreview:false }'), /not inlined/);
  const iosSettings = render(load('src/screens/SettingsScreen.tsx', true, false, 'ios').api.SettingsScreen({ isActive: true, onNavigate: () => {} }));
  assert(!iosSettings.ids.includes('restart-onboarding'));
  const qaFlags = 'const flags = {tierSwitcher:false || "1" === "1", forcePaidUser:false, resetOnboarding:false, iosOnboardingPreview:false}';
  assert.throws(() => inspectBundle(qaFlags), /must all be false/);
  assert.equal(inspectBundle(qaFlags, 'qa').tierSwitcher, true);
  assert.throws(() => inspectBundle(qaFlags.replace('"1" === "1"', '"0" === "1"'), 'qa'), /QA tierSwitcher/);
  assert.throws(() => inspectQaBundle(qaFlags), /missing test surface/);
  const native = readFileSync('android/app/src/main/java/com/projectscaleup/app/RuleStore.kt', 'utf8');
  assert(!native.includes('FLAG_DEBUGGABLE') && native.includes('"test_tools"'));
  const timer = readFileSync('modules/live-timer/android/src/main/java/expo/modules/livetimer/LiveTimerNotifications.kt', 'utf8');
  assert(timer.includes('if (!BuildConfig.TEST_TOOLS_ENABLED) "custom"'));
  assert(timer.includes('!BuildConfig.TEST_TOOLS_ENABLED || !testToolsEnabled'));
  assert(timer.includes('!BuildConfig.TEST_TOOLS_ENABLED || prefs.getString("session_style"'));
  console.log('PASS dev and standalone QA flags, non-QA release warning/rejection, rendered tools present in QA and absent in release, stored override handling, fixture and native guards');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
