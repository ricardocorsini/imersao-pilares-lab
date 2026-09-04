import { useEffect, useId, useMemo, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import { interactionBounds } from "../core/interactionData";
import {
  CUT_COLORS, CUT_INDEX, CUT_LABELS, CUT_TITLES, formatInteraction, interpolatePoint, pointOnSlice,
  type CutAxis, type CutValues, type InteractionPoint, type SliceResult,
} from "../core/interactionMesh";

type Props = {
  axis: CutAxis;
  value: number;
  cuts: CutValues;
  slice: SliceResult;
  active: boolean;
  autoScale: boolean;
  selected: InteractionPoint | null;
  onActivate: () => void;
  onInspect: (point: InteractionPoint, source: string, pin: boolean) => void;
};
const axisName = ["Mₓ", "Mᵧ", "N"];
const axisUnit = ["kN·m", "kN·m", "kN"];

function paddedDomain(range: [number, number]): [number, number] {
  const spread = Math.max(range[1] - range[0], 1);
  return [range[0] - spread * 0.08, range[1] + spread * 0.08];
}
function ticks(domain: [number, number]) {
  const raw = (domain[1] - domain[0]) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const multiple = raw / magnitude;
  const step = (multiple > 5 ? 10 : multiple > 2 ? 5 : multiple > 1 ? 2 : 1) * magnitude;
  const result: number[] = [];
  for (let v = Math.ceil(domain[0] / step) * step; v <= domain[1] + step * 1e-8; v += step) result.push(v);
  return result;
}

export function InteractionSliceChart({ axis, value, cuts, slice, active, autoScale, selected, onActivate, onInspect }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const clipId = useId().replaceAll(":", "");
  const [width, setWidth] = useState(380);
  const keyboardIndex = useRef(0);
  useEffect(() => {
    const element = holder.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(200, entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const xDimension = axis === "mx" ? 1 : 0;
  const yDimension = axis === "n" ? 1 : 2;
  const points = useMemo(() => [...slice.paths.flat(), ...slice.isolated], [slice]);
  const domain = (dimension: number) => {
    if (!autoScale || points.length < 2) return paddedDomain(interactionBounds[dimension]);
    return paddedDomain([Math.min(...points.map(p => p[dimension])), Math.max(...points.map(p => p[dimension]))]);
  };
  const xDomain = domain(xDimension);
  const yDomain = domain(yDimension);
  const tickDigits = (range: [number, number]) => Math.min(4, Math.max(0, Math.ceil(-Math.log10((range[1] - range[0]) / 4))));
  const height = 268;
  const frame = { left: 61, right: width - 17, top: 26, bottom: height - 45 };
  const xScale = (v: number) => frame.left + (v - xDomain[0]) / (xDomain[1] - xDomain[0]) * (frame.right - frame.left);
  const yScale = (v: number) => frame.bottom - (v - yDomain[0]) / (yDomain[1] - yDomain[0]) * (frame.bottom - frame.top);
  const position = (p: InteractionPoint) => `${xScale(p[xDimension]).toFixed(2)},${yScale(p[yDimension]).toFixed(2)}`;
  const selectedHere = selected && pointOnSlice(selected, axis, value) ? selected : null;

  const inspect = (event: PointerEvent<SVGSVGElement>, pin: boolean) => {
    if (!points.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) * width / rect.width;
    const py = (event.clientY - rect.top) * height / rect.height;
    if (px < frame.left || px > frame.right || py < frame.top || py > frame.bottom) return;
    let best: InteractionPoint = points[0];
    let bestDistance = Infinity;
    for (const path of slice.paths) for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]; const b = path[i];
      const ax = xScale(a[xDimension]); const ay = yScale(a[yDimension]);
      const dx = xScale(b[xDimension]) - ax; const dy = yScale(b[yDimension]) - ay;
      const t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
      const distance = Math.hypot(px - ax - t * dx, py - ay - t * dy);
      if (distance < bestDistance) { bestDistance = distance; best = interpolatePoint(a, b, t); }
    }
    for (const point of slice.isolated) {
      const distance = Math.hypot(px - xScale(point[xDimension]), py - yScale(point[yDimension]));
      if (distance < bestDistance) { bestDistance = distance; best = point; }
    }
    onInspect(best, `Corte ${CUT_LABELS[axis]} = ${formatInteraction(value)}`, pin);
  };
  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    if (!points.length || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") keyboardIndex.current = 0;
    else if (event.key === "End") keyboardIndex.current = points.length - 1;
    else keyboardIndex.current = (keyboardIndex.current + (event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 1) + points.length) % points.length;
    onInspect(points[keyboardIndex.current % points.length], `Corte ${CUT_LABELS[axis]} = ${formatInteraction(value)}`, true);
  };

  const outline = (base: boolean) => slice.paths.map(path => {
    let d = ""; let connected = false;
    for (let i = 1; i < path.length; i++) {
      const isBase = axis !== "n" && Math.abs(path[i - 1][2]) < 1e-5 && Math.abs(path[i][2]) < 1e-5;
      if (isBase !== base) { connected = false; continue; }
      d += `${connected ? "" : `M${position(path[i - 1])}`}L${position(path[i])}`;
      connected = true;
    }
    return d;
  }).join(" ");

  return <section className={`slice-chart ${active ? "is-active" : ""}`} style={{ "--cut-color": CUT_COLORS[axis] } as React.CSSProperties}>
    <header>
      <button type="button" onClick={onActivate} aria-pressed={active} title="Selecionar este plano para arrastar no 3D">
        <span className="cut-swatch" aria-hidden="true" />
        <h3>{CUT_TITLES[axis]}</h3>
      </button>
      <span>{CUT_LABELS[axis]} = {formatInteraction(value)} <small>{axis === "n" ? "kN" : "kN·m"}</small></span>
    </header>
    <div ref={holder} className="slice-svg-wrap">
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="slice-svg"
        tabIndex={0} role="img" aria-label={`${CUT_TITLES[axis]}, ${CUT_LABELS[axis]} constante. Setas do teclado percorrem a curva; toque ou clique para fixar um ponto.`}
        onKeyDown={onKey} onPointerMove={event => { if (event.pointerType === "mouse") inspect(event, false); }}
        onPointerDown={event => inspect(event, true)}>
        <title>{CUT_TITLES[axis]} · corte real da malha 3D</title>
        <defs><clipPath id={clipId}><rect x={frame.left} y={frame.top} width={frame.right - frame.left} height={frame.bottom - frame.top} /></clipPath></defs>
        <rect x={frame.left} y={frame.top} width={frame.right - frame.left} height={frame.bottom - frame.top} fill="#0a1e2d" />
        {ticks(xDomain).map(v => <g key={`x${v}`}>
          <line x1={xScale(v)} x2={xScale(v)} y1={frame.top} y2={frame.bottom} stroke={Math.abs(v) < 1e-8 ? "#627f92" : "#233f52"} />
          <text x={xScale(v)} y={frame.bottom + 19} textAnchor="middle">{formatInteraction(v, tickDigits(xDomain))}</text>
        </g>)}
        {ticks(yDomain).map(v => <g key={`y${v}`}>
          <line x1={frame.left} x2={frame.right} y1={yScale(v)} y2={yScale(v)} stroke={Math.abs(v) < 1e-8 ? "#627f92" : "#233f52"} />
          <text x={frame.left - 8} y={yScale(v) + 4} textAnchor="end">{formatInteraction(v, tickDigits(yDomain))}</text>
        </g>)}
        <text className="chart-axis-title" x={frame.left} y={15}>{axisName[yDimension]} · {axisUnit[yDimension]}</text>
        <text className="chart-axis-title" x={frame.right} y={height - 6} textAnchor="end">{axisName[xDimension]} · {axisUnit[xDimension]}</text>
        <g clipPath={`url(#${clipId})`}>
          {slice.paths.map((path, i) => <path key={i} d={`M${path.map(position).join("L")}`} fill={CUT_COLORS[axis]} fillOpacity={0.06} stroke="none" />)}
          {(["mx", "my", "n"] as CutAxis[]).filter(a => a !== axis).map(other => {
            const dimension = CUT_INDEX[other];
            return dimension === xDimension
              ? <line key={other} x1={xScale(cuts[other])} x2={xScale(cuts[other])} y1={frame.top} y2={frame.bottom} stroke={CUT_COLORS[other]} strokeDasharray="4 5" opacity={0.65} />
              : <line key={other} x1={frame.left} x2={frame.right} y1={yScale(cuts[other])} y2={yScale(cuts[other])} stroke={CUT_COLORS[other]} strokeDasharray="4 5" opacity={0.65} />;
          })}
          <path d={outline(false)} fill="none" stroke={CUT_COLORS[axis]} strokeWidth={3} strokeLinejoin="round" />
          <path d={outline(true)} fill="none" stroke={CUT_COLORS[axis]} strokeWidth={2} strokeDasharray="5 5" />
          {slice.isolated.map((point, i) => <circle key={i} cx={xScale(point[xDimension])} cy={yScale(point[yDimension])} r={5} fill={CUT_COLORS[axis]} />)}
          {selectedHere && <g>
            <line x1={xScale(selectedHere[xDimension])} x2={xScale(selectedHere[xDimension])} y1={frame.top} y2={frame.bottom} stroke="#ffffff" opacity={0.3} />
            <line x1={frame.left} x2={frame.right} y1={yScale(selectedHere[yDimension])} y2={yScale(selectedHere[yDimension])} stroke="#ffffff" opacity={0.3} />
            <circle cx={xScale(selectedHere[xDimension])} cy={yScale(selectedHere[yDimension])} r={5} fill="#fff" stroke={CUT_COLORS[axis]} strokeWidth={2} />
          </g>}
        </g>
        {!points.length && <text x={(frame.left + frame.right) / 2} y={height / 2} textAnchor="middle">Sem interseção</text>}
      </svg>
    </div>
    <div className="slice-readout">
      {selectedHere ? <span>{axisName[xDimension]} <b>{formatInteraction(selectedHere[xDimension])}</b> {axisUnit[xDimension]} <span aria-hidden="true">·</span> {axisName[yDimension]} <b>{formatInteraction(selectedHere[yDimension])}</b> {axisUnit[yDimension]}</span>
        : <span>{slice.isolated.length && !slice.paths.length ? "Interseção reduzida a um ponto" : "Cursor, toque ou ← → para ler valores"}</span>}
    </div>
  </section>;
}
