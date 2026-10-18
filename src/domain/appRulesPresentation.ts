import type { AppRule, AppRuleSnapshot } from './appRules';
export const RULE_DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const RULE_DAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
export function formatRuleDuration(minutes: number): string {
  const value = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0;
  const hours = Math.floor(value / 60), rest = value % 60;
  return hours ? hours + 'h' + (rest ? ' ' + rest + 'm' : '') : rest + 'm';
}
export function formatRuleTime(minutes: number): string {
  const value = (((Number.isFinite(minutes) ? Math.floor(minutes) : 0) % 1440) + 1440) % 1440;
  const hours = Math.floor(value / 60);
  return (hours % 12 || 12) + ':' + String(value % 60).padStart(2, '0') + (hours < 12 ? ' am' : ' pm');
}
export function ruleDaySummary(days: number): string {
  if (days === 127) return 'Every day';
  if (days === 31) return 'Mon to Fri';
  if (days === 96) return 'Weekends';
  return RULE_DAY_NAMES.filter((_, index) => days & (1 << index)).join(', ') || 'Choose at least one day';
}
export function ruleTitle(rule: AppRuleSnapshot): string {
  return rule.kind === 'schedule' ? 'Blocked ' + formatRuleTime(rule.startMin ?? 0) + ' to ' + formatRuleTime(rule.endMin ?? 0)
    : formatRuleDuration(rule.limitMinutes ?? 0) + ' a day';
}
/** Copy hint only. Enforcement always remains the engine's union of versions. */
export function isLooserChange(old: AppRuleSnapshot, next: AppRuleSnapshot): boolean {
  if (old.enabled && !next.enabled || old.apps.some(pkg => !next.apps.includes(pkg)) || old.kind !== next.kind) return true;
  if (old.kind === 'limit') return (next.limitMinutes ?? 0) > (old.limitMinutes ?? 0);
  if (((old.days ?? 0) & ~(next.days ?? 0)) !== 0) return true;
  const end = (rule: AppRuleSnapshot) => (rule.endMin ?? 0) + ((rule.endMin ?? 0) <= (rule.startMin ?? 0) ? 1440 : 0);
  return (next.startMin ?? 0) > (old.startMin ?? 0) || end(next) < end(old);
}
export function stepRuleLimit(value: number, direction: -1 | 1): number {
  if (direction > 0) return Math.min(1440, value < 60 ? Math.min(60, value + 5) : value + 15);
  return Math.max(5, value > 60 ? Math.max(60, value - 15) : value - 5);
}
export function ruleUsage(rule: AppRuleSnapshot, usage: Record<string, number>) {
  const usedMs = [...new Set(rule.apps)].reduce((total, pkg) => total + Math.max(0, Number.isFinite(usage[pkg]) ? usage[pkg] : 0), 0);
  const budgetMs = Math.max(1, (rule.limitMinutes ?? 0) * 60_000);
  return { usedMs, reached: usedMs >= budgetMs, progress: Math.min(1, usedMs / budgetMs),
    used: formatRuleDuration(Math.floor(usedMs / 60_000)) + ' used today',
    left: usedMs >= budgetMs ? 'Reached, back at ' + formatRuleTime(0) : formatRuleDuration(Math.ceil((budgetMs - usedMs) / 60_000)) + ' left' };
}
export function ruleEnabledStatus(rule: AppRule, now = Date.now()): 'On' | 'Off' | 'Ends tomorrow' {
  if (rule.enabled) return 'On';
  return rule.retired.some(item => item.snapshot.enabled && Date.parse(item.enforcedUntil) > now) ? 'Ends tomorrow' : 'Off';
}
export function defaultRuleDraft(kind: AppRuleSnapshot['kind'] = 'schedule'): AppRuleSnapshot {
  if (kind === 'limit') return { kind, apps: [], days: null, startMin: null, endMin: null, limitMinutes: 60, enabled: true };
  return { kind: 'schedule', apps: [], days: 31, startMin: 9 * 60, endMin: 17 * 60, limitMinutes: null, enabled: true };
}

/** Installed names first; a removed app still has a readable name. */
export function ruleAppName(pkg: string, apps: ReadonlyMap<string, { displayName: string }>): string {
  return apps.get(pkg)?.displayName || (pkg.split('.').pop() || 'App').replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, char => char.toUpperCase());
}
export function ruleAppSummary(packages: readonly string[], apps: ReadonlyMap<string, { displayName: string }>): string {
  const names = [...new Set(packages)].map(pkg => ruleAppName(pkg, apps));
  return names.length > 2 ? names[0] + ' +' + (names.length - 1) : names.join(', ');
}
export function ruleSections(rules: readonly AppRule[]) {
  return { schedule: rules.filter(rule => rule.kind === 'schedule'), limit: rules.filter(rule => rule.kind === 'limit'), canAdd: rules.length < 10 };
}
