import { radialIntersections } from "./radialVerification.ts";
import type { InteractionPoint, SliceResult, Triangle } from "./interactionMesh.ts";

export type InteractionDisplayMode = "fibers" | "overlay" | "approximate";
export const NBR_APPROXIMATION_COLOR = "#ffad66";

/** Módulos dos interceptos em cada sentido, sempre para o MESMO N. */
export type UniaxialResistances = {
  nKn: number;
  mxPositive: number;
  mxNegative: number;
  myPositive: number;
  myNegative: number;
  status: "valid" | "point" | "unavailable";
  reason: string;
};

export type ApproximateInteractionSurface = {
  vertices: InteractionPoint[];
  triangles: Triangle[];
  rings: number[][];
};

export type RadialComparison = {
  phiDeg: number;
  fiberRadiusKnm: number;
  approximateRadiusKnm: number;
  differencePercent: number;
  fiberPoint: InteractionPoint;
  approximatePoint: InteractionPoint;
};

function checkAlpha(alpha: number) {
  if (!Number.isFinite(alpha) || alpha < 1 || alpha > 2) {
    throw new Error("O expoente didático α deve estar entre 1 e 2.");
  }
}

/** Interseções com os eixos, NÃO os máximos Mx/My de um ponto oblíquo. */
export function extractUniaxialResistances(slice: SliceResult, nKn: number): UniaxialResistances {
  if (!Number.isFinite(nKn)) throw new Error("N deve ser finito.");
  const points = [...slice.paths.flat(), ...slice.isolated];
  const empty: UniaxialResistances = {
    nKn, mxPositive: 0, mxNegative: 0, myPositive: 0, myNegative: 0,
    status: "unavailable", reason: "Não há quatro interceptos uniaxiais válidos.",
  };
  if (!points.length) return empty;
  if (points.some(point => point.some(value => !Number.isFinite(value)))) {
    throw new Error("A curva contém coordenadas não finitas.");
  }
  if (points.some(point => Math.abs(point[2] - nKn) > 1e-5)) {
    throw new Error("Os interceptos devem pertencer ao mesmo nível N.");
  }
  const scale = Math.max(1, ...points.flatMap(point => [Math.abs(point[0]), Math.abs(point[1])]));
  const tolerance = scale * 1e-8;
  if (points.every(point => Math.hypot(point[0], point[1]) <= tolerance)) {
    return { ...empty, status: "point", reason: "Compressão uniforme: fronteira reduzida a (0,0)." };
  }
  if (!slice.paths.length || slice.paths.some(path =>
    path.length < 4 || Math.hypot(path[0][0] - path.at(-1)![0], path[0][1] - path.at(-1)![1]) > tolerance)) {
    return empty;
  }
  const crossings: number[][] = [[], []];
  for (const path of slice.paths) {
    for (let index = 1; index < path.length; index += 1) {
      const first = path[index - 1];
      const second = path[index];
      for (const axis of [0, 1] as const) {
        const other = axis === 0 ? 1 : 0;
        if (Math.abs(first[other]) <= tolerance) crossings[axis].push(first[axis]);
        if (Math.abs(second[other]) <= tolerance) crossings[axis].push(second[axis]);
        if (first[other] * second[other] < 0) {
          const fraction = first[other] / (first[other] - second[other]);
          crossings[axis].push(first[axis] + fraction * (second[axis] - first[axis]));
        }
      }
    }
  }
  const unique = crossings.map(values => values.sort((a, b) => a - b).filter(
    (value, index, sorted) => index === 0 || Math.abs(value - sorted[index - 1]) > tolerance,
  ));
  const mxPositive = unique[0].filter(value => value > tolerance);
  const mxNegative = unique[0].filter(value => value < -tolerance);
  const myPositive = unique[1].filter(value => value > tolerance);
  const myNegative = unique[1].filter(value => value < -tolerance);
  if ([mxPositive, mxNegative, myPositive, myNegative].some(values => values.length !== 1)) return empty;
  return {
    nKn,
    mxPositive: mxPositive[0], mxNegative: -mxNegative[0],
    myPositive: myPositive[0], myNegative: -myNegative[0],
    status: "valid", reason: "Interceptos de flexão normal extraídos da curva por fibras.",
  };
}

/** |Mx/Mxx|^α + |My/Myy|^α = 1; os denominadores respeitam o quadrante. */
export function approximateBoundaryPoint(
  section: UniaxialResistances, alpha: number, phiDeg: number,
): InteractionPoint | null {
  checkAlpha(alpha);
  if (!Number.isFinite(phiDeg)) throw new Error("φ deve ser finito.");
  if (section.status === "unavailable") return null;
  if (section.status === "point") return [0, 0, section.nKn];
  const phi = phiDeg * Math.PI / 180;
  const cosine = Math.abs(Math.cos(phi)) < 1e-14 ? 0 : Math.cos(phi);
  const sine = Math.abs(Math.sin(phi)) < 1e-14 ? 0 : Math.sin(phi);
  const mxx = cosine >= 0 ? section.mxPositive : section.mxNegative;
  const myy = sine >= 0 ? section.myPositive : section.myNegative;
  const radius = ((Math.abs(cosine) / mxx) ** alpha + (Math.abs(sine) / myy) ** alpha) ** (-1 / alpha);
  return [radius * cosine, radius * sine, section.nKn];
}

