#pragma once

/**
 * CourtVision AI — SpatialEngine (C++ core)
 * ------------------------------------------
 *
 * This is the fast path of the scoring engine. It lives inside the frame
 * processor thread and runs the state machine that turns per-frame ball +
 * pose observations into scoring / whistle events.
 *
 * The equivalent reference implementation in TypeScript lives at
 *   packages/core/src/scoring-engine.ts
 * and MUST stay behaviorally identical. The unit tests in
 *   packages/core/__tests__/scoring-engine.test.ts
 * are executed against both paths to enforce parity.
 *
 * Header-only for simplicity. No STL dependencies beyond <vector> and
 * <cmath> so this compiles cleanly in RN's C++11 build environment and
 * links straight into the vision-camera JSI plugin.
 */

#include <array>
#include <cmath>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace courtvision {

// -------------------------- POD types --------------------------

struct NormPoint {
    float x{};
    float y{};
};

struct Homography {
    // Row-major 3x3.
    std::array<float, 9> m{};
};

struct BallObservation {
    NormPoint point;
    float radius{};
    float confidence{};
    bool predicted{};
    double timestamp{};
};

struct PoseLandmark {
    float x{};
    float y{};
    float z{};
    float visibility{};
};

struct Pose {
    std::vector<PoseLandmark> landmarks;
};

enum class EventKind {
    kNone,
    kScore,
    kOutOfBounds,
    kWhistle,
    kStreak,
    kJump,
    kShot,
    kHighlight,
};

enum class TeamId : uint8_t { kA = 0, kB = 1, kNone = 2 };

struct EmittedEvent {
    EventKind kind{EventKind::kNone};
    TeamId team{TeamId::kNone};
    double timestamp{};
    float value{};
    // Small preallocated buffer for a human-readable note.
    std::string note;
};

// -------------------------- Sport tuning --------------------------

struct SportRules {
    float courtWidthM{15.24f};
    float courtLengthM{28.65f};
    int basePoints{2};
    int bonusPoints{3};        // 0 disables 3-point logic
    float bonusThreshold{0.42f};
    double scoreCooldownMs{2500};
    double whistleCooldownMs{2200};
    int streakThreshold{3};
    double predictionHorizonMs{500};
    float gravityWps2{9.81f};
};

// -------------------------- Engine --------------------------

class SpatialEngine {
   public:
    explicit SpatialEngine(const SportRules& rules) : rules_(rules) {}

    // Reset all counters — called at "Tip off".
    void Reset() {
        scoreA_ = 0;
        scoreB_ = 0;
        streakCount_ = 0;
        streakTeam_ = TeamId::kNone;
        lastScoreAt_ = -1e12;
        lastWhistleAt_ = -1e12;
        lastInboundsAt_ = -1e12;
        ballInside_ = true;
        lastBall_.reset();
    }

    void SetCourt(std::array<NormPoint, 4> corners) { court_ = corners; hasCourt_ = true; }
    void SetHomography(const Homography& H) { homography_ = H; hasHomography_ = true; }

    // Feed one frame's observation. Emits zero or more events; caller pushes
    // them across the JSI bridge in one shot.
    void Step(double t,
              const std::optional<BallObservation>& ball,
              const std::vector<Pose>& poses,
              std::vector<EmittedEvent>* out) {
        (void)poses;  // poses are used by the classifier extensions

        if (ball.has_value() && hasCourt_) {
            const bool inside = PointInQuad(ball->point, court_);
            if (inside) {
                lastInboundsAt_ = t;
                ballInside_ = true;
            } else if (ballInside_) {
                if (t - lastWhistleAt_ >= rules_.whistleCooldownMs) {
                    EmittedEvent e1;
                    e1.kind = EventKind::kOutOfBounds;
                    e1.timestamp = t;
                    e1.note = "Ball crossed the boundary line";
                    out->push_back(std::move(e1));

                    EmittedEvent e2;
                    e2.kind = EventKind::kWhistle;
                    e2.timestamp = t;
                    e2.note = "Whistle: possession changes";
                    out->push_back(std::move(e2));

                    lastWhistleAt_ = t;
                }
                ballInside_ = false;
            }
            lastBall_ = ball;
        }
    }

    // Manual (or hoop-detector-fed) score event. Handles cooldown + streak.
    bool RegisterScore(double t,
                       TeamId team,
                       int points,
                       std::vector<EmittedEvent>* out) {
        if (t - lastScoreAt_ < rules_.scoreCooldownMs) return false;
        lastScoreAt_ = t;
        if (team == TeamId::kA) scoreA_ += points;
        else if (team == TeamId::kB) scoreB_ += points;

        if (streakTeam_ == team) streakCount_++;
        else {
            streakTeam_ = team;
            streakCount_ = 1;
        }

        {
            EmittedEvent e;
            e.kind = EventKind::kScore;
            e.team = team;
            e.timestamp = t;
            e.value = static_cast<float>(points);
            out->push_back(std::move(e));
        }
        if (streakCount_ >= rules_.streakThreshold) {
            EmittedEvent e;
            e.kind = EventKind::kStreak;
            e.team = team;
            e.timestamp = t;
            e.value = static_cast<float>(streakCount_);
            out->push_back(std::move(e));
        }
        return true;
    }

    // ---- Accessors ----
    int scoreA() const { return scoreA_; }
    int scoreB() const { return scoreB_; }
    int streakCount() const { return streakCount_; }
    TeamId streakTeam() const { return streakTeam_; }

   private:
    // Convex point-in-quad using cross-product sign consistency.
    static bool PointInQuad(NormPoint p, const std::array<NormPoint, 4>& q) {
        int sign = 0;
        for (int i = 0; i < 4; i++) {
            const NormPoint& a = q[i];
            const NormPoint& b = q[(i + 1) % 4];
            const float cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
            if (std::fabs(cross) < 1e-6f) continue;
            const int s = cross > 0 ? 1 : -1;
            if (sign == 0) sign = s;
            else if (sign != s) return false;
        }
        return true;
    }

    SportRules rules_;
    std::array<NormPoint, 4> court_{};
    bool hasCourt_{false};
    Homography homography_{};
    bool hasHomography_{false};

    int scoreA_{0};
    int scoreB_{0};
    int streakCount_{0};
    TeamId streakTeam_{TeamId::kNone};
    double lastScoreAt_{-1e12};
    double lastWhistleAt_{-1e12};
    double lastInboundsAt_{-1e12};
    bool ballInside_{true};
    std::optional<BallObservation> lastBall_{};
};

}  // namespace courtvision
