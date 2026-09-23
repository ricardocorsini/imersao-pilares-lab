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
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Gauge,
  Pause,
  Play,
  RotateCcw,
  Route,
  Sigma,
} from "lucide-react";
import {
  STRAIN_DOMAIN_CONCRETE_CLASSES,
  STRAIN_DOMAIN_DEFAULT_GEOMETRY,
  STRAIN_DOMAIN_DEFINITIONS,
  STRAIN_DOMAIN_PROGRESS_MAX,
  computeStrainDomainState,
  domainBoundaryLabel,
  domainProgressAtMiddle,
  strainAtDomainDepth,
  type StrainDomainId,
  type StrainDomainState,
} from "../core/strainDomainDiagram";
import "./strain-domains.css";

const INITIAL_PROGRESS = 2.45;
const INITIAL_FCK_MPA = 30;
const GEOMETRY = STRAIN_DOMAIN_DEFAULT_GEOMETRY;

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

function finiteDepth(value: number) {
  if (value === Number.POSITIVE_INFINITY) return "+∞ · curvatura nula";
  if (value === Number.NEGATIVE_INFINITY) return "−∞ · curvatura nula";
  return `${fmt(value, 1)} mm`;
}

function pivotLabel(state: StrainDomainState) {
  return state.activePivots.join(" + ");
}

function domainTone(id: StrainDomainId) {
  return id.toLowerCase();
}

function useContainerWidth(minimum = 300) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(660);
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

function stateAt(progress: number, fckMpa: number) {
  return computeStrainDomainState({
    progress,
    fckMpa,
    ...GEOMETRY,
  });
}

type DomainMapProps = {
  state: StrainDomainState;
};

