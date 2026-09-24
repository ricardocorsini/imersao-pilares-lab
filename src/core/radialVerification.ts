export type RadialPoint = Readonly<{
  xKnm: number;
  yKnm: number;
}>;

export type RadialGeometryKind = "point" | "segment" | "polygon";
export type DemandPosition = "inside" | "boundary" | "outside";

export type RadialIntersection = Readonly<{
  radiusKnm: number;
  point: RadialPoint;
  edgeIndices: readonly number[];
}>;

export type RadialVerification = Readonly<{
  applicable: boolean;
  inside: boolean;
  position: DemandPosition;
  reason: string;
  geometryKind: RadialGeometryKind;
  demandRadiusKnm: number;
  directionDeg: number | null;
  originInside: boolean;
  originOnBoundary: boolean;
  radialCapacityKnm: number | null;
  capacityPoint: RadialPoint | null;
  utilization: number | null;
  intersections: readonly RadialIntersection[];
  collinearOverlap: boolean;
}>;

export type RadialScenarioId =
  | "internal"
  | "boundary"
  | "external"
  | "zero"
  | "point"
  | "segment"
  | "no-origin"
  | "multiple";

export type RadialScenario = Readonly<{
  id: RadialScenarioId;
  shortLabel: string;
  title: string;
  eyebrow: string;
  description: string;
  lesson: string;
  boundary: readonly RadialPoint[];
  initialDemand: RadialPoint;
  mechanical: boolean;
}>;

const BASE_TOLERANCE = 1e-9;

function requireFinitePoint(point: RadialPoint, label: string) {
  if (!Number.isFinite(point.xKnm) || !Number.isFinite(point.yKnm)) {
    throw new Error(`${label} deve conter coordenadas finitas.`);
  }
}

function geometryScale(points: readonly RadialPoint[]) {
  return Math.max(
    1,
    ...points.flatMap((point) => [Math.abs(point.xKnm), Math.abs(point.yKnm)]),
  );
}

function distance(first: RadialPoint, second: RadialPoint) {
  return Math.hypot(first.xKnm - second.xKnm, first.yKnm - second.yKnm);
}

function cross(first: RadialPoint, second: RadialPoint) {
  return first.xKnm * second.yKnm - first.yKnm * second.xKnm;
}

function subtract(first: RadialPoint, second: RadialPoint): RadialPoint {
  return {
    xKnm: first.xKnm - second.xKnm,
    yKnm: first.yKnm - second.yKnm,
  };
}

function dot(first: RadialPoint, second: RadialPoint) {
  return first.xKnm * second.xKnm + first.yKnm * second.yKnm;
}

function uniquePoints(points: readonly RadialPoint[], tolerance: number) {
  const unique: RadialPoint[] = [];
  for (const point of points) {
    if (!unique.some((candidate) => distance(candidate, point) <= tolerance)) {
      unique.push(point);
    }
  }
  return unique;
}

function signedDoubleArea(points: readonly RadialPoint[]) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    area += cross(points[index], points[(index + 1) % points.length]);
  }
  return area;
}

export function classifyRadialGeometry(
  boundary: readonly RadialPoint[],
): RadialGeometryKind {
  if (boundary.length === 0) throw new Error("A fronteira deve conter ao menos um ponto.");
  boundary.forEach((point, index) => requireFinitePoint(point, `boundary[${index}]`));
  const scale = geometryScale(boundary);
  const tolerance = BASE_TOLERANCE * scale;
  const unique = uniquePoints(boundary, tolerance);
  if (unique.length === 1) return "point";
  if (unique.length === 2) return "segment";
  const areaTolerance = BASE_TOLERANCE * scale * scale;
  return Math.abs(signedDoubleArea(unique)) <= areaTolerance ? "segment" : "polygon";
}

export function pointOnSegment(
  point: RadialPoint,
  first: RadialPoint,
  second: RadialPoint,
  tolerance: number,
) {
  const edge = subtract(second, first);
  const lengthSquared = dot(edge, edge);
  if (lengthSquared <= tolerance * tolerance) return distance(point, first) <= tolerance;
  const projection = dot(subtract(point, first), edge) / lengthSquared;
  if (projection < -tolerance || projection > 1 + tolerance) return false;
  const closest = {
    xKnm: first.xKnm + Math.min(1, Math.max(0, projection)) * edge.xKnm,
    yKnm: first.yKnm + Math.min(1, Math.max(0, projection)) * edge.yKnm,
  };
  return distance(point, closest) <= tolerance;
}

