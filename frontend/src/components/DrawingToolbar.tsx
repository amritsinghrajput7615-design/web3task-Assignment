import { COLORS } from './DrawingCanvas';

interface Props {
  color: string;
  brushSize: number;
  isEraser: boolean;
  canEdit: boolean;
  onColorChange: (c: string) => void;
  onSizeChange: (s: number) => void;
  onEraserToggle: () => void;
  onUndo: () => void;
  onClear: () => void;
}

export function DrawingToolbar({
  color,
  brushSize,
  isEraser,
  canEdit,
  onColorChange,
  onSizeChange,
  onEraserToggle,
  onUndo,
  onClear,
}: Props) {
  if (!canEdit) return null;

  return (
    <div className="toolbar">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={`color-btn ${color === c && !isEraser ? 'active' : ''}`}
          style={{ background: c }}
          onClick={() => onColorChange(c)}
          aria-label={`Color ${c}`}
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
      />
      <button type="button" className={`tool-btn ${isEraser ? 'active' : ''}`} onClick={onEraserToggle}>
        Eraser
      </button>
      <button type="button" className="tool-btn" onClick={onUndo}>
        Undo
      </button>
      <button type="button" className="tool-btn" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
