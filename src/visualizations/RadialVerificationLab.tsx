import {
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CircleDot,
  Crosshair,
  Gauge,
  Info,
  MousePointer2,
  OctagonX,
  RotateCcw,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import { RangeControl } from "../components/RangeControl";
import { buildInteractionCurveConstruction } from "../core/interactionCurveConstruction";
import {
  createRadialScenarios,
  verifyRadialDemand,
  type RadialPoint,
  type RadialScenario,
  type RadialScenarioId,
  type RadialVerification,
} from "../core/radialVerification";
import "./radial-verification.css";

const FIXED_N_SD_KN = 1_800;
const VIEWBOX_WIDTH = 720;
const VIEWBOX_HEIGHT = 600;
const PLOT_LEFT = 105;
const PLOT_TOP = 42;
const PLOT_SIZE = 510;

function fmt(value: number, digits = 1) {
  const normalized = Math.abs(value) < 5e-10 ? 0 : value;
  return normalized.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function signed(value: number, digits = 1) {
  return `${value > 5e-10 ? "+" : ""}${fmt(value, digits)}`;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function positionLabel(verification: RadialVerification) {
  if (verification.position === "inside") return "dentro";
  if (verification.position === "boundary") return "na fronteira";
  return "fora";
}

function geometryLabel(verification: RadialVerification) {
  if (verification.geometryKind === "point") return "ponto · 0D";
  if (verification.geometryKind === "segment") return "segmento · 1D";
  return "polígono · 2D";
}

function useScenarioScale(scenario: RadialScenario) {
  return useMemo(() => {
    const maximum = Math.max(
      1,
      ...scenario.boundary.flatMap((point) => [Math.abs(point.xKnm), Math.abs(point.yKnm)]),
      Math.abs(scenario.initialDemand.xKnm),
      Math.abs(scenario.initialDemand.yKnm),
    );
    const rounded = Math.ceil(maximum * 1.28 / 25) * 25;
    return Math.max(100, rounded);
  }, [scenario]);
}

type ChartProps = {
  scenario: RadialScenario;
  demand: RadialPoint;
  verification: RadialVerification;
  extent: number;
  onDemandChange: (point: RadialPoint) => void;
};

function RadialChart({
  scenario,
  demand,
  verification,
  extent,
  onDemandChange,
}: ChartProps) {
  const generatedId = useId().replaceAll(":", "");
  const [dragging, setDragging] = useState(false);
  const scale = PLOT_SIZE / (extent * 2);
  const x = (value: number) => PLOT_LEFT + (value + extent) * scale;
  const y = (value: number) => PLOT_TOP + (extent - value) * scale;
  const boundaryPoints = scenario.boundary.map((point) => `${x(point.xKnm)},${y(point.yKnm)}`).join(" ");
  const unit = verification.demandRadiusKnm > 0
    ? {
        xKnm: demand.xKnm / verification.demandRadiusKnm,
        yKnm: demand.yKnm / verification.demandRadiusKnm,
      }
    : null;
  const rayRadius = unit
    ? extent / Math.max(Math.abs(unit.xKnm), Math.abs(unit.yKnm), 1e-9) * 0.98
    : 0;
  const rayEnd = unit
    ? { xKnm: unit.xKnm * rayRadius, yKnm: unit.yKnm * rayRadius }
    : null;
  const ticks = [-1, -0.5, 0, 0.5, 1].map((ratio) => ratio * extent);

  const demandFromPointer = (event: PointerEvent<SVGSVGElement>) => {
    const rectangle = event.currentTarget.getBoundingClientRect();
    const svgX = (event.clientX - rectangle.left) * VIEWBOX_WIDTH / rectangle.width;
    const svgY = (event.clientY - rectangle.top) * VIEWBOX_HEIGHT / rectangle.height;
    return {
      xKnm: Math.round(clamp((svgX - PLOT_LEFT) / scale - extent, -extent, extent)),
      yKnm: Math.round(clamp(extent - (svgY - PLOT_TOP) / scale, -extent, extent)),
    };
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    const target = event.target as SVGElement;
    if (!target.closest("[data-demand-handle]")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    onDemandChange(demandFromPointer(event));
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!dragging) return;
    onDemandChange(demandFromPointer(event));
  };

  const finishDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  };

  const changeByKeyboard = (event: KeyboardEvent<SVGGElement>) => {
    const increment = event.shiftKey ? 10 : 2;
    let next = demand;
    if (event.key === "ArrowRight") next = { ...demand, xKnm: clamp(demand.xKnm + increment, -extent, extent) };
    if (event.key === "ArrowLeft") next = { ...demand, xKnm: clamp(demand.xKnm - increment, -extent, extent) };
    if (event.key === "ArrowUp") next = { ...demand, yKnm: clamp(demand.yKnm + increment, -extent, extent) };
    if (event.key === "ArrowDown") next = { ...demand, yKnm: clamp(demand.yKnm - increment, -extent, extent) };
    if (next !== demand) {
      event.preventDefault();
      onDemandChange(next);
    }
  };

  return (
    <svg
      className={`radial-chart ${dragging ? "is-dragging" : ""}`}
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      role="img"
      aria-labelledby={`${generatedId}-title ${generatedId}-description`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    >
      <title id={`${generatedId}-title`}>Verificação radial da solicitação no plano Mx–My</title>
      <desc id={`${generatedId}-description`}>
        Fronteira resistente, vetor de solicitação arrastável, direção radial, interseções e capacidade na direção da demanda.
      </desc>
      <defs>
        <marker id={`${generatedId}-demand-arrow`} markerWidth="8" markerHeight="8" refX="6.4" refY="4" orient="auto">
          <path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor" />
        </marker>
        <marker id={`${generatedId}-capacity-arrow`} markerWidth="8" markerHeight="8" refX="6.4" refY="4" orient="auto">
          <path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor" />
        </marker>
        <filter id={`${generatedId}-glow`} x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <rect className="radial-plot-background" x={PLOT_LEFT} y={PLOT_TOP} width={PLOT_SIZE} height={PLOT_SIZE} rx="8" />
      {ticks.map((tick) => (
        <g key={`tick-${tick}`}>
          <line className={`radial-grid-line ${tick === 0 ? "is-axis" : ""}`} x1={x(tick)} x2={x(tick)} y1={PLOT_TOP} y2={PLOT_TOP + PLOT_SIZE} />
          <line className={`radial-grid-line ${tick === 0 ? "is-axis" : ""}`} x1={PLOT_LEFT} x2={PLOT_LEFT + PLOT_SIZE} y1={y(tick)} y2={y(tick)} />
          <text className="radial-axis-tick" x={x(tick)} y={PLOT_TOP + PLOT_SIZE + 22} textAnchor="middle">{fmt(tick, 0)}</text>
          {tick !== 0 && <text className="radial-axis-tick" x={PLOT_LEFT - 13} y={y(tick) + 4} textAnchor="end">{fmt(tick, 0)}</text>}
        </g>
      ))}
      <text className="radial-axis-title" x={PLOT_LEFT + PLOT_SIZE / 2} y={588} textAnchor="middle">Mx [kN·m]</text>
      <text className="radial-axis-title" x="25" y={PLOT_TOP + PLOT_SIZE / 2} textAnchor="middle" transform={`rotate(-90 25 ${PLOT_TOP + PLOT_SIZE / 2})`}>My [kN·m]</text>

      {scenario.boundary.length >= 3 && (
        <polygon className="radial-boundary-area" points={boundaryPoints} />
      )}
      {scenario.boundary.length >= 3 && (
        <polygon className="radial-boundary-line" points={boundaryPoints} />
      )}
      {verification.geometryKind === "segment" && (
        <polyline className="radial-boundary-line is-segment" points={boundaryPoints} />
      )}
      {verification.geometryKind === "point" && (
        <circle className="radial-boundary-point" cx={x(scenario.boundary[0].xKnm)} cy={y(scenario.boundary[0].yKnm)} r="8" />
      )}

      {rayEnd && (
        <line className="radial-direction-line" x1={x(0)} y1={y(0)} x2={x(rayEnd.xKnm)} y2={y(rayEnd.yKnm)} />
      )}

      {verification.intersections.map((intersection, index) => (
        <g key={`${intersection.radiusKnm}-${index}`} className="radial-intersection">
          <circle cx={x(intersection.point.xKnm)} cy={y(intersection.point.yKnm)} r="8" />
          <text x={x(intersection.point.xKnm) + 11} y={y(intersection.point.yKnm) - 11}>I{index + 1}</text>
        </g>
      ))}

      {verification.applicable && verification.capacityPoint && (
        <line
          className="radial-capacity-vector"
          x1={x(0)}
          y1={y(0)}
          x2={x(verification.capacityPoint.xKnm)}
          y2={y(verification.capacityPoint.yKnm)}
          markerEnd={`url(#${generatedId}-capacity-arrow)`}
        />
      )}

      {verification.demandRadiusKnm > 0 && (
        <line
          className={`radial-demand-vector is-${verification.position}`}
          x1={x(0)}
          y1={y(0)}
          x2={x(demand.xKnm)}
          y2={y(demand.yKnm)}
          markerEnd={`url(#${generatedId}-demand-arrow)`}
        />
      )}

      <g className="radial-origin">
        <circle cx={x(0)} cy={y(0)} r="5" />
        <line x1={x(0) - 9} x2={x(0) + 9} y1={y(0)} y2={y(0)} />
        <line x1={x(0)} x2={x(0)} y1={y(0) - 9} y2={y(0) + 9} />
        <text x={x(0) + 10} y={y(0) + 17}>O</text>
      </g>

      <g
        className={`radial-demand-handle is-${verification.position}`}
        data-demand-handle="true"
        tabIndex={0}
        role="slider"
        aria-label="Ponto solicitante; use as setas para mover"
        aria-valuetext={`Mx ${signed(demand.xKnm)} e My ${signed(demand.yKnm)} quilonewton-metro`}
        onKeyDown={changeByKeyboard}
      >
        <circle className="radial-demand-hit" cx={x(demand.xKnm)} cy={y(demand.yKnm)} r="22" />
        <circle className="radial-demand-glow" cx={x(demand.xKnm)} cy={y(demand.yKnm)} r="10" filter={`url(#${generatedId}-glow)`} />
        <circle className="radial-demand-dot" cx={x(demand.xKnm)} cy={y(demand.yKnm)} r="6" />
        <text x={x(demand.xKnm) + 13} y={y(demand.yKnm) + 21}>S</text>
      </g>

      <g className="radial-chart-legend" transform="translate(440 62)">
        <rect width="158" height="80" rx="8" />
        <line className="radial-legend-demand" x1="12" y1="20" x2="38" y2="20" />
        <text x="46" y="24">solicitação</text>
        <line className="radial-legend-capacity" x1="12" y1="41" x2="38" y2="41" />
        <text x="46" y="45">capacidade</text>
        <line className="radial-legend-direction" x1="12" y1="62" x2="38" y2="62" />
        <text x="46" y="66">direção radial</text>
      </g>
    </svg>
  );
}

function Condition({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className={ok ? "is-ok" : "is-fail"}>
      <span>{ok ? <Check size={13} /> : <OctagonX size={13} />}</span>
      <div><strong>{label}</strong><small>{detail}</small></div>
    </li>
  );
}

function FormulaValue({
  index,
  symbol,
  label,
  value,
  tone,
}: {
  index: string;
  symbol: string;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <article className={`radial-formula-step ${tone ? `is-${tone}` : ""}`}>
      <span>{index}</span>
      <div><code>{symbol}</code><small>{label}</small></div>
      <strong>{value}</strong>
    </article>
  );
}

export default function RadialVerificationLab() {
  const construction = useMemo(() => buildInteractionCurveConstruction({
    nSdKn: FIXED_N_SD_KN,
    angleCount: 72,
    rootMethod: "brent",
  }), []);
  const regularBoundary = useMemo(
    () => construction.convexHullPoints.map((point) => Object.freeze({
      xKnm: point.mxKnm,
      yKnm: point.myKnm,
    })),
    [construction],
  );
  const scenarios = useMemo(() => createRadialScenarios(regularBoundary), [regularBoundary]);
  const [scenarioId, setScenarioId] = useState<RadialScenarioId>("internal");
  const scenario = scenarios.find((candidate) => candidate.id === scenarioId) ?? scenarios[0];
  const [demand, setDemand] = useState<RadialPoint>(scenarios[0].initialDemand);
  const extent = useScenarioScale(scenario);
  const verification = useMemo(
    () => verifyRadialDemand(scenario.boundary, demand),
    [scenario, demand],
  );
  const isZeroSpecialCase = verification.applicable && verification.demandRadiusKnm === 0;
  const hasUniqueIntersection = verification.intersections.length === 1 && !verification.collinearOverlap;
  const statusTone = verification.applicable
    ? verification.position === "outside" ? "outside" : verification.position === "boundary" ? "boundary" : "inside"
    : "invalid";

  const selectScenario = (nextId: RadialScenarioId) => {
    const next = scenarios.find((candidate) => candidate.id === nextId);
    if (!next) return;
    setScenarioId(nextId);
    setDemand(next.initialDemand);
  };

  const utilizationValue = verification.utilization === null
    ? "—"
    : fmt(verification.utilization, 3);
  const capacityValue = verification.radialCapacityKnm === null
    ? "—"
    : `${fmt(verification.radialCapacityKnm, 1)} kN·m`;

  return (
    <div className="radial-verification-lab">
      <section className={`radial-status is-${statusTone}`} aria-live="polite">
        <div className="radial-status-icon">
          {verification.applicable
            ? verification.position === "outside" ? <ShieldX size={22} /> : <ShieldCheck size={22} />
            : <AlertTriangle size={22} />}
        </div>
        <div className="radial-status-main">
          <span>{verification.applicable ? "verificação radial aplicável" : "razão radial não aplicável"}</span>
          <strong>{verification.applicable ? `${positionLabel(verification)} · u_rad = ${utilizationValue}` : verification.reason}</strong>
        </div>
        <div className="radial-status-metrics">
          <div><span>posição geométrica</span><strong>{positionLabel(verification)}</strong></div>
          <div><span>fronteira</span><strong>{geometryLabel(verification)}</strong></div>
          <div><span>NSd</span><strong>{scenario.mechanical ? `${fmt(FIXED_N_SD_KN, 0)} kN` : "demonstração"}</strong></div>
        </div>
      </section>

      <section className="radial-case-strip" aria-label="Exemplos de verificação radial">
        <header>
          <div><CircleDot size={18} /><span>Escolha um caso</span></div>
          <p>Os quatro primeiros usam a curva calculada da seção; os demais isolam casos-limite da geometria.</p>
        </header>
        <div className="radial-case-buttons">
          {scenarios.map((candidate, index) => (
            <button
              key={candidate.id}
              type="button"
              className={candidate.id === scenario.id ? "is-active" : ""}
              onClick={() => selectScenario(candidate.id)}
              aria-pressed={candidate.id === scenario.id}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{candidate.shortLabel}</strong>
              <small>{candidate.mechanical ? "curva da seção" : "caso geométrico"}</small>
            </button>
          ))}
        </div>
      </section>

      <main className="radial-main-grid">
        <section className="radial-chart-panel">
          <header className="radial-panel-heading">
            <span>1</span>
            <div>
              <h2>Arraste a solicitação no plano Mx–My</h2>
              <p>A direção sai da origem e permanece colinear ao vetor solicitante.</p>
            </div>
            <div className="radial-drag-hint"><MousePointer2 size={15} /> arraste S</div>
          </header>
          <RadialChart
            scenario={scenario}
            demand={demand}
            verification={verification}
            extent={extent}
            onDemandChange={setDemand}
          />
          <div className="radial-coordinate-controls">
            <RangeControl
              id="radial-mx-demand"
              label="momento solicitante em x"
              symbol="Mx,Sd"
              value={demand.xKnm}
              min={-extent}
              max={extent}
              step={1}
              unit="kN·m"
              fractionDigits={0}
              onChange={(value) => setDemand({ ...demand, xKnm: value })}
            />
            <RangeControl
              id="radial-my-demand"
              label="momento solicitante em y"
              symbol="My,Sd"
              value={demand.yKnm}
              min={-extent}
              max={extent}
              step={1}
              unit="kN·m"
              fractionDigits={0}
              onChange={(value) => setDemand({ ...demand, yKnm: value })}
            />
          </div>
        </section>

        <aside className="radial-analysis-panel">
          <header className="radial-panel-heading is-light">
            <span>2</span>
            <div><h2>Leia a verificação passo a passo</h2><p>A fórmula só aparece quando todas as hipóteses são satisfeitas.</p></div>
          </header>

          <article className="radial-scenario-explainer">
            <div className="radial-scenario-title">
              <span>{scenario.mechanical ? "estado da seção" : "demonstração geométrica"}</span>
              <h3>{scenario.title}</h3>
              <small>{scenario.eyebrow}</small>
            </div>
            <p>{scenario.description}</p>
            <div><Info size={15} /><span>{scenario.lesson}</span></div>
          </article>

          <div className="radial-formula-stack">
            <FormulaValue
              index="A"
              symbol="M⃗Sd = (Mx,Sd, My,Sd)"
              label="vetor solicitante"
              value={`(${signed(demand.xKnm)}, ${signed(demand.yKnm)})`}
            />
            <FormulaValue
              index="B"
              symbol="φ = atan2(My,Sd, Mx,Sd)"
              label="direção radial"
              value={verification.directionDeg === null ? "indefinida para M = 0" : `${fmt(verification.directionDeg, 1)}°`}
            />
            <FormulaValue
              index="C"
              symbol="M⃗Rd(φ) = raio ∩ fronteira"
              label={`${verification.intersections.length} interseção(ões) positiva(s)`}
              value={capacityValue}
              tone={verification.intersections.length > 1 ? "warning" : undefined}
            />
            <FormulaValue
              index="D"
              symbol="u_rad = ‖M⃗Sd‖ / ‖M⃗Rd(φ)‖"
              label="índice de utilização radial"
              value={isZeroSpecialCase ? "0,000 · caso especial" : utilizationValue}
              tone={verification.applicable ? statusTone : "invalid"}
            />
          </div>

          <section className="radial-hypotheses">
            <div className="radial-subheading"><Crosshair size={16} /><h3>Teste de aplicabilidade</h3></div>
            <ul>
              <Condition
                ok={verification.geometryKind === "polygon"}
                label="Existe uma região 2D"
                detail={verification.geometryKind === "polygon" ? "fronteira poligonal" : `a geometria é ${geometryLabel(verification)}`}
              />
              <Condition
                ok={verification.originInside}
                label="A origem pertence à região"
                detail={verification.originInside ? "o escalonamento começa em ponto admissível" : "o raio parte fora do domínio"}
              />
              <Condition
                ok={verification.directionDeg !== null || isZeroSpecialCase}
                label="Há direção radial"
                detail={isZeroSpecialCase ? "dispensada pelo caso M = 0" : verification.directionDeg === null ? "atan2(0,0) não define direção" : `φ = ${fmt(verification.directionDeg, 1)}°`}
              />
              <Condition
                ok={hasUniqueIntersection || isZeroSpecialCase}
                label="A capacidade é unívoca"
                detail={isZeroSpecialCase ? "não é necessário intersectar" : verification.collinearOverlap ? "raio sobreposto à fronteira" : `${verification.intersections.length} cruzamento(s) positivo(s)`}
              />
            </ul>
          </section>

          <article className={`radial-conclusion is-${statusTone}`}>
            <div>{verification.applicable ? <Gauge size={18} /> : <AlertTriangle size={18} />}</div>
            <span>
              <small>conclusão do algoritmo</small>
              <strong>{verification.reason}</strong>
            </span>
          </article>
        </aside>
      </main>

      <section className="radial-reading-section">
        <header className="radial-panel-heading is-light">
          <span>3</span>
          <div><h2>O que exatamente o índice radial mede?</h2><p>Uma comparação de dois comprimentos na mesma direção — não uma distância mínima qualquer até a curva.</p></div>
        </header>
        <div className="radial-reading-grid">
          <article>
            <ArrowUpRight size={19} />
            <div><strong>Mesmo raio</strong><p>A demanda e a capacidade comparada têm o mesmo ângulo φ. Mudar a direção muda o ponto resistente.</p></div>
          </article>
          <article>
            <Gauge size={19} />
            <div><strong>Razão de módulos</strong><p>Com uma única interseção, u_rad &lt; 1 é interno, u_rad = 1 é fronteira e u_rad &gt; 1 é externo.</p></div>
          </article>
          <article>
            <Crosshair size={19} />
            <div><strong>Região estrelada</strong><p>Cada raio que parte da origem precisa encontrar a fronteira resistente uma única vez.</p></div>
          </article>
          <article>
            <AlertTriangle size={19} />
            <div><strong>Não force um número</strong><p>Ponto, segmento, origem externa ou cruzamentos múltiplos anulam a interpretação de u_rad.</p></div>
          </article>
        </div>
        <footer>
          <strong>Escopo:</strong> esta é uma verificação da resistência seccional para NSd fixo. Ela não inclui esbeltez, imperfeições, efeitos de 2ª ordem, momento mínimo ou detalhamento do pilar.
        </footer>
      </section>

      <button className="radial-reset" type="button" onClick={() => setDemand(scenario.initialDemand)}>
        <RotateCcw size={15} /> restaurar o exemplo atual
      </button>
    </div>
  );
}
