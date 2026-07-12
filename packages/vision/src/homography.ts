import type { CourtQuad, Homography, NormPoint, WorldPoint } from "@courtvision/core";

/**
 * Compute a 3×3 planar homography that maps the 4 court-corner points (in
 * normalized image space) to the 4 real-world corners of the court (in meters).
 *
 * This is the numeric core of "perspective transformation mapping to known
 * physical boundaries" called out in the pitch. Once we have H, every ball
 * observation can be re-projected to court coordinates and every distance we
 * report (jump height, heatmap density, release velocity) is grounded in
 * meters instead of pixels.
 *
 * We use the standard DLT (Direct Linear Transform) solve with 4 point-pairs,
 * which gives an 8-DOF planar homography. Since we always have exactly 4
 * pairs, we resolve the 8×8 system with Gaussian elimination — no external
 * linear-algebra dependency required, so this can run inside a frame processor
 * worklet on-device.
 *
 * If you're wondering about numerical stability: with our normalized inputs
 * (all in [0,1]) and normalized outputs (meters, single-digit magnitudes) the
 * condition number stays well within double precision. We normalize both point
 * sets before solving to keep the coefficient matrix well-scaled anyway.
 */
export function computeHomography(
  imageCorners: CourtQuad,
  courtWorldSize: { width: number; length: number },
): Homography | null {
  const src: NormPoint[] = [imageCorners[0], imageCorners[1], imageCorners[2], imageCorners[3]];
  const dst: WorldPoint[] = [
    { x: 0, y: 0 },
    { x: courtWorldSize.width, y: 0 },
    { x: courtWorldSize.width, y: courtWorldSize.length },
    { x: 0, y: courtWorldSize.length },
  ];

  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]!;
    const { x: X, y: Y } = dst[i]!;
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]);
    b.push(Y);
  }
  const h = solve8(A, b);
  if (!h) return null;
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1] as Homography;
}

/** Apply a homography to a single normalized image point → world point (meters). */
export function projectToWorld(H: Homography, p: NormPoint): WorldPoint {
  const w = H[6]! * p.x + H[7]! * p.y + H[8]!;
  return {
    x: (H[0]! * p.x + H[1]! * p.y + H[2]!) / w,
    y: (H[3]! * p.x + H[4]! * p.y + H[5]!) / w,
  };
}

/** Invert the homography analytically (3x3 matrix inversion). Useful for
 *  going from tap-in-world → tap-in-image to draw court lines on-screen. */
export function invertHomography(H: Homography): Homography | null {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  return [
    A * inv,
    -(b * i - c * h) * inv,
    (b * f - c * e) * inv,
    B * inv,
    (a * i - c * g) * inv,
    -(a * f - c * d) * inv,
    C * inv,
    -(a * h - b * g) * inv,
    (a * e - b * d) * inv,
  ] as Homography;
}

/**
 * Gaussian elimination for an 8×8 system Ax = b. Returns the 8-vector solution
 * or null if the system is singular.
 *
 * Tiny, hot function — we intentionally avoid closures / allocations inside
 * the loop so this compiles down cleanly on Hermes.
 */
function solve8(A: number[][], b: number[]): number[] | null {
  const n = 8;
  const M: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = A[i]!.slice();
    row.push(b[i]!);
    M.push(row);
  }
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    let maxVal = Math.abs(M[i]![i]!);
    for (let k = i + 1; k < n; k++) {
      const v = Math.abs(M[k]![i]!);
      if (v > maxVal) {
        maxRow = k;
        maxVal = v;
      }
    }
    if (maxVal < 1e-12) return null;
    if (maxRow !== i) {
      const tmp = M[i]!;
      M[i] = M[maxRow]!;
      M[maxRow] = tmp;
    }
    const pivot = M[i]![i]!;
    for (let k = i + 1; k < n; k++) {
      const factor = M[k]![i]! / pivot;
      for (let j = i; j <= n; j++) {
        M[k]![j] = M[k]![j]! - factor * M[i]![j]!;
      }
    }
  }
  const x = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i]![n]!;
    for (let j = i + 1; j < n; j++) s -= M[i]![j]! * x[j]!;
    x[i] = s / M[i]![i]!;
  }
  return x;
}
