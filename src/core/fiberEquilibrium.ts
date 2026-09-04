import {
  calculateSectionState, SECTION,
  type MeshSettings, type PlaneParameters, type SectionState,
} from "./sectionModel.ts";

export type SectionLoads = { nKn: number; mxKnm: number; myKnm: number };
export type ForceElement = {
  id: string; kind: "concrete" | "steel"; xMm: number; yMm: number;
  areaMm2: number; strain: number; stressMpa: number; forceKn: number;
  steelForceKn: number; displacedConcreteKn: number;
};
export type EquilibriumSolution = {
  plane: PlaneParameters; state: SectionState; converged: boolean;
  residual: SectionLoads; iterations: number; residualNorm: number;
};
type Vector = [number, number, number];
const SCALE: Vector = [4000, 500, 250];
const toQ = (p: PlaneParameters): Vector => [p.eps0PerMille, p.gxPerMillePerM * 0.15, p.gyPerMillePerM * 0.3];
const fromQ = (q: Vector): PlaneParameters => ({ eps0PerMille: q[0], gxPerMillePerM: q[1] / 0.15, gyPerMillePerM: q[2] / 0.3 });
const loadsArray = (load: SectionLoads): Vector => [load.nKn, load.mxKnm, load.myKnm];
const norm = (v: Vector) => Math.hypot(...v);

/** Forças coerentes com a integração original: concreto bruto e aço líquido. */
export function forceElements(state: SectionState): ForceElement[] {
  return [
    ...state.fibers.map((fiber, i): ForceElement => ({
      id: `C${i + 1}`, kind: "concrete", xMm: fiber.xMm, yMm: fiber.yMm,
      areaMm2: fiber.areaMm2, strain: fiber.strain, stressMpa: fiber.concreteStressMpa,
      forceKn: fiber.concreteStressMpa * fiber.areaMm2 / 1000,
      steelForceKn: 0, displacedConcreteKn: 0,
    })),
    ...state.rebars.map((bar): ForceElement => ({
      id: bar.id, kind: "steel", xMm: bar.xMm, yMm: bar.yMm,
      areaMm2: bar.areaMm2, strain: bar.strain, stressMpa: bar.steelStressMpa,
      forceKn: bar.effectiveStressMpa * bar.areaMm2 / 1000,
      steelForceKn: bar.steelStressMpa * bar.areaMm2 / 1000,
      displacedConcreteKn: (bar.steelStressMpa - bar.effectiveStressMpa) * bar.areaMm2 / 1000,
    })),
  ];
}

export function sumForces(elements: ForceElement[]): SectionLoads {
  return elements.reduce((sum, element) => ({
    nKn: sum.nKn + element.forceKn,
    mxKnm: sum.mxKnm + element.forceKn * element.yMm / 1000,
    myKnm: sum.myKnm + element.forceKn * element.xMm / 1000,
  }), { nKn: 0, mxKnm: 0, myKnm: 0 });
}

function solve3(matrix: number[][], rhs: Vector): Vector | null {
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let row = col + 1; row < 3; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-14) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    for (let j = col; j < 4; j++) a[col][j] /= divisor;
    for (let row = 0; row < 3; row++) if (row !== col) {
      const factor = a[row][col];
      for (let j = col; j < 4; j++) a[row][j] -= factor * a[col][j];
    }
  }
  const answer = a.map(row => row[3]) as Vector;
  return answer.every(Number.isFinite) ? answer : null;
}

/** Equilíbrio seccional por Newton amortecido, com reinicializações limitadas.
 * O resíduo é sempre devolvido. Falha de convergência NÃO prova falta de capacidade.
 * Não verifica ELU, estabilidade ou unicidade da solução.
 */
