import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { getAppState, setAppState } from '../../data/appStateRepository';
import { loadSettingsData } from '../../data/settingsRepository';
import {
  getRequiredPermissionStatus,
  type RequiredPermissionStatus,
} from '../../domain/onboardingState';
import { colors } from '../../theme/tokens';
import { AppsStep } from './AppsStep';
import { DoneStep } from './DoneStep';
import {
  PermissionsHub,
  type PermissionKind,
} from './PermissionsHub';
import { PermissionStep } from './PermissionStep';
import { WelcomeStep } from './WelcomeStep';

type OnboardingFlowProps = {
  mode: 'onboarding' | 'gate';
  initialStatus?: RequiredPermissionStatus | null;
  onComplete?: () => void;
  onPermissionsReady?: () => void;
};

const ONBOARDING_STEP_KEY = 'onboarding_step';
const steps = ['welcome', 'apps', 'permissions', 'done'] as const;
type OnboardingStep = (typeof steps)[number];

function isOnboardingStep(value: string | null): value is OnboardingStep {
  return steps.includes(value as OnboardingStep);
}

function stepIndex(step: OnboardingStep) {
  return steps.indexOf(step);
}

export function OnboardingFlow({
  mode,
  initialStatus,
  onComplete,
  onPermissionsReady,
}: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(
    mode === 'gate' ? 'permissions' : 'welcome',
  );
  const [permissionStep, setPermissionStep] = useState<PermissionKind | null>(
    null,
  );
  const [status, setStatus] = useState<RequiredPermissionStatus | null>(
    initialStatus ?? null,
  );
  const [selectedAppIds, setSelectedAppIds] = useState<string[]>([]);
  const [selectedAppNames, setSelectedAppNames] = useState<string[]>([]);
  const [isRestoringStep, setIsRestoringStep] = useState(mode === 'onboarding');

  const refreshStatus = useCallback(async () => {
    const next = await getRequiredPermissionStatus();
    setStatus(next);
    if (mode === 'gate' && next.all) {
      onPermissionsReady?.();
    }
    return next;
  }, [mode, onPermissionsReady]);

  const refreshSelectedApps = useCallback(async () => {
    const settingsData = await loadSettingsData();
    setSelectedAppIds(settingsData.flaggedApps.map(app => app.appIdentifier));
    setSelectedAppNames(settingsData.flaggedApps.map(app => app.displayName));
    return settingsData.flaggedApps;
  }, []);

  const moveToStep = useCallback(async (step: OnboardingStep) => {
    setPermissionStep(null);
    setCurrentStep(step);
    await setAppState(ONBOARDING_STEP_KEY, step);
  }, []);

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

  useEffect(() => {
    if (mode !== 'onboarding') {
      setIsRestoringStep(false);
      return;
    }

    let cancelled = false;

    async function restoreStep() {
      const [savedStepValue, permissionStatus, flaggedApps] = await Promise.all([
        getAppState(ONBOARDING_STEP_KEY),
        getRequiredPermissionStatus(),
        loadSettingsData().then(data => data.flaggedApps),
      ]);

      if (cancelled) {
        return;
      }

      setStatus(permissionStatus);
      setSelectedAppIds(flaggedApps.map(app => app.appIdentifier));
      setSelectedAppNames(flaggedApps.map(app => app.displayName));

      let nextStep: OnboardingStep = isOnboardingStep(savedStepValue)
        ? savedStepValue
        : 'welcome';

      if (
        flaggedApps.length === 0 &&
        stepIndex(nextStep) >= stepIndex('permissions')
      ) {
        nextStep = 'apps';
      } else if (
        !permissionStatus.all &&
        stepIndex(nextStep) > stepIndex('permissions')
      ) {
        nextStep = 'permissions';
      }

      setCurrentStep(nextStep);
      setIsRestoringStep(false);
    }

    restoreStep().catch(error => {
      console.warn('Failed to restore onboarding step:', error);
      if (!cancelled) {
        setCurrentStep('welcome');
        setIsRestoringStep(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [mode]);

  const canGoBack = mode === 'onboarding' && stepIndex(currentStep) > 0;
  const goBack = () => {
    if (!canGoBack) {
      return;
    }
    const previousStep = steps[stepIndex(currentStep) - 1];
    void moveToStep(previousStep);
  };

  const selectedAppNamesForPermission = useMemo(
    () => selectedAppNames.filter(Boolean),
    [selectedAppNames],
  );

  if (!status || isRestoringStep) {
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
        appNames={selectedAppNamesForPermission}
        onBack={() => {
          setPermissionStep(null);
          void refreshStatus();
        }}
        onStatusChange={setStatus}
      />
    );
  }

  if (mode === 'onboarding' && currentStep === 'welcome') {
    return <WelcomeStep onContinue={() => void moveToStep('apps')} />;
  }

  if (mode === 'onboarding' && currentStep === 'apps') {
    return (
      <AppsStep
        selectedIds={selectedAppIds}
        onSelectedIdsChange={setSelectedAppIds}
        onBack={goBack}
        onContinue={() => {
          void (async () => {
            await refreshSelectedApps();
            await moveToStep('permissions');
          })();
        }}
      />
    );
  }

  if (currentStep === 'permissions') {
    return (
      <PermissionsHub
        mode={mode}
        status={status}
        onBack={mode === 'onboarding' ? goBack : undefined}
        onOpenStep={setPermissionStep}
        onContinue={() => void moveToStep('done')}
      />
    );
  }

  if (mode === 'onboarding' && currentStep === 'done') {
    return (
      <DoneStep
        onBack={goBack}
        onComplete={() => {
          void setAppState(ONBOARDING_STEP_KEY, 'done');
          onComplete?.();
        }}
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
