export type Point2D = Readonly<{
  xMm: number;
  yMm: number;
}>;

export type GeometryBar = Point2D & Readonly<{
  id: string;
  areaMm2: number;
}>;

export type ProjectionGeometryDefinition = Readonly<{
  id: "rectangle" | "l-section";
  label: string;
  shortLabel: string;
  description: string;
  outline: readonly Point2D[];
  bars: readonly GeometryBar[];
}>;

export type ProjectedGeometryInput = Readonly<{
  geometryId: ProjectionGeometryDefinition["id"];
  thetaDeg: number;
  neutralAxisRatio: number;
}>;

export type ProjectedGeometryBar = GeometryBar & Readonly<{
  projectionMm: number;
  depthMm: number;
  relativeDepth: number;
  side: "compression" | "neutral" | "tension";
}>;

export type ProjectedGeometryState = Readonly<{
  input: ProjectedGeometryInput;
  geometry: ProjectionGeometryDefinition;
  thetaRad: number;
  cosine: number;
  sine: number;
  tangentX: number;
  tangentY: number;
  pMaxMm: number;
  pMinMm: number;
  heightMm: number;
  neutralAxisProjectionMm: number;
  neutralAxisDepthMm: number;
  bars: readonly ProjectedGeometryBar[];
  tensileBars: readonly ProjectedGeometryBar[];
  effectiveDepthMm: number | null;
  tensileCentroid: Point2D | null;
  tensileCentroidProjectionMm: number | null;
}>;

const BAR_DIAMETER_MM = 16;
const BAR_AREA_MM2 = Math.PI * BAR_DIAMETER_MM ** 2 / 4;

function polygonCentroid(points: readonly Point2D[]) {
  let areaTwice = 0;
  let xSum = 0;
  let ySum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = current.xMm * next.yMm - next.xMm * current.yMm;
    areaTwice += cross;
    xSum += (current.xMm + next.xMm) * cross;
    ySum += (current.yMm + next.yMm) * cross;
  }
  if (Math.abs(areaTwice) < 1e-9) throw new Error("O polígono da seção possui área nula.");
  return {
    xMm: xSum / (3 * areaTwice),
    yMm: ySum / (3 * areaTwice),
  };
}

function centeredGeometry(
  definition: Omit<ProjectionGeometryDefinition, "outline" | "bars"> & {
    outline: readonly Point2D[];
    bars: readonly GeometryBar[];
  },
): ProjectionGeometryDefinition {
  const centroid = polygonCentroid(definition.outline);
  return Object.freeze({
    ...definition,
    outline: Object.freeze(definition.outline.map((point) => Object.freeze({
      xMm: point.xMm - centroid.xMm,
      yMm: point.yMm - centroid.yMm,
    }))),
    bars: Object.freeze(definition.bars.map((bar) => Object.freeze({
      ...bar,
      xMm: bar.xMm - centroid.xMm,
      yMm: bar.yMm - centroid.yMm,
    }))),
  });
}

const rectangleHalfWidth = 150;
const rectangleHalfHeight = 300;
const rectangleBarX = 100.7;
const rectangleBarY = 250.7;

const rectangle = centeredGeometry({
  id: "rectangle",
  label: "Seção retangular 30 × 60 cm",
  shortLabel: "Retangular",
  description: "O contorno retangular evidencia os casos-limite θ = 0° e θ = 90°.",
  outline: [
    { xMm: -rectangleHalfWidth, yMm: -rectangleHalfHeight },
    { xMm: rectangleHalfWidth, yMm: -rectangleHalfHeight },
    { xMm: rectangleHalfWidth, yMm: rectangleHalfHeight },
    { xMm: -rectangleHalfWidth, yMm: rectangleHalfHeight },
  ],
  bars: [
    { id: "B1", xMm: -rectangleBarX, yMm: -rectangleBarY, areaMm2: BAR_AREA_MM2 },
    { id: "B2", xMm: 0, yMm: -rectangleBarY, areaMm2: BAR_AREA_MM2 },
    { id: "B3", xMm: rectangleBarX, yMm: -rectangleBarY, areaMm2: BAR_AREA_MM2 },
    { id: "B4", xMm: -rectangleBarX, yMm: 0, areaMm2: BAR_AREA_MM2 },
    { id: "B5", xMm: rectangleBarX, yMm: 0, areaMm2: BAR_AREA_MM2 },
    { id: "B6", xMm: -rectangleBarX, yMm: rectangleBarY, areaMm2: BAR_AREA_MM2 },
    { id: "B7", xMm: 0, yMm: rectangleBarY, areaMm2: BAR_AREA_MM2 },
    { id: "B8", xMm: rectangleBarX, yMm: rectangleBarY, areaMm2: BAR_AREA_MM2 },
  ],
});

