const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
import { ModuleKind, transpileModule } from 'typescript';

import { createLiveTimerController, type LiveTimerNative } from '../src/domain/liveTimerController';
import { liveTimerRemainingMs, liveTimerSnapshot, pausedLiveTimerTimeoutMs } from '../src/domain/liveTimerState';
import { MAX_PAUSE_SECONDS } from '../src/domain/pauseRules';

type Test = { name: string; run: () => void | Promise<void> };
const tests: Test[] = [];
const test = (name: string, run: Test['run']) => tests.push({ name, run });
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function fixture(granted: Promise<boolean> = Promise.resolve(false)) {
  const calls: unknown[][] = [];
  const clock = { now: 1000 };
  const native: LiveTimerNative = {
    startLiveTimer: (...args) => { calls.push(['start', ...args]); },
    pauseLiveTimer: (...args) => { calls.push(['pause', ...args]); },
    resumeLiveTimer: (...args) => { calls.push(['resume', ...args]); },
    stopLiveTimer: () => { calls.push(['stop']); },
  };
  return { calls, clock, controller: createLiveTimerController({
    native, requestPermission: () => granted, now: () => clock.now,
  }) };
}

test('remaining duration uses the exact source timestamp, including subsecond values', () => {
  assert.equal(liveTimerRemainingMs(61234, 1000), 60234);
  assert.equal(liveTimerRemainingMs(61234, 61000), 234);
  assert.equal(liveTimerRemainingMs(61234, 62000), 0);
  assert.equal(liveTimerRemainingMs(NaN, 1000), 0);
  assert.equal(liveTimerRemainingMs(Infinity, 1000), 0);
});

test('running snapshot retains its deadline across JS ticks and background suspension', () => {
  const source = { remainingSeconds: 60, endsAtMs: 61000, isPaused: false, awaitingEndChoice: false };
  assert.deepEqual(liveTimerSnapshot(source), liveTimerSnapshot({ ...source, remainingSeconds: 15 }));
});

test('paused snapshot freezes remaining time, ignoring the former end timestamp', () => {
  assert.deepEqual(liveTimerSnapshot({ remainingSeconds: 45, endsAtMs: 61000, isPaused: true, awaitingEndChoice: false }),
    { state: 'paused', remainingMs: 45000 });
});

test('expired, missing, invalid, and awaiting-choice source states all remove the mirror', () => {
  for (const remainingSeconds of [null, 0, -1, NaN]) {
    assert.equal(liveTimerSnapshot({ remainingSeconds, endsAtMs: 61000, isPaused: false, awaitingEndChoice: false }).state, 'ended');
  }
  assert.equal(liveTimerSnapshot({ remainingSeconds: 5, endsAtMs: 61000, isPaused: true, awaitingEndChoice: true }).state, 'ended');
});

test('paused notification lifetime allows the pause limit plus frozen time, without changing the timer', () => {
  assert.equal(pausedLiveTimerTimeoutMs(45000), MAX_PAUSE_SECONDS * 1000 + 45000);
  assert.equal(pausedLiveTimerTimeoutMs(0), 0);
  assert.equal(pausedLiveTimerTimeoutMs(NaN), 0);
});

test('start, pause, and resumed source deadline do not count paused time as focus', async () => {
  const { controller, calls, clock } = fixture();
  await controller.startLiveTimer({ endsAtMs: 61000, label: 'Focus' });
  await controller.pauseLiveTimer({ remainingMs: 45000 });
  clock.now = 121000;
  // The existing source timer, not the notification, establishes the resumed end.
  const resumedSourceEnd = clock.now + 45000;
  await controller.resumeLiveTimer({ endsAtMs: resumedSourceEnd });
  assert.deepEqual(calls, [['start', 61000, 'Focus'], ['pause', 45000, 345000], ['resume', 166000]]);
  assert.equal(liveTimerRemainingMs(resumedSourceEnd, clock.now), 45000);
});

test('extension and pause-overrun resume mirror the supplied new deadline', async () => {
  const { controller, calls } = fixture();
  await controller.startLiveTimer({ endsAtMs: 61000, label: 'Focus' });
  await controller.pauseLiveTimer({ remainingMs: 30000 });
  await controller.resumeLiveTimer({ endsAtMs: 331000 });
  await controller.resumeLiveTimer({ endsAtMs: 631000 });
  assert.deepEqual(calls.slice(-2), [['resume', 331000], ['resume', 631000]]);
});

