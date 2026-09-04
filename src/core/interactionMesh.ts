/** Coordenadas físicas, nunca as coordenadas normalizadas da cena. */
export type InteractionPoint = [mxKnm: number, myKnm: number, nKn: number];
export type Triangle = [number, number, number];
export type CutAxis = "n" | "my" | "mx";
export type CutValues = Record<CutAxis, number>;
export type SliceResult = { paths: InteractionPoint[][]; isolated: InteractionPoint[] };
export const CUT_INDEX: Record<CutAxis, 0 | 1 | 2> = { mx: 0, my: 1, n: 2 };
export const CUT_COLORS: Record<CutAxis, string> = { n: "#00e5ff", my: "#ff46cb", mx: "#ffcd38" };
export const CUT_LABELS: Record<CutAxis, string> = { n: "N", my: "Mᵧ", mx: "Mₓ" };
export const CUT_TITLES: Record<CutAxis, string> = { n: "Mₓ × Mᵧ", my: "Mₓ × N", mx: "Mᵧ × N" };

export function interpolatePoint(a: InteractionPoint, b: InteractionPoint, t: number): InteractionPoint {
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])];
}

/** Interseção exata por partes com os triângulos usados no desenho 3D.
 * Não usa fecho convexo nem reordenação polar, preservando componentes.
 * Triângulos coplanares são ignorados: as faces vizinhas fornecem o contorno.
 */
export function sliceMesh(
  vertices: InteractionPoint[], triangles: Triangle[], axis: CutAxis, value: number,
): SliceResult {
  if (!Number.isFinite(value)) throw new Error("Corte não finito.");
  const dimension = CUT_INDEX[axis];
  const tolerance = 1e-7;
  const points = new Map<string, InteractionPoint>();
  const neighbors = new Map<string, Set<string>>();
  const edges = new Map<string, [string, string]>();
  const keyOf = (p: InteractionPoint) => p.map(v => Math.round(v * 1e6)).join(":");
  const edgeKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;

  for (const triangle of triangles) {
    const corners = triangle.map(index => vertices[index]);
    const distance = corners.map(p => p[dimension] - value);
    if (distance.every(d => d > tolerance) || distance.every(d => d < -tolerance)) continue;
    if (distance.every(d => Math.abs(d) <= tolerance)) continue;
    const hits = new Map<string, InteractionPoint>();
    const add = (p: InteractionPoint) => {
      const point = [...p] as InteractionPoint;
      point[dimension] = value;
      hits.set(keyOf(point), point);
    };
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      if (Math.abs(distance[i]) <= tolerance) add(corners[i]);
      if (distance[i] * distance[j] < 0 && Math.abs(distance[i]) > tolerance && Math.abs(distance[j]) > tolerance) {
        add(interpolatePoint(corners[i], corners[j], distance[i] / (distance[i] - distance[j])));
      }
    }
    for (const [key, point] of hits) points.set(key, point);
    const keys = [...hits.keys()];
    if (keys.length === 2) {
      const [a, b] = keys;
      edges.set(edgeKey(a, b), [a, b]);
      if (!neighbors.has(a)) neighbors.set(a, new Set());
      if (!neighbors.has(b)) neighbors.set(b, new Set());
      neighbors.get(a)!.add(b);
      neighbors.get(b)!.add(a);
    }
  }

  const unused = new Set(edges.keys());
  const paths: InteractionPoint[][] = [];
  function walk(start: string, next: string) {
    const path = [points.get(start)!];
    let current = start;
    let following: string | undefined = next;
    while (following !== undefined) {
      unused.delete(edgeKey(current, following));
      current = following;
      path.push(points.get(current)!);
      if (current === start) break;
      following = [...(neighbors.get(current) ?? [])].find(node => unused.has(edgeKey(current, node)));
    }
    if (path.length > 1) paths.push(path);
  }
  // Primeiro os componentes abertos; depois os anéis fechados.
  for (const [node, adjacent] of neighbors) {
    if (adjacent.size === 2) continue;
    for (const next of adjacent) if (unused.has(edgeKey(node, next))) walk(node, next);
  }
  while (unused.size) {
    const key = unused.values().next().value!;
    const [a, b] = edges.get(key)!;
    walk(a, b);
  }
  const isolated = [...points].filter(([key]) => !neighbors.has(key)).map(([, point]) => point);
  return { paths, isolated };
}

export function pointOnSlice(point: InteractionPoint, axis: CutAxis, value: number) {
  return Math.abs(point[CUT_INDEX[axis]] - value) < 1e-5;
}

export function formatInteraction(value: number, digits = 1) {
  return (Math.abs(value) < 0.00001 ? 0 : value).toLocaleString("pt-BR", {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  });
}
