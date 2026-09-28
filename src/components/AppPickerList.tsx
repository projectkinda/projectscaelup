import {
  Image,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
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
  style,
}: AppPickerListProps) {
  const selectedIdSet = new Set(selectedIds);
  const canSelectMore =
    maxSelectable === undefined || selectedIds.length < maxSelectable;
  const orderedApps = orderAppsForPicker(apps, preCheckedIds);
  const visibleApps = filterAppsForPicker(orderedApps, query);

  return (
    <View style={[styles.container, style]}>
      <View style={styles.listShell}>
        <ScrollView
          bounces={false}
          showsVerticalScrollIndicator
          contentContainerStyle={styles.list}
        >
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

      {showSearch ? (
        <View style={styles.searchWrap}>
          <View style={styles.searchLens} />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={searchPlaceholder}
            placeholderTextColor="rgba(255, 255, 255, 0.42)"
            value={query}
            onChangeText={onChangeQuery}
            style={styles.search}
          />
        </View>
      ) : null}
    </View>
  );
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
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
  },
  appName: {
    flex: 1,
    minWidth: 0,
    color: colors.ink,
    fontSize: 21,
    lineHeight: 28,
  },
  empty: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  searchWrap: {
    minHeight: 50,
    marginTop: 12,
    borderRadius: 25,
    backgroundColor: '#2d2d2d',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: 12,
  },
  searchLens: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: colors.ink,
  },
  search: {
    flex: 1,
    minHeight: 50,
    color: colors.ink,
    fontSize: 18,
    lineHeight: 24,
  },
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
