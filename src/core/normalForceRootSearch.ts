import { computeLimitStatePath } from "./limitStatePath.ts";
import { computeProjectedDistribution } from "./projectedDistribution.ts";

export type RootScenarioId = "section" | "two_roots" | "tangent";
export type RootRefinementMethod = "bisection" | "brent";
export type RootCandidateKind = "sample" | "sign_change" | "tangent";
export type RootIterationStrategy =
  | "bisection"
  | "secant"
  | "inverse_quadratic"
  | "golden_section";

export type RootCurvePoint = Readonly<{
  t: number;
  nRdKn: number;
  residualKn: number;
}>;

export type RootCandidate = Readonly<{
  id: string;
  kind: RootCandidateKind;
  label: string;
  aT: number;
  bT: number;
  faKn: number;
  fbKn: number;
  estimateT: number;
  sampleIndex?: number;
  probeResidualKn?: number;
}>;

export type RootIteration = Readonly<{
  iteration: number;
  strategy: RootIterationStrategy;
  aT: number;
  bT: number;
  faKn: number;
  fbKn: number;
  trialT: number;
  trialResidualKn: number;
  nextAT: number;
  nextBT: number;
  intervalBefore: number;
  intervalAfter: number;
}>;

export type RootSolution = Readonly<{
  candidateId: string;
  candidateKind: RootCandidateKind;
  methodUsed: RootRefinementMethod | "sample" | "tangent_minimization";
  rootT: number;
  nRdKn: number;
  residualKn: number;
  converged: boolean;
  trace: readonly RootIteration[];
  refinementEvaluations: number;
  totalAlgorithmEvaluations: number;
}>;

export type RootScenario = Readonly<{
  id: RootScenarioId;
  shortLabel: string;
  title: string;
  description: string;
  isArtificial: boolean;
  fixedNSdKn: number | null;
}>;

export type RootSearchInput = Readonly<{
  scenarioId: RootScenarioId;
  thetaDeg: number;
  nSdKn: number;
  method?: RootRefinementMethod;
  sampleCount?: number;
  curveSampleCount?: number;
}>;

export type RootSearchAnalysis = Readonly<{
  input: Required<RootSearchInput>;
  scenario: RootScenario;
  nSdKn: number;
  samples: readonly RootCurvePoint[];
  curve: readonly RootCurvePoint[];
  candidates: readonly RootCandidate[];
  solutions: readonly RootSolution[];
  scanEvaluations: number;
  tangentProbeEvaluations: number;
  signChangeCount: number;
  directSampleCount: number;
  tangentCandidateCount: number;
}>;

export const ROOT_FORCE_TOLERANCE_KN = 0.01;
export const ROOT_T_TOLERANCE = 1e-8;
export const ROOT_SAMPLE_COUNT = 17;
export const ROOT_CURVE_SAMPLE_COUNT = 121;
export const ROOT_SAMPLE_EXACT_TOLERANCE_KN = ROOT_FORCE_TOLERANCE_KN;
export const ROOT_TANGENT_PROBE_TOLERANCE_KN = 0.05;

export const ROOT_SCENARIOS: Readonly<Record<RootScenarioId, RootScenario>> =
  Object.freeze({
    section: Object.freeze({
      id: "section",
      shortLabel: "Seção padrão",
      title: "Equilíbrio real da seção",
      description:
        "NRd é obtido pela integração das fibras de concreto e das oito barras para cada estado-limite t.",
      isArtificial: false,
      fixedNSdKn: null,
    }),
    two_roots: Object.freeze({
      id: "two_roots",
      shortLabel: "Duas raízes",
      title: "Demonstração com duas interseções",
      description:
        "Curva artificial criada para mostrar dois intervalos com troca de sinal e duas raízes independentes.",
      isArtificial: true,
      fixedNSdKn: 2_200,
    }),
    tangent: Object.freeze({
      id: "tangent",
      shortLabel: "Raiz tangente",
      title: "Demonstração sem troca de sinal",
      description:
        "Curva artificial que apenas toca NSd: f(t) chega a zero, mas conserva o mesmo sinal nos dois lados.",
      isArtificial: true,
      fixedNSdKn: 2_200,
    }),
  });

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

function normalizedTheta(thetaDeg: number) {
  return ((thetaDeg % 180) + 180) % 180;
}

/**
 * Resultante normal resistente da seção padrão no estado-limite indicado por t.
 * Compressão é positiva e tração é negativa, como no restante do laboratório.
 */
