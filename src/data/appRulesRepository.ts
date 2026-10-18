import { Platform } from 'react-native';
import { ensureSchema, getDatabase } from './database';
import { AppRulesModule } from '../domain/appRulesModule';
import { DEV_FLAGS, isPaidUser, subscribeToTier } from '../domain/paywall';
import { enforcedVersions, retireRule, ruleSnapshot, validateRule, type AppRule, type AppRuleSnapshot, type EnforcedRuleVersion } from '../domain/appRules';

type RuleRow = { id: string; kind: 'schedule' | 'limit'; apps: string; days: number | null;
  start_minute: number | null; end_minute: number | null; limit_minutes: number | null;
  enabled: number; retired_json: string; created_at: string; updated_at: string; deleted: string | null };
let queue: Promise<unknown> = Promise.resolve();
let syncQueue: Promise<void> = Promise.resolve();
export type RuleWriteResult = { ok: true; rule: AppRule } | { ok: false; error: string };
function decode(row: RuleRow): AppRule {
  const retired = JSON.parse(row.retired_json) as AppRule['retired'];
  return { id: row.id, kind: row.kind, apps: JSON.parse(row.apps), days: row.days,
    startMin: row.start_minute, endMin: row.end_minute, limitMinutes: row.limit_minutes,
    enabled: row.enabled === 1, retired,
    deleted: row.deleted === 'true', createdAt: row.created_at, updatedAt: row.updated_at };
}
async function database() { const db = await getDatabase(); await ensureSchema(db); return db; }
async function write(rule: AppRule) {
  const db = await database();
  await db.withTransactionAsync(async () => {
  await db.runAsync(
    'INSERT OR REPLACE INTO app_rules (id,kind,apps,days,start_minute,end_minute,limit_minutes,enabled,retired_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?);',
    [rule.id, rule.kind, JSON.stringify(rule.apps), rule.days, rule.startMin, rule.endMin, rule.limitMinutes,
      rule.enabled ? 1 : 0, JSON.stringify(rule.retired), rule.createdAt, rule.updatedAt]);
  if (rule.deleted) await db.runAsync('INSERT OR REPLACE INTO app_state (key,value) VALUES (?,?);', ['app_rule_deleted:' + rule.id, 'true']);
  });
}
async function readRules(now: Date): Promise<AppRule[]> {
  const db = await database();
  const rules = (await db.getAllAsync<RuleRow>("SELECT r.*, s.value AS deleted FROM app_rules r LEFT JOIN app_state s ON s.key = 'app_rule_deleted:' || r.id ORDER BY r.created_at, r.id;")).map(decode);
  const kept: AppRule[] = [];
  for (const rule of rules) {
    const retired = rule.retired.filter(item => Date.parse(item.enforcedUntil) > now.getTime());
    if (rule.deleted && retired.length === 0) {
      const result = await db.runAsync('DELETE FROM app_rules WHERE id = ? AND retired_json = ?;', [rule.id, JSON.stringify(rule.retired)]);
      if (result.changes) await db.runAsync('DELETE FROM app_state WHERE key = ?;', ['app_rule_deleted:' + rule.id]);
      continue;
    }
    const pruned = { ...rule, retired };
    if (retired.length !== rule.retired.length) await db.runAsync(
      'UPDATE app_rules SET retired_json = ? WHERE id = ? AND retired_json = ?;',
      [JSON.stringify(retired), rule.id,
        JSON.stringify(rule.retired)]);
    kept.push(pruned);
  }
  return kept;
}
export async function listRules(now = new Date()): Promise<AppRule[]> {
  if (Platform.OS !== 'android') return [];
  try { return (await readRules(now)).filter(rule => !rule.deleted); }
  catch (error) { console.warn('Could not list app rules:', error); return []; }
}
export async function getEnforcedVersions(now = new Date()): Promise<EnforcedRuleVersion[]> {
  if (Platform.OS !== 'android') return [];
  try { return (await readRules(now)).flatMap(rule => enforcedVersions(rule, now)); }
  catch (error) { console.warn('Could not load enforced rules:', error); return []; }
}
export function syncRulesToNative(): Promise<void> {
  const work = async () => {
    if (Platform.OS !== 'android') return;
    try {
      const versions = isPaidUser() ? (await readRules(new Date())).flatMap(rule => enforcedVersions(rule, new Date())) : [];
      // Check again after the asynchronous DB read: a downgrade must not race a stale paid sync.
      await AppRulesModule.setRules(isPaidUser() ? versions : []);
    } catch (error) { console.warn('Could not sync app rules:', error); }
  };
  syncQueue = syncQueue.then(work, work);
  return syncQueue;
}
function mutate(work: () => Promise<AppRule>): Promise<RuleWriteResult> {
  const run = async (): Promise<RuleWriteResult> => {
    try {
      if (Platform.OS !== 'android') return { ok: false, error: 'App rules are available on Android.' };
      if (!isPaidUser()) return { ok: false, error: 'App rules require Pro.' };
      const rule = await work();
      await syncRulesToNative();
      return { ok: true, rule };
    } catch (error) { console.warn('Could not save app rule:', error); return { ok: false, error: error instanceof Error ? error.message : 'Could not save app rule.' }; }
  };
  const result = queue.then(run, run); queue = result; return result;
}
async function check(input: AppRuleSnapshot, dev = false) {
  const excluded = await AppRulesModule.getExcludedPackages();
  // Only the explicitly dev-gated fixture writer may use the requested 3/1 minute durations.
  const checked = dev ? { ...input, limitMinutes: input.kind === 'limit' ? 5 : null,
    endMin: input.kind === 'schedule' ? (input.startMin! + 15) % 1440 : null } : input;
  const errors = validateRule(checked, excluded);
  if (errors.length) throw new Error(errors.join(' '));
}
async function create(input: AppRuleSnapshot, now: Date, dev = false): Promise<AppRule> {
  await check(input, dev);
  const rules = await readRules(now);
  // Tombstones count until retirement: repeatedly deleting/creating cannot grow enforcement unbounded.
  if (rules.length >= 10) throw new Error('You can have up to 10 rules, including rules retiring today.');
  const timestamp = now.toISOString();
  const rule: AppRule = { ...ruleSnapshot(input), id: 'rule-' + now.getTime().toString(36) + '-' + Math.random().toString(36).slice(2, 12),
    retired: [], createdAt: timestamp, updatedAt: timestamp };
  await write(rule); return rule;
}
export function createRule(input: AppRuleSnapshot, now = new Date()) { return mutate(() => create(input, now)); }
export function updateRule(id: string, input: AppRuleSnapshot, now = new Date()) {
  return mutate(async () => {
    await check(input);
    const previous = (await readRules(now)).find(rule => rule.id === id && !rule.deleted);
    if (!previous) throw new Error('Rule not found.');
    const next = retireRule(previous, input, now); await write(next); return next;
  });
}
export function deleteRule(id: string, now = new Date()) {
  return mutate(async () => {
    const previous = (await readRules(now)).find(rule => rule.id === id && !rule.deleted);
    if (!previous) throw new Error('Rule not found.');
    const next = retireRule(previous, { ...previous, enabled: false }, now, true); await write(next); return next;
  });
}
export function startAppRulesSync(): () => void {
  const unsubscribe = subscribeToTier(() => { void syncRulesToNative(); });
  void syncRulesToNative();
  return unsubscribe;
}
export function createDevTestRule(pkg: string, kind: 'schedule' | 'limit', now = new Date(), startDelayMinutes: 0 | 1 = 0) {
  if (!DEV_FLAGS.tierSwitcher) return Promise.resolve<RuleWriteResult>({ ok: false, error: 'Development fixtures are disabled.' });
  const start = new Date(now.getTime() + startDelayMinutes * 60_000);
  const startMin = start.getHours() * 60 + start.getMinutes();
  return mutate(() => create({ kind, apps: [pkg], enabled: true, days: kind === 'schedule' ? 1 << ((start.getDay() + 6) % 7) : null,
    startMin: kind === 'schedule' ? startMin : null, endMin: kind === 'schedule' ? (startMin + 3) % 1440 : null,
    limitMinutes: kind === 'limit' ? 1 : null }, now, true));
}
/** Test reset intentionally bypasses retirement; never available in a release build. */
export async function clearDevAppRules(): Promise<void> {
  if (!DEV_FLAGS.tierSwitcher || Platform.OS !== 'android') return;
  const work = async () => { try { const db = await database(); await db.withTransactionAsync(async () => { await db.runAsync('DELETE FROM app_rules;'); await db.runAsync("DELETE FROM app_state WHERE key LIKE 'app_rule_deleted:%';"); }); await syncRulesToNative(); }
    catch (error) { console.warn('Could not clear dev app rules:', error); } };
  const result = queue.then(work, work); queue = result; await result;
}
