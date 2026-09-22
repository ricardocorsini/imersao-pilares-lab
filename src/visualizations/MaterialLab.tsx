import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Activity, FlaskConical, MousePointer2 } from "lucide-react";
import { LayerToggle } from "../components/LayerToggle";
import { RangeControl } from "../components/RangeControl";
import {
  STEEL_ULTIMATE_STRAIN_REFERENCE,
  concreteStressFor,
  createConcreteMaterial,
  createSteelMaterial,
  steelStressFor,
  type ConcreteMaterial,
} from "../core/materialModel";
import "./materials.css";

type Point = { x: number; y: number };
type CurveSeries = {
  id: string;
  label: string;
  color: string;
  points: Point[];
  primary?: boolean;
};
type ChartBand = {
  from: number;
  to: number;
  label: string;
  tone: "tension" | "outside";
};
type ChartMarker = {
  value: number;
  label: string;
  align?: "start" | "middle" | "end";
  level?: number;
};

const CONCRETE_CLASSES = [20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90];
const COMPARISON_CLASSES = [30, 50, 60, 90];
const COMPARISON_COLORS = ["#91a7b7", "#8b79d6", "#5ab5a9", "#e3a44e"];
const steel = createSteelMaterial(500, 1.15, 210_000);

const numberFormat = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 3,
});

