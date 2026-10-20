/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Runs the real awayPlatform.ts and awayTime.ts against an in-memory SQLite and
// a fake iOS native module: identifiers, platform column, gaps, the display
// rule, the dev flag and "off means off".

const compile = (path: string) =>
  ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const { DatabaseSync } = require('node:sqlite');

const HOUR = 60 * 60 * 1000;

type Native = {
  enabled: boolean;
  authorized: boolean;
  lastHeartbeatMs: number | null;
  uses: { appKey: string; usedAtMs: number }[];
  gaps: { startedMs: number; endedMs: number }[];
  enabledCalls: boolean[];
};

function setup({ os = 'ios', flag = true }: { os?: string; flag?: boolean } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE app_state(key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE app_use_log(id INTEGER PRIMARY KEY AUTOINCREMENT, app_identifier TEXT NOT NULL, used_at TEXT NOT NULL, platform TEXT NOT NULL, UNIQUE(app_identifier, used_at));
    CREATE TABLE away_tracking_gaps(id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, ended_at TEXT NOT NULL, UNIQUE(started_at, ended_at));
    CREATE TABLE sessions(id INTEGER PRIMARY KEY, ended_at TEXT, after_session_away_seconds INTEGER, after_session_away_verified INTEGER);
    CREATE TABLE distraction_events(id INTEGER PRIMARY KEY, type TEXT, occurred_at TEXT);
  `);
  const native: Native = {
    enabled: true, authorized: true, lastHeartbeatMs: null, uses: [], gaps: [], enabledCalls: [],
  };
  const database = {
    runAsync: async (sql: string, args: unknown[] = []) => db.prepare(sql).run(...args),
    getFirstAsync: async (sql: string, args: unknown[] = []) => db.prepare(sql).get(...args) ?? null,
    getAllAsync: async (sql: string, args: unknown[] = []) => db.prepare(sql).all(...args),
    withTransactionAsync: async (fn: () => Promise<void>) => { db.exec('BEGIN'); try { await fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } },
  };
  const devFlags = { iosAwayTrackingPreview: flag };
  const platformExports: any = {};
  runInNewContext(compile('src/domain/awayPlatform.ts'), {
    exports: platformExports,
    require: (name: string) => ({
      'react-native': { Platform: { OS: os } },
      '../../modules/screen-time': {
        ScreenTime: {
          isAvailable: true,
          setAwayTrackingEnabled: async (value: boolean) => { native.enabledCalls.push(value); },
          drainAwayUses: async () => native.uses.splice(0),
          drainAwayGaps: async () => native.gaps.splice(0),
          getAwayStatus: () => ({ enabled: native.enabled, authorized: native.authorized, lastHeartbeatMs: native.lastHeartbeatMs, lastFailureMs: null }),
        },
      },
      './iosScreenTime': { IOS_APP_PREFIX: 'ios.app.' },
      './paywall': { DEV_FLAGS: devFlags },
      './usageTrackingModule': { UsageTrackingModule: {} },
    } as Record<string, unknown>)[name],
  });
  const awayExports: any = {};
  runInNewContext(compile('src/domain/awayTime.ts'), {
    exports: awayExports,
    Date, Math, Number, Promise,
    require: (name: string) => ({
      'react-native': { Platform: { OS: os } },
      '../data/appStateRepository': {
        getAppState: async (key: string) => db.prepare('SELECT value FROM app_state WHERE key = ?').get(key)?.value ?? null,
        setAppState: async (key: string, value: string) => { db.prepare('INSERT INTO app_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value); },
      },
      '../data/database': { ensureSchema: async () => {}, getDatabase: async () => database },
      './awayPlatform': platformExports,
    } as Record<string, unknown>)[name],
  });
  return { db, native, away: awayExports, platform: platformExports, devFlags };
}

async function main() {
  // The flag keeps iOS off, and Android is unaffected by it.
  assert.equal(setup({ flag: false }).platform.getAwayBackend(), null, 'iOS is off without the dev flag');
  assert.equal(setup({ flag: false }).platform.isAwayTrackingSupported(), false);
  assert.equal(setup({ flag: true }).platform.getAwayBackend().platform, 'ios');
  assert.equal(setup({ os: 'android', flag: false }).platform.getAwayBackend().platform, 'android');
  assert.equal(setup({ os: 'web', flag: true }).platform.getAwayBackend(), null);

  // Opting in/out reaches the native side; opting out deletes derived data.
  {
    const { away, native, db } = setup();
    await away.setAwayTrackingEnabled(true);
    assert.deepEqual(native.enabledCalls, [true]);
    assert.equal(await away.isAwayTrackingOptedIn(), true);
    db.prepare("INSERT INTO app_use_log(app_identifier, used_at, platform) VALUES ('ios.app.ab12', '2026-10-20T10:00:00.000Z', 'ios')").run();
    db.prepare("INSERT INTO sessions(id, ended_at, after_session_away_seconds, after_session_away_verified) VALUES (1,'2026-10-20T09:00:00.000Z',3600,1)").run();
    await away.setAwayTrackingEnabled(false);
    assert.deepEqual(native.enabledCalls, [true, false]);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM app_use_log').get().c, 0);
    assert.equal(db.prepare('SELECT after_session_away_seconds s FROM sessions').get().s, null);
  }

  // Draining stores iOS identifiers and the platform, deduplicates, and keeps gaps.
  {
    const { away, native, db } = setup();
    await away.setAwayTrackingEnabled(true);
    const used = Date.now() - 2 * HOUR;
    native.uses.push({ appKey: 'ab12', usedAtMs: used }, { appKey: 'ab12', usedAtMs: used });
    native.gaps.push({ startedMs: used - HOUR, endedMs: used - HOUR / 2 });
    await away.drainAwayLog();
    const rows = db.prepare('SELECT app_identifier, platform FROM app_use_log').all();
    assert.deepEqual(rows.map((r: any) => [r.app_identifier, r.platform]), [['ios.app.ab12', 'ios']]);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM away_tracking_gaps').get().c, 1);
    assert.equal(native.uses.length, 0, 'the native buffer is cleared once imported');
  }

  // Display rule: fresh heartbeat is "about", stale is "at least" and never counts the dead stretch.
  {
    const { away, native, db } = setup();
    await away.setAwayTrackingEnabled(true);
    const now = Date.now();
    db.prepare("UPDATE app_state SET value = ? WHERE key = 'away_tracking_started_at'").run(`${now - 10 * HOUR}`);
    native.uses.push({ appKey: 'ab12', usedAtMs: now - 3 * HOUR });
    native.lastHeartbeatMs = now - 5 * 60 * 1000;
    const fresh = await away.getAwayDisplay();
    assert.equal(fresh.kind, 'about');
    assert.ok(Math.abs(fresh.seconds - 3 * 3600) < 120, `about 3 h, got ${fresh.seconds}s`);
    assert.match(fresh.text, /^about 3 h/);

    native.lastHeartbeatMs = now - 8 * HOUR;
    const stale = await away.getAwayDisplay();
    assert.equal(stale.kind, 'at_least', 'a heartbeat older than 6.5 h is stale');
    assert.ok(stale.seconds < 0 + 1, 'the stale stretch is not counted: the heartbeat predates the use');

    native.lastHeartbeatMs = now - 4 * HOUR;
    native.authorized = false;
    assert.equal((await away.getAwayDisplay()).kind, 'hidden', 'without Screen Time access nothing is claimed');
    native.authorized = true;
    native.lastHeartbeatMs = null;
    assert.equal((await away.getAwayDisplay()).kind, 'hidden', 'no heartbeat yet means no claim');
  }

  // Not opted in: hidden, and nothing is imported.
  {
    const { away, native } = setup();
    native.lastHeartbeatMs = Date.now();
    assert.equal((await away.getAwayDisplay()).kind, 'hidden');
  }

  console.log('PASS iOS away time: dev flag, identifiers/platform, gap import, display rule, authorization, opt-out');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
