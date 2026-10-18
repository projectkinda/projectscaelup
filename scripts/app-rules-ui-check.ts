/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ruleDaySummary, RULE_DAY_NAMES, ruleTitle, formatRuleDuration, formatRuleTime, isLooserChange, stepRuleLimit, ruleUsage, ruleEnabledStatus, defaultRuleDraft } from '../src/domain/appRulesPresentation';
import { cameraDistanceText, customModeDetail, lookAwayDescription, modeFrameRange } from '../src/domain/customModeCopy';
import type { AppRule, AppRuleSnapshot } from '../src/domain/appRules';
const cases: { name: string; run: () => void }[] = [];
const test = (name: string, run: () => void) => cases.push({ name, run });
const schedule: AppRuleSnapshot = { ...defaultRuleDraft(), apps: ['example.social', 'example.video'] };
const limit: AppRuleSnapshot = { ...schedule, kind: 'limit', days: null, startMin: null, endMin: null, limitMinutes: 60 };
test('all 128 weekday masks have exact summaries and special collapses', () => {
  for (let days = 0; days < 128; days++) {
    const expected = days === 0 ? 'Choose at least one day' : days === 127 ? 'Every day' : days === 31 ? 'Mon to Fri' : days === 96 ? 'Weekends'
      : RULE_DAY_NAMES.filter((_, index) => days & (1 << index)).join(', ');
    assert.equal(ruleDaySummary(days), expected);
  }
  assert.equal(ruleDaySummary(21), 'Mon, Wed, Fri');
});
test('durations and titles share hour/minute formatting', () => {
  for (const [minutes, text] of [[65, '1h 5m'], [300, '5h'], [45, '45m'], [0, '0m'], [1440, '24h']] as const) assert.equal(formatRuleDuration(minutes), text);
  assert.equal(ruleTitle(schedule), 'Blocked 9:00 am to 5:00 pm');
  assert.equal(ruleTitle({ ...limit, limitMinutes: 300 }), '5h a day');
  assert.equal(formatRuleDuration(NaN), '0m');
});
test('time formatting covers midnight, noon, five-minute values, and day wrap', () => {
  for (const [minutes, text] of [[0, '12:00 am'], [720, '12:00 pm'], [65, '1:05 am'], [1435, '11:55 pm'], [1440, '12:00 am']] as const) assert.equal(formatRuleTime(minutes), text);
  assert.equal(formatRuleTime(NaN), '12:00 am');
});
test('looser-copy selector detects every requested loosening independently', () => {
  for (const patch of [{ apps: ['example.social'] }, { days: 15 }, { startMin: 600 }, { endMin: 960 }, { enabled: false }]) assert.equal(isLooserChange(schedule, { ...schedule, ...patch }), true);
  assert.equal(isLooserChange(limit, { ...limit, limitMinutes: 120 }), true);
});
test('tighter and unchanged rules do not show the looser helper', () => {
  for (const patch of [{}, { apps: [...schedule.apps, 'example.music'] }, { days: 127 }, { startMin: 480 }, { endMin: 1080 }]) assert.equal(isLooserChange(schedule, { ...schedule, ...patch }), false);
  assert.equal(isLooserChange(limit, { ...limit, limitMinutes: 30 }), false);
  assert.equal(isLooserChange({ ...limit, enabled: false }, { ...limit, enabled: false }), false);
});
test('overnight shortening/extension and shifted windows use start-day coordinates', () => {
  const night = { ...schedule, startMin: 23 * 60, endMin: 60 };
  assert.equal(isLooserChange(night, { ...night, endMin: 30 }), true);
  assert.equal(isLooserChange(night, { ...night, startMin: 23 * 60 + 30 }), true);
  assert.equal(isLooserChange(night, { ...night, endMin: 120 }), false);
  assert.equal(isLooserChange(night, { ...night, startMin: 22 * 60 }), false);
});
test('limit controls use 5/15 minute steps and clamp both boundaries', () => {
  assert.equal(stepRuleLimit(55, 1), 60); assert.equal(stepRuleLimit(60, 1), 75);
  assert.equal(stepRuleLimit(60, -1), 55); assert.equal(stepRuleLimit(75, -1), 60);
  assert.equal(stepRuleLimit(5, -1), 5); assert.equal(stepRuleLimit(1440, 1), 1440);
});
test('usage sums distinct packages, caps progress, rounds remaining time up, and handles missing totals', () => {
  const summary = ruleUsage({ ...limit, limitMinutes: 300 }, { 'example.social': 120 * 60_000, 'example.video': 70 * 60_000 });
  assert.equal(summary.used, '3h 10m used today'); assert.equal(summary.left, '1h 50m left');
  assert.equal(ruleUsage(limit, {}).used, '0m used today');
  assert.equal(ruleUsage(limit, { 'example.social': 3_600_000 }).left, 'Limit reached');
  assert.equal(ruleUsage(limit, { 'example.social': 9_999_999 }).progress, 1);
  assert.equal(ruleUsage(limit, { 'example.social': 3_599_999 }).left, '1m left');
});
test('disabled rule status keeps retired enforcement visible until its exact expiry', () => {
  const now = Date.now(), expiry = new Date(now + 60_000).toISOString();
  const rule: AppRule = { ...schedule, id: 's', enabled: false, retired: [{ snapshot: schedule, enforcedUntil: expiry }], createdAt: expiry, updatedAt: expiry };
  assert.equal(ruleEnabledStatus(rule, now), 'Ends tomorrow');
  assert.equal(ruleEnabledStatus(rule, now + 60_000), 'Off');
  assert.equal(ruleEnabledStatus({ ...rule, enabled: true }, now), 'On');
});
test('look-away copy covers each boundary and always starts with the explanation', () => {
  const prefix = 'How long the camera can lose you before it counts as a distraction. ';
  for (const value of [3, 8, 9, 20, 21, 45, 46, 90]) assert(lookAwayDescription(value).startsWith(prefix));
  assert.equal(lookAwayDescription(8), prefix + 'Even a short look away counts.');
  assert.equal(lookAwayDescription(12), prefix + 'At 12 sec, a quick glance away is fine. Leaving your seat counts.');
  assert.equal(lookAwayDescription(45), prefix + 'At 45 sec, you can step back or look around for a bit.');
  assert.equal(lookAwayDescription(46), prefix + 'At 46 sec, you can be away for a while before it counts.');
});
test('camera distance follows saved frame ranges and the unchanged save threshold', () => {
  assert.equal(cameraDistanceText([15, 40]), 'normal desk distance');
  assert.equal(cameraDistanceText([5, 20]), 'sitting further back');
  assert.equal(cameraDistanceText(modeFrameRange(29)), 'normal desk distance');
  assert.equal(cameraDistanceText(modeFrameRange(30)), 'sitting further back');
  assert.equal(customModeDetail(12, [15, 40]), '12 sec look-away \u00b7 normal desk distance');
});
test('Settings integration and History extraction preserve intended scope', () => {
  const settings = readFileSync('src/screens/SettingsScreen.tsx', 'utf8');
  assert(settings.indexOf('<AppRulesSection') > settings.indexOf('>Flagged apps<'));
  assert(settings.indexOf('<AppRulesSection') < settings.indexOf('>Custom modes<'));
  assert(settings.includes("Platform.OS === 'android' ? <AppRulesSection"));
  assert(!/Grace period|Frame default:|s grace|min grace/.test(settings));
  assert(settings.includes('gracePeriodSeconds') && readFileSync('src/data/settingsRepository.ts', 'utf8').includes('grace_period_seconds'));
  const history = readFileSync('src/screens/HistoryScreen.tsx', 'utf8');
  assert(history.includes('<PaywallSheet') && !history.includes('function CoachPaywallSheet'));
});
let failed = 0;
for (const item of cases) { try { item.run(); console.log('PASS ' + item.name); } catch (error) { failed++; console.error('FAIL ' + item.name, error); } }
console.log((cases.length - failed) + '/' + cases.length + ' app rules UI fixture groups passed');
if (failed) process.exitCode = 1;
