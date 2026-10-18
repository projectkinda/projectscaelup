import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { AppRuleEditorModal } from './AppRuleEditorModal';
import { usePaywall } from './PaywallProvider';
import { RuleAppIcon, RuleIcon, ruleStyles } from './AppRulePrimitives';
import type { AppRule, AppRuleSnapshot } from '../domain/appRules';
import { getInstalledApps, type InstalledApp } from '../domain/appPicker';
import { AppRulesModule, getSelectableRuleApps } from '../domain/appRulesModule';
import { createRule, deleteRule, listRules, syncRulesToNative, updateRule } from '../data/appRulesRepository';
import { ruleAppSummary, ruleSections, ruleDaySummary, ruleEnabledStatus, ruleTitle, ruleUsage } from '../domain/appRulesPresentation';
import { LockdownModule } from '../domain/lockdownModule';
import { UsageTrackingModule } from '../domain/usageTrackingModule';
import { useIsPaidUser } from '../domain/useIsPaidUser';
import { isPaidUser } from '../domain/paywall';
import { typography } from '../theme/typography';
import { colors } from '../theme/tokens';

const INTRO = 'Block apps at set times, or cap how long you can use them each day.';
export function AppRulesSection({ isActive }: { isActive: boolean }) {
  const paid = useIsPaidUser();
  const paywall = usePaywall();
  // TODO: add the iOS Screen Time version when app rules are supported there.
  if (Platform.OS !== 'android') return null;
  return <View testID="app-rules-section" style={ruleStyles.section}>
    <View style={ruleStyles.row}>
      <Text style={[ruleStyles.sectionTitle, ruleStyles.grow]}>App rules</Text>
      {!paid ? <><RuleIcon name="lock"/><View style={styles.proTag}><Text style={ruleStyles.caption}>Pro</Text></View></> : null}
    </View>
    <Text style={ruleStyles.muted}>{INTRO}</Text>
    {paid ? <PaidRulesPanel isActive={isActive}/> : <View style={ruleStyles.card}>
      <Pressable testID="app-rules-locked" accessibilityRole="button" onPress={() => paywall.show('app-rules')} style={styles.newRule}>
        <RuleIcon name="lock"/><Text style={[ruleStyles.body, ruleStyles.grow]}>Schedules and daily limits</Text>
      </Pressable>
    </View>}
  </View>;
}

