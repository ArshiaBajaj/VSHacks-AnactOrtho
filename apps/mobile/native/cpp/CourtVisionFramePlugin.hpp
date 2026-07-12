#pragma once

/**
 * Vision-camera frame processor plugin — CourtVision core CV loop.
 *
 * Called once per frame by react-native-vision-camera on the frame-processor
 * thread. This is where the pitch's "heavily optimized mobile frame pipeline"
 * lives:
 *
 *   1. Receive the frame at native resolution (typically 1280x720).
 *   2. Downsample to a 160-wide analysis buffer on the GPU (Metal on iOS,
 *      OpenGLES on Android). This is the "downsampling to 30fps at 720p"
 *      step called out in the Master Blueprint's Q&A.
 *   3. Score every pixel against the sport's ball-color prior (a Gaussian in
 *      RGB space — the CPU-friendly stand-in that runs before/instead of the
 *      quantized detector on devices without a fast NPU path).
 *   4. Compute the strongest orange+motion centroid → BallObservation.
 *   5. If confidence drops below threshold, hand off to the C++
 *      KinematicPredictor (which mirrors the TS implementation) and emit a
 *      predicted BallObservation for up to `predictionHorizonMs`.
 *   6. Optionally invoke the quantized TFLite (Android) / CoreML (iOS) ball
 *      detector every N frames as a correction signal — only when the NPU is
 *      available, so we never contend with the pose model for GPU time.
 *   7. Push everything into SpatialEngine::Step for classification.
 *   8. Return a JSI object with the summary that JS/React can render.
 *
 * This file declares the plugin interface — the .cpp file (which pulls in
 * VisionCamera's platform-specific frame types) does the heavy lifting.
 */

#include "SpatialEngine.hpp"

namespace courtvision::frame_plugin {

/**
 * Result struct returned to JS via JSI. Kept small and POD-friendly so the
 * bridge serialization is cheap.
 */
struct FrameResult {
    double timestamp{};
    bool ballFound{false};
    NormPoint ballPoint{};
    float ballRadius{};
    float ballConfidence{};
    bool ballPredicted{false};
    bool ballInsideCourt{true};
    float reportedFps{0.f};
    std::vector<EmittedEvent> events;
};

/**
 * Config knobs passed in from JS via the second arg to the plugin call.
 */
struct FrameConfig {
    int downsampleWidth{160};
    bool enablePosePrediction{true};
};

/**
 * The single per-frame entry point. The implementation must be thread-safe
 * (it lives on the vision-camera worker thread).
 */
FrameResult ProcessFrame(SpatialEngine& engine,
                         const FrameConfig& config,
                         const void* platformFrame,
                         double timestampMs);

}  // namespace courtvision::frame_plugin
