import { createSteelMaterial, STEEL_ULTIMATE_STRAIN_REFERENCE } from "./materialModel.ts";
import { computeProjectedGeometry } from "./projectedGeometry.ts";

export type LimitStateBranch = "steel_pivot" | "concrete_pivot" | "point_c_pivot";

export type LimitStateDomainId =
  | "D1_D2"
  | "D2"
  | "D2_D3"
  | "D3"
  | "D3_D4"
  | "D4"
  | "D4_D4A"
  | "D4A"
  | "D4A_D5"
  | "D5"
  | "UNIFORM";

export type LimitStateBar = Readonly<{
  id: string;
  xMm: number;
  yMm: number;
  areaMm2: number;
  projectionMm: number;
  depthMm: number;
  relativeDepth: number;
  strain: number;
  strainPerMille: number;
  strainState: "yielded_tension" | "elastic_tension" | "neutral" | "compression";
  isSteelPivotReference: boolean;
  isMinimumStrain: boolean;
}>;

export type LimitStateBoundary = Readonly<{
  id: "D1_D2" | "D2_D3" | "D3_D4" | "D4_D4A" | "D4A_D5" | "UNIFORM";
  label: string;
  t: number;
}>;

export type LimitStatePathInput = Readonly<{
  t: number;
  thetaDeg: number;
}>;

export type LimitStatePath = Readonly<{
  input: LimitStatePathInput;
  branch: LimitStateBranch;
  pivotLabel: "A" | "B" | "C";
  domainId: LimitStateDomainId;
  domainLabel: string;
  domainExplanation: string;
  cosine: number;
  sine: number;
  tangentX: number;
  tangentY: number;
  pMaxMm: number;
  pMinMm: number;
  heightMm: number;
  effectiveDepthMm: number;
  x23Mm: number;
  x34Mm: number;
  pointCDepthMm: number;
  neutralAxisDepthMm: number;
  neutralAxisProjectionMm: number;
  neutralAxisInsideSection: boolean;
  epsTop: number;
  epsBottom: number;
  slopePerMm: number;
  pivotDepthMm: number;
  pivotStrain: number;
  bars: readonly LimitStateBar[];
  steelPivotBarIds: readonly string[];
  minimumStrainBarIds: readonly string[];
  minimumSteelStrain: number;
  boundaries: readonly LimitStateBoundary[];
  tD3D4: number;
  tD4D4a: number;
}>;

export const LIMIT_STATE_CONCRETE = Object.freeze({
  epsC2: 0.002,
  epsCu: 0.0035,
});

export const LIMIT_STATE_STEEL = createSteelMaterial(500, 1.15, 210_000);
export const LIMIT_STATE_EPS_SU = STEEL_ULTIMATE_STRAIN_REFERENCE;

const DOMAIN_TEXT: Record<LimitStateDomainId, { label: string; explanation: string }> = {
  D1_D2: {
    label: "D1–D2",
    explanation: "A borda extrema do concreto está em ε=0 e a barra extrema ancora o pivô A em −εsu.",
  },
  D2: {
    label: "D2",
    explanation: "A barra extrema permanece em −εsu enquanto a compressão do concreto cresce até εcu.",
  },
  D2_D3: {
    label: "D2–D3",
    explanation: "Os limites A e B são atingidos simultaneamente: εs=−εsu na barra extrema e εtop=εcu.",
  },
  D3: {
    label: "D3",
    explanation: "O concreto está em εcu e a barra realmente mais tracionada já ultrapassou −εyd.",
  },
  D3_D4: {
    label: "D3–D4",
    explanation: "A barra realmente mais tracionada está exatamente em −εyd.",
  },
  D4: {
    label: "D4",
    explanation: "Ainda existe barra tracionada, mas sua deformação não alcança o escoamento de cálculo.",
  },
  D4_D4A: {
    label: "D4–D4a",
    explanation: "A barra de menor deformação está exatamente em ε=0.",
  },
  D4A: {
    label: "D4a",
    explanation: "Todas as barras estão comprimidas, embora a linha neutra ainda corte a seção de concreto.",
  },
  D4A_D5: {
    label: "D4a–D5",
    explanation: "A linha neutra alcança a borda z=h; toda a seção passa a ficar comprimida.",
  },
  D5: {
    label: "D5",
    explanation: "Toda a seção está comprimida e o diagrama gira em torno do ponto C, mantido em εc2.",
  },
  UNIFORM: {
    label: "Compressão uniforme",
    explanation: "A curvatura é nula e toda a seção apresenta ε=εc2.",
  },
};

