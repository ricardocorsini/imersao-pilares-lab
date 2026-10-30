/** Geometria da Aula 03: um contorno simples e maciço, em mm. */
export type PolygonPoint = { x: number; y: number };
export type PolygonPreset = { id: string; label: string; vertices: PolygonPoint[] };
export type PolygonProperties = {
  vertices: PolygonPoint[];
  area: number;
  signedArea: number;
  centroid: PolygonPoint;
  bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
  referenceLength: number;
};
export type MeshCell = PolygonPoint & {
  id: number; col: number; row: number; x0: number; y0: number; width: number; height: number;
  area: number; inside: boolean; onBoundary: boolean;
};
export type MeshMetrics = {
  area: number; centroid: PolygonPoint | null; accepted: number; rejected: number;
  deltaArea: number; signedAreaErrorPercent: number; areaErrorPercent: number;
  deltaX: number | null; deltaY: number | null; centroidDistance: number | null;
  centroidErrorPercent: number | null;
};
export type PolygonMesh = {
  polygon: PolygonProperties; nx: number; ny: number; dx: number; dy: number;
  cells: MeshCell[]; metrics: MeshMetrics;
};
export type RefinementSample = MeshMetrics & { nx: number; ny: number; count: number; step: number };

export const MAX_POLYGON_VERTICES = 80;
export const MAX_MESH_DIVISIONS = 120;
const points = (pairs: number[][]): PolygonPoint[] => pairs.map(([x, y]) => ({ x, y }));
export const POLYGON_PRESETS: PolygonPreset[] = [
  { id: "trapezio", label: "Trapézio", vertices: points([[0, 0], [300, 0], [180, 600], [0, 600]]) },
  { id: "retangulo", label: "Retangular", vertices: points([[0, 0], [300, 0], [300, 600], [0, 600]]) },
  { id: "l", label: "Seção L", vertices: points([[0, 0], [400, 0], [400, 160], [140, 160], [140, 600], [0, 600]]) },
  { id: "t", label: "Seção T", vertices: points([[130, 0], [270, 0], [270, 440], [400, 440], [400, 600], [0, 600], [0, 440], [130, 440]]) },
  { id: "triangulo", label: "Triangular", vertices: points([[0, 0], [400, 0], [70, 600]]) },
  { id: "irregular", label: "Irregular", vertices: points([[-80, 40], [200, -30], [350, 180], [190, 270], [290, 520], [0, 600], [-130, 310]]) },
];

const cross = (a: PolygonPoint, b: PolygonPoint, c: PolygonPoint) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const equalPoint = (a: PolygonPoint, b: PolygonPoint, epsilon: number) =>
  Math.hypot(a.x - b.x, a.y - b.y) <= epsilon;
function onSegment(p: PolygonPoint, a: PolygonPoint, b: PolygonPoint, epsilon: number): boolean {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  return Math.abs(cross(a, b, p)) <= epsilon * length &&
    p.x >= Math.min(a.x, b.x) - epsilon && p.x <= Math.max(a.x, b.x) + epsilon &&
    p.y >= Math.min(a.y, b.y) - epsilon && p.y <= Math.max(a.y, b.y) + epsilon;
}
function segmentsIntersect(a: PolygonPoint, b: PolygonPoint, c: PolygonPoint, d: PolygonPoint, epsilon: number): boolean {
  if (onSegment(a, c, d, epsilon) || onSegment(b, c, d, epsilon) ||
      onSegment(c, a, b, epsilon) || onSegment(d, a, b, epsilon)) return true;
  return (cross(a, b, c) > 0) !== (cross(a, b, d) > 0) &&
    (cross(c, d, a) > 0) !== (cross(c, d, b) > 0);
}