test('a late permission grant after end cannot resurrect the notification', async () => {
  const permission = deferred<boolean>();
  const { controller, calls } = fixture(permission.promise);
  await controller.startLiveTimer({ endsAtMs: 61000, label: 'Focus' });
  await controller.stopLiveTimer();
  const count = calls.length;
  permission.resolve(true);
  await flush();
  assert.equal(calls.length, count);
  assert.deepEqual(calls.at(-1), ['stop']);
});

test('a late permission grant while paused publishes paused state, never an old running countdown', async () => {
  const permission = deferred<boolean>();
  const { controller, calls } = fixture(permission.promise);
  await controller.startLiveTimer({ endsAtMs: 61000, label: 'Focus' });
  await controller.pauseLiveTimer({ remainingMs: 45000 });
  permission.resolve(true);
  await flush();
  assert.deepEqual(calls.at(-1), ['pause', 45000, 345000]);
});

test('permission granted after the deadline removes the stale mirror', async () => {
  const permission = deferred<boolean>();
  const { controller, calls, clock } = fixture(permission.promise);
  await controller.startLiveTimer({ endsAtMs: 61000, label: 'Focus' });
  clock.now = 62000;
  permission.resolve(true);
  await flush();
  assert.deepEqual(calls.at(-1), ['stop']);
});

test('an obsolete permission result cannot affect a subsequent session', async () => {
  const oldPermission = deferred<boolean>();
  const { controller, calls } = fixture(oldPermission.promise);
  await controller.startLiveTimer({ endsAtMs: 61000, label: 'Focus' });
  await controller.stopLiveTimer();
  await controller.startLiveTimer({ endsAtMs: 121000, label: 'Focus' });
  oldPermission.resolve(true);
  await flush();
  assert.equal(calls.filter(call => call[0] === 'resume').length, 1);
  assert.deepEqual(calls.at(-1), ['resume', 121000]);
});

test('rapid start then pause still initializes the new native session', async () => {
  const { controller, calls } = fixture();
  void controller.startLiveTimer({ endsAtMs: 61000, label: 'Focus' });
  await controller.pauseLiveTimer({ remainingMs: 45000 });
  assert.deepEqual(calls, [['start', 0, 'Focus'], ['pause', 45000, 345000]]);
});

test('queued start then cancel cannot post an obsolete countdown', async () => {
  const { controller, calls } = fixture();
  void controller.startLiveTimer({ endsAtMs: 61000, label: 'Focus' });
  await controller.stopLiveTimer();
  assert.deepEqual(calls, [['stop']]);
});

test('native exceptions and permission failures never reject into the session', async () => {
  const fail = () => { throw new Error('module unavailable'); };
  const controller = createLiveTimerController({
    native: { startLiveTimer: fail, pauseLiveTimer: fail, resumeLiveTimer: fail, stopLiveTimer: fail },
    requestPermission: async () => { throw new Error('permission unavailable'); }, now: () => 1000,
  });
  await controller.startLiveTimer({ endsAtMs: 61000, label: 'Focus' });
  await controller.pauseLiveTimer({ remainingMs: 45000 });
  await controller.resumeLiveTimer({ endsAtMs: 121000 });
  await controller.stopLiveTimer();
  await flush();
});

