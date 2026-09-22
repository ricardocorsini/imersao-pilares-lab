import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Compass, Info, MoveRight, RotateCcw, Ruler } from "lucide-react";
import { RangeControl } from "../components/RangeControl";
import {
  PROJECTION_GEOMETRIES,
  computeProjectedGeometry,
  type Point2D,
  type ProjectedGeometryBar,
  type ProjectedGeometryState,
  type ProjectionGeometryDefinition,
} from "../core/projectedGeometry";
import "./projected-geometry.css";

type GeometryId = ProjectionGeometryDefinition["id"];

const INITIAL = {
  geometryId: "rectangle" as GeometryId,
  thetaDeg: 35,
  neutralAxisPercent: 38,
  momentAngleDeg: 70,
  selectedBarId: "B8",
};

const ANGLE_PRESETS = [0, 30, 45, 60, 90];

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

function angularSeparation(firstDeg: number, secondDeg: number) {
  const difference = Math.abs(firstDeg - secondDeg) % 360;
  return Math.min(difference, 360 - difference);
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
  state: ProjectedGeometryState,
  projectionMm: number,
  tangentCoordinateMm = 0,
): Point2D {
  return {
    xMm: state.cosine * projectionMm + state.tangentX * tangentCoordinateMm,
    yMm: state.sine * projectionMm + state.tangentY * tangentCoordinateMm,
  };
}

type SectionDiagramProps = {
  state: ProjectedGeometryState;
  momentAngleDeg: number;
  selectedBarId: string;
  onSelectBar: (barId: string) => void;
};

