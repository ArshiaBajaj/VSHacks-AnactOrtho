import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Stroke } from "./types";

interface DrawCanvasProps {
  enabled: boolean;
  color?: string;
  strokes: Stroke[];
  onChange: (strokes: Stroke[]) => void;
  className?: string;
}

/**
 * Pointer-based scribble layer for between-play diagramming.
 * All pointer handlers are guarded — never throws into React.
 */
export function DrawCanvas({
  enabled,
  color = "#f8fafc",
  strokes,
  onChange,
  className = "",
}: DrawCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  const current = useRef<Stroke | null>(null);
  const strokesRef = useRef(strokes);
  const [toolWidth] = useState(3);

  strokesRef.current = strokes;

  const resize = useCallback(() => {
    try {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      redraw(canvas, strokesRef.current, dpr);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    resize();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resize()) : null;
    if (wrapRef.current && ro) ro.observe(wrapRef.current);
    window.addEventListener("resize", resize);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [resize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    redraw(canvas, strokes, dpr);
  }, [strokes]);

  function toLocal(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!enabled) return;
    try {
      e.preventDefault();
      const pt = toLocal(e);
      if (!pt) return;
      drawing.current = true;
      current.current = { points: [pt], color, width: toolWidth };
      canvasRef.current?.setPointerCapture(e.pointerId);
    } catch {
      drawing.current = false;
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!enabled || !drawing.current || !current.current) return;
    try {
      const pt = toLocal(e);
      if (!pt) return;
      current.current.points.push(pt);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      redraw(canvas, [...strokesRef.current, current.current], dpr);
    } catch {
      /* ignore */
    }
  }

  function endStroke(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    try {
      drawing.current = false;
      const stroke = current.current;
      current.current = null;
      if (stroke && stroke.points.length > 0) {
        onChange([...strokesRef.current, stroke]);
      }
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      drawing.current = false;
      current.current = null;
    }
  }

  return (
    <div ref={wrapRef} className={`absolute inset-0 ${className}`}>
      <canvas
        ref={canvasRef}
        className={`h-full w-full touch-none ${enabled ? "cursor-crosshair" : "pointer-events-none"}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        aria-label="Court drawing canvas"
      />
    </div>
  );
}

function redraw(canvas: HTMLCanvasElement, strokes: Stroke[], dpr: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;

  for (const stroke of strokes) {
    if (!stroke.points.length) continue;
    ctx.beginPath();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    stroke.points.forEach((p, i) => {
      const x = p.x * w;
      const y = p.y * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}
