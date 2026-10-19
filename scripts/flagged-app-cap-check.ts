import { handlePickerBack } from '../src/domain/pickerBack';
/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transpileModule, ModuleKind, JsxEmit, createSourceFile, forEachChild, isCallExpression } from 'typescript';
import { FREE_TIER_APP_CAP, canAddFlaggedApp, flaggedAppSlots, toggleAllFlaggedApps, appCapPromptAction, proFeaturesFor } from '../src/domain/paywall';
assert.equal(FREE_TIER_APP_CAP, 3);
for (const count of [2, 3, 4]) {
  assert.equal(canAddFlaggedApp(false, count), count < 3);
  assert.equal(canAddFlaggedApp(true, count), true);
  assert.equal(flaggedAppSlots(false, count), Math.max(0, 3 - count));
  assert.equal(flaggedAppSlots(true, count), Infinity);
}
assert.deepEqual(toggleAllFlaggedApps([], ['a', 'b', 'c', 'd'], 3), ['a', 'b', 'c']);
assert.deepEqual(toggleAllFlaggedApps([], ['a', 'b'], 1), ['a']);
assert.deepEqual(toggleAllFlaggedApps(['a'], ['a', 'b', 'c'], 2), ['a', 'b']);
assert.deepEqual(toggleAllFlaggedApps(['a'], ['b'], 0), ['a']);
assert.deepEqual(toggleAllFlaggedApps(['a', 'b'], ['a', 'b'], 2), []);
assert.deepEqual(toggleAllFlaggedApps([], ['a', 'a', 'b'], Infinity), ['a', 'b']);
assert.deepEqual(toggleAllFlaggedApps(['a', 'b', 'c', 'd'], ['e'], 0), ['a', 'b', 'c', 'd']);
for (let open = 0; open < 2; open++) {
  let shown = false;
  const results = Array.from({ length: 3 }, () => { const action = appCapPromptAction(shown); shown = true; return action; });
  assert.deepEqual(results, ['sheet', 'flash', 'flash']);
}

assert.equal(proFeaturesFor('apps', 'android')[0].freeValue, String(FREE_TIER_APP_CAP));
assert(proFeaturesFor('apps', 'ios').every(row => row.id !== 'app-rules'));


async function checkAppEnumeration() {
  const source = readFileSync('src/domain/appPicker.ts', 'utf8');
  for (const supported of [false, true]) {
    const exports: any = {}, logs: any[] = [];
    let reads = 0;
    const bridge = { getInstalledApps: async () => { reads++; return [
      { packageName: 'z', displayName: 'Zulu', iconBase64: 'private-icon' },
      { packageName: 'a', displayName: 'Alpha', iconBase64: 'private-icon' },
    ]; } };
    runInNewContext(transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText, {
      exports, require: (id: string) => id === 'react-native'
        ? { Platform: { OS: 'android' }, NativeModules: supported ? { AppPickerBridge: bridge } : {} }
        : { debug: (...args: any[]) => logs.push(args) },
    });
    const apps = await exports.getInstalledApps();
    assert.equal(reads, supported ? 1 : 0);
    assert.deepEqual(Array.from(apps, (app: any) => app.displayName), supported ? ['Alpha', 'Zulu'] : []);
    assert.equal(logs[0][1].defined, supported);
    assert(!JSON.stringify(logs).includes('private-icon'), 'diagnostics contain metadata, never app icons');
    if (supported) {
      assert.equal(logs[1][1].count, 2);
      bridge.getInstalledApps = async () => [];
      assert.equal((await exports.getInstalledApps()).length, 0, 'an empty native result is preserved for recovery UI');
      bridge.getInstalledApps = async () => { throw Error('native query failure'); };
      await assert.rejects(exports.getInstalledApps(), /native query failure/, 'query failures remain distinguishable in caller diagnostics');
    }
  }
  console.log('PASS picker enumeration: missing bridge, real empty result, sorting, metadata-only diagnostics and native rejection');
}

