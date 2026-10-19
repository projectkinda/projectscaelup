/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const compile = (source: string) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const { DatabaseSync } = require('node:sqlite');
async function persistence() {
  for (const fail of [false, true]) {
    const db = new DatabaseSync(':memory:');
    db.exec("CREATE TABLE app_state(key TEXT PRIMARY KEY,value TEXT); INSERT INTO app_state VALUES ('onboarding_step','done'),('onboarding_complete','true'),('test_tier_override','paid'),('timer:deep-work','25'); CREATE TABLE flagged_apps(id TEXT); INSERT INTO flagged_apps VALUES ('example.app'); CREATE TABLE sessions(id TEXT); INSERT INTO sessions VALUES ('saved-session'); CREATE TABLE custom_modes(id TEXT); INSERT INTO custom_modes VALUES ('saved-mode');");
    if (fail) db.exec("CREATE TRIGGER fail_reset BEFORE INSERT ON app_state WHEN NEW.key='onboarding_complete' BEGIN SELECT RAISE(ABORT,'blocked reset'); END;");
    const exports: any = {};
    runInNewContext(compile(readFileSync('src/data/appStateRepository.ts', 'utf8')), {
      exports, require: () => ({ ensureSchema: async () => {}, getDatabase: async () => ({ runAsync: async (sql: string, args: unknown[]) => db.prepare(sql).run(...args) }) }),
    });
    if (fail) await assert.rejects(exports.resetOnboardingProgress(), /blocked reset/);
    else await exports.resetOnboardingProgress();
    const values = Object.fromEntries(db.prepare('SELECT key,value FROM app_state').all().map((r: any) => [r.key, r.value]));
    assert.equal(values.onboarding_step, fail ? 'done' : 'welcome');
    assert.equal(values.onboarding_complete, fail ? 'true' : 'false');
    assert.equal(values.test_tier_override, 'paid'); assert.equal(values['timer:deep-work'], '25');
    for (const table of ['flagged_apps', 'sessions', 'custom_modes']) assert.equal(db.prepare('SELECT COUNT(*) AS count FROM ' + table).get().count, 1);
    db.close();
  }
}
const app = readFileSync('App.tsx', 'utf8'), ast = ts.createSourceFile('App.tsx', app, 99, true, 4);
const methods = new Map<string, string>();
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && ['restartOnboarding', 'evaluateLaunchGate', 'completeOnboarding'].includes(node.name.getText(ast))) methods.set(node.name.getText(ast), 'const ' + node.getText(ast) + ';');
  ts.forEachChild(node, visit);
}
visit(ast); assert.equal(methods.size, 3);
function load(extra: Record<string, any> = {}) {
  const events: any[] = [], exports: any = {};
  const context: any = { exports, TIER_SWITCHER_ENABLED: true, Platform: { OS: 'android' }, sessionActive: false,
    restartingOnboarding: { current: false }, launchGateRevision: { current: 0 }, DEV_FLAGS: { resetOnboarding: false },
    ONBOARDING_COMPLETE_KEY: 'onboarding_complete', ONBOARDING_STEP_KEY: 'onboarding_step',
    resetOnboardingProgress: async () => { events.push('reset'); },
    setActiveScreen: (value: string) => events.push(['screen', value]), setSessionMessage: (value: unknown) => events.push(['message', value]),
    setGate: (value: string) => events.push(['gate', value]), setRequiredPermissions: () => {},
    getAppState: async () => 'true', getRequiredPermissionStatus: async () => ({ all: true }), setAppState: async (key: string, value: string) => events.push([key, value]), ...extra,
  };
  runInNewContext(compile([...methods.values()].join('\n') + '\nexport const api = { restartOnboarding, evaluateLaunchGate, completeOnboarding };'), context);
  return { events, context, api: exports.api };
}
async function handlers() {
  for (const extra of [{ TIER_SWITCHER_ENABLED: false }, { sessionActive: true }, { Platform: { OS: 'ios' } }, { restartingOnboarding: { current: true } }]) {
    const { api, events } = load(extra); await api.restartOnboarding(); assert.equal(events.length, 0);
  }
  const good = load(); await good.api.restartOnboarding();
  assert.deepEqual(good.events, ['reset', ['screen', 'home'], ['message', null], ['gate', 'onboarding']]);
  assert.equal(good.context.restartingOnboarding.current, false);
  await good.api.completeOnboarding(); assert.deepEqual(good.events.at(-1), ['gate', 'ready']);
  const bad = load({ resetOnboardingProgress: async () => { throw Error('storage failed'); } });
  await assert.rejects(bad.api.restartOnboarding(), /storage failed/); assert.equal(bad.events.length, 0); assert.equal(bad.context.restartingOnboarding.current, false);
  let resolveOld: (value: string) => void = () => {};
  const race = load({ getAppState: () => new Promise<string>(resolve => { resolveOld = resolve; }) });
  const pending = race.api.evaluateLaunchGate(false); await race.api.restartOnboarding(); resolveOld('true'); await pending;
  assert.deepEqual(race.events.at(-1), ['gate', 'onboarding'], 'an old foreground check cannot dismiss replay');
  let finish: () => void = () => {}, resets = 0;
  const twice = load({ resetOnboardingProgress: () => { resets++; return new Promise<void>(resolve => { finish = resolve; }); } });
  const first = twice.api.restartOnboarding(); await twice.api.restartOnboarding(); assert.equal(resets, 1); finish(); await first;
}
(async () => { await persistence(); await handlers(); console.log('PASS onboarding replay: atomic two-key reset, preserved apps/history/modes/tier/timer, active-session/release/iOS guards, duplicate taps, persistence failure and foreground race'); })().catch(error => { console.error(error); process.exitCode = 1; });
