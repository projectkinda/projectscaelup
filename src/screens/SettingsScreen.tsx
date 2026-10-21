import { warn } from '../domain/releaseLog';
import { CustomModeEditorModal } from '../components/CustomModeEditorModal';
import { getLiveTimerStyleOverride, setLiveTimerStyleOverride, type LiveTimerStyle } from '../domain/androidLiveTimer';
import { AppRulesSection } from '../components/AppRulesSection';
import { CUSTOM_MODES_INTRO, customModeDetail } from '../domain/customModeCopy';
import { usePaywall } from '../components/PaywallProvider';
import { AppPickerModal } from '../components/AppPickerModal';
import { DevAppRulesControls } from '../components/DevAppRulesControls';
import { DevAwayControls } from '../components/DevAwayControls';
import { typography } from '../theme/typography';
import { Text } from '../components/AppText';
import { DevCoachSampleControls } from '../components/DevCoachSampleControls';
import { Camera } from 'expo-camera';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomNavigation } from '../components/BottomNavigation';
import {
  clearSeededCoachSessions,
  seedCoachSessions,
  type CoachSeedPattern,
} from '../data/coachSeedRepository';
import { setAppState } from '../data/appStateRepository';
import {
  filterAppsForPicker,
} from '../components/AppPickerList';
import {
  type CustomMode,
  type FlaggedApp,
  FREE_TIER_APP_CAP,
  canAddAnotherFlaggedApp,
  loadSettingsData,
  removeCustomMode,
  removeFlaggedApp,
  saveFlaggedApp,
} from '../data/settingsRepository';
import {
  getInstalledApps,
  isAppPickerSupported,
  type InstalledApp,
} from '../domain/appPicker';
import { LockdownModule } from '../domain/lockdownModule';
import { IosFlaggedApps } from '../components/IosFlaggedApps';
import { ScreenTime, type ScreenTimeStatus } from '../../modules/screen-time';
import { APP_VERSION, legalEntries, UNHOSTED_CAPTION } from '../config/legal';
import { restorePurchases } from '../domain/purchases';
import { isAwayTrackingSupported } from '../domain/awayPlatform';
import {
  isAwayTrackingOptedIn,
  setAwayTrackingEnabled,
} from '../domain/awayTime';
import {
  TIER_SWITCHER_ENABLED,
  canAddFlaggedApp, flaggedAppSlots, toggleAllFlaggedApps,
  getTestTierOverride,
  setTestTierOverride,
  subscribeToTier,
  type TestTierOverride,
} from '../domain/paywall';
import { UsageTrackingModule } from '../domain/usageTrackingModule';
import { useIsPaidUser } from '../domain/useIsPaidUser';
import { colors, layout } from '../theme/tokens';

type SettingsScreenProps = {
  onRestartOnboarding?: () => Promise<void>;
  canRestartOnboarding?: boolean;
  isActive: boolean;
  onNavigate: (screen: string) => void;
};

// iOS distinguishes 'notRequested' (never asked, so tapping asks) from
// 'denied' (the user said no, so only Settings can change it). Android keeps
// its existing granted/revoked states.
type PermissionState = 'granted' | 'notRequested' | 'denied' | 'revoked' | 'unavailable';

// expo-camera's permission check doesn't resolve on web (no camera module
// there), which would otherwise hang this screen's initial load forever.
async function getCameraPermissionAsync() {
  if (Platform.OS === 'web') {
    return { status: 'undetermined' as const, canAskAgain: false };
  }
  return Camera.getCameraPermissionsAsync();
}

type PermissionRow = {
  id: string;
  label: string;
  detail: string;
  state: PermissionState;
  fix: () => void;
};

const CARD_BORDER = 'rgba(255, 255, 255, 0.12)';
const TEST_TIER_OVERRIDE_KEY = 'test_tier_override';

function statusLabel(state: PermissionState) {
  switch (state) {
    case 'granted':
      return 'Granted';
    case 'notRequested':
      return 'Set up';
    case 'denied':
      return 'Denied';
    case 'revoked':
      return 'Revoked';
    case 'unavailable':
      return 'Unavailable';
  }
}

function needsAttention(state: PermissionState) {
  return state === 'denied' || state === 'revoked';
}

function iosCameraPermissionState(permission: { status: string }): PermissionState {
  if (permission.status === 'granted') {
    return 'granted';
  }
  return permission.status === 'denied' ? 'denied' : 'notRequested';
}

function screenTimePermissionState(status: ScreenTimeStatus | null): PermissionState {
  if (!status) {
    return 'unavailable';
  }
  switch (status.authorization) {
    case 'approved':
      return 'granted';
    case 'denied':
      return 'denied';
    case 'notDetermined':
      return 'notRequested';
  }
}

function appInitial(name: string) {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed[0].toUpperCase() : '?';
}

async function openAccessibilitySettings() {
  if (Platform.OS === 'android') {
    UsageTrackingModule.openSettings();
    return;
  }

  await Linking.openSettings();
}