function pointOnBoundary(
  point: RadialPoint,
  boundary: readonly RadialPoint[],
  tolerance: number,
) {
  if (boundary.length === 1) return distance(point, boundary[0]) <= tolerance;
  const edgeCount = boundary.length === 2 ? 1 : boundary.length;
  for (let index = 0; index < edgeCount; index += 1) {
    if (pointOnSegment(point, boundary[index], boundary[(index + 1) % boundary.length], tolerance)) {
      return true;
    }
  }
  return false;
}

export function pointInRadialPolygon(
  point: RadialPoint,
  boundary: readonly RadialPoint[],
  tolerance = BASE_TOLERANCE * geometryScale(boundary),
) {
  if (pointOnBoundary(point, boundary, tolerance)) return true;
  let inside = false;
  for (let index = 0, previous = boundary.length - 1; index < boundary.length; previous = index, index += 1) {
    const currentPoint = boundary[index];
    const previousPoint = boundary[previous];
    const crosses = (currentPoint.yKnm > point.yKnm) !== (previousPoint.yKnm > point.yKnm);
    if (!crosses) continue;
    const crossingX = (previousPoint.xKnm - currentPoint.xKnm) *
      (point.yKnm - currentPoint.yKnm) /
      (previousPoint.yKnm - currentPoint.yKnm) + currentPoint.xKnm;
    if (point.xKnm < crossingX) inside = !inside;
  }
  return inside;
}

export function radialIntersections(
  direction: RadialPoint,
  boundary: readonly RadialPoint[],
) {
  const directionNorm = Math.hypot(direction.xKnm, direction.yKnm);
  if (directionNorm <= Number.EPSILON) {
    return Object.freeze({ intersections: Object.freeze([]), collinearOverlap: false });
  }
  const unit = {
    xKnm: direction.xKnm / directionNorm,
    yKnm: direction.yKnm / directionNorm,
  };
  const scale = geometryScale(boundary);
  const coordinateTolerance = BASE_TOLERANCE * scale;
  const determinantTolerance = 1e-12 * scale;
  const candidates: Array<{ radiusKnm: number; point: RadialPoint; edgeIndex: number }> = [];
  let collinearOverlap = false;
  const edgeCount = boundary.length === 2 ? 1 : boundary.length;

  for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
    const start = boundary[edgeIndex];
    const end = boundary[(edgeIndex + 1) % boundary.length];
    const edge = subtract(end, start);
    const determinant = cross(unit, edge);
    if (Math.abs(determinant) <= determinantTolerance) {
      if (Math.abs(cross(start, unit)) <= coordinateTolerance) {
        const firstRadius = dot(start, unit);
        const secondRadius = dot(end, unit);
        if (Math.max(firstRadius, secondRadius) > coordinateTolerance) collinearOverlap = true;
      }
      continue;
    }
    const radiusKnm = cross(start, edge) / determinant;
    const edgeCoordinate = cross(start, unit) / determinant;
    if (
      radiusKnm >= -coordinateTolerance &&
      edgeCoordinate >= -BASE_TOLERANCE &&
      edgeCoordinate <= 1 + BASE_TOLERANCE
    ) {
      const positiveRadius = Math.max(0, radiusKnm);
      if (positiveRadius > coordinateTolerance) {
        candidates.push({
          radiusKnm: positiveRadius,
          point: {
            xKnm: unit.xKnm * positiveRadius,
            yKnm: unit.yKnm * positiveRadius,
          },
          edgeIndex,
        });
      }
    }
  }

  candidates.sort((first, second) => first.radiusKnm - second.radiusKnm);
  const intersections: RadialIntersection[] = [];
  for (const candidate of candidates) {
    const previous = intersections.at(-1);
    const tolerance = 1e-8 * Math.max(1, candidate.radiusKnm);
    if (previous && Math.abs(previous.radiusKnm - candidate.radiusKnm) <= tolerance) {
      intersections[intersections.length - 1] = Object.freeze({
        ...previous,
        edgeIndices: Object.freeze([...previous.edgeIndices, candidate.edgeIndex]),
      });
    } else {
      intersections.push(Object.freeze({
        radiusKnm: candidate.radiusKnm,
        point: Object.freeze(candidate.point),
        edgeIndices: Object.freeze([candidate.edgeIndex]),
      }));
    }
  }
  return Object.freeze({
    intersections: Object.freeze(intersections),
    collinearOverlap,
  });
}

