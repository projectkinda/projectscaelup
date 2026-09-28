import { Camera, type PermissionResponse } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LockdownModule } from '../../domain/lockdownModule';
import {
  getRequiredPermissionStatus,
  type RequiredPermissionStatus,
} from '../../domain/onboardingState';
import { UsageTrackingModule } from '../../domain/usageTrackingModule';
import { colors, layout } from '../../theme/tokens';
import { type PermissionKind } from './PermissionsHub';

type PermissionStepProps = {
  permission: PermissionKind;
  status: RequiredPermissionStatus;
  onBack: () => void;
  onStatusChange: (status: RequiredPermissionStatus) => void;
};

const GUIDANCE = [
  'Samsung: Settings > Accessibility > Installed apps',
  'Pixel: Settings > Accessibility > Downloaded apps',
  'Xiaomi / Redmi / POCO: Settings > Additional settings > Accessibility > Downloaded apps',
  'OnePlus / Oppo / Realme: Settings > Additional settings > Accessibility > Downloaded apps',
  'Vivo: Settings > Accessibility > Installed services',
  "Toggle greyed out? Phone Settings > Apps > Project ScaleUp > menu > Allow restricted settings",
  "Switches itself off? Set the app's Battery to Unrestricted",
];

function permissionIsOn(
  status: RequiredPermissionStatus,
  permission: PermissionKind,
) {
  return status[permission];
}

function statusMessage(permission: PermissionKind) {
  if (permission === 'accessibility') {
    return 'Accessibility is on.';
  }
  if (permission === 'overlay') {
    return 'Display over other apps is on.';
  }
  return 'Camera is on.';
}

function hintMessage(permission: PermissionKind) {
  if (permission === 'accessibility') {
    return 'Not on yet. Look for Project ScaleUp under Installed apps.';
  }
  if (permission === 'overlay') {
    return 'Not on yet. Open Project ScaleUp and allow display over other apps.';
  }
  return 'Not on yet. Camera access is still off.';
}