function fmt(value: number, digits = 2) {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function signed(value: number, digits = 2) {
  return `${value > 0 ? "+" : ""}${fmt(value, digits)}`;
}

function sampleCurve(
  xMin: number,
  xMax: number,
  evaluate: (strain: number) => number,
  samples = 260,
) {
  return Array.from({ length: samples + 1 }, (_, index) => {
    const x = xMin + ((xMax - xMin) * index) / samples;
    return { x, y: evaluate(x / 1_000) };
  });
}

function linearTicks(min: number, max: number, count: number) {
  return Array.from({ length: count + 1 }, (_, index) =>
    min + ((max - min) * index) / count,
  );
}

function axisLabel(value: number) {
  const normalized = Math.abs(value) < 1e-9 ? 0 : value;
  return numberFormat.format(normalized);
}

function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(620);

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

type MaterialChartProps = {
  title: string;
  description: string;
  xDomain: [number, number];
  yDomain: [number, number];
  xTicks: number[];
  yTicks: number[];
  series: CurveSeries[];
  bands: ChartBand[];
  markers: ChartMarker[];
  cursorX: number;
  cursorY: number;
  cursorColor: string;
  cursorStep: number;
  onCursorChange: (value: number) => void;
};

function MaterialChart({
  title,
  description,
  xDomain,
  yDomain,
  xTicks,
  yTicks,
  series,
  bands,
  markers,
  cursorX,
  cursorY,
  cursorColor,
  cursorStep,
  onCursorChange,
}: MaterialChartProps) {
  const { ref, width } = useContainerWidth();
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const generatedId = useId().replaceAll(":", "");
  const height = width < 480 ? 300 : 330;
  const margin = { top: 35, right: 19, bottom: 54, left: width < 420 ? 53 : 63 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const [xMin, xMax] = xDomain;
  const [yMin, yMax] = yDomain;
  const xScale = (value: number) =>
    margin.left + ((value - xMin) / (xMax - xMin)) * plotWidth;
  const yScale = (value: number) =>
    margin.top + (1 - (value - yMin) / (yMax - yMin)) * plotHeight;
  const boundedCursorX = Math.min(xMax, Math.max(xMin, cursorX));
  const boundedCursorY = Math.min(yMax, Math.max(yMin, cursorY));

  const updateFromPointer = (event: PointerEvent<SVGRectElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const bounds = svg.getBoundingClientRect();
    const svgX = ((event.clientX - bounds.left) / bounds.width) * width;
    const value = xMin + ((svgX - margin.left) / plotWidth) * (xMax - xMin);
    const snapped = Math.round(value / cursorStep) * cursorStep;
    onCursorChange(Math.min(xMax, Math.max(xMin, snapped)));
  };

  const handleKey = (event: KeyboardEvent<SVGRectElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    onCursorChange(
      Math.min(xMax, Math.max(xMin, cursorX + direction * cursorStep)),
    );
  };

  const pathFor = (points: Point[]) =>
    points
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"}${xScale(point.x).toFixed(2)},${yScale(point.y).toFixed(2)}`,
      )
      .join(" ");

  const cursorAnchor = boundedCursorX > (xMin + xMax) / 2 ? "end" : "start";
  const cursorTextX =
    xScale(boundedCursorX) + (cursorAnchor === "end" ? -9 : 9);
  const cursorTextY = Math.max(margin.top + 15, yScale(boundedCursorY) - 11);

  return (
    <div className="material-chart-wrap" ref={ref}>
      <svg
        ref={svgRef}
        className="material-chart"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${generatedId}-title ${generatedId}-description`}
      >
        <title id={`${generatedId}-title`}>{title}</title>
        <desc id={`${generatedId}-description`}>{description}</desc>
        <defs>
          <clipPath id={`${generatedId}-clip`}>
            <rect
              x={margin.left}
              y={margin.top}
              width={plotWidth}
              height={plotHeight}
            />
          </clipPath>
          <pattern
            id={`${generatedId}-hatch`}
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="8" className="material-hatch-line" />
          </pattern>
        </defs>

        <g clipPath={`url(#${generatedId}-clip)`}>
          {bands.map((band) => (
            <g key={`${band.tone}-${band.from}-${band.to}`}>
              <rect
                className={`material-band material-band-${band.tone}`}
                x={xScale(band.from)}
                y={margin.top}
                width={Math.max(0, xScale(band.to) - xScale(band.from))}
                height={plotHeight}
              />
              {band.tone === "outside" && (
                <rect
                  className="material-band-hatch"
                  x={xScale(band.from)}
                  y={margin.top}
                  width={Math.max(0, xScale(band.to) - xScale(band.from))}
                  height={plotHeight}
                  fill={`url(#${generatedId}-hatch)`}
                />
              )}
            </g>
          ))}

          {yTicks.map((tick) => (
            <line
              key={`y-grid-${tick}`}
              className="material-grid-line"
              x1={margin.left}
              x2={margin.left + plotWidth}
              y1={yScale(tick)}
              y2={yScale(tick)}
            />
          ))}
          {xTicks.map((tick) => (
            <line
              key={`x-grid-${tick}`}
              className="material-grid-line"
              x1={xScale(tick)}
              x2={xScale(tick)}
              y1={margin.top}
              y2={margin.top + plotHeight}
            />
          ))}

          {markers.map((marker) => (
            <line
              key={`marker-${marker.value}-${marker.label}`}
              className="material-limit-line"
              x1={xScale(marker.value)}
              x2={xScale(marker.value)}
              y1={margin.top}
              y2={margin.top + plotHeight}
            />
          ))}

          {series.map((curve) => (
            <path
              key={curve.id}
              className={`material-curve ${curve.primary ? "is-primary" : "is-comparison"}`}
              d={pathFor(curve.points)}
              stroke={curve.color}
            />
          ))}

          <line
            className="material-cursor-guide"
            x1={xScale(boundedCursorX)}
            x2={xScale(boundedCursorX)}
            y1={margin.top}
            y2={margin.top + plotHeight}
          />
          <line
            className="material-cursor-guide"
            x1={margin.left}
            x2={xScale(boundedCursorX)}
            y1={yScale(boundedCursorY)}
            y2={yScale(boundedCursorY)}
          />
          <circle
            className="material-cursor-point"
            cx={xScale(boundedCursorX)}
            cy={yScale(boundedCursorY)}
            r="5.5"
            fill={cursorColor}
          />
        </g>

        <rect
          className="material-chart-frame"
          x={margin.left}
          y={margin.top}
          width={plotWidth}
          height={plotHeight}
        />

        {xTicks.map((tick) => (
          <text
            key={`x-tick-${tick}`}
            className="material-axis-tick"
            x={xScale(tick)}
            y={margin.top + plotHeight + 21}
            textAnchor="middle"
          >
            {axisLabel(tick)}
          </text>
        ))}
        {yTicks.map((tick) => (
          <text
            key={`y-tick-${tick}`}
            className="material-axis-tick"
            x={margin.left - 9}
            y={yScale(tick) + 4}
            textAnchor="end"
          >
            {axisLabel(tick)}
          </text>
        ))}

        {markers.map((marker) => (
          <text
            key={`marker-label-${marker.value}-${marker.label}`}
            className="material-limit-label"
            x={xScale(marker.value) + (marker.align === "start" ? 5 : marker.align === "end" ? -5 : 0)}
            y={margin.top - 11 - (marker.level ?? 0) * 13}
            textAnchor={marker.align ?? "middle"}
          >
            {marker.label}
          </text>
        ))}

        {bands.map((band) => {
          const available = Math.abs(xScale(band.to) - xScale(band.from));
          if (available < 78) return null;
          return (
            <text
              key={`band-label-${band.tone}-${band.from}`}
              className={`material-band-label material-band-label-${band.tone}`}
              x={(xScale(band.from) + xScale(band.to)) / 2}
              y={margin.top + plotHeight - 11}
              textAnchor="middle"
            >
              {band.label}
            </text>
          );
        })}

        <text
          className="material-axis-title"
          x={margin.left + plotWidth / 2}
          y={height - 9}
          textAnchor="middle"
        >
          deformação ε [‰]
        </text>
        <text
          className="material-axis-title"
          x={16}
          y={margin.top + plotHeight / 2}
          textAnchor="middle"
          transform={`rotate(-90 16 ${margin.top + plotHeight / 2})`}
        >
          tensão σ [MPa]
        </text>

        <text
          className="material-cursor-label"
          x={cursorTextX}
          y={cursorTextY}
          textAnchor={cursorAnchor}
        >
          ε={signed(boundedCursorX, 2)}‰ · σ={signed(cursorY, 2)} MPa
        </text>

        <rect
          className="material-chart-hit"
          x={margin.left}
          y={margin.top}
          width={plotWidth}
          height={plotHeight}
          role="slider"
          tabIndex={0}
          aria-label={`Selecionar deformação no ${title}`}
          aria-valuemin={xMin}
          aria-valuemax={xMax}
          aria-valuenow={boundedCursorX}
          aria-valuetext={`${signed(boundedCursorX, 2)} por mil`}
          onKeyDown={handleKey}
          onPointerDown={(event) => {
            dragging.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            updateFromPointer(event);
          }}
          onPointerMove={(event) => {
            if (dragging.current) updateFromPointer(event);
          }}
          onPointerUp={(event) => {
            dragging.current = false;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onPointerCancel={() => {
            dragging.current = false;
          }}
        />
      </svg>
    </div>
  );
}

function concreteRegime(material: ConcreteMaterial, strainPerMille: number) {
  const strain = strainPerMille / 1_000;
  if (strain <= 0) {
    return {
      title: "Tração desprezada",
      detail: "O modelo de ELU adota σc = 0 para ε ≤ 0.",
      tone: "tension",
    } as const;
  }
  if (strain < material.epsC2) {
    return {
      title: "Ramo parabólico",
      detail: "A tensão cresce de forma não linear até o início do patamar.",
      tone: "active",
    } as const;
  }
  if (strain <= material.epsCu) {
    return {
      title: "Patamar de cálculo",
      detail: "σc = 0,85 · ηc · fcd dentro do limite de deformação adotado.",
      tone: "plateau",
    } as const;
  }
  return {
    title: "Fora do caminho admissível",
    detail: "O avaliador mantém o patamar; o gerador de ELU é quem limita ε a εcu.",
    tone: "outside",
  } as const;
}

function steelRegime(strainPerMille: number) {
  const absoluteStrain = Math.abs(strainPerMille / 1_000);
  if (absoluteStrain < steel.epsYd) {
    return {
      title: "Regime elástico",
      detail: "σs = Es · εs.",
      tone: "active",
    } as const;
  }
  if (absoluteStrain <= STEEL_ULTIMATE_STRAIN_REFERENCE) {
    return {
      title: "Patamar elastoplástico",
      detail: "A tensão está limitada a ±fyd.",
      tone: "plateau",
    } as const;
  }
  return {
    title: "Além da referência εsu",
    detail: "A lei mantém ±fyd, mas o caminho de ELU usa |εsu| = 10‰.",
    tone: "outside",
  } as const;
}

function Parameter({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="material-parameter">
      <dt>{label}</dt>
      <dd>
        {value} {unit && <small>{unit}</small>}
      </dd>
    </div>
  );
}

export default function MaterialLab() {
  const [fckMpa, setFckMpa] = useState(30);
  const [gammaC, setGammaC] = useState(1.4);
  const [concreteStrain, setConcreteStrain] = useState(2);
  const [steelStrain, setSteelStrain] = useState(-2.5);
  const [showComparison, setShowComparison] = useState(true);

  const concrete = useMemo(
    () => createConcreteMaterial(fckMpa, gammaC),
    [fckMpa, gammaC],
  );
  const comparisonMaterials = useMemo(
    () =>
      COMPARISON_CLASSES.map((value) => createConcreteMaterial(value, gammaC)),
    [gammaC],
  );

  const concreteSeries = useMemo<CurveSeries[]>(() => {
    const comparisons = showComparison
      ? comparisonMaterials
          .filter((material) => material.fckMpa !== concrete.fckMpa)
          .map((material) => ({
            id: `C${material.fckMpa}`,
            label: `C${material.fckMpa}`,
            color:
              COMPARISON_COLORS[
                COMPARISON_CLASSES.indexOf(material.fckMpa)
              ],
            points: sampleCurve(-2, 5, (strain) =>
              concreteStressFor(material, strain),
            ),
          }))
      : [];
    return [
      ...comparisons,
      {
        id: `selected-C${concrete.fckMpa}`,
        label: `C${concrete.fckMpa} selecionado`,
        color: "#24dcff",
        primary: true,
        points: sampleCurve(-2, 5, (strain) =>
          concreteStressFor(concrete, strain),
        ),
      },
    ];
  }, [comparisonMaterials, concrete, showComparison]);

  const steelSeries = useMemo<CurveSeries[]>(
    () => [
      {
        id: "CA50",
        label: "CA-50",
        color: "#ffbf2f",
        primary: true,
        points: sampleCurve(-12, 12, (strain) => steelStressFor(steel, strain)),
      },
    ],
    [],
  );

  const comparisonPeak = showComparison
    ? Math.max(...comparisonMaterials.map((item) => item.sigmaPlateauMpa))
    : concrete.sigmaPlateauMpa;
  const concreteYMax = Math.ceil((Math.max(comparisonPeak, concrete.sigmaPlateauMpa) * 1.18) / 10) * 10;
  const steelYMax = Math.ceil((steel.fydMpa * 1.14) / 50) * 50;
  const concreteStress = concreteStressFor(concrete, concreteStrain / 1_000);
  const selectedSteelStress = steelStressFor(steel, steelStrain / 1_000);
  const concreteState = concreteRegime(concrete, concreteStrain);
  const steelState = steelRegime(steelStrain);
  const epsC2PerMille = concrete.epsC2 * 1_000;
  const epsCuPerMille = concrete.epsCu * 1_000;
  const epsYdPerMille = steel.epsYd * 1_000;
  const epsSuPerMille = STEEL_ULTIMATE_STRAIN_REFERENCE * 1_000;
  const coincidentConcreteLimits =
    Math.abs(epsC2PerMille - epsCuPerMille) < 0.001;

  const concreteMarkers: ChartMarker[] = coincidentConcreteLimits
    ? [
        {
          value: epsCuPerMille,
          label: `εc2 = εcu = ${fmt(epsCuPerMille, 2)}‰`,
          align: "end",
        },
      ]
    : [
        {
          value: epsC2PerMille,
          label: `εc2 ${fmt(epsC2PerMille, 2)}‰`,
          align: "end",
        },
        {
          value: epsCuPerMille,
          label: `εcu ${fmt(epsCuPerMille, 2)}‰`,
          align: "start",
          level: 1,
        },
      ];

  return (
    <div className="lab-shell materials-lab">
      <div className="materials-main">
        <section className="materials-stage" aria-label="Diagramas tensão-deformação">
          <div className="materials-stage-toolbar">
            <div className="materials-sign-convention">
              <span>← tração · ε &lt; 0</span>
              <b>ε = 0</b>
              <span>compressão · ε &gt; 0 →</span>
            </div>
            <div className="materials-drag-hint">
              <MousePointer2 size={15} aria-hidden="true" />
              Arraste os pontos ou use os controles
            </div>
          </div>

          <div className="materials-chart-grid">
            <article className="material-diagram-panel material-concrete-panel">
              <header>
                <div>
                  <span className="material-kicker">Concreto · ELU</span>
                  <h2>Diagrama parábola-retângulo</h2>
                </div>
                <strong>C{concrete.fckMpa}</strong>
              </header>
              <MaterialChart
                title={`Diagrama tensão-deformação do concreto C${concrete.fckMpa}`}
                description="Compressão positiva, concreto tracionado desprezado, ramo parabólico, patamar e região além de epsilon cu destacada."
                xDomain={[-2, 5]}
                yDomain={[0, concreteYMax]}
                xTicks={[-2, 0, 1, 2, 3.5, 5]}
                yTicks={linearTicks(0, concreteYMax, 4)}
                series={concreteSeries}
                bands={[
                  { from: -2, to: 0, label: "σc = 0", tone: "tension" },
                  {
                    from: epsCuPerMille,
                    to: 5,
                    label: "fora do ELU",
                    tone: "outside",
                  },
                ]}
                markers={concreteMarkers}
                cursorX={concreteStrain}
                cursorY={concreteStress}
                cursorColor="#24dcff"
                cursorStep={0.02}
                onCursorChange={setConcreteStrain}
              />
              <div className={`material-readout is-${concreteState.tone}`} aria-live="polite">
                <div>
                  <span>{concreteState.title}</span>
                  <strong>
                    εc = {signed(concreteStrain, 3)}‰ · σc = {signed(concreteStress, 2)} MPa
                  </strong>
                </div>
                <p>{concreteState.detail}</p>
              </div>
            </article>

            <article className="material-diagram-panel material-steel-panel">
              <header>
                <div>
                  <span className="material-kicker">Aço passivo · ELU</span>
                  <h2>Diagrama elastoplástico perfeito</h2>
                </div>
                <strong>CA-50</strong>
              </header>
              <MaterialChart
                title="Diagrama tensão-deformação do aço CA-50"
                description="Diagrama simétrico com ramo elástico, patamares de escoamento e regiões além de mais ou menos dez por mil destacadas."
                xDomain={[-12, 12]}
                yDomain={[-steelYMax, steelYMax]}
                xTicks={[-12, -10, -5, 0, 5, 10, 12]}
                yTicks={[-steel.fydMpa, 0, steel.fydMpa]}
                series={steelSeries}
                bands={[
                  { from: -12, to: -10, label: "|ε| > εsu", tone: "outside" },
                  { from: 10, to: 12, label: "|ε| > εsu", tone: "outside" },
                ]}
                markers={[
                  { value: -epsSuPerMille, label: "−εsu", align: "start", level: 1 },
                  { value: -epsYdPerMille, label: "−εyd", align: "end" },
                  { value: epsYdPerMille, label: "+εyd", align: "start" },
                  { value: epsSuPerMille, label: "+εsu", align: "end", level: 1 },
                ]}
                cursorX={steelStrain}
                cursorY={selectedSteelStress}
                cursorColor="#ffbf2f"
                cursorStep={0.05}
                onCursorChange={setSteelStrain}
              />
              <div className={`material-readout is-${steelState.tone}`} aria-live="polite">
                <div>
                  <span>{steelState.title}</span>
                  <strong>
                    εs = {signed(steelStrain, 3)}‰ · σs = {signed(selectedSteelStress, 2)} MPa
                  </strong>
                </div>
                <p>{steelState.detail}</p>
              </div>
            </article>
          </div>
        </section>

        <aside className="materials-controls" aria-label="Controles dos materiais">
          <div className="materials-controls-heading">
            <FlaskConical size={19} aria-hidden="true" />
            <div>
              <h2>Parâmetros</h2>
              <span>mesmas leis do motor FlexoPy</span>
            </div>
          </div>

          <section className="material-control-section">
            <div className="material-control-title">
              <span>Concreto</span>
              <small>20 ≤ fck ≤ 90 MPa</small>
            </div>
            <label className="material-select" htmlFor="concrete-class">
              Classe de resistência
              <select
                id="concrete-class"
                value={fckMpa}
                onChange={(event) => setFckMpa(Number(event.target.value))}
              >
                {CONCRETE_CLASSES.map((value) => (
                  <option key={value} value={value}>C{value} · fck = {value} MPa</option>
                ))}
              </select>
            </label>
            <div className="material-reference-buttons" aria-label="Classes de referência">
              {COMPARISON_CLASSES.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={fckMpa === value ? "is-active" : ""}
                  aria-pressed={fckMpa === value}
                  onClick={() => setFckMpa(value)}
                >
                  C{value}
                </button>
              ))}
            </div>
            <RangeControl
              id="gamma-c"
              label="Coeficiente do concreto"
              symbol="γc"
              value={gammaC}
              min={1}
              max={2}
              step={0.05}
              unit=""
              signed={false}
              fractionDigits={2}
              onChange={setGammaC}
            />
            <LayerToggle
              label="Sobrepor C30, C50, C60 e C90"
              checked={showComparison}
              onChange={setShowComparison}
            />
            {showComparison && (
              <div className="material-comparison-legend" aria-label="Curvas comparativas">
                {COMPARISON_CLASSES.map((value, index) => (
                  <span key={value} className={value === fckMpa ? "is-selected" : ""}>
                    <i style={{ "--series-color": COMPARISON_COLORS[index] } as CSSProperties} />
                    C{value}
                  </span>
                ))}
                <span className="is-primary"><i />selecionado</span>
              </div>
            )}
          </section>

          <section className="material-control-section material-cursor-controls">
            <div className="material-control-title">
              <span>Pontos de leitura</span>
              <small>ε em ‰</small>
            </div>
            <RangeControl
              id="concrete-strain"
              label="Deformação no concreto"
              symbol="εc"
              value={concreteStrain}
              min={-2}
              max={5}
              step={0.02}
              unit="‰"
              fractionDigits={2}
              onChange={setConcreteStrain}
            />
            <div className="material-cursor-presets" aria-label="Pontos notáveis do concreto">
              <button type="button" onClick={() => setConcreteStrain(0)}>zero</button>
              <button type="button" onClick={() => setConcreteStrain(epsC2PerMille)}>εc2</button>
              <button type="button" onClick={() => setConcreteStrain(epsCuPerMille)}>εcu</button>
            </div>
            <RangeControl
              id="steel-strain"
              label="Deformação no aço"
              symbol="εs"
              value={steelStrain}
              min={-12}
              max={12}
              step={0.05}
              unit="‰"
              fractionDigits={2}
              onChange={setSteelStrain}
            />
            <div className="material-cursor-presets is-steel" aria-label="Pontos notáveis do aço">
              <button type="button" onClick={() => setSteelStrain(-epsSuPerMille)}>−εsu</button>
              <button type="button" onClick={() => setSteelStrain(-epsYdPerMille)}>−εyd</button>
              <button type="button" onClick={() => setSteelStrain(0)}>zero</button>
              <button type="button" onClick={() => setSteelStrain(epsYdPerMille)}>+εyd</button>
              <button type="button" onClick={() => setSteelStrain(epsSuPerMille)}>+εsu</button>
            </div>
          </section>

          <div className="materials-method-note">
            <Activity size={16} aria-hidden="true" />
            <p><b>Mesmo ε, leis diferentes.</b> A aderência impõe compatibilidade de deformações; cada material transforma ε em σ por sua própria lei.</p>
          </div>
        </aside>
      </div>

      <section className="material-parameters" aria-label="Valores calculados dos materiais">
        <article>
          <header><span>Concreto selecionado</span><strong>C{concrete.fckMpa}</strong></header>
          <dl>
            <Parameter label="fcd" value={fmt(concrete.fcdMpa, 2)} unit="MPa" />
            <Parameter label="ηc" value={fmt(concrete.etaC, 4)} />
            <Parameter label="expoente n" value={fmt(concrete.exponentN, 4)} />
            <Parameter label="εc2" value={fmt(epsC2PerMille, 3)} unit="‰" />
            <Parameter label="εcu" value={fmt(epsCuPerMille, 3)} unit="‰" />
            <Parameter label="0,85·ηc·fcd" value={fmt(concrete.sigmaPlateauMpa, 2)} unit="MPa" />
          </dl>
        </article>
        <article>
          <header><span>Aço selecionado</span><strong>CA-50</strong></header>
          <dl>
            <Parameter label="fyk" value={fmt(steel.fykMpa, 0)} unit="MPa" />
            <Parameter label="γs" value={fmt(steel.gammaS, 2)} />
            <Parameter label="Es" value={fmt(steel.esMpa / 1_000, 0)} unit="GPa" />
            <Parameter label="fyd" value={fmt(steel.fydMpa, 2)} unit="MPa" />
            <Parameter label="εyd" value={fmt(epsYdPerMille, 3)} unit="‰" />
            <Parameter label="|εsu|" value={fmt(epsSuPerMille, 1)} unit="‰" />
          </dl>
        </article>
      </section>

      <details className="materials-explanation">
        <summary>Como o código interpreta estes diagramas</summary>
        <div>
          <p><b>Concreto:</b> compressão e tensão de compressão são positivas. Em tração, σc = 0. Entre zero e εc2 aplica-se o ramo parabólico; a partir de εc2, o avaliador devolve o patamar de cálculo.</p>
          <p><b>Limite do concreto:</b> a função constitutiva não interrompe a tensão após εcu para permitir experimentação com planos prescritos. A região hachurada mostra que esses estados não pertencem ao caminho de ELU produzido pelo gerador.</p>
          <p><b>Aço:</b> o diagrama é simétrico e elastoplástico perfeito. A lei mantém ±fyd além de ±εsu; o valor de 10‰ é a referência usada pelo caminho dos estados-limites, e não um corte interno da função do material.</p>
          <p><b>C90:</b> εc2 e εcu coincidem em 2,6‰. O laboratório reproduz a mesma normalização numérica usada pelo motor para evitar uma ultrapassagem causada pelo arredondamento dos coeficientes.</p>
        </div>
      </details>
    </div>
  );
}
