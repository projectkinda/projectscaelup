import { Camera } from 'expo-camera';

import { LockdownModule } from './lockdownModule';
import { UsageTrackingModule } from './usageTrackingModule';

export type RequiredPermissionStatus = {
  camera: boolean;
  accessibility: boolean;
  overlay: boolean;
  all: boolean;
};

export async function getRequiredPermissionStatus(): Promise<RequiredPermissionStatus> {
  const camera = (await Camera.getCameraPermissionsAsync()).status === 'granted';
  const accessibility = await UsageTrackingModule.isEnabled();
  const overlay = await LockdownModule.canDrawOverlays();

  return {
    camera,
    accessibility,
    overlay,
    all: camera && accessibility && overlay,
  };
}
