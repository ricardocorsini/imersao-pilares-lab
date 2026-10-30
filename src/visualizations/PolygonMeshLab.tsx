import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowUpRight, ChartLine, Check, Crosshair, Grid3X3, Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { RangeControl } from "../components/RangeControl";
import { LayerToggle } from "../components/LayerToggle";
import {
  MAX_MESH_DIVISIONS, POLYGON_PRESETS, buildPolygonMesh, formatPolygonCoordinates,
  parsePolygonCoordinates, polygonProperties, polygonRefinementStudy, resolutionForTarget,
  type PolygonMesh, type PolygonPoint, type RefinementSample,
} from "../core/polygonMesh";
import "./polygon-mesh.css";

const fmt = (value: number | null, digits = 2) => value === null ? "—" :
  (Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value).toLocaleString("pt-BR", { maximumFractionDigits: digits });
const signed = (value: number | null, digits = 2) => value === null ? "—" : `${value > 0.5 * 10 ** -digits ? "+" : ""}${fmt(value, digits)}`;
const pair = (p: PolygonPoint | null) => p ? `(${fmt(p.x)}; ${fmt(p.y)})` : "indefinido";
const STORAGE_KEY = "pilares-polygon-mesh-v1";
type Configuration = { vertices: PolygonPoint[]; preset: string; nx: number; ny: number };
const defaultConfiguration = (): Configuration => ({ vertices: POLYGON_PRESETS[0].vertices.map(p => ({ ...p })), preset: "trapezio", nx: 5, ny: 10 });
function readConfiguration(): Configuration {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "null") as Configuration | null;
    if (saved && typeof saved.preset === "string") {
      const polygon = polygonProperties(saved.vertices);
      buildPolygonMesh(polygon, saved.nx, saved.ny);
      return { ...saved, vertices: polygon.vertices };
    }
  } catch { /* Sem armazenamento ou com dados antigos, o exemplo da aula continua disponível. */ }
  return defaultConfiguration();
}
type Appearance = { rejected: boolean; centers: boolean; vertices: boolean; centroids: boolean; grid: boolean; color: string; opacity: number };
const initialAppearance: Appearance = { rejected: true, centers: true, vertices: false, centroids: true, grid: true, color: "#43def8", opacity: 38 };

function ShapeIcon({ vertices }: { vertices: PolygonPoint[] }) {
  const xs = vertices.map(p => p.x), ys = vertices.map(p => p.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), width = Math.max(...xs) - x0, height = Math.max(...ys) - y0;
  const scale = 24 / Math.max(width, height);
  return <svg viewBox="0 0 32 32" aria-hidden="true"><polygon points={vertices.map(p => `${16 + (p.x - x0 - width / 2) * scale},${16 - (p.y - y0 - height / 2) * scale}`).join(" ")} /></svg>;
}

