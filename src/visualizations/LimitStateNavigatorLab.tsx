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
  Activity,
  CircleDot,
  Info,
  Pause,
  Play,
  RotateCcw,
  Target,
} from "lucide-react";
import { RangeControl } from "../components/RangeControl";
import {
  LIMIT_STATE_CONCRETE,
  LIMIT_STATE_EPS_SU,
  LIMIT_STATE_STEEL,
  computeLimitStatePath,
  strainAtLimitStateDepth,
  type LimitStateBar,
  type LimitStateDomainId,
  type LimitStatePath,
} from "../core/limitStatePath";
import { getProjectionGeometry, type Point2D } from "../core/projectedGeometry";
import "./limit-states.css";

const RECTANGLE = getProjectionGeometry("rectangle");
const INITIAL_T = 1.28;
const INITIAL_THETA = 35;
const ANGLE_PRESETS = [0, 35, 45, 90];

function fmt(value: number, digits = 2) {
  const normalized = Math.abs(value) < 5e-11 ? 0 : value;
  return normalized.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function signed(value: number, digits = 2) {
  return `${value > 5e-11 ? "+" : ""}${fmt(value, digits)}`;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function domainClass(domainId: LimitStateDomainId) {
  if (["D1_D2", "D2", "D2_D3"].includes(domainId)) return "d2";
  if (["D3", "D3_D4"].includes(domainId)) return "d3";
  if (["D4", "D4_D4A"].includes(domainId)) return "d4";
  if (["D4A", "D4A_D5"].includes(domainId)) return "d4a";
  return "d5";
}

function branchLabel(branch: LimitStatePath["branch"]) {
  if (branch === "steel_pivot") return "steel_pivot";
  if (branch === "concrete_pivot") return "concrete_pivot";
  return "point_c_pivot";
}

function strainStateLabel(state: LimitStateBar["strainState"]) {
  if (state === "yielded_tension") return "tração escoada";
  if (state === "elastic_tension") return "tração elástica";
  if (state === "neutral") return "ε = 0";
  return "compressão";
}

function useContainerWidth(minimum = 300) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(500);
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
  state: LimitStatePath,
  projectionMm: number,
  tangentCoordinateMm = 0,
): Point2D {
  return {
    xMm: state.cosine * projectionMm + state.tangentX * tangentCoordinateMm,
    yMm: state.sine * projectionMm + state.tangentY * tangentCoordinateMm,
  };
}

function barColor(bar: LimitStateBar) {
  if (bar.strainState === "yielded_tension") return "#7766ff";
  if (bar.strainState === "elastic_tension") return "#3e9bea";
  if (bar.strainState === "neutral") return "#f3f8fa";
  if (bar.strainPerMille >= LIMIT_STATE_CONCRETE.epsC2 * 1_000) return "#ff6653";
  return "#ffb34d";
}

function strainColor(strainPerMille: number) {
  if (strainPerMille <= -LIMIT_STATE_EPS_SU * 1_000 + 1e-7) return "#7462ff";
  if (strainPerMille < -LIMIT_STATE_STEEL.epsYd * 1_000) return "#5279f1";
  if (strainPerMille < -1e-7) return "#3fa6ea";
  if (strainPerMille <= 1e-7) return "#f1f7fa";
  if (strainPerMille < LIMIT_STATE_CONCRETE.epsC2 * 1_000) return "#ffbd52";
  return "#ff6653";
}

type SectionStateDiagramProps = { state: LimitStatePath };

function SectionStateDiagram({ state }: SectionStateDiagramProps) {
  const generatedId = useId().replaceAll(":", "");
  const { ref, width } = useContainerWidth();
  const height = width < 430 ? 390 : 455;
  const padding = width < 430 ? 54 : 68;
  const xValues = RECTANGLE.outline.map((point) => point.xMm);
  const yValues = RECTANGLE.outline.map((point) => point.yMm);
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
  const polygonPoints = RECTANGLE.outline.map((point) => `${mapX(point.xMm)},${mapY(point.yMm)}`).join(" ");
  const supportHalfLength = Math.max(spanX, spanY) * 0.72;
  const lineAtDepth = (depthMm: number) => {
    const projection = state.pMaxMm - depthMm;
    const first = pointAtProjection(state, projection, -supportHalfLength);
    const second = pointAtProjection(state, projection, supportHalfLength);
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
  const pointCLine = lineAtDepth(state.pointCDepthMm);
  const outlineWithProjection = RECTANGLE.outline.map((point) => ({
    point,
    projection: point.xMm * state.cosine + point.yMm * state.sine,
  }));
  const topVertex = outlineWithProjection.reduce((best, current) =>
    current.projection > best.projection ? current : best,
  ).point;
  const bottomVertex = outlineWithProjection.reduce((best, current) =>
    current.projection < best.projection ? current : best,
  ).point;
  const normalLengthMm = 95;
  const normalEnd = {
    xMm: state.cosine * normalLengthMm,
    yMm: state.sine * normalLengthMm,
  };
  const zeroOffset = state.neutralAxisInsideSection
    ? clamp(state.neutralAxisDepthMm / state.heightMm, 0, 1)
    : null;
  const topColor = strainColor(state.epsTop * 1_000);
  const bottomColor = strainColor(state.epsBottom * 1_000);
  const steelPivotBars = state.bars.filter((bar) => bar.isSteelPivotReference);
  const steelPivotLabelBar = steelPivotBars[0];

  return (
    <div className="limit-svg-wrap" ref={ref}>
      <svg
        className="limit-section-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${generatedId}-title ${generatedId}-description`}
      >
        <title id={`${generatedId}-title`}>Seção com deformações e pivô {state.pivotLabel}</title>
        <desc id={`${generatedId}-description`}>
          Mapa linear de deformações, linha neutra e barras para t igual a {fmt(state.input.t, 3)}.
        </desc>
        <defs>
          <linearGradient
            id={`${generatedId}-strain-gradient`}
            gradientUnits="userSpaceOnUse"
            x1={mapX(state.cosine * state.pMaxMm)}
            y1={mapY(state.sine * state.pMaxMm)}
            x2={mapX(state.cosine * state.pMinMm)}
            y2={mapY(state.sine * state.pMinMm)}
          >
            <stop offset="0" stopColor={topColor} stopOpacity="0.76" />
            {zeroOffset !== null && zeroOffset > 0.01 && zeroOffset < 0.99 && (
              <>
                <stop offset={Math.max(0, zeroOffset - 0.018)} stopColor={topColor} stopOpacity="0.48" />
                <stop offset={zeroOffset} stopColor="#f1f7fa" stopOpacity="0.2" />
                <stop offset={Math.min(1, zeroOffset + 0.018)} stopColor={bottomColor} stopOpacity="0.46" />
              </>
            )}
            <stop offset="1" stopColor={bottomColor} stopOpacity="0.72" />
          </linearGradient>
          <clipPath id={`${generatedId}-section-clip`}>
            <polygon points={polygonPoints} />
          </clipPath>
          <marker id={`${generatedId}-normal-arrow`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" className="limit-normal-marker" />
          </marker>
        </defs>

        <line className="limit-coordinate-axis" x1={mapX(xMin)} x2={mapX(xMax)} y1={mapY(0)} y2={mapY(0)} />
        <line className="limit-coordinate-axis" x1={mapX(0)} x2={mapX(0)} y1={mapY(yMin)} y2={mapY(yMax)} />
        <text className="limit-coordinate-label" x={mapX(xMax) + 7} y={mapY(0) + 4}>x</text>
        <text className="limit-coordinate-label" x={mapX(0) + 6} y={mapY(yMax) - 8}>y</text>

        <polygon
          className="limit-section-shape"
          points={polygonPoints}
          fill={`url(#${generatedId}-strain-gradient)`}
        />
        <g clipPath={`url(#${generatedId}-section-clip)`}>
          <line className={`limit-point-c-line ${state.branch === "point_c_pivot" ? "is-active" : ""}`} {...pointCLine} />
          {neutralLine && <line className="limit-neutral-axis" {...neutralLine} />}
        </g>

        <line
          className="limit-normal-arrow"
          x1={mapX(0)}
          y1={mapY(0)}
          x2={mapX(normalEnd.xMm)}
          y2={mapY(normalEnd.yMm)}
          markerEnd={`url(#${generatedId}-normal-arrow)`}
        />
        <text className="limit-normal-label" x={mapX(normalEnd.xMm) + 8} y={mapY(normalEnd.yMm) - 7}>
          nθ · {fmt(state.input.thetaDeg, 0)}°
        </text>

        <text className="limit-edge-strain is-top" x={mapX(topVertex.xMm) + 8} y={mapY(topVertex.yMm) - 10}>
          z=0 · εtop={signed(state.epsTop * 1_000, 3)}‰
        </text>
        <text className="limit-edge-strain" x={mapX(bottomVertex.xMm) + 8} y={mapY(bottomVertex.yMm) + 16}>
          z=h · εbottom={signed(state.epsBottom * 1_000, 3)}‰
        </text>

        {neutralLine ? (
          <text
            className="limit-neutral-label"
            x={(neutralLine.x1 + neutralLine.x2) / 2 + 7}
            y={(neutralLine.y1 + neutralLine.y2) / 2 - 7}
          >
            LN · xLN={fmt(state.neutralAxisDepthMm, 1)} mm
          </text>
        ) : (
          <text className="limit-neutral-label is-outside" x={width / 2} y={height - 15} textAnchor="middle">
            LN fora da seção · xLN={Number.isFinite(state.neutralAxisDepthMm) ? `${fmt(state.neutralAxisDepthMm, 1)} mm` : "∞"}
          </text>
        )}

        <text
          className={`limit-point-c-label ${state.branch === "point_c_pivot" ? "is-active" : ""}`}
          x={(pointCLine.x1 + pointCLine.x2) / 2 + 7}
          y={(pointCLine.y1 + pointCLine.y2) / 2 + 14}
        >
          C · zC={fmt(state.pointCDepthMm, 1)} mm · εc2
        </text>

        {state.bars.map((bar) => (
          <circle
            key={bar.id}
            className={`limit-section-bar ${bar.isMinimumStrain ? "is-minimum" : ""} ${bar.isSteelPivotReference ? "is-pivot-reference" : ""}`}
            cx={mapX(bar.xMm)}
            cy={mapY(bar.yMm)}
            r={bar.isMinimumStrain ? 6.4 : 4.8}
            fill={barColor(bar)}
          >
            <title>{bar.id}: z={fmt(bar.depthMm, 1)} mm; ε={signed(bar.strainPerMille, 3)}‰</title>
          </circle>
        ))}

        {state.branch === "steel_pivot" && steelPivotLabelBar && (
          <text
            className="limit-pivot-callout is-a"
            x={mapX(steelPivotLabelBar.xMm) + 9}
            y={mapY(steelPivotLabelBar.yMm) - 10}
          >
            A · εs=−εsu
          </text>
        )}
        {state.branch === "concrete_pivot" && (
          <text className="limit-pivot-callout is-b" x={mapX(topVertex.xMm) + 8} y={mapY(topVertex.yMm) + 17}>
            B · εc=εcu
          </text>
        )}
        {state.branch === "point_c_pivot" && (
          <text
            className="limit-pivot-callout is-c"
            x={(pointCLine.x1 + pointCLine.x2) / 2 + 7}
            y={(pointCLine.y1 + pointCLine.y2) / 2 - 8}
          >
            pivô C · ε=εc2
          </text>
        )}
      </svg>
    </div>
  );
}

type StrainDiagramProps = { state: LimitStatePath };

function StrainDiagram({ state }: StrainDiagramProps) {
  const generatedId = useId().replaceAll(":", "");
  const { ref, width } = useContainerWidth();
  const height = width < 430 ? 390 : 455;
  const margin = { top: 53, right: 34, bottom: 46, left: 70 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const specialStrains = [
    -LIMIT_STATE_EPS_SU * 1_000,
    -LIMIT_STATE_STEEL.epsYd * 1_000,
    0,
    LIMIT_STATE_CONCRETE.epsC2 * 1_000,
    LIMIT_STATE_CONCRETE.epsCu * 1_000,
  ];
  const allValues = [
    state.epsTop * 1_000,
    state.epsBottom * 1_000,
    ...state.bars.map((bar) => bar.strainPerMille),
    ...specialStrains,
  ];
  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  const padding = Math.max(0.7, (rawMax - rawMin) * 0.08);
  const xMin = rawMin - padding;
  const xMax = rawMax + padding;
  const xScale = (strainPerMille: number) =>
    margin.left + (strainPerMille - xMin) / (xMax - xMin) * plotWidth;
  const yScale = (depthMm: number) => margin.top + depthMm / state.heightMm * plotHeight;
  const linePath = `M${xScale(state.epsTop * 1_000)},${yScale(0)} L${xScale(state.epsBottom * 1_000)},${yScale(state.heightMm)}`;
  const pivotX = xScale(state.pivotStrain * 1_000);
  const pivotY = yScale(state.pivotDepthMm);
  const xTicks = Array.from({ length: 5 }, (_, index) => xMin + (xMax - xMin) * index / 4);
  const referenceLines = [
    { id: "su", value: -LIMIT_STATE_EPS_SU * 1_000, label: "−εsu", className: "is-su", lane: 0 },
    { id: "yd", value: -LIMIT_STATE_STEEL.epsYd * 1_000, label: "−εyd", className: "is-yd", lane: 1 },
    { id: "zero", value: 0, label: "0", className: "is-zero", lane: 0 },
    { id: "c2", value: LIMIT_STATE_CONCRETE.epsC2 * 1_000, label: "εc2", className: "is-c2", lane: 1 },
    { id: "cu", value: LIMIT_STATE_CONCRETE.epsCu * 1_000, label: "εcu", className: "is-cu", lane: 0 },
  ];

  return (
    <div className="limit-svg-wrap" ref={ref}>
      <svg
        className="limit-strain-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${generatedId}-title ${generatedId}-description`}
      >
        <title id={`${generatedId}-title`}>Diagrama linear de deformações ao longo de z</title>
        <desc id={`${generatedId}-description`}>
          Perfil de deformações, limites do concreto e do aço, barras e pivô {state.pivotLabel}.
        </desc>
        <defs>
          <clipPath id={`${generatedId}-plot-clip`}>
            <rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} />
          </clipPath>
        </defs>

        <g clipPath={`url(#${generatedId}-plot-clip)`}>
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
            <line
              key={fraction}
              className="limit-chart-grid"
              x1={margin.left}
              x2={margin.left + plotWidth}
              y1={yScale(state.heightMm * fraction)}
              y2={yScale(state.heightMm * fraction)}
            />
          ))}
          {referenceLines.map((reference) => (
            <line
              key={reference.id}
              className={`limit-strain-reference ${reference.className}`}
              x1={xScale(reference.value)}
              x2={xScale(reference.value)}
              y1={margin.top}
              y2={margin.top + plotHeight}
            />
          ))}
          <line
            className="limit-depth-reference is-d"
            x1={margin.left}
            x2={margin.left + plotWidth}
            y1={yScale(state.effectiveDepthMm)}
            y2={yScale(state.effectiveDepthMm)}
          />
          <line
            className={`limit-depth-reference is-c ${state.branch === "point_c_pivot" ? "is-active" : ""}`}
            x1={margin.left}
            x2={margin.left + plotWidth}
            y1={yScale(state.pointCDepthMm)}
            y2={yScale(state.pointCDepthMm)}
          />
          {state.neutralAxisInsideSection && (
            <line
              className="limit-depth-reference is-ln"
              x1={margin.left}
              x2={margin.left + plotWidth}
              y1={yScale(state.neutralAxisDepthMm)}
              y2={yScale(state.neutralAxisDepthMm)}
            />
          )}
          <path className="limit-strain-profile" d={linePath} />
        </g>

        <rect className="limit-chart-frame" x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} />

        {referenceLines.map((reference) => (
          <text
            key={`label-${reference.id}`}
            className={`limit-reference-label ${reference.className}`}
            x={xScale(reference.value)}
            y={reference.lane === 0 ? margin.top - 29 : margin.top - 14}
            textAnchor="middle"
          >
            {reference.label}
          </text>
        ))}

        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
          <text
            key={`z-${fraction}`}
            className="limit-axis-tick"
            x={margin.left - 9}
            y={yScale(state.heightMm * fraction) + 4}
            textAnchor="end"
          >
            {fmt(state.heightMm * fraction, 0)}
          </text>
        ))}
        {xTicks.map((value) => (
          <text
            key={`eps-${value}`}
            className="limit-axis-tick"
            x={xScale(value)}
            y={margin.top + plotHeight + 19}
            textAnchor="middle"
          >
            {signed(value, 1)}
          </text>
        ))}
        <text className="limit-axis-title" x={margin.left + plotWidth / 2} y={height - 7} textAnchor="middle">
          deformação ε [‰]
        </text>
        <text
          className="limit-axis-title"
          x="15"
          y={margin.top + plotHeight / 2}
          textAnchor="middle"
          transform={`rotate(-90 15 ${margin.top + plotHeight / 2})`}
        >
          profundidade projetada z [mm]
        </text>

        <text className="limit-depth-label is-d" x={margin.left + plotWidth - 5} y={yScale(state.effectiveDepthMm) - 5} textAnchor="end">
          d · barra extrema
        </text>
        <text className={`limit-depth-label is-c ${state.branch === "point_c_pivot" ? "is-active" : ""}`} x={margin.left + 5} y={yScale(state.pointCDepthMm) - 5}>
          C · zC
        </text>
        {state.neutralAxisInsideSection && (
          <text className="limit-depth-label is-ln" x={margin.left + 5} y={yScale(state.neutralAxisDepthMm) - 5}>
            LN · ε=0
          </text>
        )}

        {state.bars.map((bar) => (
          <circle
            key={bar.id}
            className={`limit-strain-bar ${bar.isMinimumStrain ? "is-minimum" : ""}`}
            cx={xScale(bar.strainPerMille)}
            cy={yScale(bar.depthMm)}
            r={bar.isMinimumStrain ? 6 : 4.1}
            fill={barColor(bar)}
          >
            <title>{bar.id}: ε={signed(bar.strainPerMille, 3)}‰ em z={fmt(bar.depthMm, 1)} mm</title>
          </circle>
        ))}

        <path
          className={`limit-active-pivot is-${state.pivotLabel.toLowerCase()}`}
          d={`M${pivotX},${pivotY - 8} L${pivotX + 8},${pivotY} L${pivotX},${pivotY + 8} L${pivotX - 8},${pivotY} Z`}
        />
        <text className="limit-active-pivot-label" x={pivotX + 11} y={pivotY - 10}>
          pivô {state.pivotLabel}
        </text>
        <text className="limit-profile-end-label" x={xScale(state.epsTop * 1_000) + 8} y={yScale(0) + 14}>
          εtop
        </text>
        <text className="limit-profile-end-label" x={xScale(state.epsBottom * 1_000) + 8} y={yScale(state.heightMm) - 8}>
          εbottom
        </text>
      </svg>
    </div>
  );
}