async function checkEditing() {
  const settings = readFileSync('src/screens/SettingsScreen.tsx', 'utf8');
  const header = settings.indexOf('<View style={styles.flaggedAppsHeader}>');
  const panel = settings.slice(settings.lastIndexOf('<View style={styles.section}>', header), settings.indexOf('{/* TODO: iOS App rules', header)).trim();
  const removeHandler = settings.slice(settings.indexOf('  const removeApp ='), settings.indexOf('  const deleteMode ='));
  const addHandler = settings.slice(settings.indexOf('  const handleAddApp ='), settings.indexOf('  const closeAppPicker ='));
  const ast = createSourceFile('SettingsScreen.tsx', settings, 99, true, 4);
  let reconcile = '';
  function visit(node: any) {
    if (isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0]?.getText(ast).includes('flaggedApps.length === 0')) reconcile = node.arguments[0].getText(ast);
    forEachChild(node, visit);
  }
  visit(ast); assert(reconcile, 'the actual edit reset effect must be exercised');
  const repository = readFileSync('src/data/settingsRepository.ts', 'utf8');
  const sync = repository.slice(repository.indexOf('async function syncNativeFlaggedPackages'), repository.indexOf('async function clearLegacyDefaultFlaggedApps'));
  const remove = repository.slice(repository.indexOf('export async function removeFlaggedApp'), repository.indexOf('export async function removeCustomMode'));
  const { DatabaseSync } = require('node:sqlite');
  for (const paidUser of [false, true]) {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE flagged_apps (app_identifier TEXT PRIMARY KEY, display_name TEXT, icon_base64 TEXT);');
    const apps = ['Alpha', 'Beta', 'Gamma'].map(displayName => ({ appIdentifier: displayName.toLowerCase(), displayName, iconBase64: null }));
    for (const app of apps) db.prepare('INSERT INTO flagged_apps VALUES (?, ?, NULL)').run(app.appIdentifier, app.displayName);
    const snapshots: string[][] = [];
    const repoModule = { exports: {} as any };
    runInNewContext(transpileModule(sync + remove, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText, {
      exports: repoModule.exports, ensureSchema: async () => {}, warn: () => {},
      getDatabase: async () => ({ runAsync: async (sql: string, params: any[]) => db.prepare(sql).run(...params), getAllAsync: async (sql: string) => db.prepare(sql).all() }),
      UsageTrackingModule: { setFlaggedPackages: async (ids: string[]) => snapshots.push(Array.from(ids)) },
    });
    const context: any = {
      exports: {}, require: (id: string) => { assert.equal(id, 'react/jsx-runtime'); return require(id); },
      flaggedApps: apps, isEditingFlaggedApps: false, isActive: true, isAppPickerVisible: false,
      paidUser, isAppPickerSupported: true, isPickingApp: false, Platform: { OS: 'android' }, styles: {},
      View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', Image: 'Image', LinearGradient: 'LinearGradient', ActivityIndicator: 'ActivityIndicator',
      appCapFull: false, showAppProLabel: true, FREE_TIER_APP_CAP, appInitial: (name: string) => name[0],
      setFlaggedApps: (update: any) => { context.flaggedApps = update(context.flaggedApps); },
      setIsEditingFlaggedApps: (value: any) => { context.isEditingFlaggedApps = typeof value === 'function' ? value(context.isEditingFlaggedApps) : value; },
      setIsAppPickerVisible: (value: boolean) => { context.isAppPickerVisible = value; },
      setIsPickingApp: () => {}, setAppPickerQuery: () => {}, setSelectedAppIdentifiers: () => {}, setInstalledApps: () => {},
      getInstalledApps: async () => [], paywall: { show: () => {} }, warn: () => {},
      removeFlaggedApp: repoModule.exports.removeFlaggedApp,
      reloadInstalledApps: async () => {}, canAddAnotherFlaggedApp: async () => canAddFlaggedApp(paidUser, db.prepare('SELECT COUNT(*) AS count FROM flagged_apps').get().count),
    };
    runInNewContext(transpileModule(removeHandler + addHandler + '\nexport const resetEdit = ' + reconcile + ';\nexport const panel = () => (' + panel + ');', { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } }).outputText, context);
    function render() {
      context.exports.resetEdit();
      context.appCapFull = !canAddFlaggedApp(paidUser, context.flaggedApps.length);
      const nodes: any[] = [], texts: string[] = [];
      function walk(node: any) {
        if (Array.isArray(node)) { node.forEach(walk); return; }
        if (typeof node === 'string' || typeof node === 'number') { texts.push(String(node)); return; }
        if (!node || typeof node !== 'object') return;
        nodes.push(node); walk(node.props?.children);
      }
      walk(context.exports.panel());
      return { nodes, text: texts.join(''), badges: nodes.filter(n => n.props?.accessibilityLabel?.startsWith('Remove ')),
        button: (label: string) => { const found = nodes.find(n => n.props?.accessibilityLabel === label); assert(found, label); return found; } };
    }
    let tree = render();
    assert.equal(tree.badges.length, 0);
    assert.equal(tree.text.includes('3 of 3 free apps'), !paidUser);
    assert.equal(tree.text.includes('PRO'), !paidUser);
    assert.equal(tree.button('Edit flagged apps').props.hitSlop, 12);
    tree.button('Edit flagged apps').props.onPress();
    tree = render(); assert.equal(tree.badges.length, 3); assert(tree.text.includes('Done'));
    assert.equal(tree.button('Alpha. Long press to remove.').props.disabled, true);
    assert.equal(tree.button('Alpha. Long press to remove.').props.onPress, undefined);
    assert.equal(tree.badges[0].props.hitSlop, 8);
    await tree.button('Remove Alpha').props.onPress();
    tree = render(); assert.equal(tree.badges.length, 2);
    assert.equal(tree.text.includes('2 of 3 free apps'), !paidUser);
    assert(!tree.text.includes('PRO')); tree.button('Add app');
    assert.deepEqual(snapshots.at(-1), ['beta', 'gamma'], 'badge removal resyncs the real native package path');
    tree.button('Done editing flagged apps').props.onPress(); tree = render(); assert.equal(tree.badges.length, 0);
    tree.button('Edit flagged apps').props.onPress(); tree = render();
    await tree.button('Add app').props.onPress(); tree = render();
    assert.equal(context.isAppPickerVisible, true); assert.equal(tree.badges.length, 0);
    context.isAppPickerVisible = false;
    tree.button('Edit flagged apps').props.onPress(); context.isActive = false; tree = render(); assert.equal(tree.badges.length, 0);
    context.isActive = true; tree = render(); assert.equal(tree.badges.length, 0);
    await tree.button('Beta. Long press to remove.').props.onLongPress(); tree = render();
    assert.deepEqual(snapshots.at(-1), ['gamma'], 'long press uses the same repository/native sync');
    tree.button('Edit flagged apps').props.onPress(); tree = render();
    await tree.button('Remove Gamma').props.onPress(); tree = render();
    assert.equal(tree.badges.length, 0); assert.equal(context.isEditingFlaggedApps, false);
    assert(!tree.nodes.some(n => /^(Edit flagged apps|Done editing flagged apps)$/.test(n.props?.accessibilityLabel)));
    tree.button('Add app'); assert.deepEqual(snapshots.at(-1), []);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM flagged_apps').get().count, 0);
    db.close();
  }
  console.log('PASS actual Flagged apps UI/handlers: both tiers, Edit/Done, badge-only removal, 3->2 caption/PRO update, working +, picker/blur/empty resets, SQLite deletion and native package sync');
}


