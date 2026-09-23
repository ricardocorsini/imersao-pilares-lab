import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Gauge,
  Pause,
  Play,
  RotateCcw,
  ScanSearch,
  Sigma,
  Sparkles,
  Target,
} from "lucide-react";
import { RangeControl } from "../components/RangeControl";
import {
  ROOT_FORCE_TOLERANCE_KN,
  ROOT_SCENARIOS,
  analyzeNormalForceRoots,
  sectionNormalResistanceKn,
  type RootCandidate,
  type RootCurvePoint,
  type RootIteration,
  type RootRefinementMethod,
  type RootScenarioId,
  type RootSearchAnalysis,
  type RootSolution,
} from "../core/normalForceRootSearch";
import "./root-search.css";

type ChartMode = "normal_force" | "residual";

const INITIAL_THETA = 35;
const INITIAL_NSD = 1_800;
const INITIAL_METHOD: RootRefinementMethod = "bisection";
const ANGLE_PRESETS = [0, 35, 45, 90];
const SCENARIO_IDS: RootScenarioId[] = ["section", "two_roots", "tangent"];

function fmt(value: number, digits = 2) {
  const normalized = Math.abs(value) < 5e-10 ? 0 : value;
  return normalized.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function signed(value: number, digits = 2) {
  return `${value > 5e-10 ? "+" : ""}${fmt(value, digits)}`;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function candidateKindLabel(candidate: RootCandidate) {
  if (candidate.kind === "sample") return "raiz na amostra";
  if (candidate.kind === "tangent") return "tangência";
  return "troca de sinal";
}

function methodLabel(solution?: RootSolution) {
  if (!solution) return "—";
  if (solution.methodUsed === "sample") return "direto da amostra";
  if (solution.methodUsed === "tangent_minimization") return "minimização de |f|";
  if (solution.methodUsed === "bisection") return "bisseção";
  return "Brent–Dekker";
}

function strategyLabel(step?: RootIteration | null) {
  if (!step) return "intervalo inicial";
  if (step.strategy === "bisection") return "passo de bisseção";
  if (step.strategy === "secant") return "interpolação secante";
  if (step.strategy === "inverse_quadratic") return "interpolação quadrática inversa";
  return "seção áurea sobre |f|";
}

function useContainerWidth(minimum = 300) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(760);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setWidth(Math.max(minimum, element.clientWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [minimum]);
  return { ref, width };
}

type SearchChartProps = {
  analysis: RootSearchAnalysis;
  mode: ChartMode;
  activeCandidate?: RootCandidate;
  activeSolution?: RootSolution;
  traceIndex: number;
};

function SearchChart({
  analysis,
  mode,
  activeCandidate,
  activeSolution,
  traceIndex,
}: SearchChartProps) {
  const generatedId = useId().replaceAll(":", "");
  const { ref, width } = useContainerWidth();
  const compact = width < 560;
  const height = compact ? 410 : 470;
  const margin = {
    top: 40,
    right: compact ? 18 : 34,
    bottom: 62,
    left: compact ? 64 : 76,
  };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const valueOf = (point: RootCurvePoint) =>
    mode === "normal_force" ? point.nRdKn : point.residualKn;
  const referenceValue = mode === "normal_force" ? analysis.nSdKn : 0;
  const rawValues = [
    ...analysis.curve.map(valueOf),
    ...analysis.samples.map(valueOf),
    referenceValue,
  ];
  const rawMinimum = Math.min(...rawValues);
  const rawMaximum = Math.max(...rawValues);
  const rawSpan = Math.max(1, rawMaximum - rawMinimum);
  const yMinimum = rawMinimum - rawSpan * 0.1;
  const yMaximum = rawMaximum + rawSpan * 0.1;
  const xScale = (t: number) => margin.left + t / 3 * plotWidth;
  const yScale = (value: number) =>
    margin.top + (yMaximum - value) / (yMaximum - yMinimum) * plotHeight;
  const path = analysis.curve
    .map((point, index) =>
      `${index === 0 ? "M" : "L"}${xScale(point.t).toFixed(2)},${yScale(valueOf(point)).toFixed(2)}`)
    .join(" ");
  const yTicks = Array.from(
    { length: 5 },
    (_, index) => yMinimum + (yMaximum - yMinimum) * index / 4,
  );
  const xTicks = compact ? [0, 0.75, 1.5, 2.25, 3] : [0, 0.5, 1, 1.5, 2, 2.5, 3];
  const activeStep =
    activeSolution && traceIndex >= 0
      ? activeSolution.trace[Math.min(traceIndex, activeSolution.trace.length - 1)]
      : undefined;
  const activeInterval = activeCandidate
    ? activeStep
      ? { aT: activeStep.nextAT, bT: activeStep.nextBT }
      : { aT: activeCandidate.aT, bT: activeCandidate.bT }
    : null;
  const candidateEndpoint = (sample: RootCurvePoint) =>
    analysis.candidates.some(
      (candidate) =>
        Math.abs(sample.t - candidate.aT) < 1e-10 ||
        Math.abs(sample.t - candidate.bT) < 1e-10,
    );
  const directSample = (sample: RootCurvePoint) =>
    analysis.candidates.some(
      (candidate) =>
        candidate.kind === "sample" && Math.abs(sample.t - candidate.estimateT) < 1e-10,
    );
  const trialValue = activeStep
    ? mode === "normal_force"
      ? analysis.nSdKn + activeStep.trialResidualKn
      : activeStep.trialResidualKn
    : null;
  const rootCountText = analysis.solutions.length === 1
    ? "uma raiz identificada"
    : `${analysis.solutions.length} raízes identificadas`;

  return (
    <div className="root-chart-wrap" ref={ref}>
      <svg
        className="root-search-chart"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${generatedId}-title ${generatedId}-description`}
      >
        <title id={`${generatedId}-title`}>
          {mode === "normal_force" ? "Curva NRd em função de t" : "Função residual f em função de t"}
        </title>
        <desc id={`${generatedId}-description`}>
          Curva contínua de referência, {analysis.samples.length} pontos da varredura e {rootCountText}.
        </desc>
        <defs>
          <clipPath id={`${generatedId}-root-clip`}>
            <rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} />
          </clipPath>
        </defs>

        <g clipPath={`url(#${generatedId}-root-clip)`}>
          {activeInterval && (
            <rect
              className="root-active-interval"
              x={xScale(activeInterval.aT)}
              y={margin.top}
              width={Math.max(1.5, xScale(activeInterval.bT) - xScale(activeInterval.aT))}
              height={plotHeight}
            />
          )}
          {yTicks.map((tick) => (
            <line
              key={`grid-y-${tick}`}
              className="root-chart-grid"
              x1={margin.left}
              x2={margin.left + plotWidth}
              y1={yScale(tick)}
              y2={yScale(tick)}
            />
          ))}
          {xTicks.map((tick) => (
            <line
              key={`grid-x-${tick}`}
              className="root-chart-grid"
              x1={xScale(tick)}
              x2={xScale(tick)}
              y1={margin.top}
              y2={margin.top + plotHeight}
            />
          ))}
          <line
            className="root-reference-line"
            x1={margin.left}
            x2={margin.left + plotWidth}
            y1={yScale(referenceValue)}
            y2={yScale(referenceValue)}
          />
          <path className="root-resistance-curve" d={path} />
          {activeInterval && (
            <>
              <line
                className="root-bracket-edge"
                x1={xScale(activeInterval.aT)}
                x2={xScale(activeInterval.aT)}
                y1={margin.top}
                y2={margin.top + plotHeight}
              />
              <line
                className="root-bracket-edge"
                x1={xScale(activeInterval.bT)}
                x2={xScale(activeInterval.bT)}
                y1={margin.top}
                y2={margin.top + plotHeight}
              />
            </>
          )}
        </g>

        <rect
          className="root-chart-frame"
          x={margin.left}
          y={margin.top}
          width={plotWidth}
          height={plotHeight}
        />

        {yTicks.map((tick) => (
          <text
            key={`label-y-${tick}`}
            className="root-axis-tick"
            x={margin.left - 10}
            y={yScale(tick) + 4}
            textAnchor="end"
          >
            {fmt(tick, Math.abs(tick) < 20 ? 1 : 0)}
          </text>
        ))}
        {xTicks.map((tick) => (
          <text
            key={`label-x-${tick}`}
            className="root-axis-tick"
            x={xScale(tick)}
            y={margin.top + plotHeight + 22}
            textAnchor="middle"
          >
            {fmt(tick, tick % 1 === 0 ? 0 : 2)}
          </text>
        ))}
        <text
          className="root-axis-title"
          x={margin.left + plotWidth / 2}
          y={height - 10}
          textAnchor="middle"
        >
          parâmetro do caminho de estados-limites · t
        </text>
        <text
          className="root-axis-title"
          x="15"
          y={margin.top + plotHeight / 2}
          textAnchor="middle"
          transform={`rotate(-90 15 ${margin.top + plotHeight / 2})`}
        >
          {mode === "normal_force" ? "NRd(t,θ) [kN]" : "f(t) = NRd − NSd [kN]"}
        </text>
        <text
          className="root-reference-label"
          x={margin.left + plotWidth - 7}
          y={yScale(referenceValue) - 8}
          textAnchor="end"
        >
          {mode === "normal_force" ? `NSd = ${fmt(analysis.nSdKn, 1)} kN` : "f(t) = 0"}
        </text>

        {analysis.samples.map((sample, index) => (
          <circle
            key={`sample-${index}`}
            className={`root-scan-point ${candidateEndpoint(sample) ? "is-candidate" : ""} ${directSample(sample) ? "is-direct" : ""}`}
            cx={xScale(sample.t)}
            cy={yScale(valueOf(sample))}
            r={directSample(sample) ? 6.2 : candidateEndpoint(sample) ? 5.1 : 3.6}
          >
            <title>
              amostra {index + 1}: t={fmt(sample.t, 4)}; NRd={fmt(sample.nRdKn, 2)} kN; f={signed(sample.residualKn, 3)} kN
            </title>
          </circle>
        ))}

        {analysis.solutions.map((solution, index) => {
          const rootValue = mode === "normal_force" ? solution.nRdKn : solution.residualKn;
          const labelOnLeft = solution.rootT > 2.25;
          return (
            <g key={solution.candidateId} className="root-solution-marker">
              <circle cx={xScale(solution.rootT)} cy={yScale(rootValue)} r="7.2" />
              <path
                d={`M${xScale(solution.rootT) - 4},${yScale(rootValue)} L${xScale(solution.rootT) + 4},${yScale(rootValue)} M${xScale(solution.rootT)},${yScale(rootValue) - 4} L${xScale(solution.rootT)},${yScale(rootValue) + 4}`}
              />
              <text
                x={xScale(solution.rootT) + (labelOnLeft ? -10 : 10)}
                y={yScale(rootValue) - 12}
                textAnchor={labelOnLeft ? "end" : "start"}
              >
                R{index + 1} · t={fmt(solution.rootT, 4)}
              </text>
            </g>
          );
        })}

        {activeStep && trialValue !== null && (
          <g className="root-trial-marker">
            <line
              x1={xScale(activeStep.trialT)}
              x2={xScale(activeStep.trialT)}
              y1={margin.top}
              y2={margin.top + plotHeight}
            />
            <path
              d={`M${xScale(activeStep.trialT)},${yScale(trialValue) - 7} L${xScale(activeStep.trialT) + 7},${yScale(trialValue)} L${xScale(activeStep.trialT)},${yScale(trialValue) + 7} L${xScale(activeStep.trialT) - 7},${yScale(trialValue)} Z`}
            />
            <text x={xScale(activeStep.trialT) + 9} y={yScale(trialValue) + 18}>
              tentativa · {fmt(activeStep.trialT, 5)}
            </text>
          </g>
        )}

        {analysis.scenario.isArtificial && (
          <text className="root-artificial-watermark" x={margin.left + 12} y={margin.top + 22}>
            CURVA ARTIFICIAL · DEMONSTRAÇÃO DO MÉTODO
          </text>
        )}
      </svg>
    </div>
  );
}

type ProcessPanelProps = {
  analysis: RootSearchAnalysis;
  candidate?: RootCandidate;
  solution?: RootSolution;
  step?: RootIteration;
  traceIndex: number;
};

function ProcessPanel({
  analysis,
  candidate,
  solution,
  step,
  traceIndex,
}: ProcessPanelProps) {
  const candidateStatement = !candidate
    ? "Nenhum candidato foi localizado no intervalo t ∈ [0,3]."
    : candidate.kind === "sample"
      ? `A amostra em t=${fmt(candidate.estimateT, 4)} já atende |f(t)|≤${fmt(ROOT_FORCE_TOLERANCE_KN, 2)} kN.`
      : candidate.kind === "tangent"
        ? `|f| tem mínimo local em torno de t=${fmt(candidate.estimateT, 4)}, sem inversão de sinal.`
        : `f(a) e f(b) têm sinais opostos em [${fmt(candidate.aT, 4)}; ${fmt(candidate.bT, 4)}].`;
  const intervalProduct = candidate
    ? candidate.faKn * candidate.fbKn
    : Number.NaN;
  const currentIteration = solution?.trace.length
    ? clamp(traceIndex + 1, 0, solution.trace.length)
    : 0;

  return (
    <section className="root-process" aria-label="Etapas da busca de raízes">
      <article className="is-scan">
        <header><span>1</span><strong>Varredura</strong></header>
        <b>{analysis.scanEvaluations} pontos uniformes</b>
        <p>Apenas os círculos contam como avaliações da busca. A linha contínua é referência visual.</p>
      </article>
      <article className="is-candidate">
        <header><span>2</span><strong>Candidato</strong></header>
        <b>{candidate ? candidateKindLabel(candidate) : "não encontrado"}</b>
        <p>{candidateStatement}</p>
        {candidate && candidate.kind !== "sample" && (
          <code>
            f(a)·f(b) = {signed(intervalProduct, 1)} kN² {intervalProduct < 0 ? "< 0" : "> 0"}
          </code>
        )}
      </article>
      <article className="is-refine">
        <header><span>3</span><strong>Refinamento</strong></header>
        <b>{methodLabel(solution)}</b>
        <p>
          {solution?.methodUsed === "sample"
            ? "Nenhuma iteração adicional é necessária."
            : step
              ? `${strategyLabel(step)}: Δt ${fmt(step.intervalBefore, 6)} → ${fmt(step.intervalAfter, 6)}.`
              : candidate
                ? "O intervalo inicial está pronto para ser refinado."
                : "Sem candidato, não há intervalo para refinar."}
        </p>
        {solution && solution.trace.length > 0 && (
          <code>iteração {currentIteration}/{solution.trace.length}</code>
        )}
      </article>
      <article className="is-check">
        <header><span>4</span><strong>Verificação</strong></header>
        <b>
          {solution
            ? `|f(t*)| = ${fmt(Math.abs(solution.residualKn), 5)} kN`
            : "sem resultado"}
        </b>
        <p>
          {solution
            ? `${analysis.scanEvaluations} da varredura + ${analysis.tangentProbeEvaluations} sondas + ${solution.refinementEvaluations} no refinamento.`
            : `Critério adotado: |f| ≤ ${fmt(ROOT_FORCE_TOLERANCE_KN, 2)} kN.`}
        </p>
        {solution && (
          <code>{solution.converged ? "convergência confirmada" : "tolerância não atingida"}</code>
        )}
      </article>
    </section>
  );
}

function RootResults({
  analysis,
  activeRootIndex,
  onSelect,
}: {
  analysis: RootSearchAnalysis;
  activeRootIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <section className="root-results-panel">
      <header>
        <div>
          <Target size={19} aria-hidden="true" />
          <div>
            <h2>Raízes reconhecidas pelo algoritmo</h2>
            <p>Cada troca de sinal gera um bracket independente; uma amostra dentro da tolerância encerra a busca imediatamente.</p>
          </div>
        </div>
        <strong>{analysis.solutions.length} {analysis.solutions.length === 1 ? "raiz" : "raízes"}</strong>
      </header>
      {analysis.solutions.length > 0 ? (
        <div className="root-results-table-wrap">
          <table className="root-results-table">
            <thead>
              <tr>
                <th>Raiz</th>
                <th>Origem</th>
                <th>Intervalo candidato</th>
                <th>t*</th>
                <th>NRd(t*)</th>
                <th>Resíduo final</th>
                <th>Avaliações</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {analysis.solutions.map((solution, index) => {
                const candidate = analysis.candidates[index];
                return (
                  <tr
                    key={solution.candidateId}
                    className={index === activeRootIndex ? "is-active" : ""}
                    onClick={() => onSelect(index)}
                  >
                    <td><button type="button" onClick={() => onSelect(index)}>R{index + 1}</button></td>
                    <td>{candidateKindLabel(candidate)}</td>
                    <td>
                      {candidate.kind === "sample"
                        ? `t = ${fmt(candidate.estimateT, 4)}`
                        : `[${fmt(candidate.aT, 4)}; ${fmt(candidate.bT, 4)}]`}
                    </td>
                    <td>{fmt(solution.rootT, 6)}</td>
                    <td>{fmt(solution.nRdKn, 3)} kN</td>
                    <td>{signed(solution.residualKn, 5)} kN</td>
                    <td>{solution.totalAlgorithmEvaluations}</td>
                    <td><span className={solution.converged ? "is-ok" : "is-warning"}>{solution.converged ? "convergiu" : "verificar"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="root-empty-result" role="status">
          <AlertTriangle size={18} aria-hidden="true" />
          A varredura atual não encontrou amostra exata, troca de sinal nem candidato tangente.
        </div>
      )}
    </section>
  );
}

export default function RootSearchLab() {
  const [scenarioId, setScenarioId] = useState<RootScenarioId>("section");
  const [thetaDeg, setThetaDeg] = useState(INITIAL_THETA);
  const [nSdKn, setNSdKn] = useState(INITIAL_NSD);
  const [method, setMethod] = useState<RootRefinementMethod>(INITIAL_METHOD);
  const [chartMode, setChartMode] = useState<ChartMode>("normal_force");
  const [activeRootIndex, setActiveRootIndex] = useState(0);
  const [traceIndex, setTraceIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const analysis = useMemo(
    () => analyzeNormalForceRoots({ scenarioId, thetaDeg, nSdKn, method }),
    [scenarioId, thetaDeg, nSdKn, method],
  );
  const safeRootIndex = Math.min(activeRootIndex, Math.max(0, analysis.solutions.length - 1));
  const activeCandidate = analysis.candidates[safeRootIndex];
  const activeSolution = analysis.solutions[safeRootIndex];
  const activeStep =
    activeSolution && traceIndex >= 0
      ? activeSolution.trace[Math.min(traceIndex, activeSolution.trace.length - 1)]
      : undefined;
  const maximumTraceIndex = activeSolution ? activeSolution.trace.length - 1 : -1;

  useEffect(() => {
    setPlaying(false);
    setTraceIndex(-1);
    setActiveRootIndex(0);
  }, [scenarioId, thetaDeg, nSdKn, method]);

  useEffect(() => {
    if (!playing || maximumTraceIndex < 0) return;
    const timer = window.setInterval(() => {
      setTraceIndex((current) => Math.min(maximumTraceIndex, current + 1));
    }, 720);
    return () => window.clearInterval(timer);
  }, [playing, maximumTraceIndex]);

  useEffect(() => {
    if (playing && traceIndex >= maximumTraceIndex) setPlaying(false);
  }, [playing, traceIndex, maximumTraceIndex]);

  const selectRoot = (index: number) => {
    setPlaying(false);
    setActiveRootIndex(index);
    setTraceIndex(-1);
  };

  const togglePlaying = () => {
    if (!activeSolution || activeSolution.trace.length === 0) return;
    if (!playing && traceIndex >= maximumTraceIndex) setTraceIndex(-1);
    setPlaying((current) => !current);
  };

  const setDirectSampleExample = () => {
    setNSdKn(Math.round(sectionNormalResistanceKn(1.5, thetaDeg) * 100) / 100);
  };

  const reset = () => {
    setScenarioId("section");
    setThetaDeg(INITIAL_THETA);
    setNSdKn(INITIAL_NSD);
    setMethod(INITIAL_METHOD);
    setChartMode("normal_force");
    setActiveRootIndex(0);
    setTraceIndex(-1);
    setPlaying(false);
  };

  const rootsSummary = analysis.solutions.length === 0
    ? "nenhuma raiz detectada"
    : analysis.solutions.length === 1
      ? "1 raiz detectada"
      : `${analysis.solutions.length} raízes detectadas`;
  const bracketForBrent = activeCandidate?.kind === "sign_change"
    ? `[${fmt(activeCandidate.aT, 4)}; ${fmt(activeCandidate.bT, 4)}]`
    : "não disponível";

  return (
    <div className="lab-shell root-search-lab">
      <div className={`root-search-status ${analysis.scenario.isArtificial ? "is-artificial" : "is-physical"}`}>
        <div className="root-mode-badge">
          {analysis.scenario.isArtificial ? <Sparkles size={18} aria-hidden="true" /> : <Sigma size={18} aria-hidden="true" />}
          <div>
            <span>{analysis.scenario.isArtificial ? "demonstração numérica" : "modelo da seção"}</span>
            <strong>{analysis.scenario.shortLabel}</strong>
          </div>
        </div>
        <div className="root-status-copy">
          <h2>{analysis.scenario.title}</h2>
          <p>{analysis.scenario.description}</p>
        </div>
        <div className="root-status-count" aria-live="polite">
          <span>resultado da varredura</span>
          <strong>{rootsSummary}</strong>
        </div>
      </div>

      <div className="root-search-main">
        <section className="root-chart-panel" aria-label="Curva de força normal e raízes">
          <header>
            <div className="root-panel-heading">
              <span>1</span>
              <div>
                <h2>Equilíbrio ao longo do caminho t</h2>
                <p>As interseções com NSd são os estados em que a força normal se equilibra.</p>
              </div>
            </div>
            <div className="root-chart-mode" role="group" aria-label="Forma de exibir a equação de equilíbrio">
              <button
                type="button"
                className={chartMode === "normal_force" ? "is-active" : ""}
                aria-pressed={chartMode === "normal_force"}
                onClick={() => setChartMode("normal_force")}
              >
                NRd(t) × NSd
              </button>
              <button
                type="button"
                className={chartMode === "residual" ? "is-active" : ""}
                aria-pressed={chartMode === "residual"}
                onClick={() => setChartMode("residual")}
              >
                f(t) = NRd − NSd
              </button>
            </div>
          </header>

          <SearchChart
            analysis={analysis}
            mode={chartMode}
            activeCandidate={activeCandidate}
            activeSolution={activeSolution}
            traceIndex={traceIndex}
          />
          <div className="root-chart-legend" aria-label="Legenda do gráfico">
            <span><i className="is-curve" />NRd(t,θ)</span>
            <span><i className="is-sample" />ponto da varredura</span>
            <span><i className="is-reference" />{chartMode === "normal_force" ? "NSd" : "f=0"}</span>
            <span><i className="is-root" />raiz refinada</span>
            <span><i className="is-interval" />intervalo ativo</span>
          </div>
        </section>

        <aside className="root-search-controls" aria-label="Controles da busca de raízes">
          <div className="root-controls-heading">
            <Gauge size={19} aria-hidden="true" />
            <div><h2>Experimento numérico</h2><span>altere o caso e acompanhe cada decisão</span></div>
          </div>

          <fieldset className="root-scenario-picker">
            <legend>Cenário</legend>
            {SCENARIO_IDS.map((id) => {
              const scenario = ROOT_SCENARIOS[id];
              return (
                <button
                  key={id}
                  type="button"
                  className={`${scenarioId === id ? "is-active" : ""} ${scenario.isArtificial ? "is-artificial" : ""}`}
                  aria-pressed={scenarioId === id}
                  onClick={() => setScenarioId(id)}
                >
                  <strong>{scenario.shortLabel}</strong>
                  <span>{id === "section" ? "integração real" : id === "two_roots" ? "2 brackets" : "sem troca de sinal"}</span>
                </button>
              );
            })}
          </fieldset>

          {analysis.scenario.isArtificial ? (
            <div className="root-artificial-note" role="note">
              <AlertTriangle size={17} aria-hidden="true" />
              <p><b>Exemplo artificial.</b> Ele explica o método numérico e não representa um estado corrente da seção 30 × 60 cm.</p>
            </div>
          ) : (
            <>
              <div className="root-angle-presets" aria-label="Direções usuais da normal à linha neutra">
                {ANGLE_PRESETS.map((angle) => (
                  <button
                    key={angle}
                    type="button"
                    className={thetaDeg === angle ? "is-active" : ""}
                    aria-pressed={thetaDeg === angle}
                    onClick={() => setThetaDeg(angle)}
                  >
                    θ={angle}°
                  </button>
                ))}
              </div>
              <div className="root-range-control">
                <RangeControl
                  id="root-theta"
                  label="normal à linha neutra"
                  symbol="θ"
                  value={thetaDeg}
                  min={0}
                  max={179}
                  step={1}
                  unit="°"
                  signed={false}
                  fractionDigits={0}
                  minLabel="0°"
                  maxLabel="179°"
                  onChange={setThetaDeg}
                />
              </div>
              <div className="root-range-control">
                <RangeControl
                  id="root-nsd"
                  label="força normal solicitante"
                  symbol="NSd"
                  value={nSdKn}
                  min={-500}
                  max={3900}
                  step={0.01}
                  unit="kN"
                  fractionDigits={2}
                  minLabel="−500 kN"
                  maxLabel="+3900 kN"
                  onChange={setNSdKn}
                />
              </div>
              <button type="button" className="root-exact-sample" onClick={setDirectSampleExample}>
                <CircleDot size={15} aria-hidden="true" />
                Demonstrar raiz direta em t=1,50
              </button>
            </>
          )}

          {analysis.scenario.isArtificial && (
            <div className="root-fixed-inputs">
              <span>dados fixos da demonstração</span>
              <strong>NSd = {fmt(analysis.nSdKn, 0)} kN</strong>
              <small>θ não participa da curva sintética</small>
            </div>
          )}

          <fieldset className="root-method-picker">
            <legend>Método de refinamento</legend>
            <button
              type="button"
              className={method === "bisection" ? "is-active" : ""}
              aria-pressed={method === "bisection"}
              disabled={activeCandidate?.kind === "tangent"}
              onClick={() => setMethod("bisection")}
            >
              <strong>Bisseção</strong><span>intervalo sempre pela metade</span>
            </button>
            <button
              type="button"
              className={method === "brent" ? "is-active" : ""}
              aria-pressed={method === "brent"}
              disabled={activeCandidate?.kind === "tangent"}
              onClick={() => setMethod("brent")}
            >
              <strong>Brent</strong><span>interpolação protegida</span>
            </button>
          </fieldset>

          <div className={`root-brent-box ${activeCandidate?.kind === "sign_change" ? "is-valid" : "is-unavailable"}`}>
            <span>{method === "brent" ? "intervalo entregue ao Brent" : "intervalo disponível para Brent"}</span>
            <code>{bracketForBrent}</code>
            <p>
              {activeCandidate?.kind === "sign_change"
                ? "Válido porque f(a)·f(b)<0."
                : activeCandidate?.kind === "sample"
                  ? "Desnecessário: a amostra já atende à tolerância do resíduo."
                  : "Tangência: os extremos têm o mesmo sinal, portanto Brent não pode receber este intervalo."}
            </p>
          </div>

          {analysis.solutions.length > 1 && (
            <div className="root-choice" role="group" aria-label="Raiz acompanhada na animação">
              <span>acompanhar</span>
              {analysis.solutions.map((solution, index) => (
                <button
                  key={solution.candidateId}
                  type="button"
                  className={safeRootIndex === index ? "is-active" : ""}
                  aria-pressed={safeRootIndex === index}
                  onClick={() => selectRoot(index)}
                >
                  R{index + 1}
                </button>
              ))}
            </div>
          )}

          <div className="root-animation">
            <header>
              <span>Animação do refinamento</span>
              <strong>
                {activeSolution?.trace.length
                  ? `passo ${Math.max(0, traceIndex + 1)}/${activeSolution.trace.length}`
                  : "sem iterações"}
              </strong>
            </header>
            <div className="root-animation-buttons">
              <button
                type="button"
                aria-label="Voltar ao intervalo inicial"
                onClick={() => { setPlaying(false); setTraceIndex(-1); }}
                disabled={!activeSolution || activeSolution.trace.length === 0 || traceIndex < 0}
              >
                <RotateCcw size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Iteração anterior"
                onClick={() => { setPlaying(false); setTraceIndex((current) => Math.max(-1, current - 1)); }}
                disabled={!activeSolution || activeSolution.trace.length === 0 || traceIndex < 0}
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="is-play"
                onClick={togglePlaying}
                disabled={!activeSolution || activeSolution.trace.length === 0}
              >
                {playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
                {playing ? "Pausar" : traceIndex >= maximumTraceIndex && maximumTraceIndex >= 0 ? "Repetir" : "Animar"}
              </button>
              <button
                type="button"
                aria-label="Próxima iteração"
                onClick={() => { setPlaying(false); setTraceIndex((current) => Math.min(maximumTraceIndex, current + 1)); }}
                disabled={!activeSolution || activeSolution.trace.length === 0 || traceIndex >= maximumTraceIndex}
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="root-current-step" aria-live="polite">
              <span>{strategyLabel(activeStep)}</span>
              {activeStep ? (
                <code>t={fmt(activeStep.trialT, 6)} · f={signed(activeStep.trialResidualKn, 4)} kN</code>
              ) : activeCandidate ? (
                <code>
                  {activeCandidate.kind === "sample"
                    ? `t=${fmt(activeCandidate.estimateT, 4)} já é raiz`
                    : `Δt inicial = ${fmt(activeCandidate.bT - activeCandidate.aT, 6)}`}
                </code>
              ) : (
                <code>aguardando candidato</code>
              )}
            </div>
          </div>

          <button type="button" className="root-reset" onClick={reset}>
            <RotateCcw size={15} aria-hidden="true" />Restaurar exemplo principal
          </button>
        </aside>
      </div>

      <ProcessPanel
        analysis={analysis}
        candidate={activeCandidate}
        solution={activeSolution}
        step={activeStep}
        traceIndex={traceIndex}
      />

      <RootResults
        analysis={analysis}
        activeRootIndex={safeRootIndex}
        onSelect={selectRoot}
      />

      <section className="root-didactic-notes">
        <article>
          <ScanSearch size={19} aria-hidden="true" />
          <div><h3>Varredura não é a curva contínua</h3><p>O algoritmo avalia os pontos discretos. A linha apenas ajuda o aluno a enxergar o comportamento existente entre eles.</p></div>
        </article>
        <article>
          <CircleDot size={19} aria-hidden="true" />
          <div><h3>Troca de sinal cria um bracket</h3><p>Se f(a)·f(b)&lt;0 e f é contínua, existe ao menos uma raiz em [a,b]. É esse intervalo que pode seguir para Brent.</p></div>
        </article>
        <article>
          <CheckCircle2 size={19} aria-hidden="true" />
          <div><h3>Equilíbrio é conferido pelo resíduo</h3><p>A solução aceita não é apenas um valor de t: ela deve satisfazer |NRd(t,θ)−NSd| dentro da tolerância adotada.</p></div>
        </article>
      </section>

      <details className="root-search-explanation">
        <summary>Por que uma raiz tangente pode escapar de uma busca comum?</summary>
        <div>
          <p><b>Uma troca de sinal é suficiente, mas não necessária.</b> Quando a curva cruza o zero, os sinais nos dois lados são diferentes. Quando apenas toca o zero e retorna, os sinais permanecem iguais.</p>
          <p><b>Brent pressupõe um bracket válido.</b> Por isso, no exemplo tangente a interface não finge entregar o intervalo ao Brent: ela identifica um mínimo local de |f| e o refina como problema de minimização.</p>
          <p><b>O exemplo tangente é deliberadamente artificial.</b> Ele serve para discutir robustez do algoritmo e possíveis falhas da amostragem; não afirma que a seção padrão esteja naquele estado resistente.</p>
          <p><b>O caso físico usa a mesma cadeia do restante do laboratório.</b> Cada t gera deformações-limite, tensões do concreto e do aço e, por integração, a resultante NRd.</p>
        </div>
      </details>
    </div>
  );
}