function NormativeDomainMap({ state }: DomainMapProps) {
  const generatedId = useId().replaceAll(":", "");
  const { ref, width } = useContainerWidth(360);
  const compact = width < 590;
  const height = compact ? 480 : 530;
  const margin = {
    top: compact ? 68 : 72,
    right: compact ? 28 : 46,
    bottom: 58,
    left: compact ? 55 : 72,
  };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const xMin = -12;
  const xMax = Math.max(4.3, state.concrete.epsCu * 1_000 + 0.75);
  const xScale = (strainPerMille: number) =>
    margin.left + (strainPerMille - xMin) / (xMax - xMin) * plotWidth;
  const yScale = (depthMm: number) =>
    margin.top + depthMm / state.input.heightMm * plotHeight;
  const linePath = (candidate: StrainDomainState) =>
    `M${xScale(candidate.epsTop * 1_000)},${yScale(0)} L${xScale(candidate.epsBottom * 1_000)},${yScale(candidate.input.heightMm)}`;
  const boundaries = Array.from({ length: 7 }, (_, index) =>
    stateAt(index, state.input.fckMpa));
  const [uniformTension, d12, d23, d34, d44a, d45, uniformCompression] = boundaries;
  const point = (strain: number, depth: number) =>
    `${xScale(strain * 1_000)},${yScale(depth)}`;
  const a = { strain: -state.epsSu, depth: state.input.effectiveDepthMm };
  const b = { strain: state.concrete.epsCu, depth: 0 };
  const c = { strain: state.concrete.epsC2, depth: state.pointCDepthMm };
  const regions: Array<{
    id: StrainDomainId;
    points: string;
    labelStrain: number;
    labelDepth: number;
  }> = [
    {
      id: "D1",
      points: [
        point(uniformTension.epsTop, 0),
        point(d12.epsTop, 0),
        point(a.strain, a.depth),
      ].join(" "),
      labelStrain: (-state.epsSu * 2) / 3,
      labelDepth: state.input.effectiveDepthMm * 0.29,
    },
    {
      id: "D2",
      points: [
        point(d12.epsTop, 0),
        point(b.strain, b.depth),
        point(a.strain, a.depth),
      ].join(" "),
      labelStrain: (-state.epsSu + state.concrete.epsCu) / 3,
      labelDepth: state.input.effectiveDepthMm * 0.39,
    },
    {
      id: "D3",
      points: [
        point(b.strain, b.depth),
        point(d23.epsAtD, state.input.effectiveDepthMm),
        point(d34.epsAtD, state.input.effectiveDepthMm),
      ].join(" "),
      labelStrain: (state.concrete.epsCu + d23.epsAtD + d34.epsAtD) / 3,
      labelDepth: state.input.effectiveDepthMm * 0.72,
    },
    {
      id: "D4",
      points: [
        point(b.strain, b.depth),
        point(d34.epsAtD, state.input.effectiveDepthMm),
        point(d44a.epsAtD, state.input.effectiveDepthMm),
      ].join(" "),
      labelStrain: (state.concrete.epsCu + d34.epsAtD) / 3,
      labelDepth: state.input.effectiveDepthMm * 0.68,
    },
    {
      id: "D4A",
      points: [
        point(b.strain, b.depth),
        point(d44a.epsAtD, state.input.effectiveDepthMm),
        point(d45.epsBottom, state.input.heightMm),
      ].join(" "),
      labelStrain: state.concrete.epsCu * 0.28,
      labelDepth: state.input.heightMm * 0.63,
    },
    {
      id: "D5",
      points: [
        point(b.strain, b.depth),
        point(uniformCompression.epsTop, 0),
        point(uniformCompression.epsBottom, state.input.heightMm),
        point(d45.epsBottom, state.input.heightMm),
      ].join(" "),
      labelStrain: state.concrete.epsC2 * 0.7,
      labelDepth: state.input.heightMm * 0.42,
    },
  ];
  const concreteLimitsCoincide = Math.abs(
    state.concrete.epsCu - state.concrete.epsC2,
  ) * 1_000 < 0.45;
  const xTicks = [
    { value: -state.epsSu * 1_000, label: "−εsu" },
    { value: -state.steel.epsYd * 1_000, label: "−εyd" },
    { value: 0, label: "0" },
    ...(concreteLimitsCoincide
      ? [{
        value: (state.concrete.epsC2 + state.concrete.epsCu) * 500,
        label: "εc2≈εcu",
      }]
      : [
        { value: state.concrete.epsC2 * 1_000, label: "εc2" },
        { value: state.concrete.epsCu * 1_000, label: "εcu" },
      ]),
  ];
  const pointCNearTop = state.pointCDepthMm < state.input.heightMm * 0.045;
  const depthTicks = [
    { value: 0, label: pointCNearTop ? "0 · zC" : "0" },
    { value: state.input.compressionSteelDepthMm, label: "d′" },
    ...(!pointCNearTop ? [{ value: state.pointCDepthMm, label: "zC" }] : []),
    { value: state.input.effectiveDepthMm, label: "d" },
    { value: state.input.heightMm, label: "h" },
  ];
  const currentTopX = xScale(state.epsTop * 1_000);
  const currentBottomX = xScale(state.epsBottom * 1_000);
  const neutralY = state.neutralAxisInsideSection
    ? yScale(state.neutralAxisDepthMm)
    : null;

  return (
    <div className="domain-map-wrap" ref={ref}>
      <svg
        className="domain-map-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${generatedId}-title ${generatedId}-description`}
      >
        <title id={`${generatedId}-title`}>Mapa interativo dos domínios de deformação</title>
        <desc id={`${generatedId}-description`}>
          Releitura dinâmica da Figura 17.1, com domínios 1, 2, 3, 4, 4a e 5, pivôs A, B e C e o estado atual destacado.
        </desc>
        <defs>
          <clipPath id={`${generatedId}-plot`}>
            <rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} />
          </clipPath>
        </defs>

        <text className="domain-map-heading is-tension" x={xScale(-6.2)} y="24" textAnchor="middle">ALONGAMENTO · ε &lt; 0</text>
        <text className="domain-map-heading is-compression" x={xScale(2.1)} y="24" textAnchor="middle">ENCURTAMENTO · ε &gt; 0</text>
        <text className="domain-map-caption" x={margin.left} y="46">família de diagramas admissíveis no ELU</text>

        <g clipPath={`url(#${generatedId}-plot)`}>
          {regions.map((region) => (
            <polygon
              key={region.id}
              className={`domain-region is-${domainTone(region.id)} ${state.activeDomainIds.includes(region.id) ? "is-active" : ""}`}
              points={region.points}
            />
          ))}

          {depthTicks.map((tick) => (
            <line
              key={`depth-${tick.label}`}
              className={`domain-depth-guide is-${tick.label === "zC" ? "c" : "regular"}`}
              x1={margin.left}
              x2={margin.left + plotWidth}
              y1={yScale(tick.value)}
              y2={yScale(tick.value)}
            />
          ))}
          {xTicks.map((tick) => (
            <line
              key={`strain-${tick.label}`}
              className={`domain-strain-guide is-${tick.label.replace("−", "minus-")}`}
              x1={xScale(tick.value)}
              x2={xScale(tick.value)}
              y1={margin.top}
              y2={margin.top + plotHeight}
            />
          ))}

          {boundaries.map((boundary, index) => (
            <path
              key={`boundary-${index}`}
              className={`domain-boundary-line is-${index}`}
              d={linePath(boundary)}
            />
          ))}

          {neutralY !== null && (
            <line
              className="domain-current-neutral"
              x1={margin.left}
              x2={xScale(0)}
              y1={neutralY}
              y2={neutralY}
            />
          )}
          <path className="domain-current-profile-halo" d={linePath(state)} />
          <path className="domain-current-profile" d={linePath(state)} />
        </g>

        <rect className="domain-map-frame" x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} />
        {xTicks.map((tick, index) => (
          <g key={`x-label-${tick.label}`}>
            <line className="domain-map-tick" x1={xScale(tick.value)} x2={xScale(tick.value)} y1={margin.top + plotHeight} y2={margin.top + plotHeight + 5} />
            <text
              className={`domain-map-axis-label lane-${index % 2}`}
              x={xScale(tick.value)}
              y={margin.top + plotHeight + (index % 2 === 0 ? 18 : 34)}
              textAnchor="middle"
            >
              {tick.label}
            </text>
          </g>
        ))}
        {depthTicks.map((tick) => (
          <g key={`y-label-${tick.label}`}>
            <line className="domain-map-tick" x1={margin.left - 5} x2={margin.left} y1={yScale(tick.value)} y2={yScale(tick.value)} />
            <text className="domain-map-axis-label" x={margin.left - 9} y={yScale(tick.value) + 4} textAnchor="end">{tick.label}</text>
          </g>
        ))}
        <text className="domain-map-axis-title" x={margin.left + plotWidth / 2} y={height - 4} textAnchor="middle">deformação ε [‰] · tração ← 0 → compressão</text>
        <text className="domain-map-axis-title" x="14" y={margin.top + plotHeight / 2} textAnchor="middle" transform={`rotate(-90 14 ${margin.top + plotHeight / 2})`}>profundidade z</text>

        {regions.map((region) => {
          const definition = STRAIN_DOMAIN_DEFINITIONS.find((item) => item.id === region.id)!;
          return (
            <g key={`region-label-${region.id}`} className={`domain-region-label is-${domainTone(region.id)} ${state.activeDomainIds.includes(region.id) ? "is-active" : ""}`}>
              <circle cx={xScale(region.labelStrain * 1_000)} cy={yScale(region.labelDepth)} r={state.activeDomainIds.includes(region.id) ? 16 : 13} />
              <text x={xScale(region.labelStrain * 1_000)} y={yScale(region.labelDepth) + 4} textAnchor="middle">{definition.number}</text>
            </g>
          );
        })}

        <g className={`domain-pivot-point is-a ${state.activePivots.includes("A") ? "is-active" : ""}`}>
          <circle cx={xScale(a.strain * 1_000)} cy={yScale(a.depth)} r="5.5" />
          <text x={xScale(a.strain * 1_000) - 9} y={yScale(a.depth) - 10} textAnchor="end">A · −εsu</text>
        </g>
        <g className={`domain-pivot-point is-b ${state.activePivots.includes("B") ? "is-active" : ""}`}>
          <circle cx={xScale(b.strain * 1_000)} cy={yScale(b.depth)} r="5.5" />
          <text x={xScale(b.strain * 1_000) - 7} y={yScale(b.depth) + 19} textAnchor="end">B · εcu</text>
        </g>
        <g className={`domain-pivot-point is-c ${state.activePivots.includes("C") ? "is-active" : ""}`}>
          <circle cx={xScale(c.strain * 1_000)} cy={yScale(c.depth)} r="5.5" />
          <text
            x={xScale(c.strain * 1_000) + 9}
            y={pointCNearTop ? yScale(c.depth) + 35 : yScale(c.depth) - 9}
          >
            C · εc2
          </text>
        </g>

        <g className="domain-current-endpoint">
          <circle cx={currentTopX} cy={yScale(0)} r="4.2" />
          <text x={currentTopX + (state.epsTop > 0.0028 ? -8 : 8)} y={yScale(0) - 9} textAnchor={state.epsTop > 0.0028 ? "end" : "start"}>εtop={signed(state.epsTop * 1_000, 2)}‰</text>
          <circle cx={currentBottomX} cy={yScale(state.input.heightMm)} r="4.2" />
          <text x={currentBottomX + 8} y={yScale(state.input.heightMm) - 9}>εbottom={signed(state.epsBottom * 1_000, 2)}‰</text>
        </g>
        {neutralY !== null && (
          <text className="domain-neutral-label" x={margin.left + 6} y={neutralY - 6}>LN · x={fmt(state.neutralAxisDepthMm, 1)} mm</text>
        )}
      </svg>
    </div>
  );
}