function openOverlaySettings() {
  if (Platform.OS === 'android') {
    LockdownModule.openSettings();
    return;
  }

  Linking.openSettings();
}

async function openSubscriptionManagement() {
  const url =
    Platform.OS === 'ios'
      ? 'https://apps.apple.com/account/subscriptions'
      : 'https://play.google.com/store/account/subscriptions';

  await Linking.openURL(url);
}

export function SettingsScreen({ isActive, onNavigate, onRestartOnboarding, canRestartOnboarding = true }: SettingsScreenProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight, fontScale } = useWindowDimensions();
  const [flaggedApps, setFlaggedApps] = useState<FlaggedApp[]>([]);
  const [isEditingFlaggedApps, setIsEditingFlaggedApps] = useState(false);
  const [customModes, setCustomModes] = useState<CustomMode[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isRestartingOnboarding, setIsRestartingOnboarding] = useState(false);
  const restartSetup = async () => {
    if (!TIER_SWITCHER_ENABLED || !canRestartOnboarding || isRestartingOnboarding || !onRestartOnboarding) return;
    setIsRestartingOnboarding(true);
    try { await onRestartOnboarding(); }
    catch (error) {
      warn('Failed to restart onboarding:', error);
      Alert.alert('Unable to restart onboarding', 'Try again in a moment.');
    } finally { setIsRestartingOnboarding(false); }
  };
  const [editingMode, setEditingMode] = useState<CustomMode | null>(null);
  const [isModeEditorVisible, setIsModeEditorVisible] = useState(false);
  const [isAppPickerVisible, setIsAppPickerVisible] = useState(false);
  const paywall = usePaywall();
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);
  const [appPickerQuery, setAppPickerQuery] = useState('');
  const [selectedAppIdentifiers, setSelectedAppIdentifiers] = useState<
    string[]
  >([]);
  const [isPickingApp, setIsPickingApp] = useState(false);
  const [awayTrackingOptedIn, setAwayTrackingOptedIn] = useState(false);
  const [screenTimeStatus, setScreenTimeStatus] = useState<ScreenTimeStatus | null>(null);
  const [testTierOverride, setLocalTestTierOverride] =
    useState<TestTierOverride>(() => getTestTierOverride());
  const [liveTimerStyle, setLiveTimerStyle] = useState<LiveTimerStyle | null>(getLiveTimerStyleOverride);
  const [liveTimerStyleOutput, setLiveTimerStyleOutput] = useState('');
  const changeLiveTimerStyle = () => {
    if (!TIER_SWITCHER_ENABLED || Platform.OS !== 'android') return;
    const next = liveTimerStyle === 'standard' ? 'custom' : 'standard';
    if (setLiveTimerStyleOverride(next)) {
      setLiveTimerStyle(next); setLiveTimerStyleOutput('Applies from the next session start.');
    } else setLiveTimerStyleOutput('Rebuild the Android app to change the live timer style.');
  };
  const paidUser = useIsPaidUser();
  const hasLoadedOnceRef = useRef(false);

  useEffect(
    () =>
      subscribeToTier(tier => {
        setLocalTestTierOverride(tier);
      }),
    [],
  );

  const load = useCallback(async () => {
    if (!hasLoadedOnceRef.current) {
      setIsLoading(true);
    }

    const [
      settingsData,
      cameraPermission,
      usageTrackingEnabled,
      overlayEnabled,
      awayTrackingEnabled,
    ] = await Promise.all([
      loadSettingsData({ isPaidUser: paidUser }),
      getCameraPermissionAsync(),
      Platform.OS === 'android'
        ? UsageTrackingModule.isEnabled()
        : Promise.resolve(false),
      Platform.OS === 'android'
        ? LockdownModule.canDrawOverlays()
        : Promise.resolve(false),
      isAwayTrackingOptedIn(),
    ]);

    const nextPermissions: PermissionRow[] = [
      {
        id: 'camera',
        label: 'Camera',
        detail: "Used to check you're still at your desk during a session.",
        state:
          Platform.OS === 'ios'
            ? iosCameraPermissionState(cameraPermission)
            : cameraPermission.status === 'granted'
              ? 'granted'
              : 'revoked',
        fix: () => {
          const canAskNow =
            Platform.OS === 'ios' &&
            cameraPermission.status !== 'granted' &&
            cameraPermission.canAskAgain;
          if (canAskNow) {
            Camera.requestCameraPermissionsAsync().then(load);
            return;
          }
          Linking.openSettings();
        },
      },
      {
        id: 'usage-tracking',
        label: Platform.OS === 'ios' ? 'Screen Time' : 'Accessibility',
        detail:
          Platform.OS === 'ios'
            ? 'Used to track flagged apps during sessions and lock them afterwards.'
            : "Used to track time in apps you've flagged as distracting.",
        state:
          Platform.OS === 'android'
            ? usageTrackingEnabled
              ? 'granted'
              : 'revoked'
            : 'unavailable',
        fix: openAccessibilitySettings,
      },
    ];

    if (Platform.OS === 'android') {
      nextPermissions.push({
        id: 'overlay',
        label: 'Display over apps',
        detail: 'Used to block flagged apps while a lockdown is active.',
        state: overlayEnabled ? 'granted' : 'revoked',
        fix: openOverlaySettings,
      });
    }

    setFlaggedApps(settingsData.flaggedApps);
    setCustomModes(settingsData.customModes);
    setPermissions(nextPermissions);
    setAwayTrackingOptedIn(awayTrackingEnabled);
    setScreenTimeStatus(Platform.OS === 'ios' ? ScreenTime.getStatus() : null);
    hasLoadedOnceRef.current = true;
    setIsLoading(false);
  }, [paidUser]);

  useEffect(() => {
    load();

    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        load();
      }
    });

    return () => subscription.remove();
  }, [load]);

  // The screen stays mounted (hidden) across tab switches, so revalidate
  // silently whenever the tab comes back into view instead of relying on a
  // remount -- load() no longer blanks the screen to a spinner past the
  // first load.
  useEffect(() => {
    if (isActive) {
      load();
    }
  }, [isActive, load]);

  useEffect(() => {
    if (!isActive || flaggedApps.length === 0 || isAppPickerVisible) {
      setIsEditingFlaggedApps(false);
    }
  }, [isActive, flaggedApps.length, isAppPickerVisible]);

  const removeApp = async (app: FlaggedApp) => {
    await removeFlaggedApp(app.appIdentifier);
    setFlaggedApps(current =>
      current.filter(item => item.appIdentifier !== app.appIdentifier),
    );
  };

  const deleteMode = async (mode: CustomMode) => {
    await removeCustomMode(mode.id);
    setCustomModes(current => current.filter(item => item.id !== mode.id));
  };

  const openCreateMode = () => {
    setEditingMode(null);
    setIsModeEditorVisible(true);
  };

  const openEditMode = (mode: CustomMode) => {
    setEditingMode(mode);
    setIsModeEditorVisible(true);
  };

  const appCapFull = Platform.OS === 'android' && !canAddFlaggedApp(paidUser, flaggedApps.length);
  const showAppProLabel = (typography.subheading.lineHeight + typography.caption.lineHeight) * fontScale <= 45;
  const remainingFreeAppSlots = flaggedAppSlots(paidUser, flaggedApps.length);

  const availableInstalledApps = useMemo(() => {
    const flaggedAppIdentifiers = new Set(
      flaggedApps.map(app => app.appIdentifier),
    );
    return installedApps.filter(app => {
      if (flaggedAppIdentifiers.has(app.packageName)) {
        return false;
      }
      return true;
    });
  }, [flaggedApps, installedApps]);
  const visibleInstalledApps = useMemo(
    () => filterAppsForPicker(availableInstalledApps, appPickerQuery),
    [appPickerQuery, availableInstalledApps],
  );

  // The iOS Screen Time row follows the live status, which the flagged-apps
  // panel updates without reloading the whole screen.
  const permissionRows = useMemo(
    () =>
      permissions.map(row =>
        Platform.OS === 'ios' && row.id === 'usage-tracking'
          ? {
              ...row,
              state: screenTimePermissionState(screenTimeStatus),
              fix: () => {
                ScreenTime.requestAuthorization()
                  .then(next => next && setScreenTimeStatus(next))
                  .catch(() => Linking.openSettings());
              },
            }
          : row,
      ),
    [permissions, screenTimeStatus],
  );

  const installedAppsRequest = useRef(false);
  const reloadInstalledApps = useCallback(async () => {
    if (installedAppsRequest.current) return;
    installedAppsRequest.current = true;
    setIsPickingApp(true);
    try { setInstalledApps(await getInstalledApps()); }
    catch (error) { warn('Failed to load apps:', error); setInstalledApps([]); }
    finally { installedAppsRequest.current = false; setIsPickingApp(false); }
  }, []);

  const handleAddApp = async () => {
    if (Platform.OS !== 'android') return;
    const canAdd = await canAddAnotherFlaggedApp(paidUser);
    if (!canAdd) { paywall.show('apps'); return; }
    setAppPickerQuery('');
    setSelectedAppIdentifiers([]);
    setIsEditingFlaggedApps(false);
    setIsAppPickerVisible(true);
    await reloadInstalledApps();
  };

  const closeAppPicker = () => {
    setIsAppPickerVisible(false);
    setSelectedAppIdentifiers([]);
    setAppPickerQuery('');
  };

  const toggleSelectedApp = (app: InstalledApp) => {
    setSelectedAppIdentifiers(current => {
      if (current.includes(app.packageName)) {
        return current.filter(packageName => packageName !== app.packageName);
      }

      if (current.length >= remainingFreeAppSlots) {
        return current;
      }

      return [...current, app.packageName];
    });
  };

  const toggleAllVisibleApps = (apps: InstalledApp[]) => {
    setSelectedAppIdentifiers(current => toggleAllFlaggedApps(current, apps.map(app => app.packageName), remainingFreeAppSlots));
  };

  const saveSelectedApps = async () => {
    if (!paidUser && selectedAppIdentifiers.length > remainingFreeAppSlots) { paywall.show('apps'); return; }
    if (selectedAppIdentifiers.length === 0) {
      return;
    }

    const selectedAppSet = new Set(selectedAppIdentifiers);
    const appsToSave = installedApps.filter(app =>
      selectedAppSet.has(app.packageName),
    );

    setIsPickingApp(true);
    try {
      const savedApps = await Promise.all(
        appsToSave.map(app =>
          saveFlaggedApp({
            appIdentifier: app.packageName,
            displayName: app.displayName,
            iconBase64: app.iconBase64,
          }),
        ),
      );
      setFlaggedApps(current => {
        const appsByIdentifier = new Map(
          current.map(app => [app.appIdentifier, app]),
        );
        savedApps.forEach(app => {
          appsByIdentifier.set(app.appIdentifier, app);
        });

        return Array.from(appsByIdentifier.values()).sort((a, b) =>
          a.displayName.localeCompare(b.displayName),
        );
      });
      closeAppPicker();
    } catch (error) {
      warn('Failed to save selected apps:', error);
      Alert.alert('Unable to add apps', 'Try again in a moment.');
    } finally {
      setIsPickingApp(false);
    }
  };

  const handleModeSaved = (savedMode: CustomMode) => {
    setCustomModes(current => current.some(mode => mode.id === savedMode.id)
      ? current.map(mode => mode.id === savedMode.id ? savedMode : mode)
      : [savedMode, ...current]);
    setIsModeEditorVisible(false);
    setEditingMode(null);
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      restorePurchases();
    } finally {
      setIsRestoring(false);
    }
  };

  const toggleAwayTracking = async () => {
    const next = !awayTrackingOptedIn;
    setAwayTrackingOptedIn(next);
    try {
      await setAwayTrackingEnabled(next);
    } catch (error) {
      setAwayTrackingOptedIn(!next);
      warn('Failed to update away-time tracking:', error);
      Alert.alert('Unable to update setting', 'Try again in a moment.');
    }
  };

  const [coachSeedOutput, setCoachSeedOutput] = useState('');
  const seedCoach = async (pattern: CoachSeedPattern) => {
    if (!TIER_SWITCHER_ENABLED) return;
    try {
      await clearSeededCoachSessions();
      await seedCoachSessions(pattern);
      setCoachSeedOutput(`${pattern.replace('_', ' ')} sessions added.`);
    } catch (error) {
      warn('Failed to seed coach sessions:', error);
      setCoachSeedOutput('Unable to seed coach sessions. Try again in a moment.');
    }
  };

  const clearCoachSeed = async () => {
    if (!TIER_SWITCHER_ENABLED) return;
    try {
      await clearSeededCoachSessions();
      setCoachSeedOutput('Seeded sessions cleared.');
    } catch (error) {
      warn('Failed to clear seeded coach sessions:', error);
      setCoachSeedOutput('Unable to clear seeded sessions. Try again in a moment.');
    }
  };

  const setTestTier = async (tier: Exclude<TestTierOverride, null>) => {
    setLocalTestTierOverride(tier);
    setTestTierOverride(tier);
    try {
      await setAppState(TEST_TIER_OVERRIDE_KEY, tier);
    } catch (error) {
      warn('Failed to save test tier override:', error);
    }
  };

  const topInsetPadding = insets.top + 50;
  const contentMinHeight = Math.max(
    0,
    windowHeight -
      topInsetPadding -
      (layout.bottomNavHeight + insets.bottom + 24),
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            minHeight: contentMinHeight,
            paddingTop: topInsetPadding,
            paddingBottom: layout.bottomNavHeight + insets.bottom + 26,
          },
        ]}
      >
        <View style={styles.content}>
          <Text style={styles.title}>Settings</Text>

          {isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={colors.ink} />
            </View>
          ) : (
            <>
              <View style={styles.section}>
                <View style={styles.flaggedAppsHeader}>
                  <Text style={styles.sectionLabel}>Flagged apps</Text>
                  {isAppPickerSupported && flaggedApps.length > 0 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={isEditingFlaggedApps ? 'Done editing flagged apps' : 'Edit flagged apps'}
                      hitSlop={12}
                      onPress={() => setIsEditingFlaggedApps(current => !current)}
                      style={styles.editAppsButton}
                    >
                      <Text style={styles.editAppsText}>{isEditingFlaggedApps ? 'Done' : 'Edit'}</Text>
                    </Pressable>
                  ) : null}
                </View>
                <View style={styles.panelShell}>
                  <LinearGradient
                    colors={['#333333', '#141414']}
                    style={styles.panel}
                  >
                    {isAppPickerSupported ? (
                      <>
                        {flaggedApps.length === 0 ? (
                          <View style={styles.emptyAppsRow}>
                            <Text style={styles.emptyText}>
                              No distracting apps selected yet.
                            </Text>
                          </View>
                        ) : null}
                        <ScrollView
                          horizontal
                          bounces={false}
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.flaggedAppStrip}
                        >
                          {flaggedApps.map(app => (
                            <View key={app.appIdentifier} style={styles.appIconWrap}>
                              <Pressable
                                accessibilityRole="button"
                                accessible={!isEditingFlaggedApps}
                                disabled={isEditingFlaggedApps}
                                accessibilityLabel={`${app.displayName}. Long press to remove.`}
                                onLongPress={isEditingFlaggedApps ? undefined : () => removeApp(app)}
                                style={({ pressed }) => [
                                  styles.appIconButton,
                                  pressed && styles.pressed,
                                ]}
                              >
                                {app.iconBase64 ? (
                                  <Image
                                    source={{
                                      uri: `data:image/png;base64,${app.iconBase64}`,
                                    }}
                                    style={styles.appIconImage}
                                  />
                                ) : (
                                  <View style={styles.appIconFallback}>
                                    <Text style={styles.appIconText}>
                                      {appInitial(app.displayName)}
                                    </Text>
                                  </View>
                                )}
                              </Pressable>
                              {isEditingFlaggedApps ? (
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={`Remove ${app.displayName}`}
                                  hitSlop={8}
                                  onPress={() => removeApp(app)}
                                  style={({ pressed }) => [styles.removeAppBadge, pressed && styles.pressed]}
                                >
                                  <View style={styles.removeAppMinus} />
                                </Pressable>
                              ) : null}
                            </View>
                          ))}
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={appCapFull ? 'Add app, requires Pro' : 'Add app'}
                            disabled={isPickingApp}
                            onPress={handleAddApp}
                            style={({ pressed }) => [
                              styles.addAppIconButton,
                              appCapFull && styles.addAppPro,
                              pressed && styles.pressed,
                            ]}
                          >
                            {isPickingApp ? (
                              <ActivityIndicator color={colors.ink} />
                            ) : (
                              <>
                                <Text style={[styles.plusText, appCapFull && styles.plusAmber, appCapFull && showAppProLabel && styles.plusWithPro]}>+</Text>
                                {appCapFull && showAppProLabel ? <Text style={styles.appProLabel}>PRO</Text> : null}
                              </>
                            )}
                          </Pressable>
                        </ScrollView>
                        {Platform.OS === 'android' && !paidUser ? appCapFull ?
                          <Pressable accessibilityRole="button" accessibilityLabel="Add more apps with Pro" hitSlop={8} onPress={() => paywall.show('apps')} style={styles.appCapCaption}>
                            <Text numberOfLines={1} style={styles.appCapCaptionText}>{FREE_TIER_APP_CAP} of {FREE_TIER_APP_CAP} free apps{' \u00b7 '}<Text style={styles.appCapLink}>Add more with Pro</Text></Text>
                          </Pressable> : <Text numberOfLines={1} style={[styles.appCapCaptionText, styles.appCapCaption]}>{flaggedApps.length} of {FREE_TIER_APP_CAP} free apps</Text> : null}
                      </>
                    ) : (
                      Platform.OS === 'ios' ? (
                        <IosFlaggedApps
                          status={screenTimeStatus}
                          paidUser={paidUser}
                          onStatusChange={setScreenTimeStatus}
                        />
                      ) : (
                        <View style={styles.emptyAppsRow}>
                          <Text style={styles.emptyText}>
                            App blocking isn't available on this device.
                          </Text>
                        </View>
                      )
                    )}
                  </LinearGradient>
                </View>
              </View>

              {/* TODO: iOS App rules will use the Screen Time engine. */}
              {Platform.OS === 'android' ? <AppRulesSection isActive={isActive}/> : null}

              {paidUser ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Custom modes</Text>
                  <Text style={[styles.rowDetail, { marginTop: 8 }]}>{CUSTOM_MODES_INTRO}</Text>
                  <View style={styles.panelShell}>
                    <LinearGradient
                      colors={['#333333', '#141414']}
                      style={styles.panel}
                    >
                      {customModes.map(mode => (
                        <View key={mode.id} style={styles.row}>
                          <View style={styles.rowTextWrap}>
                            <Text style={styles.rowTitle}>{mode.name}</Text>
                            <Text style={styles.rowDetail}>
                              {customModeDetail(mode.gracePeriodSeconds, mode.frameWidthRange)}
                            </Text>
                          </View>
                          <View style={styles.actionGroup}>
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => openEditMode(mode)}
                              style={({ pressed }) => [
                                styles.textAction,
                                pressed && styles.pressed,
                              ]}
                            >
                              <Text style={styles.actionText}>Edit</Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => deleteMode(mode)}
                              style={({ pressed }) => [
                                styles.textAction,
                                pressed && styles.pressed,
                              ]}
                            >
                              <Text style={styles.actionText}>Delete</Text>
                            </Pressable>
                          </View>
                        </View>
                      ))}
                      {customModes.length === 0 ? (
                        <View style={styles.row}>
                          <Text style={styles.emptyText}>
                            No custom modes created yet.
                          </Text>
                        </View>
                      ) : null}
                      <Pressable
                        accessibilityRole="button"
                        onPress={openCreateMode}
                        style={({ pressed }) => [
                          styles.row,
                          styles.addRow,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={styles.addText}>Create custom mode</Text>
                      </Pressable>
                    </LinearGradient>
                  </View>
                </View>
              ) : null}

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Permission status</Text>
                <View style={styles.permissionList}>
                  {permissionRows.map(permission => (
                    <Pressable
                      key={permission.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${permission.label}, ${statusLabel(
                        permission.state,
                      )}`}
                      onPress={permission.fix}
                      style={({ pressed }) => [
                        styles.permissionCardShell,
                        pressed && styles.pressed,
                      ]}
                    >
                      <LinearGradient
                        colors={['#333333', '#141414']}
                        style={styles.permissionCard}
                      >
                        <View style={styles.permissionTextWrap}>
                          <Text style={styles.rowTitle}>
                            {permission.label}
                          </Text>
                          <Text style={styles.rowDetail}>
                            {permission.detail}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.statusPill,
                            needsAttention(permission.state) &&
                              styles.attentionPill,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusPillText,
                              needsAttention(permission.state) &&
                                styles.attentionPillText,
                            ]}
                          >
                            {statusLabel(permission.state)}
                          </Text>
                        </View>
                      </LinearGradient>
                    </Pressable>
                  ))}
                </View>
              </View>

              {isAwayTrackingSupported() ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Away time</Text>
                  <View style={styles.panelShell}>
                    <LinearGradient
                      colors={['#333333', '#141414']}
                      style={styles.panel}
                    >
                      <Pressable
                        accessibilityRole="switch"
                        accessibilityState={{ checked: awayTrackingOptedIn }}
                        onPress={toggleAwayTracking}
                        style={({ pressed }) => [
                          styles.row,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={styles.rowTextWrap}>
                          <Text style={styles.rowTitle}>
                            Track time away from flagged apps
                          </Text>
                          <Text style={styles.rowDetail}>
                            Records flagged-app use on this device only.
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.statusPill,
                            !awayTrackingOptedIn && styles.attentionPill,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusPillText,
                              !awayTrackingOptedIn && styles.attentionPillText,
                            ]}
                          >
                            {awayTrackingOptedIn ? 'On' : 'Off'}
                          </Text>
                        </View>
                      </Pressable>
                    </LinearGradient>
                  </View>
                </View>
              ) : null}

              {TIER_SWITCHER_ENABLED && Platform.OS === 'android' ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Testing</Text>
                  <View style={styles.panelShell}>
                    <View style={styles.panel}>
                      <Pressable testID="restart-onboarding" accessibilityRole="button"
                        accessibilityLabel="Restart onboarding"
                        accessibilityState={{ disabled: !canRestartOnboarding || isRestartingOnboarding || !onRestartOnboarding, busy: isRestartingOnboarding }}
                        disabled={!canRestartOnboarding || isRestartingOnboarding || !onRestartOnboarding}
                        onPress={restartSetup} style={({ pressed }) => [styles.row, (pressed || !canRestartOnboarding || isRestartingOnboarding) && styles.pressed]}>
                        <View style={styles.rowTextWrap}>
                          <Text style={styles.rowTitle}>{isRestartingOnboarding ? 'Restarting onboarding?' : 'Restart onboarding'}</Text>
                          <Text style={styles.rowDetail}>{canRestartOnboarding ? 'Run setup again. Saved apps, modes and history stay.' : 'Finish your current session first.'}</Text>
                        </View>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ) : null}

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Subscription</Text>
                <View style={styles.panelShell}>
                  <LinearGradient
                    colors={['#333333', '#141414']}
                    style={styles.panel}
                  >
                    <View style={styles.row}>
                      <View style={styles.rowTextWrap}>
                        <Text style={styles.rowTitle}>Current tier</Text>
                      </View>
                      <Text
                        style={[
                          styles.tierText,
                          paidUser && styles.premiumText,
                        ]}
                      >
                        {paidUser ? 'Premium' : 'Free'}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      onPress={openSubscriptionManagement}
                      style={({ pressed }) => [
                        styles.row,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.addText}>Manage Subscription</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={handleRestore}
                      style={({ pressed }) => [
                        styles.row,
                        pressed && styles.pressed,
                      ]}
                      disabled={isRestoring}
                    >
                      <Text style={styles.addText}>
                        {isRestoring ? 'Restoring...' : 'Restore Purchases'}
                      </Text>
                    </Pressable>
                  </LinearGradient>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>About</Text>
                <View style={styles.panelShell}>
                  <LinearGradient colors={['#333333', '#141414']} style={styles.panel}>
                    {legalEntries().map(entry => entry.url ? (
                      <Pressable
                        key={entry.page}
                        accessibilityRole="link"
                        onPress={() => Linking.openURL(entry.url!)}
                        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                      >
                        <Text style={styles.addText}>{entry.label}</Text>
                      </Pressable>
                    ) : (
                      <View key={entry.page} testID={'about-unhosted-' + entry.page} style={styles.row}>
                        <View style={styles.rowTextWrap}>
                          <Text style={styles.rowTitle}>{entry.label}</Text>
                        </View>
                        <Text style={styles.tierText}>{UNHOSTED_CAPTION}</Text>
                      </View>
                    ))}
                    <View style={styles.row}>
                      <View style={styles.rowTextWrap}>
                        <Text style={styles.rowTitle}>Version</Text>
                      </View>
                      <Text style={styles.tierText}>{APP_VERSION}</Text>
                    </View>
                  </LinearGradient>
                </View>
              </View>

              {TIER_SWITCHER_ENABLED ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Developer tools (testing only)</Text>
                  <View style={styles.panelShell}>
                    <View style={styles.devPanel}>
                  {TIER_SWITCHER_ENABLED && Platform.OS === 'android' ? <View>
                    <Pressable accessibilityRole="button" onPress={changeLiveTimerStyle} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                      <View style={styles.rowTextWrap}>
                        <Text style={styles.rowTitle}>Live timer style: {liveTimerStyle === 'standard' ? 'Status-bar chip' : 'One-line row'}</Text>
                        <Text style={styles.rowDetail}>One-line row / Status-bar chip</Text>
                      </View>
                    </Pressable>
                    {liveTimerStyleOutput ? <Text accessibilityLiveRegion="polite" style={styles.rowDetail}>{liveTimerStyleOutput}</Text> : null}
                  </View> : null}
                  {TIER_SWITCHER_ENABLED && Platform.OS === 'android' ?
                    <DevAppRulesControls flaggedPackages={flaggedApps.map(app => app.appIdentifier)} /> : null}

                  {TIER_SWITCHER_ENABLED ? (
                    <View style={styles.row}>
                      <View style={styles.rowTextWrap}>
                        <Text style={styles.rowTitle}>
                          Test tier (testing only)
                        </Text>
                        <Text style={styles.rowDetail}>
                          {testTierOverride
                            ? `TEST: ${testTierOverride.toUpperCase()}`
                            : 'No test override set'}
                        </Text>
                      </View>
                      <View style={styles.tierSwitcher}>
                        {(['free', 'paid'] as const).map(tier => {
                          const selected =
                            (testTierOverride ??
                              (paidUser ? 'paid' : 'free')) === tier;
                          return (
                            <Pressable
                              key={tier}
                              accessibilityRole="button"
                              accessibilityState={{ selected }}
                              onPress={() => setTestTier(tier)}
                              style={({ pressed }) => [
                                styles.tierOption,
                                selected && styles.tierOptionSelected,
                                pressed && styles.pressed,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.tierOptionText,
                                  selected && styles.tierOptionTextSelected,
                                ]}
                              >
                                {tier === 'free' ? 'Free' : 'Paid'}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}

                      <DevCoachSampleControls />
                      {Platform.OS === 'ios' && isAwayTrackingSupported() ? <DevAwayControls /> : null}
                      <Text style={styles.devSubheading}>Coach dev seeding</Text>
                      {(
                        [
                          'rising',
                          'plateau',
                          'slipping',
                          'early_breaker',
                        ] as CoachSeedPattern[]
                      ).map(pattern => (
                        <Pressable
                          key={pattern}
                          accessibilityRole="button"
                          onPress={() => seedCoach(pattern)}
                          style={({ pressed }) => [
                            styles.row,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text style={styles.addText}>
                            Seed {pattern.replace('_', ' ')}
                          </Text>
                        </Pressable>
                      ))}
                      <Pressable
                        accessibilityRole="button"
                        onPress={clearCoachSeed}
                        style={({ pressed }) => [
                          styles.row,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={styles.addText}>Clear seeded sessions</Text>
                      </Pressable>
                      {coachSeedOutput ? <Text selectable accessibilityLiveRegion="polite" style={styles.devOutput}>{coachSeedOutput}</Text> : null}
                    </View>
                  </View>
                </View>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
      <BottomNavigation
        activeItem="settings"
        bottomInset={insets.bottom}
        onSelect={onNavigate}
      />
      <CustomModeEditorModal
        visible={isModeEditorVisible}
        mode={editingMode}
        onCancel={() => {
          setIsModeEditorVisible(false);
          setEditingMode(null);
        }}
        onSaved={handleModeSaved}
      />
      <AppPickerModal
        apps={visibleInstalledApps}
        installedAppCount={installedApps.length}
        isLoading={isPickingApp}
        onRetry={reloadInstalledApps}
        isSaving={isPickingApp}
        query={appPickerQuery}
        remainingSlots={remainingFreeAppSlots}
        freeAppLimit={Platform.OS === 'android' && !paidUser ? { cap: FREE_TIER_APP_CAP, savedCount: flaggedApps.length } : undefined}
        onUpgrade={() => paywall.show('apps')}
        selectedAppIdentifiers={selectedAppIdentifiers}
        visible={isAppPickerVisible}
        onCancel={closeAppPicker}
        onChangeQuery={setAppPickerQuery}
        onSave={saveSelectedApps}
        onToggleAllVisible={toggleAllVisibleApps}
        onToggleApp={toggleSelectedApp}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { alignItems: 'center' },
  content: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    paddingHorizontal: layout.horizontalPadding,
  },
  title: {
    color: colors.ink,
    ...typography.title,
    fontWeight: '700',
  },
  loadingWrap: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { marginTop: 28 },
  flaggedAppsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editAppsButton: { minHeight: 44, justifyContent: 'center' },
  editAppsText: { ...typography.label, color: colors.ink },
  sectionLabel: {
    color: colors.ink,
    ...typography.body,
    fontWeight: '700',
  },
  panelShell: {
    width: '100%',
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    overflow: 'hidden',
  },
  panel: {
    paddingHorizontal: 14,
    // Rows draw their own divider underneath; the last one is clipped by the card
    // so there is no stray line or empty strip at the bottom.
    marginBottom: -1,
  },
  row: {
    minHeight: 62,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  rowTextWrap: { flex: 1, minWidth: 0 },
  emptyAppsRow: {
    minHeight: 48,
    paddingTop: 12,
    paddingBottom: 6,
    justifyContent: 'center',
  },
  flaggedAppStrip: {
    minHeight: 62,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  appIconWrap: { width: 46, height: 46 },
  removeAppBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.mutedRust,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeAppMinus: { width: 8, height: 2, borderRadius: 1, backgroundColor: colors.white },
  appIconButton: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addAppPro: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.rewardAmber + '59' },
  plusAmber: { color: colors.rewardAmber },
  plusWithPro: { ...typography.subheading },
  appProLabel: { ...typography.caption, fontWeight: '700', letterSpacing: .8, color: colors.rewardAmber },
  appCapCaption: { marginTop: 2, marginBottom: 16 },
  appCapCaptionText: { ...typography.caption, color: colors.muted },
  appCapLink: { ...typography.caption, color: colors.rewardAmber },
  addAppIconButton: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  appIconImage: {
    width: 42,
    height: 42,
    borderRadius: 10,
  },
  appIconFallback: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.module,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  appIconText: {
    color: colors.ink,
    ...typography.body,
    fontWeight: '700',
  },
  plusText: {
    color: colors.ink,
    ...typography.metric,
    fontWeight: '700',
  },
  rowTitle: {
    color: colors.ink,
    ...typography.body,
    fontWeight: '700',
  },
  rowDetail: {
    marginTop: 2,
    color: colors.muted,
    ...typography.caption,
  },
  emptyText: {
    color: colors.muted,
    ...typography.caption,
  },
  addRow: { justifyContent: 'flex-start' },
  addText: {
    color: colors.ink,
    ...typography.body,
    fontWeight: '700',
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  textAction: {
    minHeight: 36,
    justifyContent: 'center',
  },
  actionText: {
    color: colors.ink,
    ...typography.label,
    fontWeight: '700',
  },

  permissionList: {
    marginTop: 12,
    gap: 10,
  },
  permissionCardShell: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    overflow: 'hidden',
  },
  permissionCard: {
    minHeight: 76,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  permissionTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  statusPill: {
    minWidth: 74,
    minHeight: 28,
    borderRadius: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  statusPillText: {
    color: colors.ink,
    ...typography.label,
    fontWeight: '700',
  },
  attentionPill: {
    backgroundColor: colors.mutedRust,
  },
  attentionPillText: { color: colors.warmWhite },
  tierText: {
    color: colors.ink,
    ...typography.body,
    fontWeight: '700',
  },
  premiumText: { color: colors.rewardAmber },
  // Developer tools live in one panel; every item carries its own spacing, so nothing
  // is clipped by the card's rounded corners or the last-row divider trick above.
  devPanel: { paddingHorizontal: 14, paddingVertical: 6 },
  devSubheading: { ...typography.label, color: colors.muted, paddingTop: 16, paddingBottom: 4 },
  devOutput: { ...typography.caption, color: colors.muted, paddingVertical: 12 },
  tierSwitcher: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    overflow: 'hidden',
  },
  tierOption: {
    minWidth: 58,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.module,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: CARD_BORDER,
  },
  tierOptionSelected: {
    backgroundColor: colors.ink,
  },
  tierOptionText: {
    color: colors.ink,
    ...typography.label,
    fontWeight: '700',
  },
  tierOptionTextSelected: {
    color: colors.background,
  },
  pressed: { opacity: 0.55 },
});
