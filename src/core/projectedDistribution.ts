import {
  concreteStressFor,
  createConcreteMaterial,
  createSteelMaterial,
  steelStressFor,
} from "./materialModel.ts";

export type ProjectedProfileInput = {
  thetaDeg: number;
  epsTopPerMille: number;
  epsBottomPerMille: number;
  bands?: number;
};

export type ProjectedBarState = {
  id: string;
  xMm: number;
  yMm: number;
  zMm: number;
  areaMm2: number;
  strain: number;
  concreteStressMpa: number;
  steelStressMpa: number;
  steelForceKn: number;
  displacedConcreteKn: number;
  effectiveForceKn: number;
};

export type ProjectedBandState = {
  zMm: number;
  areaMm2: number;
  concreteForceKn: number;
};

export type ProjectedDistribution = {
  input: Required<ProjectedProfileInput>;
  thetaRad: number;
  cosine: number;
  sine: number;
  pMaxMm: number;
  pMinMm: number;
  heightMm: number;
  bandWidthMm: number;
  epsTop: number;
  epsBottom: number;
  slopePerMm: number;
  eps0: number;
  gxPerMm: number;
  gyPerMm: number;
  neutralAxisDepthMm: number | null;
  bands: ProjectedBandState[];
  bars: ProjectedBarState[];
  concreteNKn: number;
  steelNKn: number;
  nKn: number;
  mxKnm: number;
  myKnm: number;
};

export const PROJECTED_SECTION = Object.freeze({
  widthMm: 300,
  heightMm: 600,
  nx: 48,
  ny: 72,
  coverMm: 35,
  stirrupDiameterMm: 6.3,
  longitudinalDiameterMm: 16,
});

export const PROJECTED_CONCRETE = createConcreteMaterial(30, 1.4);
export const PROJECTED_STEEL = createSteelMaterial(500, 1.15, 210_000);

const barAreaMm2 = Math.PI * PROJECTED_SECTION.longitudinalDiameterMm ** 2 / 4;
const barAxisCoverMm =
  PROJECTED_SECTION.coverMm +
  PROJECTED_SECTION.stirrupDiameterMm +
  PROJECTED_SECTION.longitudinalDiameterMm / 2;
const barX = PROJECTED_SECTION.widthMm / 2 - barAxisCoverMm;
const barY = PROJECTED_SECTION.heightMm / 2 - barAxisCoverMm;

export const PROJECTED_REBARS = Object.freeze([
  { id: "B1", xMm: -barX, yMm: -barY, areaMm2: barAreaMm2 },
  { id: "B2", xMm: 0, yMm: -barY, areaMm2: barAreaMm2 },
  { id: "B3", xMm: barX, yMm: -barY, areaMm2: barAreaMm2 },
  { id: "B4", xMm: -barX, yMm: 0, areaMm2: barAreaMm2 },
  { id: "B5", xMm: barX, yMm: 0, areaMm2: barAreaMm2 },
  { id: "B6", xMm: -barX, yMm: barY, areaMm2: barAreaMm2 },
  { id: "B7", xMm: 0, yMm: barY, areaMm2: barAreaMm2 },
  { id: "B8", xMm: barX, yMm: barY, areaMm2: barAreaMm2 },
]);

function requireFinite(value: number, name: string) {
  if (!Number.isFinite(value)) throw new Error(`${name} deve ser finito.`);
}

export function strainAtProjectedDepth(
  distribution: Pick<ProjectedDistribution, "epsTop" | "slopePerMm">,
  zMm: number,
) {
  return distribution.epsTop + distribution.slopePerMm * zMm;
}

