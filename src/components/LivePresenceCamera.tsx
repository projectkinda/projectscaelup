import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { PresenceCameraView } from '../../modules/presence-camera';
import { PresenceModule } from '../domain/presenceModule';

type LivePresenceCameraProps = {
  active: boolean;
  /** Minimum time between analysed frames. */
  analysisIntervalMs: number;
  onCameraReady?: () => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * iOS camera preview that feeds presence readings from live frames into
 * `PresenceModule`, replacing Android's photo sampling (no shutter sound, no
 * stills). Start `PresenceModule` before mounting so the detector is known.
 */
export function LivePresenceCamera({ active, analysisIntervalMs, onCameraReady, style }: LivePresenceCameraProps) {
  return (
    <PresenceCameraView
      detector={PresenceModule.activeDetectorType() ?? 'face'}
      active={active}
      analysisIntervalMs={analysisIntervalMs}
      onCameraReady={onCameraReady}
      onPresence={event => PresenceModule.reportLiveReading(event.nativeEvent)}
      onCameraUnavailable={event => console.warn('Presence camera unavailable:', event.nativeEvent.reason)}
      style={style}
    />
  );
}