type MiniDiagramProps = {
  state: StrainDomainState;
  label: string;
  current?: boolean;
};

function MiniDiagram({ state, label, current = false }: MiniDiagramProps) {
  const xMin = -12;
  const xMax = 4.3;
  const xScale = (value: number) => 25 + (value - xMin) / (xMax - xMin) * 150;
  const yScale = (depth: number) => 41 + depth / state.input.heightMm * 177;
  const pivotDepth = state.branch === "steel_pivot"
    ? state.input.effectiveDepthMm
    : state.branch === "concrete_pivot" ? 0 : state.pointCDepthMm;
  const pivotStrain = state.branch === "steel_pivot"
    ? -state.epsSu
    : state.branch === "concrete_pivot" ? state.concrete.epsCu : state.concrete.epsC2;
  return (
    <figure className={`domain-mini-diagram ${current ? "is-current" : ""}`}>
      <figcaption><span>{current ? "agora" : "entrada"}</span><strong>{label}</strong></figcaption>
      <svg viewBox="0 0 200 255" role="img" aria-label={`${label}: diagrama de deformações`}>
        <text className="domain-mini-direction" x={xScale(-5.4)} y="18" textAnchor="middle">tração</text>
        <text className="domain-mini-direction" x={xScale(2.1)} y="18" textAnchor="middle">compressão</text>
        <line className="domain-mini-zero" x1={xScale(0)} x2={xScale(0)} y1={yScale(0)} y2={yScale(state.input.heightMm)} />
        <line className="domain-mini-edge" x1={xScale(0) - 5} x2={xScale(0) + 5} y1={yScale(0)} y2={yScale(0)} />
        <line className="domain-mini-edge" x1={xScale(0) - 5} x2={xScale(0) + 5} y1={yScale(state.input.heightMm)} y2={yScale(state.input.heightMm)} />
        <line className="domain-mini-bar" x1={xScale(0) - 7} x2={xScale(0) + 7} y1={yScale(state.input.compressionSteelDepthMm)} y2={yScale(state.input.compressionSteelDepthMm)} />
        <line className="domain-mini-bar" x1={xScale(0) - 7} x2={xScale(0) + 7} y1={yScale(state.input.effectiveDepthMm)} y2={yScale(state.input.effectiveDepthMm)} />
        {state.neutralAxisInsideSection && (
          <line className="domain-mini-neutral" x1="20" x2="180" y1={yScale(state.neutralAxisDepthMm)} y2={yScale(state.neutralAxisDepthMm)} />
        )}
        <line
          className="domain-mini-profile"
          x1={xScale(state.epsTop * 1_000)}
          y1={yScale(0)}
          x2={xScale(state.epsBottom * 1_000)}
          y2={yScale(state.input.heightMm)}
        />
        <circle className="domain-mini-pivot" cx={xScale(pivotStrain * 1_000)} cy={yScale(pivotDepth)} r="5" />
        <text className="domain-mini-pivot-label" x={xScale(pivotStrain * 1_000) + 8} y={yScale(pivotDepth) - 8}>pivô {state.activePivots[0]}</text>
        <circle className="domain-mini-reading" cx={xScale(state.epsAtD * 1_000)} cy={yScale(state.input.effectiveDepthMm)} r="3.8" />
        <text className="domain-mini-value" x="100" y="241" textAnchor="middle">ε(d)={signed(state.epsAtD * 1_000, 2)}‰</text>
      </svg>
    </figure>
  );
}

