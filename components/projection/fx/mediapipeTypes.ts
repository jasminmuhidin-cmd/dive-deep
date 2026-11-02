/**
 * Minimal types for the parts of @mediapipe/tasks-vision we use.
 * The library itself is loaded at runtime from /public/mediapipe (or the CDN),
 * so it is not an npm dependency and never goes through the bundler.
 */
export type NormalizedLandmark = {
  x: number;
  y: number;
  z: number;
  visibility?: number;
};

export type MPMask = {
  readonly width: number;
  readonly height: number;
  getAsFloat32Array(): Float32Array;
  close(): void;
};

export type PoseLandmarkerResult = {
  landmarks: NormalizedLandmark[][];
  segmentationMasks?: MPMask[];
};

export type PoseLandmarker = {
  detectForVideo(
    video: HTMLVideoElement | HTMLCanvasElement,
    timestamp: number,
    callback: (result: PoseLandmarkerResult) => void,
  ): void;
  close(): void;
};

export type WasmFileset = unknown;

export type TasksVisionModule = {
  FilesetResolver: {
    forVisionTasks(basePath: string): Promise<WasmFileset>;
  };
  PoseLandmarker: {
    createFromOptions(
      fileset: WasmFileset,
      options: {
        baseOptions: { modelAssetPath: string; delegate?: "CPU" | "GPU" };
        runningMode: "IMAGE" | "VIDEO";
        numPoses?: number;
        outputSegmentationMasks?: boolean;
        minPoseDetectionConfidence?: number;
        minPosePresenceConfidence?: number;
        minTrackingConfidence?: number;
      },
    ): Promise<PoseLandmarker>;
  };
};