function SectionDiagram({ state, momentAngleDeg, selectedBarId, onSelectBar }: SectionDiagramProps) {
  const generatedId = useId().replaceAll(":", "");
  const { ref, width } = useContainerWidth();
  const height = width < 460 ? 390 : 440;
  const padding = width < 460 ? 46 : 62;
  const xValues = state.geometry.outline.map((point) => point.xMm);
  const yValues = state.geometry.outline.map((point) => point.yMm);
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
  const polygonPoints = state.geometry.outline
    .map((point) => `${mapX(point.xMm)},${mapY(point.yMm)}`)
    .join(" ");
  const tangentCoordinates = state.geometry.outline.map(
    (point) => point.xMm * state.tangentX + point.yMm * state.tangentY,
  );
  const tangentExtent = Math.max(...tangentCoordinates) - Math.min(...tangentCoordinates);
  const supportHalfLength = Math.max(spanX, spanY, tangentExtent) * 0.78;
  const lineAtProjection = (projectionMm: number) => {
    const first = pointAtProjection(state, projectionMm, -supportHalfLength);
    const second = pointAtProjection(state, projectionMm, supportHalfLength);
    return {
      x1: mapX(first.xMm),
      y1: mapY(first.yMm),
      x2: mapX(second.xMm),
      y2: mapY(second.yMm),
    };
  };
  const pMaxLine = lineAtProjection(state.pMaxMm);
  const pMinLine = lineAtProjection(state.pMinMm);
  const neutralLine = lineAtProjection(state.neutralAxisProjectionMm);
  const normalLength = Math.min(spanX, spanY) * 0.3;
  const normalEnd = {
    xMm: state.cosine * normalLength,
    yMm: state.sine * normalLength,
  };
  const momentRad = momentAngleDeg * Math.PI / 180;
  const momentLength = normalLength * 1.12;
  const momentEnd = {
    xMm: Math.cos(momentRad) * momentLength,
    yMm: Math.sin(momentRad) * momentLength,
  };
  const arcRadius = normalLength * 0.56;
  const arcPoints = Array.from({ length: 25 }, (_, index) => {
    const angle = state.thetaRad * index / 24;
    return {
      xMm: Math.cos(angle) * arcRadius,
      yMm: Math.sin(angle) * arcRadius,
    };
  });
  const arcPath = arcPoints
    .map((point, index) => `${index === 0 ? "M" : "L"}${mapX(point.xMm)},${mapY(point.yMm)}`)
    .join(" ");
  const thetaLabelAngle = state.thetaRad / 2;
  const thetaLabel = {
    xMm: Math.cos(thetaLabelAngle) * arcRadius * 1.28,
    yMm: Math.sin(thetaLabelAngle) * arcRadius * 1.28,
  };
  const ratio = state.input.neutralAxisRatio;
  const neutralOffset = Math.min(1, Math.max(0, ratio));
  const centroid = state.tensileCentroid;
  const centroidProjection = state.tensileCentroidProjectionMm;
  const topAtCentroid = centroid && centroidProjection !== null
    ? {
      xMm: centroid.xMm + state.cosine * (state.pMaxMm - centroidProjection),
      yMm: centroid.yMm + state.sine * (state.pMaxMm - centroidProjection),
    }
    : null;

  return (
    <div className="geometry-svg-wrap" ref={ref}>
      <svg
        className="geometry-section-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${generatedId}-title ${generatedId}-description`}
      >
        <title id={`${generatedId}-title`}>Seção, direção normal e linha neutra</title>
        <desc id={`${generatedId}-description`}>
          Seção {state.geometry.shortLabel}, direção normal em {fmt(state.input.thetaDeg, 0)} graus,
          linha neutra, bordas projetadas e barras.
        </desc>
        <defs>
          <linearGradient
            id={`${generatedId}-strain-field`}
            gradientUnits="userSpaceOnUse"
            x1={mapX(state.cosine * state.pMaxMm)}
            y1={mapY(state.sine * state.pMaxMm)}
            x2={mapX(state.cosine * state.pMinMm)}
            y2={mapY(state.sine * state.pMinMm)}
          >
            <stop offset="0" stopColor="#ff7355" stopOpacity="0.68" />
            <stop offset={Math.max(0, neutralOffset - 0.025)} stopColor="#ff9b6f" stopOpacity="0.46" />
            <stop offset={neutralOffset} stopColor="#f4f9fb" stopOpacity="0.17" />
            <stop offset={Math.min(1, neutralOffset + 0.025)} stopColor="#5ba2ef" stopOpacity="0.42" />
            <stop offset="1" stopColor="#287fe8" stopOpacity="0.62" />
          </linearGradient>
          <marker id={`${generatedId}-cyan-arrow`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" className="geometry-marker-cyan" />
          </marker>
          <marker id={`${generatedId}-moment-arrow`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" className="geometry-marker-moment" />
          </marker>
          <marker id={`${generatedId}-dimension-start`} markerWidth="7" markerHeight="7" refX="1" refY="3.5" orient="auto">
            <path d="M7,0 L0,3.5 L7,7 Z" className="geometry-marker-dimension" />
          </marker>
          <marker id={`${generatedId}-dimension-end`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 Z" className="geometry-marker-dimension" />
          </marker>
        </defs>

        <line className="geometry-coordinate-axis" x1={mapX(xMin)} x2={mapX(xMax)} y1={mapY(0)} y2={mapY(0)} />
        <line className="geometry-coordinate-axis" x1={mapX(0)} x2={mapX(0)} y1={mapY(yMin)} y2={mapY(yMax)} />
        <text className="geometry-coordinate-label" x={mapX(xMax) + 7} y={mapY(0) + 4}>x</text>
        <text className="geometry-coordinate-label" x={mapX(0) + 6} y={mapY(yMax) - 8}>y</text>

        <polygon points={polygonPoints} fill={`url(#${generatedId}-strain-field)`} className="geometry-section-shape" />
        <line className="geometry-extreme-line is-max" {...pMaxLine} />
        <line className="geometry-extreme-line is-min" {...pMinLine} />
        <line className="geometry-ln-line" {...neutralLine} />

        <text className="geometry-line-label is-max" x={pMaxLine.x2} y={pMaxLine.y2 - 7}>pmax · z=0</text>
        <text className="geometry-line-label" x={pMinLine.x1} y={pMinLine.y1 + 14}>pmin · z=h</text>
        <text
          className="geometry-ln-label"
          x={(neutralLine.x1 + neutralLine.x2) / 2 + 7}
          y={(neutralLine.y1 + neutralLine.y2) / 2 - 7}
        >
          LN · p=pLN
        </text>

        <path className="geometry-theta-arc" d={arcPath} />
        <text className="geometry-theta-label" x={mapX(thetaLabel.xMm)} y={mapY(thetaLabel.yMm)}>
          θ={fmt(state.input.thetaDeg, 0)}°
        </text>
        <line
          className="geometry-normal-arrow"
          x1={mapX(0)}
          y1={mapY(0)}
          x2={mapX(normalEnd.xMm)}
          y2={mapY(normalEnd.yMm)}
          markerEnd={`url(#${generatedId}-cyan-arrow)`}
        />
        <text className="geometry-normal-label" x={mapX(normalEnd.xMm) + 8} y={mapY(normalEnd.yMm) - 7}>
          nθ · normal à LN
        </text>
        <line
          className="geometry-moment-arrow"
          x1={mapX(0)}
          y1={mapY(0)}
          x2={mapX(momentEnd.xMm)}
          y2={mapY(momentEnd.yMm)}
          markerEnd={`url(#${generatedId}-moment-arrow)`}
        />
        <text className="geometry-moment-label" x={mapX(momentEnd.xMm) + 8} y={mapY(momentEnd.yMm) + 14}>
          MR · φM={fmt(momentAngleDeg, 0)}°
        </text>

        {topAtCentroid && centroid && state.effectiveDepthMm !== null && (
          <g>
            <line
              className="geometry-effective-depth"
              x1={mapX(topAtCentroid.xMm)}
              y1={mapY(topAtCentroid.yMm)}
              x2={mapX(centroid.xMm)}
              y2={mapY(centroid.yMm)}
              markerStart={`url(#${generatedId}-dimension-start)`}
              markerEnd={`url(#${generatedId}-dimension-end)`}
            />
            <text
              className="geometry-d-label"
              x={(mapX(topAtCentroid.xMm) + mapX(centroid.xMm)) / 2 + 8}
              y={(mapY(topAtCentroid.yMm) + mapY(centroid.yMm)) / 2 - 7}
            >
              d={fmt(state.effectiveDepthMm, 1)} mm
            </text>
            <path
              className="geometry-tension-centroid"
              d={`M${mapX(centroid.xMm) - 6},${mapY(centroid.yMm)} h12 M${mapX(centroid.xMm)},${mapY(centroid.yMm) - 6} v12`}
            />
          </g>
        )}

        {state.bars.map((bar) => {
          const selected = bar.id === selectedBarId;
          return (
            <g key={bar.id}>
              <circle
                className={`geometry-rebar is-${bar.side} ${selected ? "is-selected" : ""}`}
                cx={mapX(bar.xMm)}
                cy={mapY(bar.yMm)}
                r={selected ? 7 : 5.2}
                tabIndex={0}
                role="button"
                aria-label={`Selecionar ${bar.id}, profundidade ${fmt(bar.depthMm, 1)} milímetros`}
                onClick={() => onSelectBar(bar.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectBar(bar.id);
                  }
                }}
              >
                <title>{bar.id}: p={signed(bar.projectionMm, 1)} mm; z={fmt(bar.depthMm, 1)} mm</title>
              </circle>
              {selected && (
                <text className="geometry-selected-bar-label" x={mapX(bar.xMm) + 9} y={mapY(bar.yMm) - 9}>
                  {bar.id} · z={fmt(bar.depthMm, 1)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

type ProjectionRulerProps = {
  state: ProjectedGeometryState;
  selectedBarId: string;
  onSelectBar: (barId: string) => void;
};

function ProjectionRuler({ state, selectedBarId, onSelectBar }: ProjectionRulerProps) {
  const generatedId = useId().replaceAll(":", "");
  const { ref, width } = useContainerWidth();
  const height = width < 460 ? 375 : 340;
  const margin = { left: 56, right: 56 };
  const plotWidth = width - margin.left - margin.right;
  const mapP = (projectionMm: number) =>
    margin.left + (projectionMm - state.pMinMm) / state.heightMm * plotWidth;
  const yP = 96;
  const yZ = width < 460 ? 235 : 218;
  const pLnX = mapP(state.neutralAxisProjectionMm);
  const dX = state.tensileCentroidProjectionMm === null
    ? null
    : mapP(state.tensileCentroidProjectionMm);
  const selectedBar = state.bars.find((bar) => bar.id === selectedBarId) ?? state.bars[0];
  const fractions = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="geometry-svg-wrap" ref={ref}>
      <svg
        className="geometry-projection-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${generatedId}-title ${generatedId}-description`}
      >
        <title id={`${generatedId}-title`}>Projeção da seção nos eixos p e z</title>
        <desc id={`${generatedId}-description`}>
          O eixo p cresce da esquerda para a direita e o eixo z cresce no sentido oposto,
          pois z é igual a p máximo menos p.
        </desc>
        <defs>
          <marker id={`${generatedId}-axis-right`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" className="geometry-ruler-marker" />
          </marker>
          <marker id={`${generatedId}-axis-left`} markerWidth="8" markerHeight="8" refX="1" refY="4" orient="auto">
            <path d="M8,0 L0,4 L8,8 Z" className="geometry-ruler-marker" />
          </marker>
          <marker id={`${generatedId}-dim-start`} markerWidth="7" markerHeight="7" refX="1" refY="3.5" orient="auto">
            <path d="M7,0 L0,3.5 L7,7 Z" className="geometry-ruler-dimension-marker" />
          </marker>
          <marker id={`${generatedId}-dim-end`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 Z" className="geometry-ruler-dimension-marker" />
          </marker>
        </defs>

        <line className="geometry-ruler-boundary" x1={margin.left} x2={margin.left} y1="48" y2={yZ + 42} />
        <line className="geometry-ruler-boundary" x1={width - margin.right} x2={width - margin.right} y1="48" y2={yZ + 42} />
        <line className="geometry-ruler-ln" x1={pLnX} x2={pLnX} y1="54" y2={yZ + 46} />

        <line
          className="geometry-ruler-axis"
          x1={margin.left}
          x2={width - margin.right + 13}
          y1={yP}
          y2={yP}
          markerEnd={`url(#${generatedId}-axis-right)`}
        />
        <text className="geometry-ruler-axis-title" x={margin.left} y={yP - 25}>eixo p</text>
        <text className="geometry-ruler-direction" x={width - margin.right} y={yP - 25} textAnchor="end">p cresce →</text>

        <line
          className="geometry-ruler-axis is-z"
          x1={width - margin.right}
          x2={margin.left - 13}
          y1={yZ}
          y2={yZ}
          markerEnd={`url(#${generatedId}-axis-left)`}
        />
        <text className="geometry-ruler-axis-title is-z" x={margin.left} y={yZ - 25}>eixo z</text>
        <text className="geometry-ruler-direction is-z" x={width - margin.right} y={yZ - 25} textAnchor="end">← z cresce</text>

        {fractions.map((fraction) => {
          const x = margin.left + fraction * plotWidth;
          const pValue = state.pMinMm + fraction * state.heightMm;
          const zValue = state.heightMm * (1 - fraction);
          return (
            <g key={fraction}>
              <line className="geometry-ruler-tick" x1={x} x2={x} y1={yP - 5} y2={yP + 5} />
              <text className="geometry-ruler-tick-label" x={x} y={yP + 20} textAnchor="middle">{signed(pValue, 0)}</text>
              <line className="geometry-ruler-tick is-z" x1={x} x2={x} y1={yZ - 5} y2={yZ + 5} />
              <text className="geometry-ruler-tick-label is-z" x={x} y={yZ + 21} textAnchor="middle">{fmt(zValue, 0)}</text>
            </g>
          );
        })}

        <line
          className="geometry-ruler-dimension is-height"
          x1={margin.left}
          x2={width - margin.right}
          y1="39"
          y2="39"
          markerStart={`url(#${generatedId}-dim-start)`}
          markerEnd={`url(#${generatedId}-dim-end)`}
        />
        <text className="geometry-ruler-dimension-label" x={width / 2} y="29" textAnchor="middle">
          h = pmax − pmin = {fmt(state.heightMm, 1)} mm
        </text>

        <line
          className="geometry-ruler-dimension is-neutral"
          x1={pLnX}
          x2={width - margin.right}
          y1={yP + 49}
          y2={yP + 49}
          markerStart={`url(#${generatedId}-dim-start)`}
          markerEnd={`url(#${generatedId}-dim-end)`}
        />
        <text className="geometry-ruler-dimension-label is-neutral" x={(pLnX + width - margin.right) / 2} y={yP + 40} textAnchor="middle">
          xLN = {fmt(state.neutralAxisDepthMm, 1)} mm
        </text>

        {dX !== null && state.effectiveDepthMm !== null && (
          <g>
            <line
              className="geometry-ruler-dimension is-depth"
              x1={dX}
              x2={width - margin.right}
              y1={yZ + 48}
              y2={yZ + 48}
              markerStart={`url(#${generatedId}-dim-start)`}
              markerEnd={`url(#${generatedId}-dim-end)`}
            />
            <path className="geometry-ruler-centroid" d={`M${dX},${yZ - 9} l8,9 -8,9 -8,-9 Z`} />
            <text className="geometry-ruler-dimension-label is-depth" x={(dX + width - margin.right) / 2} y={yZ + 67} textAnchor="middle">
              d = {fmt(state.effectiveDepthMm, 1)} mm
            </text>
          </g>
        )}

        <text className="geometry-ruler-edge-label" x={margin.left} y={yP - 8} textAnchor="start">pmin</text>
        <text className="geometry-ruler-edge-label" x={width - margin.right} y={yP - 8} textAnchor="end">pmax</text>
        <text className="geometry-ruler-edge-label is-z" x={margin.left} y={yZ - 8} textAnchor="start">z=h</text>
        <text className="geometry-ruler-edge-label is-z" x={width - margin.right} y={yZ - 8} textAnchor="end">z=0</text>
        <text className="geometry-ruler-ln-label" x={pLnX + 6} y="65">pLN</text>

        {state.bars.map((bar, index) => {
          const x = mapP(bar.projectionMm);
          const selected = bar.id === selectedBarId;
          const lane = (index % 3 - 1) * 7;
          return (
            <g key={bar.id}>
              <line className={`geometry-bar-guide ${selected ? "is-selected" : ""}`} x1={x} x2={x} y1={yP + 7} y2={yZ - 7} />
              <circle
                className={`geometry-ruler-bar is-${bar.side} ${selected ? "is-selected" : ""}`}
                cx={x}
                cy={yP + lane}
                r={selected ? 6.2 : 4.2}
                tabIndex={0}
                role="button"
                aria-label={`Selecionar ${bar.id}`}
                onClick={() => onSelectBar(bar.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectBar(bar.id);
                  }
                }}
              ><title>{bar.id}: p={signed(bar.projectionMm, 1)} mm</title></circle>
              <circle
                className={`geometry-ruler-bar is-${bar.side} ${selected ? "is-selected" : ""}`}
                cx={x}
                cy={yZ + lane}
                r={selected ? 6.2 : 4.2}
                tabIndex={0}
                role="button"
                aria-label={`Selecionar ${bar.id}`}
                onClick={() => onSelectBar(bar.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectBar(bar.id);
                  }
                }}
              ><title>{bar.id}: z={fmt(bar.depthMm, 1)} mm</title></circle>
            </g>
          );
        })}

        <text className="geometry-selected-projection" x={width / 2} y={height - 16} textAnchor="middle">
          {selectedBar.id}: p={signed(selectedBar.projectionMm, 1)} mm · z=pmax−p={fmt(selectedBar.depthMm, 1)} mm
        </text>
      </svg>
    </div>
  );
}

function GeometryMetric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`geometry-metric ${accent ? "is-accent" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function sideLabel(side: ProjectedGeometryBar["side"]) {
  if (side === "compression") return "compressão";
  if (side === "tension") return "tração";
  return "sobre a LN";
}

export default function ProjectedGeometryLab() {
  const [geometryId, setGeometryId] = useState<GeometryId>(INITIAL.geometryId);
  const [thetaDeg, setThetaDeg] = useState(INITIAL.thetaDeg);
  const [neutralAxisPercent, setNeutralAxisPercent] = useState(INITIAL.neutralAxisPercent);
  const [momentAngleDeg, setMomentAngleDeg] = useState(INITIAL.momentAngleDeg);
  const [selectedBarId, setSelectedBarId] = useState(INITIAL.selectedBarId);
  const state = useMemo(
    () => computeProjectedGeometry({
      geometryId,
      thetaDeg,
      neutralAxisRatio: neutralAxisPercent / 100,
    }),
    [geometryId, thetaDeg, neutralAxisPercent],
  );
  const selectedBar = state.bars.find((bar) => bar.id === selectedBarId) ?? state.bars[0];
  const angleDifference = angularSeparation(thetaDeg, momentAngleDeg);

  const selectGeometry = (id: GeometryId) => {
    setGeometryId(id);
    const geometry = PROJECTION_GEOMETRIES.find((candidate) => candidate.id === id);
    if (geometry) setSelectedBarId(geometry.bars.at(-1)?.id ?? geometry.bars[0].id);
  };

  return (
    <div className="lab-shell projected-geometry-lab">
      <div className="geometry-equation-strip">
        <div><span>1</span><code>nθ = (cosθ, senθ)</code></div>
        <MoveRight size={15} aria-hidden="true" />
        <div><span>2</span><code>p = x cosθ + y senθ</code></div>
        <MoveRight size={15} aria-hidden="true" />
        <div><span>3</span><code>z = pmax − p</code></div>
      </div>

      <div className="geometry-main-grid">
        <section className="geometry-stage" aria-label="Construção geométrica da projeção">
          <div className="geometry-diagram-grid">
            <article className="geometry-diagram-panel">
              <header>
                <span className="geometry-panel-number">A</span>
                <div>
                  <h2>Seção e linha neutra</h2>
                  <p>θ gira a normal; a linha neutra permanece perpendicular a ela.</p>
                </div>
              </header>
              <SectionDiagram
                state={state}
                momentAngleDeg={momentAngleDeg}
                selectedBarId={selectedBar.id}
                onSelectBar={setSelectedBarId}
              />
              <div className="geometry-diagram-legend">
                <span><i className="is-normal" />normal nθ</span>
                <span><i className="is-ln" />linha neutra</span>
                <span><i className="is-moment" />momento de referência</span>
              </div>
            </article>

            <article className="geometry-diagram-panel is-projection">
              <header>
                <span className="geometry-panel-number">B</span>
                <div>
                  <h2>Projeção sobre p e z</h2>
                  <p>As duas escalas usam os mesmos pontos, mas crescem em sentidos opostos.</p>
                </div>
              </header>
              <ProjectionRuler
                state={state}
                selectedBarId={selectedBar.id}
                onSelectBar={setSelectedBarId}
              />
              <div className="geometry-projection-identity">
                <code>pmin ≤ p ≤ pmax</code>
                <strong>⇄</strong>
                <code>0 ≤ z ≤ h</code>
              </div>
            </article>
          </div>
        </section>

        <aside className="geometry-controls" aria-label="Controles da geometria projetada">
          <div className="geometry-controls-title">
            <Compass size={20} aria-hidden="true" />
            <div><h2>Geometria projetada</h2><span>construção ao vivo</span></div>
          </div>

          <div className="geometry-shape-selector" role="group" aria-label="Forma da seção">
            {PROJECTION_GEOMETRIES.map((geometry) => (
              <button
                key={geometry.id}
                type="button"
                className={geometryId === geometry.id ? "is-active" : ""}
                aria-pressed={geometryId === geometry.id}
                onClick={() => selectGeometry(geometry.id)}
              >
                {geometry.shortLabel}
              </button>
            ))}
          </div>
          <p className="geometry-shape-description">{state.geometry.description}</p>

          <div className="geometry-angle-presets" aria-label="Ângulos usuais">
            {ANGLE_PRESETS.map((angle) => (
              <button
                key={angle}
                type="button"
                className={thetaDeg === angle ? "is-active" : ""}
                aria-pressed={thetaDeg === angle}
                onClick={() => setThetaDeg(angle)}
              >
                {angle}°
              </button>
            ))}
          </div>

          <div className="geometry-range-stack">
            <RangeControl
              id="geometry-theta"
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
            <RangeControl
              id="geometry-neutral-axis"
              label="Profundidade relativa da LN"
              symbol="ξ"
              value={neutralAxisPercent}
              min={5}
              max={90}
              step={1}
              unit="% h"
              signed={false}
              fractionDigits={0}
              onChange={setNeutralAxisPercent}
            />
            <RangeControl
              id="geometry-moment-angle"
              label="Momento resultante ilustrativo"
              symbol="φM"
              value={momentAngleDeg}
              min={0}
              max={180}
              step={1}
              unit="°"
              signed={false}
              fractionDigits={0}
              onChange={setMomentAngleDeg}
            />
          </div>

          <section className="geometry-angle-warning" aria-label="Distinção entre theta e o momento">
            <Info size={17} aria-hidden="true" />
            <div>
              <strong>θ não é a direção de M<sub>R</sub></strong>
              <p>θ define a normal à linha neutra. O vetor momento é mostrado separadamente e não controla a projeção.</p>
              <span>separação angular ilustrada: {fmt(angleDifference, 0)}°</span>
            </div>
          </section>

          <div className="geometry-metrics">
            <GeometryMetric label="pmax" value={`${signed(state.pMaxMm, 1)} mm`} />
            <GeometryMetric label="pmin" value={`${signed(state.pMinMm, 1)} mm`} />
            <GeometryMetric label="h = pmax − pmin" value={`${fmt(state.heightMm, 1)} mm`} accent />
            <GeometryMetric label="xLN = ξh" value={`${fmt(state.neutralAxisDepthMm, 1)} mm`} />
            <GeometryMetric
              label="d · centroide As,t"
              value={state.effectiveDepthMm === null ? "não definido" : `${fmt(state.effectiveDepthMm, 1)} mm`}
              accent
            />
            <GeometryMetric label="barras tracionadas" value={`${state.tensileBars.length} de ${state.bars.length}`} />
          </div>

          <button
            className="geometry-reset"
            type="button"
            onClick={() => {
              setGeometryId(INITIAL.geometryId);
              setThetaDeg(INITIAL.thetaDeg);
              setNeutralAxisPercent(INITIAL.neutralAxisPercent);
              setMomentAngleDeg(INITIAL.momentAngleDeg);
              setSelectedBarId(INITIAL.selectedBarId);
            }}
          >
            <RotateCcw size={15} aria-hidden="true" />Restaurar construção
          </button>
        </aside>
      </div>

      <section className="geometry-selected-bar" aria-label={`Leitura da barra ${selectedBar.id}`}>
        <div className="geometry-selected-heading">
          <Ruler size={18} aria-hidden="true" />
          <div><span>Barra selecionada</span><strong>{selectedBar.id}</strong></div>
        </div>
        <code>
          p{selectedBar.id} = ({signed(selectedBar.xMm, 1)}) cosθ + ({signed(selectedBar.yMm, 1)}) senθ = {signed(selectedBar.projectionMm, 1)} mm
        </code>
        <code>
          z{selectedBar.id} = pmax − p{selectedBar.id} = {signed(state.pMaxMm, 1)} − ({signed(selectedBar.projectionMm, 1)}) = {fmt(selectedBar.depthMm, 1)} mm
        </code>
      </section>

      <section className="geometry-bar-depths" aria-label="Profundidade projetada de todas as barras">
        <header>
          <div>
            <h2>Profundidade de cada barra</h2>
            <p>Clique em uma barra na tabela ou nos desenhos para acompanhar a mesma posição.</p>
          </div>
          <span><i className="is-compression" /> z&lt;xLN</span>
          <span><i className="is-tension" /> z&gt;xLN</span>
        </header>
        <div className="geometry-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Barra</th>
                <th>x [mm]</th>
                <th>y [mm]</th>
                <th>p [mm]</th>
                <th>z [mm]</th>
                <th>z/h</th>
                <th>Região</th>
              </tr>
            </thead>
            <tbody>
              {state.bars.map((bar) => (
                <tr key={bar.id} className={bar.id === selectedBar.id ? "is-selected" : ""}>
                  <td>
                    <button type="button" onClick={() => setSelectedBarId(bar.id)}>{bar.id}</button>
                  </td>
                  <td>{signed(bar.xMm, 1)}</td>
                  <td>{signed(bar.yMm, 1)}</td>
                  <td>{signed(bar.projectionMm, 1)}</td>
                  <td>{fmt(bar.depthMm, 1)}</td>
                  <td>{fmt(bar.relativeDepth, 3)}</td>
                  <td><span className={`geometry-side is-${bar.side}`}>{sideLabel(bar.side)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <details className="geometry-explanation">
        <summary>Leitura mecânica da construção</summary>
        <div>
          <p><b>Projeção:</b> p é o produto escalar da posição do ponto com a normal nθ. Linhas de p constante são paralelas à linha neutra.</p>
          <p><b>Profundidade:</b> z mede a distância projetada a partir da borda pmax. Por isso p e z crescem em sentidos opostos.</p>
          <p><b>Altura:</b> h é a extensão completa do polígono na direção nθ. Em uma seção não retangular, os vértices que definem pmax e pmin podem mudar durante a rotação.</p>
          <p><b>Profundidade efetiva:</b> neste laboratório, d vai da borda comprimida ao centroide das barras com z&gt;xLN, ponderado por suas áreas.</p>
        </div>
      </details>
    </div>
  );
}
