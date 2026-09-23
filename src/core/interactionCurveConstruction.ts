import {
  analyzeNormalForceRoots,
  sectionNormalResistanceKn,
  sectionResponseAtLimitState,
  type RootCandidateKind,
  type RootRefinementMethod,
  type RootSolution,
} from "./normalForceRootSearch.ts";
import type {
  LimitStateBranch,
  LimitStateDomainId,
  LimitStatePath,
} from "./limitStatePath.ts";

export type CurveGeometryKind = "point" | "segment" | "polygon";

export type InteractionConstructionInput = Readonly<{
  nSdKn: number;
  angleCount: number;
  scanPoints?: number;
  rootMethod?: RootRefinementMethod;
}>;

export type InteractionConstructionPoint = Readonly<{
  id: string;
  angleIndex: number;
  rootIndex: number;
  thetaDeg: number;
  t: number;
  domainId: LimitStateDomainId;
  domainLabel: string;
  branch: LimitStateBranch;
  neutralAxisDepthMm: number;
  neutralAxisInsideSection: boolean;
  rootMethod: RootSolution["methodUsed"] | "degenerate_endpoint";
  rootCandidateKind: RootCandidateKind | "endpoint";
  rootBracket: readonly [number, number] | null;
  axialResidualKn: number;
  functionEvaluations: number;
  rootsAtAngle: number;
  mxKnm: number;
  myKnm: number;
  nRdKn: number;
  momentRadiusKnm: number;
  polarAngleDeg: number;
  isExternalCandidate: boolean;
  limitState: LimitStatePath;
}>;

export type InteractionAngleDiagnostic = Readonly<{
  angleIndex: number;
  thetaDeg: number;
  candidates: readonly InteractionConstructionPoint[];
  selectedIndex: number | null;
  functionEvaluations: number;
}>;

export type InteractionCurveConstruction = Readonly<{
  input: Required<InteractionConstructionInput>;
  axialCapacityKn: number;
  angleStepDeg: number;
  diagnostics: readonly InteractionAngleDiagnostic[];
  mechanicalCandidates: readonly InteractionConstructionPoint[];
  selectedCandidates: readonly InteractionConstructionPoint[];
  polarOrderedPoints: readonly InteractionConstructionPoint[];
  convexHullPoints: readonly InteractionConstructionPoint[];
  missingAnglesDeg: readonly number[];
  multipleRootAnglesDeg: readonly number[];
  maxAxialResidualKn: number;
  totalFunctionEvaluations: number;
  geometryKind: CurveGeometryKind;
  hullOmittedCount: number;
  notes: readonly string[];
}>;

export const INTERACTION_AXIAL_CAPACITY_KN = sectionNormalResistanceKn(3, 0);
export const INTERACTION_DEFAULT_ANGLE_COUNT = 36;
export const INTERACTION_DEFAULT_SCAN_POINTS = 17;

function requireFinite(value: number, name: string) {
  if (!Number.isFinite(value)) throw new Error(`${name} deve ser finito.`);
}

