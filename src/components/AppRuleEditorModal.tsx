import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { AppPickerModal } from './AppPickerModal';
import { RuleTimePicker } from './RuleTimePicker';
import { RuleAppIcon, RuleIcon, RuleModalShell, ruleStyles } from './AppRulePrimitives';
import type { InstalledApp } from '../domain/appPicker';
import { validateRule, type AppRule, type AppRuleSnapshot } from '../domain/appRules';
import { ruleAppName, defaultRuleDraft, formatRuleDuration, formatRuleTime, isLooserChange, RULE_DAY_INITIALS, RULE_DAY_NAMES, stepRuleLimit } from '../domain/appRulesPresentation';
import { colors } from '../theme/tokens';

export function AppRuleEditorModal({ rule, apps, installedAppCount, initialKind, appsError, appsLoading, onReloadApps, onCancel, onSave, onDelete }: {
  installedAppCount?: number; initialKind?: AppRuleSnapshot['kind']; appsError?: string; appsLoading?: boolean; onReloadApps?: () => Promise<void>;
  rule: AppRule | null; apps: InstalledApp[]; onCancel: () => void;
  onSave: (draft: AppRuleSnapshot) => Promise<boolean>; onDelete: () => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<AppRuleSnapshot>(() => rule ? { ...rule, apps: [...rule.apps] } : defaultRuleDraft(initialKind));
  const [picker, setPicker] = useState(false);
  const [pickerSelection, setPickerSelection] = useState(draft.apps);
  const [query, setQuery] = useState('');
  const [time, setTime] = useState<'startMin' | 'endMin' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const errors = validateRule(draft);
  const appMap = new Map(apps.map(app => [app.packageName, app]));
  const patch = (update: Partial<AppRuleSnapshot>) => { setDraft(current => ({ ...current, ...update })); setError(''); };
  const changeKind = (kind: 'schedule' | 'limit') => {
    if (rule) return;
    patch(kind === 'schedule' ? { kind, days: 31, startMin: 540, endMin: 1020, limitMinutes: null }
      : { kind, days: null, startMin: null, endMin: null, limitMinutes: 60 });
  };
  const submit = async (remove = false) => {
    if (busy || !remove && errors.length) return;
    setBusy(true); setError('');
    try { const ok = remove ? await onDelete() : await onSave(draft); if (!ok) { setError("Couldn't save. Try again."); if (remove) setConfirmDelete(false); } }
    catch { setError("Couldn't save. Try again."); if (remove) setConfirmDelete(false); }
    finally { setBusy(false); }
  };
  return <>
    <RuleModalShell visible onClose={() => { if (!busy) onCancel(); }} testID="app-rule-editor">
      <Text style={ruleStyles.title}>{rule ? 'Edit rule' : 'New rule'}</Text>
      {!rule ? <View style={styles.segments} accessibilityRole="radiogroup" accessibilityLabel="Rule type">
        {(['schedule', 'limit'] as const).map(kind => <Pressable key={kind} accessibilityRole="radio"
          accessibilityState={{ checked: draft.kind === kind, disabled: !!rule || busy }} disabled={!!rule || busy}
          onPress={() => changeKind(kind)} style={[styles.segment, draft.kind === kind && ruleStyles.selected, !!rule && ruleStyles.dim]}>
          <Text style={[ruleStyles.label, draft.kind === kind && ruleStyles.selectedText]}>{kind === 'schedule' ? 'Schedule' : 'Daily limit'}</Text>
        </Pressable>)}
      </View> : null}
      <View style={ruleStyles.field}>
        <Text style={ruleStyles.label}>Apps</Text>
        <View style={ruleStyles.row}>
          {draft.apps.map(pkg => <Pressable key={pkg} accessibilityRole="button" disabled={busy}
            accessibilityLabel={'Remove ' + ruleAppName(pkg, appMap)} onPress={() => patch({ apps: draft.apps.filter(id => id !== pkg) })}>
            <RuleAppIcon pkg={pkg} app={appMap.get(pkg)}/>
          </Pressable>)}
          <Pressable accessibilityRole="button" accessibilityLabel="Choose rule apps" disabled={busy}
            onPress={() => { setPickerSelection([...draft.apps]); setPicker(true); void onReloadApps?.(); }} style={styles.addApp}><RuleIcon name="plus" color={colors.ink}/></Pressable>
        </View>
        <Text style={ruleStyles.caption}>{draft.apps.length} of 20 apps</Text>
      </View>
      {draft.kind === 'schedule' ? <>
        <View style={styles.segments}>
          {(['startMin', 'endMin'] as const).map(field => <Pressable key={field} accessibilityRole="button" disabled={busy}
            accessibilityLabel={(field === 'startMin' ? 'From ' : 'To ') + formatRuleTime(draft[field] ?? 0)} onPress={() => setTime(field)} style={[ruleStyles.chip, ruleStyles.grow, styles.timeTile]}>
            <Text style={ruleStyles.muted}>{field === 'startMin' ? 'From' : 'To'}</Text>
            <Text style={ruleStyles.body}>{formatRuleTime(draft[field] ?? 0)}</Text>
          </Pressable>)}
        </View>
        {(draft.endMin ?? 0) <= (draft.startMin ?? 0) ? <Text style={ruleStyles.muted}>Ends the next day</Text> : null}
        <View style={ruleStyles.field}>
          <Text style={ruleStyles.label}>Days</Text>
          <View style={styles.days}>
            {RULE_DAY_INITIALS.map((initial, index) => <Pressable key={index} accessibilityRole="checkbox"
              accessibilityLabel={RULE_DAY_NAMES[index]} accessibilityState={{ checked: !!((draft.days ?? 0) & (1 << index)), disabled: busy }}
              disabled={busy} onPress={() => patch({ days: (draft.days ?? 0) ^ (1 << index) })}
              style={[styles.day, (draft.days ?? 0) & (1 << index) ? ruleStyles.selected : undefined]}>
              <Text style={[ruleStyles.label, (draft.days ?? 0) & (1 << index) ? ruleStyles.selectedText : undefined]}>{initial}</Text>
            </Pressable>)}
          </View>
        </View>
      </> : <View style={ruleStyles.field}>
        <Text style={ruleStyles.label}>Daily limit</Text>
        <View style={styles.budgetTile}>
          <Pressable accessibilityRole="button" accessibilityLabel="Decrease daily limit" disabled={busy || draft.limitMinutes === 5}
            onPress={() => patch({ limitMinutes: stepRuleLimit(draft.limitMinutes ?? 60, -1) })} style={[ruleStyles.chip, (busy || draft.limitMinutes === 5) && ruleStyles.dim]}><Text style={ruleStyles.body}>-</Text></Pressable>
          <Text testID="rule-limit-value" style={[ruleStyles.body, styles.budgetValue]}>{formatRuleDuration(draft.limitMinutes ?? 60)}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Increase daily limit" disabled={busy || draft.limitMinutes === 1440}
            onPress={() => patch({ limitMinutes: stepRuleLimit(draft.limitMinutes ?? 60, 1) })} style={[ruleStyles.chip, (busy || draft.limitMinutes === 1440) && ruleStyles.dim]}><Text style={ruleStyles.body}>+</Text></Pressable>
        </View>
        <View style={styles.segments}>
          {[30, 60, 120].map(minutes => <Pressable key={minutes} accessibilityRole="button" accessibilityState={{ selected: draft.limitMinutes === minutes }} disabled={busy}
            onPress={() => patch({ limitMinutes: minutes })} style={[ruleStyles.chip, ruleStyles.grow, draft.limitMinutes === minutes && ruleStyles.selected]}>
            <Text style={ruleStyles.label}>{minutes === 30 ? '30 min' : formatRuleDuration(minutes)}</Text>
          </Pressable>)}
        </View>
      </View>}
      <Text style={ruleStyles.muted}>{draft.kind === 'schedule'
        ? 'Chosen apps show a lock screen until ' + formatRuleTime(draft.endMin ?? 0) + ". There's no way to open them in between."
        : 'When the limit is reached, the apps are blocked until ' + formatRuleTime(0) + '.'}</Text>
      {rule ? <>
        <Pressable accessibilityRole="checkbox" accessibilityLabel="Rule enabled" disabled={busy} accessibilityState={{ checked: draft.enabled }}
          onPress={() => patch({ enabled: !draft.enabled })} style={ruleStyles.row}>
          <Text style={[ruleStyles.body, ruleStyles.grow]}>Rule enabled</Text>
          <View style={[styles.checkbox, draft.enabled && ruleStyles.selected]}>{draft.enabled ? <RuleIcon name="check" color={colors.rewardAmber}/> : null}</View>
        </Pressable>
        {isLooserChange(rule, draft) ? <Text style={ruleStyles.muted}>Looser changes start tomorrow. Your current rule stays on until midnight.</Text> : null}
        <Pressable accessibilityRole="button" onPress={() => setConfirmDelete(true)} disabled={busy} style={styles.deleteAction}><Text style={ruleStyles.error}>Delete rule</Text></Pressable>

      </> : null}
      {errors.map(message => <Text key={message} style={ruleStyles.error}>{message}</Text>)}
      {error ? <Text accessibilityLiveRegion="polite" style={ruleStyles.error}>{error}</Text> : null}
      <View style={ruleStyles.actions}>
        <Pressable accessibilityRole="button" disabled={busy} onPress={onCancel} style={ruleStyles.secondary}><Text style={ruleStyles.body}>Cancel</Text></Pressable>
        <Pressable testID="rule-save" accessibilityRole="button" accessibilityState={{ disabled: busy || errors.length > 0 }}
          disabled={busy || errors.length > 0} onPress={() => submit()} style={[ruleStyles.primary, (busy || errors.length > 0) && ruleStyles.dim]}>
          <Text style={ruleStyles.primaryText}>{busy ? 'Saving...' : 'Save'}</Text>
        </Pressable>
      </View>
    </RuleModalShell>
    {confirmDelete ? <RuleModalShell visible onClose={() => { if (!busy) setConfirmDelete(false); }} testID="rule-delete-confirmation">
          <Text style={ruleStyles.body}>Delete this rule?</Text>
          <Text style={ruleStyles.muted}>It keeps blocking until midnight, then it's gone.</Text>
          <View style={ruleStyles.actions}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => setConfirmDelete(false)} style={ruleStyles.secondary}><Text style={ruleStyles.label}>Keep rule</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => submit(true)} style={ruleStyles.secondary}><Text style={ruleStyles.error}>Delete</Text></Pressable>
          </View>
        </RuleModalShell> : null}
    {picker ? <AppPickerModal visible variant="rule" loadError={appsError} isLoading={appsLoading} onRetry={() => { void onReloadApps?.(); }} apps={apps} installedAppCount={installedAppCount} isSaving={false} query={query} remainingSlots={20}
      selectedAppIdentifiers={pickerSelection} onCancel={() => { setPicker(false); setPickerSelection([]); setQuery(''); }} onChangeQuery={setQuery}
      onSave={() => { patch({ apps: pickerSelection }); setPicker(false); }}
      onToggleApp={app => setPickerSelection(current => current.includes(app.packageName) ? current.filter(pkg => pkg !== app.packageName) : current.length < 20 ? [...current, app.packageName] : current)}
      onToggleAllVisible={visible => setPickerSelection(current => visible.every(app => current.includes(app.packageName))
        ? current.filter(pkg => !visible.some(app => app.packageName === pkg)) : [...new Set([...current, ...visible.map(app => app.packageName)])].slice(0, 20))}/> : null}
    {time ? <RuleTimePicker key={time} value={draft[time] ?? 0} label={time === 'startMin' ? 'From' : 'To'} onCancel={() => setTime(null)} onSave={minutes => { patch({ [time]: minutes }); setTime(null); }}/> : null}
  </>;
}
const styles = StyleSheet.create({
  segments: { flexDirection: 'row', gap: 8 },
  segment: { flex: 1, minWidth: 0, minHeight: 46, padding: 10, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.panelTop, alignItems: 'center', justifyContent: 'center' },
  addApp: { minWidth: 44, minHeight: 44, borderRadius: 10, backgroundColor: colors.panelBottom, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.panelTop, alignItems: 'center', justifyContent: 'center' },
  timeTile: { alignItems: 'flex-start', gap: 6, paddingVertical: 12 },
  days: { flexDirection: 'row', gap: 5 },
  day: { flex: 1, minWidth: 0, minHeight: 44, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.panelTop, alignItems: 'center', justifyContent: 'center' },
  budgetTile: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.panelBottom, padding: 10, borderRadius: 12 },
  budgetValue: { flex: 1, minWidth: 0, textAlign: 'center' },
  checkbox: { width: 32, height: 32, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.panelTop, alignItems: 'center', justifyContent: 'center' },
  deleteAction: { minHeight: 44, justifyContent: 'center' },
});