export function sectionNormalResistanceKn(t: number, thetaDeg: number) {
  requireFinite(t, "t");
  requireFinite(thetaDeg, "thetaDeg");
  if (t < 0 || t > 3) throw new Error("t deve estar entre 0 e 3.");
  const path = computeLimitStatePath({ t, thetaDeg });
  return computeProjectedDistribution({
    thetaDeg,
    epsTopPerMille: path.epsTop * 1_000,
    epsBottomPerMille: path.epsBottom * 1_000,
    bands: 60,
  }).nKn;
}

/** Curvas sintéticas são exclusivas das demonstrações numéricas da interface. */
export function normalResistanceForScenarioKn(
  scenarioId: RootScenarioId,
  t: number,
  thetaDeg: number,
) {
  requireFinite(t, "t");
  requireFinite(thetaDeg, "thetaDeg");
  if (t < 0 || t > 3) throw new Error("t deve estar entre 0 e 3.");
  if (scenarioId === "section") return sectionNormalResistanceKn(t, thetaDeg);
  if (scenarioId === "two_roots") {
    return 3_050 - 950 * (t - 1.5) ** 2;
  }
  return 2_200 + 720 * (t - 1.37) ** 2;
}

function pointAt(
  evaluateNormal: (t: number) => number,
  nSdKn: number,
  t: number,
): RootCurvePoint {
  const nRdKn = evaluateNormal(t);
  return Object.freeze({ t, nRdKn, residualKn: nRdKn - nSdKn });
}

function parabolicVertex(
  first: RootCurvePoint,
  second: RootCurvePoint,
  third: RootCurvePoint,
) {
  const x1 = first.t;
  const x2 = second.t;
  const x3 = third.t;
  const y1 = first.residualKn;
  const y2 = second.residualKn;
  const y3 = third.residualKn;
  const denominator = (x1 - x2) * (x1 - x3) * (x2 - x3);
  if (Math.abs(denominator) < 1e-18) return null;
  const a = (x3 * (y2 - y1) + x2 * (y1 - y3) + x1 * (y3 - y2)) /
    denominator;
  const b = (x3 ** 2 * (y1 - y2) + x2 ** 2 * (y3 - y1) +
    x1 ** 2 * (y2 - y3)) / denominator;
  if (Math.abs(a) < 1e-14) return null;
  const vertex = -b / (2 * a);
  return Number.isFinite(vertex) ? vertex : null;
}

type SolveResult = {
  rootT: number;
  residualKn: number;
  trace: RootIteration[];
  evaluations: number;
  converged: boolean;
};

function orderedBracket(
  aT: number,
  faKn: number,
  bT: number,
  fbKn: number,
) {
  return aT <= bT
    ? { aT, faKn, bT, fbKn }
    : { aT: bT, faKn: fbKn, bT: aT, fbKn: faKn };
}

function solveByBisection(
  candidate: RootCandidate,
  residualAt: (t: number) => number,
): SolveResult {
  let aT = candidate.aT;
  let bT = candidate.bT;
  let faKn = candidate.faKn;
  let fbKn = candidate.fbKn;
  const trace: RootIteration[] = [];
  let best = Math.abs(faKn) <= Math.abs(fbKn)
    ? { t: aT, residual: faKn }
    : { t: bT, residual: fbKn };

  for (let iteration = 1; iteration <= 64; iteration += 1) {
    const before = orderedBracket(aT, faKn, bT, fbKn);
    const trialT = (before.aT + before.bT) / 2;
    const trialResidualKn = residualAt(trialT);
    if (Math.abs(trialResidualKn) < Math.abs(best.residual)) {
      best = { t: trialT, residual: trialResidualKn };
    }
    let nextAT = before.aT;
    let nextBT = before.bT;
    let nextFaKn = before.faKn;
    let nextFbKn = before.fbKn;
    if (before.faKn * trialResidualKn <= 0) {
      nextBT = trialT;
      nextFbKn = trialResidualKn;
    } else {
      nextAT = trialT;
      nextFaKn = trialResidualKn;
    }
    trace.push(Object.freeze({
      iteration,
      strategy: "bisection",
      aT: before.aT,
      bT: before.bT,
      faKn: before.faKn,
      fbKn: before.fbKn,
      trialT,
      trialResidualKn,
      nextAT,
      nextBT,
      intervalBefore: before.bT - before.aT,
      intervalAfter: nextBT - nextAT,
    }));
    aT = nextAT;
    bT = nextBT;
    faKn = nextFaKn;
    fbKn = nextFbKn;
    if (
      Math.abs(best.residual) <= ROOT_FORCE_TOLERANCE_KN ||
      Math.abs(bT - aT) <= ROOT_T_TOLERANCE
    ) break;
  }

  return {
    rootT: best.t,
    residualKn: best.residual,
    trace,
    evaluations: trace.length,
    converged:
      Math.abs(best.residual) <= ROOT_FORCE_TOLERANCE_KN ||
      Math.abs(bT - aT) <= ROOT_T_TOLERANCE,
  };
}

