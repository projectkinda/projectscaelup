/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { ModuleKind, transpileModule } from 'typescript';
import { BUILT_IN_MODES } from '../src/domain/sessionModes';
import { clampSessionSeconds, isValidDefaultMinutes, modeDurationKey, resolveModeDuration, TIMER_MAX_TOTAL_SECONDS, withModeDuration } from '../src/domain/modeDurations';
import * as durations from '../src/domain/modeDurations';
import * as sessionModes from '../src/domain/sessionModes';
import { canAddFlaggedApp } from '../src/domain/paywall';

const deep = BUILT_IN_MODES.find(mode => mode.id === 'deep-work')!;
const meditation = BUILT_IN_MODES.find(mode => mode.id === 'meditation')!;
assert.deepEqual(BUILT_IN_MODES.map(mode => mode.defaultMinutes), [50, 45, 60, 10, 60, 60, 30]);
assert.equal(resolveModeDuration(meditation), 10 * 60);
assert.equal(resolveModeDuration(deep), 50 * 60);
assert.equal(resolveModeDuration(deep, { 'deep-work': 25 * 60 + 30 }), 25 * 60 + 30);
assert.equal(resolveModeDuration(deep, { 'deep-work': NaN }), 50 * 60);
assert.equal(resolveModeDuration(deep, { 'deep-work': 999999 }), TIMER_MAX_TOTAL_SECONDS);
assert.equal(resolveModeDuration(deep, { 'deep-work': -1 }), 0);
assert.equal(resolveModeDuration(undefined, { deleted: 1500 }, { deleted: 1200 }), undefined);
let memory = withModeDuration({}, deep.id, 25 * 60);
assert.equal(resolveModeDuration(meditation, {}, memory), 10 * 60);
assert.equal(resolveModeDuration(deep, {}, memory), 25 * 60, 'A -> B -> A preserves unsaved edits');
memory = withModeDuration(memory, meditation.id, 7 * 60 + 15);
assert.equal(resolveModeDuration(meditation, {}, memory), 7 * 60 + 15);
assert.equal(resolveModeDuration(deep, { 'deep-work': 40 * 60 }, memory), 25 * 60, 'memory overrides remembered');
const custom = { id: 'custom', defaultMinutes: 35 };
assert.equal(resolveModeDuration(custom), 35 * 60);
assert.equal(resolveModeDuration({ ...custom, defaultMinutes: 40 }), 40 * 60, 'default edits apply if there is no user override');
assert.equal(resolveModeDuration({ ...custom, defaultMinutes: 40 }, { custom: 1500 }), 1500, 'last started length keeps priority');
assert.equal(clampSessionSeconds(1500.9), 1500);
for (const value of [0, 25, 60]) assert(isValidDefaultMinutes(value));
for (const value of [-1, 25.5, 61, NaN]) assert(!isValidDefaultMinutes(value));
console.log('PASS pure resolver: defaults, remembered seconds, clamping, deleted mode, per-mode memory and edited-default priority');

