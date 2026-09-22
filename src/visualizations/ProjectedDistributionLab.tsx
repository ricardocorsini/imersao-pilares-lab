import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Activity, Crosshair, MousePointer2, RotateCcw } from "lucide-react";
import { RangeControl } from "../components/RangeControl";
import { concreteStressFor } from "../core/materialModel";
import {
  PROJECTED_CONCRETE,
  PROJECTED_REBARS,
  PROJECTED_SECTION,
  PROJECTED_STEEL,
  computeProjectedDistribution,
  strainAtProjectedDepth,
} from "../core/projectedDistribution";
import "./distributions.css";

type ProfileControls = {
  thetaDeg: number;
  epsTopPerMille: number;
  epsBottomPerMille: number;
};

type DepthPoint = { z: number; value: number };
type LineSeries = {
  id: string;
  label: string;
  color: string;
  points: DepthPoint[];
  dashed?: boolean;
};
type DepthMarker = {
  id: string;
  barId: string;
  label: string;
  z: number;
  value: number;
  color: string;
  axis?: "primary" | "secondary";
  shape?: "circle" | "square";
};
type DepthColumn = { z: number; width: number; value: number };
type ChartLegend = { label: string; color: string; kind: "line" | "point" | "bar" };

const PRESETS: Array<{ id: string; label: string; profile: ProfileControls }> = [
  {
    id: "oblique",
    label: "Oblíqua",
    profile: { thetaDeg: 35, epsTopPerMille: 3.5, epsBottomPerMille: -6 },
  },
  {
    id: "mx",
    label: "Flexão Mₓ",
    profile: { thetaDeg: 90, epsTopPerMille: 3.5, epsBottomPerMille: -10 },
  },
  {
    id: "my",
    label: "Flexão Mᵧ",
    profile: { thetaDeg: 0, epsTopPerMille: 3.5, epsBottomPerMille: -10 },
  },
  {
    id: "compression",
    label: "Compressão",
    profile: { thetaDeg: 35, epsTopPerMille: 2, epsBottomPerMille: 2 },
  },
];

const INITIAL_PROFILE = PRESETS[0].profile;

