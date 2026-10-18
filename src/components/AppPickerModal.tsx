import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './AppText';
import { AppPickerList, SelectionMark, filterAppsForPicker } from './AppPickerList';
import type { InstalledApp } from '../domain/appPicker';
import { appCapPromptAction } from '../domain/paywall';
import { colors } from '../theme/tokens';
import { typography } from '../theme/typography';
export function AppPickerModal({
  apps,
  isSaving,
  query,
  remainingSlots,
  selectedAppIdentifiers,
  visible,
  onCancel,
  onChangeQuery,
  onSave,
  onToggleAllVisible,
  onToggleApp,
  variant = 'default', loadError, isLoading, onRetry, freeAppLimit, onUpgrade,
}: {
  variant?: 'default' | 'rule';
  freeAppLimit?: { cap: number; savedCount: number }; onUpgrade?: () => void;
  loadError?: string; isLoading?: boolean; onRetry?: () => void;
  apps: InstalledApp[];
  isSaving: boolean;
  query: string;
  remainingSlots: number;
  selectedAppIdentifiers: string[];
  visible: boolean;
  onCancel: () => void;
  onChangeQuery: (value: string) => void;
  onSave: () => void;
  onToggleAllVisible: (apps: InstalledApp[]) => void;
  onToggleApp: (app: InstalledApp) => void;
}) {
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const insets = useSafeAreaInsets();
  const promptShown = useRef(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    promptShown.current = false; setFlashing(false);
    return () => { if (flashTimer.current) clearTimeout(flashTimer.current); };
  }, [visible]);
  const showFreeLimit = Platform.OS === 'android' && variant === 'default' && !!freeAppLimit;
  const full = showFreeLimit && freeAppLimit.savedCount + selectedAppIdentifiers.length >= freeAppLimit.cap;
  const upgrade = () => { promptShown.current = true; onUpgrade?.(); };
  const capAttempt = () => {
    if (!showFreeLimit) return;
    if (appCapPromptAction(promptShown.current) === 'sheet') upgrade();
    else {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      setFlashing(true); flashTimer.current = setTimeout(() => setFlashing(false), 500);
    }
  };
  const selectedAppSet = new Set(selectedAppIdentifiers);
  const selectedCount = selectedAppIdentifiers.length;
  const visibleApps = variant === 'rule' && isSearchVisible ? filterAppsForPicker(apps, query) : apps;
  const allVisibleSelected =
    visibleApps.length > 0 && visibleApps.every(app => selectedAppSet.has(app.packageName));

  const addButton = (<Pressable
            accessibilityRole="button"
            accessibilityLabel="Add selected apps"
            disabled={selectedCount === 0 || isSaving}
            onPress={onSave}
            style={({ pressed }) => [
              styles.appPickerAddButton,
              showFreeLimit && styles.freeAddButton,
              showFreeLimit && (selectedCount === 0 || isSaving) && styles.pressed,
              pressed && styles.pressed,
            ]}
          >
            {isSaving ? (
              <ActivityIndicator color={showFreeLimit ? colors.module : colors.ink} />
            ) : (
              <Text
                style={[
                  styles.appPickerAddText,
                  showFreeLimit && styles.freeAddText,
                  !showFreeLimit && selectedCount > 0 && styles.appPickerAddTextReady,
                ]}
              >
                Add
              </Text>
            )}
          </Pressable>);

  return (
    <Modal
      animationType="slide"
      visible={visible}
      onRequestClose={onCancel}
    >
      <View
        style={[
          styles.appPickerScreen,
          variant === 'rule' && styles.ruleScreen,
          { paddingTop: insets.top + 22, paddingBottom: insets.bottom },
        ]}
      >
        <View style={styles.appPickerHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={allVisibleSelected ? 'Clear all' : 'Select all'}
            onPress={() => onToggleAllVisible(visibleApps)}
            style={({ pressed }) => [
              styles.selectAllButton,
              pressed && styles.pressed,
            ]}
          >
            <SelectionMark selected={allVisibleSelected} />
            <Text style={styles.selectAllText}>All</Text>
          </Pressable>
          <Text style={[styles.appPickerTitle, variant === 'rule' && styles.ruleTitle]}>Add apps</Text>
          {!showFreeLimit ? addButton : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search apps"
            onPress={() => setIsSearchVisible(current => !current)}
            style={({ pressed }) => [
              styles.appPickerSearchButton,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.searchLens} />
            <View style={styles.searchHandle} />
          </Pressable>
        </View>

        <Text style={styles.appPickerSectionLabel}>Add apps from phone</Text>
        {variant === 'rule' && isLoading ? <ActivityIndicator color={colors.muted} accessibilityLabel="Loading apps"/> : null}
        {variant === 'rule' && loadError ? <View accessibilityLiveRegion="polite">
          <Text style={styles.ruleCancelText}>{loadError}</Text>
          <Pressable accessibilityRole="button" disabled={isLoading} onPress={onRetry} style={styles.ruleCancel}><Text style={styles.ruleCancelText}>Retry</Text></Pressable>
        </View> : null}
        <AppPickerList
          apps={apps}
          selectedIds={selectedAppIdentifiers}
          onToggle={packageName => {
            const app = apps.find(item => item.packageName === packageName);
            if (app) {
              onToggleApp(app);
            }
          }}
          maxSelectable={remainingSlots}
          onDisabledPress={showFreeLimit ? capAttempt : undefined}
          query={isSearchVisible ? query : ''}
          onChangeQuery={onChangeQuery}
          showSearch={isSearchVisible}
        />
        {showFreeLimit ? <View style={styles.freeFooter}>
          <View testID="free-app-cap-banner" accessibilityLiveRegion="polite" style={[styles.freeCounter, flashing && styles.capFlash]}>
            <Text style={styles.freeCountText}>{Math.min(freeAppLimit.cap, freeAppLimit.savedCount + selectedCount)} of {freeAppLimit.cap} free apps{full ? ' picked' : ''}</Text>
            {full ? <Pressable accessibilityRole="button" onPress={upgrade} style={styles.upgradeAction}><Text style={styles.upgradeText}>Get unlimited</Text></Pressable> : null}
          </View>
          {addButton}
        </View> : null}
        {variant === 'rule' ? <Pressable accessibilityRole="button" onPress={onCancel} style={styles.ruleCancel}><Text style={styles.ruleCancelText}>Cancel</Text></Pressable> : null}
      </View>
    </Modal>
  );
}


const styles = StyleSheet.create({
  freeFooter: { paddingBottom: 12, gap: 8 },
  freeCounter: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent', minHeight: 44 },
  freeCountText: { flex: 1, minWidth: 0, color: colors.muted, ...typography.label },
  upgradeAction: { minHeight: 44, justifyContent: 'center', flexShrink: 0 },
  upgradeText: { color: colors.rewardAmber, ...typography.label, fontWeight: '600' },
  capFlash: { borderColor: colors.rewardAmber, backgroundColor: colors.goalSurface },
  freeAddButton: { minHeight: 48, alignItems: 'center', borderRadius: 12, backgroundColor: colors.ink },
  freeAddText: { color: colors.module, ...typography.body, fontWeight: '600' },
  appPickerScreen: {
    flex: 1,
    backgroundColor: '#000000',
    paddingHorizontal: 24,
  },
  appPickerHeader: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  selectAllButton: {
    width: 54,
    alignItems: 'center',
    paddingTop: 2,
  },
  selectAllText: {
    marginTop: 5,
    color: colors.ink,
    ...typography.caption,
  },
  appPickerTitle: {
    flex: 1,
    color: colors.ink,
    ...typography.title,
    fontWeight: '800',
  },
  appPickerAddButton: {
    minWidth: 54,
    minHeight: 42,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  appPickerAddText: {
    color: 'rgba(255, 255, 255, 0.36)',
    ...typography.stat,
    fontWeight: '800',
  },
  appPickerAddTextReady: {
    color: colors.ink,
  },
  appPickerSearchButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  searchLens: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.ink,
  },
  searchHandle: {
    position: 'absolute',
    width: 13,
    height: 3,
    right: 5,
    bottom: 8,
    borderRadius: 2,
    backgroundColor: colors.ink,
    transform: [{ rotate: '45deg' }],
  },
  appPickerSectionLabel: {
    marginTop: 28,
    marginBottom: 14,
    color: 'rgba(255, 255, 255, 0.62)',
    ...typography.body,
    fontWeight: '700',
  },
  pressed: { opacity: 0.55 },
  ruleScreen: { backgroundColor: colors.module, paddingHorizontal: 16 },
  ruleTitle: { ...typography.heading, fontWeight: '600' },
  ruleCancel: { minHeight: 48, marginVertical: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.panelTop },
  ruleCancelText: { color: colors.ink, ...typography.body },
});