function requireFinite(value: number, name: string) {
  if (!Number.isFinite(value)) throw new Error(`${name} deve ser finito.`);
}

function close(first: number, second: number, tolerance = 1e-9) {
  return Math.abs(first - second) <= tolerance;
}

export function strainAtLimitStateDepth(
  state: Pick<LimitStatePath, "epsTop" | "slopePerMm">,
  depthMm: number,
) {
  return state.epsTop + state.slopePerMm * depthMm;
}

function classifyDomain(
  t: number,
  minimumSteelStrain: number,
  tD3D4: number,
  tD4D4a: number,
): LimitStateDomainId {
  const tTolerance = 2e-7;
  const strainTolerance = 2e-10;
  if (close(t, 0, tTolerance)) return "D1_D2";
  if (t < 1 - tTolerance) return "D2";
  if (close(t, 1, tTolerance)) return "D2_D3";
  if (close(t, tD3D4, tTolerance) || close(minimumSteelStrain, -LIMIT_STATE_STEEL.epsYd, strainTolerance)) {
    return "D3_D4";
  }
  if (close(t, tD4D4a, tTolerance) || close(minimumSteelStrain, 0, strainTolerance)) {
    return "D4_D4A";
  }
  if (t < 2 - tTolerance) {
    if (minimumSteelStrain < -LIMIT_STATE_STEEL.epsYd) return "D3";
    if (minimumSteelStrain < 0) return "D4";
    return "D4A";
  }
  if (close(t, 2, tTolerance)) return "D4A_D5";
  if (t < 3 - tTolerance) return "D5";
  return "UNIFORM";
}

