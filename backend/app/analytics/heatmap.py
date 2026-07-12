"""Court-space heatmap binning over the half court used by cv/court.py."""
from __future__ import annotations

from .. import config
from ..cv.types import COURT_LENGTH_M, COURT_WIDTH_M
from ..models import Heatmap

HALF_COURT_LENGTH_M = COURT_LENGTH_M / 2.0


def build_heatmap(points: list[tuple[float, float]]) -> Heatmap:
    """Bin court-space (x, y) meter points into a sparse grid Heatmap.

    Grid: config.HEATMAP_GRID_W x HEATMAP_GRID_H over
    [0, COURT_LENGTH_M / 2] x [0, COURT_WIDTH_M]. Points are clamped into
    range so near-boundary homography jitter still lands in an edge cell;
    wildly out-of-court points (beyond a half-cell margin) are dropped.
    """
    grid_w = config.HEATMAP_GRID_W
    grid_h = config.HEATMAP_GRID_H
    cell_x = HALF_COURT_LENGTH_M / grid_w
    cell_y = COURT_WIDTH_M / grid_h
    margin_x = cell_x / 2.0
    margin_y = cell_y / 2.0

    counts: dict[tuple[int, int], int] = {}
    for x, y in points:
        if x is None or y is None:
            continue
        if not (-margin_x <= x <= HALF_COURT_LENGTH_M + margin_x):
            continue
        if not (-margin_y <= y <= COURT_WIDTH_M + margin_y):
            continue
        gx = min(grid_w - 1, max(0, int(x / cell_x)))
        gy = min(grid_h - 1, max(0, int(y / cell_y)))
        counts[(gx, gy)] = counts.get((gx, gy), 0) + 1

    cells = [[gx, gy, n] for (gx, gy), n in sorted(counts.items())]
    return Heatmap(grid_w=grid_w, grid_h=grid_h, cells=cells)
