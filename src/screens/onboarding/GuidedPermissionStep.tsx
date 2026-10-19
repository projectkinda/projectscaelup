import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { SettingsGuide } from '../../components/settingsGuide/SettingsGuide';
import { LockdownModule } from '../../domain/lockdownModule';
import {
  getRequiredPermissionStatus,
  type RequiredPermissionStatus,
} from '../../domain/onboardingState';
import { hasConsent, recordConsent } from '../../domain/permissionConsent';
import {
  guideFor,
  variantForDevice,
  type PermissionGuideConfig,
} from '../../domain/settingsGuideConfig';
import { UsageTrackingModule } from '../../domain/usageTrackingModule';
import { colors } from '../../theme/tokens';

type GuidedPermission = PermissionGuideConfig['id'];

type Props = {
  permission: GuidedPermission;
  onBack: () => void;
  onStatusChange: (status: RequiredPermissionStatus) => void;
};

/** Which phone family's wording and look to draw. Android only. */
function useDeviceVariant() {
  return useMemo(() => {
    const constants = (Platform.constants ?? {}) as {
      Manufacturer?: string;
      Brand?: string;
    };
    return variantForDevice({
      manufacturer: constants.Manufacturer,
      brand: constants.Brand,
    });
  }, []);
}

/** Wires SettingsGuide to the real Android settings for one permission. */
export function GuidedPermissionStep({ permission, onBack, onStatusChange }: Props) {
  const variant = useDeviceVariant();
  const config = useMemo(() => guideFor(permission, variant), [permission, variant]);
  const [consented, setConsented] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    hasConsent(config.consentKey)
      .catch(() => false)
      .then(value => {
        if (!cancelled) setConsented(value);
      });
    return () => {
      cancelled = true;
    };
  }, [config.consentKey]);

  const checkEnabled = useCallback(
    () =>
      permission === 'accessibility'
        ? UsageTrackingModule.isEnabled()
        : LockdownModule.canDrawOverlays(),
    [permission],
  );

  const openSettings = useCallback(() => {
    if (permission === 'accessibility') {
      UsageTrackingModule.openSettings();
    } else {
      LockdownModule.openSettings();
    }
  }, [permission]);

  const onConsent = useCallback(
    () => recordConsent(config.consentKey),
    [config.consentKey],
  );

  // Refresh the shared status before leaving so the hub shows the new state.
  const leave = useCallback(() => {
    void getRequiredPermissionStatus().then(onStatusChange).catch(() => {});
    onBack();
  }, [onBack, onStatusChange]);

  if (consented === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  return (
    <SettingsGuide
      config={config}
      variant={variant}
      consented={consented}
      checkEnabled={checkEnabled}
      openSettings={openSettings}
      openAppInfo={UsageTrackingModule.openAppInfo}
      onConsent={onConsent}
      onBack={leave}
      onSkip={leave}
      onDone={leave}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
