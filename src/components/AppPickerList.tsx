import Svg, { Path } from 'react-native-svg';
import { typography } from '../theme/typography';
import { Text, TextInput } from './AppText';
import {
  Image,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import type { InstalledApp } from '../domain/appPicker';
import { colors } from '../theme/tokens';

export type AppPickerListProps = {
  apps: InstalledApp[];
  selectedIds: string[];
  onToggle: (packageName: string) => void;
  maxSelectable?: number;
  preCheckedIds?: string[];
  query: string;
  onChangeQuery: (value: string) => void;
  onDisabledPress?: () => void;
  emptyText?: string;
  searchPlaceholder?: string;
  showSearch?: boolean;
  onToggleAllVisible?: (apps: InstalledApp[]) => void;
  style?: StyleProp<ViewStyle>;
};

export function orderAppsForPicker(
  apps: InstalledApp[],
  preCheckedIds: string[] = [],
) {
  const priority = new Map(
    preCheckedIds.map((packageName, index) => [packageName, index]),
  );

  return [...apps].sort((a, b) => {
    const aPriority = priority.get(a.packageName);
    const bPriority = priority.get(b.packageName);

    if (aPriority !== undefined || bPriority !== undefined) {
      if (aPriority === undefined) {
        return 1;
      }
      if (bPriority === undefined) {
        return -1;
      }
      return aPriority - bPriority;
    }

    return a.displayName.localeCompare(b.displayName);
  });
}

export function filterAppsForPicker(apps: InstalledApp[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return apps;
  }

  return apps.filter(app =>
    app.displayName.toLowerCase().includes(normalizedQuery),
  );
}

export function AppPickerList({
  apps,
  selectedIds,
  onToggle,
  maxSelectable,
  preCheckedIds = [],
  query,
  onChangeQuery,
  onDisabledPress,
  emptyText = 'No apps found.',
  searchPlaceholder = 'Search',
  showSearch = true,
  onToggleAllVisible,
  style,
}: AppPickerListProps) {
  const selectedIdSet = new Set(selectedIds);
  const canSelectMore =
    maxSelectable === undefined || selectedIds.length < maxSelectable;
  const orderedApps = orderAppsForPicker(apps, preCheckedIds);
  const visibleApps = filterAppsForPicker(orderedApps, query);
  const allVisibleSelected = visibleApps.length > 0 && (visibleApps.every(app => selectedIdSet.has(app.packageName)) || (!canSelectMore && visibleApps.some(app => selectedIdSet.has(app.packageName))));

  return (
    <View style={[styles.container, style]}>
      {showSearch ? <AppSearchField query={query} onChangeQuery={onChangeQuery} placeholder={searchPlaceholder} /> : null}
      <View style={styles.listShell}>
        <ScrollView
          testID="app-picker-scroll"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          bounces={false}
          showsVerticalScrollIndicator
          contentContainerStyle={styles.list}
        >
          {onToggleAllVisible ? <View testID="app-picker-list-header" style={styles.listHeader}>
            <Text style={styles.listLabel}>Apps</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={allVisibleSelected ? 'Clear' : 'Select all'}
              disabled={visibleApps.length === 0} onPress={() => onToggleAllVisible(allVisibleSelected ? visibleApps.filter(app => selectedIdSet.has(app.packageName)) : visibleApps)} style={styles.selectAll}>
              <Text style={styles.listAction}>{allVisibleSelected ? 'Clear' : 'Select all'}</Text>
            </Pressable>
          </View> : null}
          {visibleApps.map(app => {
            const selected = selectedIdSet.has(app.packageName);
            const disabled = !selected && !canSelectMore;

            return (
              <Pressable
                key={app.packageName}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected, disabled }}
                accessibilityLabel={app.displayName}
                onPress={() => {
                  if (disabled) {
                    onDisabledPress?.();
                    return;
                  }
                  onToggle(app.packageName);
                }}
                style={({ pressed }) => [
                  styles.row,
                  pressed && styles.pressed,
                  disabled && styles.rowDisabled,
                ]}
              >
                <SelectionMark selected={selected} />
                {app.iconBase64 ? (
                  <Image
                    source={{ uri: `data:image/png;base64,${app.iconBase64}` }}
                    style={styles.icon}
                  />
                ) : (
                  <View style={styles.iconPlaceholder}>
                    <Text style={styles.iconPlaceholderText}>
                      {app.displayName.trim()[0]?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                )}
                <Text style={styles.appName} numberOfLines={1}>
                  {app.displayName}
                </Text>
              </Pressable>
            );
          })}
          {visibleApps.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{emptyText}</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>


    </View>
  );
}

export function AppSearchField({ query, onChangeQuery, placeholder = 'Search' }: { query: string; onChangeQuery: (value: string) => void; placeholder?: string }) {
  return <View testID="app-picker-search" style={styles.searchWrap}>
    <Svg width={24} height={24} viewBox="0 0 24 24" accessible={false}>
      <Path d="M19 19l-4-4 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0" fill="none" stroke={colors.ink} strokeWidth={2} strokeLinecap="round" />
    </Svg>
    <TextInput accessibilityLabel="Search apps" autoFocus={false} autoCapitalize="none" autoCorrect={false}
      placeholder={placeholder} placeholderTextColor={colors.muted} value={query} onChangeText={onChangeQuery} style={styles.search} />
    {query.length > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => onChangeQuery('')} style={styles.clearSearch}>
      <Svg width={20} height={20} viewBox="0 0 24 24" accessible={false}>
        <Path d="M6 6l12 12M18 6L6 18" fill="none" stroke={colors.ink} strokeWidth={2} strokeLinecap="round" />
      </Svg>
    </Pressable> : null}
  </View>;
}

