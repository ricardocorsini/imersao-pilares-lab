import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  Gauge,
  GitBranch,
  Hexagon,
  Layers3,
  Pause,
  Play,
  RotateCcw,
  ScanSearch,
  Target,
  Workflow,
} from "lucide-react";
import { RangeControl } from "../components/RangeControl";
import {
  INTERACTION_AXIAL_CAPACITY_KN,
  INTERACTION_DEFAULT_ANGLE_COUNT,
  buildInteractionCurveConstruction,
  convexHullInteractionPoints,
  orderInteractionPointsPolar,
  type InteractionConstructionPoint,
  type InteractionCurveConstruction,
} from "../core/interactionCurveConstruction";
import { LIMIT_STATE_CONCRETE } from "../core/limitStatePath";
import { getProjectionGeometry, type Point2D } from "../core/projectedGeometry";
import "./interaction-construction.css";

type ConstructionView = "mechanical" | "external" | "polar" | "hull";

const RECTANGLE = getProjectionGeometry("rectangle");
const INITIAL_NSD = 1_800;
const INITIAL_VISIBLE_ANGLES = 9;
const ANGLE_COUNTS = [12, 24, 36, 72];

const VIEW_INFO: Record<ConstructionView, {
  title: string;
  short: string;
  description: string;
  stage: "mechanical" | "geometric";
}> = {
  mechanical: {
    title: "Todos os candidatos mecânicos",
    short: "Candidatos",
    description: "Cada raiz de NRd(t,θ)−NSd=0 vira um ponto. Nada foi descartado nem ordenado.",
    stage: "mechanical",
  },
  external: {
    title: "Candidato externo selecionado",
    short: "Externos",
    description: "Em cada θ, conserva-se o candidato de maior raio √(Mx²+My²). Os demais continuam auditáveis.",
    stage: "mechanical",
  },
  polar: {
    title: "Ordenação polar",
    short: "Ordem polar",
    description: "Os mesmos pontos externos são reordenados pelo ângulo em torno do centro da nuvem.",
    stage: "geometric",
  },
  hull: {
    title: "Fecho convexo",
    short: "Fecho convexo",
    description: "Uma nova fronteira geométrica é construída apenas com os vértices extremos da nuvem.",
    stage: "geometric",
  },
};

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

function rootMethodLabel(point: InteractionConstructionPoint) {
  if (point.rootMethod === "brent") return "Brent–Dekker";
  if (point.rootMethod === "bisection") return "bisseção";
  if (point.rootMethod === "sample") return "amostra direta";
  if (point.rootMethod === "tangent_minimization") return "mínimo de |f|";
  return "extremo degenerado";
}

function domainClass(point: InteractionConstructionPoint) {
  const id = point.domainId;
  if (["D1_D2", "D2", "D2_D3"].includes(id)) return "d2";
  if (["D3", "D3_D4"].includes(id)) return "d3";
  if (["D4", "D4_D4A"].includes(id)) return "d4";
  if (["D4A", "D4A_D5"].includes(id)) return "d4a";
  return "d5";
}

function strainColor(strainPerMille: number) {
  if (strainPerMille < -2.2) return "#7766ff";
  if (strainPerMille < -0.0001) return "#3e9bea";
  if (strainPerMille <= 0.0001) return "#f1f7fa";
  if (strainPerMille < LIMIT_STATE_CONCRETE.epsC2 * 1_000) return "#ffbd52";
  return "#ff6653";
}

function useContainerWidth(minimum = 300) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(520);
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

function pointAtProjection(
  point: InteractionConstructionPoint,
  projectionMm: number,
  tangentCoordinateMm: number,
): Point2D {
  return {
    xMm: point.limitState.cosine * projectionMm +
      point.limitState.tangentX * tangentCoordinateMm,
    yMm: point.limitState.sine * projectionMm +
      point.limitState.tangentY * tangentCoordinateMm,
  };
}