function fmt(value: number, digits = 2) {
  const normalized = Math.abs(value) < 5e-12 ? 0 : value;
  return normalized.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function signed(value: number, digits = 2) {
  return `${value > 5e-12 ? "+" : ""}${fmt(value, digits)}`;
}

function sameProfile(first: ProfileControls, second: ProfileControls) {
  return (
    first.thetaDeg === second.thetaDeg &&
    first.epsTopPerMille === second.epsTopPerMille &&
    first.epsBottomPerMille === second.epsBottomPerMille
  );
}

function paddedDomain(values: number[], includeZero = true): [number, number] {
  let min = Math.min(...values, ...(includeZero ? [0] : []));
  let max = Math.max(...values, ...(includeZero ? [0] : []));
  if (Math.abs(max - min) < 1e-9) {
    const padding = Math.max(1, Math.abs(max) * 0.2);
    return [min - padding, max + padding];
  }
  const padding = (max - min) * 0.14;
  min -= padding;
  max += padding;
  return [min, max];
}

function ticks(min: number, max: number, count = 4) {
  return Array.from({ length: count + 1 }, (_, index) =>
    min + (max - min) * index / count,
  );
}

function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setWidth(Math.max(300, element.clientWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

type DepthChartProps = {
  number: string;
  title: string;
  subtitle: string;
  heightMm: number;
  yDomain: [number, number];
  yTicks: number[];
  yLabel: string;
  lines?: LineSeries[];
  columns?: DepthColumn[];
  markers?: DepthMarker[];
  secondaryDomain?: [number, number];
  secondaryTicks?: number[];
  secondaryLabel?: string;
  neutralAxisDepthMm: number | null;
  cursorZMm: number;
  cursorReadout: string;
  selectedBarId: string;
  legend: ChartLegend[];
  onCursorZChange: (zMm: number) => void;
  onSelectBar: (barId: string) => void;
};

function DepthChart({
  number,
  title,
  subtitle,
  heightMm,
  yDomain,
  yTicks,
  yLabel,
  lines = [],
  columns = [],
  markers = [],
  secondaryDomain,
  secondaryTicks = [],
  secondaryLabel,
  neutralAxisDepthMm,
  cursorZMm,
  cursorReadout,
  selectedBarId,
  legend,
  onCursorZChange,
  onSelectBar,
}: DepthChartProps) {
  const { ref, width } = useContainerWidth();
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const generatedId = useId().replaceAll(":", "");
  const height = width < 520 ? 240 : 225;
  const margin = { top: 13, right: 66, bottom: 42, left: 65 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const [yMin, yMax] = yDomain;
  const xScale = (z: number) => margin.left + z / heightMm * plotWidth;
  const yScale = (value: number) =>
    margin.top + (1 - (value - yMin) / (yMax - yMin)) * plotHeight;
  const y2Scale = (value: number) => {
    if (!secondaryDomain) return yScale(value);
    const [min, max] = secondaryDomain;
    return margin.top + (1 - (value - min) / (max - min)) * plotHeight;
  };
  const pathFor = (points: DepthPoint[]) =>
    points
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"}${xScale(point.z).toFixed(2)},${yScale(point.value).toFixed(2)}`,
      )
      .join(" ");
  const cursorX = xScale(Math.min(heightMm, Math.max(0, cursorZMm)));
  const sortedMarkers = [...markers].sort((first, second) =>
    Number(first.barId === selectedBarId) - Number(second.barId === selectedBarId),
  );

  const updateFromPointer = (event: PointerEvent<SVGRectElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const bounds = svg.getBoundingClientRect();
    const svgX = (event.clientX - bounds.left) / bounds.width * width;
    const z = (svgX - margin.left) / plotWidth * heightMm;
    onCursorZChange(Math.min(heightMm, Math.max(0, z)));
  };

  const handleKey = (event: KeyboardEvent<SVGRectElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    onCursorZChange(
      Math.min(heightMm, Math.max(0, cursorZMm + direction * heightMm / 100)),
    );
  };

  const activateBar = (
    event: KeyboardEvent<SVGCircleElement | SVGRectElement>,
    barId: string,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelectBar(barId);
  };

  return (
    <article className="depth-chart-card">
      <header className="depth-chart-heading">
        <span className="depth-chart-number">{number}</span>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <strong>{cursorReadout}</strong>
      </header>
      <div className="depth-chart-legend" aria-label="Legenda do gráfico">
        {legend.map((item) => (
          <span key={item.label}>
            <i className={`is-${item.kind}`} style={{ backgroundColor: item.color, borderColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <div className="depth-chart-svg-wrap" ref={ref}>
        <svg
          ref={svgRef}
          className="depth-chart-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-labelledby={`${generatedId}-title ${generatedId}-description`}
        >
          <title id={`${generatedId}-title`}>{title}</title>
          <desc id={`${generatedId}-description`}>{subtitle}. Todos os gráficos compartilham a coordenada z.</desc>
          <defs>
            <clipPath id={`${generatedId}-clip`}>
              <rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} />
            </clipPath>
          </defs>

          <g clipPath={`url(#${generatedId}-clip)`}>
            {yTicks.map((value) => (
              <line
                key={`grid-y-${value}`}
                className="depth-grid-line"
                x1={margin.left}
                x2={margin.left + plotWidth}
                y1={yScale(value)}
                y2={yScale(value)}
              />
            ))}
            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
              <line
                key={`grid-x-${fraction}`}
                className="depth-grid-line"
                x1={xScale(heightMm * fraction)}
                x2={xScale(heightMm * fraction)}
                y1={margin.top}
                y2={margin.top + plotHeight}
              />
            ))}
            {yMin < 0 && yMax > 0 && (
              <line
                className="depth-zero-line"
                x1={margin.left}
                x2={margin.left + plotWidth}
                y1={yScale(0)}
                y2={yScale(0)}
              />
            )}
            {neutralAxisDepthMm !== null && (
              <line
                className="depth-neutral-line"
                x1={xScale(neutralAxisDepthMm)}
                x2={xScale(neutralAxisDepthMm)}
                y1={margin.top}
                y2={margin.top + plotHeight}
              />
            )}
            {columns.map((column) => {
              const zeroY = yScale(0);
              const valueY = yScale(column.value);
              return (
                <rect
                  key={`column-${column.z}`}
                  className="depth-force-column"
                  x={xScale(column.z - column.width / 2)}
                  y={Math.min(zeroY, valueY)}
                  width={Math.max(1, xScale(column.z + column.width / 2) - xScale(column.z - column.width / 2) - 0.6)}
                  height={Math.max(0.8, Math.abs(valueY - zeroY))}
                />
              );
            })}
            {lines.map((series) => (
              <path
                key={series.id}
                className={`depth-series-line ${series.dashed ? "is-dashed" : ""}`}
                d={pathFor(series.points)}
                stroke={series.color}
              />
            ))}
          </g>

          <rect
            className="depth-chart-frame"
            x={margin.left}
            y={margin.top}
            width={plotWidth}
            height={plotHeight}
          />
          <rect
            className="depth-chart-hit"
            x={margin.left}
            y={margin.top}
            width={plotWidth}
            height={plotHeight}
            role="slider"
            tabIndex={0}
            aria-label={`Profundidade de leitura em ${title}`}
            aria-valuemin={0}
            aria-valuemax={heightMm}
            aria-valuenow={cursorZMm}
            aria-valuetext={`${fmt(cursorZMm, 1)} milímetros`}
            onKeyDown={handleKey}
            onPointerDown={(event) => {
              dragging.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
              updateFromPointer(event);
            }}
            onPointerMove={(event) => {
              if (event.pointerType === "mouse" || dragging.current) updateFromPointer(event);
            }}
            onPointerUp={(event) => {
              dragging.current = false;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onPointerCancel={() => { dragging.current = false; }}
          />

          {sortedMarkers.map((marker) => {
            const selected = marker.barId === selectedBarId;
            const cy = marker.axis === "secondary" ? y2Scale(marker.value) : yScale(marker.value);
            const common = {
              className: `depth-bar-marker ${selected ? "is-selected" : ""}`,
              fill: marker.color,
              tabIndex: 0,
              role: "button",
              "aria-label": marker.label,
              onClick: () => onSelectBar(marker.barId),
              onKeyDown: (event: KeyboardEvent<SVGCircleElement | SVGRectElement>) =>
                activateBar(event, marker.barId),
            };
            return marker.shape === "square" ? (
              <rect
                key={marker.id}
                {...common}
                x={xScale(marker.z) - (selected ? 5.5 : 4)}
                y={cy - (selected ? 5.5 : 4)}
                width={selected ? 11 : 8}
                height={selected ? 11 : 8}
                rx="1"
              >
                <title>{marker.label}</title>
              </rect>
            ) : (
              <circle
                key={marker.id}
                {...common}
                cx={xScale(marker.z)}
                cy={cy}
                r={selected ? 6 : 4.3}
              >
                <title>{marker.label}</title>
              </circle>
            );
          })}

          <line
            className="depth-cursor-line"
            x1={cursorX}
            x2={cursorX}
            y1={margin.top}
            y2={margin.top + plotHeight}
          />
          <circle className="depth-cursor-cap" cx={cursorX} cy={margin.top + 4} r="3.5" />

          {yTicks.map((value) => (
            <text
              key={`tick-y-${value}`}
              className="depth-axis-tick"
              x={margin.left - 9}
              y={yScale(value) + 4}
              textAnchor="end"
            >
              {fmt(value, Math.abs(value) < 10 ? 2 : 1)}
            </text>
          ))}
          {secondaryDomain && secondaryTicks.map((value) => (
            <text
              key={`tick-y2-${value}`}
              className="depth-axis-tick is-secondary"
              x={margin.left + plotWidth + 9}
              y={y2Scale(value) + 4}
              textAnchor="start"
            >
              {fmt(value, 0)}
            </text>
          ))}
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
            <text
              key={`tick-x-${fraction}`}
              className="depth-axis-tick"
              x={xScale(heightMm * fraction)}
              y={margin.top + plotHeight + 18}
              textAnchor="middle"
            >
              {fmt(heightMm * fraction, 0)}
            </text>
          ))}
          <text
            className="depth-axis-title"
            x={margin.left + plotWidth / 2}
            y={height - 7}
            textAnchor="middle"
          >
            profundidade projetada z [mm]
          </text>
          <text
            className="depth-axis-title"
            x={15}
            y={margin.top + plotHeight / 2}
            textAnchor="middle"
            transform={`rotate(-90 15 ${margin.top + plotHeight / 2})`}
          >
            {yLabel}
          </text>
          {secondaryLabel && (
            <text
              className="depth-axis-title is-secondary"
              x={width - 11}
              y={margin.top + plotHeight / 2}
              textAnchor="middle"
              transform={`rotate(90 ${width - 11} ${margin.top + plotHeight / 2})`}
            >
              {secondaryLabel}
            </text>
          )}
          {neutralAxisDepthMm !== null && (
            <text
              className="depth-neutral-label"
              x={xScale(neutralAxisDepthMm) + 5}
              y={margin.top + 13}
            >
              LN
            </text>
          )}
        </svg>
      </div>
    </article>
  );
}

type ProjectionDiagramProps = {
  distribution: ReturnType<typeof computeProjectedDistribution>;
  selectedBarId: string;
  onSelectBar: (barId: string) => void;
};

function ProjectionDiagram({ distribution, selectedBarId, onSelectBar }: ProjectionDiagramProps) {
  const generatedId = useId().replaceAll(":", "");
  const width = 300;
  const height = 292;
  const scale = 0.39;
  const cx = 145;
  const cy = 145;
  const mapX = (xMm: number) => cx + xMm * scale;
  const mapY = (yMm: number) => cy - yMm * scale;
  const tangentX = -distribution.sine;
  const tangentY = distribution.cosine;
  const supportLength = 470;
  const lineAtProjection = (pMm: number) => {
    const baseX = distribution.cosine * pMm;
    const baseY = distribution.sine * pMm;
    return {
      x1: mapX(baseX - tangentX * supportLength),
      y1: mapY(baseY - tangentY * supportLength),
      x2: mapX(baseX + tangentX * supportLength),
      y2: mapY(baseY + tangentY * supportLength),
    };
  };
  const topLine = lineAtProjection(distribution.pMaxMm);
  const bottomLine = lineAtProjection(distribution.pMinMm);
  const neutralLine = distribution.neutralAxisDepthMm === null
    ? null
    : lineAtProjection(distribution.pMaxMm - distribution.neutralAxisDepthMm);
  const neutralProjection = distribution.neutralAxisDepthMm === null
    ? null
    : distribution.pMaxMm - distribution.neutralAxisDepthMm;
  const arrowStartX = distribution.cosine * distribution.pMaxMm;
  const arrowStartY = distribution.sine * distribution.pMaxMm;
  const arrowEndX = distribution.cosine * distribution.pMinMm;
  const arrowEndY = distribution.sine * distribution.pMinMm;
  const strainColor = (strainPerMille: number) => {
    if (strainPerMille > 0.02) return "#ff7758";
    if (strainPerMille < -0.02) return "#287ee8";
    return "#f5f8fa";
  };
  const topColor = strainColor(distribution.input.epsTopPerMille);
  const bottomColor = strainColor(distribution.input.epsBottomPerMille);
  const crossesZero = distribution.input.epsTopPerMille * distribution.input.epsBottomPerMille < 0;
  const zeroOffset = crossesZero
    ? distribution.input.epsTopPerMille /
      (distribution.input.epsTopPerMille - distribution.input.epsBottomPerMille)
    : null;

  return (
    <svg
      className="projection-diagram"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-labelledby={`${generatedId}-title ${generatedId}-description`}
    >
      <title id={`${generatedId}-title`}>Seção e profundidade projetada</title>
      <desc id={`${generatedId}-description`}>Seção retangular, armaduras, direção normal theta, bordas projetadas e linha neutra.</desc>
      <defs>
        <linearGradient
          id={`${generatedId}-field`}
          gradientUnits="userSpaceOnUse"
          x1={mapX(arrowStartX)}
          y1={mapY(arrowStartY)}
          x2={mapX(arrowEndX)}
          y2={mapY(arrowEndY)}
        >
          <stop offset="0" stopColor={topColor} stopOpacity="0.7" />
          {zeroOffset !== null && (
            <stop offset={zeroOffset} stopColor="#f5f8fa" stopOpacity="0.24" />
          )}
          <stop offset="1" stopColor={bottomColor} stopOpacity="0.68" />
        </linearGradient>
        <clipPath id={`${generatedId}-section-clip`}>
          <rect
            x={mapX(-PROJECTED_SECTION.widthMm / 2)}
            y={mapY(PROJECTED_SECTION.heightMm / 2)}
            width={PROJECTED_SECTION.widthMm * scale}
            height={PROJECTED_SECTION.heightMm * scale}
          />
        </clipPath>
        <marker id={`${generatedId}-arrow`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" />
        </marker>
      </defs>
      <rect className="projection-background" x="0" y="0" width={width} height={height} rx="7" />
      <rect
        className="projection-section-fill"
        x={mapX(-PROJECTED_SECTION.widthMm / 2)}
        y={mapY(PROJECTED_SECTION.heightMm / 2)}
        width={PROJECTED_SECTION.widthMm * scale}
        height={PROJECTED_SECTION.heightMm * scale}
        fill={`url(#${generatedId}-field)`}
      />
      <g clipPath={`url(#${generatedId}-section-clip)`}>
        {neutralLine && <line className="projection-neutral-axis" {...neutralLine} />}
      </g>
      <rect
        className="projection-section-outline"
        x={mapX(-PROJECTED_SECTION.widthMm / 2)}
        y={mapY(PROJECTED_SECTION.heightMm / 2)}
        width={PROJECTED_SECTION.widthMm * scale}
        height={PROJECTED_SECTION.heightMm * scale}
      />
      <line className="projection-support-line is-top" {...topLine} />
      <line className="projection-support-line" {...bottomLine} />
      <line
        className="projection-depth-arrow"
        x1={mapX(arrowStartX)}
        y1={mapY(arrowStartY)}
        x2={mapX(arrowEndX)}
        y2={mapY(arrowEndY)}
        markerEnd={`url(#${generatedId}-arrow)`}
      />
      <text className="projection-z-label" x={mapX(arrowStartX) + 7} y={mapY(arrowStartY) - 6}>z=0</text>
      <text className="projection-z-label" x={mapX(arrowEndX) + 7} y={mapY(arrowEndY) + 14}>z=h</text>
      {neutralProjection !== null && (
        <text
          className="projection-ln-label"
          x={mapX(distribution.cosine * neutralProjection) + 7}
          y={mapY(distribution.sine * neutralProjection) - 6}
        >
          ε=0 · LN
        </text>
      )}
      {PROJECTED_REBARS.map((bar) => {
        const selected = bar.id === selectedBarId;
        return (
          <circle
            key={bar.id}
            className={`projection-bar ${selected ? "is-selected" : ""}`}
            cx={mapX(bar.xMm)}
            cy={mapY(bar.yMm)}
            r={selected ? 6.4 : 4.7}
            tabIndex={0}
            role="button"
            aria-label={`Selecionar barra ${bar.id}`}
            onClick={() => onSelectBar(bar.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectBar(bar.id);
              }
            }}
          >
            <title>{bar.id}</title>
          </circle>
        );
      })}
      <g className="projection-theta">
        <line x1={cx} y1={cy} x2={cx + 45} y2={cy} />
        <line
          x1={cx}
          y1={cy}
          x2={cx + distribution.cosine * 53}
          y2={cy - distribution.sine * 53}
          markerEnd={`url(#${generatedId}-arrow)`}
        />
        <text x={cx + 51} y={cy - 8}>θ={fmt(distribution.input.thetaDeg, 0)}°</text>
      </g>
    </svg>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="distribution-metric">
      <span>{label}</span>
      <strong>{value} {unit && <small>{unit}</small>}</strong>
    </div>
  );
}

export default function ProjectedDistributionLab() {
  const [profile, setProfile] = useState<ProfileControls>(INITIAL_PROFILE);
  const [cursorRatio, setCursorRatio] = useState(0.48);
  const [selectedBarId, setSelectedBarId] = useState("B8");
  const distribution = useMemo(
    () => computeProjectedDistribution({ ...profile, bands: 60 }),
    [profile],
  );
  const cursorZMm = cursorRatio * distribution.heightMm;
  const selectedBar = distribution.bars.find((bar) => bar.id === selectedBarId) ?? distribution.bars[0];
  const activePreset = PRESETS.find((preset) => sameProfile(preset.profile, profile))?.id;
  const samples = 180;
  const profilePoints = useMemo(
    () => Array.from({ length: samples + 1 }, (_, index) => {
      const z = distribution.heightMm * index / samples;
      return {
        z,
        strain: strainAtProjectedDepth(distribution, z) * 1_000,
      };
    }),
    [distribution],
  );
  const stressPoints = useMemo(
    () => profilePoints.map((point) => ({
      z: point.z,
      value: concreteStressFor(PROJECTED_CONCRETE, point.strain / 1_000),
    })),
    [profilePoints],
  );
  const strainDomain = paddedDomain([
    profile.epsTopPerMille,
    profile.epsBottomPerMille,
  ]);
  const forceValues = [
    ...distribution.bands.map((band) => band.concreteForceKn),
    ...distribution.bars.map((bar) => bar.effectiveForceKn),
  ];
  const forceDomain = paddedDomain(forceValues);
  const cursorStrain = strainAtProjectedDepth(distribution, cursorZMm) * 1_000;
  const cursorStress = concreteStressFor(PROJECTED_CONCRETE, cursorStrain / 1_000);
  const cursorBandIndex = Math.min(
    distribution.bands.length - 1,
    Math.max(0, Math.floor(cursorZMm / distribution.heightMm * distribution.bands.length)),
  );
  const cursorBand = distribution.bands[cursorBandIndex];

  const strainMarkers: DepthMarker[] = distribution.bars.map((bar) => ({
    id: `strain-${bar.id}`,
    barId: bar.id,
    label: `${bar.id}: z=${fmt(bar.zMm, 1)} mm; ε=${signed(bar.strain * 1_000, 3)}‰`,
    z: bar.zMm,
    value: bar.strain * 1_000,
    color: "#ffd14a",
  }));
  const stressMarkers: DepthMarker[] = distribution.bars.flatMap((bar) => [
    {
      id: `concrete-stress-${bar.id}`,
      barId: bar.id,
      label: `${bar.id}: tensão do concreto no ponto = ${signed(bar.concreteStressMpa, 2)} MPa`,
      z: bar.zMm,
      value: bar.concreteStressMpa,
      color: "#25dcff",
      shape: "square" as const,
    },
    {
      id: `steel-stress-${bar.id}`,
      barId: bar.id,
      label: `${bar.id}: tensão do aço = ${signed(bar.steelStressMpa, 2)} MPa`,
      z: bar.zMm,
      value: bar.steelStressMpa,
      color: "#ffd14a",
      axis: "secondary" as const,
    },
  ]);
  const forceMarkers: DepthMarker[] = distribution.bars.map((bar) => ({
    id: `force-${bar.id}`,
    barId: bar.id,
    label: `${bar.id}: contribuição líquida = ${signed(bar.effectiveForceKn, 2)} kN`,
    z: bar.zMm,
    value: bar.effectiveForceKn,
    color: "#ffd14a",
  }));

  const updateCursor = (zMm: number) => {
    setCursorRatio(Math.min(1, Math.max(0, zMm / distribution.heightMm)));
  };
  const selectBar = (barId: string) => {
    const bar = distribution.bars.find((candidate) => candidate.id === barId);
    setSelectedBarId(barId);
    if (bar) setCursorRatio(bar.zMm / distribution.heightMm);
  };
  const updateTop = (value: number) => {
    setProfile((current) => ({
      ...current,
      epsTopPerMille: value,
      epsBottomPerMille: Math.min(current.epsBottomPerMille, value),
    }));
  };
  const updateBottom = (value: number) => {
    setProfile((current) => ({ ...current, epsBottomPerMille: Math.min(value, current.epsTopPerMille) }));
  };

  return (
    <div className="lab-shell distribution-lab">
      <div className="distribution-main">
        <section className="distribution-stage" aria-label="Distribuições ao longo da profundidade projetada">
          <div className="distribution-toolbar">
            <div className="distribution-chain" aria-label="Sequência de transformação">
              <span>plano</span><b>→</b><span>ε(z)</span><b>→</b><span>σ(z)</span><b>→</b><span>forças</span>
            </div>
            <div><MousePointer2 size={15} aria-hidden="true" />Mova o cursor em qualquer gráfico</div>
          </div>

          <div className="depth-chart-stack">
            <DepthChart
              number="1"
              title="Distribuição de deformações"
              subtitle="O perfil permanece linear em toda a profundidade projetada."
              heightMm={distribution.heightMm}
              yDomain={strainDomain}
              yTicks={ticks(...strainDomain)}
              yLabel="ε [‰]"
              lines={[{
                id: "strain",
                label: "ε(z)",
                color: "#f5f9fb",
                points: profilePoints.map((point) => ({ z: point.z, value: point.strain })),
              }]}
              markers={strainMarkers}
              neutralAxisDepthMm={distribution.neutralAxisDepthMm}
              cursorZMm={cursorZMm}
              cursorReadout={`z ${fmt(cursorZMm, 1)} mm · ε ${signed(cursorStrain, 3)}‰`}
              selectedBarId={selectedBarId}
              legend={[
                { label: "concreto: perfil compatível", color: "#f5f9fb", kind: "line" },
                { label: "barras: mesma deformação", color: "#ffd14a", kind: "point" },
              ]}
              onCursorZChange={updateCursor}
              onSelectBar={selectBar}
            />

            <DepthChart
              number="2"
              title="Distribuição de tensões"
              subtitle="A entrada linear passa pelas leis não lineares de cada material."
              heightMm={distribution.heightMm}
              yDomain={[0, PROJECTED_CONCRETE.sigmaPlateauMpa * 1.18]}
              yTicks={ticks(0, PROJECTED_CONCRETE.sigmaPlateauMpa * 1.18)}
              yLabel="σc [MPa]"
              lines={[{
                id: "concrete-stress",
                label: "σc(z)",
                color: "#25dcff",
                points: stressPoints,
              }]}
              markers={stressMarkers}
              secondaryDomain={[-PROJECTED_STEEL.fydMpa * 1.12, PROJECTED_STEEL.fydMpa * 1.12]}
              secondaryTicks={[-PROJECTED_STEEL.fydMpa, 0, PROJECTED_STEEL.fydMpa]}
              secondaryLabel="σs [MPa]"
              neutralAxisDepthMm={distribution.neutralAxisDepthMm}
              cursorZMm={cursorZMm}
              cursorReadout={`z ${fmt(cursorZMm, 1)} mm · σc ${signed(cursorStress, 2)} MPa`}
              selectedBarId={selectedBarId}
              legend={[
                { label: "concreto σc(z)", color: "#25dcff", kind: "line" },
                { label: "σc no ponto da barra", color: "#25dcff", kind: "bar" },
                { label: "aço σs", color: "#ffd14a", kind: "point" },
              ]}
              onCursorZChange={updateCursor}
              onSelectBar={selectBar}
            />

            <DepthChart
              number="3"
              title="Contribuições de força normal"
              subtitle="Faixas de concreto e barras são somadas para formar as resultantes."
              heightMm={distribution.heightMm}
              yDomain={forceDomain}
              yTicks={ticks(...forceDomain)}
              yLabel="ΔN [kN]"
              columns={distribution.bands.map((band) => ({
                z: band.zMm,
                width: distribution.bandWidthMm,
                value: band.concreteForceKn,
              }))}
              markers={forceMarkers}
              neutralAxisDepthMm={distribution.neutralAxisDepthMm}
              cursorZMm={cursorZMm}
              cursorReadout={`faixa em z ${fmt(cursorBand.zMm, 1)} mm · ΔNc ${signed(cursorBand.concreteForceKn, 2)} kN`}
              selectedBarId={selectedBarId}
              legend={[
                { label: "concreto por faixa", color: "#25dcff", kind: "bar" },
                { label: "barras ΔFs", color: "#ffd14a", kind: "point" },
              ]}
              onCursorZChange={updateCursor}
              onSelectBar={selectBar}
            />
          </div>
        </section>

        <aside className="distribution-controls" aria-label="Perfil projetado e seleção de barras">
          <div className="distribution-controls-heading">
            <Crosshair size={19} aria-hidden="true" />
            <div><h2>Perfil projetado</h2><span>z = pmax − p</span></div>
          </div>

          <ProjectionDiagram
            distribution={distribution}
            selectedBarId={selectedBarId}
            onSelectBar={selectBar}
          />

          <div className="distribution-presets" aria-label="Perfis de exemplo">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={activePreset === preset.id ? "is-active" : ""}
                aria-pressed={activePreset === preset.id}
                onClick={() => setProfile(preset.profile)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="distribution-range-stack">
            <RangeControl
              id="distribution-theta"
              label="Normal à linha neutra"
              symbol="θ"
              value={profile.thetaDeg}
              min={0}
              max={180}
              step={1}
              unit="°"
              signed={false}
              fractionDigits={0}
              onChange={(value) => setProfile((current) => ({ ...current, thetaDeg: value }))}
            />
            <RangeControl
              id="distribution-eps-top"
              label="Na borda z = 0"
              symbol="εtop"
              value={profile.epsTopPerMille}
              min={-1}
              max={5}
              step={0.05}
              unit="‰"
              fractionDigits={2}
              onChange={updateTop}
            />
            <RangeControl
              id="distribution-eps-bottom"
              label="Na borda z = h"
              symbol="εbot"
              value={profile.epsBottomPerMille}
              min={-12}
              max={profile.epsTopPerMille}
              step={0.05}
              unit="‰"
              fractionDigits={2}
              onChange={updateBottom}
            />
          </div>

          <section className="projection-values" aria-label="Geometria projetada">
            <div><span>h</span><strong>{fmt(distribution.heightMm, 1)} mm</strong></div>
            <div><span>inclinação</span><strong>{signed(distribution.slopePerMm * 1e6, 3)} ‰/m</strong></div>
            <div><span>xLN</span><strong>{distribution.neutralAxisDepthMm === null ? "fora/indefinida" : `${fmt(distribution.neutralAxisDepthMm, 1)} mm`}</strong></div>
            <div><span>faixas</span><strong>{distribution.bands.length} × {fmt(distribution.bandWidthMm, 1)} mm</strong></div>
          </section>

          <label className="distribution-bar-select" htmlFor="distribution-bar">
            Barra em destaque
            <select
              id="distribution-bar"
              value={selectedBarId}
              onChange={(event) => selectBar(event.target.value)}
            >
              {distribution.bars.map((bar) => (
                <option key={bar.id} value={bar.id}>
                  {bar.id} · z={fmt(bar.zMm, 1)} mm
                </option>
              ))}
            </select>
          </label>

          <button
            className="distribution-reset"
            type="button"
            onClick={() => {
              setProfile(INITIAL_PROFILE);
              setCursorRatio(0.48);
              setSelectedBarId("B8");
            }}
          >
            <RotateCcw size={15} aria-hidden="true" />Restaurar exemplo
          </button>
        </aside>
      </div>

      <section className="selected-bar-panel" aria-label={`Leitura da barra ${selectedBar.id}`}>
        <header>
          <div><span>Barra selecionada</span><strong>{selectedBar.id}</strong></div>
          <p>Na mesma coordenada, aço e concreto recebem <b>a mesma deformação</b>, mas devolvem tensões distintas.</p>
        </header>
        <div className="selected-bar-metrics">
          <Metric label="Profundidade z" value={fmt(selectedBar.zMm, 1)} unit="mm" />
          <Metric label="Deformação comum" value={signed(selectedBar.strain * 1_000, 3)} unit="‰" />
          <Metric label="Tensão no concreto" value={signed(selectedBar.concreteStressMpa, 2)} unit="MPa" />
          <Metric label="Tensão no aço" value={signed(selectedBar.steelStressMpa, 2)} unit="MPa" />
          <Metric label="Força real Fs" value={signed(selectedBar.steelForceKn, 2)} unit="kN" />
          <Metric label="Concreto deslocado" value={signed(selectedBar.displacedConcreteKn, 2)} unit="kN" />
          <Metric label="Contribuição ΔFs" value={signed(selectedBar.effectiveForceKn, 2)} unit="kN" />
        </div>
      </section>

      <section className="distribution-resultants" aria-label="Resultantes da seção">
        <div className="distribution-resultants-heading">
          <Activity size={18} aria-hidden="true" />
          <div><h2>Integração da seção</h2><span>concreto em 60 faixas projetadas · 8 barras discretas</span></div>
        </div>
        <Metric label="Nc" value={signed(distribution.concreteNKn, 1)} unit="kN" />
        <Metric label="ΣΔFs" value={signed(distribution.steelNKn, 1)} unit="kN" />
        <Metric label="N" value={signed(distribution.nKn, 1)} unit="kN" />
        <Metric label="Mx" value={signed(distribution.mxKnm, 1)} unit="kN·m" />
        <Metric label="My" value={signed(distribution.myKnm, 1)} unit="kN·m" />
      </section>

      <details className="distribution-explanation">
        <summary>Como interpretar os três gráficos</summary>
        <div>
          <p><b>Compatibilidade:</b> o plano de deformações é convertido no perfil ε(z)=εtop+s·z. Todas as barras são avaliadas no mesmo perfil linear do concreto.</p>
          <p><b>Leis constitutivas:</b> o concreto transforma esse perfil pela parábola-retângulo e não resiste à tração. O aço usa uma lei elastoplástica simétrica; por isso seus pontos utilizam a escala da direita no segundo gráfico.</p>
          <p><b>Forças:</b> cada coluna azul é a força de uma faixa projetada de concreto. Os pontos amarelos mostram ΔFs=(σs−σc)·As, pois a malha integra a área bruta e o concreto deslocado precisa ser descontado.</p>
          <p><b>Projeção:</b> θ é a direção normal à linha neutra. A coordenada z começa em pmax e cresce até pmin; ao girar θ, mudam h e a profundidade projetada de cada barra.</p>
        </div>
      </details>
    </div>
  );
}