export function SelectionMark({ selected }: { selected: boolean }) {
  return (
    <View
      style={[
        styles.selectionCircle,
        selected && styles.selectionCircleSelected,
      ]}
    >
      {selected ? <View style={styles.selectionCheck} /> : null}
    </View>
  );
}

const CARD_BORDER = 'rgba(255, 255, 255, 0.12)';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
  },
  listShell: {
    flex: 1,
    minHeight: 0,
    borderRadius: 26,
    backgroundColor: '#111111',
    overflow: 'hidden',
  },
  list: {
    paddingVertical: 16,
  },
  row: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingLeft: 16,
    paddingRight: 26,
  },
  rowDisabled: {
    opacity: 0.45,
  },
  icon: {
    width: 46,
    height: 46,
    borderRadius: 12,
  },
  iconPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.module,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  iconPlaceholderText: {
    color: colors.ink,
    ...typography.body,
    fontWeight: '800',
  },
  appName: {
    flex: 1,
    minWidth: 0,
    color: colors.ink,
    ...typography.stat,
  },
  empty: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.muted,
    ...typography.caption,
  },
  searchWrap: { height: 48, flexShrink: 0, borderRadius: 24, backgroundColor: colors.panelTop, flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 4, marginBottom: 16, gap: 8 },
  search: { flex: 1, minWidth: 0, paddingVertical: 0, color: colors.ink, ...typography.body },
  clearSearch: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  listLabel: { ...typography.label, color: colors.muted },
  selectAll: { minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' },
  listAction: { ...typography.label, color: colors.ink },
  selectionCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#6f6f7b',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionCircleSelected: {
    borderColor: colors.ink,
    backgroundColor: colors.ink,
  },
  selectionCheck: {
    width: 11,
    height: 6,
    marginTop: -1,
    borderLeftWidth: 2.5,
    borderBottomWidth: 2.5,
    borderColor: '#111111',
    transform: [{ rotate: '-45deg' }],
  },
  pressed: {
    opacity: 0.82,
  },
});
