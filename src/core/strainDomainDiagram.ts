import {
  STEEL_ULTIMATE_STRAIN_REFERENCE,
  createConcreteMaterial,
  createSteelMaterial,
  type ConcreteMaterial,
  type SteelMaterial,
} from "./materialModel.ts";

export type StrainDomainId = "D1" | "D2" | "D3" | "D4" | "D4A" | "D5";
export type StrainDomainPivot = "A" | "B" | "C";

export type StrainDomainDefinition = Readonly<{
  id: StrainDomainId;
  number: "1" | "2" | "3" | "4" | "4a" | "5";
  label: string;
  start: number;
  end: number;
  pivot: StrainDomainPivot;
  interval: string;
  fixedPoint: string;
  movement: string;
  interpretation: string;
  ductility: "alta" | "intermediária" | "baixa" | "compressão";
}>;

export type StrainDomainInput = Readonly<{
  progress: number;
  fckMpa: number;
  heightMm: number;
  effectiveDepthMm: number;
  compressionSteelDepthMm: number;
}>;

export type StrainDomainState = Readonly<{
  input: StrainDomainInput;
  concrete: ConcreteMaterial;
  steel: SteelMaterial;
  epsSu: number;
  domain: StrainDomainDefinition;
  activeDomainIds: readonly StrainDomainId[];
  positionKind: "uniform_tension" | "domain" | "boundary" | "uniform_compression";
  positionLabel: string;
  positionExplanation: string;
  localProgress: number;
  branch: "steel_pivot" | "concrete_pivot" | "point_c_pivot";
  activePivots: readonly StrainDomainPivot[];
  epsTop: number;
  epsAtD: number;
  epsAtDPrime: number;
  epsBottom: number;
  slopePerMm: number;
  neutralAxisDepthMm: number;
  neutralAxisInsideSection: boolean;
  x23Mm: number;
  xLimitMm: number;
  pointCDepthMm: number;
  x23Ratio: number;
  xLimitRatio: number;
}>;

export const STRAIN_DOMAIN_PROGRESS_MAX = 6;
export const STRAIN_DOMAIN_DEFAULT_GEOMETRY = Object.freeze({
  heightMm: 600,
  effectiveDepthMm: 550.7,
  compressionSteelDepthMm: 49.3,
});

export const STRAIN_DOMAIN_CONCRETE_CLASSES = Object.freeze([
  30, 50, 60, 70, 80, 90,
]);

export const STRAIN_DOMAIN_DEFINITIONS: readonly StrainDomainDefinition[] =
  Object.freeze([
    Object.freeze({
      id: "D1" as const,
      number: "1" as const,
      label: "Domínio 1",
      start: 0,
      end: 1,
      pivot: "A" as const,
      interval: "x < 0",
      fixedPoint: "A armadura extrema permanece em εs = −εsu.",
      movement: "A deformação da borda superior cresce de −εsu até zero.",
      interpretation: "Toda a seção está tracionada; o limite é a deformação convencional do aço.",
      ductility: "alta" as const,
    }),
    Object.freeze({
      id: "D2" as const,
      number: "2" as const,
      label: "Domínio 2",
      start: 1,
      end: 2,
      pivot: "A" as const,
      interval: "0 < x < x23",
      fixedPoint: "A armadura extrema permanece em εs = −εsu.",
      movement: "A compressão no concreto cresce de zero até εcu.",
      interpretation: "Há concreto comprimido e aço fortemente tracionado, com grande capacidade de rotação.",
      ductility: "alta" as const,
    }),
    Object.freeze({
      id: "D3" as const,
      number: "3" as const,
      label: "Domínio 3",
      start: 2,
      end: 3,
      pivot: "B" as const,
      interval: "x23 < x < xlim",
      fixedPoint: "B borda comprimida permanece em εc = εcu.",
      movement: "A linha neutra avança e a tração do aço cai de εsu até εyd.",
      interpretation: "Concreto no limite e aço tracionado escoado: resposta dúctil e com aviso prévio.",
      ductility: "alta" as const,
    }),
    Object.freeze({
      id: "D4" as const,
      number: "4" as const,
      label: "Domínio 4",
      start: 3,
      end: 4,
      pivot: "B" as const,
      interval: "xlim < x < d",
      fixedPoint: "B borda comprimida permanece em εc = εcu.",
      movement: "A linha neutra avança de xlim até a armadura em d.",
      interpretation: "O aço ainda está tracionado, porém não alcança εyd antes do concreto atingir εcu.",
      ductility: "baixa" as const,
    }),
    Object.freeze({
      id: "D4A" as const,
      number: "4a" as const,
      label: "Domínio 4a",
      start: 4,
      end: 5,
      pivot: "B" as const,
      interval: "d < x < h",
      fixedPoint: "B borda comprimida permanece em εc = εcu.",
      movement: "A linha neutra atravessa o trecho entre a armadura extrema e a borda inferior.",
      interpretation: "Todas as armaduras estão comprimidas, embora ainda exista concreto tracionado.",
      ductility: "compressão" as const,
    }),
    Object.freeze({
      id: "D5" as const,
      number: "5" as const,
      label: "Domínio 5",
      start: 5,
      end: 6,
      pivot: "C" as const,
      interval: "x > h",
      fixedPoint: "C permanece em ε = εc2.",
      movement: "A reta gira até a compressão uniforme εc2, quando a curvatura se anula.",
      interpretation: "Toda a seção está comprimida; não existe região de concreto tracionado.",
      ductility: "compressão" as const,
    }),
  ]);

