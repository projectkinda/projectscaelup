import { requireNativeView } from 'expo';
import type { ComponentType } from 'react';
import { Platform, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from 'react-native';

export type PresenceReading = {
  presenceDetected: boolean;
  faceWidthPercent: number | null;
  faceHorizontalOffset: number | null;
};

export type PresenceCameraUnavailableReason = 'permissionDenied' | 'noCamera' | 'configurationFailed';

export type PresenceCameraViewProps = {
  /** Which Vision request to run on each analysed frame. */
  detector: 'face' | 'pose';
  /** The camera runs only while this is true and the view is on screen. */
  active: boolean;
  /** Minimum time between analysed frames. */
  analysisIntervalMs: number;
  onCameraReady?: () => void;
  onPresence?: (event: NativeSyntheticEvent<PresenceReading>) => void;
  onCameraUnavailable?: (event: NativeSyntheticEvent<{ reason: PresenceCameraUnavailableReason }>) => void;
  style?: StyleProp<ViewStyle>;
};

const NativePresenceCameraView: ComponentType<PresenceCameraViewProps> | null =
  Platform.OS === 'ios' ? requireNativeView<PresenceCameraViewProps>('PresenceCamera') : null;

/** iOS front-camera preview that reports presence from live frames (Apple Vision, on device). */
export function PresenceCameraView(props: PresenceCameraViewProps) {
  return NativePresenceCameraView ? <NativePresenceCameraView {...props} /> : null;
}
