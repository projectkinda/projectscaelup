/** Calendar-local rule logic; no database, native, or entitlement dependencies. */
export const RULE_LIMITS = { rules: 10, apps: 20, minimumLimitMinutes: 5, maximumLimitMinutes: 1440, minimumScheduleMinutes: 15 } as const;
// Mirrored in Kotlin AppRuleDenylist; fixture checks keep these identical.
export const APP_RULE_DENYLIST = [
  'com.projectscaleup.app', 'com.android.systemui', 'com.android.settings',
  'com.android.phone', 'com.android.server.telecom', 'com.android.dialer',
  'com.google.android.dialer', 'com.samsung.android.dialer', 'com.samsung.android.incallui',
  'com.android.emergency', 'com.google.android.apps.safetyhub',
  'com.sec.android.app.launcher', 'com.android.launcher', 'com.android.launcher3',
  'com.google.android.apps.nexuslauncher',
] as const;
export function isRulePackageAllowed(pkg: string, excludedPackages: readonly string[] = []): boolean {
  const normalized = pkg.toLowerCase();
  return /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/.test(pkg) &&
    !(APP_RULE_DENYLIST as readonly string[]).includes(normalized) &&
    !excludedPackages.includes(pkg) && !normalized.includes('inputmethod') &&
    !normalized.includes('keyboard') && !normalized.includes('emergency');
}
export type AppRuleSnapshot = {
  kind: 'schedule' | 'limit'; apps: string[]; days: number | null;
  startMin: number | null; endMin: number | null; limitMinutes: number | null;
  enabled: boolean;
};
export type RetiredRule = { snapshot: AppRuleSnapshot; enforcedUntil: string };
export type AppRule = AppRuleSnapshot & {
  id: string; retired: RetiredRule[]; createdAt: string; updatedAt: string;
  // Tombstones are stored separately in app_state, keeping retired_json snapshots-only.
  deleted?: boolean;
};
export type EnforcedRuleVersion = AppRuleSnapshot & { ruleId: string; enforcedUntilMs?: number };
export function nextLocalMidnight(now: Date | number): Date {
  const date = new Date(now);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}
export function ruleSnapshot(rule: AppRuleSnapshot): AppRuleSnapshot {
  return { kind: rule.kind, apps: [...rule.apps], days: rule.days, startMin: rule.startMin,
    endMin: rule.endMin, limitMinutes: rule.limitMinutes, enabled: rule.enabled };
}
export function enforcedVersions(rule: AppRule, now: Date | number): EnforcedRuleVersion[] {
  const nowMs = new Date(now).getTime();
  const current = rule.enabled && !rule.deleted ? [{ ...ruleSnapshot(rule), ruleId: rule.id }] : [];
  return [...current, ...rule.retired.filter(item => item.snapshot.enabled && Date.parse(item.enforcedUntil) > nowMs)
    .map(item => ({ ...ruleSnapshot(item.snapshot), ruleId: rule.id, enforcedUntilMs: Date.parse(item.enforcedUntil) }))];
}
export function retireRule(rule: AppRule, next: AppRuleSnapshot, now: Date, deleted = false): AppRule {
  return { ...rule, ...ruleSnapshot(next), deleted,
    retired: [...rule.retired.filter(item => Date.parse(item.enforcedUntil) > now.getTime()),
      { snapshot: ruleSnapshot(rule), enforcedUntil: nextLocalMidnight(now).toISOString() }],
    updatedAt: now.toISOString() };
}
export function validateRule(rule: AppRuleSnapshot, excludedPackages: readonly string[] = []): string[] {
  const errors: string[] = [];
  if (!['schedule', 'limit'].includes(rule.kind)) errors.push('Unknown rule kind.');
  if (typeof rule.enabled !== 'boolean') errors.push('Enabled must be a boolean.');
  if (!Array.isArray(rule.apps) || rule.apps.length < 1 || rule.apps.length > RULE_LIMITS.apps ||
    new Set(rule.apps).size !== rule.apps.length || rule.apps.some(pkg => typeof pkg !== 'string' || !isRulePackageAllowed(pkg, excludedPackages)))
    errors.push('Choose 1 to 20 distinct eligible apps.');
  if (rule.kind === 'limit' && (!Number.isInteger(rule.limitMinutes) || rule.limitMinutes! < 5 || rule.limitMinutes! > 1440))
    errors.push('Daily limits must be 5 to 1440 minutes.');
  if (rule.kind === 'schedule') {
    if (!Number.isInteger(rule.days) || rule.days! < 1 || rule.days! > 127) errors.push('Choose at least one weekday.');
    const validMinutes = (value: number | null) => Number.isInteger(value) && value! >= 0 && value! < 1440;
    if (!validMinutes(rule.startMin) || !validMinutes(rule.endMin)) errors.push('Schedule times must be valid local minutes.');
    else {
      const duration = (rule.endMin! - rule.startMin! + 1440) % 1440 || 1440;
      if (duration < 15) errors.push('Schedule windows must be at least 15 minutes.');
    }
  }
  return errors;
}
/** Used for fixtures and previews; a crossing window belongs to its start weekday. */
export function scheduleWindowAt(rule: AppRuleSnapshot, now: Date): { start: Date; end: Date } | null {
  if (rule.kind !== 'schedule' || rule.startMin == null || rule.endMin == null || rule.days == null) return null;
  for (const offset of [0, -1]) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const bit = 1 << ((day.getDay() + 6) % 7);
    if (!(rule.days & bit)) continue;
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(rule.startMin / 60), rule.startMin % 60);
    const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + (rule.endMin <= rule.startMin ? 1 : 0), Math.floor(rule.endMin / 60), rule.endMin % 60);
    if (now >= start && now < end) return { start, end };
  }
  return null;
}
