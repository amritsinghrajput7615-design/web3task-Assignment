import { COLORS } from './DrawingCanvas';

export type DrawTool = 'brush' | 'eraser';

interface Props {
  color: string;
  brushSize: number;
  activeTool: DrawTool;
  canEdit: boolean;
  onColorSelect: (c: string) => void;
  onSizeChange: (s: number) => void;
  onBrushSelect: () => void;
  onEraserSelect: () => void;
  onUndo: () => void;
  onClear: () => void;
}

export function DrawingToolbar({
  color,
  brushSize,
  activeTool,
  canEdit,
  onColorSelect,
  onSizeChange,
  onBrushSelect,
  onEraserSelect,
  onUndo,
  onClear,
}: Props) {
  if (!canEdit) return null;

  const isEraser = activeTool === 'eraser';

  return (
    <div className="toolbar">
      <button
        type="button"
        className={`tool-btn ${activeTool === 'brush' ? 'active' : ''}`}
        onClick={onBrushSelect}
        title="Brush"
      >
        Brush
      </button>
      <button
        type="button"
        className={`tool-btn ${isEraser ? 'active' : ''}`}
        onClick={onEraserSelect}
        title="Eraser"
      >
        Eraser
      </button>

      <span className="toolbar-divider" />

      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={`color-btn ${color === c && activeTool === 'brush' ? 'active' : ''}`}
          style={{ background: c }}
          onClick={() => onColorSelect(c)}
          aria-label={`Color ${c}`}
          title={`Color ${c}`}
        />
      ))}

      <input
        type="range"
        min={2}
        max={24}
        value={brushSize}
        onChange={(e) => onSizeChange(Number(e.target.value))}
        style={{ width: 100 }}
        title="Brush size"
        disabled={isEraser}
      />
      <button type="button" className="tool-btn" onClick={onUndo}>
        Undo
      </button>
      <button type="button" className="tool-btn" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
