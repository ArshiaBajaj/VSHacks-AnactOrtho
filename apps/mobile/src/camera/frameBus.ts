import { useEffect, useState } from "react";
import { Worklets } from "react-native-worklets-core";
import type { FrameAnalysis } from "./frameProcessor";

/**
 * Bridge between the frame-processor worklet thread and React's render thread.
 *
 * The worklet cannot touch React state directly (Reanimated / Worklets rule).
 * We create a shared-value channel that the worklet writes into (via
 * `pushAnalysis`) and the JS side reads from at a paced tempo (roughly the
 * display refresh, capped at 30 Hz — matching the target frame rate).
 *
 * Design goals:
 *  - Zero allocations on the hot path (we reuse the same shared bucket).
 *  - Lossy — we don't care if we drop an analysis when JS is busy. The
 *    scoring engine only needs the "current" snapshot.
 *  - Backpressure-safe — the worklet never blocks waiting for JS.
 */

type Bucket = { current: FrameAnalysis | null; nonce: number };

let bucket: Bucket | null = null;

/** Called from the worklet thread. */
export const pushAnalysis = Worklets.createRunOnJS((a: FrameAnalysis | null) => {
  if (!bucket) bucket = { current: a, nonce: 0 };
  else {
    bucket.current = a;
    bucket.nonce++;
  }
});

/** React hook exposing the latest frame analysis to a component. */
export function useLatestAnalysis(pollHz = 30): FrameAnalysis | null {
  const [snapshot, setSnapshot] = useState<FrameAnalysis | null>(null);

  useEffect(() => {
    const intervalMs = Math.max(16, Math.round(1000 / pollHz));
    let lastNonce = -1;
    const id = setInterval(() => {
      if (!bucket) return;
      if (bucket.nonce === lastNonce) return;
      lastNonce = bucket.nonce;
      setSnapshot(bucket.current);
    }, intervalMs);
    return () => clearInterval(id);
  }, [pollHz]);

  return snapshot;
}

/**
 * Test-only helper — lets us seed the bus from the JS side (e.g. mock frames
 * on a simulator that doesn't have a real camera). Used by the "Simulate
 * game" toggle in the Live screen.
 */
export function _debugPushAnalysis(a: FrameAnalysis | null) {
  if (!bucket) bucket = { current: a, nonce: 0 };
  else {
    bucket.current = a;
    bucket.nonce++;
  }
}
