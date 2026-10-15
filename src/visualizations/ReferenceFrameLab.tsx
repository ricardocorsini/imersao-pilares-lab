import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { Check, Crosshair, Info, MoveRight, RotateCcw, Ruler } from "lucide-react";
import { RangeControl } from "../components/RangeControl";
import {
  FRAME_EXAMPLES,
  FRAME_SECTION,
  ORIGIN_LIMITS,
  computeReferenceFrame,
  type FramePoint,
  type LongitudinalForce,
  type ReferenceFrameState,
} from "../core/referenceFrame";
import "./reference-frame.css";

function fmt(value: number, digits = 1) {
  return (Math.abs(value) < 1e-9 ? 0 : value).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
function signed(value: number, digits = 1) {
  return `${value > 1e-9 ? "+" : ""}${fmt(value, digits)}`;
}
function clampOrigin(point: FramePoint): FramePoint {
  return {
    xMm: Math.max(-ORIGIN_LIMITS.xMm, Math.min(ORIGIN_LIMITS.xMm, Math.round(point.xMm / 5) * 5)),
    yMm: Math.max(-ORIGIN_LIMITS.yMm, Math.min(ORIGIN_LIMITS.yMm, Math.round(point.yMm / 5) * 5)),
  };
}

type DiagramProps = {
  forces: LongitudinalForce[];
  origin: FramePoint;
  selectedId: string;
  onOriginChange: (origin: FramePoint) => void;
  onSelectForce: (id: string) => void;
};

function ReferenceDiagram({ forces, origin, selectedId, onOriginChange, onSelectForce }: DiagramProps) {
  const container = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const [width, setWidth] = useState(600);
  const uniqueId = `reference-${useId().replaceAll(":", "")}`;
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const update = () => setWidth(Math.max(240, element.clientWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const height = width < 420 ? 430 : 610;
  const scale = Math.min((width - 96) / 500, (height - 76) / 800);
  const mapX = (x: number) => width / 2 + x * scale;
  const mapY = (y: number) => height / 2 - y * scale;
  const selected = forces.find((force) => force.id === selectedId) ?? forces[0];
  const localX = selected.xMm - origin.xMm;
  const localY = selected.yMm - origin.yMm;
  const sameOrigin = origin.xMm === 0 && origin.yMm === 0;
  const fullLabels = width >= 480;

  const moveFromPointer = (event: PointerEvent<SVGSVGElement>) => {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    onOriginChange(clampOrigin({ xMm: (point.x - width / 2) / scale, yMm: (height / 2 - point.y) / scale }));
  };
  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || (event.target as Element).closest("[data-force]")) return;
    event.preventDefault();
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!(event.target as Element).closest("[data-origin]")) moveFromPointer(event);
  };
  const onOriginKey = (event: KeyboardEvent<SVGGElement>) => {
    const step = event.shiftKey ? 25 : 5;
    const offsets: Record<string, FramePoint> = {
      ArrowLeft: { xMm: -step, yMm: 0 }, ArrowRight: { xMm: step, yMm: 0 },
      ArrowDown: { xMm: 0, yMm: -step }, ArrowUp: { xMm: 0, yMm: step },
    };
    const delta = offsets[event.key];
    if (!delta) return;
    event.preventDefault();
    onOriginChange(clampOrigin({ xMm: origin.xMm + delta.xMm, yMm: origin.yMm + delta.yMm }));
  };

  return (
    <div className="origin-diagram-wrap" ref={container}>
      <svg ref={svg} className="origin-section-svg" width={width} height={height}
        viewBox={`0 0 ${width} ${height}`} role="img"
        aria-labelledby={`${uniqueId}-title ${uniqueId}-description`}
        onPointerDown={onPointerDown}
        onPointerMove={(event) => { if (dragging.current) moveFromPointer(event); }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
        onLostPointerCapture={() => { dragging.current = false; }}>
        <title id={`${uniqueId}-title`}>Forças longitudinais, centroide O e origem deslocável O′</title>
        <desc id={`${uniqueId}-description`}>
          Seção de 300 por 600 milímetros. A origem O′ está em {origin.xMm}, {origin.yMm} milímetros.
          Use os controles de Δx e Δy ou arraste a origem. Força selecionada {selected.label}:
          {selected.forceKn} quilonewtons, coordenadas locais {localX}, {localY} milímetros.
        </desc>
        <defs>
          <marker id={`${uniqueId}-axis`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M0,0 L7,3.5 L0,7 Z" className="origin-axis-marker" />
          </marker>
          <linearGradient id={`${uniqueId}-concrete`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8bb7c8" stopOpacity="0.17" />
            <stop offset="1" stopColor="#8bb7c8" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        {[-200, -100, 0, 100, 200].map((x) => <line key={`x${x}`} className="origin-grid-line" x1={mapX(x)} x2={mapX(x)} y1={mapY(-375)} y2={mapY(375)} />)}
        {[-300, -150, 0, 150, 300].map((y) => <line key={`y${y}`} className="origin-grid-line" x1={mapX(-230)} x2={mapX(230)} y1={mapY(y)} y2={mapY(y)} />)}
        <rect className="origin-section-outline" x={mapX(-FRAME_SECTION.widthMm / 2)} y={mapY(FRAME_SECTION.heightMm / 2)}
          width={FRAME_SECTION.widthMm * scale} height={FRAME_SECTION.heightMm * scale} fill={`url(#${uniqueId}-concrete)`} />
        {!sameOrigin && <>
          <line className="origin-original-axis" x1={mapX(-235)} x2={mapX(235)} y1={mapY(0)} y2={mapY(0)} />
          <line className="origin-original-axis" x1={mapX(0)} x2={mapX(0)} y1={mapY(-380)} y2={mapY(380)} />
          <text className="origin-original-label" x={mapX(235) + 6} y={mapY(0) + (origin.yMm >= 0 ? 20 : -12)}>x</text>
          <text className="origin-original-label" x={mapX(0) + (origin.xMm < 0 ? 10 : -10)} y={mapY(380) - 4} textAnchor={origin.xMm < 0 ? "start" : "end"}>y</text>
          <circle className="origin-original-point" cx={mapX(0)} cy={mapY(0)} r="3" />
          <text className="origin-original-label" x={mapX(0) - 10} y={mapY(0) + 20} textAnchor="end">O</text>
          <path className="origin-translation-vector" d={`M${mapX(0)},${mapY(0)} L${mapX(origin.xMm)},${mapY(0)} L${mapX(origin.xMm)},${mapY(origin.yMm)}`} />
        </>}
        <line className="origin-current-axis" x1={mapX(-235)} x2={mapX(235)} y1={mapY(origin.yMm)} y2={mapY(origin.yMm)} markerEnd={`url(#${uniqueId}-axis)`} />
        <line className="origin-current-axis" x1={mapX(origin.xMm)} x2={mapX(origin.xMm)} y1={mapY(-380)} y2={mapY(380)} markerEnd={`url(#${uniqueId}-axis)`} />
        <text className="origin-current-label" x={mapX(235) + 7} y={mapY(origin.yMm) + 4}>x′</text>
        <text className="origin-current-label" x={mapX(origin.xMm) + (origin.xMm < 0 ? -8 : 8)} y={mapY(380) - 5} textAnchor={origin.xMm < 0 ? "end" : "start"}>y′</text>
        <line className="origin-arm is-x" x1={mapX(origin.xMm)} x2={mapX(selected.xMm)} y1={mapY(selected.yMm)} y2={mapY(selected.yMm)} />
        <line className="origin-arm is-y" x1={mapX(selected.xMm)} x2={mapX(selected.xMm)} y1={mapY(origin.yMm)} y2={mapY(selected.yMm)} />
        {Math.abs(localX) * scale > 38 && <text className="origin-arm-label is-x" textAnchor="middle"
          x={mapX((origin.xMm + selected.xMm) / 2)} y={mapY(selected.yMm) - 10}>
          {fullLabels && Math.abs(localX) * scale > 110 ? `x′ = ${fmt(localX, 0)} mm` : "x′"}
        </text>}
        {Math.abs(localY) * scale > 42 && <text className="origin-arm-label is-y" textAnchor={selected.xMm >= 0 ? "end" : "start"}
          x={mapX(selected.xMm) + (selected.xMm >= 0 ? -11 : 11)} y={mapY((origin.yMm + selected.yMm) / 2) + 4}>
          {fullLabels ? `y′ = ${fmt(localY, 0)} mm` : "y′"}
        </text>}
        {forces.map((force) => <g key={force.id} data-force={force.id}
          className={`origin-force-target ${force.forceKn > 0 ? "is-compression" : force.forceKn < 0 ? "is-tension" : "is-zero"} ${force.id === selectedId ? "is-selected" : ""}`}
          role="button" tabIndex={0} aria-label={`Selecionar ${force.label}: ${signed(force.forceKn)} kN`}
          aria-pressed={force.id === selectedId} onClick={() => onSelectForce(force.id)}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectForce(force.id); } }}>
          <circle className="origin-force-hit" cx={mapX(force.xMm)} cy={mapY(force.yMm)} r="22" />
          {force.id === selectedId && <circle className="origin-force-halo" cx={mapX(force.xMm)} cy={mapY(force.yMm)} r="17" />}
          <circle className="origin-force-point" cx={mapX(force.xMm)} cy={mapY(force.yMm)} r="10" />
          <text className="origin-force-sign" x={mapX(force.xMm)} y={mapY(force.yMm) + 4} textAnchor="middle">{force.forceKn > 0 ? "+" : force.forceKn < 0 ? "−" : "0"}</text>
          <text className="origin-force-label" x={mapX(force.xMm) + (force.xMm < 0 ? -13 : 13)} y={mapY(force.yMm) - 13} textAnchor={force.xMm < 0 ? "end" : "start"}>{force.label}</text>
        </g>)}
        <g data-origin="true" className="origin-drag-handle" role="button" tabIndex={0}
          aria-label="Mover origem O′ com as setas do teclado" onKeyDown={onOriginKey}>
          <circle className="origin-handle-hit" cx={mapX(origin.xMm)} cy={mapY(origin.yMm)} r="22" />
          <circle className="origin-handle-ring" cx={mapX(origin.xMm)} cy={mapY(origin.yMm)} r="7" />
          <line className="origin-handle-cross" x1={mapX(origin.xMm) - 12} x2={mapX(origin.xMm) + 12} y1={mapY(origin.yMm)} y2={mapY(origin.yMm)} />
          <line className="origin-handle-cross" x1={mapX(origin.xMm)} x2={mapX(origin.xMm)} y1={mapY(origin.yMm) - 12} y2={mapY(origin.yMm) + 12} />
          <text className="origin-current-label" x={mapX(origin.xMm) + (origin.xMm < 0 ? -12 : 12)} y={mapY(origin.yMm) + 23}
            textAnchor={origin.xMm < 0 ? "end" : "start"}>{sameOrigin ? "O = O′" : "O′"}</text>
        </g>
        <text className="origin-section-size" x={18} y={height - 15}>{fullLabels ? "300 × 600 mm · eixos paralelos" : "300 × 600 mm"}</text>
        <text className="origin-section-size" x={width - 18} y={height - 15} textAnchor="end">coordenadas em mm</text>
      </svg>
    </div>
  );
}

