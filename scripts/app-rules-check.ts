/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { ModuleKind, transpileModule } from 'typescript';
import { APP_RULE_DENYLIST, enforcedVersions, isRulePackageAllowed, nextLocalMidnight, retireRule, scheduleWindowAt, validateRule, type AppRule, type AppRuleSnapshot } from '../src/domain/appRules';

const cases: { name: string; run: () => void | Promise<void> }[] = [];
const test = (name: string, run: () => void | Promise<void>) => cases.push({ name, run });
const base: AppRuleSnapshot = { kind: 'limit', apps: ['example.social'], days: null, startMin: null, endMin: null, limitMinutes: 5, enabled: true };
const schedule: AppRuleSnapshot = { ...base, kind: 'schedule', days: 1, startMin: 23 * 60, endMin: 60, limitMinutes: null };
const monday = () => new Date(2026, 9, 19, 12);
const model = (): AppRule => ({ ...base, id: 'r', retired: [], createdAt: monday().toISOString(), updatedAt: monday().toISOString() });
function load(file: string, dependencies: (id: string) => unknown, globals = {}) {
  const module = { exports: {} as any };
  runInNewContext(transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText,
    { exports: module.exports, require: (id: string) => id.endsWith('/releaseLog') ? { warn: (...args: unknown[]) => ((globals as any).console ?? console).warn(...args) } : dependencies(id), console, ...globals });
  return module.exports;
}