/** Brent–Dekker: interpolação protegida por passos de bisseção. */
function solveByBrent(
  candidate: RootCandidate,
  residualAt: (t: number) => number,
): SolveResult {
  let aT = candidate.aT;
  let bT = candidate.bT;
  let faKn = candidate.faKn;
  let fbKn = candidate.fbKn;
  if (faKn * fbKn >= 0) {
    throw new Error("Brent exige um intervalo com troca de sinal.");
  }
  if (Math.abs(faKn) < Math.abs(fbKn)) {
    [aT, bT] = [bT, aT];
    [faKn, fbKn] = [fbKn, faKn];
  }
  let cT = aT;
  let fcKn = faKn;
  let dT = cT;
  let usedBisectionLast = true;
  const trace: RootIteration[] = [];
  let best = { t: bT, residual: fbKn };

  for (let iteration = 1; iteration <= 64; iteration += 1) {
    const before = orderedBracket(aT, faKn, bT, fbKn);
    let trialT: number;
    let strategy: RootIterationStrategy;
    if (
      Math.abs(faKn - fcKn) > 1e-16 &&
      Math.abs(fbKn - fcKn) > 1e-16 &&
      Math.abs(faKn - fbKn) > 1e-16
    ) {
      trialT =
        aT * fbKn * fcKn / ((faKn - fbKn) * (faKn - fcKn)) +
        bT * faKn * fcKn / ((fbKn - faKn) * (fbKn - fcKn)) +
        cT * faKn * fbKn / ((fcKn - faKn) * (fcKn - fbKn));
      strategy = "inverse_quadratic";
    } else {
      trialT = bT - fbKn * (bT - aT) / (fbKn - faKn);
      strategy = "secant";
    }

    const protectedBoundary = (3 * aT + bT) / 4;
    const protectionMin = Math.min(protectedBoundary, bT);
    const protectionMax = Math.max(protectedBoundary, bT);
    const unsafe =
      !Number.isFinite(trialT) ||
      trialT <= protectionMin ||
      trialT >= protectionMax ||
      (usedBisectionLast && Math.abs(trialT - bT) >= Math.abs(bT - cT) / 2) ||
      (!usedBisectionLast && Math.abs(trialT - bT) >= Math.abs(cT - dT) / 2) ||
      (usedBisectionLast && Math.abs(bT - cT) < ROOT_T_TOLERANCE) ||
      (!usedBisectionLast && Math.abs(cT - dT) < ROOT_T_TOLERANCE);

    if (unsafe) {
      trialT = (aT + bT) / 2;
      strategy = "bisection";
      usedBisectionLast = true;
    } else {
      usedBisectionLast = false;
    }

    const trialResidualKn = residualAt(trialT);
    if (Math.abs(trialResidualKn) < Math.abs(best.residual)) {
      best = { t: trialT, residual: trialResidualKn };
    }
    dT = cT;
    cT = bT;
    fcKn = fbKn;
    if (faKn * trialResidualKn < 0) {
      bT = trialT;
      fbKn = trialResidualKn;
    } else {
      aT = trialT;
      faKn = trialResidualKn;
    }
    if (Math.abs(faKn) < Math.abs(fbKn)) {
      [aT, bT] = [bT, aT];
      [faKn, fbKn] = [fbKn, faKn];
    }
    const after = orderedBracket(aT, faKn, bT, fbKn);
    trace.push(Object.freeze({
      iteration,
      strategy,
      aT: before.aT,
      bT: before.bT,
      faKn: before.faKn,
      fbKn: before.fbKn,
      trialT,
      trialResidualKn,
      nextAT: after.aT,
      nextBT: after.bT,
      intervalBefore: before.bT - before.aT,
      intervalAfter: after.bT - after.aT,
    }));
    if (
      Math.abs(best.residual) <= ROOT_FORCE_TOLERANCE_KN ||
      after.bT - after.aT <= ROOT_T_TOLERANCE
    ) break;
  }

  const finalBracket = orderedBracket(aT, faKn, bT, fbKn);
  return {
    rootT: best.t,
    residualKn: best.residual,
    trace,
    evaluations: trace.length,
    converged:
      Math.abs(best.residual) <= ROOT_FORCE_TOLERANCE_KN ||
      finalBracket.bT - finalBracket.aT <= ROOT_T_TOLERANCE,
  };
}

