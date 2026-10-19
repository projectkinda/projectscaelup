import { usePickerBack } from '../../components/usePickerBack';
import { warn } from '../../domain/releaseLog';
import { typography } from '../../theme/typography';
import { Text } from '../../components/AppText';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StyleSheet,
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
import { isPaidUser, toggleAllFlaggedApps } from '../../domain/paywall';
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
  selectionInitialized?: boolean;
  onSelectedIdsChange: (ids: string[]) => void;
  onBack: () => void;
  onContinue: () => void;
};

export function AppsStep({
  selectedIds,
  selectionInitialized = selectedIds.length > 0,
  onSelectedIdsChange,
  onBack,
  onContinue,
}: AppsStepProps) {
  const insets = useSafeAreaInsets();
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const { back, keyboardVisible } = usePickerBack(query, () => setQuery(''), onBack);
  const [hint, setHint] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
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
            selectionInitialized || selectedIds.length > 0
              ? selectedIds
              : currentSavedIds.length > 0
                ? currentSavedIds
                : defaultIds,
          );
        }
      } catch (error) {
        warn('Failed to load onboarding apps:', error);
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
  }, [onSelectedIdsChange, paidUser, loadAttempt]);

  useEffect(() => {
    if (apps.length > 0 || isLoading) return;
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') setLoadAttempt(attempt => attempt + 1);
    });
    return () => subscription.remove();
  }, [apps.length, isLoading]);

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
      warn('Failed to save onboarding apps:', error);
      Alert.alert('Unable to save apps', 'Try again in a moment.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.screen}>
      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + 16,
          },
        ]}
      >
        <View style={styles.header}>
          <BackButton onPress={back} />
          <Text style={[styles.title, (keyboardVisible || !isLoading && apps.length === 0) && styles.compactTitle]}>{paidUser ? 'Pick your apps' : `Pick up to ${FREE_TIER_APP_CAP} apps`}</Text>
        </View>
        {!keyboardVisible && (isLoading || apps.length > 0) ? <Text style={styles.subtitle}>
          The ones that pull you away most. You can change this any time in
          Settings.
        </Text> : null}

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
              onRetry={() => setLoadAttempt(attempt => attempt + 1)}
              selectedIds={selectedIds}
              onToggle={toggleApp}
              onToggleAllVisible={visible => onSelectedIdsChange(toggleAllFlaggedApps(selectedIds, visible.map(app => app.packageName), maxSelectable ?? Infinity))}
              maxSelectable={maxSelectable}
              preCheckedIds={preCheckedIds}
              query={query}
              onChangeQuery={setQuery}
              onDisabledPress={() => setHint('Free plan: up to 3 apps.')}
            />
          )}
        </View>
      </View>
      <View style={styles.footer}>
        {!paidUser ? <Text style={styles.counter}>{selectedIds.length} of {FREE_TIER_APP_CAP} free apps</Text> : null}
        <PrimaryBar inline
          label={isSaving ? 'Saving...' : 'Continue'}
          disabled={selectedIds.length === 0 || isSaving || isLoading}
          onPress={continueWithSelection}
          bottomInset={keyboardVisible ? 0 : insets.bottom}
        />
      </View>
    </KeyboardAvoidingView>
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
    minHeight: 0,
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: layout.horizontalPadding,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  footer: { flexShrink: 0 },
  counter: { ...typography.label, color: colors.muted, paddingHorizontal: layout.horizontalPadding, marginTop: 8 },
  title: {
    flex: 1,
    color: colors.ink,
    ...typography.title,
    fontWeight: '800',
  },
  compactTitle: { ...typography.heading },
  subtitle: {
    marginTop: 10,
    color: colors.muted,
    ...typography.subheading,
    fontWeight: '600',
  },
  hint: {
    marginTop: 12,
    color: colors.mutedRust,
    ...typography.label,
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