function ResultsComparison({ state }: { state: ReferenceFrameState }) {
  return <div className="origin-results" aria-label="Comparação das resultantes nas duas origens">
    <div className="origin-result-heading"><span>Referência</span><span>N <small>kN</small></span><span>Mx <small>kN·m</small></span><span>My <small>kN·m</small></span></div>
    <div className="origin-result-row"><strong>Em O</strong><span>{signed(state.original.nKn)}</span><span>{signed(state.original.mxKnm)}</span><span>{signed(state.original.myKnm)}</span></div>
    <div className="origin-result-row is-new" data-testid="origin-shifted-results"><strong>Em O′</strong><span>{signed(state.shifted.nKn)}</span><span>{signed(state.shifted.mxKnm)}</span><span>{signed(state.shifted.myKnm)}</span></div>
  </div>;
}

export default function ReferenceFrameLab() {
  const [exampleId, setExampleId] = useState(FRAME_EXAMPLES[0].id);
  const [forces, setForces] = useState<LongitudinalForce[]>(() => FRAME_EXAMPLES[0].forces.map((force) => ({ ...force })));
  const [origin, setOrigin] = useState<FramePoint>({ xMm: 0, yMm: 0 });
  const [selectedId, setSelectedId] = useState("F1");
  const [edited, setEdited] = useState(false);
  const state = useMemo(() => computeReferenceFrame(forces, origin), [forces, origin]);
  const example = FRAME_EXAMPLES.find((candidate) => candidate.id === exampleId) ?? FRAME_EXAMPLES[0];
  const selected = forces.find((force) => force.id === selectedId) ?? forces[0];
  const selectedLocal = state.contributions.find((force) => force.id === selected.id)!;
  const changeExample = (id: string) => {
    const next = FRAME_EXAMPLES.find((candidate) => candidate.id === id) ?? FRAME_EXAMPLES[0];
    setExampleId(next.id); setForces(next.forces.map((force) => ({ ...force })));
    setOrigin({ xMm: 0, yMm: 0 }); setSelectedId(next.forces[0].id); setEdited(false);
  };
  const updateSelected = (patch: Partial<Pick<LongitudinalForce, "forceKn" | "xMm" | "yMm">>) => {
    setForces((current) => current.map((force) => force.id === selected.id ? { ...force, ...patch } : force));
    setEdited(true);
  };
  const zeroN = Math.abs(state.original.nKn) < 1e-9;

  return <div className="lab-shell reference-frame-lab">
    <div className="origin-equation-strip">
      <div><span>1</span><code>x′ = x − Δx · y′ = y − Δy</code></div><MoveRight size={15} aria-hidden="true" />
      <div><span>2</span><code>Mx′ = Mx − NΔy</code></div><MoveRight size={15} aria-hidden="true" />
      <div><span>3</span><code>My′ = My − NΔx</code></div>
    </div>
    <div className="origin-main-grid">
      <section className="origin-stage" aria-label="Seção e referências de cálculo">
        <header className="origin-stage-heading"><span className="origin-panel-index">A</span><div><h2>Mesmas forças, outra referência</h2><p>Arraste O′ ou clique no gráfico. Selecione uma força para conferir seus braços.</p></div></header>
        <ReferenceDiagram forces={forces} origin={origin} selectedId={selected.id} onOriginChange={setOrigin} onSelectForce={setSelectedId} />
        <div className="origin-legend"><span><i className="is-original" />referência inicial O</span><span><i className="is-current" />origem móvel O′</span><span><i className="is-compression" />compressão +</span><span><i className="is-tension" />tração −</span></div>
        <div className="origin-coordinate-readout"><strong>{selected.label}</strong><span>Em O: ({signed(selected.xMm, 0)}, {signed(selected.yMm, 0)}) mm</span><MoveRight size={15} aria-hidden="true" /><span>Em O′: ({signed(selectedLocal.xLocalMm, 0)}, {signed(selectedLocal.yLocalMm, 0)}) mm</span></div>
        <ResultsComparison state={state} />
      </section>

      <aside className="origin-controls" aria-label="Controles de eixos, origem e forças">
        <header className="origin-controls-heading"><Crosshair size={20} /><div><h2>Eixos e origem</h2><span>Aula 01 · convenções e equilíbrio</span></div></header>
        <label className="origin-select-label" htmlFor="origin-example">Exemplo</label>
        <select id="origin-example" className="origin-example-select" value={exampleId} onChange={(event) => changeExample(event.target.value)}>
          {FRAME_EXAMPLES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <p className="origin-example-description">{edited ? "Forças ajustadas manualmente a partir deste exemplo." : example.description}</p>
        <div className="origin-control-group"><h3><Crosshair size={15} /> Mover apenas a referência</h3>
          <RangeControl id="origin-delta-x" label="deslocamento da origem" symbol="Δx" value={origin.xMm} min={-200} max={200} step={5} unit="mm" fractionDigits={0} onChange={(xMm) => setOrigin({ ...origin, xMm })} />
          <RangeControl id="origin-delta-y" label="deslocamento da origem" symbol="Δy" value={origin.yMm} min={-350} max={350} step={5} unit="mm" fractionDigits={0} onChange={(yMm) => setOrigin({ ...origin, yMm })} />
          <div className="origin-position-presets">
            <button type="button" onClick={() => setOrigin({ xMm: 0, yMm: 0 })}>Em O</button>
            <button type="button" onClick={() => setOrigin({ xMm: 40, yMm: 50 })}>Δ(40, 50)</button>
            <button type="button" onClick={() => setOrigin({ xMm: selected.xMm, yMm: selected.yMm })}>Em {selected.label}</button>
          </div>
          <p className="origin-control-hint">Δ é medido de O para O′. As posições físicas das forças permanecem iguais.</p>
        </div>
        <div className="origin-control-group"><h3><Ruler size={15} /> Editar a força selecionada</h3>
          <div className="origin-force-selector" role="group" aria-label="Força selecionada">
            {forces.map((force) => <button key={force.id} type="button" className={selectedId === force.id ? "is-active" : ""} aria-pressed={selectedId === force.id} onClick={() => setSelectedId(force.id)}>{force.label} · {signed(force.forceKn, 0)} kN</button>)}
          </div>
          <RangeControl id="origin-force-value" label="compressão + · tração −" symbol={selected.label} value={selected.forceKn} min={-200} max={200} step={5} unit="kN" fractionDigits={0} onChange={(forceKn) => updateSelected({ forceKn })} />
          <RangeControl id="origin-force-x" label="posição física em relação a O" symbol="x" value={selected.xMm} min={-150} max={150} step={5} unit="mm" fractionDigits={0} onChange={(xMm) => updateSelected({ xMm })} />
          <RangeControl id="origin-force-y" label="posição física em relação a O" symbol="y" value={selected.yMm} min={-300} max={300} step={5} unit="mm" fractionDigits={0} onChange={(yMm) => updateSelected({ yMm })} />
          <p className="origin-control-hint">Editar F, x ou y altera o carregamento. Coordenada negativa não significa força de tração.</p>
        </div>
        <button className="origin-reset" type="button" onClick={() => changeExample(exampleId)}><RotateCcw size={15} /> Restaurar exemplo</button>
      </aside>
    </div>

    <section className="origin-calculations">
      <article className="origin-contributions-panel">
        <header className="origin-light-heading"><span className="origin-panel-index">B</span><div><h2>Contribuição de cada força em O′</h2><p>Mx usa o braço y′; My usa o braço x′. Todos os sinais participam da soma.</p></div></header>
        <div className="origin-table-wrap"><table className="origin-contribution-table">
          <thead><tr><th>Força</th><th>F <small>kN</small></th><th>x′ <small>mm</small></th><th>y′ <small>mm</small></th><th>F·y′ <small>kN·m</small></th><th>F·x′ <small>kN·m</small></th></tr></thead>
          <tbody>{state.contributions.map((force) => <tr key={force.id} className={force.id === selected.id ? "is-selected" : ""}><th>{force.label}</th><td>{signed(force.forceKn)}</td><td>{signed(force.xLocalMm, 0)}</td><td>{signed(force.yLocalMm, 0)}</td><td>{signed(force.mxKnm)}</td><td>{signed(force.myKnm)}</td></tr>)}</tbody>
          <tfoot><tr><th>Soma</th><td>{signed(state.shifted.nKn)}</td><td>—</td><td>—</td><td>{signed(state.shifted.mxKnm)}</td><td>{signed(state.shifted.myKnm)}</td></tr></tfoot>
        </table></div>
        <p className="origin-units-note">F em kN × braço em mm ÷ 1.000 = momento em kN·m.</p>
        <div className="origin-scalar-convention"><Info size={17} /><p>Convenção escalar interna: compressão positiva, Mx = Σ(F·y), My = Σ(F·x). Ao comparar com outro programa, compatibilize eixos, sinais e face do corte.</p></div>
      </article>
      <article className="origin-transform-panel">
        <header className="origin-light-heading"><span className="origin-panel-index">C</span><div><h2>A mesma resposta pela translação</h2><p>As resultantes originais e o deslocamento da referência bastam para conferir.</p></div></header>
        <div className="origin-formula-row"><code>N′ = N</code><strong>{signed(state.shifted.nKn)} <small>kN</small></strong><span>Nenhuma força foi adicionada ou removida.</span></div>
        <div className="origin-formula-row"><code>Mx′ = Mx − N·Δy / 1.000</code><strong>{signed(state.shifted.mxKnm)} <small>kN·m</small></strong><span>{fmt(state.original.mxKnm)} − ({fmt(state.original.nKn)} × {fmt(origin.yMm, 0)} / 1.000)</span></div>
        <div className="origin-formula-row"><code>My′ = My − N·Δx / 1.000</code><strong>{signed(state.shifted.myKnm)} <small>kN·m</small></strong><span>{fmt(state.original.myKnm)} − ({fmt(state.original.nKn)} × {fmt(origin.xMm, 0)} / 1.000)</span></div>
        <div className="origin-check"><Check size={16} /><span>Soma direta = translação das resultantes</span><strong>{state.residualKnm < 1e-9 ? "conferido" : `${state.residualKnm.toExponential(2)} kN·m`}</strong></div>
      </article>
    </section>

    <section className="origin-reading-section">
      <div className="origin-example-lesson"><Info size={19} /><div><strong>{edited ? "Observe o sistema ajustado" : example.label}</strong><p>{edited ? "Compare as contribuições de cada força. Mover O′ altera somente os braços; editar as forças ou suas posições altera o sistema físico." : example.lesson}</p></div></div>
      <div className="origin-reading-grid">
        <article><h3>O′ muda os braços</h3><p>x′ = x − Δx e y′ = y − Δy. Uma origem diferente não desloca fisicamente a seção nem as forças.</p></article>
        <article className={zeroN ? "is-highlighted" : ""}><h3>{zeroN ? "N = 0: momentos invariantes" : "N ≠ 0: momentos dependem da origem"}</h3><p>{zeroN ? "Os termos NΔy e NΔx se anulam. Um binário mantém seu momento em qualquer origem." : "Deslocar a origem modifica os momentos pelos termos −NΔy e −NΔx. A força normal permanece a mesma."}</p></article>
        <article><h3>Uma referência para a verificação</h3><p>Solicitação e resistência devem usar a mesma origem. Ao transladar a referência, transforme ambas de forma coerente.</p></article>
      </div>
      <footer><strong>Modelo desta demonstração:</strong> forças longitudinais conhecidas em uma seção esquemática. Os resultados são de estática; não constituem capacidade resistente nem verificação do ELU.</footer>
    </section>
  </div>;
}
