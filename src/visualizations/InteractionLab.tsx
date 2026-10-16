import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Move3D, RotateCcw, Pin, X, MousePointer2 } from "lucide-react";
import { LayerToggle } from "../components/LayerToggle";
import { RangeControl } from "../components/RangeControl";
import { interactionBounds, interactionData, interactionTriangles, interactionVertices } from "../core/interactionData";
import {
  CUT_COLORS, CUT_INDEX, CUT_LABELS, CUT_TITLES, formatInteraction, sliceMesh,
  type CutAxis, type CutValues, type InteractionPoint,
} from "../core/interactionMesh";
import { InteractionScene, type InteractionView, type SurfaceAppearance } from "./InteractionScene";
import { InteractionSliceChart } from "./InteractionSliceChart";
import { InteractionApproximationPanel } from "./InteractionApproximationPanel";
import {
  buildApproximateInteractionSurface, compareRadialCapacities, extractUniaxialResistances,
  type InteractionDisplayMode,
} from "../core/nbrInteractionApproximation";
import "./interaction.css";

const axes: CutAxis[] = ["n", "my", "mx"];
const initialCuts: CutValues = { n: interactionData.nCapacityKn * 0.4, my: 0, mx: 0 };
const initialAppearance: SurfaceAppearance = { opacity: 0.64, wireframe: true, planes: true, clip: false };
type Selection = { point: InteractionPoint; source: string; pinned: boolean };

function CutNumberInput({ axis, value, onChange }: { axis: CutAxis; value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(value.toFixed(1));
  const [focused, setFocused] = useState(false);
  const [min, max] = interactionBounds[CUT_INDEX[axis]];
  useEffect(() => { if (!focused) setDraft(value.toFixed(1)); }, [focused, value]);
  return <input id={`cut-number-${axis}`} type="number" min={min} max={max} step="any" value={draft}
    onFocus={() => setFocused(true)}
    onChange={event => {
      setDraft(event.target.value);
      if (event.target.value !== "" && Number.isFinite(event.target.valueAsNumber)) onChange(event.target.valueAsNumber);
    }}
    onBlur={() => { setFocused(false); setDraft(value.toFixed(1)); }}
    onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} />;
}

