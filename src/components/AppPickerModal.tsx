import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './AppText';
import { AppPickerList, SelectionMark, filterAppsForPicker } from './AppPickerList';
import type { InstalledApp } from '../domain/appPicker';
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
  variant = 'default',
}: {
  variant?: 'default' | 'rule';
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
  const selectedAppSet = new Set(selectedAppIdentifiers);
  const selectedCount = selectedAppIdentifiers.length;
  const visibleApps = variant === 'rule' && isSearchVisible ? filterAppsForPicker(apps, query) : apps;
  const allVisibleSelected =
    visibleApps.length > 0 && visibleApps.every(app => selectedAppSet.has(app.packageName));

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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add selected apps"
            disabled={selectedCount === 0 || isSaving}
            onPress={onSave}
            style={({ pressed }) => [
              styles.appPickerAddButton,
              pressed && styles.pressed,
            ]}
          >
            {isSaving ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <Text
                style={[
                  styles.appPickerAddText,
                  selectedCount > 0 && styles.appPickerAddTextReady,
                ]}
              >
                Add
              </Text>
            )}
          </Pressable>
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
          query={isSearchVisible ? query : ''}
          onChangeQuery={onChangeQuery}
          showSearch={isSearchVisible}
        />
        {variant === 'rule' ? <Pressable accessibilityRole="button" onPress={onCancel} style={styles.ruleCancel}><Text style={styles.ruleCancelText}>Cancel</Text></Pressable> : null}
      </View>
    </Modal>
  );
}


const styles = StyleSheet.create({
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
