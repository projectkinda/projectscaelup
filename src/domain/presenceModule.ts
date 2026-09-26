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
let tickInterval: ReturnType<typeof setInterval> | null = null;
let lastResult: PresenceResult | null = null;

function getFaceDetector(): ActiveDetector {
  if (!faceDetector) {
    faceDetector = { type: 'face' };
  }

  return faceDetector;
}

async function loadPoseModel(): Promise<ActiveDetector> {
  // MediaPipe Pose should be initialized here when the native/model package is
  // wired. Pose is deliberately not cached after stop(); it is heavier than the
  // face detector and belongs only to Exercise sessions.
  return { type: 'pose' };
}

async function unloadPoseModel() {
  // Release the real MediaPipe Pose resources here once the native/model
  // integration exists.
}

function buildResult(detector: ActiveDetector): PresenceResult {
  let result: PresenceResult;

  if (detector.type === 'pose') {
    result = {
      presenceDetected: true,
      faceWidthPercent: null,
      faceHorizontalOffset: null,
    };
    console.log(
      '[presence-debug] tick fired, presenceDetected:',
      result.presenceDetected,
    );
    return result;
  }

  result = {
    presenceDetected: true,
    faceWidthPercent: 28,
    faceHorizontalOffset: 0,
  };
  console.log(
    '[presence-debug] tick fired, presenceDetected:',
    result.presenceDetected,
  );
  return result;
}

function emit(result: PresenceResult) {
  lastResult = result;
  callbacks.forEach(callback => callback(result));
}

function stopTickLoop() {
  if (tickInterval !== null) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

function beginTickLoop() {
  stopTickLoop();

  if (!activeDetector) {
    return;
  }

  emit(buildResult(activeDetector));
  tickInterval = setInterval(() => {
    if (activeDetector) {
      emit(buildResult(activeDetector));
    }
  }, 500);
}

export const PresenceModule = {
  async start(mode: SessionMode): Promise<void> {
    await this.stop();

    activeDetector =
      mode.detectionModel === 'pose'
        ? await loadPoseModel()
        : getFaceDetector();

    beginTickLoop();
  },

  async stop(): Promise<void> {
    const detectorToRelease = activeDetector;

    stopTickLoop();
    activeDetector = null;
    lastResult = null;

    if (detectorToRelease?.type === 'pose') {
      await unloadPoseModel();
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
