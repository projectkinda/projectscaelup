import { Camera } from 'expo-camera';
import { Platform } from 'react-native';

import { ScreenTime } from '../../modules/screen-time';
import { LockdownModule } from './lockdownModule';
import { UsageTrackingModule } from './usageTrackingModule';

// Each platform fills in only its own permissions; the rest stay false.
// `all` means every permission this platform needs is on: Android needs
// camera, accessibility and overlay; iPhone needs camera and Screen Time.
export type RequiredPermissionStatus = {
  camera: boolean;
  accessibility: boolean;
  overlay: boolean;
  screenTime: boolean;
  all: boolean;
};

export async function getRequiredPermissionStatus(): Promise<RequiredPermissionStatus> {
  const camera = (await Camera.getCameraPermissionsAsync()).status === 'granted';

  if (Platform.OS === 'ios') {
    const screenTime = ScreenTime.getStatus()?.authorization === 'approved';

    return {
      camera,
      accessibility: false,
      overlay: false,
      screenTime,
      all: camera && screenTime,
    };
  }

  const accessibility = await UsageTrackingModule.isEnabled();
  const overlay = await LockdownModule.canDrawOverlays();

  return {
    camera,
    accessibility,
    overlay,
    screenTime: false,
    all: camera && accessibility && overlay,
  };
}
