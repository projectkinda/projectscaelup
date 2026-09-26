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

function ensureBridge(): NativePresenceDetectorBridge {
  if (Platform.OS !== 'android' || !PresenceDetectorBridge) {
    throw new Error('PresenceDetectorBridge is only available on Android.');
  }

  return PresenceDetectorBridge;
}

async function getFaceDetector(): Promise<ActiveDetector> {
  if (!faceDetector) {
    await ensureBridge().loadFaceModel();
    faceDetector = { type: 'face' };
  }

  return faceDetector;
}

async function loadPoseModel(): Promise<ActiveDetector> {
  await ensureBridge().loadPoseModel();
  return { type: 'pose' };
}

async function unloadPoseModel() {
  await ensureBridge().unloadPoseModel();
}

function emit(result: PresenceResult) {
  lastResult = result;
  callbacks.forEach(callback => callback(result));
}

export const PresenceModule = {
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
