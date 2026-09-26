import { Camera } from 'expo-camera';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
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
  canAddAnotherFlaggedApp,
  loadSettingsData,
  removeCustomMode,
  removeFlaggedApp,
  saveCustomMode,
} from '../data/settingsRepository';
import { LockdownModule } from '../domain/lockdownModule';
import { isPaidUser } from '../domain/paywall';
import { UsageTrackingModule } from '../domain/usageTrackingModule';
import { colors, layout } from '../theme/tokens';

type SettingsScreenProps = {
  onNavigate: (screen: string) => void;
};

type PermissionState = 'granted' | 'revoked' | 'unavailable';

// expo-camera's permission check doesn't resolve on web (no camera module
// there), which would otherwise hang this screen's initial load forever.
async function getCameraPermissionAsync() {
  if (Platform.OS === 'web') {
    return { status: 'undetermined' as const };
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
  if (state === 'granted') {
    return 'Granted';
  }

  if (state === 'revoked') {
    return 'Revoked';
  }

  return 'Unavailable';
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
          cameraPermission.status === 'granted' ? 'granted' : 'revoked',
        fix: () => {
          Linking.openSettings();
        },
      },
      {
        id: 'usage-tracking',
        label: Platform.OS === 'ios' ? 'Screen Time' : 'Accessibility',
        detail: "Used to track time in apps you've flagged as distracting.",
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

  const handleAddApp = async () => {
    const canAdd = await canAddAnotherFlaggedApp(isPaidUser());
    if (!canAdd) {
      onNavigate('paywall');
      return;
    }

    Alert.alert(
      'Add app',
      'This will use the onboarding app picker once the native usage-tracking picker is connected.',
    );
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
                    {flaggedApps.length > 0 ? (
                      flaggedApps.map(app => (
                        <View key={app.appIdentifier} style={styles.row}>
                          <View style={styles.flaggedAppMain}>
                            <View style={styles.appIconFallback}>
                              <Text style={styles.appIconText}>
                                {appInitial(app.displayName)}
                              </Text>
                            </View>
                            <View style={styles.rowTextWrap}>
                              <Text style={styles.rowTitle}>
                                {app.displayName}
                              </Text>
                              <Text style={styles.rowDetail}>
                                {app.appIdentifier}
                              </Text>
                            </View>
                          </View>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${app.displayName}`}
                            onPress={() => removeApp(app)}
                            style={({ pressed }) => [
                              styles.textAction,
                              pressed && styles.pressed,
                            ]}
                          >
                            <Text style={styles.actionText}>Remove</Text>
                          </Pressable>
                        </View>
                      ))
                    ) : (
                      <View style={styles.row}>
                        <Text style={styles.emptyText}>
                          No distracting apps selected yet.
                        </Text>
                      </View>
                    )}
                    <Pressable
                      accessibilityRole="button"
                      onPress={handleAddApp}
                      style={({ pressed }) => [
                        styles.row,
                        styles.addRow,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.addText}>Add app</Text>
                    </Pressable>
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
                  {permissions.map(permission => (
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
                            permission.state === 'revoked' &&
                              styles.revokedPill,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusPillText,
                              permission.state === 'revoked' &&
                                styles.revokedPillText,
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
    </View>
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
  flaggedAppMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  appIconFallback: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.module,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  appIconText: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 16,
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
  revokedPill: {
    backgroundColor: colors.mutedRust,
  },
  revokedPillText: { color: colors.warmWhite },
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