function GeometryControls({ config, onChange, mesh, appearance, onAppearance }: {
  config: Configuration; onChange: (next: Configuration) => void; mesh: PolygonMesh;
  appearance: Appearance; onAppearance: (next: Appearance) => void;
}) {
  const [draft, setDraft] = useState(() => formatPolygonCoordinates(config.vertices));
  const [coordinateError, setCoordinateError] = useState("");
  const [coordinateMessage, setCoordinateMessage] = useState("");
  const [step, setStep] = useState(() => String(Math.max(mesh.dx, mesh.dy)));
  const [stepError, setStepError] = useState("");
  const [resolutionMode, setResolutionMode] = useState("divisions");
  const [divisions, setDivisions] = useState({ nx: String(config.nx), ny: String(config.ny) });
  const [divisionError, setDivisionError] = useState("");
  useEffect(() => { setDivisions({ nx: String(config.nx), ny: String(config.ny) }); setDivisionError(""); }, [config.nx, config.ny]);
  const applyCoordinates = () => {
    try {
      const vertices = parsePolygonCoordinates(draft);
      onChange({ ...config, vertices, preset: "personalizado" });
      setDraft(formatPolygonCoordinates(vertices)); setCoordinateError("");
      setCoordinateMessage(`${vertices.length} vértices aplicados. O contorno liga o último ao primeiro.`);
    } catch (error) { setCoordinateError((error as Error).message); setCoordinateMessage(""); }
  };
  const applyDivisions = () => {
    const nx = Number(divisions.nx), ny = Number(divisions.ny);
    if (![nx, ny].every(n => Number.isInteger(n) && n >= 1 && n <= MAX_MESH_DIVISIONS)) {
      setDivisionError(`Informe inteiros de 1 a ${MAX_MESH_DIVISIONS}.`); return;
    }
    setDivisionError(""); onChange({ ...config, nx, ny });
  };
  return <aside className="polygon-controls" aria-label="Controles da geometria e discretização">
    <header className="polygon-controls-heading"><Grid3X3 size={20} aria-hidden="true" /><div><h2>Construa a seção</h2><span>Aula 03 · geometria e fibras</span></div></header>
    <fieldset><legend>01 <span>Contorno do polígono</span></legend>
      <div className="polygon-presets">{POLYGON_PRESETS.map(preset => <button type="button" key={preset.id} aria-pressed={config.preset === preset.id}
        onClick={() => {
          onChange({ ...config, vertices: preset.vertices.map(p => ({ ...p })), preset: preset.id });
          setDraft(formatPolygonCoordinates(preset.vertices)); setCoordinateError(""); setCoordinateMessage(""); setStepError("");
        }}><ShapeIcon vertices={preset.vertices} /><span>{preset.label}</span></button>)}</div>
      <details className="polygon-coordinate-editor" open={config.preset === "personalizado" ? true : undefined}>
        <summary>Inserir ou editar coordenadas</summary>
        <label htmlFor="polygon-coordinates">Vértices em mm · um par x; y por linha</label>
        <textarea id="polygon-coordinates" rows={7} value={draft} spellCheck={false} aria-invalid={!!coordinateError}
          aria-describedby="polygon-coordinate-hint polygon-coordinate-feedback" onChange={event => { setDraft(event.target.value); setCoordinateMessage(""); }} />
        <p id="polygon-coordinate-hint">Percorra a borda em ordem. Aceita concavidades e vírgula decimal: <code>120,5; 600</code>. Um contorno maciço, sem furos ou cruzamentos.</p>
        <button type="button" className="polygon-primary-button" onClick={applyCoordinates}><Check size={14} aria-hidden="true" />Aplicar contorno</button>
        <p id="polygon-coordinate-feedback" className={coordinateError ? "polygon-input-error" : "polygon-input-success"} role="status">{coordinateError || coordinateMessage}</p>
      </details>
      <div className="polygon-geometry-note">{mesh.polygon.vertices.length} vértices · {fmt(mesh.polygon.bounds.width)} × {fmt(mesh.polygon.bounds.height)} mm<br />
        {mesh.polygon.signedArea > 0 ? "Percurso anti-horário" : "Percurso horário"} · área e centroide pelo contorno</div>
    </fieldset>
    <fieldset><legend>02 <span>Discretização do envolvente</span></legend>
      <div className="polygon-segmented" aria-label="Forma de definir a resolução">{[["divisions", "Divisões nx × ny"], ["target", "Tamanho-alvo"]].map(([id, label]) =>
        <button type="button" key={id} aria-pressed={resolutionMode === id} onClick={() => setResolutionMode(id)}>{label}</button>)}</div>
      {resolutionMode === "divisions" ? <>
        <div className="polygon-number-pair">{(["nx", "ny"] as const).map(axis => <label key={axis} htmlFor={`polygon-${axis}`}>{axis === "nx" ? "nx · direção x" : "ny · direção y"}
          <input id={`polygon-${axis}`} type="number" min="1" max={MAX_MESH_DIVISIONS} step="1" value={divisions[axis]} aria-invalid={!!divisionError}
            onChange={event => setDivisions(current => ({ ...current, [axis]: event.target.value }))} onKeyDown={event => { if (event.key === "Enter") applyDivisions(); }} /></label>)}</div>
        <button type="button" className="polygon-outline-button" onClick={applyDivisions}>Aplicar divisões</button>
        {divisionError && <p role="status" className="polygon-input-error">{divisionError}</p>}
        <RangeControl id="polygon-nx-range" label="Divisões em x" symbol="nx" value={config.nx} min={1} max={MAX_MESH_DIVISIONS} step={1} unit="" signed={false} fractionDigits={0} onChange={nx => onChange({ ...config, nx })} />
        <RangeControl id="polygon-ny-range" label="Divisões em y" symbol="ny" value={config.ny} min={1} max={MAX_MESH_DIVISIONS} step={1} unit="" signed={false} fractionDigits={0} onChange={ny => onChange({ ...config, ny })} />
      </> : <div className="polygon-target-input"><label htmlFor="polygon-target-size">Maior lado desejado da célula (mm)</label>
        <div><input id="polygon-target-size" type="number" min="0" step="any" value={step} aria-invalid={!!stepError} onChange={event => setStep(event.target.value)} />
          <button type="button" className="polygon-primary-button" onClick={() => {
            try { onChange({ ...config, ...resolutionForTarget(mesh.polygon, Number(step.replace(",", "."))) }); setStepError(""); }
            catch (error) { setStepError((error as Error).message); }
          }}>Aplicar</button></div>
        <p>nx = ⌈largura/h⌉ e ny = ⌈altura/h⌉. Passos uniformes ajustados ao envolvente, sem sobras.</p>
        {stepError && <p role="status" className="polygon-input-error">{stepError}</p>}</div>}
      <div className="polygon-cell-size"><span>{config.nx} × {config.ny} = <strong>{fmt(mesh.cells.length, 0)} células</strong></span>
        <span>Δx = {fmt(mesh.dx, 3)} mm · Δy = {fmt(mesh.dy, 3)} mm</span><span>Ai = Δx · Δy = {fmt(mesh.dx * mesh.dy, 3)} mm²</span></div>
      <div className="polygon-quick-resolutions">{[10, 30, 60].map(level => <button type="button" key={level} onClick={() => {
        const scale = level / mesh.polygon.referenceLength;
        onChange({ ...config, nx: Math.max(1, Math.round(mesh.polygon.bounds.width * scale)), ny: Math.max(1, Math.round(mesh.polygon.bounds.height * scale)) });
      }}>{level === 10 ? "Grosseira" : level === 30 ? "Média" : "Fina"}</button>)}</div>
    </fieldset>
    <fieldset><legend>03 <span>Camadas e aparência</span></legend>
      {([["grid", "Linhas da malha"], ["rejected", "Células descartadas"], ["centers", "Centros das células"], ["vertices", "Rótulos dos vértices"], ["centroids", "Centroides C e Cm"]] as const).map(([key, label]) =>
        <LayerToggle key={key} label={label} checked={appearance[key]} onChange={value => onAppearance({ ...appearance, [key]: value })} />)}
      <div className="polygon-color-control"><label htmlFor="polygon-cell-color">Cor das células aceitas</label><input id="polygon-cell-color" type="color" value={appearance.color} onChange={event => onAppearance({ ...appearance, color: event.target.value })} /></div>
      <RangeControl id="polygon-opacity" label="Preenchimento" symbol="α" value={appearance.opacity} min={5} max={85} step={1} unit="%" signed={false} fractionDigits={0} onChange={opacity => onAppearance({ ...appearance, opacity })} />
    </fieldset>
    <button type="button" className="polygon-outline-button polygon-reset" onClick={() => {
      const next = defaultConfiguration(); onChange(next); setDraft(formatPolygonCoordinates(next.vertices));
      setCoordinateError(""); setCoordinateMessage(""); setStep("60"); setStepError(""); onAppearance(initialAppearance);
    }}><RotateCcw size={14} aria-hidden="true" />Restaurar trapézio da aula</button>
  </aside>;
}