/** Tangência não fornece bracket a Brent; minimizamos |f| no intervalo candidato. */
function solveTangentCandidate(
  candidate: RootCandidate,
  residualAt: (t: number) => number,
): SolveResult {
  let aT = candidate.aT;
  let bT = candidate.bT;
  let faKn = candidate.faKn;
  let fbKn = candidate.fbKn;
  const golden = (Math.sqrt(5) - 1) / 2;
  let x1 = bT - golden * (bT - aT);
  let x2 = aT + golden * (bT - aT);
  let f1 = residualAt(x1);
  let f2 = residualAt(x2);
  let evaluations = 2;
  let best = Math.abs(f1) <= Math.abs(f2)
    ? { t: x1, residual: f1 }
    : { t: x2, residual: f2 };
  const trace: RootIteration[] = [];

  for (let iteration = 1; iteration <= 72; iteration += 1) {
    const beforeAT = aT;
    const beforeBT = bT;
    const beforeFa = faKn;
    const beforeFb = fbKn;
    const trial = Math.abs(f1) <= Math.abs(f2)
      ? { t: x1, residual: f1 }
      : { t: x2, residual: f2 };
    if (Math.abs(trial.residual) < Math.abs(best.residual)) best = trial;

    if (Math.abs(f1) <= Math.abs(f2)) {
      bT = x2;
      fbKn = f2;
      x2 = x1;
      f2 = f1;
      x1 = bT - golden * (bT - aT);
      f1 = residualAt(x1);
    } else {
      aT = x1;
      faKn = f1;
      x1 = x2;
      f1 = f2;
      x2 = aT + golden * (bT - aT);
      f2 = residualAt(x2);
    }
    evaluations += 1;
    const afterTrial = Math.abs(f1) <= Math.abs(f2)
      ? { t: x1, residual: f1 }
      : { t: x2, residual: f2 };
    if (Math.abs(afterTrial.residual) < Math.abs(best.residual)) best = afterTrial;
    trace.push(Object.freeze({
      iteration,
      strategy: "golden_section",
      aT: beforeAT,
      bT: beforeBT,
      faKn: beforeFa,
      fbKn: beforeFb,
      trialT: trial.t,
      trialResidualKn: trial.residual,
      nextAT: aT,
      nextBT: bT,
      intervalBefore: beforeBT - beforeAT,
      intervalAfter: bT - aT,
    }));
    if (
      Math.abs(best.residual) <= ROOT_FORCE_TOLERANCE_KN &&
      bT - aT <= 0.005
    ) break;
    if (bT - aT <= ROOT_T_TOLERANCE) break;
  }

  return {
    rootT: best.t,
    residualKn: best.residual,
    trace,
    evaluations,
    converged: Math.abs(best.residual) <= ROOT_FORCE_TOLERANCE_KN,
  };
}