function StateMetric({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`limit-state-metric ${emphasis ? "is-emphasis" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BranchFormula({ state }: { state: LimitStatePath }) {
  if (state.branch === "steel_pivot") {
    return (
      <div className="limit-branch-formula is-a">
        <span>Pivô A · aço</span>
        <code>ε(d) = −εsu = −10‰</code>
        <code>εtop = t · εcu</code>
        <p>A reta gira em torno da barra extrema.</p>
      </div>
    );
  }
  if (state.branch === "concrete_pivot") {
    return (
      <div className="limit-branch-formula is-b">
        <span>Pivô B · concreto</span>
        <code>εtop = εcu = +3,5‰</code>
        <code>xLN = x23 + (t−1)(h−x23)</code>
        <p>A linha neutra avança enquanto a borda comprimida permanece fixa.</p>
      </div>
    );
  }
  return (
    <div className="limit-branch-formula is-c">
      <span>Pivô C · compressão</span>
      <code>zC = (1−εc2/εcu)h</code>
      <code>ε(zC) = εc2 = +2‰</code>
      <p>A reta gira em torno de C até se tornar horizontal.</p>
    </div>
  );
}

function SteelComparison({ state }: { state: LimitStatePath }) {
  const minimum = -LIMIT_STATE_EPS_SU * 1_000;
  const maximum = LIMIT_STATE_CONCRETE.epsCu * 1_000;
  const current = clamp(state.minimumSteelStrain * 1_000, minimum, maximum);
  const threshold = -LIMIT_STATE_STEEL.epsYd * 1_000;
  const currentPosition = (current - minimum) / (maximum - minimum) * 100;
  const thresholdPosition = (threshold - minimum) / (maximum - minimum) * 100;
  const comparison = current < threshold - 1e-7
    ? "εs,min < −εyd · aço escoado à tração"
    : current < -1e-7
      ? "−εyd < εs,min < 0 · tração elástica"
      : "εs,min ≥ 0 · todas as barras comprimidas";
  return (
    <section className="limit-steel-comparison">
      <header>
        <span>Barra mais tracionada</span>
        <strong>{state.minimumStrainBarIds.join(", ")}</strong>
      </header>
      <div className="limit-steel-gauge" aria-label={comparison}>
        <div className="limit-steel-gauge-track" />
        <i className="limit-steel-threshold" style={{ left: `${thresholdPosition}%` }}>
          <span>−εyd<br />{signed(threshold, 3)}‰</span>
        </i>
        <i className="limit-steel-current" style={{ left: `${currentPosition}%` }}>
          <span>εs,min<br />{signed(current, 3)}‰</span>
        </i>
      </div>
      <p>{comparison}</p>
    </section>
  );
}

type DomainNavigatorProps = {
  state: LimitStatePath;
  t: number;
  playing: boolean;
  onTChange: (value: number) => void;
  onTogglePlay: () => void;
};

function DomainNavigator({ state, t, playing, onTChange, onTogglePlay }: DomainNavigatorProps) {
  const segments = [
    { id: "d2", label: "D2", start: 0, end: 1 },
    { id: "d3", label: "D3", start: 1, end: state.tD3D4 },
    { id: "d4", label: "D4", start: state.tD3D4, end: state.tD4D4a },
    { id: "d4a", label: "D4a", start: state.tD4D4a, end: 2 },
    { id: "d5", label: "D5", start: 2, end: 3 },
  ];
  const style = { "--limit-t-progress": `${t / 3 * 100}%` } as CSSProperties;

  return (
    <section className="limit-domain-navigator" aria-label="Navegador do parâmetro t">
      <header>
        <div>
          <CircleDot size={19} aria-hidden="true" />
          <div><h2>Navegador dos estados-limites</h2><span>arraste t ou salte diretamente para uma fronteira</span></div>
        </div>
        <div className="limit-t-readout">
          <span>parâmetro</span><strong>t = {fmt(t, 3)}</strong>
        </div>
        <button type="button" className="limit-play-button" onClick={onTogglePlay}>
          {playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
          {playing ? "Pausar" : t >= 3 ? "Recomeçar" : "Percorrer"}
        </button>
      </header>

      <div className="limit-domain-scale">
        <div className="limit-domain-track" aria-hidden="true">
          {segments.map((segment) => (
            <div
              key={segment.id}
              className={`limit-domain-segment is-${segment.id}`}
              style={{ left: `${segment.start / 3 * 100}%`, width: `${(segment.end - segment.start) / 3 * 100}%` }}
            >
              <span>{segment.label}</span>
            </div>
          ))}
          <i className="limit-current-t-line" style={{ left: `${t / 3 * 100}%` }} />
        </div>
        <input
          className="limit-t-input"
          type="range"
          min="0"
          max="3"
          step="0.001"
          value={t}
          style={style}
          aria-label="Parâmetro t do caminho dos estados-limites"
          aria-valuetext={`t igual a ${fmt(t, 3)}, ${state.domainLabel}`}
          onChange={(event) => onTChange(Number(event.target.value))}
        />
        <div className="limit-boundary-layer">
          {state.boundaries.map((boundary, index) => (
            <button
              key={boundary.id}
              type="button"
              className={`limit-boundary-marker ${index % 2 === 0 ? "is-upper" : "is-lower"} ${boundary.t === 0 ? "is-first" : ""} ${boundary.t === 3 ? "is-last" : ""}`}
              style={{ left: `${boundary.t / 3 * 100}%` }}
              onClick={() => onTChange(boundary.t)}
            >
              <span>{boundary.label}</span>
              <small>t={fmt(boundary.t, boundary.t === Math.round(boundary.t) ? 0 : 3)}</small>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClassificationPanel({ state }: { state: LimitStatePath }) {
  const rules = [
    {
      id: "d3",
      title: "D3",
      relation: "εs,min ≤ −εyd",
      text: "Existe barra tracionada e ela já escoou.",
      active: state.domainId === "D3" || state.domainId === "D3_D4",
    },
    {
      id: "d4",
      title: "D4",
      relation: "−εyd < εs,min < 0",
      text: "Existe barra tracionada, mas ainda elástica.",
      active: state.domainId === "D4" || state.domainId === "D4_D4A",
    },
    {
      id: "d4a",
      title: "D4a",
      relation: "εs,min ≥ 0",
      text: "Nenhuma barra permanece tracionada.",
      active: state.domainId === "D4A" || state.domainId === "D4A_D5",
    },
  ];
  return (
    <section className="limit-classification-panel">
      <header>
        <div>
          <Target size={19} aria-hidden="true" />
          <div><h2>Classificação pelas deformações reais das barras</h2><p>Durante o pivô B, a geometria fornece zᵢ; a reta fornece εs,i. O menor valor observado decide o domínio.</p></div>
        </div>
        <strong>εs,min = {signed(state.minimumSteelStrain * 1_000, 3)}‰</strong>
      </header>
      <div className="limit-classification-rules">
        {rules.map((rule) => (
          <article key={rule.id} className={`is-${rule.id} ${rule.active ? "is-active" : ""}`}>
            <span>{rule.title}</span>
            <code>{rule.relation}</code>
            <p>{rule.text}</p>
          </article>
        ))}
      </div>
      <div className="limit-bar-readings">
        {state.bars.map((bar) => (
          <article key={bar.id} className={`${bar.isMinimumStrain ? "is-minimum" : ""} is-${bar.strainState}`}>
            <header><strong>{bar.id}</strong><span>z={fmt(bar.depthMm, 1)} mm</span></header>
            <b>{signed(bar.strainPerMille, 3)}‰</b>
            <small>{strainStateLabel(bar.strainState)}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function LimitStateNavigatorLab() {
  const [t, setT] = useState(INITIAL_T);
  const [thetaDeg, setThetaDeg] = useState(INITIAL_THETA);
  const [playing, setPlaying] = useState(false);
  const state = useMemo(() => computeLimitStatePath({ t, thetaDeg }), [t, thetaDeg]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setT((current) => {
        return Math.min(3, current + 0.008);
      });
    }, 48);
    return () => window.clearInterval(timer);
  }, [playing]);

  useEffect(() => {
    if (playing && t >= 3) setPlaying(false);
  }, [playing, t]);

  const updateT = (value: number) => {
    setPlaying(false);
    setT(clamp(value, 0, 3));
  };
  const togglePlay = () => {
    if (!playing && t >= 3) setT(0);
    setPlaying((current) => !current);
  };
  const xLnText = Number.isFinite(state.neutralAxisDepthMm)
    ? `${fmt(state.neutralAxisDepthMm, 1)} mm${state.neutralAxisInsideSection ? "" : " · fora"}`
    : "∞ · curvatura nula";
  const currentAtC = strainAtLimitStateDepth(state, state.pointCDepthMm) * 1_000;

  return (
    <div className="lab-shell limit-state-lab">
      <div className="limit-state-status">
        <div className={`limit-domain-badge is-${domainClass(state.domainId)}`}>
          <span>estado atual</span><strong>{state.domainLabel}</strong>
        </div>
        <div className="limit-status-copy">
          <h2>{state.domainExplanation}</h2>
          <p>A reta permanece compatível em toda a seção; mudam apenas o pivô e a rotação.</p>
        </div>
        <div className="limit-branch-badge">
          <span>ramo do algoritmo</span>
          <code>{branchLabel(state.branch)}</code>
        </div>
      </div>

      <div className="limit-state-main">
        <section className="limit-visual-panel" aria-label="Seção e mapa de deformações">
          <header>
            <span>1</span>
            <div><h2>Seção e mapa de deformações</h2><p>A cor e as barras seguem a mesma reta ε(z).</p></div>
          </header>
          <SectionStateDiagram state={state} />
          <div className="limit-section-legend">
            <span><i className="is-compression" />compressão</span>
            <span><i className="is-zero" />ε=0</span>
            <span><i className="is-tension" />tração</span>
            <span><i className="is-critical" />barra de ε mínimo</span>
          </div>
        </section>

        <section className="limit-visual-panel" aria-label="Diagrama de deformações ao longo de z">
          <header>
            <span>2</span>
            <div><h2>Diagrama ε(z) e pivô ativo</h2><p>O losango indica o ponto que permanece fixo no ramo.</p></div>
          </header>
          <StrainDiagram state={state} />
          <div className="limit-pivot-summary">
            <span>Pivô {state.pivotLabel}</span>
            <code>z={fmt(state.pivotDepthMm, 1)} mm</code>
            <code>ε={signed(state.pivotStrain * 1_000, 3)}‰</code>
          </div>
        </section>

        <aside className="limit-state-controls" aria-label="Parâmetros e leituras do estado atual">
          <div className="limit-controls-heading">
            <Activity size={19} aria-hidden="true" />
            <div><h2>Leitura do estado</h2><span>seção 30 × 60 cm · C30 · CA-50</span></div>
          </div>

          <div className="limit-angle-presets" aria-label="Direções usuais da normal">
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
          <div className="limit-theta-control">
            <RangeControl
              id="limit-state-theta"
              label="Normal à linha neutra"
              symbol="θ"
              value={thetaDeg}
              min={0}
              max={180}
              step={1}
              unit="°"
              signed={false}
              fractionDigits={0}
              onChange={setThetaDeg}
            />
          </div>

          <div className="limit-state-metrics">
            <StateMetric label="h projetado" value={`${fmt(state.heightMm, 1)} mm`} />
            <StateMetric label="d · barra extrema" value={`${fmt(state.effectiveDepthMm, 1)} mm`} />
            <StateMetric label="x23" value={`${fmt(state.x23Mm, 1)} mm`} emphasis />
            <StateMetric label="xLN" value={xLnText} emphasis />
            <StateMetric label="εtop" value={`${signed(state.epsTop * 1_000, 3)}‰`} />
            <StateMetric label="εbottom" value={`${signed(state.epsBottom * 1_000, 3)}‰`} />
            <StateMetric label="inclinação" value={`${signed(state.slopePerMm * 1e6, 3)}‰/m`} />
            <StateMetric label="ε no ponto C" value={`${signed(currentAtC, 3)}‰`} />
          </div>

          <section className="limit-x23-formula">
            <span>Fronteira D2–D3</span>
            <code>x23 = εcu·d / (εcu + εsu)</code>
            <code>= 3,5·{fmt(state.effectiveDepthMm, 1)} / (3,5 + 10)</code>
            <strong>= {fmt(state.x23Mm, 1)} mm</strong>
          </section>

          <BranchFormula state={state} />
          <SteelComparison state={state} />

          <section className="limit-pivot-note">
            <Info size={16} aria-hidden="true" />
            <p><b>d</b> é a profundidade da barra extrema que ancora o pivô A. Se várias barras têm o mesmo z, todas compartilham o pivô.</p>
          </section>

          <button
            className="limit-reset"
            type="button"
            onClick={() => {
              setPlaying(false);
              setT(INITIAL_T);
              setThetaDeg(INITIAL_THETA);
            }}
          >
            <RotateCcw size={15} aria-hidden="true" />Restaurar exemplo
          </button>
        </aside>
      </div>

      <DomainNavigator
        state={state}
        t={t}
        playing={playing}
        onTChange={updateT}
        onTogglePlay={togglePlay}
      />

      <ClassificationPanel state={state} />

      <details className="limit-state-explanation">
        <summary>Como o algoritmo percorre o caminho completo</summary>
        <div>
          <p><b>0 ≤ t ≤ 1 · pivô A:</b> a barra extrema permanece em −εsu. A borda comprimida evolui de zero até εcu.</p>
          <p><b>1 ≤ t ≤ 2 · pivô B:</b> εtop permanece em εcu. A linha neutra avança de x23 até h, atravessando D3, D4 e D4a.</p>
          <p><b>2 ≤ t ≤ 3 · pivô C:</b> o ponto situado em zC mantém εc2. A linha neutra sai da seção e a curvatura tende a zero.</p>
          <p><b>Classificação real:</b> D3, D4 e D4a são decididos por min(εs,i), calculado nas posições projetadas das barras, não por uma divisão arbitrária de xLN.</p>
        </div>
      </details>
    </div>
  );
}
