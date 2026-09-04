import { useEffect, useMemo, useRef, useState } from "react";
import { Grid2X2, RotateCcw, X, Pin, MousePointer2 } from "lucide-react";
import { RangeControl } from "../components/RangeControl";
import { LayerToggle } from "../components/LayerToggle";
import { ReferenceAppearanceControls } from "../components/ReferenceAppearanceControls";
import { DEFAULT_PLANE, SECTION, calculateSectionState, type PlaneParameters } from "../core/sectionModel";
import {
  DEFAULT_FORCE_LOADS, forceColor, forceElements, solveEquilibrium, sumForces,
  type EquilibriumSolution, type SectionLoads,
} from "../core/fiberEquilibrium";
import { DEFAULT_FORCE_MESH_INDEX, FORCE_MESH_OPTIONS, FORCE_PRESETS } from "../core/fiberForceCatalog";
import { cachedForceExample } from "../core/fiberForceCache";
import { DEFAULT_REFERENCE_APPEARANCE } from "../core/referenceAppearance";
import { ForceScene, type ForceLayers, type ForceView } from "./ForceScene";
import "./forces.css";

type InputMode = "loads" | "strain";
const fmt = (value: number, digits = 1) => (Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value).toLocaleString("pt-BR", {
  minimumFractionDigits: digits, maximumFractionDigits: digits,
});
const signed = (value: number, digits = 1) => `${value > 0.5 * 10 ** -digits ? "+" : ""}${fmt(value, digits)}`;
const COLOR_GRADIENT = `linear-gradient(90deg, ${[-120, -60, -18, -1.8, 0, 1.8, 18, 60, 120].map(v => `${forceColor(v)} ${(v + 120) / 240 * 100}%`).join(", ")})`;