/** Paths agrupados mantêm o SVG leve mesmo com 14.400 células. A seleção usa a posição na grade. */
function MeshDiagram({ mesh, appearance, progress = mesh.cells.length, selectedId, onSelect, difference = false }: {
  mesh: PolygonMesh; appearance: Appearance; progress?: number; selectedId?: number; onSelect?: (id: number) => void; difference?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const w = 800, h = 540, { polygon } = mesh, b = polygon.bounds;
  const scale = Math.min((w - 170) / b.width, (h - 130) / b.height);
  const left = (w - b.width * scale) / 2, top = (h - b.height * scale) / 2 - 3;
  const mx = (x: number) => left + (x - b.minX) * scale, my = (y: number) => top + (b.maxY - y) * scale;
  const outline = polygon.vertices.map(p => `${mx(p.x)},${my(p.y)}`).join(" ");
  const paths = useMemo(() => {
    const result = { accepted: "", rejected: "", pending: "", acceptedCenters: "", rejectedCenters: "" };
    for (const cell of mesh.cells) {
      const key = cell.id >= progress ? "pending" : cell.inside ? "accepted" : "rejected";
      const x = left + cell.col * mesh.dx * scale, y = top + (mesh.ny - cell.row - 1) * mesh.dy * scale;
      result[key] += `M${x},${y}h${mesh.dx * scale}v${mesh.dy * scale}h${-mesh.dx * scale}Z`;
      if (key !== "pending") result[key === "accepted" ? "acceptedCenters" : "rejectedCenters"] += `M${x + mesh.dx * scale / 2},${y + mesh.dy * scale / 2}h0.01`;
    }
    return result;
  }, [mesh, progress, left, top, scale]);
  const selected = selectedId === undefined ? undefined : mesh.cells[selectedId];
  const center = progress === mesh.cells.length ? mesh.metrics.centroid : null;
  return <div className={difference ? "polygon-comparison-wrap" : "polygon-mesh-wrap"}>
    <svg className="polygon-mesh-svg" viewBox={`0 0 ${w} ${h}`} role={onSelect ? "group" : "img"} tabIndex={onSelect ? 0 : undefined}
      aria-label={difference ? "Comparação do contorno exato, borda discretizada e centroides" : "Malha do polígono. Clique em uma célula ou use as setas para inspecionar seu centro."}
      onClick={event => {
        if (!onSelect) return;
        const point = event.currentTarget.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
        const matrix = event.currentTarget.getScreenCTM(); if (!matrix) return;
        const local = point.matrixTransform(matrix.inverse());
        const col = Math.floor((local.x - left) / (mesh.dx * scale)), row = mesh.ny - 1 - Math.floor((local.y - top) / (mesh.dy * scale));
        if (col >= 0 && col < mesh.nx && row >= 0 && row < mesh.ny) onSelect(row * mesh.nx + col);
      }} onKeyDown={event => {
        if (!onSelect) return;
        const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: mesh.nx, ArrowDown: -mesh.nx, Home: -(selectedId ?? 0), End: mesh.cells.length - 1 - (selectedId ?? 0) };
        if (event.key in offsets) { event.preventDefault(); onSelect(Math.max(0, Math.min(mesh.cells.length - 1, (selectedId ?? 0) + offsets[event.key]))); }
      }}>
      <defs>
        <mask id={`${uid}-outside`} maskUnits="userSpaceOnUse" x="0" y="0" width={w} height={h}><rect width={w} height={h} fill="white" /><polygon points={outline} fill="black" /></mask>
        <mask id={`${uid}-missing`} maskUnits="userSpaceOnUse" x="0" y="0" width={w} height={h}><rect width={w} height={h} fill="white" /><path d={paths.accepted} fill="black" stroke="none" /></mask>
      </defs>
      <text className="polygon-svg-caption" x="24" y="28">{difference ? "CONTORNO × MALHA" : "TESTE PELO CENTRO"}</text>
      <text className="polygon-svg-caption" x={w - 24} y="28" textAnchor="end">{mesh.nx} × {mesh.ny} · mm</text>
      <g className="polygon-inline-legend">
        <rect x="24" y="42" width="6" height="6" fill={difference ? "#ffc76b" : appearance.color} /><text x="36" y="48">{difference ? "área em falta" : "célula aceita"}</text>
        <rect x="164" y="42" width="6" height="6" fill={difference ? "#fb7185" : "#e796a7"} /><text x="176" y="48">{difference ? "área em excesso" : "descartada"}</text>
        <line x1="315" x2="331" y1="45" y2="45" stroke="#ffd074" strokeWidth="2" /><text x="338" y="48">contorno exato</text>
      </g>
      <rect className="polygon-envelope" x={left} y={top} width={b.width * scale} height={b.height * scale} />
      <polygon points={outline} className="polygon-base-fill" />
      <g className={appearance.grid ? "polygon-cells has-grid" : "polygon-cells"}>
        {progress < mesh.cells.length && <path className="polygon-cell-pending" d={paths.pending} />}
        {appearance.rejected && <path className="polygon-cell-rejected" d={paths.rejected} />}
        <path className="polygon-cell-accepted" d={paths.accepted} />
      </g>
      {difference && <g className="polygon-difference"><polygon points={outline} fill="#ffc76b" fillOpacity=".7" mask={`url(#${uid}-missing)`} /><path d={paths.accepted} fill="#fb7185" fillOpacity=".8" mask={`url(#${uid}-outside)`} /></g>}
      {appearance.centers && <g className="polygon-center-dots" strokeWidth={Math.min(4, Math.max(1.3, Math.min(mesh.dx, mesh.dy) * scale / 7))}>
        <path className="is-accepted" d={paths.acceptedCenters} />{appearance.rejected && <path className="is-rejected" d={paths.rejectedCenters} />}
      </g>}
      <polygon points={outline} className="polygon-exact-outline" />
      {appearance.vertices && polygon.vertices.map((p, i) => <g key={i}><circle cx={mx(p.x)} cy={my(p.y)} r="3" className="polygon-vertex" /><text className="polygon-vertex-label" x={mx(p.x) + 9} y={my(p.y) - 10}>V{i + 1}</text></g>)}
      {Array.from({ length: 5 }, (_, i) => <g key={i} className="polygon-axis-tick">
        <text x={mx(b.minX + i * b.width / 4)} y={top + b.height * scale + 24} textAnchor="middle">{fmt(b.minX + i * b.width / 4, 1)}</text>
        <text x={left - 13} y={my(b.minY + i * b.height / 4) + 4} textAnchor="end">{fmt(b.minY + i * b.height / 4, 1)}</text>
      </g>)}
      <text className="polygon-axis-name" x={left + b.width * scale + 26} y={top + b.height * scale + 24}>x</text><text className="polygon-axis-name" x={left - 14} y={top - 18}>y</text>
      {appearance.centroids && <g className="polygon-centroid-markers" pointerEvents="none">
        {center && <line className="polygon-centroid-vector" x1={mx(polygon.centroid.x)} y1={my(polygon.centroid.y)} x2={mx(center.x)} y2={my(center.y)} />}
        <g className="polygon-exact-centroid"><line x1={mx(polygon.centroid.x) - 10} x2={mx(polygon.centroid.x) + 10} y1={my(polygon.centroid.y)} y2={my(polygon.centroid.y)} /><line x1={mx(polygon.centroid.x)} x2={mx(polygon.centroid.x)} y1={my(polygon.centroid.y) - 10} y2={my(polygon.centroid.y) + 10} /><circle cx={mx(polygon.centroid.x)} cy={my(polygon.centroid.y)} r="5" /><text x={mx(polygon.centroid.x) + 13} y={my(polygon.centroid.y) - 13}>C</text></g>
        {center && <g className="polygon-mesh-centroid"><circle cx={mx(center.x)} cy={my(center.y)} r="11" /><text x={mx(center.x) + 14} y={my(center.y) + 23}>Cm</text></g>}
      </g>}
      {selected && <g pointerEvents="none"><rect className="polygon-selected-cell" x={mx(selected.x0)} y={my(selected.y0 + selected.height)} width={selected.width * scale} height={selected.height * scale} /><circle className="polygon-selected-center" cx={mx(selected.x)} cy={my(selected.y)} r="5" /></g>}
      <text className="polygon-svg-footnote" x="24" y={h - 16}>C: centroide do contorno · Cm: centroide da malha completa</text>
    </svg>
  </div>;
}

