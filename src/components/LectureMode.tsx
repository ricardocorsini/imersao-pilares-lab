import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { GripVertical, Maximize2, Minimize2, PanelsTopLeft, RotateCcw, Settings2, X } from "lucide-react";
import { LECTURE_MODULES, type LectureBlock } from "../core/lectureModules";
import "./lecture-mode.css";

type Position = { x: number; y: number };
type Rect = Position & { width: number; height: number };
type Size = { width: number; height: number };
type Props = { active: boolean; moduleId: string; title: string; onExit: () => void; children: ReactNode };
const viewport = (): Size => ({ width: window.innerWidth, height: window.innerHeight });
const clampPosition = (position: Position, width: number, size: Size, clearance = 88): Position => ({
  x: Math.max(8, Math.min(position.x, size.width - width - 8)),
  y: Math.max(8, Math.min(position.y, size.height - clearance)),
});
const panelWidth = (size: Size) => Math.min(390, size.width - 24);
const launcherWidth = (size: Size) => Math.min(286, size.width - 16);
const initialLauncher = (size: Size) => ({ x: size.width - launcherWidth(size) - 16, y: 16 });
const initialPanel = (size: Size) => ({ x: size.width - panelWidth(size) - 16, y: 74 });
const cardWidth = (block: LectureBlock, size: Size) => Math.min(block.width ?? 420, size.width - 24);
const at = (position: Position, width: number): CSSProperties => ({ left: position.x, top: position.y, width });

/** Only our attributes and variables are restored; React keeps owning the actual content and styles. */
function decorate(element: HTMLElement | SVGElement, attribute: string, value: string, variables: Record<string, string> = {}) {
  const previous = element.getAttribute(attribute);
  const styles = Object.keys(variables).map(key => [key, element.style.getPropertyValue(key), element.style.getPropertyPriority(key)]);
  element.setAttribute(attribute, value);
  for (const [key, content] of Object.entries(variables)) element.style.setProperty(key, content);
  return () => {
    if (previous === null) element.removeAttribute(attribute); else element.setAttribute(attribute, previous);
    for (const [key, content, priority] of styles) {
      if (content) element.style.setProperty(key, content, priority); else element.style.removeProperty(key);
    }
  };
}

function MoveHandle({ label, position, width, size, onMove, children, clearance = 88 }: {
  label: string; position: Position; width: number; size: Size; onMove: (next: Position) => void; children?: ReactNode; clearance?: number;
}) {
  const drag = useRef<{ pointer: number; x: number; y: number; start: Position } | null>(null);
  return <button type="button" className="lecture-move" aria-label={`Mover ${label}`}
    title="Arraste para mover. Pelo teclado, use as setas; Shift acelera."
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, start: position };
    }}
    onPointerMove={event => {
      const current = drag.current;
      if (!current || current.pointer !== event.pointerId) return;
      onMove(clampPosition({ x: current.start.x + event.clientX - current.x, y: current.start.y + event.clientY - current.y }, width, size, clearance));
    }}
    onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
    onLostPointerCapture={() => { drag.current = null; }}
    onKeyDown={event => {
      const delta = event.shiftKey ? 40 : 10;
      const directions: Record<string, Position> = { ArrowLeft: { x: -delta, y: 0 }, ArrowRight: { x: delta, y: 0 }, ArrowUp: { x: 0, y: -delta }, ArrowDown: { x: 0, y: delta } };
      const direction = directions[event.key];
      if (!direction) return;
      event.preventDefault(); event.stopPropagation();
      onMove(clampPosition({ x: position.x + direction.x, y: position.y + direction.y }, width, size, clearance));
    }}><GripVertical size={17} aria-hidden="true" />{children}</button>;
}

