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
  const nSlice = useMemo(() => sliceMesh(interactionVertices, interactionTriangles, "n", cuts.n), [cuts.n]);
  const mySlice = useMemo(() => sliceMesh(interactionVertices, interactionTriangles, "my", cuts.my), [cuts.my]);
  const mxSlice = useMemo(() => sliceMesh(interactionVertices, interactionTriangles, "mx", cuts.mx), [cuts.mx]);
  const slices = useMemo(() => ({ n: nSlice, my: mySlice, mx: mxSlice }), [nSlice, mySlice, mxSlice]);

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
            view={view} resetKey={resetKey} selected={selection?.point ?? null} onCut={updateCut} onInspect={inspect} />
          <div className="cut-tabs" role="group" aria-label="Corte ativo para arrastar no 3D">
            {axes.map(axis => <button key={axis} type="button" aria-pressed={activeCut === axis}
              style={{ "--cut-color": CUT_COLORS[axis] } as CSSProperties} onClick={() => setActiveCut(axis)}>
              <span className="cut-swatch" aria-hidden="true" />{CUT_LABELS[axis]} fixo
            </button>)}
          </div>
          <div className="interaction-color-key" aria-label="A cor da superfície representa a força normal N">
            <span>N · kN</span><div aria-hidden="true" /><span>0</span><span>{formatInteraction(interactionData.nCapacityKn, 0)}</span>
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
          <RangeControl id="surface-opacity" label="Opacidade da superfície" symbol="α"
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
        active={activeCut === axis} autoScale={autoScale} selected={selection?.point ?? null}
        onActivate={() => setActiveCut(axis)} onInspect={inspect} />)}
    </div>
    <div className="interaction-caption">
      <span>Mesma cor = mesmo corte. Guias tracejadas = outros planos.</span>
      <span>N ≥ 0 · compressão positiva · uso didático</span>
      <details><summary>Modelo e precisão</summary>
        <p>Dados pré-gerados pelo FlexoPy: 54 níveis de N, 120 orientações, 48 × 72 fibras. Os cortes e as leituras são interpolados na mesma malha triangular do 3D. Não há extrapolação para N &lt; 0.</p>
        <p>A base tracejada em N = 0 fecha os diagramas no limite do escopo; não representa ruptura à tração. O topo corresponde à compressão uniforme. Os eixos de momento usam a mesma escala no 3D; N tem escala própria.</p>
        <p>O ponto branco identifica a leitura. Clique ou toque para fixar; × libera a leitura. Os controles numéricos e as setas do teclado nos 2D também permitem explorar os resultados.</p>
      </details>
    </div>
  </div>;
}