function MeshSimulation({ mesh, appearance }: { mesh: PolygonMesh; appearance: Appearance }) {
  const [progress, setProgress] = useState(mesh.cells.length);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(30);
  const [selectedId, setSelectedId] = useState(0);
  const start = useRef({ time: 0, progress: 0 });
  useEffect(() => {
    if (!playing) return;
    start.current = { time: performance.now(), progress };
    let frame = 0;
    const tick = (time: number) => {
      const next = Math.min(mesh.cells.length, start.current.progress + Math.floor((time - start.current.time) / 1000 * speed));
      setProgress(next);
      if (next > 0) setSelectedId(next - 1);
      if (next < mesh.cells.length) frame = requestAnimationFrame(tick); else setPlaying(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // A contagem inicial é capturada ao iniciar/retomar, sem reiniciar o relógio a cada célula.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, mesh.cells.length]);
  const cell = mesh.cells[selectedId], tested = cell.id < progress;
  const acceptedSoFar = useMemo(() => mesh.cells.slice(0, progress).filter(item => item.inside).length, [mesh, progress]);
  return <>
    <section className="polygon-stage">
      <header className="polygon-stage-heading"><span className="polygon-panel-index">A</span><div><h2>Um centro decide por toda a célula</h2><p>Clique na grade e inspecione a decisão. Reproduza o teste para acompanhar a varredura.</p></div></header>
      <MeshDiagram mesh={mesh} appearance={appearance} progress={progress} selectedId={selectedId} onSelect={setSelectedId} />
      <div className="polygon-legend"><span><i className="is-accepted" />célula aceita</span><span><i className="is-rejected" />célula descartada</span><span><i className="is-exact" />contorno exato</span><span><i className="is-centroid" />centroide da malha</span></div>
      <div className="polygon-player">
        <div className="polygon-player-buttons"><button type="button" className="polygon-play-button" onClick={() => {
          if (!playing && progress === mesh.cells.length) { setProgress(0); setSelectedId(0); }
          setPlaying(value => !value);
        }}>{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? "Pausar" : progress === mesh.cells.length ? "Reproduzir teste" : "Continuar"}</button>
          <button type="button" aria-label="Testar próxima célula" title="Testar próxima célula" disabled={progress === mesh.cells.length} onClick={() => { setPlaying(false); setSelectedId(progress); setProgress(value => value + 1); }}><SkipForward size={16} /></button>
          <button type="button" aria-label="Reiniciar varredura" title="Reiniciar varredura" onClick={() => { setPlaying(false); setProgress(0); setSelectedId(0); }}><RotateCcw size={15} /></button>
          <button type="button" disabled={progress === mesh.cells.length} onClick={() => { setPlaying(false); setProgress(mesh.cells.length); }}>Ver resultado</button>
        </div>
        <label className="polygon-speed">Velocidade<select aria-label="Velocidade da varredura" value={speed} onChange={event => setSpeed(Number(event.target.value))}>{[3, 10, 30, 120, 480].map(value => <option key={value} value={value}>{value} células/s</option>)}</select></label>
        <input className="polygon-progress" type="range" min="0" max={mesh.cells.length} step="1" value={progress} aria-label="Células já testadas" onChange={event => { const next = Number(event.target.value); setPlaying(false); setProgress(next); setSelectedId(Math.max(0, next - 1)); }} />
        <div className="polygon-progress-label"><span>{fmt(progress, 0)} / {fmt(mesh.cells.length, 0)} testadas</span><span>{acceptedSoFar} aceitas · {progress - acceptedSoFar} descartadas</span></div>
      </div>
    </section>
    <section className="polygon-cell-inspector" aria-label="Inspeção da célula selecionada">
      <header><Crosshair size={17} aria-hidden="true" /><h3>Célula {cell.id + 1}</h3><span className={`polygon-decision ${!tested ? "is-pending" : cell.inside ? "is-accepted" : "is-rejected"}`}>{!tested ? "Aguardando teste" : cell.onBoundary ? "Aceita · centro na borda" : cell.inside ? "Aceita · centro interno" : "Descartada · centro externo"}</span></header>
      <dl><div><dt>Coluna · linha</dt><dd>{cell.col + 1} · {cell.row + 1}</dd></div><div><dt>Centro (xi; yi)</dt><dd>{pair(cell)} mm</dd></div><div><dt>Área da célula</dt><dd>{fmt(cell.area)} mm²</dd></div><div><dt>Área que entra na malha</dt><dd>{tested ? fmt(cell.inside ? cell.area : 0) : "—"} mm²</dd></div></dl>
      <p>Se o centro passa, entra <strong>a célula inteira</strong>, inclusive sua parcela fora do contorno. Se não passa, toda a célula é descartada. Use as setas no gráfico para mudar a seleção.</p>
    </section>
  </>;
}

function ErrorSummary({ mesh }: { mesh: PolygonMesh }) {
  const { metrics: m, polygon: p } = mesh;
  return <section className="polygon-error-summary" aria-label="Erros geométricos da malha completa">
    <header><span className="polygon-kicker">Comparação geométrica · malha completa</span><h2>O quanto a discretização representa o contorno?</h2></header>
    <div className="polygon-metric-grid">
      <article className="polygon-area-card"><span className="polygon-metric-label">Erro de área · |Am − Ac| / Ac</span><strong>{fmt(m.areaErrorPercent, 4)}<small>%</small></strong><p>ΔA = {signed(m.deltaArea)} mm² · {m.deltaArea > 1e-7 ? "excesso" : m.deltaArea < -1e-7 ? "falta" : "áreas coincidentes"}</p></article>
      <article className="polygon-centroid-card"><span className="polygon-metric-label">Distância entre centroides · ‖Cm − C‖</span><strong>{fmt(m.centroidDistance, 4)}<small>mm</small></strong><p>Δx = {signed(m.deltaX, 4)} mm · Δy = {signed(m.deltaY, 4)} mm</p></article>
      <article><span className="polygon-metric-label">Erro relativo do centroide · ‖Cm − C‖ / Lref</span><strong>{fmt(m.centroidErrorPercent, 4)}<small>%</small></strong><p>Lref = maior dimensão do envolvente = {fmt(p.referenceLength)} mm</p></article>
    </div>
    <div className="polygon-comparison-table"><table><caption>Valores exatos e aproximados, nas mesmas coordenadas</caption><thead><tr><th scope="col">Propriedade</th><th scope="col">Contorno exato</th><th scope="col">Malha pelo centro</th><th scope="col">Malha − exato</th></tr></thead><tbody>
      <tr><th scope="row">Área (mm²)</th><td>{fmt(p.area)}</td><td>{fmt(m.area)}</td><td>{signed(m.deltaArea)}</td></tr>
      <tr><th scope="row">xC (mm)</th><td>{fmt(p.centroid.x, 4)}</td><td>{fmt(m.centroid?.x ?? null, 4)}</td><td>{signed(m.deltaX, 4)}</td></tr>
      <tr><th scope="row">yC (mm)</th><td>{fmt(p.centroid.y, 4)}</td><td>{fmt(m.centroid?.y ?? null, 4)}</td><td>{signed(m.deltaY, 4)}</td></tr>
    </tbody></table></div>
    {!m.centroid && <p className="polygon-empty-mesh" role="status">Nenhum centro foi aceito. A área da malha é zero e seu centroide é indefinido. Refine a grade para representar esta seção.</p>}
  </section>;
}

function RefinementChart({ samples, mesh, onSelect }: { samples: RefinementSample[]; mesh: PolygonMesh; onSelect: (nx: number, ny: number) => void }) {
  const [metric, setMetric] = useState<"area" | "centroid" | "both">("both");
  const chartSamples = useMemo(() => {
    const current: RefinementSample = { nx: mesh.nx, ny: mesh.ny, count: mesh.cells.length, step: Math.max(mesh.dx, mesh.dy), ...mesh.metrics };
    return [...samples.filter(s => s.nx !== mesh.nx || s.ny !== mesh.ny), current].sort((a, b) => a.count - b.count || a.nx - b.nx);
  }, [samples, mesh]);
  const width = 800, height = 440, pad = { left: 70, right: 35, top: 48, bottom: 72 };
  const shown = chartSamples.flatMap(s => [metric !== "centroid" ? s.areaErrorPercent : 0, metric !== "area" ? s.centroidErrorPercent ?? 0 : 0]);
  const rawMax = Math.max(0.01, ...shown), ymax = Math.ceil(rawMax / 10 ** Math.floor(Math.log10(rawMax))) * 10 ** Math.floor(Math.log10(rawMax));
  const maxCount = Math.max(...chartSamples.map(s => s.count));
  const x = (n: number) => pad.left + Math.log10(n) / Math.log10(maxCount) * (width - pad.left - pad.right);
  const y = (error: number) => height - pad.bottom - error / ymax * (height - pad.top - pad.bottom);
  const path = (key: "areaErrorPercent" | "centroidErrorPercent") => {
    let drawing = false;
    return chartSamples.map(sample => {
      const value = sample[key]; if (value === null) { drawing = false; return ""; }
      const command = drawing ? "L" : "M"; drawing = true; return `${command}${x(sample.count)},${y(value)}`;
    }).join(" ");
  };
  const currentIndex = chartSamples.findIndex(s => s.nx === mesh.nx && s.ny === mesh.ny);
  return <>
    <div className="polygon-chart-mode" aria-label="Erros mostrados no gráfico">{([["both", "Ambos os erros"], ["area", "Área"], ["centroid", "Centroide"]] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={metric === id} onClick={() => setMetric(id)}>{label}</button>)}</div>
    <div className="polygon-refinement-wrap"><svg viewBox={`0 0 ${width} ${height}`} className="polygon-refinement-svg" role="group" tabIndex={0}
      aria-label="Erros relativos por quantidade de células. Escala horizontal logarítmica. Clique em um ponto ou use as setas para adotar outra resolução."
      onKeyDown={event => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault(); const next = chartSamples[Math.max(0, Math.min(chartSamples.length - 1, currentIndex + (event.key === "ArrowRight" ? 1 : -1)))]; onSelect(next.nx, next.ny);
      }}>
      <text className="polygon-chart-axis-title" x={pad.left} y="25">erro relativo (%)</text>
      <g className="polygon-inline-legend">
        {metric !== "centroid" && <><line x1="392" x2="414" y1="21" y2="21" stroke="#ffd074" strokeWidth="2" /><text x="423" y="25">área</text></>}
        {metric !== "area" && <><line x1="516" x2="538" y1="21" y2="21" stroke="#c5a1ff" strokeWidth="2" /><text x="547" y="25">centroide / Lref</text></>}
      </g>
      {Array.from({ length: 5 }, (_, i) => <g key={i} className="polygon-chart-grid"><line x1={pad.left} x2={width - pad.right} y1={y(ymax * i / 4)} y2={y(ymax * i / 4)} /><text x={pad.left - 12} y={y(ymax * i / 4) + 4} textAnchor="end">{fmt(ymax * i / 4, 3)}</text></g>)}
      {[1, 10, 100, 1000, 10000].filter(n => n <= maxCount).map(n => <g key={n} className="polygon-chart-grid"><line x1={x(n)} x2={x(n)} y1={pad.top} y2={height - pad.bottom} /><text x={x(n)} y={height - pad.bottom + 22} textAnchor="middle">{fmt(n, 0)}</text></g>)}
      <line className="polygon-current-guide" x1={x(mesh.cells.length)} x2={x(mesh.cells.length)} y1={pad.top} y2={height - pad.bottom} />
      {metric !== "centroid" && <path d={path("areaErrorPercent")} className="polygon-error-line is-area" />}
      {metric !== "area" && <path d={path("centroidErrorPercent")} className="polygon-error-line is-centroid" />}
      {chartSamples.map(sample => <g key={`${sample.nx}/${sample.ny}`} className={sample.nx === mesh.nx && sample.ny === mesh.ny ? "polygon-sample is-current" : "polygon-sample"} onClick={() => onSelect(sample.nx, sample.ny)}>
        <title>{sample.nx} × {sample.ny} · {sample.count} células · área: {fmt(sample.areaErrorPercent, 4)}% · centroide: {fmt(sample.centroidErrorPercent, 4)}%</title>
        {metric !== "centroid" && <><circle className="polygon-sample-hit" cx={x(sample.count)} cy={y(sample.areaErrorPercent)} r="12" /><circle className="is-area" cx={x(sample.count)} cy={y(sample.areaErrorPercent)} r="4" /></>}
        {metric !== "area" && sample.centroidErrorPercent !== null && <><circle className="polygon-sample-hit" cx={x(sample.count)} cy={y(sample.centroidErrorPercent)} r="12" /><circle className="is-centroid" cx={x(sample.count)} cy={y(sample.centroidErrorPercent)} r="4" /></>}
      </g>)}
      <text className="polygon-chart-axis-title" x={(width + pad.left - pad.right) / 2} y={height - 16} textAnchor="middle">células do envolvente · nx × ny · escala logarítmica</text>
    </svg></div>
    <div className="polygon-legend"><span><i className="is-exact" />erro de área (%)</span><span><i className="is-centroid" />erro de centroide / Lref (%)</span><span><i className="is-current" />malha selecionada</span></div>
    <p className="polygon-chart-note">Clique em um ponto para usar essa malha. O erro pode oscilar com o refinamento: a posição dos centros em relação à borda também muda. A linha guia apenas a leitura entre as amostras.</p>
  </>;
}

function RefinementTable({ samples, mesh, onSelect }: { samples: RefinementSample[]; mesh: PolygonMesh; onSelect: (nx: number, ny: number) => void }) {
  return <section className="polygon-refinement-table"><header><span className="polygon-kicker">Mesma seção · mesma origem</span><h2>Compare as resoluções</h2><p>Δ máximo é o maior lado da célula. As porcentagens usam Ac e Lref exatos.</p></header>
    <div className="polygon-table-scroll"><table><thead><tr><th scope="col">Malha</th><th scope="col">Δ máx.<br />mm</th><th scope="col">eA<br />%</th><th scope="col">eC<br />%</th></tr></thead><tbody>{samples.map(sample => <tr key={`${sample.nx}/${sample.ny}`} className={sample.nx === mesh.nx && sample.ny === mesh.ny ? "is-selected" : ""}>
      <th scope="row"><button type="button" aria-label={`Usar malha ${sample.nx} por ${sample.ny}`} onClick={() => onSelect(sample.nx, sample.ny)}>{sample.nx} × {sample.ny}</button></th><td>{fmt(sample.step, 2)}</td><td>{fmt(sample.areaErrorPercent, 4)}</td><td>{fmt(sample.centroidErrorPercent, 4)}</td>
    </tr>)}</tbody></table></div>
    <p className="polygon-chart-note">“—” indica centroide indefinido: nenhuma célula aceita. Erros geométricos pequenos não garantem integração precisa de uma tensão variável.</p>
  </section>;
}

export default function PolygonMeshLab({ analysis = false }: { analysis?: boolean }) {
  const [config, setConfig] = useState(readConfiguration);
  const [appearance, setAppearance] = useState<Appearance>(initialAppearance);
  const polygon = useMemo(() => polygonProperties(config.vertices), [config.vertices]);
  const mesh = useMemo(() => buildPolygonMesh(polygon, config.nx, config.ny), [polygon, config.nx, config.ny]);
  const samples = useMemo(() => analysis ? polygonRefinementStudy(polygon) : [], [polygon, analysis]);
  useEffect(() => { try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch { /* Configuração segue disponível em memória. */ } }, [config]);
  const meshKey = `${formatPolygonCoordinates(config.vertices)}|${config.nx}|${config.ny}`;
  const selectResolution = (nx: number, ny: number) => setConfig(current => ({ ...current, nx, ny }));
  const style = { "--polygon-cell-color": appearance.color, "--polygon-cell-opacity": appearance.opacity / 100 } as CSSProperties;
  return <div className={`lab-shell polygon-lab${analysis ? " is-analysis" : ""}`} style={style}>
    <nav className="polygon-module-links" aria-label="Etapas do estudo geométrico"><a href="#geracao-malha-poligonal" aria-current={analysis ? undefined : "page"}><Grid3X3 size={15} />13 · Geração da malha</a><a href="#erros-refinamento-malha" aria-current={analysis ? "page" : undefined}><ChartLine size={15} />14 · Erros e refinamento</a><span>Centros sobre a borda também são aceitos</span></nav>
    <div className="polygon-equation-strip"><code>Ac = ½ |Σ ck|</code><span>→</span><code>centro ∈ polígono ⇒ Ai = Δx · Δy</code><span>→</span><code>Cm = Σ Ai · (xi, yi) / Σ Ai</code></div>
    <div className="polygon-main-grid"><div className="polygon-visual-column">
      {analysis ? <section className="polygon-stage polygon-study-stage"><header className="polygon-stage-heading"><span className="polygon-panel-index">B</span><div><h2>Refinar e medir, na mesma referência</h2><p>Área e centroide exatos permanecem fixos. Apenas a grade muda.</p></div></header><RefinementChart samples={samples} mesh={mesh} onSelect={selectResolution} /></section>
        : <MeshSimulation key={meshKey} mesh={mesh} appearance={appearance} />}
      <ErrorSummary mesh={mesh} />
    </div><GeometryControls config={config} onChange={setConfig} mesh={mesh} appearance={appearance} onAppearance={setAppearance} /></div>
    {analysis ? <div className="polygon-detail-grid"><section className="polygon-stage polygon-border-panel"><header className="polygon-stage-heading"><span className="polygon-panel-index">C</span><div><h2>A borda explica a diferença</h2><p>Cruz dourada: C = {pair(polygon.centroid)} mm · círculo violeta: Cm = {pair(mesh.metrics.centroid)} mm</p></div></header>
      <MeshDiagram mesh={mesh} appearance={appearance} difference /><div className="polygon-legend"><span><i className="is-missing" />área não coberta</span><span><i className="is-excess" />área em excesso</span><span><i className="is-exact" />C geométrico</span><span><i className="is-centroid" />Cm da malha</span></div>
      <p className="polygon-chart-note">As regiões em falta e em excesso podem se compensar na área total. Seus braços podem deixar um erro no centroide. Os marcadores usam a mesma escala da seção.</p></section>
      <RefinementTable samples={samples} mesh={mesh} onSelect={selectResolution} /></div>
      : <div className="polygon-lesson-row"><section className="polygon-method-note"><span className="polygon-kicker">Da geometria à integração</span><h2>Uma fibra é posição e área</h2><p>O ponto representa toda a célula aceita: (xi, yi, Ai). A área geométrica e o centroide vêm do contorno por somas orientadas; a malha usa a soma das células e a média ponderada dos seus centros.</p><p>A origem continua a mesma. Recentrar a malha no próprio centroide esconderia o deslocamento que queremos medir.</p></section><a className="polygon-next-step" href="#erros-refinamento-malha"><ChartLine size={24} /><h3>O que muda ao refinar?</h3><p>Compare várias resoluções e veja de onde vêm os erros de área e centroide.</p><span>Abrir erros e refinamento <ArrowUpRight size={17} /></span></a></div>}
  </div>;
}

export function PolygonMeshErrorsLab() { return <PolygonMeshLab analysis />; }