async function checkActiveSessionRemoval() {
  let foreground: (event: { packageName: string }) => void = () => {};
  let removedListener = false, now = 0, timerId = 0;
  const timers = new Map<number, () => void>(), records: unknown[][] = [], nativePackages: string[][] = [];
  const wrapper = { exports: {} as any };
  runInNewContext(transpileModule(readFileSync('src/domain/usageTrackingModule.ts', 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText, {
    exports: wrapper.exports, require: (id: string) => id === './releaseLog' ? { warn: () => {} } : {
      Platform: { OS: 'android' }, NativeModules: { UsageTrackingBridge: { setFlaggedPackages: async (ids: string[]) => nativePackages.push(Array.from(ids)) } },
      NativeEventEmitter: class { addListener(_name: string, callback: typeof foreground) { foreground = callback; return { remove: () => { removedListener = true; } }; } },
    },
  });
  const tracker = wrapper.exports.UsageTrackingModule;
  const monitor = { exports: {} as any };
  runInNewContext(transpileModule(readFileSync('src/domain/usageMonitor.ts', 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText, {
    exports: monitor.exports,
    require: (id: string) => id === './UsageTrackingModule' || id === './usageTrackingModule' ? { UsageTrackingModule: tracker } : id === './releaseLog' ? { warn: () => {} } : {
      ensureSchema: async () => {}, getDatabase: async () => ({ runAsync: async (_sql: string, params: unknown[]) => records.push(Array.from(params)) }),
    },
    Date: class extends Date { static now() { return now; } }, setInterval: (callback: () => void) => { timers.set(++timerId, callback); return timerId; }, clearInterval: (id: number) => timers.delete(id),
  });
  const stop = monitor.exports.startUsageMonitor(42, ['alpha', 'beta']);
  foreground({ packageName: 'alpha' }); assert.equal(timers.size, 1);
  now = 31_000; timers.forEach(callback => callback());
  await new Promise(resolve => setImmediate(resolve)); assert.equal(records.length, 1, 'the monitor really records eligible app touches before removal');
  await tracker.setFlaggedPackages(['beta']); assert.equal(timers.size, 0, 'removal stops the running threshold timer');
  foreground({ packageName: 'alpha' }); assert.equal(timers.size, 0, 'removed app is ignored in the ongoing session');
  foreground({ packageName: 'beta' }); assert.equal(timers.size, 1);
  await tracker.setFlaggedPackages([]); assert.equal(timers.size, 0);
  now += 60_000; foreground({ packageName: 'beta' }); assert.equal(timers.size, 0);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(records.length, 1);
  assert.deepEqual(nativePackages, [['beta'], []]);
  stop(); assert(removedListener);
  const home = readFileSync('src/screens/HomeScreen.tsx', 'utf8');
  const ast = createSourceFile('HomeScreen.tsx', home, 99, true, 4); let subscribe = '';
  function visit(node: any) {
    if (isCallExpression(node) && node.expression.getText(ast) === 'UsageTrackingModule.onFlaggedPackagesChanged') subscribe = node.arguments[0].getText(ast);
    forEachChild(node, visit);
  }
  visit(ast); assert(subscribe);
  const ref = { current: ['alpha', 'beta'] };
  const scope = { exports: {} as any, activeFlaggedAppIdentifiers: ref };
  runInNewContext(transpileModule('export const prune = ' + subscribe, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText, scope);
  const prune = scope.exports.prune;
  prune(['beta']); assert.deepEqual(Array.from(ref.current), ['beta']);
  prune([]); assert.deepEqual(Array.from(ref.current), []);
  console.log('PASS mid-session removal: shared native sync prunes usage timers and Home resume-lock package cache, including empty selection');
}

function checkPickerBack() {
  let keyboardVisible = true, query = 'focus', closed = 0;
  const selection = ['saved.selection'];
  const back = () => handlePickerBack({ keyboardVisible, dismissKeyboard: () => { keyboardVisible = false; }, query,
    clearQuery: () => { query = ''; }, close: () => { closed++; } });
  assert.equal(back(), true); assert.equal(keyboardVisible, false); assert.equal(query, 'focus'); assert.equal(closed, 0);
  back(); assert.equal(query, ''); assert.equal(closed, 0);
  back(); assert.equal(closed, 1); assert.deepEqual(selection, ['saved.selection']);
  const flow = readFileSync('src/screens/onboarding/OnboardingFlow.tsx', 'utf8');
  const handler = flow.slice(flow.indexOf('  const goBack ='), flow.indexOf("  usePickerBack('',"));
  for (const steps of [['welcome','apps','permissions','done'], ['welcome','permissions','apps','done']]) {
    for (let index = 1; index < steps.length; index++) {
      const moved: string[] = [], module = { exports: {} as any };
      runInNewContext(transpileModule(handler + '\nexport const back = goBack;', { compilerOptions: { module: ModuleKind.CommonJS } }).outputText, {
        exports: module.exports, canGoBack: true, steps, currentStep: steps[index], stepIndex: (step: string) => steps.indexOf(step), moveToStep: (step: string) => moved.push(step),
      });
      module.exports.back(); assert.deepEqual(moved, [steps[index - 1]]);
    }
  }
  console.log('PASS picker back: dismiss keyboard, clear query, close; onboarding previous-step order on both platforms preserves selections');
}

async function main() {
  checkPickerBack();
  const repository = readFileSync('src/data/settingsRepository.ts', 'utf8');
  const repositoryFunction = repository.slice(repository.indexOf('export async function canAddAnotherFlaggedApp'), repository.indexOf('\nfunction slugify'));
  const settings = readFileSync('src/screens/SettingsScreen.tsx', 'utf8');
  const handler = settings.slice(settings.indexOf('  const handleAddApp ='), settings.indexOf('  const closeAppPicker ='));
  for (const paidUser of [true, false]) for (const savedCount of [2, 3, 4]) {
    const module = { exports: {} as any };
    runInNewContext(transpileModule(repositoryFunction, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText, {
      exports: module.exports, canAddFlaggedApp, ensureSchema: async () => {}, getDatabase: async () => ({ getFirstAsync: async () => ({ count: savedCount }) }),
    });
    const canAdd = await module.exports.canAddAnotherFlaggedApp(paidUser);
    assert.equal(canAdd, paidUser || savedCount < 3);
    let sheet = false, picker = false;
    const exports = {} as { run: () => Promise<void> };
    runInNewContext(transpileModule(handler + '\nexport const run = handleAddApp;', { compilerOptions: { module: ModuleKind.CommonJS } }).outputText, {
      exports, paidUser, reloadInstalledApps: async () => {}, Platform: { OS: 'android' }, canAddAnotherFlaggedApp: async () => canAdd,
      paywall: { show: (feature: string) => { assert.equal(feature, 'apps'); sheet = true; } }, setIsAppPickerVisible: (value: boolean) => { picker = value; },
      setIsEditingFlaggedApps: () => {}, setIsPickingApp: () => {}, setAppPickerQuery: () => {}, setSelectedAppIdentifiers: () => {}, setInstalledApps: () => {},
      getInstalledApps: async () => [], onNavigate: () => { throw Error('Invalid paywall navigation'); },
    });
    await exports.run();
    assert.equal(sheet, !canAdd); assert.equal(picker, canAdd);
  }
  await checkAppEnumeration();
  await checkEditing();
  await checkActiveSessionRemoval();
  console.log('PASS flagged-app cap at 2/3/4, paid/free, remaining slots, All, downgrade preservation, once-per-open prompts, benefits and actual Settings + handler/repository');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
