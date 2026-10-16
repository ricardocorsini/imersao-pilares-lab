import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ArrowUpRight, ChevronDown, ChevronUp, Eraser, Minus, MousePointer2, Pencil, Redo2, Trash2, Undo2 } from "lucide-react";
import { drawingArrow, drawingDistance, drawingPoint, EMPTY_DRAWING, snapDrawingEnd, updateDrawing,
  type DrawingCommand, type DrawingHistory, type DrawingMark, type DrawingSize, type DrawingTool } from "../core/lectureDrawing";
import "./lecture-drawing.css";

type Position = { x: number; y: number };
type MoveProps = { position: Position; width: number; clearance: number; onMove: (next: Position) => void };
type Props = { active: boolean; boardKey: string; size: DrawingSize; layoutVersion: number; renderMoveHandle: (props: MoveProps) => ReactNode };
type Boards = Record<string, DrawingHistory>;
type Gesture = { pointer: number; mark: DrawingMark; boardKey: string };

// Anotações de cada gráfico durante a sessão da página, inclusive ao trocar de módulo.
// Nenhum dado da seção ou parâmetro mecânico participa deste histórico.
const sessionBoards = new Map<string, DrawingHistory>();
const TOOLS = [
  { id: "pen", label: "Livre", name: "Traço livre", icon: Pencil, shortcut: "P" },
  { id: "line", label: "Linha", name: "Linha", icon: Minus, shortcut: "L" },
  { id: "arrow", label: "Seta", name: "Seta", icon: ArrowUpRight, shortcut: "A" },
  { id: "eraser", label: "Borracha", name: "Borracha", icon: Eraser, shortcut: "E" },
] as const;
const COLORS = [
  { value: "#ffe16a", label: "Amarelo" }, { value: "#ffffff", label: "Branco" }, { value: "#48def3", label: "Ciano" },
  { value: "#ff76ba", label: "Rosa" }, { value: "#ff665e", label: "Vermelho" }, { value: "#42d39c", label: "Verde" },
];
const initialPosition = (size: DrawingSize): Position => ({ x: size.width >= 1000 ? 350 : 16, y: size.width < 760 ? size.height - 60 : 16 });
const clamp = (position: Position, width: number, height: number, size: DrawingSize): Position => ({
  x: Math.max(8, Math.min(position.x, size.width - width - 8)), y: Math.max(8, Math.min(position.y, size.height - height - 8)),
});
function boardsReducer(boards: Boards, action: { boardKey: string; command: DrawingCommand }): Boards {
  const previous = boards[action.boardKey] ?? EMPTY_DRAWING;
  const next = updateDrawing(previous, action.command);
  return next === previous ? boards : { ...boards, [action.boardKey]: next };
}
function editableTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("input, select, textarea, [contenteditable=true], [role=textbox]"));
}

function paintMark(context: CanvasRenderingContext2D, mark: DrawingMark, size: DrawingSize) {
  const points = mark.points.map(point => ({ x: point.x * size.width, y: point.y * size.height }));
  if (!points.length) return;
  context.save();
  context.globalCompositeOperation = mark.tool === "eraser" ? "destination-out" : "source-over";
  context.strokeStyle = context.fillStyle = mark.color;
  context.lineWidth = mark.width;
  context.lineCap = context.lineJoin = "round";
  context.beginPath();
  const first = points[0];
  const last = points[points.length - 1];
  if (mark.tool === "line" || mark.tool === "arrow") {
    const arrow = mark.tool === "arrow" ? drawingArrow(first, last, mark.width) : null;
    context.moveTo(first.x, first.y);
    context.lineTo(arrow?.base.x ?? last.x, arrow?.base.y ?? last.y);
    context.stroke();
    if (arrow) {
      context.beginPath(); context.moveTo(arrow.tip.x, arrow.tip.y);
      context.lineTo(arrow.left.x, arrow.left.y); context.lineTo(arrow.right.x, arrow.right.y); context.closePath(); context.fill();
    }
  } else if (points.length === 1) {
    context.arc(first.x, first.y, mark.width / 2, 0, Math.PI * 2); context.fill();
  } else {
    context.moveTo(first.x, first.y);
    for (let index = 1; index < points.length - 1; index++) {
      const point = points[index]; const next = points[index + 1];
      context.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
    }
    context.lineTo(last.x, last.y); context.stroke();
  }
  context.restore();
}

