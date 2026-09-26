import { Camera, CameraView } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LivePresenceCamera } from '../components/LivePresenceCamera';
import { SevenSegmentDigit } from '../components/SevenSegmentDigit';
import {
  PresenceModule,
  type PresenceResult,
} from '../domain/presenceModule';
import { formatDuration } from '../domain/sessionHistory';
import { colors, layout } from '../theme/tokens';

type ReadinessState =
  | 'checking-permission'
  | 'permission-revoked'
  | 'camera-loading'
  | 'no-presence'
  | 'too-far'
  | 'too-close'
  | 'off-center'
  | 'holding'
  | 'countdown';

type PreSessionReadinessScreenProps = {
  durationSeconds: number;
  modeName: string;
  onCancel: () => void;
  onReady: () => void;
};

const HOLD_MS = 1000;
const COUNTDOWN_START = 3;
const CARD_BORDER = 'rgba(255, 255, 255, 0.12)';

function statusCopy(state: ReadinessState) {
  switch (state) {
    case 'no-presence':
    case 'camera-loading':
      return 'Move into frame';
    case 'too-far':
      return 'Move a bit closer';
    case 'too-close':
      return 'Move back a little';
    case 'off-center':
      return 'Center yourself';
    case 'holding':
      return 'Hold still...';
    case 'permission-revoked':
      return 'Camera permission required';
    default:
      return '';
  }
}