test('nextLocalMidnight crosses DST with 23/25 hour days', () => {
  const previous = process.env.TZ; process.env.TZ = 'America/New_York';
  try {
    for (const [month, day, hours] of [[2, 8, 23], [10, 1, 25]]) {
      const now = new Date(2026, month, day);
      assert.equal(nextLocalMidnight(now).getTime() - now.getTime(), hours * 3_600_000);
    }
    const year = new Date(2026, 11, 31, 23, 59);
    assert.equal(nextLocalMidnight(year).getFullYear(), 2027);
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
test('create has one current version; edit/double-edit keep all old snapshots until midnight', () => {
  const now = monday(); let rule = model();
  assert.equal(enforcedVersions(rule, now).length, 1);
  rule = retireRule(rule, { ...base, apps: ['example.video'], limitMinutes: 60 }, now);
  rule = retireRule(rule, { ...base, limitMinutes: 120 }, now);
  const versions = enforcedVersions(rule, now);
  assert.deepEqual(versions.map(v => v.limitMinutes), [120, 5, 60]);
  assert.equal(enforcedVersions(rule, nextLocalMidnight(now)).length, 1);
});
test('disable retires old enabled version; reenable never enforces disabled snapshot', () => {
  const now = monday();
  const disabled = retireRule(model(), { ...base, enabled: false }, now);
  assert.equal(enforcedVersions(disabled, now).length, 1);
  assert.equal(enforcedVersions(disabled, nextLocalMidnight(now)).length, 0);
  assert.equal(enforcedVersions(retireRule(disabled, base, now), now).length, 2);
});
test('delete hides current immediately but keeps enabled snapshots through local midnight', () => {
  const now = monday(); const rule = retireRule(model(), { ...base, enabled: false }, now, true);
  assert.equal(enforcedVersions(rule, now).length, 1);
  assert.equal(enforcedVersions(rule, nextLocalMidnight(now)).length, 0);
});
test('limit bounds and app bounds reject invalid values without reinterpretation', () => {
  for (const minutes of [0, 1, 4, 1441, 5.5, NaN]) assert(validateRule({ ...base, limitMinutes: minutes }).length);
  for (const minutes of [5, 1440]) assert.equal(validateRule({ ...base, limitMinutes: minutes }).length, 0);
  for (const apps of [[], ['example.social', 'example.social'], Array.from({ length: 21 }, (_, i) => 'example.app' + i)]) assert(validateRule({ ...base, apps }).length);
  assert.equal(validateRule({ ...base, apps: Array.from({ length: 20 }, (_, i) => 'example.app' + i) }).length, 0);
});
test('schedule weekday/minute/duration bounds include overnight and equal-time full days', () => {
  for (const days of [0, 128, 1.5]) assert(validateRule({ ...schedule, days }).length);
  for (const startMin of [-1, 1440, 5.5]) assert(validateRule({ ...schedule, startMin }).length);
  assert(validateRule({ ...schedule, startMin: 0, endMin: 14 }).length);
  for (const [startMin, endMin] of [[0, 15], [1430, 5], [60, 60]]) assert.equal(validateRule({ ...schedule, startMin, endMin }).length, 0);
});
test('crossing-midnight windows belong to the START weekday, end exclusive', () => {
  assert(scheduleWindowAt(schedule, new Date(2026, 9, 20, 0, 30)));
  assert.equal(scheduleWindowAt(schedule, new Date(2026, 9, 19, 0, 30)), null);
  assert.equal(scheduleWindowAt(schedule, new Date(2026, 9, 20, 1)), null);
});
test('Kotlin/TS denylist constants match and runtime keyboard/launcher exclusions apply', () => {
  const native = readFileSync('android/app/src/main/java/com/projectscaleup/app/AppRuleDenylist.kt', 'utf8');
  const packages = [...native.slice(native.indexOf('val PACKAGES'), native.indexOf('fun allows')).replace('BuildConfig.APPLICATION_ID', '"com.projectscaleup.app"').matchAll(/"([a-z][a-z0-9_.]+)"/g)].map(match => match[1]);
  assert.deepEqual(packages, [...APP_RULE_DENYLIST]);
  for (const pkg of [...APP_RULE_DENYLIST, 'vendor.keyboard', 'vendor.inputmethod', 'vendor.emergency', 'not-a-package']) {
    assert.equal(isRulePackageAllowed(pkg), false); assert(validateRule({ ...base, apps: [pkg] }).length);
  }
  assert.equal(isRulePackageAllowed('vendor.home', ['vendor.home']), false);
  assert.equal(isRulePackageAllowed('example.social'), true);
});

async function fixture(platform = 'android', dev = true, testTools = true) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  const clock = { now: monday().getTime() };
  const FakeDate = class extends Date { constructor(value: any = clock.now) { super(value); } };
  const adapter = {
    execAsync: async (sql: string) => db.exec(sql),
    getAllAsync: async (sql: string, params: unknown[] = []) => db.prepare(sql).all(...params),
    getFirstAsync: async (sql: string, params: unknown[] = []) => db.prepare(sql).get(...params) ?? null,
    runAsync: async (sql: string, params: unknown[] = []) => { const result = db.prepare(sql).run(...params); return { changes: Number(result.changes) }; },
    withTransactionAsync: async (work: () => Promise<void>) => { db.exec('BEGIN'); try { await work(); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; } },
  };
  const schema = load('src/data/database.ts', () => ({ openDatabaseAsync: async () => adapter }));
  await schema.ensureSchema(adapter);
  const state = { paid: true, failRead: false, failNative: false, beforeSend: null as (() => void) | null };
  const sent: any[][] = []; const listeners = new Set<() => void>(); let warnings = 0;
  const repo = load('src/data/appRulesRepository.ts', id => {
    if (id === 'react-native') return { Platform: { OS: platform } };
    if (id === './database') return { getDatabase: async () => { if (state.failRead) throw new Error('test read failure'); return adapter; }, ensureSchema: schema.ensureSchema };
    if (id === '../domain/paywall') return { DEV_FLAGS: { tierSwitcher: testTools }, isPaidUser: () => state.paid, subscribeToTier: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); } };
    if (id === '../domain/appRules') return require('../src/domain/appRules');
    if (id === '../domain/appRulesModule') return { AppRulesModule: {
      getExcludedPackages: async () => ['vendor.home'],
      setRules: async (versions: any[]) => { state.beforeSend?.(); if (state.failNative) throw new Error('test native failure'); sent.push(versions); },
    } };
    throw new Error('Unexpected dependency ' + id);
  }, { Date: FakeDate, __DEV__: dev, console: { ...console, warn: () => { warnings++; } } }) as typeof import('../src/data/appRulesRepository');
  return { db, clock, state, sent, listeners, repo, warnings: () => warnings };
}
test('SQLite repository create/update/double-edit/disable/delete preserve enforcement and prune tombstones', async () => {
  const f = await fixture();
  try {
    const created = await f.repo.createRule(base); assert(created.ok); const id = created.rule.id;
    assert.equal((await f.repo.getEnforcedVersions()).length, 1);
    assert((await f.repo.updateRule(id, { ...base, limitMinutes: 30 })).ok);
    assert((await f.repo.updateRule(id, { ...base, apps: ['example.video'] })).ok);
    assert.equal((await f.repo.getEnforcedVersions()).length, 3);
    assert((await f.repo.updateRule(id, { ...base, enabled: false })).ok);
    assert.equal((await f.repo.getEnforcedVersions()).length, 3);
    assert((await f.repo.deleteRule(id)).ok); assert.equal((await f.repo.listRules()).length, 0);
    assert.equal((await f.repo.getEnforcedVersions()).length, 3);
    const row = f.db.prepare('SELECT * FROM app_rules').get();
    assert.equal(JSON.parse(row.retired_json).every((item: any) => item.snapshot && item.enforcedUntil), true);
    f.clock.now = nextLocalMidnight(f.clock.now).getTime();
    assert.equal((await f.repo.getEnforcedVersions()).length, 0);
    assert.equal(f.db.prepare('SELECT count(*) AS count FROM app_rules').get().count, 0);
    assert.equal(f.db.prepare("SELECT count(*) AS count FROM app_state WHERE key LIKE 'app_rule_deleted:%'").get().count, 0);
  } finally { f.db.close(); }
});
test('max 10 rules is serialized across concurrent creates; retired deleted rules still occupy slots today', async () => {
  const f = await fixture();
  try {
    const results = await Promise.all(Array.from({ length: 11 }, () => f.repo.createRule(base)));
    assert.equal(results.filter(r => r.ok).length, 10);
    const first = results[0]; assert(first.ok); assert((await f.repo.deleteRule(first.rule.id)).ok);
    assert.equal((await f.repo.createRule(base)).ok, false);
    f.clock.now = nextLocalMidnight(f.clock.now).getTime();
    assert.equal((await f.repo.createRule(base)).ok, true);
  } finally { f.db.close(); }
});
test('rule apps are independent of flagged app table and reject dynamically protected packages', async () => {
  const f = await fixture();
  try {
    assert.equal(f.db.prepare('SELECT count(*) AS count FROM flagged_apps').get().count, 0);
    assert((await f.repo.createRule({ ...base, apps: ['example.unflagged'] })).ok);
    assert.equal((await f.repo.createRule({ ...base, apps: ['vendor.home'] })).ok, false);
  } finally { f.db.close(); }
});
test('tier sync sends empty on downgrade, restores stored rules on upgrade, and unsubscribes cleanly', async () => {
  const f = await fixture();
  try {
    assert((await f.repo.createRule(base)).ok); const stop = f.repo.startAppRulesSync(); await f.repo.syncRulesToNative();
    f.state.paid = false; f.listeners.forEach(fn => fn()); await f.repo.syncRulesToNative();
    assert.equal(f.sent.at(-1)!.length, 0); assert.equal((await f.repo.listRules()).length, 1);
    assert.equal((await f.repo.createRule(base)).ok, false);
    f.state.paid = true; f.listeners.forEach(fn => fn()); await f.repo.syncRulesToNative();
    assert.equal(f.sent.at(-1)!.length, 1); stop(); assert.equal(f.listeners.size, 0);
  } finally { f.db.close(); }
});
test('DB/native failures are contained and a paid read failure does not erase native rules', async () => {
  const f = await fixture();
  try {
    assert((await f.repo.createRule(base)).ok); const count = f.sent.length;
    f.state.failRead = true; await f.repo.syncRulesToNative(); assert.equal(f.sent.length, count);
    assert.equal((await f.repo.createRule(base)).ok, false);
    f.state.paid = false; await f.repo.syncRulesToNative(); assert.equal(f.sent.at(-1)!.length, 0);
    f.state.failRead = false; f.state.failNative = true; await f.repo.syncRulesToNative(); assert(f.warnings() >= 2);
  } finally { f.db.close(); }
});
test('test fixture durations/reset follow the flag in debug and release and cannot weaken production validation', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.repo.createRule({ ...base, limitMinutes: 1 })).ok, false);
    const rule = await f.repo.createDevTestRule('example.social', 'limit'); assert(rule.ok); assert.equal(rule.rule.limitMinutes, 1);
    const block = await f.repo.createDevTestRule('example.social', 'schedule'); assert(block.ok); assert.equal((block.rule.endMin! - block.rule.startMin! + 1440) % 1440, 3);
    const delayed = await f.repo.createDevTestRule('example.social', 'schedule', monday(), 1);
    assert(delayed.ok); assert.equal(delayed.rule.startMin, 12 * 60 + 1);
    await f.repo.clearDevAppRules(); assert.equal((await f.repo.getEnforcedVersions()).length, 0);
  } finally { f.db.close(); }
  const release = await fixture('android', false);
  try {
    assert((await release.repo.createRule(base)).ok);
    assert.equal((await release.repo.createDevTestRule('example.social', 'limit')).ok, true);
    await release.repo.clearDevAppRules(); assert.equal((await release.repo.listRules()).length, 0);
  } finally { release.db.close(); }
  for (const dev of [true, false]) {
    const disabled = await fixture('android', dev, false);
    try {
      assert((await disabled.repo.createRule(base)).ok);
      assert.equal((await disabled.repo.createDevTestRule('example.social', 'limit')).ok, false);
      await disabled.repo.clearDevAppRules(); assert.equal((await disabled.repo.listRules()).length, 1);
    } finally { disabled.db.close(); }
  }
});
test('iOS and web wrappers/repository do not call Android bridges or mutate rule data', async () => {
  for (const platform of ['ios', 'web']) {
    const f = await fixture(platform);
    try { assert.equal((await f.repo.createRule(base)).ok, false); await f.repo.syncRulesToNative(); assert.equal(f.sent.length, 0); }
    finally { f.db.close(); }
    const wrapper = load('src/domain/appRulesModule.ts', id => {
      if (id === 'react-native') return { Platform: { OS: platform }, NativeModules: new Proxy({}, { get: () => { throw new Error('Native lookup on non-Android'); } }) };
      if (id === './appPicker') return { getInstalledApps: async () => [] };
      if (id === './paywall') return { TIER_SWITCHER_ENABLED: true };
    if (id === './appRules') return require('../src/domain/appRules');
      throw new Error(id);
    });
    await wrapper.AppRulesModule.setRules([]); assert.equal(Object.keys(await wrapper.AppRulesModule.getTodayUsage(['example.social'])).length, 0);
    assert.equal((await wrapper.getSelectableRuleApps()).length, 0);
  }
});
test('native wrapper contains errors and rule app selection excludes runtime roles without flagged caps', async () => {
  const wrapper = load('src/domain/appRulesModule.ts', id => {
    if (id === 'react-native') return { Platform: { OS: 'android' }, NativeModules: { AppRulesBridge: {
      getExcludedPackages: async () => ['vendor.home'], getTodayUsage: async () => { throw new Error('test'); }, setRules: async () => { throw new Error('test'); },
    } } };
    if (id === './appPicker') return { getInstalledApps: async () => ['vendor.home', 'com.android.settings', 'example.one', 'example.two', 'example.three'].map(packageName => ({ packageName })) };
    if (id === './paywall') return { TIER_SWITCHER_ENABLED: true };
    if (id === './appRules') return require('../src/domain/appRules');
    throw new Error(id);
  }, { console: { ...console, warn: () => {} } });
  assert.equal((await wrapper.getSelectableRuleApps()).length, 3);
  await wrapper.AppRulesModule.setRules([]); assert.equal(Object.keys(await wrapper.AppRulesModule.getTodayUsage([])).length, 0);
});
test('native fixture flag sync precedes rules in debug and store configurations; picker errors propagate', async () => {
  for (const enabled of [true, false]) {
    const calls: string[] = [];
    let mode = 'ok';
    const wrapper = load('src/domain/appRulesModule.ts', id => {
      if (id === 'react-native') return { Platform: { OS: 'android' }, NativeModules: { AppRulesBridge: {
        setTestToolsEnabled: async (value: boolean) => calls.push('flag:' + value),
        setRules: async () => calls.push('rules'),
        getExcludedPackages: async () => { if (mode === 'throws') throw new Error('roles failed'); return mode === 'empty' ? ['com.snapchat.android'] : []; },
        getExcludedPackageReasons: async () => ({}),
      } } };
      if (id === './paywall') return { TIER_SWITCHER_ENABLED: enabled };
      if (id === './appPicker') return { getInstalledApps: async () => [{ packageName: 'com.snapchat.android' }] };
      if (id === './appRules') return require('../src/domain/appRules');
      throw Error(id);
    });
    await wrapper.AppRulesModule.setRules([]);
    assert.deepEqual(calls, ['flag:' + enabled, 'rules']);
    assert.equal((await wrapper.getSelectableRuleApps())[0].packageName, 'com.snapchat.android');
    mode = 'throws'; await assert.rejects(() => wrapper.getSelectableRuleApps(), /roles failed/);
    mode = 'empty'; await assert.rejects(() => wrapper.getSelectableRuleApps(), /No selectable apps/);
  }
});

test('release compilation retains flag-controlled test tools', async () => {
  const { build } = require('esbuild');
  const result = await build({ stdin: { contents: readFileSync('src/components/DevAppRulesControls.tsx', 'utf8'), loader: 'tsx' }, write: false, minify: true, define: { __DEV__: 'false' } });
  const text = result.outputFiles[0].text;
  assert(text.includes('Add 3-min') && text.includes('createDevTestRule') && text.includes('clearDevAppRules'));
  assert(!readFileSync('android/app/src/main/res/xml/accessibility_service_config.xml', 'utf8').includes('canRetrieveWindowContent="true"'));
});

async function main() {
  let failed = 0;
  for (const item of cases) {
    try { await item.run(); console.log('PASS ' + item.name); }
    catch (error) { failed++; console.error('FAIL ' + item.name, error); }
  }
  console.log((cases.length - failed) + '/' + cases.length + ' app rule checks passed');
  if (failed) process.exitCode = 1;
}
void main();