function requireIntegerInRange(
  value: number,
  minimum: number,
  maximum: number,
  name: string,
) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} deve ser inteiro entre ${minimum} e ${maximum}.`);
  }
}

function polarAngleDeg(mxKnm: number, myKnm: number) {
  return ((Math.atan2(myKnm, mxKnm) * 180 / Math.PI) % 360 + 360) % 360;
}

function pointDistance(
  first: Pick<InteractionConstructionPoint, "mxKnm" | "myKnm">,
  second: Pick<InteractionConstructionPoint, "mxKnm" | "myKnm">,
) {
  return Math.hypot(first.mxKnm - second.mxKnm, first.myKnm - second.myKnm);
}

function uniquePoints(
  points: readonly InteractionConstructionPoint[],
  toleranceKnm = 1e-7,
) {
  const unique: InteractionConstructionPoint[] = [];
  for (const point of points) {
    if (!unique.some((existing) => pointDistance(point, existing) <= toleranceKnm)) {
      unique.push(point);
    }
  }
  return unique;
}

export function orderInteractionPointsPolar(
  points: readonly InteractionConstructionPoint[],
) {
  const unique = uniquePoints(points);
  if (unique.length <= 1) return Object.freeze(unique);
  const centerMx = unique.reduce((sum, point) => sum + point.mxKnm, 0) / unique.length;
  const centerMy = unique.reduce((sum, point) => sum + point.myKnm, 0) / unique.length;
  return Object.freeze([...unique].sort((first, second) => {
    const firstAngle = Math.atan2(first.myKnm - centerMy, first.mxKnm - centerMx);
    const secondAngle = Math.atan2(second.myKnm - centerMy, second.mxKnm - centerMx);
    return firstAngle - secondAngle;
  }));
}

function cross(
  origin: InteractionConstructionPoint,
  first: InteractionConstructionPoint,
  second: InteractionConstructionPoint,
) {
  return (first.mxKnm - origin.mxKnm) * (second.myKnm - origin.myKnm) -
    (first.myKnm - origin.myKnm) * (second.mxKnm - origin.mxKnm);
}

/** Fecho convexo de Andrew; recebe pontos mecânicos e devolve apenas vértices. */
export function convexHullInteractionPoints(
  points: readonly InteractionConstructionPoint[],
) {
  const unique = uniquePoints(points);
  if (unique.length <= 2) return Object.freeze(unique);
  const sorted = [...unique].sort((first, second) =>
    first.mxKnm - second.mxKnm || first.myKnm - second.myKnm);
  const coordinateScale = Math.max(
    1,
    ...sorted.flatMap((point) => [Math.abs(point.mxKnm), Math.abs(point.myKnm)]),
  );
  const crossTolerance = 1e-12 * coordinateScale ** 2;
  const lower: InteractionConstructionPoint[] = [];
  for (const point of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], point) <= crossTolerance
    ) lower.pop();
    lower.push(point);
  }
  const upper: InteractionConstructionPoint[] = [];
  for (const point of [...sorted].reverse()) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], point) <= crossTolerance
    ) upper.pop();
    upper.push(point);
  }
  return Object.freeze([...lower.slice(0, -1), ...upper.slice(0, -1)]);
}

function geometryKind(
  selected: readonly InteractionConstructionPoint[],
  hull: readonly InteractionConstructionPoint[],
): CurveGeometryKind {
  const unique = uniquePoints(selected);
  if (unique.length <= 1) return "point";
  if (hull.length <= 2) return "segment";
  return "polygon";
}

function evaluationsForAngle(
  scanEvaluations: number,
  tangentProbeEvaluations: number,
  solutions: readonly RootSolution[],
) {
  return scanEvaluations + tangentProbeEvaluations +
    solutions.reduce((sum, solution) => sum + solution.refinementEvaluations, 0);
}

function buildPoint(
  thetaDeg: number,
  angleIndex: number,
  rootIndex: number,
  rootsAtAngle: number,
  functionEvaluations: number,
  nSdKn: number,
  solution: RootSolution,
  bracket: readonly [number, number] | null,
): InteractionConstructionPoint {
  const response = sectionResponseAtLimitState(solution.rootT, thetaDeg);
  const mxKnm = response.state.mxKnm;
  const myKnm = response.state.myKnm;
  return Object.freeze({
    id: `theta-${angleIndex}-root-${rootIndex}`,
    angleIndex,
    rootIndex,
    thetaDeg,
    t: solution.rootT,
    domainId: response.path.domainId,
    domainLabel: response.path.domainLabel,
    branch: response.path.branch,
    neutralAxisDepthMm: response.path.neutralAxisDepthMm,
    neutralAxisInsideSection: response.path.neutralAxisInsideSection,
    rootMethod: solution.methodUsed,
    rootCandidateKind: solution.candidateKind,
    rootBracket: bracket,
    axialResidualKn: response.state.nKn - nSdKn,
    functionEvaluations,
    rootsAtAngle,
    mxKnm,
    myKnm,
    nRdKn: response.state.nKn,
    momentRadiusKnm: Math.hypot(mxKnm, myKnm),
    polarAngleDeg: polarAngleDeg(mxKnm, myKnm),
    isExternalCandidate: false,
    limitState: response.path,
  });
}

function buildCompressionEndpoint(
  nSdKn: number,
  angleCount: number,
  scanPoints: number,
  rootMethod: RootRefinementMethod,
): InteractionCurveConstruction {
  const response = sectionResponseAtLimitState(3, 0);
  const point: InteractionConstructionPoint = Object.freeze({
    id: "uniform-compression",
    angleIndex: 0,
    rootIndex: 0,
    thetaDeg: 0,
    t: 3,
    domainId: response.path.domainId,
    domainLabel: response.path.domainLabel,
    branch: response.path.branch,
    neutralAxisDepthMm: response.path.neutralAxisDepthMm,
    neutralAxisInsideSection: false,
    rootMethod: "degenerate_endpoint",
    rootCandidateKind: "endpoint",
    rootBracket: null,
    axialResidualKn: response.state.nKn - nSdKn,
    functionEvaluations: 1,
    rootsAtAngle: 1,
    mxKnm: response.state.mxKnm,
    myKnm: response.state.myKnm,
    nRdKn: response.state.nKn,
    momentRadiusKnm: Math.hypot(response.state.mxKnm, response.state.myKnm),
    polarAngleDeg: polarAngleDeg(response.state.mxKnm, response.state.myKnm),
    isExternalCandidate: true,
    limitState: response.path,
  });
  const diagnostic: InteractionAngleDiagnostic = Object.freeze({
    angleIndex: 0,
    thetaDeg: 0,
    candidates: Object.freeze([point]),
    selectedIndex: 0,
    functionEvaluations: 1,
  });
  return Object.freeze({
    input: Object.freeze({ nSdKn, angleCount, scanPoints, rootMethod }),
    axialCapacityKn: INTERACTION_AXIAL_CAPACITY_KN,
    angleStepDeg: 360 / angleCount,
    diagnostics: Object.freeze([diagnostic]),
    mechanicalCandidates: Object.freeze([point]),
    selectedCandidates: Object.freeze([point]),
    polarOrderedPoints: Object.freeze([point]),
    convexHullPoints: Object.freeze([point]),
    missingAnglesDeg: Object.freeze([]),
    multipleRootAnglesDeg: Object.freeze([]),
    maxAxialResidualKn: Math.abs(point.axialResidualKn),
    totalFunctionEvaluations: 1,
    geometryKind: "point",
    hullOmittedCount: 0,
    notes: Object.freeze([
      "Compressão uniforme: todas as orientações coincidem no mesmo ponto.",
    ]),
  });
}

export function buildInteractionCurveConstruction(
  input: InteractionConstructionInput,
): InteractionCurveConstruction {
  requireFinite(input.nSdKn, "NSd");
  const angleCount = input.angleCount;
  const scanPoints = input.scanPoints ?? INTERACTION_DEFAULT_SCAN_POINTS;
  const rootMethod = input.rootMethod ?? "brent";
  requireIntegerInRange(angleCount, 12, 144, "angleCount");
  requireIntegerInRange(scanPoints, 7, 65, "scanPoints");
  if (rootMethod !== "brent" && rootMethod !== "bisection") {
    throw new Error("rootMethod inválido.");
  }
  if (input.nSdKn < 0) {
    throw new Error("Esta construção cobre NSd ≥ 0 kN; a flexotração não está incluída.");
  }
  if (input.nSdKn > INTERACTION_AXIAL_CAPACITY_KN + 1e-6) {
    throw new Error("NSd excede a capacidade de compressão uniforme da seção.");
  }
  const nSdKn = Math.min(input.nSdKn, INTERACTION_AXIAL_CAPACITY_KN);
  if (Math.abs(nSdKn - INTERACTION_AXIAL_CAPACITY_KN) <= 1e-6) {
    return buildCompressionEndpoint(nSdKn, angleCount, scanPoints, rootMethod);
  }

  const diagnostics: InteractionAngleDiagnostic[] = [];
  const mechanicalCandidates: InteractionConstructionPoint[] = [];
  const selectedCandidates: InteractionConstructionPoint[] = [];
  const missingAnglesDeg: number[] = [];
  const multipleRootAnglesDeg: number[] = [];
  let totalFunctionEvaluations = 0;

  for (let angleIndex = 0; angleIndex < angleCount; angleIndex += 1) {
    const thetaDeg = 360 * angleIndex / angleCount;
    const rootAnalysis = analyzeNormalForceRoots({
      scenarioId: "section",
      thetaDeg,
      nSdKn,
      method: rootMethod,
      sampleCount: scanPoints,
      curveSampleCount: 0,
    });
    const functionEvaluations = evaluationsForAngle(
      rootAnalysis.scanEvaluations,
      rootAnalysis.tangentProbeEvaluations,
      rootAnalysis.solutions,
    );
    totalFunctionEvaluations += functionEvaluations;
    const candidates = rootAnalysis.solutions.map((solution, rootIndex) => {
      const candidate = rootAnalysis.candidates[rootIndex];
      const bracket = candidate.kind === "sample"
        ? null
        : Object.freeze([candidate.aT, candidate.bT] as [number, number]);
      return buildPoint(
        thetaDeg,
        angleIndex,
        rootIndex,
        rootAnalysis.solutions.length,
        functionEvaluations,
        nSdKn,
        solution,
        bracket,
      );
    });
    let selectedIndex: number | null = null;
    let finalizedCandidates = candidates;
    if (candidates.length > 0) {
      selectedIndex = candidates.reduce(
        (best, point, index) =>
          point.momentRadiusKnm > candidates[best].momentRadiusKnm ? index : best,
        0,
      );
      finalizedCandidates = candidates.map((point, index) =>
        index === selectedIndex
          ? Object.freeze({ ...point, isExternalCandidate: true })
          : point);
      selectedCandidates.push(finalizedCandidates[selectedIndex]);
      if (finalizedCandidates.length > 1) multipleRootAnglesDeg.push(thetaDeg);
    } else {
      missingAnglesDeg.push(thetaDeg);
    }
    mechanicalCandidates.push(...finalizedCandidates);
    diagnostics.push(Object.freeze({
      angleIndex,
      thetaDeg,
      candidates: Object.freeze(finalizedCandidates),
      selectedIndex,
      functionEvaluations,
    }));
  }

  const polarOrderedPoints = orderInteractionPointsPolar(selectedCandidates);
  const convexHullPoints = convexHullInteractionPoints(selectedCandidates);
  const kind = geometryKind(selectedCandidates, convexHullPoints);
  const maxAxialResidualKn = mechanicalCandidates.reduce(
    (maximum, point) => Math.max(maximum, Math.abs(point.axialResidualKn)),
    0,
  );
  const notes: string[] = [];
  if (multipleRootAnglesDeg.length > 0) {
    notes.push("Há orientações com raízes múltiplas; todos os candidatos foram preservados.");
  }
  if (missingAnglesDeg.length > 0) {
    notes.push("A cobertura angular está incompleta.");
  }
  if (selectedCandidates.length === convexHullPoints.length && kind === "polygon") {
    notes.push("Neste exemplo, todos os pontos externos também pertencem ao fecho convexo.");
  }

  return Object.freeze({
    input: Object.freeze({ nSdKn, angleCount, scanPoints, rootMethod }),
    axialCapacityKn: INTERACTION_AXIAL_CAPACITY_KN,
    angleStepDeg: 360 / angleCount,
    diagnostics: Object.freeze(diagnostics),
    mechanicalCandidates: Object.freeze(mechanicalCandidates),
    selectedCandidates: Object.freeze(selectedCandidates),
    polarOrderedPoints,
    convexHullPoints,
    missingAnglesDeg: Object.freeze(missingAnglesDeg),
    multipleRootAnglesDeg: Object.freeze(multipleRootAnglesDeg),
    maxAxialResidualKn,
    totalFunctionEvaluations,
    geometryKind: kind,
    hullOmittedCount: Math.max(0, uniquePoints(selectedCandidates).length - convexHullPoints.length),
    notes: Object.freeze(notes),
  });
}