export function computeProjectedDistribution(
  input: ProjectedProfileInput,
): ProjectedDistribution {
  requireFinite(input.thetaDeg, "thetaDeg");
  requireFinite(input.epsTopPerMille, "epsTopPerMille");
  requireFinite(input.epsBottomPerMille, "epsBottomPerMille");
  if (input.epsBottomPerMille > input.epsTopPerMille + 1e-12) {
    throw new Error("A deformação em z=h não pode exceder a deformação em z=0.");
  }

  const bands = input.bands ?? 60;
  if (!Number.isInteger(bands) || bands < 12 || bands > 180) {
    throw new Error("bands deve ser inteiro entre 12 e 180.");
  }

  const thetaDeg = ((input.thetaDeg % 180) + 180) % 180;
  const thetaRad = thetaDeg * Math.PI / 180;
  const cosine = Math.cos(thetaRad);
  const sine = Math.sin(thetaRad);
  const vertices = [
    [-PROJECTED_SECTION.widthMm / 2, -PROJECTED_SECTION.heightMm / 2],
    [PROJECTED_SECTION.widthMm / 2, -PROJECTED_SECTION.heightMm / 2],
    [PROJECTED_SECTION.widthMm / 2, PROJECTED_SECTION.heightMm / 2],
    [-PROJECTED_SECTION.widthMm / 2, PROJECTED_SECTION.heightMm / 2],
  ] as const;
  const projections = vertices.map(([xMm, yMm]) => xMm * cosine + yMm * sine);
  const pMaxMm = Math.max(...projections);
  const pMinMm = Math.min(...projections);
  const heightMm = pMaxMm - pMinMm;
  const bandWidthMm = heightMm / bands;
  const epsTop = input.epsTopPerMille / 1_000;
  const epsBottom = input.epsBottomPerMille / 1_000;
  const slopePerMm = (epsBottom - epsTop) / heightMm;
  const eps0 = epsTop + slopePerMm * pMaxMm;
  const gxPerMm = -slopePerMm * cosine;
  const gyPerMm = -slopePerMm * sine;
  const neutralAxisDepthMm =
    Math.abs(slopePerMm) <= 1e-18 || epsTop * epsBottom > 0
      ? null
      : Math.min(heightMm, Math.max(0, -epsTop / slopePerMm));

  const bandStates: ProjectedBandState[] = Array.from(
    { length: bands },
    (_, index) => ({
      zMm: (index + 0.5) * bandWidthMm,
      areaMm2: 0,
      concreteForceKn: 0,
    }),
  );

  const dx = PROJECTED_SECTION.widthMm / PROJECTED_SECTION.nx;
  const dy = PROJECTED_SECTION.heightMm / PROJECTED_SECTION.ny;
  const fiberAreaMm2 = dx * dy;
  let concreteNKn = 0;
  let mxKnm = 0;
  let myKnm = 0;

  for (let iy = 0; iy < PROJECTED_SECTION.ny; iy += 1) {
    const yMm = -PROJECTED_SECTION.heightMm / 2 + dy / 2 + iy * dy;
    for (let ix = 0; ix < PROJECTED_SECTION.nx; ix += 1) {
      const xMm = -PROJECTED_SECTION.widthMm / 2 + dx / 2 + ix * dx;
      const pMm = xMm * cosine + yMm * sine;
      const zMm = pMaxMm - pMm;
      const strain = epsTop + slopePerMm * zMm;
      const stressMpa = concreteStressFor(PROJECTED_CONCRETE, strain);
      const forceKn = stressMpa * fiberAreaMm2 / 1_000;
      const bandIndex = Math.min(
        bands - 1,
        Math.max(0, Math.floor(zMm / heightMm * bands)),
      );
      bandStates[bandIndex].areaMm2 += fiberAreaMm2;
      bandStates[bandIndex].concreteForceKn += forceKn;
      concreteNKn += forceKn;
      mxKnm += forceKn * yMm / 1_000;
      myKnm += forceKn * xMm / 1_000;
    }
  }

  let steelNKn = 0;
  const barStates = PROJECTED_REBARS.map((bar): ProjectedBarState => {
    const pMm = bar.xMm * cosine + bar.yMm * sine;
    const zMm = pMaxMm - pMm;
    const strain = epsTop + slopePerMm * zMm;
    const concreteStressMpa = concreteStressFor(PROJECTED_CONCRETE, strain);
    const steelStressMpa = steelStressFor(PROJECTED_STEEL, strain);
    const steelForceKn = steelStressMpa * bar.areaMm2 / 1_000;
    const displacedConcreteKn = concreteStressMpa * bar.areaMm2 / 1_000;
    const effectiveForceKn = steelForceKn - displacedConcreteKn;
    steelNKn += effectiveForceKn;
    mxKnm += effectiveForceKn * bar.yMm / 1_000;
    myKnm += effectiveForceKn * bar.xMm / 1_000;
    return {
      ...bar,
      zMm,
      strain,
      concreteStressMpa,
      steelStressMpa,
      steelForceKn,
      displacedConcreteKn,
      effectiveForceKn,
    };
  });

  return {
    input: {
      thetaDeg,
      epsTopPerMille: input.epsTopPerMille,
      epsBottomPerMille: input.epsBottomPerMille,
      bands,
    },
    thetaRad,
    cosine,
    sine,
    pMaxMm,
    pMinMm,
    heightMm,
    bandWidthMm,
    epsTop,
    epsBottom,
    slopePerMm,
    eps0,
    gxPerMm,
    gyPerMm,
    neutralAxisDepthMm,
    bands: bandStates,
    bars: barStates,
    concreteNKn,
    steelNKn,
    nKn: concreteNKn + steelNKn,
    mxKnm,
    myKnm,
  };
}