/** Aceita ponto de fechamento repetido; rejeita cruzamentos, contatos e arestas sobrepostas. */
export function polygonProperties(input: readonly PolygonPoint[]): PolygonProperties {
  if (input.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 1e9 || Math.abs(p.y) > 1e9)) {
    throw new Error("Use coordenadas finitas entre −1 bilhão e +1 bilhão de mm.");
  }
  let vertices = input.map(p => ({ ...p }));
  if (vertices.length > 1 && equalPoint(vertices[0], vertices[vertices.length - 1], 0)) vertices = vertices.slice(0, -1);
  if (vertices.length < 3 || vertices.length > MAX_POLYGON_VERTICES) {
    throw new Error(`Informe de 3 a ${MAX_POLYGON_VERTICES} vértices, em ordem ao longo de um único contorno.`);
  }
  const xs = vertices.map(p => p.x), ys = vertices.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const width = maxX - minX, height = maxY - minY, referenceLength = Math.max(width, height);
  if (width <= 0 || height <= 0) throw new Error("O contorno deve delimitar uma área, com largura e altura positivas.");
  const epsilon = referenceLength * 1e-10;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length], c = vertices[(i + 2) % vertices.length];
    if (equalPoint(a, b, epsilon)) throw new Error(`Os vértices ${i + 1} e ${(i + 1) % vertices.length + 1} coincidem.`);
    if (onSegment(c, a, b, epsilon) || onSegment(a, b, c, epsilon)) {
      throw new Error("Há uma aresta que retorna sobre a anterior. Remova os trechos sobrepostos.");
    }
    for (let j = i + 1; j < vertices.length; j++) {
      if (j === i + 1 || (i === 0 && j === vertices.length - 1)) continue;
      if (segmentsIntersect(a, b, vertices[j], vertices[(j + 1) % vertices.length], epsilon)) {
        throw new Error(`As arestas ${i + 1} e ${j + 1} se cruzam ou se tocam. Ordene os vértices pelo contorno.`);
      }
    }
  }
  // Transladar antes das somas reduz o cancelamento em coordenadas muito afastadas da origem.
  const origin = vertices[0];
  let twiceArea = 0, weightedX = 0, weightedY = 0;
  vertices.forEach((p, i) => {
    const q = vertices[(i + 1) % vertices.length];
    const px = p.x - origin.x, py = p.y - origin.y, qx = q.x - origin.x, qy = q.y - origin.y;
    const ck = px * qy - qx * py;
    twiceArea += ck; weightedX += (px + qx) * ck; weightedY += (py + qy) * ck;
  });
  if (Math.abs(twiceArea) <= referenceLength ** 2 * 1e-12) throw new Error("A área é nula ou o contorno é numericamente degenerado.");
  return {
    vertices, signedArea: twiceArea / 2, area: Math.abs(twiceArea / 2),
    centroid: { x: origin.x + weightedX / (3 * twiceArea), y: origin.y + weightedY / (3 * twiceArea) },
    bounds: { minX, minY, maxX, maxY, width, height }, referenceLength,
  };
}

/** Um par por linha: “x y”, “x; y” ou “x, y”; vírgula decimal com separador ; ou espaço. */
export function parsePolygonCoordinates(text: string): PolygonPoint[] {
  const rows = text.trim().split(/\r?\n/).filter(row => row.trim());
  if (rows.length > MAX_POLYGON_VERTICES + 1) throw new Error(`Use no máximo ${MAX_POLYGON_VERTICES} vértices.`);
  const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
  const vertices = rows.map((row, index) => {
    const clean = row.trim().replace(/^\(/, "").replace(/\)$/, "");
    const tokens = clean.includes(";") ? clean.split(";") : /\s/.test(clean.trim()) && !/,\s/.test(clean) ? clean.split(/\s+/) : clean.split(",");
    const normalized = tokens.map(token => token.trim().replace(",", "."));
    if (normalized.length !== 2 || normalized.some(token => !numberPattern.test(token))) {
      throw new Error(`Linha ${index + 1}: informe apenas x e y, por exemplo “120; 600”.`);
    }
    return { x: Number(normalized[0]), y: Number(normalized[1]) };
  });
  return polygonProperties(vertices).vertices;
}

export const formatPolygonCoordinates = (vertices: readonly PolygonPoint[]) =>
  vertices.map(p => `${p.x}; ${p.y}`).join("\n");

