import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import {
  getRequiredPermissionStatus,
  type RequiredPermissionStatus,
} from '../../domain/onboardingState';
import { colors } from '../../theme/tokens';
import {
  PermissionsHub,
  type PermissionKind,
} from './PermissionsHub';
import { PermissionStep } from './PermissionStep';

type OnboardingFlowProps = {
  mode: 'onboarding' | 'gate';
  initialStatus?: RequiredPermissionStatus | null;
  onComplete?: () => void;
  onPermissionsReady?: () => void;
};

const steps = ['permissions'] as const;

export function OnboardingFlow({
  mode,
  initialStatus,
  onComplete,
  onPermissionsReady,
}: OnboardingFlowProps) {
  const [currentStep] = useState<(typeof steps)[number]>(steps[0]);
  const [permissionStep, setPermissionStep] = useState<PermissionKind | null>(
    null,
  );
  const [status, setStatus] = useState<RequiredPermissionStatus | null>(
    initialStatus ?? null,
  );

  const refreshStatus = useCallback(async () => {
    const next = await getRequiredPermissionStatus();
    setStatus(next);
    if (mode === 'gate' && next.all) {
      onPermissionsReady?.();
    }
    return next;
  }, [mode, onPermissionsReady]);

  useEffect(() => {
    if (!status) {
      void refreshStatus();
    }
  }, [refreshStatus, status]);

  useEffect(() => {
    if (initialStatus) {
      setStatus(initialStatus);
    }
  }, [initialStatus]);

  if (!status) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  if (permissionStep) {
    return (
      <PermissionStep
        permission={permissionStep}
        status={status}
        onBack={() => {
          setPermissionStep(null);
          void refreshStatus();
        }}
        onStatusChange={setStatus}
      />
    );
  }

  if (currentStep === 'permissions') {
    return (
      <PermissionsHub
        mode={mode}
        status={status}
        onOpenStep={setPermissionStep}
        onContinue={onComplete}
      />
    );
  }

  return null;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
