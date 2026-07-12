#include "CourtVisionFramePlugin.hpp"

/**
 * Reference implementation of the plugin body.
 *
 * NOTE: the actual pixel-buffer types differ per platform:
 *
 *   iOS      →  CVPixelBufferRef (backed by an IOSurface, usually YCbCr)
 *   Android  →  AHardwareBuffer / android::HardwareBuffer (usually RGBA_8888)
 *
 * We hide those behind `platformFrame` (opaque pointer) and expect the two
 * OS-specific bridges (`native/ios/CourtVisionFramePlugin.mm` and
 * `native/android/.../CourtVisionFramePluginModule.kt`) to lock the buffer
 * and expose it as an RGBA byte array before calling ProcessFrame.
 *
 * For hackathon-time bring-up the safest path is to keep the platform locks
 * in the wrapping .mm/.kt files and land this .cpp as a *pure* function that
 * just does the CPU-side color heuristic on a decoded RGBA buffer.
 *
 * TODO(perf): move the color-prior scan into a Metal / OpenGL fragment
 * shader; the CPU version below is already fast enough for a demo, but on
 * hot phones (A14 and older) shipping the color scan to the GPU shaves ~2 ms
 * per frame and keeps the pipeline < 8 ms total per frame at 720p.
 */

#include <algorithm>
#include <chrono>

namespace courtvision::frame_plugin {

namespace {

struct BallColorPrior {
    float meanR{214.f};
    float meanG{100.f};
    float meanB{42.f};
    float inv2s2{1.f / (2.f * 42.f * 42.f)};
    inline float operator()(float r, float g, float b) const {
        const float dr = r - meanR;
        const float dg = g - meanG;
        const float db = b - meanB;
        const float d2 = dr * dr + dg * dg + db * db;
        return std::exp(-d2 * inv2s2);
    }
};

/**
 * Very small "orange centroid" heuristic operating on a decoded RGBA byte
 * buffer. Matches the algorithm in packages/vision/src/... so behavior stays
 * identical to the web build.
 */
static bool FindBallCentroid(const uint8_t* rgba,
                             int w,
                             int h,
                             int stride,
                             const BallColorPrior& prior,
                             float* outX,
                             float* outY,
                             float* outConf) {
    double sumX = 0.0;
    double sumY = 0.0;
    double totalWeight = 0.0;
    for (int y = 0; y < h; y += 2) {
        const uint8_t* row = rgba + y * stride;
        for (int x = 0; x < w; x += 2) {
            const uint8_t* px = row + x * 4;
            const float r = static_cast<float>(px[0]);
            const float g = static_cast<float>(px[1]);
            const float b = static_cast<float>(px[2]);
            const float score = prior(r, g, b);
            if (score < 0.05f) continue;
            sumX += x * score;
            sumY += y * score;
            totalWeight += score;
        }
    }
    if (totalWeight < 40.0) return false;
    *outX = static_cast<float>(sumX / totalWeight / w);
    *outY = static_cast<float>(sumY / totalWeight / h);
    *outConf = std::min(1.f, static_cast<float>(totalWeight / 4000.0));
    return true;
}

}  // namespace

FrameResult ProcessFrame(SpatialEngine& engine,
                         const FrameConfig& config,
                         const void* platformFrame,
                         double timestampMs) {
    FrameResult out;
    out.timestamp = timestampMs;
    out.reportedFps = 30.f;  // wired up by the caller using a rolling window

    // Real integration: the .mm / .kt file passes us a locked RGBA buffer.
    // For this reference build we accept a struct pointer that the bridge
    // fills in; if `platformFrame` is null (running in a stub context) we
    // simply return a "no observation" frame — the JS side will still render
    // and manual overrides continue to work.
    if (platformFrame == nullptr) {
        std::vector<Pose> emptyPoses;
        engine.Step(timestampMs, std::nullopt, emptyPoses, &out.events);
        return out;
    }

    // The wrapper packs the buffer as: [uint32 width, uint32 height,
    // uint32 stride, uint8_t rgba...]. We deliberately keep this ABI-simple
    // so future frame-format changes on either platform don't leak into the
    // engine code.
    const uint8_t* header = static_cast<const uint8_t*>(platformFrame);
    const uint32_t width = *reinterpret_cast<const uint32_t*>(header + 0);
    const uint32_t height = *reinterpret_cast<const uint32_t*>(header + 4);
    const uint32_t stride = *reinterpret_cast<const uint32_t*>(header + 8);
    const uint8_t* rgba = header + 12;

    (void)config;  // downsample is done in the wrapper before calling us

    BallColorPrior prior;
    float bx = 0.f, by = 0.f, conf = 0.f;
    const bool found =
        FindBallCentroid(rgba, static_cast<int>(width), static_cast<int>(height),
                         static_cast<int>(stride), prior, &bx, &by, &conf);

    std::optional<BallObservation> ballOpt;
    if (found) {
        BallObservation ball;
        ball.point = {bx, by};
        ball.radius = 0.02f + conf * 0.02f;
        ball.confidence = conf;
        ball.predicted = false;
        ball.timestamp = timestampMs;
        ballOpt = ball;

        out.ballFound = true;
        out.ballPoint = ball.point;
        out.ballRadius = ball.radius;
        out.ballConfidence = ball.confidence;
        out.ballPredicted = false;
    }

    std::vector<Pose> poses;  // populated by the pose-plugin, not here
    engine.Step(timestampMs, ballOpt, poses, &out.events);
    return out;
}

}  // namespace courtvision::frame_plugin
