import { NativeModules, Platform } from 'react-native';

import type { SessionMode } from './sessionModes';

type ActiveDetector = {
  type: SessionMode['detectionModel'];
};

export type PresenceResult = {
  presenceDetected: boolean;
  faceWidthPercent: number | null;
  faceHorizontalOffset: number | null;
};

type PresenceCallback = (result: PresenceResult) => void;

let faceDetector: ActiveDetector | null = null;
let activeDetector: ActiveDetector | null = null;
let callbacks = new Set<PresenceCallback>();
let lastResult: PresenceResult | null = null;

type NativePresenceResult = {
  presenceDetected: boolean;
  faceWidthPercent?: number | null;
  faceHorizontalOffset?: number | null;
};

type NativePresenceDetectorBridge = {
  loadFaceModel: () => Promise<void>;
  loadPoseModel: () => Promise<void>;
  unloadPoseModel: () => Promise<void>;
  detectFace: (base64Image: string) => Promise<NativePresenceResult>;
  detectPose: (base64Image: string) => Promise<NativePresenceResult>;
};

const PresenceDetectorBridge = NativeModules
  .PresenceDetectorBridge as NativePresenceDetectorBridge | undefined;

// Android analyses still photos the screens capture and pass to `reportFrame`.
// iOS analyses live camera frames natively (PresenceCameraView), which then
// calls `reportLiveReading`; there are no models to load in JavaScript.
const analyzesStillFrames = Platform.OS === 'android';

function ensureBridge(): NativePresenceDetectorBridge {
  if (Platform.OS !== 'android' || !PresenceDetectorBridge) {
    throw new Error('PresenceDetectorBridge is only available on Android.');
  }

  return PresenceDetectorBridge;
}

async function getFaceDetector(): Promise<ActiveDetector> {
  if (!faceDetector) {
    if (analyzesStillFrames) {
      await ensureBridge().loadFaceModel();
    }
    faceDetector = { type: 'face' };
  }

  return faceDetector;
}

async function loadPoseModel(): Promise<ActiveDetector> {
  if (analyzesStillFrames) {
    await ensureBridge().loadPoseModel();
  }
  return { type: 'pose' };
}

async function unloadPoseModel() {
  if (analyzesStillFrames) {
    await ensureBridge().unloadPoseModel();
  }
}

function emit(result: PresenceResult) {
  lastResult = result;
  callbacks.forEach(callback => callback(result));
}

export const PresenceModule = {
  /** True when screens should capture photos and pass them to `reportFrame`. */
  analyzesStillFrames,

  /** The detector the current session uses, for cameras that analyse frames themselves. */
  activeDetectorType(): SessionMode['detectionModel'] | null {
    return activeDetector?.type ?? null;
  },

  async start(mode: SessionMode): Promise<void> {
    await this.stop();

    activeDetector = await (mode.detectionModel === 'pose'
      ? loadPoseModel()
      : getFaceDetector());
  },

  async stop(): Promise<void> {
    const detectorToRelease = activeDetector;

    activeDetector = null;
    lastResult = null;

    if (detectorToRelease?.type === 'pose') {
      await unloadPoseModel();
    }
  },

  async reportFrame(base64Image: string): Promise<void> {
    if (!activeDetector) {
      return;
    }

    try {
      const bridge = ensureBridge();
      const raw =
        activeDetector.type === 'pose'
          ? await bridge.detectPose(base64Image)
          : await bridge.detectFace(base64Image);

      const result = {
        presenceDetected: raw.presenceDetected,
        faceWidthPercent: raw.faceWidthPercent ?? null,
        faceHorizontalOffset: raw.faceHorizontalOffset ?? null,
      };

      console.log(
        '[presence-debug] frame processed, presenceDetected:',
        result.presenceDetected,
      );
      emit(result);
    } catch (error) {
      console.warn('Failed to process presence frame:', error);
    }
  },

  /** A reading from a camera that analyses live frames natively (iOS). */
  reportLiveReading(result: PresenceResult): void {
    if (activeDetector) {
      emit(result);
    }
  },

  onTick(callback: PresenceCallback): () => void {
    callbacks.add(callback);
    if (lastResult) {
      callback(lastResult);
    }

    return () => {
      callbacks.delete(callback);
    };
  },
};
