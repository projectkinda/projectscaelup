import { ModuleKind, transpileModule } from 'typescript';
import { buildWeekStrip, localWeekBoundaries } from '../src/domain/weekStrip';
import { HISTORY_STAT_COPY, historyStatLine, statAccessibility, statInteger, statSessionLabel } from '../src/domain/historyStatCopy';

const cases: { name: string; run: () => void | Promise<void> }[] = [];
function test(name: string, run: () => void | Promise<void>) { cases.push({ name, run }); }
function assert(condition: unknown, message: string) { if (!condition) throw new Error(message); }
const iso = (year: number, month: number, day: number, hour = 10) => new Date(year, month - 1, day, hour).toISOString();

test('Monday starts the local week and leaves future days empty', () => {
  const now = new Date(2026, 9, 12, 12);
  const strip = buildWeekStrip([iso(2026, 10, 12), iso(2026, 10, 13)], now);
  assert(strip.todayIndex === 0 && strip.days.join(',') === 'true,false,false,false,false,false,false', JSON.stringify(strip));
});
test('Sunday is the seventh local day', () => {
  const now = new Date(2026, 9, 18, 12);
  const strip = buildWeekStrip(Array.from({ length: 7 }, (_, index) => iso(2026, 10, 12 + index)), now);
  assert(strip.todayIndex === 6 && strip.days.every(Boolean), JSON.stringify(strip));
});
test('week spans a month boundary', () => {
  const strip = buildWeekStrip([iso(2026, 10, 26), iso(2026, 11, 1)], new Date(2026, 10, 1, 12));
  assert(strip.days[0] && strip.days[6] && strip.days.filter(Boolean).length === 2, JSON.stringify(strip));
});
test('week spans a year boundary', () => {
  const strip = buildWeekStrip([iso(2026, 12, 28), iso(2027, 1, 1), iso(2027, 1, 3)], new Date(2027, 0, 3, 12));
  assert(strip.days[0] && strip.days[4] && strip.days[6], JSON.stringify(strip));
});
test('empty week has seven empty days and duplicate sessions count once', () => {
  const now = new Date(2026, 9, 18, 12);
  assert(buildWeekStrip([], now).days.length === 7 && !buildWeekStrip([], now).days.some(Boolean), 'empty week wrong');
  assert(buildWeekStrip([iso(2026, 10, 13, 8), iso(2026, 10, 13, 16), 'invalid'], now).days.filter(Boolean).length === 1, 'duplicate or invalid timestamp counted');
});
test('local day edges and future timestamps are handled exactly', () => {
  const now = new Date(2026, 9, 14, 12);
  const bounds = localWeekBoundaries(now);
  const strip = buildWeekStrip([new Date(bounds[0].getTime() - 1).toISOString(), bounds[0].toISOString(), bounds[1].toISOString(), iso(2026, 10, 14, 13), bounds[7].toISOString()], now, bounds);
  assert(strip.days.join(',') === 'true,true,false,false,false,false,false', JSON.stringify(strip));
});
test('DST spring and autumn weeks preserve local midnight boundaries', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    for (const [now, hours] of [[new Date(2026, 2, 8, 23), 167], [new Date(2026, 10, 1, 23), 169]] as const) {
      const bounds = localWeekBoundaries(now);
      assert((bounds[7].getTime() - bounds[0].getTime()) / 3600000 === hours, 'DST duration wrong');
      assert(bounds.every(date => date.getHours() === 0), 'boundary drifted from local midnight');
      const strip = buildWeekStrip([new Date(now.getFullYear(), now.getMonth(), now.getDate(), 1, 30).toISOString(), new Date(now.getFullYear(), now.getMonth(), now.getDate(), 22).toISOString()], now, bounds);
      assert(strip.days[6] && strip.days.filter(Boolean).length === 1, JSON.stringify(strip));
    }
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

const base = { currentStreak: 1, bestStreak: 2, totalSessionsCompleted: 6, focusedToday: false };
test('first-session copy takes precedence for a new user', () => {
  assert(historyStatLine({ ...base, currentStreak: 0, bestStreak: 0, totalSessionsCompleted: 0 }) === 'Your first focus session starts your streak.', 'zero copy wrong');
});
test('focused today at or above the best uses the best-streak line', () => {
  for (const currentStreak of [2, 3]) assert(historyStatLine({ ...base, currentStreak, focusedToday: true }) === "You're on your best streak. Keep it going.", 'best copy wrong');
});
test('focused today below best handles one day and several days', () => {
  assert(historyStatLine({ ...base, focusedToday: true }) === '1 more day to tie your best.', 'singular copy wrong');
  assert(historyStatLine({ ...base, bestStreak: 4, focusedToday: true }) === '3 more days to tie your best.', 'plural copy wrong');
});
test('not focused today protects an existing streak', () => {
  assert(historyStatLine({ ...base, currentStreak: 3 }) === 'Focus today to keep your 3-day streak.', 'keep copy wrong');
});
test('not focused today without a streak starts a new one', () => {
  assert(historyStatLine({ ...base, currentStreak: 0 }) === 'Focus today to start a new streak.', 'restart copy wrong');
});
test('stat labels and accessibility use plain integer values and correct plurals', () => {
  assert(HISTORY_STAT_COPY.current === 'day streak' && statSessionLabel(1) === 'session' && statSessionLabel(0) === 'sessions', 'column labels wrong');
  assert(statAccessibility('current', 1) === 'Current streak: 1 day', 'current accessibility wrong');
  assert(statAccessibility('best', 2) === 'Best streak: 2 days', 'best accessibility wrong');
  for (const value of [NaN, Infinity, -1]) assert(statInteger(value) === 0, 'invalid number leaked');
  assert(statInteger(3.9) === 3, 'number is not an integer');
});

function loadModule(file: string, dependencies: (id: string) => unknown, globals = {}) {
  const { readFileSync } = require('node:fs');
  const { runInNewContext } = require('node:vm');
  const module = { exports: {} as any };
  runInNewContext(transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText,
    { exports: module.exports, require: dependencies, console, ...globals });
  return module.exports;
}
async function repositoryFixture() {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  const adapter = {
    execAsync: async (sql: string) => db.exec(sql),
    getAllAsync: async (sql: string, params: unknown[] = []) => db.prepare(sql).all(...params),
    getFirstAsync: async (sql: string, params: unknown[] = []) => db.prepare(sql).get(...params) ?? null,
    runAsync: async (sql: string, params: unknown[] = []) => {
      const result = db.prepare(sql).run(...params);
      return { lastInsertRowId: Number(result.lastInsertRowid), changes: Number(result.changes) };
    },
    withTransactionAsync: async (work: () => Promise<void>) => { db.exec('BEGIN'); try { await work(); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; } },
  };
  const schema = loadModule('src/data/database.ts', () => ({ openDatabaseAsync: async () => adapter }));
  await schema.ensureSchema(adapter);
  const repository = loadModule('src/data/historyRepository.ts', id => {
    if (id === './database') return { getDatabase: async () => adapter, ensureSchema: schema.ensureSchema };
    if (id === '../domain/iosScreenTime') return { iosAppKey: () => null };
    return require('../src/domain/' + id.replace('../domain/', ''));
  }) as typeof import('../src/data/historyRepository');
  return { db, adapter, schema, repository };
}
test('repository uses completed attempts, completion date, no coach minimum, and legacy fallback', async () => {
  const { db, repository } = await repositoryFixture();
  try {
    const insert = db.prepare(`INSERT INTO sessions (mode_id,started_at,duration_seconds,completed,distraction_count,lockdown_minutes,focus_seconds,ended_at) VALUES ('deep-work',?,?,?,0,0,?,?);`);
    insert.run(iso(2026, 10, 11, 23), 600, 1, 600, iso(2026, 10, 12, 0));
    insert.run(iso(2026, 10, 13), 1, 1, 1, iso(2026, 10, 13));
    insert.run(iso(2026, 10, 14), 1800, 0, 1800, iso(2026, 10, 14));
    insert.run(iso(2026, 10, 15), 1800, 1, null, null);
    insert.run(iso(2026, 10, 18), 1800, 1, 1800, iso(2026, 10, 18));
    for (const isPaidUser of [false, true]) {
      const data = await repository.loadHistoryData({ isPaidUser, today: new Date(2026, 9, 18, 12) });
      assert(data.thisWeek.days.join(',') === 'true,true,false,true,false,false,true', JSON.stringify(data.thisWeek));
      assert(data.focusedToday === true, 'focusedToday disagrees with todayIndex');
    }
  } finally { db.close(); }
});
test('free history enforces the same calendar-day depth advertised by the paywall', async () => {
  const { db, repository } = await repositoryFixture();
  try {
    const now = new Date(2026, 9, 18, 12);
    const { FREE_HISTORY_DAYS } = require('../src/domain/paywall');
    const cutoff = new Date(now); cutoff.setHours(0, 0, 0, 0); cutoff.setDate(cutoff.getDate() - FREE_HISTORY_DAYS);
    const insert = db.prepare("INSERT INTO sessions (mode_id,started_at,duration_seconds,completed,distraction_count,lockdown_minutes) VALUES ('deep-work',?,600,1,0,0)");
    insert.run(new Date(cutoff.getTime() - 1).toISOString());
    insert.run(cutoff.toISOString());
    insert.run(now.toISOString());
    const free = await repository.loadHistoryData({ today: now, isPaidUser: false });
    const pro = await repository.loadHistoryData({ today: now, isPaidUser: true });
    assert(free.sessions.length === 2 && free.hasHiddenHistory, 'free cutoff must exclude the older row');
    assert(pro.sessions.length === 3 && !pro.hasHiddenHistory, 'Pro history must include all rows');
  } finally { db.close(); }
});
test('new-user repository returns all zero stats and a complete empty strip', async () => {
  const { db, repository } = await repositoryFixture();
  try {
    const data = await repository.loadHistoryData({ today: new Date(2026, 9, 12, 12) });
    assert(data.currentStreak === 0 && data.bestStreak === 0 && data.totalSessionsCompleted === 0 && !data.focusedToday, 'zero stats wrong');
    assert(data.thisWeek.days.length === 7 && !data.thisWeek.days.some(Boolean), 'zero strip wrong');
    assert(!/NaN|undefined/.test(historyStatLine(data)), 'invalid zero copy');
  } finally { db.close(); }
});
test('existing dev samples light the week strip and removal restores it without stat-specific hooks', async () => {
  const { db, adapter, schema, repository } = await repositoryFixture();
  try {
    const now = new Date(2026, 9, 18, 22);
    const fixedDate = class extends Date { constructor(value: any = now.getTime()) { super(value); } };
    const samples = loadModule('src/data/coachSampleRepository.ts', id => {
      if (id === 'react-native') return { Platform: { OS: 'android' } };
      if (id === '../domain/paywall') return { TIER_SWITCHER_ENABLED: true };
      if (id === './database') return { getDatabase: async () => adapter, ensureSchema: schema.ensureSchema };
      if (id === './coachDataEvents') return require('../src/data/coachDataEvents');
      return require('../src/domain/' + id.replace('../domain/', ''));
    }, { __DEV__: true, Date: fixedDate });
    await samples.loadSampleSessions();
    const loaded = await repository.loadHistoryData({ isPaidUser: true, today: now });
    assert(loaded.thisWeek.days.join(',') === 'true,true,false,true,false,true,false', JSON.stringify(loaded.thisWeek));
    assert(loaded.currentStreak === 0 && loaded.totalSessionsCompleted === 0, 'samples changed real streak counters');
    await samples.removeSampleSessions();
    const cleared = await repository.loadHistoryData({ today: now });
    assert(!cleared.thisWeek.days.some(Boolean) && !cleared.focusedToday, 'sample days remained after removal');
  } finally { db.close(); }
});

async function main() {
  let failed = 0;
  for (const item of cases) {
    try { await item.run(); console.log(`PASS ${item.name}`); }
    catch (error) { failed++; console.log(`FAIL ${item.name}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  if (failed) process.exit(1);
}
void main();