function loadAndroidApi(platform = 'android', available = true, allowed = false, skip = false, version = 36, storage = new Map<string, string>()) {
  const count = { requests: 0, explanations: 0, lookups: 0, starts: 0, stops: 0 };
  const exports = {} as typeof import('../src/domain/androidLiveTimer');
  runInNewContext(transpileModule(readFileSync('src/domain/androidLiveTimer.ts', 'utf8'), {
    compilerOptions: { module: ModuleKind.CommonJS },
  }).outputText, { exports, require: (id: string) => {
    if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: {
      getItem: async (key: string) => storage.get(key) ?? null,
      setItem: async (key: string, value: string) => { storage.set(key, value); },
    } };
    if (id === 'expo') return { NativeModule: class {}, requireOptionalNativeModule: () => {
      count.lookups += 1;
      return available ? {
        startLiveTimer: () => { count.starts += 1; }, pauseLiveTimer: () => {}, resumeLiveTimer: () => {},
        stopLiveTimer: () => { count.stops += 1; },
      } : null;
    } };
    if (id === 'react-native') return {
      Platform: { OS: platform, Version: version },
      PermissionsAndroid: {
        PERMISSIONS: { POST_NOTIFICATIONS: 'android.permission.POST_NOTIFICATIONS' }, RESULTS: { GRANTED: 'granted' },
        check: async () => allowed,
        request: async () => { count.requests += 1; return 'denied'; },
      },
      Alert: { alert: (_title: string, message: string, buttons: { onPress: () => void }[]) => {
        assert.equal(message, "Shows your timer in the notification bar while you're in other apps");
        count.explanations += 1;
        buttons[skip ? 0 : 1].onPress();
      } },
    };
    if (id === './liveTimerController') return { createLiveTimerController };
    throw new Error(`Unexpected dependency ${id}`);
  } });
  return { api: exports, count };
}

test('POST_NOTIFICATIONS denial is asked at most twice across repeated starts', async () => {
  const { api, count } = loadAndroidApi();
  for (let index = 0; index < 4; index += 1) {
    await api.startLiveTimer({ endsAtMs: Date.now() + 60000, label: 'Focus' });
    await flush();
    await api.stopLiveTimer();
  }
  assert.equal(count.explanations, 2);
  assert.equal(count.requests, 2);
});

test('skipping the explanation never opens a system prompt and is also limited to twice', async () => {
  const { api, count } = loadAndroidApi('android', true, false, true);
  for (let index = 0; index < 3; index += 1) {
    await api.startLiveTimer({ endsAtMs: Date.now() + 60000, label: 'Focus' });
    await flush();
  }
  assert.equal(count.explanations, 2);
  assert.equal(count.requests, 0);
});

test('already granted permission shows no explanation or runtime prompt', async () => {
  const { api, count } = loadAndroidApi('android', true, true);
  await api.startLiveTimer({ endsAtMs: Date.now() + 60000, label: 'Focus' });
  await flush();
  assert.equal(count.requests + count.explanations, 0);
});

test('iOS, web, and missing native builds are safe no-ops without permission UI', async () => {
  for (const [platform, available] of [['ios', true], ['web', true], ['android', false]] as const) {
    const { api, count } = loadAndroidApi(platform, available);
    await api.startLiveTimer({ endsAtMs: Date.now() + 60000, label: 'Focus' });
    await api.pauseLiveTimer({ remainingMs: 45000 });
    await api.resumeLiveTimer({ endsAtMs: Date.now() + 45000 });
    await api.stopLiveTimer();
    await flush();
    assert.equal(count.requests + count.explanations + count.starts + count.stops, 0);
    if (platform !== 'android') assert.equal(count.lookups, 0);
  }
});

test('permission attempt budget survives a fresh JS module load', async () => {
  const storage = new Map<string, string>();
  for (let launch = 0; launch < 3; launch += 1) {
    const { api, count } = loadAndroidApi('android', true, false, false, 36, storage);
    await api.startLiveTimer({ endsAtMs: Date.now() + 60000, label: 'Focus' });
    await flush();
    await api.stopLiveTimer();
    assert.equal(count.requests, launch < 2 ? 1 : 0);
    assert.equal(count.explanations, launch < 2 ? 1 : 0);
  }
});

test('Android below API 33 does not ask for POST_NOTIFICATIONS', async () => {
  const { api, count } = loadAndroidApi('android', true, false, false, 32);
  await api.startLiveTimer({ endsAtMs: Date.now() + 60000, label: 'Focus' });
  await flush();
  assert.equal(count.explanations + count.requests, 0);
  assert.equal(count.starts, 1);
});
async function main() {
  let failures = 0;
  for (const { name, run } of tests) {
    try { await run(); console.log(`PASS ${name}`); }
    catch (error) { failures += 1; console.error(`FAIL ${name}`, error); }
  }
  console.log(`${tests.length - failures}/${tests.length} live timer checks passed`);
  if (failures) process.exitCode = 1;
}
void main();