export function computeLimitStatePath(input: LimitStatePathInput): LimitStatePath {
  requireFinite(input.t, "t");
  requireFinite(input.thetaDeg, "thetaDeg");
  if (input.t < 0 || input.t > 3) throw new Error("t deve estar entre 0 e 3.");

  const projection = computeProjectedGeometry({
    geometryId: "rectangle",
    thetaDeg: input.thetaDeg,
    neutralAxisRatio: 0.5,
  });
  const deepestDepthMm = Math.max(...projection.bars.map((bar) => bar.depthMm));
  const depthTolerance = Math.max(1e-8, projection.heightMm * 1e-10);
  const steelPivotBarIds = projection.bars
    .filter((bar) => Math.abs(bar.depthMm - deepestDepthMm) <= depthTolerance)
    .map((bar) => bar.id);
  const epsCu = LIMIT_STATE_CONCRETE.epsCu;
  const epsC2 = LIMIT_STATE_CONCRETE.epsC2;
  const epsSu = LIMIT_STATE_EPS_SU;
  const epsYd = LIMIT_STATE_STEEL.epsYd;
  const heightMm = projection.heightMm;
  const effectiveDepthMm = deepestDepthMm;
  const x23Mm = epsCu * effectiveDepthMm / (epsCu + epsSu);
  const x34Mm = epsCu * effectiveDepthMm / (epsCu + epsYd);
  const pointCDepthMm = (1 - epsC2 / epsCu) * heightMm;
  const tD3D4 = 1 + (x34Mm - x23Mm) / (heightMm - x23Mm);
  const tD4D4a = 1 + (effectiveDepthMm - x23Mm) / (heightMm - x23Mm);

  let branch: LimitStateBranch;
  let pivotLabel: LimitStatePath["pivotLabel"];
  let epsTop: number;
  let epsBottom: number;
  let slopePerMm: number;
  let neutralAxisDepthMm: number;
  let pivotDepthMm: number;
  let pivotStrain: number;

  if (input.t <= 1) {
    branch = "steel_pivot";
    pivotLabel = "A";
    epsTop = input.t * epsCu;
    slopePerMm = (-epsSu - epsTop) / effectiveDepthMm;
    epsBottom = epsTop + slopePerMm * heightMm;
    neutralAxisDepthMm = -epsTop / slopePerMm;
    pivotDepthMm = effectiveDepthMm;
    pivotStrain = -epsSu;
  } else if (input.t <= 2) {
    branch = "concrete_pivot";
    pivotLabel = "B";
    const local = input.t - 1;
    neutralAxisDepthMm = x23Mm + local * (heightMm - x23Mm);
    epsTop = epsCu;
    slopePerMm = -epsCu / neutralAxisDepthMm;
    epsBottom = epsTop + slopePerMm * heightMm;
    pivotDepthMm = 0;
    pivotStrain = epsCu;
  } else {
    branch = "point_c_pivot";
    pivotLabel = "C";
    const local = input.t - 2;
    epsTop = epsCu + local * (epsC2 - epsCu);
    epsBottom = local * epsC2;
    slopePerMm = (epsBottom - epsTop) / heightMm;
    neutralAxisDepthMm = Math.abs(slopePerMm) <= 1e-16
      ? Number.POSITIVE_INFINITY
      : -epsTop / slopePerMm;
    pivotDepthMm = pointCDepthMm;
    pivotStrain = epsC2;
  }

  const rawBars = projection.bars.map((bar) => ({
    ...bar,
    strain: epsTop + slopePerMm * bar.depthMm,
  }));
  const minimumSteelStrain = Math.min(...rawBars.map((bar) => bar.strain));
  const strainTolerance = 2e-10;
  const minimumStrainBarIds = rawBars
    .filter((bar) => Math.abs(bar.strain - minimumSteelStrain) <= strainTolerance)
    .map((bar) => bar.id);
  const bars = rawBars.map((bar): LimitStateBar => {
    let strainState: LimitStateBar["strainState"];
    if (bar.strain < -epsYd - strainTolerance) strainState = "yielded_tension";
    else if (bar.strain < -strainTolerance) strainState = "elastic_tension";
    else if (Math.abs(bar.strain) <= strainTolerance) strainState = "neutral";
    else strainState = "compression";
    return Object.freeze({
      id: bar.id,
      xMm: bar.xMm,
      yMm: bar.yMm,
      areaMm2: bar.areaMm2,
      projectionMm: bar.projectionMm,
      depthMm: bar.depthMm,
      relativeDepth: bar.relativeDepth,
      strain: bar.strain,
      strainPerMille: bar.strain * 1_000,
      strainState,
      isSteelPivotReference: steelPivotBarIds.includes(bar.id),
      isMinimumStrain: minimumStrainBarIds.includes(bar.id),
    });
  });
  const domainId = classifyDomain(input.t, minimumSteelStrain, tD3D4, tD4D4a);
  const domain = DOMAIN_TEXT[domainId];
  const neutralAxisProjectionMm = Number.isFinite(neutralAxisDepthMm)
    ? projection.pMaxMm - neutralAxisDepthMm
    : Number.NEGATIVE_INFINITY;
  const boundaries: readonly LimitStateBoundary[] = Object.freeze([
    Object.freeze({ id: "D1_D2", label: "D1–D2", t: 0 }),
    Object.freeze({ id: "D2_D3", label: "D2–D3", t: 1 }),
    Object.freeze({ id: "D3_D4", label: "D3–D4", t: tD3D4 }),
    Object.freeze({ id: "D4_D4A", label: "D4–D4a", t: tD4D4a }),
    Object.freeze({ id: "D4A_D5", label: "D4a–D5", t: 2 }),
    Object.freeze({ id: "UNIFORM", label: "εc2 uniforme", t: 3 }),
  ]);

  return Object.freeze({
    input: Object.freeze({ ...input, thetaDeg: projection.input.thetaDeg }),
    branch,
    pivotLabel,
    domainId,
    domainLabel: domain.label,
    domainExplanation: domain.explanation,
    cosine: projection.cosine,
    sine: projection.sine,
    tangentX: projection.tangentX,
    tangentY: projection.tangentY,
    pMaxMm: projection.pMaxMm,
    pMinMm: projection.pMinMm,
    heightMm,
    effectiveDepthMm,
    x23Mm,
    x34Mm,
    pointCDepthMm,
    neutralAxisDepthMm,
    neutralAxisProjectionMm,
    neutralAxisInsideSection: neutralAxisDepthMm >= 0 && neutralAxisDepthMm <= heightMm,
    epsTop,
    epsBottom,
    slopePerMm,
    pivotDepthMm,
    pivotStrain,
    bars: Object.freeze(bars),
    steelPivotBarIds: Object.freeze(steelPivotBarIds),
    minimumStrainBarIds: Object.freeze(minimumStrainBarIds),
    minimumSteelStrain,
    boundaries,
    tD3D4,
    tD4D4a,
  });
}