export function PaidRulesPanel({ isActive }: { isActive: boolean }) {
  const [rules, setRules] = useState<AppRule[]>([]);
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [permissions, setPermissions] = useState({ accessibility: true, overlay: true });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<AppRule | 'new-schedule' | 'new-limit' | null>(null);
  const [appsError, setAppsError] = useState('');
  const [appsLoading, setAppsLoading] = useState(false);
  const appsRequest = useRef(0);
  const request = useRef(0);
  const alive = useRef(true);
  const reloadApps = useCallback(async () => {
    const id = ++appsRequest.current;
    setAppsLoading(true);
    try {
      const installed = await getInstalledApps();
      const eligible = await getSelectableRuleApps(installed);
      if (installed.length && !eligible.length) throw new Error('Empty app list');
      if (alive.current && id === appsRequest.current && isPaidUser()) { setApps(eligible); setAppsError(''); }
    } catch {
      if (alive.current && id === appsRequest.current) setAppsError("Couldn't load your apps. Try again.");
    } finally { if (alive.current && id === appsRequest.current) setAppsLoading(false); }
  }, []);
  const load = useCallback(async (refreshApps = false) => {
    const id = ++request.current;
    try {
      if (!isPaidUser()) return;
      const [next, accessibility, overlay] = await Promise.all([
        listRules(), UsageTrackingModule.isEnabled(), LockdownModule.canDrawOverlays(),
        refreshApps ? reloadApps() : Promise.resolve(),
      ]);
      if (!isPaidUser()) return;
      const todayUsage = await AppRulesModule.getTodayUsage([...new Set(next.filter(rule => rule.kind === 'limit').flatMap(rule => rule.apps))]);
      if (!alive.current || id !== request.current || !isPaidUser()) return;
      setRules(next); setUsage(todayUsage); setPermissions({ accessibility, overlay });
      setError('');
    } catch { if (alive.current && id === request.current) setError("Couldn't load rules. Try again."); }
    finally { if (alive.current && id === request.current) setLoading(false); }
  }, [reloadApps]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current++; appsRequest.current++; }; }, []);
  useEffect(() => {
    if (!isActive) { setEditor(null); return; }
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => { if (timer) clearInterval(timer); timer = undefined; };
    const start = () => { stop(); void load(true); timer = setInterval(() => { void load(); }, 30_000); };
    if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive') start();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') start(); else stop(); });
    return () => { stop(); subscription.remove(); request.current++; };
  }, [isActive, load]);
  const save = async (draft: AppRuleSnapshot) => {
    if (!isPaidUser() || !editor) return false;
    const result = typeof editor === 'string' ? await createRule(draft) : await updateRule(editor.id, draft);
    if (!result.ok) return false;
    await syncRulesToNative();
    if (!alive.current) return true;
    setEditor(null); await load(); return true;
  };
  const remove = async () => {
    if (!isPaidUser() || !editor || typeof editor === 'string') return false;
    const result = await deleteRule(editor.id);
    if (!result.ok) return false;
    await syncRulesToNative();
    if (!alive.current) return true;
    setEditor(null); await load(); return true;
  };
  const allow = (kind: 'accessibility' | 'overlay') => {
    try { if (kind === 'accessibility') UsageTrackingModule.openSettings(); else LockdownModule.openSettings(); }
    catch { setError("Couldn't open Settings. Try again."); }
  };
  const appMap = new Map(apps.map(app => [app.packageName, app]));
  const sections = ruleSections(rules);
  return <>
    <View testID="paid-app-rules">
      {!sections.canAdd ? <Text style={ruleStyles.muted}>Rule limit reached</Text> : null}
      {(['accessibility', 'overlay'] as const).filter(key => !permissions[key]).map(key => <View key={key} testID={'rules-permission-' + key} style={styles.notice}>
        <Text style={[ruleStyles.muted, ruleStyles.grow]}>Rules need {key === 'accessibility' ? 'accessibility' : 'the overlay permission'} to block apps.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={'Allow ' + key} onPress={() => allow(key)} style={styles.allow}><Text style={[ruleStyles.label, ruleStyles.selectedText]}>Allow</Text></Pressable>
      </View>)}
      {loading ? <View style={styles.empty}><ActivityIndicator color={colors.muted} accessibilityLabel="Loading app rules"/></View> : null}
      {(['schedule', 'limit'] as const).map(kind => <View key={kind} style={styles.subsection}>
        <Text style={ruleStyles.caption}>{kind === 'schedule' ? 'Scheduled blocks' : 'Daily limits'}</Text>
        <Text style={ruleStyles.muted}>{kind === 'schedule' ? 'Block chosen apps during set hours.' : 'Cap how long chosen apps can be used each day.'}</Text>
        <View style={ruleStyles.card}>
          {sections[kind].map(rule => {
            const state = ruleEnabledStatus(rule), summary = ruleUsage(rule, usage);
            const status = state !== 'On' ? state : rule.kind === 'limit' ? summary.left : 'On';
            return <Pressable key={rule.id} testID={'app-rule-' + rule.id} accessibilityRole="button" onPress={() => setEditor(rule)}
              accessibilityLabel={'Edit rule. ' + ruleTitle(rule) + '. ' + status + '. ' + (rule.kind === 'schedule' ? ruleDaySummary(rule.days ?? 0) : summary.used)} style={({ pressed }) => [styles.rule, pressed && ruleStyles.dim]}>
              <View style={styles.ruleHeader}>
                <RuleIcon name={rule.kind === 'schedule' ? 'clock' : 'hourglass'}/>
                <Text style={[ruleStyles.body, styles.ruleTitle]}>{ruleTitle(rule)}</Text>
                <Text style={styles.edit}>Edit</Text>
              </View>
              <View style={ruleStyles.row}>
                {rule.apps.slice(0, 3).map(pkg => <RuleAppIcon key={pkg} pkg={pkg} app={appMap.get(pkg)}/>)}
                {rule.apps.length > 3 ? <Text style={ruleStyles.muted}>+{rule.apps.length - 3}</Text> : null}
              </View>
              <Text style={ruleStyles.muted}>{ruleAppSummary(rule.apps, appMap)}</Text>
              <Text style={[ruleStyles.caption, state === 'On' && rule.kind === 'limit' && summary.reached && styles.reached]}>{rule.kind === 'schedule' ? ruleDaySummary(rule.days ?? 0) + ' \u00b7 ' : ''}{status}</Text>
              {rule.kind === 'limit' ? <>
                <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(summary.progress * 100) }} style={styles.track}>
                  <View style={[styles.fill, { width: `${summary.progress * 100}%` }]}/>
                </View>
                <Text style={ruleStyles.caption}>{summary.used}</Text>
              </> : null}
            </Pressable>;
          })}
          {sections.canAdd ? <Pressable testID={'new-app-rule-' + kind} accessibilityRole="button" onPress={() => setEditor(kind === 'schedule' ? 'new-schedule' : 'new-limit')} style={styles.newRule}>
            <RuleIcon name="plus" color={colors.ink}/><Text style={ruleStyles.body}>{kind === 'schedule' ? 'Add scheduled block' : 'Add daily limit'}</Text>
          </Pressable> : null}
        </View>
      </View>)}
      {error ? <Text accessibilityLiveRegion="polite" style={[ruleStyles.error, styles.empty]}>{error}</Text> : null}
    </View>
    {editor ? <AppRuleEditorModal key={typeof editor === 'string' ? editor : editor.id} rule={typeof editor === 'string' ? null : editor}
      initialKind={editor === 'new-limit' ? 'limit' : 'schedule'} apps={apps} appsError={appsError} appsLoading={appsLoading} onReloadApps={reloadApps}
      onCancel={() => setEditor(null)} onSave={save} onDelete={remove}/> : null}
  </>;
}
const styles = StyleSheet.create({
  subsection: { marginTop: 20, gap: 8 },
  edit: { color: colors.ink, ...typography.label, fontWeight: '700', flexShrink: 0 },
  proTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.panelTop },
  newRule: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  rule: { padding: 16, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.panelTop },
  ruleHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  ruleTitle: { flex: 1, minWidth: 0 },
  reached: { color: colors.mutedRust },
  track: { height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: colors.panelTop },
  fill: { height: 4, backgroundColor: colors.rewardAmber },
  notice: { padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.panelTop },
  allow: { minHeight: 44, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  empty: { padding: 16 },
});