function LessonPanel({ state }: { state: StrainDomainState }) {
  const entryState = stateAt(state.domain.start, state.input.fckMpa);
  const strainAtC = strainAtDomainDepth(state, state.pointCDepthMm);
  return (
    <section className={`domain-lesson-panel is-${domainTone(state.domain.id)}`} aria-label="Explicação do domínio atual">
      <header>
        <div><span>passo {state.domain.number}</span><h2>{state.positionLabel}</h2></div>
        <b>{state.domain.interval}</b>
      </header>
      <p className="domain-position-explanation">{state.positionExplanation}</p>
      <div className="domain-mini-comparison">
        <MiniDiagram state={entryState} label={`início de ${state.domain.label}`} />
        <i aria-hidden="true">→</i>
        <MiniDiagram state={state} label="posição selecionada" current />
      </div>
      <div className="domain-lesson-rules">
        <article><span>ponto fixo</span><strong>Pivô {pivotLabel(state)}</strong><p>{state.domain.fixedPoint}</p></article>
        <article><span>o que muda</span><strong>rotação da reta</strong><p>{state.domain.movement}</p></article>
      </div>
      <div className="domain-live-readings">
        <span><small>εc · z=0</small><strong>{signed(state.epsTop * 1_000, 3)}‰</strong></span>
        <span><small>ε2 · z=d′</small><strong>{signed(state.epsAtDPrime * 1_000, 3)}‰</strong></span>
        <span><small>ε1 · z=d</small><strong>{signed(state.epsAtD * 1_000, 3)}‰</strong></span>
        <span><small>ε · z=h</small><strong>{signed(state.epsBottom * 1_000, 3)}‰</strong></span>
      </div>
      <div className="domain-compatibility-line">
        <code>ε(z) = εtop + κ·z</code>
        <span>κ = {signed(state.slopePerMm * 1e6, 3)}‰/m</span>
        <span>x = {finiteDepth(state.neutralAxisDepthMm)}</span>
      </div>
      <aside>
        <CircleDot size={16} aria-hidden="true" />
        <p><b>Leitura física:</b> {state.domain.interpretation}</p>
      </aside>
      {state.branch === "point_c_pivot" && (
        <p className="domain-c-check">Verificação do pivô C: ε(zC) = {signed(strainAtC * 1_000, 3)}‰ = εc2.</p>
      )}
    </section>
  );
}

