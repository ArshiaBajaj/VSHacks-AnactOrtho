"worklet";

import { VisionCameraProxy } from "react-native-vision-camera";
import type { Frame } from "react-native-vision-camera";

/**
 * Native plugin bridges.
 *
 * `courtvisionFrame` is our custom C++ frame processor plugin defined in
 * `native/cpp/CourtVisionFramePlugin.{h,cpp}`. It receives the raw camera
 * frame at 720p / 30 fps, performs a downsample to a 160-wide analysis buffer
 * on the GPU, runs the ball-color prior + kinematic predictor, and (on
 * devices with a native pose model plugged in) fills in pose landmarks.
 *
 * `poseTflite` is the standard `runOnJS`-safe TFLite pose plugin from
 * react-native-fast-tflite. We keep the pose model separate so hot-reloading
 * the C++ plugin doesn't invalidate the model weights.
 *
 * If either plugin is unavailable (e.g. running in Expo Go or on a device
 * without hardware acceleration) the frame processor falls back to reporting
 * a "no-op" observation so the rest of the app keeps rendering — the ref
 * pillar simply won't fire, but manual overrides in the Live screen still
 * work.
 */

const courtvisionFramePlugin = VisionCameraProxy.initFrameProcessorPlugin(
  "courtvisionFrame",
  {},
);
const poseFramePlugin = VisionCameraProxy.initFrameProcessorPlugin(
  "runPoseLandmarker",
  {},
);

export type NormPointW = { x: number; y: number };

export type FrameAnalysis = {
  /** ms since epoch when native captured the frame. */
  t: number;
  /** Ball observation in normalized image space, or null if lost. */
  ball: {
    x: number;
    y: number;
    r: number;
    confidence: number;
    predicted: boolean;
  } | null;
  /** Pose landmarks — each pose is a flat number[] of length 33*3 (x, y, v). */
  poses: number[][];
  /** True when the C++ plugin classified this frame as inside the court quad. */
  ballInsideCourt: boolean;
  /** Native plugin FPS meter. */
  reportedFps: number;
};

/**
 * The actual worklet callback wired into <Camera frameProcessor={...} />.
 * Runs on the frame-processor thread (not JS), synchronously with the
 * camera's capture loop.
 *
 * We keep the JS-side logic here razor-thin: unpack the plugin result and
 * fire it into the shared frame ring buffer. Anything heavier belongs on
 * the native side.
 */
export function analyzeFrame(frame: Frame): FrameAnalysis | null {
  "worklet";

  if (!courtvisionFramePlugin) return null;

  const raw = courtvisionFramePlugin.call(frame, {
    downsampleWidth: 160,
    enablePosePrediction: true,
  }) as
    | {
        t: number;
        ball: { x: number; y: number; r: number; confidence: number; predicted: boolean } | null;
        ballInsideCourt: boolean;
        reportedFps: number;
      }
    | undefined;

  if (!raw) return null;

  let poses: number[][] = [];
  if (poseFramePlugin) {
    const posesRaw = poseFramePlugin.call(frame, {}) as number[][] | undefined;
    if (posesRaw) poses = posesRaw;
  }

  return {
    t: raw.t,
    ball: raw.ball,
    poses,
    ballInsideCourt: raw.ballInsideCourt,
    reportedFps: raw.reportedFps,
  };
}