export function approximateInteractionIndex(section: UniaxialResistances, alpha: number, mx: number, my: number) {
  checkAlpha(alpha);
  if (![mx, my].every(Number.isFinite)) throw new Error("Os momentos devem ser finitos.");
  if (section.status !== "valid") return null;
  const mxx = mx >= 0 ? section.mxPositive : section.mxNegative;
  const myy = my >= 0 ? section.myPositive : section.myNegative;
  return (Math.abs(mx) / mxx) ** alpha + (Math.abs(my) / myy) ** alpha;
}

/** A direção φ é do VETOR MOMENTO; não é θ, normal à linha neutra. */
export function compareRadialCapacities(
  slice: SliceResult, section: UniaxialResistances, alpha: number, phiDeg: number,
): RadialComparison | null {
  const approximatePoint = approximateBoundaryPoint(section, alpha, phiDeg);
  if (!approximatePoint || section.status !== "valid") return null;
  const phi = phiDeg * Math.PI / 180;
  const direction = { xKnm: Math.cos(phi), yKnm: Math.sin(phi) };
  const radii = slice.paths.flatMap(path => radialIntersections(
    direction, path.slice(0, -1).map(point => ({ xKnm: point[0], yKnm: point[1] })),
  ).intersections.map(hit => hit.radiusKnm)).sort((a, b) => a - b);
  const unique = radii.filter((radius, index) => index === 0 || Math.abs(radius - radii[index - 1]) > 1e-6);
  if (unique.length !== 1 || unique[0] <= 1e-8) return null;
  const fiberRadiusKnm = unique[0];
  const approximateRadiusKnm = Math.hypot(approximatePoint[0], approximatePoint[1]);
  return {
    phiDeg, fiberRadiusKnm, approximateRadiusKnm,
    differencePercent: 100 * (approximateRadiusKnm / fiberRadiusKnm - 1),
    fiberPoint: [direction.xKnm * fiberRadiusKnm, direction.yKnm * fiberRadiusKnm, section.nKn],
    approximatePoint,
  };
}

/** Superfície gráfica: expressão avaliada em cada N, sem nova solução mecânica.
 * O nível corrente é inserido para coincidir exatamente com seus interceptos.
 * Os cortes verticais usam a mesma triangulação mostrada no 3D.
 */
export function buildApproximateInteractionSurface(
  sections: readonly UniaxialResistances[], alpha: number, angleCount = 120,
): ApproximateInteractionSurface {
  checkAlpha(alpha);
  if (!Number.isInteger(angleCount) || angleCount < 8 || angleCount % 4 !== 0) {
    throw new Error("A amostragem radial deve ser múltipla de 4 e ≥ 8.");
  }
  const levels = [...sections].sort((a, b) => a.nKn - b.nKn).filter(
    (section, index, sorted) => index === 0 || Math.abs(section.nKn - sorted[index - 1].nKn) > 1e-6,
  );
  if (levels.length < 2 || levels.some(section => section.status === "unavailable")) {
    throw new Error("A superfície requer ao menos dois níveis válidos.");
  }
  if (levels.slice(0, -1).some(section => section.status === "point")) {
    throw new Error("Um nível degenerado só é admitido no topo.");
  }
  const vertices: InteractionPoint[] = [];
  const triangles: Triangle[] = [];
  const rings = levels.map(section => {
    const count = section.status === "point" ? 1 : angleCount;
    return Array.from({ length: count }, (_, index) => {
      const vertexIndex = vertices.length;
      vertices.push(approximateBoundaryPoint(section, alpha, index * 360 / angleCount)!);
      return vertexIndex;
    });
  });
  for (let level = 1; level < rings.length; level += 1) {
    const lower = rings[level - 1];
    const upper = rings[level];
    for (let index = 0; index < lower.length; index += 1) {
      const next = (index + 1) % lower.length;
      if (upper.length === 1) triangles.push([lower[index], lower[next], upper[0]]);
      else triangles.push([lower[index], lower[next], upper[next]], [lower[index], upper[next], upper[index]]);
    }
  }
  const baseCenter = vertices.length;
  vertices.push([0, 0, levels[0].nKn]);
  for (let index = 0; index < rings[0].length; index += 1) {
    triangles.push([baseCenter, rings[0][(index + 1) % rings[0].length], rings[0][index]]);
  }
  if (rings.at(-1)!.length > 1) {
    const topCenter = vertices.length;
    vertices.push([0, 0, levels.at(-1)!.nKn]);
    const topRing = rings.at(-1)!;
    for (let index = 0; index < topRing.length; index += 1) {
      triangles.push([topCenter, topRing[index], topRing[(index + 1) % topRing.length]]);
    }
  }
  return { vertices, triangles, rings };
}