function loadModule(file: string, dependencies: (id: string) => unknown) {
  const module = { exports: {} as any };
  runInNewContext(transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText,
    { exports: module.exports, require: (id: string) => id.endsWith('/releaseLog') ? { warn: () => {} } : dependencies(id), console });
  return module.exports;
}
async function main() {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  // Existing installations have no default_minutes; keep their data and row order.
  db.exec('CREATE TABLE custom_modes (id TEXT PRIMARY KEY, name TEXT NOT NULL, grace_period_seconds INTEGER NOT NULL, frame_width_min INTEGER NOT NULL DEFAULT 15, frame_width_max INTEGER NOT NULL DEFAULT 40);');
  db.exec("INSERT INTO custom_modes VALUES ('old', 'Existing', 12, 15, 40);");
  const oldRowid = db.prepare('SELECT rowid FROM custom_modes').get().rowid;
  const adapter = {
    execAsync: async (sql: string) => db.exec(sql),
    getAllAsync: async (sql: string, params: unknown[] = []) => db.prepare(sql).all(...params),
    getFirstAsync: async (sql: string, params: unknown[] = []) => db.prepare(sql).get(...params) ?? null,
    runAsync: async (sql: string, params: unknown[] = []) => db.prepare(sql).run(...params),
    withTransactionAsync: async (work: () => Promise<void>) => { db.exec('BEGIN'); try { await work(); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; } },
  };
  const database = loadModule('src/data/database.ts', id => {
    assert.equal(id, 'expo-sqlite');
    return { openDatabaseAsync: async () => adapter };
  });
  await database.ensureSchema(adapter);
  const migrated = db.prepare('SELECT rowid, * FROM custom_modes WHERE id=?').get('old');
  assert.equal(migrated.default_minutes, 25);
  assert.equal(migrated.name, 'Existing');
  assert.equal(migrated.grace_period_seconds, 12);
  assert.equal(migrated.rowid, oldRowid);
  const column = db.prepare('PRAGMA table_info(custom_modes)').all().find((row: any) => row.name === 'default_minutes');
  assert.equal(column.notnull, 1);
  assert.equal(Number(column.dflt_value), 25);
  // A fresh schema pass also preserves an already configured value.
  db.prepare('UPDATE custom_modes SET default_minutes=35 WHERE id=?').run('old');
  const freshDatabaseModule = loadModule('src/data/database.ts', () => ({ openDatabaseAsync: async () => adapter }));
  await freshDatabaseModule.ensureSchema(adapter);
  assert.equal(db.prepare('SELECT default_minutes FROM custom_modes').get().default_minutes, 35);
  console.log('PASS actual SQLite migration: existing rows backfilled to 25, data/rowid preserved, repeat setup keeps configured defaults');

  const state = loadModule('src/data/appStateRepository.ts', () => database);
  const modes = loadModule('src/data/modesRepository.ts', id => id === './database' ? database : sessionModes);
  const settings = loadModule('src/data/settingsRepository.ts', id => {
    if (id === './database') return database;
    if (id === './modesRepository') return modes;
    if (id === './appStateRepository') return state;
    if (id === '../domain/modeDurations') return durations;
    if (id === '../domain/paywall') return { canAddFlaggedApp };
    if (id === '../domain/appPicker') return { getInstalledApps: async () => [] };
    if (id === '../domain/usageTrackingModule') return { UsageTrackingModule: { setFlaggedPackages: async () => {} } };
    throw Error(id);
  });
  assert.equal((await modes.loadAvailableModes(true)).find((mode: any) => mode.id === 'old').defaultMinutes, 35);
  assert.equal((await settings.loadSettingsData({ isPaidUser: true })).customModes[0].defaultMinutes, 35);
  await settings.saveCustomMode({ id: 'new', name: 'Custom', gracePeriodSeconds: 12, defaultMinutes: 42 });
  assert.equal((await modes.loadAvailableModes(true))[1].defaultMinutes, 42);
  await settings.saveCustomMode({ id: 'new', name: 'Custom edited', gracePeriodSeconds: 12, defaultMinutes: 45 });
  assert.equal((await modes.loadAvailableModes(true))[1].defaultMinutes, 45);
  await assert.rejects(() => settings.saveCustomMode({ name: 'Invalid', gracePeriodSeconds: 12, defaultMinutes: 61 }));
  await settings.saveModeSessionDuration(deep.id, 25 * 60 + 30);
  let stored = await settings.loadModeSessionDurations();
  assert.equal(resolveModeDuration(deep, stored), 25 * 60 + 30);
  assert.equal(resolveModeDuration(meditation, stored), 10 * 60);
  await state.setAppState(modeDurationKey('too-long'), '99999');
  await state.setAppState(modeDurationKey('corrupt'), 'broken');
  stored = await settings.loadModeSessionDurations();
  assert.equal(stored['too-long'], TIMER_MAX_TOTAL_SECONDS);
  assert.equal(stored.corrupt, undefined);
  await settings.saveModeSessionDuration('new', 1800);
  await settings.removeCustomMode('new');
  assert.equal((await settings.loadModeSessionDurations()).new, undefined);
  assert.equal(db.prepare('SELECT * FROM custom_modes WHERE id=?').get('new'), undefined);
  assert.equal((await settings.loadModeSessionDurations())[deep.id], 25 * 60 + 30, 'deletion preserves other settings');
  const home = readFileSync('src/screens/HomeScreen.tsx', 'utf8');
  const prepare = home.slice(home.indexOf('  const handleStart ='), home.indexOf('  const handleAddTime ='));
  assert(!prepare.includes('rememberStartedDuration'), 'camera preparation must not persist a canceled session');
  assert(home.slice(home.indexOf('  const beginActiveSession ='), home.indexOf('  const handleStart =')).includes('rememberStartedDuration(mode.id, durationSeconds)'));
  assert(home.includes("key={activeMode.id + ':' + activeMode.defaultMinutes + ':' + modeDurationsLoaded}"), 'mode switches reset wheel display state without digit ticking');
  db.close();
  console.log('PASS persisted custom defaults, last-started seconds, deletion cleanup, clamped settings, and actual-start-only wiring');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
