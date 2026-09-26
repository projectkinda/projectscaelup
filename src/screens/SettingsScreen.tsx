import { Camera } from 'expo-camera';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomNavigation } from '../components/BottomNavigation';
import {
  type CustomMode,
  type FlaggedApp,
  FREE_TIER_APP_CAP,
  canAddAnotherFlaggedApp,
  loadSettingsData,
  removeCustomMode,
  removeFlaggedApp,
  saveFlaggedApp,
  saveCustomMode,
} from '../data/settingsRepository';
import {
  getInstalledApps,
  isAppPickerSupported,
  type InstalledApp,
} from '../domain/appPicker';
import { LockdownModule } from '../domain/lockdownModule';
import { IosFlaggedApps } from '../components/IosFlaggedApps';
import { ScreenTime, type ScreenTimeStatus } from '../../modules/screen-time';
import { isPaidUser } from '../domain/paywall';
import { UsageTrackingModule } from '../domain/usageTrackingModule';
import { colors, layout } from '../theme/tokens';

type SettingsScreenProps = {
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
const MIN_GRACE_SECONDS = 3;
const MAX_GRACE_SECONDS = 90;

function formatGracePeriod(seconds: number) {
  if (seconds < 60) {
    return `${seconds}s grace`;
  }

  const minutes = Math.round(seconds / 60);
  return `${minutes} min grace`;
}

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

function inferFrameWidthRange(gracePeriodSeconds: number) {
  return gracePeriodSeconds >= 30 ? '5-20%' : '15-40%';
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

export function SettingsScreen({ onNavigate }: SettingsScreenProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [flaggedApps, setFlaggedApps] = useState<FlaggedApp[]>([]);
  const [customModes, setCustomModes] = useState<CustomMode[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRestoring, setIsRestoring] = useState(false);
  const [editingMode, setEditingMode] = useState<CustomMode | null>(null);
  const [isModeEditorVisible, setIsModeEditorVisible] = useState(false);
  const [isAppPickerVisible, setIsAppPickerVisible] = useState(false);
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);
  const [appPickerQuery, setAppPickerQuery] = useState('');
  const [selectedAppIdentifiers, setSelectedAppIdentifiers] = useState<
    string[]
  >([]);
  const [isPickingApp, setIsPickingApp] = useState(false);
  const [screenTimeStatus, setScreenTimeStatus] = useState<ScreenTimeStatus | null>(null);
  const paidUser = isPaidUser();

  const load = useCallback(async () => {
    setIsLoading(true);

    const [
      settingsData,
      cameraPermission,
      usageTrackingEnabled,
      overlayEnabled,
    ] = await Promise.all([
      loadSettingsData({ isPaidUser: isPaidUser() }),
      getCameraPermissionAsync(),
      Platform.OS === 'android'
        ? UsageTrackingModule.isEnabled()
        : Promise.resolve(false),
      Platform.OS === 'android'
        ? LockdownModule.canDrawOverlays()
        : Promise.resolve(false),
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
            ? 'Used to lock flagged apps during focus sessions.'
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
    setScreenTimeStatus(Platform.OS === 'ios' ? ScreenTime.getStatus() : null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    load();

    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        load();
      }
    });

    return () => subscription.remove();
  }, [load]);

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

  const remainingFreeAppSlots = paidUser
    ? Number.POSITIVE_INFINITY
    : Math.max(0, FREE_TIER_APP_CAP - flaggedApps.length);

  const availableInstalledApps = useMemo(() => {
    const flaggedAppIdentifiers = new Set(
      flaggedApps.map(app => app.appIdentifier),
    );
    const normalizedQuery = appPickerQuery.trim().toLowerCase();

    return installedApps.filter(app => {
      if (flaggedAppIdentifiers.has(app.packageName)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return (
        app.displayName.toLowerCase().includes(normalizedQuery) ||
        app.packageName.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [appPickerQuery, flaggedApps, installedApps]);

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

  const handleAddApp = async () => {
    const canAdd = await canAddAnotherFlaggedApp(isPaidUser());
    if (!canAdd) {
      onNavigate('paywall');
      return;
    }

    setIsPickingApp(true);
    try {
      setAppPickerQuery('');
      setSelectedAppIdentifiers([]);
      setIsAppPickerVisible(true);
      setInstalledApps(await getInstalledApps());
    } catch (error) {
      console.warn('Failed to load apps:', error);
      Alert.alert('Unable to load apps', 'Try again in a moment.');
      setIsAppPickerVisible(false);
    } finally {
      setIsPickingApp(false);
    }
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
    setSelectedAppIdentifiers(current => {
      const visibleAppIdentifiers = apps.map(app => app.packageName);
      const allVisibleSelected =
        visibleAppIdentifiers.length > 0 &&
        visibleAppIdentifiers.every(packageName =>
          current.includes(packageName),
        );

      if (allVisibleSelected) {
        return current.filter(
          packageName => !visibleAppIdentifiers.includes(packageName),
        );
      }

      const next = [...current];
      for (const packageName of visibleAppIdentifiers) {
        if (next.includes(packageName)) {
          continue;
        }

        if (next.length >= remainingFreeAppSlots) {
          break;
        }

        next.push(packageName);
      }

      return next;
    });
  };

  const saveSelectedApps = async () => {
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
      console.warn('Failed to save selected apps:', error);
      Alert.alert('Unable to add apps', 'Try again in a moment.');
    } finally {
      setIsPickingApp(false);
    }
  };

  const handleSaveMode = async ({
    id,
    name,
    gracePeriodSeconds,
  }: {
    id?: string;
    name: string;
    gracePeriodSeconds: number;
  }) => {
    const savedMode = await saveCustomMode({ id, name, gracePeriodSeconds });
    setCustomModes(current => {
      const existingIndex = current.findIndex(mode => mode.id === savedMode.id);
      if (existingIndex === -1) {
        return [...current, savedMode].sort((a, b) =>
          a.name.localeCompare(b.name),
        );
      }

      return current
        .map(mode => (mode.id === savedMode.id ? savedMode : mode))
        .sort((a, b) => a.name.localeCompare(b.name));
    });
    setIsModeEditorVisible(false);
    setEditingMode(null);
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      Alert.alert(
        'Restore purchases',
        'RevenueCat is not connected yet. This button is ready for the restore call when billing is added.',
      );
    } finally {
      setIsRestoring(false);
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
                <Text style={styles.sectionLabel}>Flagged apps</Text>
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
                            <Pressable
                              key={app.appIdentifier}
                              accessibilityRole="button"
                              accessibilityLabel={`${app.displayName}. Long press to remove.`}
                              onLongPress={() => removeApp(app)}
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
                          ))}
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Add app"
                            disabled={isPickingApp}
                            onPress={handleAddApp}
                            style={({ pressed }) => [
                              styles.addAppIconButton,
                              pressed && styles.pressed,
                            ]}
                          >
                            {isPickingApp ? (
                              <ActivityIndicator color={colors.ink} />
                            ) : (
                              <Text style={styles.plusText}>+</Text>
                            )}
                          </Pressable>
                        </ScrollView>
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

              {paidUser ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Custom modes</Text>
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
                              {formatGracePeriod(mode.gracePeriodSeconds)} ·{' '}
                              {mode.frameWidthRange[0]}-{mode.frameWidthRange[1]}%
                              frame
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
                        <Text style={styles.rowDetail}>
                          RevenueCat entitlement check pending.
                        </Text>
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
        onSave={handleSaveMode}
      />
      <AppPickerModal
        apps={availableInstalledApps}
        isSaving={isPickingApp}
        query={appPickerQuery}
        remainingSlots={remainingFreeAppSlots}
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

function AppPickerModal({
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
}: {
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
  const allVisibleSelected =
    apps.length > 0 && apps.every(app => selectedAppSet.has(app.packageName));
  const canSelectMore = selectedCount < remainingSlots;

  return (
    <Modal
      animationType="slide"
      visible={visible}
      onRequestClose={onCancel}
    >
      <View
        style={[
          styles.appPickerScreen,
          { paddingTop: insets.top + 22, paddingBottom: insets.bottom },
        ]}
      >
        <View style={styles.appPickerHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={allVisibleSelected ? 'Clear all' : 'Select all'}
            onPress={() => onToggleAllVisible(apps)}
            style={({ pressed }) => [
              styles.selectAllButton,
              pressed && styles.pressed,
            ]}
          >
            <View
              style={[
                styles.selectionCircle,
                allVisibleSelected && styles.selectionCircleSelected,
              ]}
            />
            <Text style={styles.selectAllText}>All</Text>
          </Pressable>
          <Text style={styles.appPickerTitle}>Add apps</Text>
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

        {isSearchVisible ? (
          <View style={styles.appPickerSearchWrap}>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              placeholder="Search"
              placeholderTextColor="rgba(255, 255, 255, 0.42)"
              value={query}
              onChangeText={onChangeQuery}
              style={styles.appPickerSearch}
            />
          </View>
        ) : null}

        <Text style={styles.appPickerSectionLabel}>Add apps from phone</Text>
        <View style={styles.appPickerListShell}>
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator
            contentContainerStyle={styles.appPickerList}
          >
            {apps.map(app => {
              const selected = selectedAppSet.has(app.packageName);
              const disabled = !selected && !canSelectMore;

              return (
                <Pressable
                  key={app.packageName}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected, disabled }}
                  accessibilityLabel={app.displayName}
                  disabled={disabled}
                  onPress={() => onToggleApp(app)}
                  style={({ pressed }) => [
                    styles.appPickerRow,
                    pressed && styles.pressed,
                    disabled && styles.appPickerRowDisabled,
                  ]}
                >
                  <View
                    style={[
                      styles.selectionCircle,
                      selected && styles.selectionCircleSelected,
                    ]}
                  />
                  <Image
                    source={{ uri: `data:image/png;base64,${app.iconBase64}` }}
                    style={styles.appPickerIcon}
                  />
                  <Text style={styles.appPickerAppName} numberOfLines={1}>
                    {app.displayName}
                  </Text>
                </Pressable>
              );
            })}
            {apps.length === 0 ? (
              <View style={styles.appPickerEmpty}>
                <Text style={styles.emptyText}>No apps found.</Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function CustomModeEditorModal({
  visible,
  mode,
  onCancel,
  onSave,
}: {
  visible: boolean;
  mode: CustomMode | null;
  onCancel: () => void;
  onSave: (input: {
    id?: string;
    name: string;
    gracePeriodSeconds: number;
  }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [gracePeriodSeconds, setGracePeriodSeconds] = useState(12);
  const [trackWidth, setTrackWidth] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setName(mode?.name ?? '');
    setGracePeriodSeconds(mode?.gracePeriodSeconds ?? 12);
    setIsSaving(false);
  }, [mode, visible]);

  const clampedName = name.trim().slice(0, 20);
  const progress =
    (gracePeriodSeconds - MIN_GRACE_SECONDS) /
    (MAX_GRACE_SECONDS - MIN_GRACE_SECONDS);

  const setGraceFromPosition = (locationX: number) => {
    if (trackWidth <= 0) {
      return;
    }

    const rawProgress = Math.max(0, Math.min(1, locationX / trackWidth));
    const nextValue = Math.round(
      MIN_GRACE_SECONDS +
        rawProgress * (MAX_GRACE_SECONDS - MIN_GRACE_SECONDS),
    );
    setGracePeriodSeconds(nextValue);
  };

  const submit = async () => {
    if (clampedName.length === 0) {
      Alert.alert('Name required', 'Add a name for this custom mode.');
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        id: mode?.id,
        name: clampedName,
        gracePeriodSeconds,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onCancel}
    >
      <View style={styles.modalBackdrop}>
        <LinearGradient
          colors={['#333333', '#141414']}
          style={styles.modeEditorCard}
        >
          <Text style={styles.modeEditorTitle}>
            {mode ? 'Edit custom mode' : 'Create custom mode'}
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              value={name}
              onChangeText={value => setName(value.slice(0, 20))}
              placeholder="Focus mode"
              placeholderTextColor={colors.muted}
              maxLength={20}
              style={styles.textInput}
            />
          </View>

          <View style={styles.fieldGroup}>
            <View style={styles.sliderHeader}>
              <Text style={styles.fieldLabel}>Grace period</Text>
              <Text style={styles.sliderValue}>
                {formatGracePeriod(gracePeriodSeconds)}
              </Text>
            </View>
            <Pressable
              accessibilityRole="adjustable"
              accessibilityLabel="Grace period"
              accessibilityValue={{ text: `${gracePeriodSeconds} seconds` }}
              onPress={event =>
                setGraceFromPosition(event.nativeEvent.locationX)
              }
              onLayout={event => setTrackWidth(event.nativeEvent.layout.width)}
              style={styles.sliderTrack}
            >
              <View
                style={[
                  styles.sliderFill,
                  { width: `${Math.round(progress * 100)}%` },
                ]}
              />
              <View
                style={[
                  styles.sliderThumb,
                  { left: `${Math.round(progress * 100)}%` },
                ]}
              />
            </Pressable>
            <Text style={styles.rowDetail}>
              Frame default: {inferFrameWidthRange(gracePeriodSeconds)}
            </Text>
          </View>

          <View style={styles.modalActions}>
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={({ pressed }) => [
                styles.secondaryAction,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryActionText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={submit}
              disabled={isSaving}
              style={({ pressed }) => [
                styles.primaryAction,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryActionText}>
                {isSaving ? 'Saving...' : 'Save'}
              </Text>
            </Pressable>
          </View>
        </LinearGradient>
      </View>
    </Modal>
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
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
  },
  loadingWrap: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { marginTop: 28 },
  sectionLabel: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
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
    paddingVertical: 4,
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
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  appIconButton: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  plusText: {
    color: colors.ink,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '700',
  },
  rowTitle: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  rowDetail: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  addRow: { justifyContent: 'flex-start' },
  addText: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
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
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
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
  selectionCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#6f6f7b',
    backgroundColor: 'transparent',
  },
  selectionCircleSelected: {
    borderColor: colors.ink,
    backgroundColor: colors.ink,
  },
  selectAllText: {
    marginTop: 5,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 18,
  },
  appPickerTitle: {
    flex: 1,
    color: colors.ink,
    fontSize: 30,
    lineHeight: 38,
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
    fontSize: 21,
    lineHeight: 28,
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
  appPickerSearchWrap: {
    minHeight: 50,
    marginTop: 8,
    marginLeft: 88,
    marginRight: 0,
    borderRadius: 25,
    backgroundColor: '#2d2d2d',
    justifyContent: 'center',
  },
  appPickerSearch: {
    minHeight: 50,
    paddingHorizontal: 22,
    color: colors.ink,
    fontSize: 18,
    lineHeight: 24,
  },
  appPickerSectionLabel: {
    marginTop: 28,
    marginBottom: 14,
    color: 'rgba(255, 255, 255, 0.62)',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  appPickerListShell: {
    flex: 1,
    borderRadius: 26,
    backgroundColor: '#111111',
    overflow: 'hidden',
  },
  appPickerList: {
    paddingVertical: 16,
  },
  appPickerRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingLeft: 16,
    paddingRight: 26,
  },
  appPickerRowDisabled: {
    opacity: 0.45,
  },
  appPickerIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
  },
  appPickerAppName: {
    flex: 1,
    minWidth: 0,
    color: colors.ink,
    fontSize: 21,
    lineHeight: 28,
  },
  appPickerEmpty: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  attentionPill: {
    backgroundColor: colors.mutedRust,
  },
  attentionPillText: { color: colors.warmWhite },
  tierText: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  premiumText: { color: colors.rewardAmber },
  pressed: { opacity: 0.55 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modeEditorCard: {
    width: '100%',
    maxWidth: 370,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 18,
    gap: 18,
  },
  modeEditorTitle: {
    color: colors.ink,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  textInput: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: colors.module,
    color: colors.ink,
    paddingHorizontal: 12,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
  },
  sliderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sliderValue: {
    color: colors.rewardAmber,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  sliderTrack: {
    height: 36,
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: colors.module,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    overflow: 'hidden',
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(200, 145, 46, 0.34)',
  },
  sliderThumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    marginLeft: -9,
    borderRadius: 9,
    backgroundColor: colors.rewardAmber,
    borderWidth: 2,
    borderColor: colors.warmWhite,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryAction: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: colors.module,
  },
  secondaryActionText: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  primaryAction: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
  },
  primaryActionText: {
    color: colors.background,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
});