export function LectureMode({ active, moduleId, title, onExit, children }: Props) {
  const definition = LECTURE_MODULES[moduleId];
  const content = useRef<HTMLDivElement>(null);
  const controlsSlot = useRef<HTMLDivElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const [size, setSize] = useState(viewport);
  const [revision, setRevision] = useState(0);
  const [graphId, setGraphId] = useState(definition.graphs[0].id);
  const [controlId, setControlId] = useState(definition.controls[0]?.id ?? "");
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [tab, setTab] = useState<"controls" | "cards">("controls");
  const [launcher, setLauncher] = useState(() => initialLauncher(viewport()));
  const [panel, setPanel] = useState(() => initialPanel(viewport()));
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [positions, setPositions] = useState<Record<string, Position>>({});
  const [frontCard, setFrontCard] = useState<string | null>(null);
  const [slot, setSlot] = useState<Rect | null>(null);
  const naturalSizes = useRef(new Map<Element, Size>());
  const find = (selector: string) => content.current?.querySelector<HTMLElement | SVGElement>(selector) ?? null;
  const graph = definition.graphs.find(item => item.id === graphId) ?? definition.graphs[0];
  const focused = find(graph.selector);
  const control = definition.controls.find(item => item.id === controlId) ?? definition.controls[0];
  const panelPosition = clampPosition(panel, panelWidth(size), size, Math.min(320, size.height - 16));
  const controlsElement = active && settingsOpen && tab === "controls" && control ? find(control.selector) : null;
  const collidesWithGraph = (element: Element | null) => Boolean(element && focused && (element === focused || element.contains(focused) || focused.contains(element)));
  const floatingCards = active ? definition.cards.filter(item => {
    const element = find(item.selector);
    return selectedCards.includes(item.id) && element && !collidesWithGraph(element) && !controlsElement?.contains(element);
  }) : [];

  useEffect(() => {
    const resize = () => {
      const next = viewport(); setSize(next);
      setLauncher(current => clampPosition(current, launcherWidth(next), next));
      setPanel(current => clampPosition(current, panelWidth(next), next, Math.min(320, next.height - 16)));
      setPositions(current => Object.fromEntries(Object.entries(current).map(([id, position]) => {
        const item = definition.cards.find(candidate => candidate.id === id);
        return [id, clampPosition(position, item ? cardWidth(item, next) : 420, next)];
      })));
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [definition]);

  useLayoutEffect(() => {
    if (!content.current) return;
    const observer = new MutationObserver(records => {
      if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === Node.ELEMENT_NODE))) setRevision(value => value + 1);
    });
    observer.observe(content.current, { subtree: true, childList: true });
    setRevision(value => value + 1);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!active) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    settingsButton.current?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onExit(); } };
    window.addEventListener("keydown", escape);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", escape); };
  }, [active, onExit]);

  // Keep this effect independent of panel/card dragging: never resize a graph for a panel move.
  useLayoutEffect(() => {
    if (!active || !content.current) return;
    const element = content.current.querySelector<HTMLElement | SVGElement>(graph.selector);
    if (!element) return;
    let natural = naturalSizes.current.get(element);
    if (!natural) {
      const rect = element.getBoundingClientRect();
      natural = { width: Math.max(240, rect.width), height: Math.max(160, rect.height) };
      naturalSizes.current.set(element, natural);
    }
    const scale = Math.min((size.width - 32) / natural.width, (size.height - 48) / natural.height);
    return decorate(element, "data-lecture-focus", graph.kind, {
      "--lecture-natural-width": `${natural.width}px`, "--lecture-natural-height": `${natural.height}px`, "--lecture-scale": `${scale}`,
    });
  }, [active, graph.selector, graph.kind, revision, size]);

  useLayoutEffect(() => {
    if (!active || !settingsOpen || tab !== "controls" || !controlsSlot.current) { setSlot(null); return; }
    const element = controlsSlot.current;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setSlot(current => current && current.x === rect.x && current.y === rect.y && current.width === rect.width && current.height === rect.height
        ? current : { x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, [active, settingsOpen, tab, panel, size, controlId]);

  useLayoutEffect(() => {
    if (!active || !slot || !controlsElement) return;
    return decorate(controlsElement, "data-lecture-controls", control.tone ?? "light", {
      "--lecture-left": `${slot.x}px`, "--lecture-top": `${slot.y}px`, "--lecture-width": `${slot.width}px`, "--lecture-height": `${slot.height}px`,
    });
  }, [active, slot, controlsElement, control, revision]);

  useLayoutEffect(() => {
    if (!active) return;
    const cleanups = floatingCards.map((item, index) => {
      const element = find(item.selector)!;
      const position = clampPosition(positions[item.id] ?? { x: 24 + index * 32, y: 80 + index * 54 }, cardWidth(item, size), size);
      return decorate(element, "data-lecture-card", item.tone ?? "light", {
        "--lecture-left": `${position.x}px`, "--lecture-top": `${position.y + 38}px`, "--lecture-width": `${cardWidth(item, size)}px`,
        "--lecture-height": `${Math.max(24, size.height - position.y - 54)}px`, "--lecture-layer": `${frontCard === item.id ? 400 : 220 + index * 2}`,
      });
    });
    return () => cleanups.forEach(cleanup => cleanup());
  }, [active, selectedCards, positions, graphId, settingsOpen, tab, controlId, revision, size, frontCard]);

  useEffect(() => { if (!active) naturalSizes.current.clear(); }, [active]);

  const resetLayout = () => {
    setLauncher(initialLauncher(size)); setPanel(initialPanel(size));
    setPositions(Object.fromEntries(selectedCards.map((id, index) => [id, { x: 24 + (index % 3) * 32, y: 80 + (index % 4) * 54 }])));
  };
  const toggleCard = (id: string) => {
    if (!selectedCards.includes(id)) {
      setPositions(current => current[id] ? current : { ...current, [id]: { x: 24 + (selectedCards.length % 3) * 32, y: 80 + (selectedCards.length % 4) * 54 } });
      setFrontCard(id);
    }
    setSelectedCards(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  };

  return <div className={`lecture-mode${active ? " is-active" : ""}`} data-lecture-module={moduleId}
    onPointerDownCapture={event => {
      if (!active || !(event.target instanceof Element)) return;
      const header = event.target.closest("[data-lecture-card-heading]");
      const body = event.target.closest("[data-lecture-card]");
      const item = header?.getAttribute("data-lecture-card-heading") ?? definition.cards.find(candidate => body?.matches(candidate.selector))?.id;
      if (item) setFrontCard(item);
    }}>
    <div className="lecture-module-content" ref={content}>{children}</div>
    {active && <>
      <div className="lecture-launcher" style={at(clampPosition(launcher, launcherWidth(size), size), launcherWidth(size))} role="region" aria-label="Modo aula">
        <MoveHandle label="botão de configurações" position={launcher} width={launcherWidth(size)} size={size} onMove={setLauncher} />
        <button type="button" className="lecture-settings-button" ref={settingsButton} aria-expanded={settingsOpen} aria-controls="lecture-settings" onClick={() => setSettingsOpen(value => !value)}>
          <Settings2 size={17} aria-hidden="true" />Configurações
        </button>
        <button type="button" className="lecture-icon" onClick={onExit} aria-label="Sair do modo aula" title="Sair do modo aula (Esc)"><Minimize2 size={18} aria-hidden="true" /></button>
      </div>
      <div className="lecture-caption" aria-hidden="true"><Maximize2 size={12} />{graph.label}</div>
      {settingsOpen && <section id="lecture-settings" className="lecture-settings" aria-label={`Configurações do modo aula: ${title}`} style={{ ...at(panelPosition, panelWidth(size)), height: Math.min(710, size.height * .78, size.height - panelPosition.y - 12) }}>
        <header className="lecture-window-heading">
          <MoveHandle label="janela de configurações" position={panelPosition} width={panelWidth(size)} size={size} onMove={setPanel} clearance={Math.min(320, size.height - 16)}><span>Modo aula</span></MoveHandle>
          <button type="button" className="lecture-icon" aria-label="Reorganizar painéis" title="Reorganizar botão, janela e cards" onClick={resetLayout}><RotateCcw size={16} aria-hidden="true" /></button>
          <button type="button" className="lecture-icon" aria-label="Fechar configurações" onClick={() => { setSettingsOpen(false); settingsButton.current?.focus(); }}><X size={18} aria-hidden="true" /></button>
        </header>
        <div className="lecture-graph-picker"><label htmlFor="lecture-main-graph">Gráfico principal</label>
          <select id="lecture-main-graph" value={graph.id} onChange={event => setGraphId(event.target.value)}>
            {definition.graphs.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
        <div className="lecture-tabs" role="tablist" aria-label="Conteúdo das configurações" onKeyDown={event => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const next = tab === "controls" ? "cards" : "controls"; setTab(next);
          document.getElementById(`lecture-tab-${next}`)?.focus();
        }}>
          <button type="button" role="tab" id="lecture-tab-controls" aria-selected={tab === "controls"} aria-controls="lecture-control-pane" onClick={() => setTab("controls")}><Settings2 size={14} aria-hidden="true" />Controles</button>
          <button type="button" role="tab" id="lecture-tab-cards" aria-selected={tab === "cards"} aria-controls="lecture-card-pane" onClick={() => setTab("cards")}><PanelsTopLeft size={14} aria-hidden="true" />Cards na tela{selectedCards.length > 0 && <span>{selectedCards.length}</span>}</button>
        </div>
        {tab === "controls" ? <div className="lecture-control-pane" id="lecture-control-pane" role="tabpanel" aria-labelledby="lecture-tab-controls">
          {definition.controls.length > 1 && <label className="lecture-control-picker">Grupo de controles<select value={controlId} onChange={event => setControlId(event.target.value)}>
            {definition.controls.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select></label>}
          <div className="lecture-controls-slot" ref={controlsSlot}>{!controlsElement && <p>Carregando os controles…</p>}</div>
        </div> : <div className="lecture-card-pane" id="lecture-card-pane" role="tabpanel" aria-labelledby="lecture-tab-cards">
          <p>Escolha as leituras que aparecem sobre o gráfico. Arraste o cabeçalho de cada card para posicioná-lo.</p>
          {definition.cards.map(item => {
            const element = find(item.selector);
            const collision = collidesWithGraph(element);
            const unavailable = !element || collision;
            return <label key={item.id} className={`lecture-card-option${unavailable ? " is-unavailable" : ""}`}>
              <input type="checkbox" checked={selectedCards.includes(item.id)} disabled={unavailable} onChange={() => toggleCard(item.id)} />
              <span>{item.label}{unavailable && <small>{collision ? "Já está no gráfico principal" : "Disponível ao ativar esse recurso no módulo"}</small>}</span>
            </label>;
          })}
          <p className="lecture-help">As leituras e os controles continuam ao vivo. Um card contido no grupo de controles aparece dentro da janela enquanto esse grupo está aberto.</p>
          <button type="button" className="lecture-reset" onClick={resetLayout}><RotateCcw size={14} aria-hidden="true" />Reorganizar painéis</button>
        </div>}
        <p className="lecture-window-footnote">Arraste pelas alças <GripVertical size={13} aria-hidden="true" /> · Esc para sair</p>
      </section>}
      {floatingCards.map((item, index) => {
        const width = cardWidth(item, size);
        const position = clampPosition(positions[item.id] ?? { x: 24 + index * 32, y: 80 + index * 54 }, width, size);
        return <div className="lecture-card-heading" data-lecture-card-heading={item.id} key={item.id} style={{ ...at(position, width), zIndex: frontCard === item.id ? 401 : 221 + index * 2 }}>
          <MoveHandle label={`card ${item.label}`} position={position} width={width} size={size} onMove={next => setPositions(current => ({ ...current, [item.id]: next }))}><span>{item.label}</span></MoveHandle>
          <button type="button" className="lecture-icon" aria-label={`Ocultar card ${item.label}`} onClick={() => toggleCard(item.id)}><X size={16} aria-hidden="true" /></button>
        </div>;
      })}
    </>}
  </div>;
}
