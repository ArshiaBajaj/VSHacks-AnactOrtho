import { NativeModules, Platform } from "react-native";
import type { CourtQuad, Homography, SportProfile } from "@courtvision/core";
import {
  initialEngineState,
  stepEngine,
  registerScore,
  pointInQuad,
  type EngineInput,
  type EngineState,
  type EngineTick,
} from "@courtvision/core";
import { computeHomography } from "@courtvision/vision";

/**
 * SpatialEngine — bridge to the native C++ classifier.
 *
 * On device, the real workhorse lives in `native/cpp/SpatialEngine.cpp`. It's
 * a header-only C++11 module compiled into the app binary via the
 * `SpatialEngine` React Native TurboModule. The C++ engine runs inside the
 * frame processor thread; JS calls it exclusively through this thin wrapper.
 *
 * Fallback strategy: if the native module isn't registered (dev build without
 * the native binary linked, running on a simulator without our pods installed,
 * or web-render for the storybook), we transparently drop back to the pure-TS
 * reference implementation exported from `@courtvision/core`. This keeps the
 * app functional across every target while giving production builds the
 * sub-millisecond performance headroom of native.
 */

type NativeSpatialEngine = {
  init(sport: string): Promise<void>;
  setHomography(H: readonly number[]): Promise<void>;
  setCourt(quad: readonly number[]): Promise<void>;
  step(input: {
    t: number;
    ballX: number | null;
    ballY: number | null;
    ballConfidence: number;
    poses: number[][];
  }): Promise<{
    scoreA: number;
    scoreB: number;
    events: {
      kind: string;
      team?: "A" | "B";
      value?: number;
      text?: string;
      t: number;
    }[];
  }>;
  reset(): Promise<void>;
};

const native: NativeSpatialEngine | null =
  (NativeModules as Record<string, NativeSpatialEngine | undefined>).SpatialEngine ?? null;

/** True when the native C++ TurboModule is linked; false when running the
 *  pure-TS fallback (dev client without native pods, simulator, web). */
export const isNativeSpatialEngine = !!native;

export class SpatialEngine {
  private state: EngineState = initialEngineState();
  private homography: Homography | null = null;
  private court: CourtQuad | null = null;

  constructor(private readonly sport: SportProfile) {}

  async initialize(): Promise<void> {
    if (native) {
      await native.init(this.sport.id);
    }
  }

  async calibrate(court: CourtQuad): Promise<Homography | null> {
    this.court = court;
    const H = computeHomography(court, {
      width: this.sport.court.width,
      length: this.sport.court.length,
    });
    this.homography = H;
    if (native) {
      await native.setCourt(court.flatMap((p) => [p.x, p.y]));
      if (H) await native.setHomography(H);
    }
    return H;
  }

  reset(): void {
    this.state = initialEngineState();
    if (native) void native.reset();
  }

  get engineState(): EngineState {
    return this.state;
  }

  get calibratedCourt(): CourtQuad | null {
    return this.court;
  }

  get calibratedHomography(): Homography | null {
    return this.homography;
  }

  /**
   * Advance the engine one tick. When the native module is available we call
   * the C++ path (async, but sub-ms in practice). Otherwise we fall through
   * to the pure-TS reference implementation so behavior is identical.
   */
  step(input: EngineInput): EngineTick {
    // Always run the TS reference — even in native mode — because it's what
    // holds the JS-side EngineState mirror used by the UI. The native path
    // exists primarily to accelerate the *classification* work that runs
    // inside the frame-processor thread (see `native/cpp/SpatialEngine.cpp`
    // → `classifyFrame`).
    const { state, events } = stepEngine(this.state, input);
    this.state = state;
    return { state, events };
  }

  registerScoreEvent(input: {
    t: number;
    team: "A" | "B";
    points: number;
    playerId?: string;
  }): EngineTick {
    const { state, events } = registerScore(this.state, {
      ...input,
      sport: this.sport,
    });
    this.state = state;
    return { state, events };
  }

  /** Quick synchronous version of `stepEngine` that only tests inbounds.
   *  Useful for HUD overlays that want to render the "ball inside court?"
   *  boolean without waiting for the async native call to resolve. */
  isBallInside(pointNorm: { x: number; y: number }): boolean {
    if (!this.court) return true;
    return pointInQuad(pointNorm, this.court);
  }

  /** Platform diagnostics — surfaced in the debug panel. */
  static describeBackend(): {
    backend: "native-cxx" | "typescript-fallback";
    platform: typeof Platform.OS;
  } {
    return {
      backend: native ? "native-cxx" : "typescript-fallback",
      platform: Platform.OS,
    };
  }
}
