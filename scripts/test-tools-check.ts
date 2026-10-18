/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { JsxEmit, ModuleKind, transpileModule } from 'typescript';
const files = [
  'src/components/DevAppRulesControls.tsx', 'src/components/DevCoachSampleControls.tsx',
  'src/data/appRulesRepository.ts', 'src/data/coachSampleRepository.ts',
  'src/data/coachSeedRepository.ts', 'src/data/focusCoachRepository.ts', 'src/screens/SettingsScreen.tsx',
];
for (const file of files) assert(!/\b__DEV__\b/.test(readFileSync(file, 'utf8')), file + ' must use the test-tools flag, independent of build type');
function load(file: string, enabled: boolean, dev: boolean, platform = 'android') {
  let touchedDatabase = false;
  const module = { exports: {} as any };
  const dependencies = (id: string): any => {
    if (id === 'react') return { useState: (value: unknown) => [value, () => {}] };
    if (id === 'react/jsx-runtime') return require('react/jsx-runtime');
    if (id === 'react-native') return { Platform: { OS: platform }, StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 } };
    if (id.endsWith('/paywall')) return { DEV_FLAGS: { tierSwitcher: enabled }, TIER_SWITCHER_ENABLED: enabled };
    if (id.endsWith('/database')) return { getDatabase: async () => { touchedDatabase = true; throw new Error('Unexpected database access'); } };
    if (id.endsWith('/tokens')) return { colors: {} };
    if (id.endsWith('/typography')) return { typography: {} };
    if (id.endsWith('/AppText')) return { Text: 'Text' };
    if (id.endsWith('/focusCoachCopy')) return { COACH_SAMPLE_COPY: {} };
    return {};
  };
  runInNewContext(transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } }).outputText,
    { exports: module.exports, require: dependencies, __DEV__: dev, console });
  return { api: module.exports, touchedDatabase: () => touchedDatabase };
}
async function main() {
  for (const dev of [true, false]) {
    for (const enabled of [true, false]) {
      const rules = load(files[0], enabled, dev).api.DevAppRulesControls({ flaggedPackages: [] });
      const coach = load(files[1], enabled, dev).api.DevCoachSampleControls();
      assert.equal(rules !== null, enabled, 'rule tools flag gate');
      assert.equal(coach !== null, enabled, 'sample tools flag gate');
      assert.equal(load(files[0], enabled, dev, 'ios').api.DevAppRulesControls({ flaggedPackages: [] }), null);
    }
    for (const [file, actions] of [
      ['src/data/coachSampleRepository.ts', ['loadSampleSessions', 'removeSampleSessions']],
      ['src/data/coachSeedRepository.ts', ['seedCoachSessions', 'clearSeededCoachSessions']],
    ] as const) {
      const guarded = load(file, false, dev);
      for (const action of actions) await assert.rejects(() => guarded.api[action]('rising'));
      assert.equal(guarded.touchedDatabase(), false, 'disabled tool touched database');
    }
  }
  const native = readFileSync('android/app/src/main/java/com/projectscaleup/app/RuleStore.kt', 'utf8');
  assert(!native.includes('FLAG_DEBUGGABLE') && native.includes('"test_tools"'), 'short fixture validation must follow JS flag in release too');
  console.log('PASS test-tool source gates, debug/release UI matrix, Android-only rule tools, repository refusals, and native fixture flag');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
