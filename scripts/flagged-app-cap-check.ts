/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transpileModule, ModuleKind } from 'typescript';
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

async function main() {
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
      exports, paidUser, Platform: { OS: 'android' }, canAddAnotherFlaggedApp: async () => canAdd,
      paywall: { show: (feature: string) => { assert.equal(feature, 'apps'); sheet = true; } }, setIsAppPickerVisible: (value: boolean) => { picker = value; },
      setIsPickingApp: () => {}, setAppPickerQuery: () => {}, setSelectedAppIdentifiers: () => {}, setInstalledApps: () => {},
      getInstalledApps: async () => [], onNavigate: () => { throw Error('Invalid paywall navigation'); },
    });
    await exports.run();
    assert.equal(sheet, !canAdd); assert.equal(picker, canAdd);
  }
  console.log('PASS flagged-app cap at 2/3/4, paid/free, remaining slots, All, downgrade preservation, once-per-open prompts, benefits and actual Settings + handler/repository');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