function farthestPair(points: readonly RadialPoint[]) {
  let first = points[0];
  let second = points[1] ?? points[0];
  let maximum = distance(first, second);
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const candidate = distance(points[i], points[j]);
      if (candidate > maximum) {
        maximum = candidate;
        first = points[i];
        second = points[j];
      }
    }
  }
  return [first, second] as const;
}

export function verifyRadialDemand(
  boundary: readonly RadialPoint[],
  demand: RadialPoint,
): RadialVerification {
  requireFinitePoint(demand, "demand");
  const geometryKind = classifyRadialGeometry(boundary);
  const scale = geometryScale([...boundary, demand]);
  const tolerance = BASE_TOLERANCE * scale;
  const demandRadiusKnm = Math.hypot(demand.xKnm, demand.yKnm);
  const directionDeg = demandRadiusKnm <= tolerance
    ? null
    : ((Math.atan2(demand.yKnm, demand.xKnm) * 180 / Math.PI) % 360 + 360) % 360;

  if (geometryKind === "point") {
    const reference = boundary[0];
    const inside = distance(demand, reference) <= tolerance;
    return Object.freeze({
      applicable: false,
      inside,
      position: inside ? "boundary" : "outside",
      reason: "A fronteira degenerou em um ponto; não existe razão radial bidimensional.",
      geometryKind,
      demandRadiusKnm,
      directionDeg,
      originInside: distance({ xKnm: 0, yKnm: 0 }, reference) <= tolerance,
      originOnBoundary: distance({ xKnm: 0, yKnm: 0 }, reference) <= tolerance,
      radialCapacityKnm: null,
      capacityPoint: null,
      utilization: inside && demandRadiusKnm <= tolerance ? 0 : null,
      intersections: Object.freeze([]),
      collinearOverlap: false,
    });
  }

  if (geometryKind === "segment") {
    const [first, second] = farthestPair(boundary);
    const inside = pointOnSegment(demand, first, second, tolerance);
    const originInside = pointOnSegment({ xKnm: 0, yKnm: 0 }, first, second, tolerance);
    const ray = demandRadiusKnm > tolerance
      ? radialIntersections(demand, [first, second])
      : { intersections: Object.freeze([] as RadialIntersection[]), collinearOverlap: false };
    return Object.freeze({
      applicable: false,
      inside,
      position: inside ? "boundary" : "outside",
      reason: "A fronteira degenerou em um segmento; não existe região resistente bidimensional.",
      geometryKind,
      demandRadiusKnm,
      directionDeg,
      originInside,
      originOnBoundary: originInside,
      radialCapacityKnm: null,
      capacityPoint: null,
      utilization: null,
      intersections: ray.intersections,
      collinearOverlap: ray.collinearOverlap,
    });
  }

  const origin = { xKnm: 0, yKnm: 0 };
  const originOnBoundary = pointOnBoundary(origin, boundary, tolerance);
  const originInside = pointInRadialPolygon(origin, boundary, tolerance);
  const demandOnBoundary = pointOnBoundary(demand, boundary, tolerance);
  const inside = pointInRadialPolygon(demand, boundary, tolerance);
  const position: DemandPosition = demandOnBoundary ? "boundary" : inside ? "inside" : "outside";

  if (!originInside) {
    const ray = demandRadiusKnm > tolerance
      ? radialIntersections(demand, boundary)
      : { intersections: Object.freeze([] as RadialIntersection[]), collinearOverlap: false };
    return Object.freeze({
      applicable: false,
      inside,
      position,
      reason: "A origem não pertence à região; a verificação radial não é aplicável.",
      geometryKind,
      demandRadiusKnm,
      directionDeg,
      originInside,
      originOnBoundary,
      radialCapacityKnm: null,
      capacityPoint: null,
      utilization: null,
      intersections: ray.intersections,
      collinearOverlap: ray.collinearOverlap,
    });
  }

  if (demandRadiusKnm <= tolerance) {
    return Object.freeze({
      applicable: true,
      inside: true,
      position: originOnBoundary ? "boundary" : "inside",
      reason: "Solicitação de momento nula.",
      geometryKind,
      demandRadiusKnm: 0,
      directionDeg: null,
      originInside,
      originOnBoundary,
      radialCapacityKnm: null,
      capacityPoint: null,
      utilization: 0,
      intersections: Object.freeze([]),
      collinearOverlap: false,
    });
  }

  const ray = radialIntersections(demand, boundary);
  if (ray.collinearOverlap) {
    return Object.freeze({
      applicable: false,
      inside,
      position,
      reason: "O raio coincide com um trecho da fronteira; não há uma interseção radial única.",
      geometryKind,
      demandRadiusKnm,
      directionDeg,
      originInside,
      originOnBoundary,
      radialCapacityKnm: null,
      capacityPoint: null,
      utilization: null,
      intersections: ray.intersections,
      collinearOverlap: true,
    });
  }
  if (ray.intersections.length === 0) {
    return Object.freeze({
      applicable: false,
      inside,
      position,
      reason: "Não foi possível obter uma interseção radial positiva com a fronteira.",
      geometryKind,
      demandRadiusKnm,
      directionDeg,
      originInside,
      originOnBoundary,
      radialCapacityKnm: null,
      capacityPoint: null,
      utilization: null,
      intersections: ray.intersections,
      collinearOverlap: false,
    });
  }
  if (ray.intersections.length > 1) {
    return Object.freeze({
      applicable: false,
      inside,
      position,
      reason: "O raio cruza a fronteira mais de uma vez; a região não é estrelada nessa direção e uma razão radial única seria ambígua.",
      geometryKind,
      demandRadiusKnm,
      directionDeg,
      originInside,
      originOnBoundary,
      radialCapacityKnm: ray.intersections[0].radiusKnm,
      capacityPoint: ray.intersections[0].point,
      utilization: null,
      intersections: ray.intersections,
      collinearOverlap: false,
    });
  }

  const intersection = ray.intersections[0];
  if (intersection.radiusKnm <= tolerance) {
    return Object.freeze({
      applicable: false,
      inside,
      position,
      reason: "A capacidade radial positiva está abaixo da tolerância geométrica.",
      geometryKind,
      demandRadiusKnm,
      directionDeg,
      originInside,
      originOnBoundary,
      radialCapacityKnm: intersection.radiusKnm,
      capacityPoint: intersection.point,
      utilization: null,
      intersections: ray.intersections,
      collinearOverlap: false,
    });
  }

  return Object.freeze({
    applicable: true,
    inside,
    position,
    reason: position === "outside"
      ? "Solicitação externa."
      : position === "boundary"
        ? "Solicitação sobre a fronteira."
        : "Solicitação interna.",
    geometryKind,
    demandRadiusKnm,
    directionDeg,
    originInside,
    originOnBoundary,
    radialCapacityKnm: intersection.radiusKnm,
    capacityPoint: intersection.point,
    utilization: demandRadiusKnm / intersection.radiusKnm,
    intersections: ray.intersections,
    collinearOverlap: false,
  });
}

