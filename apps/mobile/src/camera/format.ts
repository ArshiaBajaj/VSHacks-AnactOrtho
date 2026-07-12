import type { CameraDevice, CameraDeviceFormat } from "react-native-vision-camera";

/**
 * Pipeline hardware constants — matches the Master Blueprint's Q&A answer on
 * thermal throttling: downsample to 30 fps @ 720p to keep the CPU/GPU cool
 * while still giving the state machine enough spatial resolution for
 * line-checks.
 */
export const TARGET_FPS = 30;
export const TARGET_WIDTH = 1280;
export const TARGET_HEIGHT = 720;

/**
 * Select the best camera format that satisfies our 30 fps / 720p contract.
 *
 * Vision-camera exposes every available capture format per device. We score
 * each format on:
 *
 *   - proximity to 720p (fewer pixels = less thermal load)
 *   - ability to hit 30 fps
 *   - preference for the video-optimized codec path
 *
 * ...and pick the winner. If no format meets our constraints we fall back to
 * the device's default (vision-camera picks a sensible one automatically).
 */
export function pickPipelineFormat(device: CameraDevice): CameraDeviceFormat | undefined {
  const formats = device.formats ?? [];
  if (formats.length === 0) return undefined;

  const scored = formats
    .map((f) => ({ f, score: scoreFormat(f) }))
    .sort((a, b) => b.score - a.score);

  return scored[0]?.f;
}

function scoreFormat(f: CameraDeviceFormat): number {
  const widthDelta = Math.abs(f.videoWidth - TARGET_WIDTH);
  const heightDelta = Math.abs(f.videoHeight - TARGET_HEIGHT);
  const closenessScore = 1_000_000 / (1 + widthDelta + heightDelta);

  const maxFps = f.maxFps;
  const fpsScore = maxFps >= TARGET_FPS ? 100_000 : maxFps * 1000;

  // Slight preference for HDR-off / non-photo-heavy formats (they use less power).
  const efficiencyScore = f.supportsPhotoHdr === false ? 500 : 0;

  return closenessScore + fpsScore + efficiencyScore;
}