export default function FiberForceLab() {
  const [mode, setMode] = useState<InputMode>("loads");
  const [loads, setLoads] = useState<SectionLoads>(DEFAULT_FORCE_LOADS);
  const [plane, setPlane] = useState<PlaneParameters>(DEFAULT_PLANE);
  const [meshIndex, setMeshIndex] = useState(DEFAULT_FORCE_MESH_INDEX);
  const mesh = FORCE_MESH_OPTIONS[meshIndex];
  const [gain, setGain] = useState(1);
  const [layers, setLayers] = useState<ForceLayers>({ concrete: true, steel: true, neutralAxis: true, heatmap: false });
  const [appearance, setAppearance] = useState({ ...DEFAULT_REFERENCE_APPEARANCE });
  const [view, setView] = useState<ForceView>("iso");
  const [resetKey, setResetKey] = useState(0);
  const [selection, setSelection] = useState<{ id: string; pinned: boolean } | null>(null);
  const previousPlane = useRef(DEFAULT_PLANE);
  const cached = mode === "loads" ? cachedForceExample(mesh, loads) : undefined;
  const solution = useMemo<EquilibriumSolution>(() => {
    if (mode === "loads") return cached ?? solveEquilibrium(loads, mesh, previousPlane.current);
    const state = calculateSectionState(plane, mesh);
    return { plane, state, converged: true, residual: { nKn: 0, mxKnm: 0, myKnm: 0 }, iterations: 0, residualNorm: 0 };
  }, [cached, loads, mesh, mode, plane]);
  useEffect(() => { if (solution.converged) previousPlane.current = solution.plane; }, [solution]);
  const elements = useMemo(() => forceElements(solution.state), [solution.state]);
  const concrete = useMemo(() => elements.filter(e => e.kind === "concrete"), [elements]);
  const steel = useMemo(() => elements.filter(e => e.kind === "steel"), [elements]);
  const concreteSum = useMemo(() => sumForces(concrete), [concrete]);
  const steelSum = useMemo(() => sumForces(steel), [steel]);
  const selected = elements.find(e => e.id === selection?.id);
  const exceedsStrainReference = Math.max(...solution.state.cornerStrains) > 0.0035 + 1e-9 || solution.state.steelStrainMin < -0.010 - 1e-9;
  const status = mode === "strain" ? "Plano prescrito" : solution.converged ? "Equilíbrio numérico" : "Não equilibrado";

  const changeMode = (next: InputMode) => {
    if (next === mode) return;
    if (next === "strain") setPlane(solution.plane);
    else setLoads({ nKn: solution.state.nKn, mxKnm: solution.state.mxKnm, myKnm: solution.state.myKnm });
    setMode(next);
  };
  const changeMesh = (next: number) => { setMeshIndex(next); setSelection(null); };
  const inspect = (id: string, pin: boolean) => setSelection(current => current?.pinned && !pin ? current : { id, pinned: pin });
  const updateLayer = (key: keyof ForceLayers, value: boolean) => setLayers(current => ({ ...current, [key]: value }));
  const rows: { label: string; data: SectionLoads; className?: string }[] = [
    { label: "Fibras de concreto", data: concreteSum },
    { label: "Barras · contribuição líquida", data: steelSum },
    { label: "Total interno", data: solution.state, className: "force-table-total" },
    ...(mode === "loads" ? [
      { label: "Esforços solicitados", data: loads },
      { label: "Resíduo · interno − solicitado", data: solution.residual, className: solution.converged ? "force-residual-ok" : "force-residual-error" },
    ] : []),
  ];

  return <div className="lab-shell force-lab">
    <div className="force-main">
      <section className="viewport-panel" aria-label="Forças internas na seção fixa">
        <div className="viewport-toolbar force-toolbar">
          <label>Vista <select value={view} onChange={event => setView(event.target.value as ForceView)}>
            <option value="iso">Isométrica</option><option value="top">Planta</option>
            <option value="x">Frontal x</option><option value="y">Frontal y</option>
          </select></label>
          <button className="icon-button" type="button" onClick={() => { setView("iso"); setResetKey(v => v + 1); }}><RotateCcw size={16} aria-hidden="true" />Reenquadrar</button>
        </div>
        <div className="force-scene">
          <ForceScene elements={elements} mesh={mesh} gain={gain} appearance={appearance} layers={layers} plane={solution.plane}
            selectedId={selection?.id ?? null} view={view} resetKey={resetKey} onInspect={inspect} />
          <div className={`force-status ${solution.converged ? "" : "is-error"}`} role="status">{status}<span>Seção fixa</span></div>
          <div className="force-legend">
            <div><strong>Força da seta · kN</strong><span>escala comum</span></div>
            <div className="force-gradient" style={{ background: COLOR_GRADIENT }} aria-hidden="true" />
            <div className="force-color-ticks"><span>−120</span><span>−60</span><span>0</span><span>+60</span><span>+120</span></div>
            <div className="force-directions"><span>↑ tração</span><span>compressão ↓</span></div>
          </div>
          <div className="force-scene-hint"><MousePointer2 size={14} aria-hidden="true" />{view === "top" ? "Planta: valores pela cor" : "Girar · zoom · selecionar"}</div>
        </div>
        <div className="force-inspector">
          <div className="force-inspector-top">
            <label htmlFor="force-element"><Pin size={14} aria-hidden="true" />Elemento</label>
            <select id="force-element" value={selection?.id ?? ""} onChange={event => event.target.value ? inspect(event.target.value, true) : setSelection(null)}>
              <option value="">Selecione na seção ou aqui</option>
              <optgroup label="Barras de aço">{steel.map(e => <option key={e.id} value={e.id}>{e.id} · x={fmt(e.xMm / 10)}; y={fmt(e.yMm / 10)} cm</option>)}</optgroup>
              <optgroup label="Fibras de concreto">{concrete.map(e => <option key={e.id} value={e.id}>{e.id} · x={fmt(e.xMm / 10)}; y={fmt(e.yMm / 10)} cm</option>)}</optgroup>
            </select>
            {selection && <button type="button" aria-label="Liberar seleção" onClick={() => setSelection(null)}><X size={16} aria-hidden="true" /></button>}
          </div>
          <div className="force-element-values" aria-live={selection?.pinned ? "polite" : "off"}>
            <span>Força da seta <b>{selected ? signed(selected.forceKn, 2) : "—"}</b> kN</span>
            <span>σ{selected?.kind === "steel" ? "s" : "c"} <b>{selected ? signed(selected.stressMpa, 2) : "—"}</b> MPa</span>
            <span>Área <b>{selected ? fmt(selected.areaMm2, 1) : "—"}</b> mm²</span>
          </div>
          <div className="force-element-detail">
            {selected ? <>
              <span>ε = {signed(selected.strain * 1000, 3)}‰</span>
              <span>F·y = {signed(selected.forceKn * selected.yMm / 1000, 3)} kN·m</span>
              <span>F·x = {signed(selected.forceKn * selected.xMm / 1000, 3)} kN·m</span>
              {selected.kind === "steel" && <span className="force-steel-correction">Seta = Fs − Fc,deslocado = {signed(selected.steelForceKn, 2)} − {fmt(selected.displacedConcreteKn, 2)} kN</span>}
            </> : <span>Comprimento ∝ força local. As setas não representam deslocamentos.</span>}
          </div>
        </div>
      </section>
      <aside className="force-controls" aria-label="Esforços, deformações e malha">
        <div className="force-input-mode"><span>Regular por</span><div className="segmented-control" role="group" aria-label="Modo de controle">
          <button type="button" className={mode === "loads" ? "is-active" : ""} aria-pressed={mode === "loads"} onClick={() => changeMode("loads")}>Esforços</button>
          <button type="button" className={mode === "strain" ? "is-active" : ""} aria-pressed={mode === "strain"} onClick={() => changeMode("strain")}>Deformações</button>
        </div></div>
        <div className="force-presets" aria-label="Exemplos de carregamento">{FORCE_PRESETS.map(preset => <button type="button" key={preset.id}
          aria-pressed={mode === "loads" && loads.nKn === preset.loads.nKn && loads.mxKnm === preset.loads.mxKnm && loads.myKnm === preset.loads.myKnm}
          onClick={() => { setMode("loads"); setLoads(preset.loads); }}>{preset.label}</button>)}</div>
        <div className="force-data-mode">{cached ? "Exemplo pré-calculado" : "Cálculo no navegador"}<span>12 malhas disponíveis</span></div>
        <div className="force-load-controls">
          {mode === "loads" ? <>
            <RangeControl id="force-n" label="Força normal" symbol="N" value={loads.nKn} min={Math.min(-800, loads.nKn)} max={Math.max(4200, loads.nKn)} step={10} unit="kN" fractionDigits={0} onChange={value => setLoads(current => ({ ...current, nKn: value }))} />
            <RangeControl id="force-mx" label="Momento em x" symbol="Mₓ" value={loads.mxKnm} min={Math.min(-500, loads.mxKnm)} max={Math.max(500, loads.mxKnm)} step={1} unit="kN·m" fractionDigits={1} onChange={value => setLoads(current => ({ ...current, mxKnm: value }))} />
            <RangeControl id="force-my" label="Momento em y" symbol="Mᵧ" value={loads.myKnm} min={Math.min(-250, loads.myKnm)} max={Math.max(250, loads.myKnm)} step={1} unit="kN·m" fractionDigits={1} onChange={value => setLoads(current => ({ ...current, myKnm: value }))} />
          </> : <>
            <RangeControl id="force-eps" label="Deformação central" symbol="ε₀" value={plane.eps0PerMille} min={Math.min(-3, plane.eps0PerMille)} max={Math.max(3.5, plane.eps0PerMille)} step={0.05} unit="‰" onChange={value => setPlane(current => ({ ...current, eps0PerMille: value }))} />
            <RangeControl id="force-gx" label="Gradiente em x" symbol="gₓ" value={plane.gxPerMillePerM} min={Math.min(-15, plane.gxPerMillePerM)} max={Math.max(15, plane.gxPerMillePerM)} step={0.1} unit="‰/m" onChange={value => setPlane(current => ({ ...current, gxPerMillePerM: value }))} />
            <RangeControl id="force-gy" label="Gradiente em y" symbol="gᵧ" value={plane.gyPerMillePerM} min={Math.min(-15, plane.gyPerMillePerM)} max={Math.max(15, plane.gyPerMillePerM)} step={0.1} unit="‰/m" onChange={value => setPlane(current => ({ ...current, gyPerMillePerM: value }))} />
          </>}
        </div>
        {!solution.converged && <div className="force-warning" role="alert">Equilíbrio não encontrado. As setas mostram a melhor tentativa; confira os resíduos abaixo.</div>}
        {exceedsStrainReference && <div className="force-warning">Há deformações além das referências de 3,5‰ no concreto ou −10‰ no aço.</div>}
        <section className="force-mesh-controls" aria-label="Discretização da seção">
          <h2><Grid2X2 size={17} aria-hidden="true" />Malha<span>{mesh.nx * mesh.ny} fibras · 8 barras</span></h2>
          <label className="force-mesh-select" htmlFor="force-mesh">Divisões x × y
            <select id="force-mesh" value={meshIndex} onChange={event => changeMesh(Number(event.target.value))}>
              {FORCE_MESH_OPTIONS.map((option, i) => <option key={i} value={i}>{option.nx} × {option.ny} · {option.nx * option.ny} fibras</option>)}
            </select>
          </label>
          <RangeControl id="force-refinement" label="Refinamento" symbol="▦" value={meshIndex + 1} min={1} max={12} step={1} unit="/ 12" signed={false} fractionDigits={0} minLabel="Grossa" maxLabel="Fina" onChange={value => changeMesh(value - 1)} />
          <p className="force-cell-size">Fibra: {fmt(SECTION.widthMm / mesh.nx, 1)} × {fmt(SECTION.heightMm / mesh.ny, 1)} mm · área {fmt(SECTION.widthMm * SECTION.heightMm / (mesh.nx * mesh.ny), 1)} mm²</p>
        </section>
        <RangeControl id="force-gain" label="Tamanho das setas" symbol="↕" value={gain} min={0.4} max={2.5} step={0.1} unit="×" signed={false} fractionDigits={1} onChange={setGain} />
        <details className="force-display-options"><summary>Visualização e seção fixa</summary>
          <div className="force-layer-controls">
            <LayerToggle label="Setas do concreto" checked={layers.concrete} onChange={value => updateLayer("concrete", value)} />
            <LayerToggle label="Setas das barras" checked={layers.steel} onChange={value => updateLayer("steel", value)} />
            <LayerToggle label="Linha de deformação nula" checked={layers.neutralAxis} onChange={value => updateLayer("neutralAxis", value)} />
            <LayerToggle label="Mapa de forças na malha" checked={layers.heatmap} onChange={value => updateLayer("heatmap", value)} />
          </div>
          <ReferenceAppearanceControls value={appearance} onChange={setAppearance} />
        </details>
      </aside>
    </div>
    <section className="force-balance" aria-label="Soma das forças e verificação do equilíbrio">
      <header><h2>Equilíbrio da seção</h2><span>ΣF = N <i>·</i> Σ(F·y) = Mₓ <i>·</i> Σ(F·x) = Mᵧ</span></header>
      <div className="force-table-wrap"><table>
        <thead><tr><th scope="col">Contribuição</th><th scope="col">N <small>kN</small></th><th scope="col">Mₓ <small>kN·m</small></th><th scope="col">Mᵧ <small>kN·m</small></th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.label} className={row.className}>
          <th scope="row">{row.label}</th>{(["nKn", "mxKnm", "myKnm"] as const).map(key => <td key={key}>{signed(row.data[key], row.className?.includes("residual") ? 3 : 1)}</td>)}
        </tr>)}</tbody>
      </table></div>
      <div className="force-balance-note">Todas as fibras e barras entram na soma, mesmo com setas ocultas.</div>
    </section>
    <details className="force-model-note"><summary>Como ler este modelo</summary>
      <p>Na face superior isolada, compressão positiva aponta para baixo e tração negativa para cima. A seção não se deforma na imagem. Comprimento da seta = |força| × escala, igual para concreto e barras. A escala não se renormaliza ao mudar os esforços ou a malha.</p>
      <p>Fibras: Fc = σc·Ac. Como o seu algoritmo integra o concreto na área bruta, a seta de cada barra é a contribuição líquida ΔFs = (σs − σc)·As. O seletor mostra a força real do aço e a correção separadamente. O concreto tracionado não recebe força.</p>
      <p>Em Esforços, o cálculo busca um plano compatível com N, Mx e My; em Deformações, você prescreve ε₀, gₓ e gᵧ e observa as resultantes. As leis dos materiais são não lineares: proporcionalidade da seta à força local não significa proporcionalidade de cada força a N ou M.</p>
      <p>Malhas mais finas diminuem a área e a força por fibra. Em Esforços, o equilíbrio é buscado novamente; em Deformações, a soma pode variar com a quadratura. Equilíbrio numérico não é verificação de ELU ou de estabilidade. Uma falha de convergência, isoladamente, não prova insuficiência da seção.</p>
      <p>Os cinco exemplos foram pré-calculados em todas as 12 malhas (60 estados completos). Outros carregamentos são resolvidos no navegador, sem interpolação entre exemplos e sem Python.</p>
    </details>
  </div>;
}
