/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { ModuleKind, transpileModule } from 'typescript';
import { BUILT_IN_MODES, customModeToSessionMode, getHomeModes } from '../src/domain/sessionModes';
import { canAddFlaggedApp } from '../src/domain/paywall';

const ids = (modes: readonly { id: string }[]) => Array.from(modes, mode => mode.id);
const newest = customModeToSessionMode({ id: 'new', name: 'Zulu', gracePeriodSeconds: 12, defaultMinutes: 25, frameWidthRange: [15, 40] });
const older = customModeToSessionMode({ id: 'old', name: 'Alpha', gracePeriodSeconds: 20, defaultMinutes: 25, frameWidthRange: [15, 40] });
const custom = [newest, older];
assert.deepEqual(ids(getHomeModes(true, [])), ids(BUILT_IN_MODES));
assert.deepEqual(ids(getHomeModes(true, custom)), [BUILT_IN_MODES[0].id, 'new', 'old', ...ids(BUILT_IN_MODES.slice(1))]);
assert.deepEqual(ids(getHomeModes(false, custom)), ids(BUILT_IN_MODES.filter(mode => !mode.isPaid)));
assert.deepEqual(ids(custom), ['new', 'old'], 'ordering must not mutate its input');
assert.equal(getHomeModes(true, custom)[0].id, getHomeModes(false)[0].id, 'fresh default remains the first built-in');
console.log('PASS pure Home ordering: zero/two custom modes, newest-first input, built-in order, unchanged free list/default');

function loadModule(file: string, dependencies: (id: string) => unknown) {
  const module = { exports: {} as any };
  runInNewContext(transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText,
    { exports: module.exports, require: (id: string) => id.endsWith('/releaseLog') ? { warn: () => {} } : dependencies(id), console });
  return module.exports;
}
async function main() {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  const schema = readFileSync('src/data/database.ts', 'utf8').match(/CREATE TABLE IF NOT EXISTS custom_modes \([\s\S]*?\);/)![0];
  assert(!schema.includes('created_at'), 'use rowid only while the existing schema has no creation timestamp');
  db.exec(schema);
  db.exec('CREATE TABLE flagged_apps (app_identifier TEXT PRIMARY KEY, display_name TEXT, icon_base64 TEXT); CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT);');
  const queries: string[] = [];
  const database = {
    getAllAsync: async (sql: string, params: unknown[] = []) => { queries.push(sql); return db.prepare(sql).all(...params); },
    getFirstAsync: async (sql: string, params: unknown[] = []) => db.prepare(sql).get(...params) ?? null,
    runAsync: async (sql: string, params: unknown[] = []) => db.prepare(sql).run(...params),
  };
  const databaseModule = { getDatabase: async () => database, ensureSchema: async () => {} };
  const modes = loadModule('src/data/modesRepository.ts', id => {
    if (id === './database') return databaseModule;
    if (id === '../domain/sessionModes') return { getHomeModes, customModeToSessionMode };
    throw Error(id);
  });
  const settings = loadModule('src/data/settingsRepository.ts', id => {
    if (id === './database') return databaseModule;
    if (id === './modesRepository') return modes;
    if (id === './appStateRepository') return {};
    if (id === '../domain/modeDurations') return require('../src/domain/modeDurations');
    if (id === '../domain/paywall') return { canAddFlaggedApp };
    if (id === '../domain/appPicker') return { getInstalledApps: async () => [] };
    if (id === '../domain/usageTrackingModule') return { UsageTrackingModule: { setFlaggedPackages: async () => {} } };
    throw Error(id);
  });
  assert.deepEqual(ids(await modes.loadAvailableModes(true)), ids(BUILT_IN_MODES));
  await settings.saveCustomMode({ id: 'old', name: 'Alpha', gracePeriodSeconds: 20 });
  await settings.saveCustomMode({ id: 'new', name: 'Zulu', gracePeriodSeconds: 12 });
  assert.deepEqual(ids(await modes.loadAvailableModes(true)), [BUILT_IN_MODES[0].id, 'new', 'old', ...ids(BUILT_IN_MODES.slice(1))]);
  assert.deepEqual(ids((await settings.loadSettingsData({ isPaidUser: true })).customModes), ['new', 'old']);
  const oldRowId = db.prepare('SELECT rowid FROM custom_modes WHERE id=?').get('old').rowid;
  await settings.saveCustomMode({ id: 'old', name: 'Renamed old', gracePeriodSeconds: 30 });
  assert.equal(db.prepare('SELECT rowid FROM custom_modes WHERE id=?').get('old').rowid, oldRowId);
  assert.deepEqual(ids((await settings.loadSettingsData({ isPaidUser: true })).customModes), ['new', 'old'], 'editing does not make a mode newer');
  queries.length = 0;
  assert.deepEqual(ids(await modes.loadAvailableModes(false)), ids(getHomeModes(false)));
  assert.equal(queries.length, 0, 'free Home does not query custom modes');
  assert.equal((await settings.loadSettingsData({ isPaidUser: false })).customModes.length, 0);
  assert(!queries.some(sql => /FROM custom_modes/i.test(sql)), 'free Settings does not query custom modes');
  db.close();
  console.log('PASS real SQLite repository ordering: rowid DESC, matching Settings list, edit stability, free filtering');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
