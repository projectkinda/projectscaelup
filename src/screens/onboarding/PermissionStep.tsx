import { BackButton } from './DoneStep';
import { typography } from '../../theme/typography';
import { Text } from '../../components/AppText';
import { PillButton } from '../../components/settingsGuide/PillButton';
import { Camera, type PermissionResponse } from 'expo-camera';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Linking,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenTime } from '../../../modules/screen-time';
import {
  getRequiredPermissionStatus,
  type RequiredPermissionStatus,
} from '../../domain/onboardingState';
import { colors, layout } from '../../theme/tokens';
import { GuidedPermissionStep } from './GuidedPermissionStep';
import { type PermissionKind } from './PermissionsHub';

type PermissionStepProps = {
  permission: PermissionKind;
  status: RequiredPermissionStatus;
  onBack: () => void;
  onStatusChange: (status: RequiredPermissionStatus) => void;
};

// Accessibility and "display over other apps" need a trip to Settings, so
// they get the disclosure + guided steps (SettingsGuide). Camera and Screen
// Time show a system pop-up instead, so they only get a one-line reason first.
export function PermissionStep(props: PermissionStepProps) {
  if (props.permission === 'accessibility' || props.permission === 'overlay') {
    return (
      <GuidedPermissionStep
        permission={props.permission}
        onBack={props.onBack}
        onStatusChange={props.onStatusChange}
      />
    );
  }
  return <PopupPermissionStep {...props} />;
}

// Apple may not show its Screen Time popup again after a No, so a denied
// user gets both paths: Settings, and asking again.
const SCREEN_TIME_DENIED_HINT =
  'Screen Time is off for Project ScaleUp. Turn it on in Settings > Screen Time, or ask again.';

const PRE_PROMPT: Record<'camera' | 'screenTime', { title: string; reason: string }> = {
  camera: {
    title: 'Camera',
    reason: "ScaleUp checks you're at your desk. Frames stay on your phone.",
  },
  screenTime: {
    title: 'Screen Time',
    reason: 'Lets ScaleUp notice and lock the apps you pick. Apple keeps your picks private.',
  },
};

function screenTimeDeniedAtStart(permission: PermissionKind) {
  return (
    permission === 'screenTime' &&
    ScreenTime.getStatus()?.authorization === 'denied'
  );
}

function PopupPermissionStep({
  permission,
  onBack,
  onStatusChange,
}: PermissionStepProps) {
  const insets = useSafeAreaInsets();
  const kind = permission === 'screenTime' ? 'screenTime' : 'camera';
  const copy = PRE_PROMPT[kind];
  const [cameraPermission, setCameraPermission] =
    useState<PermissionResponse | null>(null);
  const [waitingForSettings, setWaitingForSettings] = useState(false);
  const [screenTimeDenied, setScreenTimeDenied] = useState(() =>
    screenTimeDeniedAtStart(permission),
  );
  const [hint, setHint] = useState<string | null>(() =>
    screenTimeDeniedAtStart(permission) ? SCREEN_TIME_DENIED_HINT : null,
  );
  const [success, setSuccess] = useState(false);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkAndReturnIfOn = useCallback(async () => {
    const nextStatus = await getRequiredPermissionStatus();
    onStatusChange(nextStatus);

    if (nextStatus[kind]) {
      setHint(null);
      setSuccess(true);
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
      successTimeoutRef.current = setTimeout(onBack, 600);
      return true;
    }

    setSuccess(false);
    setHint(
      kind === 'screenTime'
        ? SCREEN_TIME_DENIED_HINT
        : 'Not on yet. Camera access is still off.',
    );
    return false;
  }, [kind, onBack, onStatusChange]);

  useEffect(() => {
    if (permission !== 'camera') {
      return;
    }

    let cancelled = false;
    Camera.getCameraPermissionsAsync().then(next => {
      if (!cancelled) {
        setCameraPermission(next);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [permission]);

  useEffect(() => {
    if (!waitingForSettings) {
      return;
    }

    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void checkAndReturnIfOn();
      }
    });

    return () => subscription.remove();
  }, [checkAndReturnIfOn, waitingForSettings]);

  useEffect(
    () => () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    },
    [],
  );

  const openSettings = () => {
    setWaitingForSettings(true);
    setHint(null);
    void Linking.openSettings();
  };

  const handleCameraPress = async () => {
    const current =
      cameraPermission ?? (await Camera.getCameraPermissionsAsync());

    if (current.status !== 'granted' && current.canAskAgain) {
      const next = await Camera.requestCameraPermissionsAsync();
      setCameraPermission(next);
      const nextStatus = await getRequiredPermissionStatus();
      onStatusChange(nextStatus);
      if (next.status === 'granted') {
        onBack();
      }
      return;
    }

    openSettings();
  };

  const handleScreenTimePress = async () => {
    setHint(null);
    try {
      await ScreenTime.requestAuthorization();
    } catch {
      // Saying no rejects the request; the status below reflects it.
    }
    const nextStatus = await getRequiredPermissionStatus();
    onStatusChange(nextStatus);
    if (nextStatus.screenTime) {
      onBack();
      return;
    }
    setScreenTimeDenied(true);
    setHint(SCREEN_TIME_DENIED_HINT);
  };

  const cameraBlocked =
    cameraPermission?.canAskAgain === false &&
    cameraPermission.status !== 'granted';
  const primaryLabel =
    kind === 'screenTime'
      ? screenTimeDenied
        ? 'Open settings'
        : 'Allow Screen Time'
      : cameraBlocked
        ? 'Open settings'
        : 'Allow camera';
  const handlePrimaryPress =
    kind === 'screenTime'
      ? screenTimeDenied
        ? openSettings
        : handleScreenTimePress
      : handleCameraPress;

  return (
    <View style={styles.screen}>
      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 26, paddingBottom: 24 },
        ]}
      >
        <View style={styles.content}>
          <BackButton onPress={onBack} />
          <Text accessibilityRole="header" style={styles.title}>
            {copy.title}
          </Text>
          <Text style={styles.reason}>{copy.reason}</Text>

          {success ? (
            <Text accessibilityLiveRegion="polite" style={styles.successText}>
              {kind === 'screenTime' ? 'Screen Time is on.' : 'Camera is on.'}
            </Text>
          ) : null}
          {hint && !success ? (
            <Text accessibilityLiveRegion="polite" style={styles.hintText}>
              {hint}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.barInner}>
          <PillButton label={primaryLabel} onPress={handlePrimaryPress} />
          {kind === 'screenTime' && screenTimeDenied ? (
            <>
              <PillButton
                kind="text"
                label="I've turned it on"
                onPress={() => void checkAndReturnIfOn()}
              />
              <PillButton
                kind="text"
                label="Ask again"
                onPress={() => void handleScreenTimePress()}
              />
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { flexGrow: 1, alignItems: 'center' },
  content: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    paddingHorizontal: layout.horizontalPadding,
  },
  title: { marginTop: 24, color: colors.ink, ...typography.title, fontWeight: '800' },
  reason: { marginTop: 16, color: colors.ink, ...typography.heading },
  successText: { marginTop: 24, color: colors.pine, ...typography.subheading, fontWeight: '600' },
  hintText: { marginTop: 24, color: colors.muted, ...typography.subheading, fontWeight: '600' },
  bar: {
    alignItems: 'center',
    paddingHorizontal: layout.horizontalPadding,
    paddingTop: 12,
    backgroundColor: colors.background,
  },
  barInner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 4 },
});