export function PreSessionReadinessScreen({
  durationSeconds,
  modeName,
  onCancel,
  onReady,
}: PreSessionReadinessScreenProps) {
  const insets = useSafeAreaInsets();
  const [previewHeight, setPreviewHeight] = useState(0);
  const [state, setState] = useState<ReadinessState>('checking-permission');
  const [canAskForPermission, setCanAskForPermission] = useState(true);
  const [countdown, setCountdown] = useState(COUNTDOWN_START);
  const [presenceResult, setPresenceResult] = useState<PresenceResult | null>(
    null,
  );
  const [isCameraReady, setIsCameraReady] = useState(false);
  const previewMotion = useRef(new Animated.Value(0)).current;
  const cameraRef = useRef<CameraView>(null);
  const captureInFlight = useRef(false);
  const hasCompleted = useRef(false);
  const criteriaMet = useRef(false);
  const showCamera =
    state !== 'checking-permission' && state !== 'permission-revoked';

  const syncCameraPermission = useCallback(async () => {
    const permission = await Camera.getCameraPermissionsAsync();

    setCanAskForPermission(permission.canAskAgain);
    setState(
      permission.status === 'granted'
        ? 'camera-loading'
        : 'permission-revoked',
    );
  }, []);

  useEffect(() => {
    syncCameraPermission();

    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        syncCameraPermission();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [syncCameraPermission]);

  useEffect(
    () =>
      PresenceModule.onTick(result => {
        setPresenceResult(result);
        criteriaMet.current = result.presenceDetected;
        setState(current => {
          if (
            result.presenceDetected &&
            (current === 'camera-loading' || current === 'no-presence')
          ) {
            return 'holding';
          }

          if (
            !result.presenceDetected &&
            (current === 'holding' || current === 'countdown')
          ) {
            return 'no-presence';
          }

          return current;
        });
      }),
    [],
  );

  useEffect(() => {
    const canSample =
      PresenceModule.analyzesStillFrames &&
      showCamera &&
      isCameraReady &&
      !hasCompleted.current;

    if (!canSample) {
      return;
    }

    const capturePresenceFrame = async () => {
      if (captureInFlight.current) {
        return;
      }

      captureInFlight.current = true;
      try {
        const photo = await cameraRef.current?.takePictureAsync({
          base64: true,
          quality: 0.3,
          shutterSound: false,
        });

        if (photo?.base64) {
          await PresenceModule.reportFrame(photo.base64);
        }
      } catch (error) {
        console.warn('Failed to capture readiness presence frame:', error);
      } finally {
        captureInFlight.current = false;
      }
    };

    capturePresenceFrame();
    const intervalId = setInterval(capturePresenceFrame, 1500);

    return () => clearInterval(intervalId);
  }, [isCameraReady, showCamera, state]);

  useEffect(() => {
    if (!showCamera) {
      setIsCameraReady(false);
    }
  }, [showCamera]);

  useEffect(() => {
    if (state !== 'holding') {
      return;
    }

    const holdStartedAt = Date.now();
    const holdId = setInterval(() => {
      if (!criteriaMet.current) {
        setCountdown(COUNTDOWN_START);
        setState('no-presence');
        return;
      }

      if (Date.now() - holdStartedAt >= HOLD_MS) {
        setCountdown(COUNTDOWN_START);
        setState('countdown');
      }
    }, 100);

    return () => clearInterval(holdId);
  }, [state]);

  useEffect(() => {
    if (state !== 'countdown') {
      return;
    }

    if (!criteriaMet.current) {
      setCountdown(COUNTDOWN_START);
      setState('no-presence');
      return;
    }

    if (countdown <= 0) {
      if (hasCompleted.current) {
        return;
      }

      hasCompleted.current = true;
      let triggered = false;
      const triggerReady = () => {
        if (!triggered) {
          triggered = true;
          onReady();
        }
      };

      const fallbackTimer = setTimeout(triggerReady, 520);

      Animated.timing(previewMotion, {
        toValue: 1,
        duration: 480,
        useNativeDriver: false,
      }).start(() => {
        clearTimeout(fallbackTimer);
        triggerReady();
      });
      return;
    }

    const countdownId = setTimeout(() => {
      setCountdown(current => current - 1);
    }, 1000);

    return () => clearTimeout(countdownId);
  }, [countdown, onReady, previewMotion, state]);

  const handleCameraReady = () => {
    setIsCameraReady(true);
    if (criteriaMet.current) {
      setState(current =>
        current === 'camera-loading' || current === 'no-presence'
          ? 'holding'
          : current,
      );
    }
  };

  const handleRequestPermission = async () => {
    if (!canAskForPermission) {
      Linking.openSettings();
      return;
    }

    setState('checking-permission');
    const permission = await Camera.requestCameraPermissionsAsync();
    setCanAskForPermission(permission.canAskAgain);
    setState(
      permission.status === 'granted'
        ? 'camera-loading'
        : 'permission-revoked',
    );
  };

  const handleOpenSettings = () => {
    Linking.openSettings();
  };

  const previewAnimatedStyle = {
    opacity: previewMotion.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0.58],
    }),
    transform: [
      {
        translateY: previewMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -previewHeight * 0.38],
        }),
      },
      {
        translateX: previewMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 128],
        }),
      },
      {
        scale: previewMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0.18],
        }),
      },
    ],
  };

  const isCountdown = state === 'countdown';
  const showFaceGuide =
    showCamera && presenceResult?.faceWidthPercent !== null;
  const statusText =
    showCamera && presenceResult?.faceWidthPercent === null
      ? 'Make sure your camera can see you'
      : statusCopy(state);

  return (
    <View style={styles.screen}>
      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + 34,
            paddingBottom: insets.bottom + 28,
          },
        ]}
      >
        <Animated.View
          onLayout={event => setPreviewHeight(event.nativeEvent.layout.height)}
          style={[styles.previewShell, previewAnimatedStyle]}
        >
          {showCamera && Platform.OS === 'ios' ? (
            <LivePresenceCamera
              active
              analysisIntervalMs={500}
              onCameraReady={handleCameraReady}
              style={styles.camera}
            />
          ) : showCamera ? (
            <CameraView
              ref={cameraRef}
              active
              facing="front"
              mirror
              onCameraReady={handleCameraReady}
              style={styles.camera}
            />
          ) : (
            <LinearGradient
              colors={['#333333', '#141414']}
              style={styles.permissionState}
            >
              {state === 'checking-permission' ? (
                <ActivityIndicator color={colors.ink} />
              ) : (
                <>
                  <Text style={styles.permissionTitle}>Camera access is off</Text>
                  <Text style={styles.permissionCopy}>
                    Enable camera permission before starting a session.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={handleRequestPermission}
                    style={({ pressed }) => [
                      styles.permissionAction,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.permissionActionText}>
                      {canAskForPermission ? 'Allow camera' : 'Open settings'}
                    </Text>
                  </Pressable>
                  {canAskForPermission ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={handleOpenSettings}
                      style={({ pressed }) => [
                        styles.secondaryPermissionAction,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.secondaryPermissionActionText}>
                        Open settings
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </LinearGradient>
          )}
          {showFaceGuide ? (
            <View pointerEvents="none" style={styles.guide} />
          ) : null}
        </Animated.View>

        <View style={styles.details}>
          <View style={styles.statusWrap}>
            {isCountdown ? (
              <LinearGradient
                colors={[colors.panelTop, colors.panelBottom]}
                style={styles.countdownModule}
              >
                <SevenSegmentDigit
                  value={String(Math.max(0, countdown))}
                  scale={1.35}
                />
              </LinearGradient>
            ) : (
              <Text style={styles.statusText}>{statusText}</Text>
            )}
          </View>

          <View style={styles.modeBlock}>
            <Text style={styles.modeLabel}>{modeName}</Text>
            <Text style={styles.durationLabel}>
              {formatDuration(durationSeconds)}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel session start"
            onPress={onCancel}
            style={({ pressed }) => [
              styles.cancelAction,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: layout.horizontalPadding,
    justifyContent: 'flex-start',
  },
  // Fills the space left above the details block so the Cancel action stays
  // on screen on short devices (iPhone SE), capped for tall ones.
  previewShell: {
    flex: 1,
    maxHeight: 620,
    width: '100%',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    overflow: 'hidden',
    backgroundColor: colors.module,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 12,
  },
  camera: {
    flex: 1,
  },
  permissionState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  permissionTitle: {
    color: colors.ink,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  permissionCopy: {
    marginTop: 8,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  permissionAction: {
    marginTop: 18,
    minHeight: 40,
    justifyContent: 'center',
  },
  permissionActionText: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  secondaryPermissionAction: {
    marginTop: 10,
    minHeight: 34,
    justifyContent: 'center',
  },
  secondaryPermissionActionText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  guide: {
    position: 'absolute',
    left: '20%',
    right: '20%',
    top: '18%',
    bottom: '18%',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(237, 237, 237, 0.42)',
  },
  details: {
    alignItems: 'center',
    paddingTop: 22,
  },
  statusWrap: {
    minHeight: 128,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  modeBlock: {
    marginTop: 4,
    alignItems: 'center',
  },
  countdownModule: {
    width: 118,
    height: 116,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeLabel: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  durationLabel: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  cancelAction: {
    marginTop: 34,
    minHeight: 44,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  cancelText: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.55,
  },
});