const BOUNDARY_LABELS = Object.freeze([
  "Tração uniforme",
  "D1–D2 · x = 0",
  "D2–D3 · x = x23",
  "D3–D4 · x = xlim",
  "D4–D4a · x = d",
  "D4a–D5 · x = h",
  "Compressão uniforme",
]);

const BOUNDARY_EXPLANATIONS = Object.freeze([
  "Toda a seção apresenta ε = −εsu.",
  "A linha neutra toca a borda superior e inicia a região comprimida.",
  "A e B são atingidos simultaneamente: εs(d)=−εsu e εc(0)=εcu.",
  "A armadura em d está exatamente em −εyd; aqui termina o escoamento à tração.",
  "A armadura em d está em ε=0; depois desta linha todas as armaduras ficam comprimidas.",
  "A linha neutra toca a borda inferior; B, C e ε(h)=0 pertencem à mesma reta.",
  "Toda a seção apresenta ε = εc2 e a curvatura é nula.",
]);

function requireFinite(value: number, name: string) {
  if (!Number.isFinite(value)) throw new Error(`${name} deve ser finito.`);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function domainIndexAt(progress: number) {
  if (progress >= STRAIN_DOMAIN_PROGRESS_MAX) return 5;
  return Math.floor(progress);
}

function positionAt(progress: number) {
  const rounded = Math.round(progress);
  const atBoundary = Math.abs(progress - rounded) <= 1e-9;
  if (!atBoundary) {
    return {
      kind: "domain" as const,
      label: STRAIN_DOMAIN_DEFINITIONS[domainIndexAt(progress)].label,
      explanation: STRAIN_DOMAIN_DEFINITIONS[domainIndexAt(progress)].interpretation,
      activeDomainIds: [STRAIN_DOMAIN_DEFINITIONS[domainIndexAt(progress)].id],
    };
  }
  if (rounded === 0) {
    return {
      kind: "uniform_tension" as const,
      label: BOUNDARY_LABELS[0],
      explanation: BOUNDARY_EXPLANATIONS[0],
      activeDomainIds: ["D1" as const],
    };
  }
  if (rounded === STRAIN_DOMAIN_PROGRESS_MAX) {
    return {
      kind: "uniform_compression" as const,
      label: BOUNDARY_LABELS[6],
      explanation: BOUNDARY_EXPLANATIONS[6],
      activeDomainIds: ["D5" as const],
    };
  }
  return {
    kind: "boundary" as const,
    label: BOUNDARY_LABELS[rounded],
    explanation: BOUNDARY_EXPLANATIONS[rounded],
    activeDomainIds: [
      STRAIN_DOMAIN_DEFINITIONS[rounded - 1].id,
      STRAIN_DOMAIN_DEFINITIONS[rounded].id,
    ],
  };
}

export function strainAtDomainDepth(
  state: Pick<StrainDomainState, "epsTop" | "slopePerMm">,
  depthMm: number,
) {
  return state.epsTop + state.slopePerMm * depthMm;
}

export function computeStrainDomainState(
  input: StrainDomainInput,
): StrainDomainState {
  requireFinite(input.progress, "progress");
  requireFinite(input.fckMpa, "fck");
  requireFinite(input.heightMm, "h");
  requireFinite(input.effectiveDepthMm, "d");
  requireFinite(input.compressionSteelDepthMm, "d'");
  if (input.progress < 0 || input.progress > STRAIN_DOMAIN_PROGRESS_MAX) {
    throw new Error("progress deve estar entre 0 e 6.");
  }
  if (input.heightMm <= 0) throw new Error("h deve ser positivo.");
  if (input.effectiveDepthMm <= 0 || input.effectiveDepthMm > input.heightMm) {
    throw new Error("d deve satisfazer 0 < d ≤ h.");
  }
  if (
    input.compressionSteelDepthMm < 0 ||
    input.compressionSteelDepthMm >= input.effectiveDepthMm
  ) {
    throw new Error("d' deve satisfazer 0 ≤ d' < d.");
  }

  const concrete = createConcreteMaterial(input.fckMpa);
  const steel = createSteelMaterial(500, 1.15, 210_000);
  const epsSu = STEEL_ULTIMATE_STRAIN_REFERENCE;
  const epsCu = concrete.epsCu;
  const epsC2 = concrete.epsC2;
  const h = input.heightMm;
  const d = input.effectiveDepthMm;
  const dPrime = input.compressionSteelDepthMm;
  const x23Mm = epsCu * d / (epsCu + epsSu);
  const xLimitMm = epsCu * d / (epsCu + steel.epsYd);
  const pointCDepthMm = (1 - epsC2 / epsCu) * h;
  const progress = input.progress;

  let branch: StrainDomainState["branch"];
  let epsTop: number;
  let epsBottom: number;
  let slopePerMm: number;
  let localProgress: number;

  if (progress <= 1) {
    branch = "steel_pivot";
    localProgress = progress;
    epsTop = -epsSu + localProgress * epsSu;
    slopePerMm = (-epsSu - epsTop) / d;
    epsBottom = epsTop + slopePerMm * h;
  } else if (progress <= 2) {
    branch = "steel_pivot";
    localProgress = progress - 1;
    epsTop = localProgress * epsCu;
    slopePerMm = (-epsSu - epsTop) / d;
    epsBottom = epsTop + slopePerMm * h;
  } else if (progress <= 5) {
    branch = "concrete_pivot";
    const interval = Math.min(2, Math.floor(progress - 2));
    localProgress = progress - (interval + 2);
    const limits = [x23Mm, xLimitMm, d, h];
    const x = limits[interval] + localProgress * (limits[interval + 1] - limits[interval]);
    epsTop = epsCu;
    slopePerMm = -epsCu / x;
    epsBottom = epsTop + slopePerMm * h;
  } else {
    branch = "point_c_pivot";
    localProgress = progress - 5;
    epsTop = epsCu + localProgress * (epsC2 - epsCu);
    epsBottom = localProgress * epsC2;
    slopePerMm = (epsBottom - epsTop) / h;
  }

  const neutralAxisDepthMm = Math.abs(slopePerMm) <= 1e-16
    ? epsTop < 0 ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY
    : -epsTop / slopePerMm;
  const location = positionAt(progress);
  const activePivots: StrainDomainPivot[] = branch === "steel_pivot"
    ? ["A"]
    : branch === "concrete_pivot" ? ["B"] : ["C"];
  if (Math.abs(progress - 2) <= 1e-9) activePivots.push("B");
  if (Math.abs(progress - 5) <= 1e-9) activePivots.push("C");

  return Object.freeze({
    input: Object.freeze({ ...input, progress: clamp(progress, 0, 6) }),
    concrete,
    steel,
    epsSu,
    domain: STRAIN_DOMAIN_DEFINITIONS[domainIndexAt(progress)],
    activeDomainIds: Object.freeze(location.activeDomainIds),
    positionKind: location.kind,
    positionLabel: location.label,
    positionExplanation: location.explanation,
    localProgress: location.kind === "boundary" ? 1 : clamp(localProgress, 0, 1),
    branch,
    activePivots: Object.freeze(activePivots),
    epsTop,
    epsAtD: epsTop + slopePerMm * d,
    epsAtDPrime: epsTop + slopePerMm * dPrime,
    epsBottom,
    slopePerMm,
    neutralAxisDepthMm,
    neutralAxisInsideSection:
      Number.isFinite(neutralAxisDepthMm) && neutralAxisDepthMm >= 0 && neutralAxisDepthMm <= h,
    x23Mm,
    xLimitMm,
    pointCDepthMm,
    x23Ratio: x23Mm / d,
    xLimitRatio: xLimitMm / d,
  });
}

export function domainProgressAtMiddle(domainId: StrainDomainId) {
  const domain = STRAIN_DOMAIN_DEFINITIONS.find((candidate) => candidate.id === domainId);
  if (!domain) throw new Error(`Domínio desconhecido: ${domainId}`);
  return (domain.start + domain.end) / 2;
}

export function domainBoundaryLabel(index: number) {
  if (!Number.isInteger(index) || index < 0 || index > 6) {
    throw new Error("O índice da fronteira deve estar entre 0 e 6.");
  }
  return BOUNDARY_LABELS[index];
}