export function PermissionStep({
  permission,
  status,
  onBack,
  onStatusChange,
}: PermissionStepProps) {
  const insets = useSafeAreaInsets();
  const [cameraPermission, setCameraPermission] =
    useState<PermissionResponse | null>(null);
  const [accessibilityDisclosureAccepted, setAccessibilityDisclosureAccepted] =
    useState(false);
  const [showGuidance, setShowGuidance] = useState(false);
  const [waitingForSettings, setWaitingForSettings] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkAndReturnIfOn = useCallback(async () => {
    const nextStatus = await getRequiredPermissionStatus();
    onStatusChange(nextStatus);

    if (permissionIsOn(nextStatus, permission)) {
      setHint(null);
      setSuccess(true);
      successTimeoutRef.current = setTimeout(onBack, 600);
      return true;
    }

    setSuccess(false);
    setHint(hintMessage(permission));
    return false;
  }, [onBack, onStatusChange, permission]);

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

    setWaitingForSettings(true);
    await Linking.openSettings();
  };

  const handleOpenSettings = () => {
    setWaitingForSettings(true);
    setHint(null);
    if (permission === 'accessibility') {
      UsageTrackingModule.openSettings();
      return;
    }
    LockdownModule.openSettings();
  };

  const body = renderBody({
    permission,
    accessibilityDisclosureAccepted,
    showGuidance,
  });
  const primaryLabel =
    permission === 'camera'
      ? cameraPermission?.canAskAgain === false &&
        cameraPermission.status !== 'granted'
        ? 'Open settings'
        : 'Allow camera'
      : permission === 'accessibility' && !accessibilityDisclosureAccepted
        ? 'I understand, continue'
        : 'Open settings';

  const handlePrimaryPress =
    permission === 'camera'
      ? handleCameraPress
      : permission === 'accessibility' && !accessibilityDisclosureAccepted
        ? () => setAccessibilityDisclosureAccepted(true)
        : handleOpenSettings;

  return (
    <View style={styles.screen}>
      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 26,
            paddingBottom: insets.bottom + 32,
          },
        ]}
      >
        <View style={styles.content}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onBack}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.backArrow}>‹</Text>
          </Pressable>

          <View style={styles.card}>
            {body}

            {success ? (
              <Text accessibilityLiveRegion="polite" style={styles.successText}>
                {statusMessage(permission)}
              </Text>
            ) : null}
            {hint && !success ? (
              <Text accessibilityLiveRegion="polite" style={styles.hintText}>
                {hint}
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              onPress={handlePrimaryPress}
              style={({ pressed }) => [
                styles.primaryShell,
                pressed && styles.pressed,
              ]}
            >
              <LinearGradient
                colors={['#333333', '#141414']}
                pointerEvents="none"
                style={styles.primaryButton}
              >
                <Text style={styles.primaryLabel}>{primaryLabel}</Text>
              </LinearGradient>
            </Pressable>

            {permission !== 'camera' &&
            (permission !== 'accessibility' ||
              accessibilityDisclosureAccepted) ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  onPress={checkAndReturnIfOn}
                  style={({ pressed }) => [
                    styles.textButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.textButtonLabel}>
                    I've turned it on
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showGuidance }}
                  onPress={() => setShowGuidance(current => !current)}
                  style={({ pressed }) => [
                    styles.textButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.textButtonLabel}>Can't find it?</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function renderBody({
  permission,
  accessibilityDisclosureAccepted,
  showGuidance,
}: {
  permission: PermissionKind;
  accessibilityDisclosureAccepted: boolean;
  showGuidance: boolean;
}) {
  if (permission === 'camera') {
    return (
      <>
        <StepIllustration />
        <Text style={styles.title}>Camera</Text>
        <Text style={styles.bodyText}>
          Checks you're still at your desk while a session runs. Each frame is
          checked on your phone and deleted straight away. Nothing is uploaded.
        </Text>
      </>
    );
  }

  if (permission === 'accessibility' && !accessibilityDisclosureAccepted) {
    return (
      <>
        <StepIllustration />
        <Text style={styles.title}>Accessibility access</Text>
        <Text style={styles.bodyText}>
          Android calls this Accessibility. Project ScaleUp uses it for one
          thing: knowing which app is in front. It can't read what's on your
          screen, your messages or anything you type. Nothing leaves your phone.
        </Text>
      </>
    );
  }

  const steps =
    permission === 'accessibility'
      ? [
          'Tap Open settings.',
          'Find Installed apps (or Downloaded apps) and open it.',
          'Tap Project ScaleUp, switch it on, then tap Allow.',
        ]
      : [
          'Tap Open settings.',
          'Tap Project ScaleUp.',
          'Switch on Allow display over other apps.',
        ];

  return (
    <>
      <Text style={styles.title}>
        {permission === 'accessibility' ? 'Turn it on' : 'Display over other apps'}
      </Text>
      {permission === 'overlay' ? (
        <Text style={styles.bodyText}>
          Lets the lock screen appear on top of an app you've locked. Nothing
          else.
        </Text>
      ) : null}
      <View style={styles.stepsList}>
        {steps.map((step, index) => (
          <View key={step} style={styles.stepRow}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{index + 1}</Text>
            </View>
            <View style={styles.stepCopy}>
              <SettingsSketch activeIndex={index} />
              <Text style={styles.stepText}>{step}</Text>
            </View>
          </View>
        ))}
      </View>
      {showGuidance ? (
        <View style={styles.guidance}>
          {GUIDANCE.map(item => (
            <Text key={item} style={styles.guidanceText}>
              {item}
            </Text>
          ))}
        </View>
      ) : null}
    </>
  );
}

function StepIllustration() {
  return (
    <View style={styles.illustration}>
      <View style={styles.phoneShape}>
        <View style={styles.phoneNotch} />
        <View style={styles.phoneLine} />
        <View style={[styles.phoneLine, styles.phoneLineShort]} />
      </View>
    </View>
  );
}

function SettingsSketch({ activeIndex }: { activeIndex: number }) {
  return (
    <View style={styles.sketch}>
      {[0, 1, 2].map(index => (
        <View
          key={index}
          style={[
            styles.sketchRow,
            index === activeIndex && styles.sketchRowActive,
          ]}
        />
      ))}
    </View>
  );
}

const CARD_BORDER = 'rgba(255, 255, 255, 0.12)';

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
  },
  content: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    paddingHorizontal: layout.horizontalPadding,
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.module,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  backArrow: {
    color: colors.ink,
    fontSize: 38,
    lineHeight: 42,
    fontWeight: '500',
    marginTop: -4,
  },
  card: {
    marginTop: 34,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: colors.module,
    padding: 18,
  },
  illustration: {
    height: 138,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneShape: {
    width: 78,
    height: 112,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: colors.ink,
    backgroundColor: '#1B1B1B',
    paddingTop: 28,
    paddingHorizontal: 13,
    transform: [{ rotate: '8deg' }],
  },
  phoneNotch: {
    position: 'absolute',
    top: 9,
    alignSelf: 'center',
    width: 24,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.20)',
  },
  phoneLine: {
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    marginTop: 10,
  },
  phoneLineShort: {
    width: '64%',
  },
  title: {
    color: colors.ink,
    fontSize: 31,
    lineHeight: 38,
    fontWeight: '800',
  },
  bodyText: {
    marginTop: 18,
    color: colors.ink,
    fontSize: 18,
    lineHeight: 28,
    fontWeight: '500',
  },
  stepsList: {
    marginTop: 24,
    gap: 18,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 14,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: colors.background,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
  },
  stepCopy: {
    flex: 1,
    minWidth: 0,
  },
  stepText: {
    marginTop: 8,
    color: colors.ink,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
  },
  sketch: {
    height: 78,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: '#171717',
    padding: 10,
    gap: 8,
  },
  sketchRow: {
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  sketchRowActive: {
    backgroundColor: 'rgba(237, 237, 237, 0.30)',
  },
  successText: {
    marginTop: 18,
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  hintText: {
    marginTop: 18,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
  primaryShell: {
    width: '100%',
    height: 53,
    borderRadius: 12,
    marginTop: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  primaryButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    color: colors.warmWhite,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
  },
  textButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  textButtonLabel: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  guidance: {
    marginTop: 20,
    gap: 8,
  },
  guidanceText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.995 }],
  },
});
