import { useCallback, useEffect, useRef, useState } from 'react';
import type { Stroke } from '../types';

const COLORS = ['#000000', '#ffffff', '#ff6b6b', '#4ecdc4', '#ffd93d', '#6c5ce7', '#fd79a8', '#00b894'];
const CANVAS_W = 800;
const CANVAS_H = 500;
const ASPECT = CANVAS_W / CANVAS_H;

interface Props {
  strokes: Stroke[];
  isDrawer: boolean;
  canDraw: boolean;
  color: string;
  brushSize: number;
  onStrokeStart: (stroke: Stroke) => void;
  onStrokeMove: (x: number, y: number, strokeId: number) => void;
  onStrokeEnd: () => void;
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  if (stroke.points.length < 1) return;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (let i = 1; i < stroke.points.length; i++) {
    ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
  }
  ctx.stroke();
}

function redraw(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  strokes.forEach((s) => drawStroke(ctx, s));
}

function fitCanvasToContainer(containerW: number, containerH: number) {
  if (containerW <= 0 || containerH <= 0) {
    return { width: CANVAS_W, height: CANVAS_H };
  }
  const containerAspect = containerW / containerH;
  if (containerAspect > ASPECT) {
    const height = Math.floor(containerH);
    return { width: Math.floor(height * ASPECT), height };
  }
  const width = Math.floor(containerW);
  return { width, height: Math.floor(width / ASPECT) };
}

export function DrawingCanvas({
  strokes,
  isDrawer,
  canDraw,
  color,
  brushSize,
  onStrokeStart,
  onStrokeMove,
  onStrokeEnd,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const [displaySize, setDisplaySize] = useState({ width: CANVAS_W, height: CANVAS_H });

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const updateSize = () => {
      const { width, height } = wrap.getBoundingClientRect();
      setDisplaySize(fitCanvasToContainer(width, height));
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return { x: 0, y: 0 };
    }

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX: number;
    let clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    return {
      x: Math.max(0, Math.min(canvas.width, x)),
      y: Math.max(0, Math.min(canvas.height, y)),
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    redraw(ctx, strokes);
  }, [strokes]);

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canDraw || !isDrawer) return;
    e.preventDefault();
    const { x, y } = getPos(e);
    const stroke: Stroke = {
      id: Date.now(),
      points: [{ x, y }],
      color,
      size: brushSize,
    };
    currentStrokeRef.current = stroke;
    drawingRef.current = true;
    onStrokeStart(stroke);

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    drawStroke(ctx, stroke);
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawingRef.current || !currentStrokeRef.current) return;
    e.preventDefault();
    const { x, y } = getPos(e);
    currentStrokeRef.current.points.push({ x, y });
    onStrokeMove(x, y, currentStrokeRef.current.id);

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    redraw(ctx, [...strokes.filter((s) => s.id !== currentStrokeRef.current!.id), currentStrokeRef.current]);
  };

  const handleEnd = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    currentStrokeRef.current = null;
    onStrokeEnd();
  };

  return (
    <div ref={wrapRef} className="canvas-wrap">
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="drawing-canvas"
        style={{
          width: displaySize.width,
          height: displaySize.height,
          pointerEvents: canDraw && isDrawer ? 'auto' : 'none',
        }}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
      />
    </div>
  );
}

export { COLORS, CANVAS_W, CANVAS_H };