export function LectureDrawing({ active, boardKey, size, layoutVersion, renderMoveHandle }: Props) {
  const [boards, dispatch] = useReducer(boardsReducer, undefined, () => Object.fromEntries(sessionBoards));
  const history = boards[boardKey] ?? EMPTY_DRAWING;
  const [enabled, setEnabled] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [tool, setTool] = useState<DrawingTool>("pen");
  const [color, setColor] = useState(COLORS[0].value);
  const [penWidth, setPenWidth] = useState(4);
  const [eraserWidth, setEraserWidth] = useState(32);
  const [position, setPosition] = useState(() => initialPosition(size));
  const [toolbarHeight, setToolbarHeight] = useState(44);
  const canvas = useRef<HTMLCanvasElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const eraserCursor = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const frame = useRef<number | null>(null);
  const current = useRef({ history, size }); current.current = { history, size };
  const allBoards = useRef(boards); allBoards.current = boards;
  const width = Math.min(expanded ? 340 : 202, size.width - 24);
  const height = Math.min(expanded ? Math.max(274, toolbarHeight) : 44, size.height - 16);
  const toolbarPosition = clamp(position, width, height, size);

  const repaint = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      const element = canvas.current;
      const context = element?.getContext("2d");
      if (!element || !context) return;
      context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, element.width, element.height);
      const view = current.current;
      context.setTransform(element.width / view.size.width, 0, 0, element.height / view.size.height, 0, 0);
      for (const mark of view.history.present) paintMark(context, mark, view.size);
      if (gesture.current) paintMark(context, gesture.current.mark, view.size);
    });
  }, []);
  const cancelGesture = useCallback(() => {
    const pointer = gesture.current?.pointer; gesture.current = null;
    if (pointer !== undefined && canvas.current?.hasPointerCapture(pointer)) canvas.current.releasePointerCapture(pointer);
    if (eraserCursor.current) eraserCursor.current.style.display = "none";
    repaint();
  }, [repaint]);
  const command = useCallback((next: DrawingCommand) => {
    cancelGesture(); dispatch({ boardKey, command: next });
  }, [boardKey, cancelGesture]);
  const chooseTool = useCallback((next: DrawingTool) => {
    cancelGesture(); setTool(next); setEnabled(true); setExpanded(true);
  }, [cancelGesture]);
  const interact = useCallback(() => { cancelGesture(); setEnabled(false); }, [cancelGesture]);

  useEffect(() => {
    for (const [key, value] of Object.entries(boards)) sessionBoards.set(key, value);
  }, [boards]);
  useEffect(() => () => {
    for (const [key, value] of Object.entries(allBoards.current)) sessionBoards.set(key, value);
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    frame.current = null; gesture.current = null;
  }, []);
  useLayoutEffect(() => { interact(); }, [active, boardKey, interact]);
  useLayoutEffect(() => {
    if (!active || !canvas.current) return;
    cancelGesture();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.current.width = Math.max(1, Math.round(size.width * dpr));
    canvas.current.height = Math.max(1, Math.round(size.height * dpr));
    repaint();
  }, [active, size.width, size.height, cancelGesture, repaint]);
  useLayoutEffect(() => { if (active) repaint(); }, [active, history, boardKey, repaint]);
  useLayoutEffect(() => {
    if (!toolbar.current) return;
    const element = toolbar.current;
    const measure = () => setToolbarHeight(element.getBoundingClientRect().height);
    measure(); const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, [active, expanded]);
  useEffect(() => { setPosition(initialPosition(current.current.size)); }, [layoutVersion]);
  useEffect(() => {
    setPosition(previous => {
      const next = clamp(previous, width, height, size);
      return next.x === previous.x && next.y === previous.y ? previous : next;
    });
  }, [size.width, size.height, width, height]);
  useEffect(() => {
    if (!active) return;
    const keyboard = (event: KeyboardEvent) => {
      if (editableTarget(event.target) || event.altKey || event.repeat) return;
      const key = event.key.toLowerCase();
      if (event.ctrlKey || event.metaKey) {
        if (!enabled) return;
        if (key === "z") { event.preventDefault(); command({ type: event.shiftKey ? "redo" : "undo" }); }
        else if (key === "y") { event.preventDefault(); command({ type: "redo" }); }
        return;
      }
      if (key === "v") { event.preventDefault(); interact(); }
      else if (key === "d") {
        event.preventDefault(); if (enabled) interact(); else { setEnabled(true); setExpanded(true); }
      } else {
        const choice = TOOLS.find(item => item.shortcut.toLowerCase() === key);
        if (choice) { event.preventDefault(); chooseTool(choice.id); }
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [active, enabled, command, interact, chooseTool]);

  const updateCursor = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!eraserCursor.current) return;
    eraserCursor.current.style.display = enabled && tool === "eraser" ? "block" : "none";
    eraserCursor.current.style.left = `${event.clientX}px`; eraserCursor.current.style.top = `${event.clientY}px`;
  };
  const addSample = (event: ReactPointerEvent<HTMLCanvasElement>, finish = false) => {
    const drawing = gesture.current;
    if (!drawing || drawing.pointer !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (drawing.mark.tool === "line" || drawing.mark.tool === "arrow") {
      const end = drawingPoint(event.clientX, event.clientY, bounds);
      drawing.mark.points[1] = event.shiftKey ? snapDrawingEnd(drawing.mark.points[0], end, size) : end;
    } else {
      const events = event.nativeEvent.getCoalescedEvents?.();
      const samples = events?.length ? events : [event.nativeEvent];
      for (const sample of samples) {
        const point = drawingPoint(sample.clientX, sample.clientY, bounds);
        const last = drawing.mark.points[drawing.mark.points.length - 1];
        if (drawingDistance(last, point, size) >= (finish ? .1 : .8)) drawing.mark.points.push(point);
      }
    }
    repaint();
  };

  if (!active) return null;
  return <>
    <canvas ref={canvas} className={`lecture-drawing-canvas${enabled ? " is-drawing" : ""}${tool === "eraser" ? " is-eraser" : ""}`}
      aria-label={enabled ? `Área de anotações: ${TOOLS.find(item => item.id === tool)?.name}. Use Interagir para controlar o gráfico.` : "Anotações sobre o gráfico; interação com o gráfico liberada"}
      role="img" data-drawing-enabled={enabled} data-drawing-board={boardKey}
      onContextMenu={event => { if (enabled) event.preventDefault(); }}
      onPointerDown={event => {
        if (!enabled || event.button !== 0 || gesture.current) return;
        event.preventDefault(); event.stopPropagation();
        const start = drawingPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
        gesture.current = { pointer: event.pointerId, boardKey, mark: { tool, color, width: tool === "eraser" ? eraserWidth : penWidth, points: [start] } };
        event.currentTarget.setPointerCapture(event.pointerId); updateCursor(event); repaint();
      }}
      onPointerMove={event => { updateCursor(event); if (gesture.current) { event.preventDefault(); addSample(event); } }}
      onPointerUp={event => {
        const drawing = gesture.current;
        if (!drawing || drawing.pointer !== event.pointerId) return;
        event.preventDefault(); addSample(event, true); gesture.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        if ((drawing.mark.tool === "line" || drawing.mark.tool === "arrow") && drawingDistance(drawing.mark.points[0], drawing.mark.points[1] ?? drawing.mark.points[0], size) < 3) { repaint(); return; }
        dispatch({ boardKey: drawing.boardKey, command: { type: "add", mark: drawing.mark } });
      }}
      onPointerCancel={event => { if (gesture.current?.pointer === event.pointerId) cancelGesture(); }} onLostPointerCapture={() => { if (gesture.current) cancelGesture(); }}
      onPointerLeave={() => { if (eraserCursor.current) eraserCursor.current.style.display = "none"; }} />
    <div ref={eraserCursor} className="lecture-eraser-cursor" style={{ width: eraserWidth, height: eraserWidth }} aria-hidden="true" />
    <div ref={toolbar} className={`lecture-drawing-tools${expanded ? " is-expanded" : ""}${enabled ? " is-enabled" : ""}`}
      style={{ left: toolbarPosition.x, top: toolbarPosition.y, width, maxHeight: size.height - toolbarPosition.y - 8 }} role="region" aria-label="Ferramentas de anotação">
      <header className="lecture-drawing-heading">
        {renderMoveHandle({ position: toolbarPosition, width, clearance: height + 8, onMove: setPosition })}
        <button type="button" className="lecture-drawing-toggle" aria-pressed={enabled} title="Ativar/desativar desenho (D)"
          onClick={() => { if (enabled) interact(); else { setEnabled(true); setExpanded(true); } }}><Pencil size={16} aria-hidden="true" />{enabled ? "Desenhando" : "Desenhar"}</button>
        {expanded && <button type="button" className="lecture-drawing-interact" aria-pressed={!enabled} onClick={interact} title="Movimentar o gráfico e os cards (V)"><MousePointer2 size={15} aria-hidden="true" />Interagir</button>}
        <button type="button" className="lecture-icon" aria-label={expanded ? "Recolher ferramentas de desenho" : "Expandir ferramentas de desenho"} onClick={() => setExpanded(value => !value)}>
          {expanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
        </button>
      </header>
      {expanded && <div className="lecture-drawing-body">
        <div className="lecture-drawing-tool-grid" role="group" aria-label="Escolher ferramenta de desenho">
          {TOOLS.map(item => <button type="button" key={item.id} aria-label={item.name} title={`${item.name} (${item.shortcut})${item.id === "line" || item.id === "arrow" ? " · Shift: múltiplos de 45°" : ""}`}
            aria-pressed={enabled && tool === item.id} onClick={() => chooseTool(item.id)}><item.icon size={18} aria-hidden="true" /><span>{item.label}</span></button>)}
        </div>
        <div className="lecture-drawing-colors" role="group" aria-label="Cor do desenho">
          {COLORS.map(item => <button type="button" key={item.value} style={{ "--drawing-color": item.value } as CSSProperties}
            aria-label={item.label} title={item.label} aria-pressed={color === item.value} onClick={() => setColor(item.value)} />)}
          <label className="lecture-drawing-custom-color" title="Cor personalizada"><input type="color" value={color} aria-label="Cor personalizada do desenho" onChange={event => setColor(event.target.value)} /><span>Cor</span></label>
        </div>
        <label className="lecture-drawing-width"><span>{tool === "eraser" ? "Borracha" : "Espessura"}</span>
          <input type="range" aria-label={tool === "eraser" ? "Tamanho da borracha" : "Espessura do traço"} min={tool === "eraser" ? 8 : 1} max={tool === "eraser" ? 80 : 12} step={tool === "eraser" ? 2 : 1}
            value={tool === "eraser" ? eraserWidth : penWidth} onChange={event => (tool === "eraser" ? setEraserWidth : setPenWidth)(Number(event.target.value))} />
          <output>{tool === "eraser" ? eraserWidth : penWidth} px</output>
        </label>
        <div className="lecture-drawing-history">
          <button type="button" disabled={!history.past.length} onClick={() => command({ type: "undo" })} title="Desfazer (Ctrl+Z)"><Undo2 size={16} aria-hidden="true" />Desfazer</button>
          <button type="button" disabled={!history.future.length} onClick={() => command({ type: "redo" })} title="Refazer (Ctrl+Shift+Z ou Ctrl+Y)"><Redo2 size={16} aria-hidden="true" />Refazer</button>
          <button type="button" disabled={!history.present.length} onClick={() => command({ type: "clear" })} title="Limpar as anotações deste gráfico. A limpeza pode ser desfeita."><Trash2 size={16} aria-hidden="true" />Limpar</button>
        </div>
        <p className="lecture-drawing-hint" role="status">{enabled ? "Desenho ativado. Interagir libera o gráfico e os cards, mantendo os traços." : "Gráfico e cards liberados. Escolha uma ferramenta para voltar a desenhar."}</p>
      </div>}
    </div>
  </>;
}