/** Paridade de cruzamentos de um raio; o contorno é incluído explicitamente. */
export function classifyPolygonPoint(point: PolygonPoint, polygon: PolygonProperties): { inside: boolean; onBoundary: boolean } {
  const { vertices, referenceLength } = polygon;
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[j], b = vertices[i];
    if (onSegment(point, a, b, referenceLength * 1e-10)) return { inside: true, onBoundary: true };
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return { inside, onBoundary: false };
}

export function resolutionForTarget(polygon: PolygonProperties, size: number): { nx: number; ny: number } {
  if (!Number.isFinite(size) || size <= 0) throw new Error("O tamanho-alvo deve ser positivo, em mm.");
  const nx = Math.max(1, Math.ceil(polygon.bounds.width / size)), ny = Math.max(1, Math.ceil(polygon.bounds.height / size));
  if (nx > MAX_MESH_DIVISIONS || ny > MAX_MESH_DIVISIONS) {
    throw new Error(`Este passo excede ${MAX_MESH_DIVISIONS} divisões por direção. Use pelo menos ${(polygon.referenceLength / MAX_MESH_DIVISIONS).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} mm.`);
  }
  return { nx, ny };
}

export function buildPolygonMesh(polygon: PolygonProperties, nx: number, ny: number): PolygonMesh {
  if (![nx, ny].every(n => Number.isInteger(n) && n >= 1 && n <= MAX_MESH_DIVISIONS)) {
    throw new Error(`Use entre 1 e ${MAX_MESH_DIVISIONS} divisões inteiras em cada direção.`);
  }
  const { minX, minY, width, height } = polygon.bounds;
  const dx = width / nx, dy = height / ny, cellArea = dx * dy;
  const cells: MeshCell[] = [];
  let accepted = 0, weightedX = 0, weightedY = 0;
  for (let row = 0; row < ny; row++) for (let col = 0; col < nx; col++) {
    const x = minX + (col + 0.5) * dx, y = minY + (row + 0.5) * dy;
    const classification = classifyPolygonPoint({ x, y }, polygon);
    cells.push({ id: cells.length, col, row, x0: minX + col * dx, y0: minY + row * dy, width: dx, height: dy, x, y, area: cellArea, ...classification });
    if (classification.inside) {
      accepted++; weightedX += cellArea * (x - polygon.centroid.x); weightedY += cellArea * (y - polygon.centroid.y);
    }
  }
  const area = accepted * cellArea;
  const deltaX = accepted ? weightedX / area : null, deltaY = accepted ? weightedY / area : null;
  const centroid = deltaX === null || deltaY === null ? null : { x: polygon.centroid.x + deltaX, y: polygon.centroid.y + deltaY };
  const centroidDistance = deltaX === null || deltaY === null ? null : Math.hypot(deltaX, deltaY);
  const deltaArea = area - polygon.area, signedAreaErrorPercent = deltaArea / polygon.area * 100;
  return {
    polygon, nx, ny, dx, dy, cells,
    metrics: { area, centroid, accepted, rejected: cells.length - accepted, deltaArea,
      signedAreaErrorPercent, areaErrorPercent: Math.abs(signedAreaErrorPercent), deltaX, deltaY, centroidDistance,
      centroidErrorPercent: centroidDistance === null ? null : centroidDistance / polygon.referenceLength * 100 },
  };
}

/** Compara malhas semelhantes em forma; só a resolução muda, nunca o contorno ou a origem. */
export function polygonRefinementStudy(polygon: PolygonProperties): RefinementSample[] {
  const resolutions = new Set<string>();
  return [2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 120].flatMap(level => {
    const nx = Math.max(1, Math.round(level * polygon.bounds.width / polygon.referenceLength));
    const ny = Math.max(1, Math.round(level * polygon.bounds.height / polygon.referenceLength));
    const key = `${nx}/${ny}`;
    if (resolutions.has(key)) return [];
    resolutions.add(key);
    const mesh = buildPolygonMesh(polygon, nx, ny);
    return [{ nx, ny, count: nx * ny, step: Math.max(mesh.dx, mesh.dy), ...mesh.metrics }];
  });
}