export function solveEquilibrium(
  target: SectionLoads, mesh: MeshSettings, seed?: PlaneParameters,
): EquilibriumSolution {
  const desired = loadsArray(target);
  if (!desired.every(Number.isFinite)) throw new Error("Esforços devem ser finitos.");
  const residualVector = (state: SectionState) => loadsArray(state).map((value, i) => (value - desired[i]) / SCALE[i]) as Vector;
  const elastic: Vector = [target.nKn / 3600, target.myKnm / 140, target.mxKnm / 280];
  const seeds: Vector[] = [seed ? toQ(seed) : elastic, elastic, [0.15, target.myKnm / 100, target.mxKnm / 200], [-0.2, target.myKnm / 100, target.mxKnm / 200]];
  let bestQ = seeds[0];
  let bestState = calculateSectionState(fromQ(bestQ), mesh);
  let bestNorm = norm(residualVector(bestState));
  let iterations = 0;

  for (const start of seeds) {
    let q = [...start] as Vector;
    for (let iteration = 0; iteration < 42; iteration++) {
      iterations++;
      const state = calculateSectionState(fromQ(q), mesh);
      const r = residualVector(state);
      const error = norm(r);
      if (error <= bestNorm) { bestNorm = error; bestQ = q; bestState = state; }
      if (error < 1e-6) break;

      const jacobian = Array.from({ length: 3 }, () => [0, 0, 0]);
      for (let column = 0; column < 3; column++) {
        const h = 1e-5 * Math.max(1, Math.abs(q[column]));
        const plus = [...q] as Vector; plus[column] += h;
        const minus = [...q] as Vector; minus[column] -= h;
        const rp = residualVector(calculateSectionState(fromQ(plus), mesh));
        const rm = residualVector(calculateSectionState(fromQ(minus), mesh));
        for (let row = 0; row < 3; row++) jacobian[row][column] = (rp[row] - rm[row]) / (2 * h);
      }
      let step = solve3(jacobian, r.map(value => -value) as Vector);
      if (!step) {
        // Regularização para regiões com aço ou concreto no patamar.
        const jtj = Array.from({ length: 3 }, (_, i) => Array.from({ length: 3 }, (_, j) =>
          jacobian.reduce((sum, row) => sum + row[i] * row[j], i === j ? 1e-7 : 0)));
        const jtr = [0, 1, 2].map(i => -jacobian.reduce((sum, row, k) => sum + row[i] * r[k], 0)) as Vector;
        step = solve3(jtj, jtr);
      }
      if (!step) break;
      const scale = Math.max(1, Math.max(...step.map(Math.abs)) / 0.8);
      step = step.map(v => v / scale) as Vector;
      let accepted = false;
      for (let alpha = 1; alpha >= 1 / 256; alpha /= 2) {
        const trial = q.map((value, i) => Math.min(15, Math.max(-15, value + alpha * step![i]))) as Vector;
        const trialState = calculateSectionState(fromQ(trial), mesh);
        if (norm(residualVector(trialState)) < error) { q = trial; accepted = true; break; }
      }
      if (!accepted) break;
    }
    if (bestNorm < 1e-6) break;
  }
  return {
    plane: fromQ(bestQ), state: bestState, residualNorm: bestNorm,
    converged: bestNorm < 1e-6, iterations,
    residual: { nKn: bestState.nKn - target.nKn, mxKnm: bestState.mxKnm - target.mxKnm, myKnm: bestState.myKnm - target.myKnm },
  };
}

/** Escala única para concreto e aço; zero força não recebe seta mínima. */
export const FORCE_WORLD_PER_KN = 0.035;
export const FORCE_COLOR_LIMIT_KN = 120;
export function forceArrowLength(forceKn: number, gain: number) {
  return Math.abs(forceKn) * FORCE_WORLD_PER_KN * gain;
}
export function forceArrowDirection(forceKn: number) { return forceKn >= 0 ? -1 : 1; }

export function forceColor(forceKn: number) {
  const ratio = Math.min(1, Math.abs(forceKn) / FORCE_COLOR_LIMIT_KN);
  const palette = forceKn < 0 ? ["#233a50", "#00eeff", "#009aff", "#455bff", "#b33eff"]
    : ["#233a50", "#ffe934", "#ffa600", "#ff4826", "#ff1e68"];
  const stops = [0, 0.015, 0.15, 0.5, 1];
  let i = 0;
  while (i < stops.length - 2 && ratio > stops[i + 1]) i++;
  const t = (ratio - stops[i]) / (stops[i + 1] - stops[i]);
  const channels = [1, 3, 5].map(offset => {
    const a = parseInt(palette[i].slice(offset, offset + 2), 16);
    const b = parseInt(palette[i + 1].slice(offset, offset + 2), 16);
    return Math.round(a + (b - a) * t).toString(16).padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

export const DEFAULT_FORCE_MESH: MeshSettings = { nx: 8, ny: 16 };
export const DEFAULT_FORCE_LOADS: SectionLoads = { nKn: 1800, mxKnm: 160, myKnm: 45 };
export const FORCE_SECTION_AREA_MM2 = SECTION.widthMm * SECTION.heightMm;
