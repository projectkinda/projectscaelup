import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppPickerList,
  orderAppsForPicker,
} from '../../components/AppPickerList';
import {
  FREE_TIER_APP_CAP,
  canAddAnotherFlaggedApp,
  loadSettingsData,
  removeFlaggedApp,
  saveFlaggedApp,
} from '../../data/settingsRepository';
import { getInstalledApps, type InstalledApp } from '../../domain/appPicker';
import { isPaidUser } from '../../domain/paywall';
import { colors, layout } from '../../theme/tokens';
import { BackButton } from './DoneStep';
import { PrimaryBar } from './WelcomeStep';

const DEFAULT_APP_IDS = [
  'com.instagram.android',
  'com.snapchat.android',
  'com.zhiliaoapp.musically',
];

type AppsStepProps = {
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  onBack: () => void;
  onContinue: () => void;
};

export function AppsStep({
  selectedIds,
  onSelectedIdsChange,
  onBack,
  onContinue,
}: AppsStepProps) {
  const insets = useSafeAreaInsets();
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const didInitializeSelectionRef = useRef(false);
  const paidUser = isPaidUser();
  const maxSelectable = paidUser ? undefined : FREE_TIER_APP_CAP;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const [installedApps, settingsData] = await Promise.all([
          getInstalledApps(),
          loadSettingsData({ isPaidUser: paidUser }),
        ]);

        if (cancelled) {
          return;
        }

        const installedIds = new Set(
          installedApps.map(app => app.packageName),
        );
        const currentSavedIds = settingsData.flaggedApps
          .map(app => app.appIdentifier)
          .filter(packageName => installedIds.has(packageName));
        const defaultIds = DEFAULT_APP_IDS.filter(packageName =>
          installedIds.has(packageName),
        );

        setApps(installedApps);
        setSavedIds(currentSavedIds);
        if (!didInitializeSelectionRef.current) {
          didInitializeSelectionRef.current = true;
          onSelectedIdsChange(
            selectedIds.length > 0
              ? selectedIds
              : currentSavedIds.length > 0
                ? currentSavedIds
                : defaultIds,
          );
        }
      } catch (error) {
        console.warn('Failed to load onboarding apps:', error);
        Alert.alert('Unable to load apps', 'Try again in a moment.');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [onSelectedIdsChange, paidUser]);

  const preCheckedIds = useMemo(
    () => DEFAULT_APP_IDS.filter(packageName =>
      apps.some(app => app.packageName === packageName),
    ),
    [apps],
  );
  const orderedApps = useMemo(
    () => orderAppsForPicker(apps, preCheckedIds),
    [apps, preCheckedIds],
  );

  const toggleApp = (packageName: string) => {
    setHint(null);
    onSelectedIdsChange(
      selectedIds.includes(packageName)
        ? selectedIds.filter(id => id !== packageName)
        : [...selectedIds, packageName],
    );
  };

  const continueWithSelection = async () => {
    if (selectedIds.length === 0 || isSaving) {
      return;
    }

    const selectedIdSet = new Set(selectedIds);
    const savedIdSet = new Set(savedIds);
    setIsSaving(true);
    try {
      for (const savedId of savedIds) {
        if (!selectedIdSet.has(savedId)) {
          await removeFlaggedApp(savedId);
        }
      }

      for (const app of apps) {
        if (!selectedIdSet.has(app.packageName) || savedIdSet.has(app.packageName)) {
          continue;
        }

        const canAdd = await canAddAnotherFlaggedApp(paidUser);
        if (!canAdd) {
          break;
        }

        await saveFlaggedApp({
          appIdentifier: app.packageName,
          displayName: app.displayName,
          iconBase64: app.iconBase64,
        });
      }
      setSavedIds(selectedIds);
      onContinue();
    } catch (error) {
      console.warn('Failed to save onboarding apps:', error);
      Alert.alert('Unable to save apps', 'Try again in a moment.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + 26,
            paddingBottom: insets.bottom + 112,
          },
        ]}
      >
        <BackButton onPress={onBack} />
        <Text style={styles.title}>Pick up to 3 apps</Text>
        <Text style={styles.subtitle}>
          The ones that pull you away most. You can change this any time in
          Settings.
        </Text>

        {hint ? (
          <Text accessibilityLiveRegion="polite" style={styles.hint}>
            {hint}
          </Text>
        ) : null}

        <View style={styles.pickerWrap}>
          {isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.ink} />
            </View>
          ) : (
            <AppPickerList
              apps={orderedApps}
              selectedIds={selectedIds}
              onToggle={toggleApp}
              maxSelectable={maxSelectable}
              preCheckedIds={preCheckedIds}
              query={query}
              onChangeQuery={setQuery}
              onDisabledPress={() => setHint('Free plan: up to 3 apps.')}
            />
          )}
        </View>
      </View>
      <PrimaryBar
        label={isSaving ? 'Saving...' : 'Continue'}
        disabled={selectedIds.length === 0 || isSaving || isLoading}
        onPress={continueWithSelection}
        bottomInset={insets.bottom}
      />
    </View>
  );
}

export const onboardingDefaultAppIds = DEFAULT_APP_IDS;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: layout.horizontalPadding,
  },
  title: {
    marginTop: 42,
    color: colors.ink,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 10,
    color: colors.muted,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
  },
  hint: {
    marginTop: 12,
    color: colors.mutedRust,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
  },
  pickerWrap: {
    flex: 1,
    minHeight: 0,
    marginTop: 22,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
