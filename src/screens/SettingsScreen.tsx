import { Camera } from 'expo-camera';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomNavigation } from '../components/BottomNavigation';
import {
  type CustomMode,
  type FlaggedApp,
  loadSettingsData,
  removeCustomMode,
  removeFlaggedApp,
} from '../data/settingsRepository';
import { colors, layout } from '../theme/tokens';

type SettingsScreenProps = {
  onNavigate: (screen: string) => void;
};

type PermissionState = 'granted' | 'revoked' | 'unavailable';

type PermissionRow = {
  id: string;
  label: string;
  detail: string;
  state: PermissionState;
  fix: () => void;
};

const IS_PAID_USER = false;
const CARD_BORDER = 'rgba(255, 255, 255, 0.12)';

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

async function openAccessibilitySettings() {
  if (Platform.OS === 'android') {
    try {
      await Linking.sendIntent('android.settings.ACCESSIBILITY_SETTINGS');
      return;
    } catch {
      // Fall back to the app settings page below.
    }
  }

  await Linking.openSettings();
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

  const load = useCallback(async () => {
    setIsLoading(true);

    const [settingsData, cameraPermission] = await Promise.all([
      loadSettingsData({ isPaidUser: IS_PAID_USER }),
      Camera.getCameraPermissionsAsync(),
    ]);

    setFlaggedApps(settingsData.flaggedApps);
    setCustomModes(settingsData.customModes);
    setPermissions([
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
        state: 'unavailable',
        fix: openAccessibilitySettings,
      },
    ]);
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

  const handleAddApp = () => {
    Alert.alert(
      'Add app',
      'This will use the onboarding app picker once the native usage-tracking picker is connected.',
    );
  };

  const handleEditMode = () => {
    Alert.alert(
      'Edit mode',
      'Custom mode editing will be enabled with the paid custom-mode builder.',
    );
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

              {IS_PAID_USER ? (
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
                              {formatGracePeriod(mode.gracePeriodSeconds)}
                            </Text>
                          </View>
                          <View style={styles.actionGroup}>
                            <Pressable
                              accessibilityRole="button"
                              onPress={handleEditMode}
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
                          IS_PAID_USER && styles.premiumText,
                        ]}
                      >
                        {IS_PAID_USER ? 'Premium' : 'Free'}
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
});