function scalePoint(point: RadialPoint, factor: number): RadialPoint {
  return Object.freeze({ xKnm: point.xKnm * factor, yKnm: point.yKnm * factor });
}

export function createRadialScenarios(
  regularBoundary: readonly RadialPoint[],
): readonly RadialScenario[] {
  if (classifyRadialGeometry(regularBoundary) !== "polygon") {
    throw new Error("A fronteira mecânica de referência deve ser um polígono.");
  }
  const anchor = regularBoundary[Math.max(0, Math.floor(regularBoundary.length * 0.115))];
  const pointBoundary = Object.freeze([{ xKnm: 0, yKnm: 0 }]);
  const segmentBoundary = Object.freeze([
    { xKnm: -210, yKnm: -84 },
    { xKnm: 210, yKnm: 84 },
  ]);
  const noOriginBoundary = Object.freeze([
    { xKnm: 45, yKnm: -105 },
    { xKnm: 230, yKnm: -105 },
    { xKnm: 230, yKnm: 105 },
    { xKnm: 45, yKnm: 105 },
  ]);
  const multipleBoundary = Object.freeze([
    { xKnm: -150, yKnm: -120 },
    { xKnm: 220, yKnm: -120 },
    { xKnm: 220, yKnm: 120 },
    { xKnm: 100, yKnm: 120 },
    { xKnm: 100, yKnm: -30 },
    { xKnm: 40, yKnm: -30 },
    { xKnm: 40, yKnm: 120 },
    { xKnm: -150, yKnm: 120 },
  ]);

  return Object.freeze([
    {
      id: "internal",
      shortLabel: "Interna",
      title: "Solicitação interna",
      eyebrow: "caso regular · u_rad < 1",
      description: "O raio encontra a fronteira uma única vez e a solicitação termina antes da capacidade.",
      lesson: "A região contém a origem e é estrelada nessa direção: a razão radial tem interpretação resistente.",
      boundary: regularBoundary,
      initialDemand: scalePoint(anchor, 0.58),
      mechanical: true,
    },
    {
      id: "boundary",
      shortLabel: "Fronteira",
      title: "Solicitação sobre a fronteira",
      eyebrow: "caso regular · u_rad = 1",
      description: "O ponto solicitante coincide com a interseção resistente na mesma direção radial.",
      lesson: "Na tolerância geométrica, demanda e capacidade têm o mesmo módulo: u_rad = 1.",
      boundary: regularBoundary,
      initialDemand: scalePoint(anchor, 1),
      mechanical: true,
    },
    {
      id: "external",
      shortLabel: "Externa",
      title: "Solicitação externa",
      eyebrow: "caso regular · u_rad > 1",
      description: "A solicitação ultrapassa a primeira e única interseção com a fronteira resistente.",
      lesson: "A direção continua válida; o que muda é o quociente entre os módulos da demanda e da capacidade.",
      boundary: regularBoundary,
      initialDemand: scalePoint(anchor, 1.26),
      mechanical: true,
    },
    {
      id: "zero",
      shortLabel: "M = 0",
      title: "Momento solicitante nulo",
      eyebrow: "caso especial · u_rad = 0",
      description: "A origem pertence à região, mas não há ângulo radial definido para procurar capacidade.",
      lesson: "O algoritmo devolve u_rad = 0 por caso especial; não inventa uma direção para M = 0.",
      boundary: regularBoundary,
      initialDemand: Object.freeze({ xKnm: 0, yKnm: 0 }),
      mechanical: true,
    },
    {
      id: "point",
      shortLabel: "Ponto",
      title: "Curva degenerada em ponto",
      eyebrow: "não aplicável · dimensão 0",
      description: "Na compressão uniforme limite, a curva Mx–My pode colapsar para o ponto (0,0).",
      lesson: "Pode-se testar coincidência geométrica, mas não existe capacidade radial bidimensional.",
      boundary: pointBoundary,
      initialDemand: Object.freeze({ xKnm: 0, yKnm: 0 }),
      mechanical: false,
    },
    {
      id: "segment",
      shortLabel: "Segmento",
      title: "Fronteira em segmento",
      eyebrow: "não aplicável · dimensão 1",
      description: "A fronteira tem comprimento, mas não envolve uma região resistente no plano Mx–My.",
      lesson: "Mesmo que o ponto esteja sobre o segmento, não há interior bidimensional para uma razão radial.",
      boundary: segmentBoundary,
      initialDemand: Object.freeze({ xKnm: 90, yKnm: 36 }),
      mechanical: false,
    },
    {
      id: "no-origin",
      shortLabel: "Sem origem",
      title: "Polígono sem a origem",
      eyebrow: "não aplicável · referência inválida",
      description: "A demanda pode estar dentro do polígono, mas o caminho de escala parte de uma origem inadmissível.",
      lesson: "Dentro/fora continua sendo calculado; u_rad é suprimido para não produzir um índice enganoso.",
      boundary: noOriginBoundary,
      initialDemand: Object.freeze({ xKnm: 135, yKnm: 22 }),
      mechanical: false,
    },
    {
      id: "multiple",
      shortLabel: "Múltiplas",
      title: "Mais de uma interseção radial",
      eyebrow: "não aplicável · região não estrelada",
      description: "O raio sai, reentra e volta a sair da região: três capacidades aparecem na mesma direção.",
      lesson: "Escolher silenciosamente a primeira ou a última interseção mudaria o significado de u_rad; o algoritmo acusa ambiguidade.",
      boundary: multipleBoundary,
      initialDemand: Object.freeze({ xKnm: 160, yKnm: 0 }),
      mechanical: false,
    },
  ] satisfies RadialScenario[]);
}