export function analyzeNormalForceRoots(input: RootSearchInput): RootSearchAnalysis {
  requireFinite(input.thetaDeg, "thetaDeg");
  requireFinite(input.nSdKn, "NSd");
  const method = input.method ?? "brent";
  if (method !== "bisection" && method !== "brent") {
    throw new Error("Método de refinamento inválido.");
  }
  const sampleCount = input.sampleCount ?? ROOT_SAMPLE_COUNT;
  const curveSampleCount = input.curveSampleCount ?? ROOT_CURVE_SAMPLE_COUNT;
  requireIntegerInRange(sampleCount, 7, 65, "sampleCount");
  requireIntegerInRange(curveSampleCount, 33, 241, "curveSampleCount");
  const scenario = ROOT_SCENARIOS[input.scenarioId];
  if (!scenario) throw new Error("Cenário de raízes inválido.");
  const thetaDeg = normalizedTheta(input.thetaDeg);
  const nSdKn = scenario.fixedNSdKn ?? input.nSdKn;
  const evaluateNormal = (t: number) =>
    normalResistanceForScenarioKn(scenario.id, t, thetaDeg);
  const residualAt = (t: number) => evaluateNormal(t) - nSdKn;
  const samples = Array.from({ length: sampleCount }, (_, index) =>
    pointAt(evaluateNormal, nSdKn, 3 * index / (sampleCount - 1)));
  const directIndices = new Set<number>();
  const rawCandidates: Omit<RootCandidate, "id" | "label">[] = [];

  samples.forEach((sample, index) => {
    if (Math.abs(sample.residualKn) <= ROOT_SAMPLE_EXACT_TOLERANCE_KN) {
      directIndices.add(index);
      rawCandidates.push({
        kind: "sample",
        aT: sample.t,
        bT: sample.t,
        faKn: sample.residualKn,
        fbKn: sample.residualKn,
        estimateT: sample.t,
        sampleIndex: index,
      });
    }
  });

  for (let index = 0; index < samples.length - 1; index += 1) {
    if (directIndices.has(index) || directIndices.has(index + 1)) continue;
    const first = samples[index];
    const second = samples[index + 1];
    if (first.residualKn * second.residualKn < 0) {
      rawCandidates.push({
        kind: "sign_change",
        aT: first.t,
        bT: second.t,
        faKn: first.residualKn,
        fbKn: second.residualKn,
        estimateT: (first.t + second.t) / 2,
      });
    }
  }

  let tangentProbeEvaluations = 0;
  for (let index = 1; index < samples.length - 1; index += 1) {
    if (
      directIndices.has(index - 1) ||
      directIndices.has(index) ||
      directIndices.has(index + 1)
    ) continue;
    const first = samples[index - 1];
    const second = samples[index];
    const third = samples[index + 1];
    const sameSign =
      first.residualKn * second.residualKn > 0 &&
      second.residualKn * third.residualKn > 0;
    const localAbsoluteMinimum =
      Math.abs(second.residualKn) < Math.abs(first.residualKn) &&
      Math.abs(second.residualKn) < Math.abs(third.residualKn);
    if (!sameSign || !localAbsoluteMinimum) continue;
    const probeT = parabolicVertex(first, second, third);
    if (probeT === null || probeT <= first.t || probeT >= third.t) continue;
    const probeResidualKn = residualAt(probeT);
    tangentProbeEvaluations += 1;
    if (Math.abs(probeResidualKn) <= ROOT_TANGENT_PROBE_TOLERANCE_KN) {
      rawCandidates.push({
        kind: "tangent",
        aT: first.t,
        bT: third.t,
        faKn: first.residualKn,
        fbKn: third.residualKn,
        estimateT: probeT,
        probeResidualKn,
      });
    }
  }

  rawCandidates.sort((first, second) => first.estimateT - second.estimateT);
  const candidates = rawCandidates.map((candidate, index): RootCandidate =>
    Object.freeze({
      ...candidate,
      id: `R${index + 1}`,
      label: `Raiz ${index + 1}`,
    }));

  const solutions = candidates.map((candidate): RootSolution => {
    let solved: SolveResult;
    let methodUsed: RootSolution["methodUsed"];
    if (candidate.kind === "sample") {
      solved = {
        rootT: candidate.estimateT,
        residualKn: candidate.faKn,
        trace: [],
        evaluations: 0,
        converged: true,
      };
      methodUsed = "sample";
    } else if (candidate.kind === "tangent") {
      solved = solveTangentCandidate(candidate, residualAt);
      methodUsed = "tangent_minimization";
    } else if (method === "bisection") {
      solved = solveByBisection(candidate, residualAt);
      methodUsed = "bisection";
    } else {
      solved = solveByBrent(candidate, residualAt);
      methodUsed = "brent";
    }
    return Object.freeze({
      candidateId: candidate.id,
      candidateKind: candidate.kind,
      methodUsed,
      rootT: solved.rootT,
      nRdKn: nSdKn + solved.residualKn,
      residualKn: solved.residualKn,
      converged: solved.converged,
      trace: Object.freeze(solved.trace),
      refinementEvaluations: solved.evaluations,
      totalAlgorithmEvaluations:
        sampleCount + tangentProbeEvaluations + solved.evaluations,
    });
  });

  const curve = Array.from({ length: curveSampleCount }, (_, index) =>
    pointAt(evaluateNormal, nSdKn, 3 * index / (curveSampleCount - 1)));
  return Object.freeze({
    input: Object.freeze({
      scenarioId: scenario.id,
      thetaDeg,
      nSdKn: input.nSdKn,
      method,
      sampleCount,
      curveSampleCount,
    }),
    scenario,
    nSdKn,
    samples: Object.freeze(samples),
    curve: Object.freeze(curve),
    candidates: Object.freeze(candidates),
    solutions: Object.freeze(solutions),
    scanEvaluations: sampleCount,
    tangentProbeEvaluations,
    signChangeCount: candidates.filter((candidate) => candidate.kind === "sign_change").length,
    directSampleCount: candidates.filter((candidate) => candidate.kind === "sample").length,
    tangentCandidateCount: candidates.filter((candidate) => candidate.kind === "tangent").length,
  });
}