const lSection = centeredGeometry({
  id: "l-section",
  label: "Seção L 45 × 60 cm",
  shortLabel: "Seção L",
  description: "Na seção não retangular, as bordas extremas e as profundidades mudam de forma menos intuitiva.",
  outline: [
    { xMm: -225, yMm: -300 },
    { xMm: -45, yMm: -300 },
    { xMm: -45, yMm: 120 },
    { xMm: 225, yMm: 120 },
    { xMm: 225, yMm: 300 },
    { xMm: -225, yMm: 300 },
  ],
  bars: [
    { id: "L1", xMm: -180, yMm: -255, areaMm2: BAR_AREA_MM2 },
    { id: "L2", xMm: -90, yMm: -255, areaMm2: BAR_AREA_MM2 },
    { id: "L3", xMm: -180, yMm: -100, areaMm2: BAR_AREA_MM2 },
    { id: "L4", xMm: -90, yMm: -100, areaMm2: BAR_AREA_MM2 },
    { id: "L5", xMm: -180, yMm: 55, areaMm2: BAR_AREA_MM2 },
    { id: "L6", xMm: -90, yMm: 55, areaMm2: BAR_AREA_MM2 },
    { id: "L7", xMm: -180, yMm: 255, areaMm2: BAR_AREA_MM2 },
    { id: "L8", xMm: -60, yMm: 255, areaMm2: BAR_AREA_MM2 },
    { id: "L9", xMm: 60, yMm: 255, areaMm2: BAR_AREA_MM2 },
    { id: "L10", xMm: 180, yMm: 255, areaMm2: BAR_AREA_MM2 },
  ],
});

export const PROJECTION_GEOMETRIES = Object.freeze([rectangle, lSection]);

export function getProjectionGeometry(id: ProjectionGeometryDefinition["id"]) {
  const geometry = PROJECTION_GEOMETRIES.find((candidate) => candidate.id === id);
  if (!geometry) throw new Error(`Geometria desconhecida: ${id}`);
  return geometry;
}

export function projectPoint(point: Point2D, cosine: number, sine: number) {
  return point.xMm * cosine + point.yMm * sine;
}

export function computeProjectedGeometry(
  input: ProjectedGeometryInput,
): ProjectedGeometryState {
  if (!Number.isFinite(input.thetaDeg)) throw new Error("thetaDeg deve ser finito.");
  if (!Number.isFinite(input.neutralAxisRatio) || input.neutralAxisRatio < 0 || input.neutralAxisRatio > 1) {
    throw new Error("neutralAxisRatio deve estar entre 0 e 1.");
  }

  const geometry = getProjectionGeometry(input.geometryId);
  const thetaDeg = ((input.thetaDeg % 360) + 360) % 360;
  const thetaRad = thetaDeg * Math.PI / 180;
  const cosine = Math.cos(thetaRad);
  const sine = Math.sin(thetaRad);
  const tangentX = -sine;
  const tangentY = cosine;
  const vertexProjections = geometry.outline.map((point) => projectPoint(point, cosine, sine));
  const pMaxMm = Math.max(...vertexProjections);
  const pMinMm = Math.min(...vertexProjections);
  const heightMm = pMaxMm - pMinMm;
  const neutralAxisDepthMm = input.neutralAxisRatio * heightMm;
  const neutralAxisProjectionMm = pMaxMm - neutralAxisDepthMm;
  const tolerance = Math.max(1e-9, heightMm * 1e-10);

  const bars = geometry.bars.map((bar): ProjectedGeometryBar => {
    const projectionMm = projectPoint(bar, cosine, sine);
    const depthMm = pMaxMm - projectionMm;
    const difference = depthMm - neutralAxisDepthMm;
    return Object.freeze({
      ...bar,
      projectionMm,
      depthMm,
      relativeDepth: depthMm / heightMm,
      side: Math.abs(difference) <= tolerance
        ? "neutral"
        : difference < 0 ? "compression" : "tension",
    });
  });
  const tensileBars = bars.filter((bar) => bar.side === "tension");
  const tensileAreaMm2 = tensileBars.reduce((sum, bar) => sum + bar.areaMm2, 0);
  const tensileCentroid = tensileAreaMm2 <= 0
    ? null
    : Object.freeze({
      xMm: tensileBars.reduce((sum, bar) => sum + bar.xMm * bar.areaMm2, 0) / tensileAreaMm2,
      yMm: tensileBars.reduce((sum, bar) => sum + bar.yMm * bar.areaMm2, 0) / tensileAreaMm2,
    });
  const tensileCentroidProjectionMm = tensileCentroid
    ? projectPoint(tensileCentroid, cosine, sine)
    : null;
  const effectiveDepthMm = tensileCentroidProjectionMm === null
    ? null
    : pMaxMm - tensileCentroidProjectionMm;

  return Object.freeze({
    input: Object.freeze({ ...input, thetaDeg }),
    geometry,
    thetaRad,
    cosine,
    sine,
    tangentX,
    tangentY,
    pMaxMm,
    pMinMm,
    heightMm,
    neutralAxisProjectionMm,
    neutralAxisDepthMm,
    bars: Object.freeze(bars),
    tensileBars: Object.freeze(tensileBars),
    effectiveDepthMm,
    tensileCentroid,
    tensileCentroidProjectionMm,
  });
}