export default function InteractionLab() {
  const [cuts, setCuts] = useState(initialCuts);
  const [activeCut, setActiveCut] = useState<CutAxis>("n");
  const [appearance, setAppearance] = useState(initialAppearance);
  const [view, setView] = useState<InteractionView>("iso");
  const [resetKey, setResetKey] = useState(0);
  const [autoScale, setAutoScale] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [displayMode, setDisplayMode] = useState<InteractionDisplayMode>("fibers");
  const [interactionAlpha, setInteractionAlpha] = useState(1.2);
  const [comparisonPhiDeg, setComparisonPhiDeg] = useState(35);
  const nSlice = useMemo(() => sliceMesh(interactionVertices, interactionTriangles, "n", cuts.n), [cuts.n]);
  const mySlice = useMemo(() => sliceMesh(interactionVertices, interactionTriangles, "my", cuts.my), [cuts.my]);
  const mxSlice = useMemo(() => sliceMesh(interactionVertices, interactionTriangles, "mx", cuts.mx), [cuts.mx]);
  const slices = useMemo(() => ({ n: nSlice, my: mySlice, mx: mxSlice }), [nSlice, mySlice, mxSlice]);
  const uniaxialSections = useMemo(() => interactionData.rings.map(ring => {
    const points = ring.map(index => interactionVertices[index]);
    return extractUniaxialResistances(
      points.length === 1 ? { paths: [], isolated: points } : { paths: [[...points, points[0]]], isolated: [] },
      points[0][2],
    );
  }), []);
  const currentSection = useMemo(() => extractUniaxialResistances(nSlice, cuts.n), [nSlice, cuts.n]);
  const approximateSurface = useMemo(() => displayMode === "fibers" ? null : buildApproximateInteractionSurface(
    [currentSection, ...uniaxialSections], interactionAlpha,
  ), [displayMode, currentSection, uniaxialSections, interactionAlpha]);
  const approximateSlices = useMemo(() => approximateSurface ? {
    n: sliceMesh(approximateSurface.vertices, approximateSurface.triangles, "n", cuts.n),
    my: sliceMesh(approximateSurface.vertices, approximateSurface.triangles, "my", cuts.my),
    mx: sliceMesh(approximateSurface.vertices, approximateSurface.triangles, "mx", cuts.mx),
  } : null, [approximateSurface, cuts]);
  const comparison = useMemo(() => displayMode === "fibers" ? null : compareRadialCapacities(
    nSlice, currentSection, interactionAlpha, comparisonPhiDeg,
  ), [displayMode, nSlice, currentSection, interactionAlpha, comparisonPhiDeg]);

  const updateCut = (axis: CutAxis, value: number) => {
    if (!Number.isFinite(value)) return;
    const [min, max] = interactionBounds[CUT_INDEX[axis]];
    const bounded = Math.min(max, Math.max(min, value));
    setCuts(current => current[axis] === bounded ? current : { ...current, [axis]: bounded });
    setActiveCut(axis);
    setSelection(null);
  };
  const inspect = (point: InteractionPoint, source: string, pin: boolean) => {
    setSelection(current => current?.pinned && !pin ? current : { point, source, pinned: pin });
  };
  const updateAppearance = <K extends keyof SurfaceAppearance>(key: K, value: SurfaceAppearance[K]) =>
    setAppearance(current => ({ ...current, [key]: value }));

  return <div className="lab-shell interaction-lab">
    <InteractionApproximationPanel mode={displayMode}
      onMode={mode => { setDisplayMode(mode); setSelection(null); }}
      alpha={interactionAlpha} onAlpha={alpha => { setInteractionAlpha(alpha); setSelection(null); }}
      section={currentSection} phiDeg={comparisonPhiDeg} onPhi={setComparisonPhiDeg} comparison={comparison} />
    <div className="interaction-main">
      <section className="viewport-panel" aria-label="Superfície de interação tridimensional">
        <div className="viewport-toolbar interaction-toolbar">
          <label className="interaction-view-select">
            <span>Vista</span>
            <select value={view} onChange={event => setView(event.target.value as InteractionView)}>
              <option value="iso">Isométrica</option><option value="n">Mₓ × Mᵧ</option>
              <option value="my">Mₓ × N</option><option value="mx">Mᵧ × N</option>
            </select>
          </label>
          <button type="button" className="icon-button" onClick={() => { setView("iso"); setResetKey(key => key + 1); }}>
            <RotateCcw size={16} aria-hidden="true" /><span>Reenquadrar</span>
          </button>
        </div>
        <div className="interaction-scene">
          <InteractionScene cuts={cuts} slices={slices} activeCut={activeCut} appearance={appearance}
            displayMode={displayMode} approximateSurface={approximateSurface} approximateSlices={approximateSlices} comparison={comparison}
            view={view} resetKey={resetKey} selected={selection?.point ?? null} onCut={updateCut} onInspect={inspect} />
          <div className="cut-tabs" role="group" aria-label="Corte ativo para arrastar no 3D">
            {axes.map(axis => <button key={axis} type="button" aria-pressed={activeCut === axis}
              style={{ "--cut-color": CUT_COLORS[axis] } as CSSProperties} onClick={() => setActiveCut(axis)}>
              <span className="cut-swatch" aria-hidden="true" />{CUT_LABELS[axis]} fixo
            </button>)}
          </div>
          <div className="interaction-color-key" aria-label="A cor da superfície representa a força normal N">
            {displayMode !== "approximate" && <><span>Fibras · N em kN</span><div aria-hidden="true" /><span>0</span><span>{formatInteraction(interactionData.nCapacityKn, 0)}</span></>}
            {displayMode !== "fibers" && <span className="nbr-scene-key">Tracejado laranja · aprox. α = {formatInteraction(interactionAlpha, 2)}</span>}
          </div>
          <div className="interaction-hint"><MousePointer2 size={14} aria-hidden="true" />Girar · zoom<span>Arraste a seta para cortar</span></div>
        </div>
        <div className="point-inspector">
          <div className="point-inspector-heading"><span>{selection?.pinned ? <Pin size={14} aria-hidden="true" /> : <MousePointer2 size={14} aria-hidden="true" />}
            {selection ? selection.source : "Passe sobre a superfície ou uma curva"}</span>
            {selection && <button type="button" aria-label="Liberar leitura do ponto" onClick={() => setSelection(null)}><X size={16} aria-hidden="true" /></button>}
          </div>
          <div className="point-values" aria-live={selection?.pinned ? "polite" : "off"}>
            <span>N <b>{selection ? formatInteraction(selection.point[2]) : "—"}</b> <small>kN</small></span>
            <span>Mₓ <b>{selection ? formatInteraction(selection.point[0]) : "—"}</b> <small>kN·m</small></span>
            <span>Mᵧ <b>{selection ? formatInteraction(selection.point[1]) : "—"}</b> <small>kN·m</small></span>
          </div>
        </div>
      </section>
      <aside className="interaction-controls" aria-label="Controles dos cortes e aparência">
        <div className="interaction-controls-heading"><h2><Move3D size={19} aria-hidden="true" />Cortes sincronizados</h2>
          <button type="button" onClick={() => { setCuts(initialCuts); setActiveCut("n"); setSelection(null); }} title="Restaurar os três cortes" aria-label="Restaurar os três cortes"><RotateCcw size={16} aria-hidden="true" /></button>
        </div>
        {axes.map(axis => {
          const [min, max] = interactionBounds[CUT_INDEX[axis]];
          const unit = axis === "n" ? "kN" : "kN·m";
          return <section key={axis} className={`cut-control ${activeCut === axis ? "is-active" : ""}`}
            style={{ "--cut-color": CUT_COLORS[axis] } as CSSProperties}>
            <div className="cut-control-heading">
              <button type="button" onClick={() => setActiveCut(axis)} aria-pressed={activeCut === axis}>
                <span className="cut-swatch" aria-hidden="true" />{axis === "n" ? "Horizontal" : "Vertical"} · {CUT_TITLES[axis]}
              </button>
              <span>{CUT_LABELS[axis]} fixo</span>
            </div>
            <div className="cut-number-row">
              <label htmlFor={`cut-number-${axis}`}>{CUT_LABELS[axis]} =</label>
              <CutNumberInput axis={axis} value={cuts[axis]} onChange={value => updateCut(axis, value)} />
              <span>{unit}</span>
              <button type="button" onClick={() => updateCut(axis, 0)} title={`Zerar ${CUT_LABELS[axis]}`}>0</button>
            </div>
            <input type="range" className="range-input cut-slider" min={min} max={max} step="any" value={cuts[axis]}
              aria-label={`Posição do corte ${CUT_LABELS[axis]} em ${unit}`} aria-valuetext={`${formatInteraction(cuts[axis])} ${unit}`}
              style={{ "--range-progress": `${100 * (cuts[axis] - min) / (max - min)}%` } as CSSProperties}
              onChange={event => updateCut(axis, Number(event.target.value))} />
            <div className="cut-range-labels"><span>{formatInteraction(min, 0)}</span><span>{formatInteraction(max, 0)} {unit}</span></div>
            {axis === "n" && <div className="axial-presets" aria-label="Níveis de compressão">
              {[0.25, 0.5, 0.75, 1].map(fraction => <button key={fraction} type="button" onClick={() => updateCut("n", interactionData.nCapacityKn * fraction)}>{fraction === 1 ? "N máx." : `${fraction * 100}%`}</button>)}
            </div>}
          </section>;
        })}
        <div className="interaction-appearance">
          <RangeControl id="surface-opacity" label="Opacidade das superfícies" symbol="op."
            value={Math.round(appearance.opacity * 100)} min={0} max={100} step={1} unit="%" signed={false} fractionDigits={0}
            onChange={value => updateAppearance("opacity", value / 100)} />
          <div className="interaction-toggles">
            <LayerToggle label="Planos e seta de corte" checked={appearance.planes} onChange={value => updateAppearance("planes", value)} />
            <LayerToggle label="Malha (sem recorte)" checked={appearance.wireframe} onChange={value => updateAppearance("wireframe", value)} />
            <LayerToggle label="Ocultar lado + do corte ativo" checked={appearance.clip} onChange={value => updateAppearance("clip", value)} />
            <LayerToggle label="Ajustar escala dos 2D" checked={autoScale} onChange={setAutoScale} />
          </div>
        </div>
      </aside>
    </div>
    <div className="slice-chart-grid">
      {axes.map(axis => <InteractionSliceChart key={axis} axis={axis} value={cuts[axis]} cuts={cuts} slice={slices[axis]}
        displayMode={displayMode} approximateSlice={approximateSlices?.[axis] ?? null} comparison={axis === "n" ? comparison : null}
        active={activeCut === axis} autoScale={autoScale} selected={selection?.point ?? null}
        onActivate={() => setActiveCut(axis)} onInspect={inspect} />)}
    </div>
    <div className="interaction-caption">
      <span>Mesma cor = mesmo corte por fibras. Laranja tracejado = processo aproximado. Guias finas = outros planos.</span>
      <span>N ≥ 0 · compressão positiva · uso didático</span>
      <details><summary>Modelo e precisão</summary>
        <p>Dados pré-gerados pelo FlexoPy: 54 níveis de N, 120 orientações, 48 × 72 fibras. Os cortes e as leituras são interpolados na mesma malha triangular do 3D. Não há extrapolação para N &lt; 0.</p>
        <p>A base tracejada em N = 0 fecha os diagramas no limite do escopo; não representa ruptura à tração. O topo corresponde à compressão uniforme. Os eixos de momento usam a mesma escala no 3D; N tem escala própria.</p>
        <p>O ponto branco identifica a leitura. Clique ou toque para fixar; × libera a leitura. Os controles numéricos e as setas do teclado nos 2D também permitem explorar os resultados.</p>
        <p>Na comparação, a expressão do item 17.2.5 usa os módulos dos interceptos de flexão normal no mesmo N, respeitando o sinal de cada quadrante. A seção retangular e suas armaduras são simétricas; os eixos x e y são principais da seção bruta. A hipótese α = 1,2 vem do trecho normativo fornecido; α = 1 é a alternativa geral. Não há ajuste automático do expoente nem garantia de coincidência com a curva por fibras.</p>
        <p>O nível N corrente também é inserido na malha aproximada, para que a curva horizontal use exatamente seus interceptos. O 3D e os cortes verticais são lineares por triângulos; o comparador radial avalia a expressão analítica. No topo a fronteira se reduz a um ponto e a razão radial deixa de ser calculada. A base em N = 0 continua sendo apenas o limite do escopo.</p>
      </details>
    </div>
  </div>;
}