function SectionStateDiagram({ point }: { point: InteractionConstructionPoint }) {
  const generatedId = useId().replaceAll(":", "");
  const { ref, width } = useContainerWidth();
  const height = width < 390 ? 370 : 425;
  const padding = width < 390 ? 56 : 70;
  const xValues = RECTANGLE.outline.map((vertex) => vertex.xMm);
  const yValues = RECTANGLE.outline.map((vertex) => vertex.yMm);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  const spanX = xMax - xMin;
  const spanY = yMax - yMin;
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
  const drawnWidth = spanX * scale;
  const drawnHeight = spanY * scale;
  const offsetX = (width - drawnWidth) / 2;
  const offsetY = (height - drawnHeight) / 2;
  const mapX = (xMm: number) => offsetX + (xMm - xMin) * scale;
  const mapY = (yMm: number) => height - offsetY - (yMm - yMin) * scale;
  const polygonPoints = RECTANGLE.outline
    .map((vertex) => `${mapX(vertex.xMm)},${mapY(vertex.yMm)}`)
    .join(" ");
  const state = point.limitState;
  const supportHalfLength = Math.max(spanX, spanY) * 0.72;
  const lineAtDepth = (depthMm: number) => {
    const projection = state.pMaxMm - depthMm;
    const first = pointAtProjection(point, projection, -supportHalfLength);
    const second = pointAtProjection(point, projection, supportHalfLength);
    return {
      x1: mapX(first.xMm),
      y1: mapY(first.yMm),
      x2: mapX(second.xMm),
      y2: mapY(second.yMm),
    };
  };
  const neutralLine = state.neutralAxisInsideSection
    ? lineAtDepth(state.neutralAxisDepthMm)
    : null;
  const zeroOffset = state.neutralAxisInsideSection
    ? clamp(state.neutralAxisDepthMm / state.heightMm, 0, 1)
    : null;
  const normalLengthMm = 100;
  const normalEnd = {
    xMm: state.cosine * normalLengthMm,
    yMm: state.sine * normalLengthMm,
  };
  const momentLengthMm = 100;
  const momentRadius = Math.max(1e-12, point.momentRadiusKnm);
  const momentEnd = {
    xMm: point.mxKnm / momentRadius * momentLengthMm,
    yMm: point.myKnm / momentRadius * momentLengthMm,
  };
  const topColor = strainColor(state.epsTop * 1_000);
  const bottomColor = strainColor(state.epsBottom * 1_000);

  return (
    <div className="curve-section-wrap" ref={ref}>
      <svg
        className="curve-section-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${generatedId}-title ${generatedId}-description`}
      >
        <title id={`${generatedId}-title`}>Seção no estado resistente correspondente ao ângulo atual</title>
        <desc id={`${generatedId}-description`}>
          Seção retangular, linha neutra, mapa de deformações, direção theta e vetor de momento resistente.
        </desc>
        <defs>
          <linearGradient
            id={`${generatedId}-strain`}
            gradientUnits="userSpaceOnUse"
            x1={mapX(state.cosine * state.pMaxMm)}
            y1={mapY(state.sine * state.pMaxMm)}
            x2={mapX(state.cosine * state.pMinMm)}
            y2={mapY(state.sine * state.pMinMm)}
          >
            <stop offset="0" stopColor={topColor} stopOpacity="0.78" />
            {zeroOffset !== null && zeroOffset > 0.01 && zeroOffset < 0.99 && (
              <>
                <stop offset={Math.max(0, zeroOffset - 0.018)} stopColor={topColor} stopOpacity="0.48" />
                <stop offset={zeroOffset} stopColor="#f1f7fa" stopOpacity="0.22" />
                <stop offset={Math.min(1, zeroOffset + 0.018)} stopColor={bottomColor} stopOpacity="0.48" />
              </>
            )}
            <stop offset="1" stopColor={bottomColor} stopOpacity="0.74" />
          </linearGradient>
          <clipPath id={`${generatedId}-clip`}><polygon points={polygonPoints} /></clipPath>
          <marker id={`${generatedId}-theta-arrow`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" className="curve-theta-marker" />
          </marker>
          <marker id={`${generatedId}-moment-arrow`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" className="curve-moment-marker" />
          </marker>
        </defs>

        <line className="curve-section-axis" x1={mapX(xMin)} x2={mapX(xMax)} y1={mapY(0)} y2={mapY(0)} />
        <line className="curve-section-axis" x1={mapX(0)} x2={mapX(0)} y1={mapY(yMin)} y2={mapY(yMax)} />
        <text className="curve-section-axis-label" x={mapX(xMax) + 8} y={mapY(0) + 4}>x</text>
        <text className="curve-section-axis-label" x={mapX(0) + 6} y={mapY(yMax) - 8}>y</text>
        <polygon className="curve-section-shape" points={polygonPoints} fill={`url(#${generatedId}-strain)`} />
        <g clipPath={`url(#${generatedId}-clip)`}>
          {neutralLine && <line className="curve-neutral-axis" {...neutralLine} />}
        </g>

        <line
          className="curve-theta-arrow"
          x1={mapX(0)} y1={mapY(0)}
          x2={mapX(normalEnd.xMm)} y2={mapY(normalEnd.yMm)}
          markerEnd={`url(#${generatedId}-theta-arrow)`}
        />
        <text className="curve-theta-label" x={mapX(normalEnd.xMm) + 8} y={mapY(normalEnd.yMm) - 7}>
          nθ · {fmt(point.thetaDeg, 0)}°
        </text>

        {point.momentRadiusKnm > 1e-7 && (
          <>
            <line
              className="curve-moment-arrow"
              x1={mapX(0)} y1={mapY(0)}
              x2={mapX(momentEnd.xMm)} y2={mapY(momentEnd.yMm)}
              markerEnd={`url(#${generatedId}-moment-arrow)`}
            />
            <text className="curve-moment-label" x={mapX(momentEnd.xMm) + 8} y={mapY(momentEnd.yMm) + 15}>
              MRd · φ={fmt(point.polarAngleDeg, 1)}°
            </text>
          </>
        )}

        {neutralLine ? (
          <text
            className="curve-neutral-label"
            x={(neutralLine.x1 + neutralLine.x2) / 2 + 7}
            y={(neutralLine.y1 + neutralLine.y2) / 2 - 7}
          >
            LN · xLN={fmt(state.neutralAxisDepthMm, 1)} mm
          </text>
        ) : (
          <text className="curve-neutral-label is-outside" x={width / 2} y={height - 14} textAnchor="middle">
            LN fora da seção · xLN={Number.isFinite(state.neutralAxisDepthMm) ? `${fmt(state.neutralAxisDepthMm, 1)} mm` : "∞"}
          </text>
        )}

        {state.bars.map((bar) => (
          <circle
            key={bar.id}
            className={`curve-section-bar ${bar.isMinimumStrain ? "is-critical" : ""}`}
            cx={mapX(bar.xMm)}
            cy={mapY(bar.yMm)}
            r={bar.isMinimumStrain ? 5.8 : 4.5}
            fill={strainColor(bar.strainPerMille)}
          >
            <title>{bar.id}: ε={signed(bar.strainPerMille, 3)}‰</title>
          </circle>
        ))}

        <text className="curve-strain-label is-top" x={12} y={20}>εtop={signed(state.epsTop * 1_000, 3)}‰</text>
        <text className="curve-strain-label" x={12} y={36}>εbottom={signed(state.epsBottom * 1_000, 3)}‰</text>
      </svg>
    </div>
  );
}

type CurveChartProps = {
  construction: InteractionCurveConstruction;
  builtAngles: number;
  view: ConstructionView;
  activePoint?: InteractionConstructionPoint;
  onSelectPoint: (point: InteractionConstructionPoint) => void;
};

function InteractionBuildChart({
  construction,
  builtAngles,
  view,
  activePoint,
  onSelectPoint,
}: CurveChartProps) {
  const generatedId = useId().replaceAll(":", "");
  const { ref, width } = useContainerWidth();
  const compact = width < 520;
  const height = compact ? 420 : 470;
  const diagnostics = construction.diagnostics.slice(0, builtAngles);
  const mechanical = diagnostics.flatMap((diagnostic) => [...diagnostic.candidates]);
  const external = diagnostics.flatMap((diagnostic) =>
    diagnostic.selectedIndex === null
      ? []
      : [diagnostic.candidates[diagnostic.selectedIndex]]);
  const polar = orderInteractionPointsPolar(external);
  const hull = convexHullInteractionPoints(external);
  const maximumMoment = Math.max(
    1,
    ...construction.mechanicalCandidates.flatMap((point) => [
      Math.abs(point.mxKnm),
      Math.abs(point.myKnm),
    ]),
  ) * 1.12;
  const plotSize = Math.min(width - (compact ? 82 : 108), height - 84);
  const left = (width - plotSize) / 2;
  const top = 35;
  const xScale = (value: number) => left + (value + maximumMoment) / (2 * maximumMoment) * plotSize;
  const yScale = (value: number) => top + (maximumMoment - value) / (2 * maximumMoment) * plotSize;
  const ticks = [-1, -0.5, 0, 0.5, 1].map((fraction) => fraction * maximumMoment);
  const pathFor = (points: readonly InteractionConstructionPoint[], close: boolean) => {
    if (points.length === 0) return "";
    const path = points.map((point, index) =>
      `${index === 0 ? "M" : "L"}${xScale(point.mxKnm).toFixed(2)},${yScale(point.myKnm).toFixed(2)}`,
    ).join(" ");
    return close && points.length >= 3 ? `${path} Z` : path;
  };
  const complete = builtAngles >= construction.diagnostics.length;
  const orderedPoints = view === "external"
    ? external
    : view === "polar"
      ? polar
      : view === "hull" ? hull : [];
  const closePath = view === "hull" || (complete && (view === "external" || view === "polar"));
  const polarCenter = polar.length === 0
    ? null
    : {
      mx: polar.reduce((sum, point) => sum + point.mxKnm, 0) / polar.length,
      my: polar.reduce((sum, point) => sum + point.myKnm, 0) / polar.length,
    };
  const displayedPoints = view === "mechanical"
    ? mechanical
    : view === "hull" ? external : orderedPoints;
  const selectedIds = new Set(external.map((point) => point.id));
  const hullIds = new Set(hull.map((point) => point.id));

  return (
    <div className="curve-build-chart-wrap" ref={ref}>
      <svg
        className="curve-build-chart"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${generatedId}-title ${generatedId}-description`}
      >
        <title id={`${generatedId}-title`}>Construção incremental da curva Mx por My</title>
        <desc id={`${generatedId}-description`}>
          {builtAngles} orientações processadas; modo {VIEW_INFO[view].title}.
        </desc>
        <defs>
          <clipPath id={`${generatedId}-plot-clip`}>
            <rect x={left} y={top} width={plotSize} height={plotSize} />
          </clipPath>
        </defs>

        <g clipPath={`url(#${generatedId}-plot-clip)`}>
          {ticks.map((tick) => (
            <g key={`grid-${tick}`}>
              <line className="curve-build-grid" x1={xScale(tick)} x2={xScale(tick)} y1={top} y2={top + plotSize} />
              <line className="curve-build-grid" x1={left} x2={left + plotSize} y1={yScale(tick)} y2={yScale(tick)} />
            </g>
          ))}
          <line className="curve-build-zero" x1={xScale(0)} x2={xScale(0)} y1={top} y2={top + plotSize} />
          <line className="curve-build-zero" x1={left} x2={left + plotSize} y1={yScale(0)} y2={yScale(0)} />

          {view !== "mechanical" && mechanical.map((point) => (
            <circle
              key={`ghost-${point.id}`}
              className={`curve-build-ghost ${selectedIds.has(point.id) ? "is-selected" : ""}`}
              cx={xScale(point.mxKnm)} cy={yScale(point.myKnm)} r="2.5"
            />
          ))}

          {view === "hull" && hull.length >= 3 && (
            <path className="curve-hull-fill" d={pathFor(hull, true)} />
          )}
          {view !== "mechanical" && orderedPoints.length >= 2 && (
            <path className={`curve-build-path is-${view}`} d={pathFor(orderedPoints, closePath)} />
          )}

          {activePoint && (
            <line
              className="curve-active-ray"
              x1={xScale(0)} y1={yScale(0)}
              x2={xScale(activePoint.mxKnm)} y2={yScale(activePoint.myKnm)}
            />
          )}
        </g>

        <rect className="curve-build-frame" x={left} y={top} width={plotSize} height={plotSize} />
        {ticks.map((tick) => (
          <g key={`tick-${tick}`}>
            <text className="curve-build-tick" x={xScale(tick)} y={top + plotSize + 19} textAnchor="middle">
              {fmt(tick, 0)}
            </text>
            <text className="curve-build-tick" x={left - 9} y={yScale(tick) + 4} textAnchor="end">
              {fmt(tick, 0)}
            </text>
          </g>
        ))}
        <text className="curve-build-axis-title" x={left + plotSize / 2} y={height - 8} textAnchor="middle">Mx,Rd [kN·m]</text>
        <text
          className="curve-build-axis-title"
          x="15" y={top + plotSize / 2} textAnchor="middle"
          transform={`rotate(-90 15 ${top + plotSize / 2})`}
        >
          My,Rd [kN·m]
        </text>

        {displayedPoints.map((point) => {
          const active = activePoint?.id === point.id;
          const selected = selectedIds.has(point.id);
          const onHull = hullIds.has(point.id);
          const className = [
            "curve-build-point",
            `is-${domainClass(point)}`,
            selected ? "is-external" : "is-internal",
            onHull ? "is-hull" : "",
            active ? "is-active" : "",
          ].join(" ");
          return (
            <g key={point.id}>
              <circle
                className={className}
                cx={xScale(point.mxKnm)}
                cy={yScale(point.myKnm)}
                r={active ? 6.8 : view === "mechanical" && !selected ? 3.2 : 4.2}
              >
                <title>
                  θ={fmt(point.thetaDeg, 1)}°; t={fmt(point.t, 5)}; {point.domainLabel}; Mx={signed(point.mxKnm, 2)} kN·m; My={signed(point.myKnm, 2)} kN·m
                </title>
              </circle>
              <circle
                className="curve-build-hit"
                cx={xScale(point.mxKnm)} cy={yScale(point.myKnm)} r="13"
                role="button"
                tabIndex={0}
                aria-label={`Inspecionar ponto theta ${fmt(point.thetaDeg, 1)} graus`}
                onClick={() => onSelectPoint(point)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onSelectPoint(point);
                }}
              />
            </g>
          );
        })}

        {activePoint && (
          <g className="curve-active-point-label">
            <circle cx={xScale(activePoint.mxKnm)} cy={yScale(activePoint.myKnm)} r="10" />
            <text
              x={xScale(activePoint.mxKnm) + (activePoint.mxKnm > maximumMoment * 0.55 ? -11 : 11)}
              y={yScale(activePoint.myKnm) - 12}
              textAnchor={activePoint.mxKnm > maximumMoment * 0.55 ? "end" : "start"}
            >
              θ={fmt(activePoint.thetaDeg, 0)}° · ({signed(activePoint.mxKnm, 1)}; {signed(activePoint.myKnm, 1)})
            </text>
          </g>
        )}

        {view === "polar" && polarCenter && (
          <g className="curve-polar-center">
            <circle cx={xScale(polarCenter.mx)} cy={yScale(polarCenter.my)} r="4" />
            <text x={xScale(polarCenter.mx) + 8} y={yScale(polarCenter.my) + 14}>centro da ordenação</text>
          </g>
        )}

        <text className={`curve-view-stamp is-${view}`} x={left + 10} y={top + 20}>
          {VIEW_INFO[view].title.toUpperCase()}
        </text>
      </svg>
    </div>
  );
}

function ConstructionFlow({
  construction,
  point,
  builtAngles,
}: {
  construction: InteractionCurveConstruction;
  point?: InteractionConstructionPoint;
  builtAngles: number;
}) {
  const steps = [
    { number: "1", title: "Escolher NSd", value: `${fmt(construction.input.nSdKn, 1)} kN` },
    { number: "2", title: "Girar θ", value: point ? `${fmt(point.thetaDeg, 1)}°` : "—" },
    { number: "3", title: "Estado-limite", value: point?.domainLabel ?? "—" },
    { number: "4", title: "Resolver t", value: point ? `${fmt(point.t, 5)} · ${rootMethodLabel(point)}` : "—" },
    { number: "5", title: "Calcular momentos", value: point ? `${signed(point.mxKnm, 1)} · ${signed(point.myKnm, 1)}` : "—" },
    { number: "6", title: "Inserir ponto", value: `${builtAngles}/${construction.diagnostics.length}` },
    { number: "7", title: "Repetir", value: `Δθ=${fmt(construction.angleStepDeg, 1)}°` },
  ];
  return (
    <section className="curve-construction-flow" aria-label="Etapas de construção de cada ponto">
      {steps.map((step, index) => (
        <article key={step.number} className={index === 5 ? "is-current" : ""}>
          <span>{step.number}</span>
          <div><strong>{step.title}</strong><code>{step.value}</code></div>
          {index < steps.length - 1 && <i aria-hidden="true">→</i>}
        </article>
      ))}
    </section>
  );
}

function PointInspector({ point }: { point?: InteractionConstructionPoint }) {
  if (!point) return <div className="curve-point-empty">Nenhum ponto mecânico disponível nesta orientação.</div>;
  const xLn = Number.isFinite(point.neutralAxisDepthMm)
    ? `${fmt(point.neutralAxisDepthMm, 2)} mm${point.neutralAxisInsideSection ? "" : " · fora"}`
    : "∞ · curvatura nula";
  return (
    <section className="curve-point-inspector" aria-live="polite">
      <header>
        <div><span>ponto auditado</span><strong>θ = {fmt(point.thetaDeg, 1)}°</strong></div>
        <b className={`is-${domainClass(point)}`}>{point.domainLabel}</b>
      </header>
      <div className="curve-point-resultants">
        <span>Mx,Rd<strong>{signed(point.mxKnm, 2)} <small>kN·m</small></strong></span>
        <span>My,Rd<strong>{signed(point.myKnm, 2)} <small>kN·m</small></strong></span>
        <span>NRd<strong>{fmt(point.nRdKn, 2)} <small>kN</small></strong></span>
      </div>
      <dl>
        <div><dt>t</dt><dd>{fmt(point.t, 7)}</dd></div>
        <div><dt>xLN</dt><dd>{xLn}</dd></div>
        <div><dt>método da raiz</dt><dd>{rootMethodLabel(point)}</dd></div>
        <div><dt>resíduo axial</dt><dd>{signed(point.axialResidualKn, 6)} kN</dd></div>
        <div><dt>raízes neste θ</dt><dd>{point.rootsAtAngle}</dd></div>
        <div><dt>avaliações</dt><dd>{point.functionEvaluations}</dd></div>
      </dl>
      <div className="curve-equilibrium-chain">
        <code>f(t)=NRd(t,θ)−NSd={signed(point.axialResidualKn, 6)} kN</code>
        <span>→</span>
        <code>(Mx,Rd; My,Rd)</code>
      </div>
      <p>
        {point.isExternalCandidate
          ? "Este é o candidato externo selecionado nesta orientação."
          : "Este candidato mecânico foi preservado, mas outro possui maior raio de momento nesta orientação."}
      </p>
    </section>
  );
}

function LayerExplanation({
  construction,
  activeView,
  onChange,
}: {
  construction: InteractionCurveConstruction;
  activeView: ConstructionView;
  onChange: (view: ConstructionView) => void;
}) {
  const layers: Array<{ id: ConstructionView; count: number; icon: typeof Layers3 }> = [
    { id: "mechanical", count: construction.mechanicalCandidates.length, icon: ScanSearch },
    { id: "external", count: construction.selectedCandidates.length, icon: Target },
    { id: "polar", count: construction.polarOrderedPoints.length, icon: Compass },
    { id: "hull", count: construction.convexHullPoints.length, icon: Hexagon },
  ];
  return (
    <section className="curve-layer-explanation">
      <header>
        <div><Layers3 size={19} aria-hidden="true" /><div><h2>Quatro leituras da mesma construção</h2><p>Os dois primeiros níveis vêm da mecânica; os dois últimos são operações geométricas posteriores.</p></div></div>
        <span className="curve-stage-divider"><b>MECÂNICA</b><i /><b>GEOMETRIA</b></span>
      </header>
      <div className="curve-layer-grid">
        {layers.map((layer, index) => {
          const info = VIEW_INFO[layer.id];
          const Icon = layer.icon;
          return (
            <button
              key={layer.id}
              type="button"
              className={`${activeView === layer.id ? "is-active" : ""} is-${info.stage}`}
              aria-pressed={activeView === layer.id}
              onClick={() => onChange(layer.id)}
            >
              <span className="curve-layer-number">{index + 1}</span>
              <Icon size={18} aria-hidden="true" />
              <strong>{info.title}</strong>
              <b>{layer.count} {layer.count === 1 ? "ponto" : "pontos"}</b>
              <p>{info.description}</p>
              {index < layers.length - 1 && <i className="curve-layer-arrow" aria-hidden="true">→</i>}
            </button>
          );
        })}
      </div>
      <div className="curve-layer-conclusion">
        <CheckCircle2 size={17} aria-hidden="true" />
        <p>
          {construction.hullOmittedCount === 0
            ? "Nesta seção e neste nível de NSd, os pontos externos também são vértices do fecho convexo. As linhas podem coincidir visualmente, mas o fecho continua sendo um pós-processamento — ele não calculou nenhum estado resistente."
            : `O fecho omitiu ${construction.hullOmittedCount} ponto(s) externo(s) por ficarem no interior da envoltória geométrica. Esses estados mecânicos continuam existindo.`}
        </p>
      </div>
    </section>
  );
}

export default function InteractionConstructionLab() {
  const [nSdKn, setNSdKn] = useState(INITIAL_NSD);
  const [angleCount, setAngleCount] = useState(INTERACTION_DEFAULT_ANGLE_COUNT);
  const [view, setView] = useState<ConstructionView>("external");
  const [builtAngles, setBuiltAngles] = useState(INITIAL_VISIBLE_ANGLES);
  const [activePointId, setActivePointId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const construction = useMemo(
    () => buildInteractionCurveConstruction({ nSdKn, angleCount, rootMethod: "brent" }),
    [nSdKn, angleCount],
  );
  const totalAngles = construction.diagnostics.length;
  const safeBuiltAngles = clamp(builtAngles, 1, totalAngles);
  const revealedDiagnostics = construction.diagnostics.slice(0, safeBuiltAngles);
  const revealedMechanical = revealedDiagnostics.flatMap((diagnostic) => [...diagnostic.candidates]);
  const latestSelected = (() => {
    const diagnostic = revealedDiagnostics.at(-1);
    return diagnostic && diagnostic.selectedIndex !== null
      ? diagnostic.candidates[diagnostic.selectedIndex]
      : revealedMechanical.at(-1);
  })();
  const activePoint = revealedMechanical.find((point) => point.id === activePointId) ?? latestSelected;
  const complete = safeBuiltAngles >= totalAngles;

  useEffect(() => {
    if (latestSelected) setActivePointId(latestSelected.id);
  }, [safeBuiltAngles, construction, latestSelected?.id]);

  useEffect(() => {
    if (!playing || totalAngles <= 1) return;
    const timer = window.setInterval(() => {
      setBuiltAngles((current) => Math.min(totalAngles, current + 1));
    }, 520);
    return () => window.clearInterval(timer);
  }, [playing, totalAngles]);

  useEffect(() => {
    if (playing && complete) setPlaying(false);
  }, [playing, complete]);

  const restartConstruction = () => {
    setPlaying(false);
    setBuiltAngles(1);
    setActivePointId(null);
  };

  const updateNSd = (value: number) => {
    setNSdKn(clamp(value, 0, INTERACTION_AXIAL_CAPACITY_KN));
    restartConstruction();
  };

  const updateAngleCount = (value: number) => {
    setAngleCount(value);
    restartConstruction();
  };

  const togglePlay = () => {
    if (totalAngles <= 1) return;
    if (!playing && complete) setBuiltAngles(1);
    setPlaying((current) => !current);
  };

  const resetAll = () => {
    setNSdKn(INITIAL_NSD);
    setAngleCount(INTERACTION_DEFAULT_ANGLE_COUNT);
    setView("external");
    setBuiltAngles(INITIAL_VISIBLE_ANGLES);
    setActivePointId(null);
    setPlaying(false);
  };

  const progressStyle = {
    "--curve-progress": `${totalAngles <= 1 ? 100 : safeBuiltAngles / totalAngles * 100}%`,
  } as CSSProperties;
  const multipleRoots = construction.multipleRootAnglesDeg.length;

  return (
    <div className="lab-shell interaction-construction-lab">
      <div className="curve-construction-status">
        <div className="curve-status-badge">
          <Workflow size={19} aria-hidden="true" />
          <div><span>construção incremental</span><strong>Mx,Rd × My,Rd</strong></div>
        </div>
        <div className="curve-status-copy">
          <h2>Um ponto resistente nasce de uma orientação, uma raiz e uma integração.</h2>
          <p>O contorno só aparece depois que essa mesma cadeia é repetida ao longo de 360°.</p>
        </div>
        <div className="curve-status-progress" aria-live="polite">
          <span>orientações concluídas</span>
          <strong>{safeBuiltAngles}/{totalAngles}</strong>
          <i><b style={{ width: `${totalAngles <= 1 ? 100 : safeBuiltAngles / totalAngles * 100}%` }} /></i>
        </div>
      </div>

      <ConstructionFlow construction={construction} point={activePoint} builtAngles={safeBuiltAngles} />

      <div className="curve-construction-main">
        <section className="curve-construction-panel is-section" aria-label="Seção no estado resistente atual">
          <header>
            <span>1</span>
            <div><h2>Seção e estado-limite</h2><p>θ orienta a normal da linha neutra; o vetor MRd é consequência da integração.</p></div>
          </header>
          {activePoint && <SectionStateDiagram point={activePoint} />}
          <div className="curve-section-legend">
            <span><i className="is-theta" />normal nθ</span>
            <span><i className="is-moment" />vetor MRd</span>
            <span><i className="is-ln" />linha neutra</span>
          </div>
        </section>

        <section className="curve-construction-panel is-chart" aria-label="Construção da curva de interação">
          <header>
            <span>2</span>
            <div><h2>{VIEW_INFO[view].title}</h2><p>{VIEW_INFO[view].description}</p></div>
          </header>
          <InteractionBuildChart
            construction={construction}
            builtAngles={safeBuiltAngles}
            view={view}
            activePoint={activePoint}
            onSelectPoint={(point) => setActivePointId(point.id)}
          />
          <div className="curve-domain-legend">
            <span><i className="is-d2" />D2</span>
            <span><i className="is-d3" />D3</span>
            <span><i className="is-d4" />D4</span>
            <span><i className="is-d4a" />D4a</span>
            <span><i className="is-d5" />D5</span>
            <span><i className="is-current" />ponto auditado</span>
          </div>
        </section>

        <aside className="curve-construction-controls" aria-label="Parâmetros e auditoria da construção">
          <div className="curve-controls-heading">
            <Gauge size={19} aria-hidden="true" />
            <div><h2>Controle da construção</h2><span>30 × 60 cm · C30 · CA-50 · 8 Ø16</span></div>
          </div>

          <div className="curve-n-presets" aria-label="Níveis usuais de força normal">
            {[
              { label: "N=0", value: 0 },
              { label: "25%", value: INTERACTION_AXIAL_CAPACITY_KN * 0.25 },
              { label: "50%", value: INTERACTION_AXIAL_CAPACITY_KN * 0.5 },
              { label: "Ncomp", value: INTERACTION_AXIAL_CAPACITY_KN },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                className={Math.abs(nSdKn - preset.value) < 0.02 ? "is-active" : ""}
                aria-pressed={Math.abs(nSdKn - preset.value) < 0.02}
                onClick={() => updateNSd(preset.value)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="curve-range-control">
            <RangeControl
              id="construction-nsd"
              label="força normal fixada"
              symbol="NSd"
              value={nSdKn}
              min={0}
              max={INTERACTION_AXIAL_CAPACITY_KN}
              step={0.01}
              unit="kN"
              signed={false}
              fractionDigits={2}
              minLabel="0 kN"
              maxLabel={`${fmt(INTERACTION_AXIAL_CAPACITY_KN, 0)} kN`}
              onChange={updateNSd}
            />
          </div>

          <fieldset className="curve-angle-count">
            <legend>Discretização angular</legend>
            {ANGLE_COUNTS.map((count) => (
              <button
                key={count}
                type="button"
                className={angleCount === count ? "is-active" : ""}
                aria-pressed={angleCount === count}
                onClick={() => updateAngleCount(count)}
              >
                <strong>{count}</strong><span>Δθ={fmt(360 / count, 1)}°</span>
              </button>
            ))}
          </fieldset>

          <fieldset className="curve-view-picker">
            <legend>Camada exibida</legend>
            {(Object.keys(VIEW_INFO) as ConstructionView[]).map((id) => (
              <button
                key={id}
                type="button"
                className={`${view === id ? "is-active" : ""} is-${VIEW_INFO[id].stage}`}
                aria-pressed={view === id}
                onClick={() => setView(id)}
              >
                {VIEW_INFO[id].short}
              </button>
            ))}
          </fieldset>

          <section className="curve-player">
            <header><span>varredura de θ</span><strong>{complete ? "360° concluídos" : `próximo passo ${safeBuiltAngles + 1}/${totalAngles}`}</strong></header>
            <div className="curve-player-buttons">
              <button type="button" aria-label="Recomeçar construção" onClick={restartConstruction} disabled={safeBuiltAngles <= 1}>
                <RotateCcw size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Remover último ângulo"
                onClick={() => { setPlaying(false); setBuiltAngles((current) => Math.max(1, current - 1)); }}
                disabled={safeBuiltAngles <= 1}
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <button type="button" className="is-play" onClick={togglePlay} disabled={totalAngles <= 1}>
                {playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
                {playing ? "Pausar" : complete ? "Refazer" : "Construir"}
              </button>
              <button
                type="button"
                aria-label="Adicionar próximo ângulo"
                onClick={() => { setPlaying(false); setBuiltAngles((current) => Math.min(totalAngles, current + 1)); }}
                disabled={complete}
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
            <input
              className="curve-progress-input"
              type="range"
              min="1"
              max={totalAngles}
              step="1"
              value={safeBuiltAngles}
              style={progressStyle}
              aria-label="Quantidade de orientações já inseridas"
              aria-valuetext={`${safeBuiltAngles} de ${totalAngles} orientações`}
              onChange={(event) => { setPlaying(false); setBuiltAngles(Number(event.target.value)); }}
            />
            <div className="curve-player-scale"><span>θ=0°</span><span>fechar 360°</span></div>
          </section>

          <PointInspector point={activePoint} />

          <div className="curve-search-summary">
            <span><b>{construction.mechanicalCandidates.length}</b> candidatos mecânicos</span>
            <span><b>{multipleRoots}</b> ângulos com raízes múltiplas</span>
            <span><b>{fmt(construction.maxAxialResidualKn, 5)}</b> kN · resíduo máximo</span>
          </div>

          <button type="button" className="curve-reset-all" onClick={resetAll}>
            <RotateCcw size={15} aria-hidden="true" />Restaurar exemplo principal
          </button>
        </aside>
      </div>

      <LayerExplanation construction={construction} activeView={view} onChange={setView} />

      <section className="curve-mechanics-note">
        <GitBranch size={20} aria-hidden="true" />
        <div>
          <h2>O que realmente gera resistência?</h2>
          <p><b>Somente a cadeia mecânica</b> `θ → estado-limite → raiz t → integração → (Mx,Rd, My,Rd)` produz pontos resistentes. Ordenação polar e fecho convexo trabalham sobre coordenadas já calculadas; nenhum deles resolve equilíbrio, cria domínio ou corrige resíduo axial.</p>
        </div>
        <div className="curve-mechanics-equation">
          <code>ε → σ → F</code><span>→</span><code>N, Mx, My</code><i />
          <code>ordenar / envolver</code><span>≠</span><code>calcular resistência</code>
        </div>
      </section>

      <details className="curve-construction-explanation">
        <summary>Como interpretar coincidências e diferenças entre as quatro camadas?</summary>
        <div>
          <p><b>Uma raiz por θ.</b> Na seção retangular padrão e nos níveis usuais de NSd, a função axial é monotônica ao longo do caminho adotado. Por isso, “todos os candidatos” e “externos selecionados” normalmente possuem a mesma quantidade de pontos.</p>
          <p><b>Ordenar não altera coordenadas.</b> A ordenação polar muda somente a sequência usada para ligar os pontos. Ela é necessária porque θ é a normal da linha neutra, não o ângulo polar do vetor momento.</p>
          <p><b>O fecho convexo pode apagar concavidades.</b> Se algum ponto selecionado ficar dentro da envoltória dos demais, ele não aparece como vértice do fecho — mas continua sendo um estado mecanicamente calculado.</p>
          <p><b>Resolução angular é discretização.</b> Aumentar o número de direções aproxima melhor o contorno, mas também multiplica buscas de raiz e integrações. Não substitui a validação mecânica de cada ponto.</p>
        </div>
      </details>
    </div>
  );
}
