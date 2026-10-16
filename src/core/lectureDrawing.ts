/** Coordenadas relativas à tela, independentes da câmera, dos eixos e dos valores do gráfico. */
export type DrawingPoint = { x: number; y: number };
export type DrawingSize = { width: number; height: number };
export type DrawingTool = "pen" | "line" | "arrow" | "eraser";
export type DrawingMark = { tool: DrawingTool; points: DrawingPoint[]; color: string; width: number };
export type DrawingHistory = { past: DrawingMark[][]; present: DrawingMark[]; future: DrawingMark[][] };
export type DrawingCommand = { type: "add"; mark: DrawingMark } | { type: "undo" } | { type: "redo" } | { type: "clear" };

export const EMPTY_DRAWING: DrawingHistory = { past: [], present: [], future: [] };
const UNDO_LIMIT = 80;

export function updateDrawing(history: DrawingHistory, command: DrawingCommand): DrawingHistory {
  if (command.type === "undo") {
    if (!history.past.length) return history;
    return { past: history.past.slice(0, -1), present: history.past[history.past.length - 1], future: [history.present, ...history.future] };
  }
  if (command.type === "redo") {
    if (!history.future.length) return history;
    return { past: [...history.past, history.present].slice(-UNDO_LIMIT), present: history.future[0], future: history.future.slice(1) };
  }
  if (command.type === "clear" && !history.present.length) return history;
  if (command.type === "add" && (!command.mark.points.length || (command.mark.tool === "eraser" && !history.present.length))) return history;
  return {
    past: [...history.past, history.present].slice(-UNDO_LIMIT),
    present: command.type === "clear" ? [] : [...history.present, command.mark],
    future: [],
  };
}

export function drawingPoint(clientX: number, clientY: number, bounds: { left: number; top: number; width: number; height: number }): DrawingPoint {
  return { x: Math.max(0, Math.min(1, (clientX - bounds.left) / Math.max(1, bounds.width))), y: Math.max(0, Math.min(1, (clientY - bounds.top) / Math.max(1, bounds.height))) };
}

export function drawingDistance(a: DrawingPoint, b: DrawingPoint, size: DrawingSize): number {
  return Math.hypot((b.x - a.x) * size.width, (b.y - a.y) * size.height);
}

/** Shift restringe linhas/setas a múltiplos de 45°, medidos em pixels, mesmo em telas não quadradas. */
export function snapDrawingEnd(start: DrawingPoint, end: DrawingPoint, size: DrawingSize): DrawingPoint {
  const dx = (end.x - start.x) * size.width;
  const dy = (end.y - start.y) * size.height;
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
  const length = Math.hypot(dx, dy);
  return { x: start.x + Math.cos(angle) * length / Math.max(1, size.width), y: start.y + Math.sin(angle) * length / Math.max(1, size.height) };
}

/** Retorna a ponta triangular em pixels; setas muito curtas continuam proporcionais ao seu comprimento. */
export function drawingArrow(start: DrawingPoint, end: DrawingPoint, width: number) {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (length < 1e-6) return null;
  const ux = (end.x - start.x) / length;
  const uy = (end.y - start.y) / length;
  const head = Math.min(16 + width * 2, length * .45);
  const base = { x: end.x - ux * head, y: end.y - uy * head };
  return {
    base,
    left: { x: base.x - uy * head * .45, y: base.y + ux * head * .45 },
    right: { x: base.x + uy * head * .45, y: base.y - ux * head * .45 },
    tip: end,
  };
}