type DomainNavigatorProps = {
  state: StrainDomainState;
  progress: number;
  playing: boolean;
  fckMpa: number;
  onProgressChange: (value: number) => void;
  onTogglePlay: () => void;
  onFckChange: (value: number) => void;
};

function DomainNavigator({
  state,
  progress,
  playing,
  fckMpa,
  onProgressChange,
  onTogglePlay,
  onFckChange,
}: DomainNavigatorProps) {
  const style = { "--domain-progress": `${progress / 6 * 100}%` } as CSSProperties;
  const previous = () => onProgressChange(Math.max(0, Math.ceil(progress - 1e-9) - 1));
  const next = () => onProgressChange(Math.min(6, Math.floor(progress + 1e-9) + 1));
  return (
    <section className="domain-navigator" aria-label="Percurso dos domínios de deformação">
      <header>
        <div className="domain-navigator-title">
          <Route size={19} aria-hidden="true" />
          <div><h2>Percurso didático completo</h2><p>Uma unidade por domínio; os marcos reproduzem as retas-limite da figura normativa.</p></div>
        </div>
        <div className="domain-class-selector" aria-label="Classe do concreto">
          <span>concreto</span>
          {STRAIN_DOMAIN_CONCRETE_CLASSES.map((value) => (
            <button
              key={value}
              type="button"
              className={fckMpa === value ? "is-active" : ""}
              aria-pressed={fckMpa === value}
              onClick={() => onFckChange(value)}
            >
              C{value}
            </button>
          ))}
        </div>
        <div className="domain-player-buttons">
          <button type="button" aria-label="Voltar ao marco anterior" onClick={previous} disabled={progress <= 0}><ChevronLeft size={16} /></button>
          <button type="button" className="is-play" onClick={onTogglePlay}>
            {playing ? <Pause size={15} /> : <Play size={15} />}
            {playing ? "Pausar" : progress >= 6 ? "Recomeçar" : "Percorrer"}
          </button>
          <button type="button" aria-label="Avançar ao próximo marco" onClick={next} disabled={progress >= 6}><ChevronRight size={16} /></button>
        </div>
      </header>

      <div className="domain-scale">
        <div className="domain-segments" aria-hidden="true">
          {STRAIN_DOMAIN_DEFINITIONS.map((domain) => (
            <div
              key={domain.id}
              className={`is-${domainTone(domain.id)} ${state.activeDomainIds.includes(domain.id) ? "is-active" : ""}`}
              style={{ left: `${domain.start / 6 * 100}%`, width: `${(domain.end - domain.start) / 6 * 100}%` }}
            >
              <span>{domain.label.replace("Domínio ", "D")}</span>
            </div>
          ))}
          <i style={{ left: `${progress / 6 * 100}%` }} />
        </div>
        <input
          className="domain-progress-input"
          type="range"
          min="0"
          max="6"
          step="0.001"
          value={progress}
          style={style}
          aria-label="Posição no percurso completo dos domínios"
          aria-valuetext={`${state.positionLabel}; pivô ${pivotLabel(state)}`}
          onChange={(event) => onProgressChange(Number(event.target.value))}
        />
        <div className="domain-boundary-buttons">
          {Array.from({ length: 7 }, (_, index) => (
            <button
              key={index}
              type="button"
              className={`${index % 2 === 0 ? "is-upper" : "is-lower"} ${index === 0 ? "is-first" : ""} ${index === 6 ? "is-last" : ""}`}
              style={{ left: `${index / 6 * 100}%` }}
              onClick={() => onProgressChange(index)}
            >
              <span>{domainBoundaryLabel(index)}</span>
              <small>s={index}</small>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function DomainSequence({
  state,
  onSelect,
}: {
  state: StrainDomainState;
  onSelect: (domainId: StrainDomainId) => void;
}) {
  return (
    <section className="domain-sequence" aria-label="Passo a passo dos seis domínios">
      <header>
        <BookOpenCheck size={19} aria-hidden="true" />
        <div><h2>Passo a passo para a aula</h2><p>Selecione um cartão para entrar no meio do domínio e explicar sua rotação característica.</p></div>
      </header>
      <div className="domain-sequence-grid">
        {STRAIN_DOMAIN_DEFINITIONS.map((domain) => (
          <button
            key={domain.id}
            type="button"
            className={`is-${domainTone(domain.id)} ${state.activeDomainIds.includes(domain.id) ? "is-active" : ""}`}
            aria-pressed={state.activeDomainIds.includes(domain.id)}
            onClick={() => onSelect(domain.id)}
          >
            <span>{domain.number}</span>
            <div><strong>{domain.label}</strong><code>{domain.interval}</code></div>
            <b>pivô {domain.pivot}</b>
            <p>{domain.interpretation}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

function ConstantsPanel({ state }: { state: StrainDomainState }) {
  return (
    <section className="domain-constants">
      <header>
        <Sigma size={19} aria-hidden="true" />
        <div><h2>Três posições que organizam a figura</h2><p>Ao mudar a classe do concreto, os limites são recalculados e o mapa se ajusta.</p></div>
      </header>
      <div className="domain-constant-grid">
        <article>
          <span>fronteira D2–D3</span><strong>x23 = {fmt(state.x23Mm, 1)} mm</strong>
          <code>x23 = εcu·d / (εcu+εsu)</code><p>{fmt(state.x23Ratio, 3)}·d</p>
        </article>
        <article>
          <span>fronteira D3–D4</span><strong>xlim = {fmt(state.xLimitMm, 1)} mm</strong>
          <code>xlim = εcu·d / (εcu+εyd)</code><p>{fmt(state.xLimitRatio, 3)}·d</p>
        </article>
        <article>
          <span>pivô do domínio 5</span><strong>zC = {fmt(state.pointCDepthMm, 1)} mm</strong>
          <code>zC = (1−εc2/εcu)·h</code><p>{fmt(state.pointCDepthMm / state.input.heightMm, 3)}·h</p>
        </article>
      </div>
      <div className="domain-material-strip">
        <span><small>classe</small><b>C{state.input.fckMpa}</b></span>
        <span><small>εc2</small><b>{fmt(state.concrete.epsC2 * 1_000, 3)}‰</b></span>
        <span><small>εcu</small><b>{fmt(state.concrete.epsCu * 1_000, 3)}‰</b></span>
        <span><small>aço</small><b>CA-50</b></span>
        <span><small>εyd</small><b>{fmt(state.steel.epsYd * 1_000, 3)}‰</b></span>
        <span><small>εsu</small><b>{fmt(state.epsSu * 1_000, 1)}‰</b></span>
      </div>
    </section>
  );
}

function DomainSummaryTable({ state }: { state: StrainDomainState }) {
  const steelCondition: Record<StrainDomainId, string> = {
    D1: "ε1 = −εsu",
    D2: "ε1 = −εsu",
    D3: "−εsu < ε1 < −εyd",
    D4: "−εyd < ε1 < 0",
    D4A: "ε1 > 0",
    D5: "ε1 > 0",
  };
  return (
    <section className="domain-summary-table">
      <header><Gauge size={18} aria-hidden="true" /><div><h2>Régua de classificação</h2><p>A profundidade x e a deformação da armadura em d contam a mesma história por duas leituras complementares.</p></div></header>
      <div className="domain-table-wrap">
        <table>
          <thead><tr><th>Domínio</th><th>Intervalo da LN</th><th>Pivô</th><th>Armadura em d</th><th>Leitura dominante</th></tr></thead>
          <tbody>
            {STRAIN_DOMAIN_DEFINITIONS.map((domain) => (
              <tr key={domain.id} className={state.activeDomainIds.includes(domain.id) ? "is-active" : ""}>
                <th>{domain.label}</th><td><code>{domain.interval}</code></td><td>{domain.pivot}</td><td><code>{steelCondition[domain.id]}</code></td><td>{domain.interpretation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function StrainDomainsLab() {
  const [progress, setProgress] = useState(INITIAL_PROGRESS);
  const [fckMpa, setFckMpa] = useState(INITIAL_FCK_MPA);
  const [playing, setPlaying] = useState(false);
  const state = useMemo(() => stateAt(progress, fckMpa), [progress, fckMpa]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setProgress((current) => Math.min(STRAIN_DOMAIN_PROGRESS_MAX, current + 0.012));
    }, 45);
    return () => window.clearInterval(timer);
  }, [playing]);

  useEffect(() => {
    if (playing && progress >= STRAIN_DOMAIN_PROGRESS_MAX) setPlaying(false);
  }, [playing, progress]);

  const updateProgress = (value: number) => {
    setPlaying(false);
    setProgress(clamp(value, 0, STRAIN_DOMAIN_PROGRESS_MAX));
  };

  const togglePlay = () => {
    if (!playing && progress >= STRAIN_DOMAIN_PROGRESS_MAX) setProgress(0);
    setPlaying((current) => !current);
  };

  return (
    <div className="lab-shell strain-domains-lab">
      <div className={`domain-status is-${domainTone(state.domain.id)}`}>
        <div className="domain-status-badge"><span>estado selecionado</span><strong>{state.positionLabel}</strong></div>
        <div className="domain-status-copy"><h2>{state.positionExplanation}</h2><p>Compressão positiva e tração negativa, conforme a convenção adotada no algoritmo do curso.</p></div>
        <div className="domain-status-pivot"><span>pivô ativo</span><strong>{pivotLabel(state)}</strong><small>s = {fmt(progress, 3)} / 6</small></div>
      </div>

      <div className="domain-main">
        <section className="domain-map-panel" aria-label="Figura normativa dinâmica">
          <header><span>1</span><div><h2>Figura 17.1 reconstruída dinamicamente</h2><p>As linhas finas são fronteiras; a linha luminosa é o estado atual. As áreas coloridas são os seis domínios.</p></div></header>
          <NormativeDomainMap state={state} />
          <div className="domain-map-legend">
            <span><i className="is-boundary" />reta-limite</span><span><i className="is-current" />estado atual</span><span><i className="is-pivot" />pivô ativo</span><span><i className="is-ln" />linha neutra</span>
          </div>
        </section>
        <LessonPanel state={state} />
      </div>

      <DomainNavigator
        state={state}
        progress={progress}
        playing={playing}
        fckMpa={fckMpa}
        onProgressChange={updateProgress}
        onTogglePlay={togglePlay}
        onFckChange={(value) => { setPlaying(false); setFckMpa(value); }}
      />

      <DomainSequence state={state} onSelect={(id) => updateProgress(domainProgressAtMiddle(id))} />

      <div className="domain-reference-grid">
        <ConstantsPanel state={state} />
        <DomainSummaryTable state={state} />
      </div>

      <section className="domain-convention-note">
        <BookOpenCheck size={19} aria-hidden="true" />
        <div><h2>Como ler a figura sem trocar os sinais</h2><p>A ilustração normativa separa alongamento e encurtamento por direção. Aqui a mesma geometria é desenhada com valores algébricos: <b>tração é negativa</b>, <b>compressão é positiva</b> e a linha neutra satisfaz ε=0. O parâmetro <code>s</code> existe apenas para a animação didática; o parâmetro mecânico do algoritmo continua sendo <code>t ∈ [0,3]</code> no laboratório 07.</p></div>
        <button type="button" onClick={() => { setPlaying(false); setProgress(INITIAL_PROGRESS); setFckMpa(INITIAL_FCK_MPA); }}><RotateCcw size={15} />Restaurar exemplo</button>
      </section>
    </div>
  );
}
