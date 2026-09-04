export type PlaneParameters = {
  eps0PerMille: number;
  gxPerMillePerM: number;
  gyPerMillePerM: number;
};

export type MeshSettings = { nx: number; ny: number };

export type FiberState = {
  xMm: number;
  yMm: number;
  areaMm2: number;
  strain: number;
  concreteStressMpa: number;
};

export type RebarState = {
  id: string;
  xMm: number;
  yMm: number;
  areaMm2: number;
  strain: number;
  steelStressMpa: number;
  effectiveStressMpa: number;
};

export type SectionState = {
  fibers: FiberState[];
  rebars: RebarState[];
  cornerStrains: number[];
  nKn: number;
  mxKnm: number;
  myKnm: number;
  concreteStrainMin: number;
  concreteStrainMax: number;
  steelStrainMin: number;
  steelStrainMax: number;
  neutralAxisCrossesSection: boolean;
  neutralAxisAngleDeg: number | null;
};

export const SECTION = {
  widthMm: 300,
  heightMm: 600,
  nx: 48,
  ny: 72,
  coverMm: 35,
  stirrupDiameterMm: 6.3,
  longitudinalDiameterMm: 16,
} as const;

export const CONCRETE = {
  fckMpa: 30,
  gammaC: 1.4,
  epsC2: 0.002,
  epsCu: 0.0035,
  exponentN: 2,
  etaC: 1,
} as const;

export const STEEL = {
  fykMpa: 500,
  gammaS: 1.15,
  esMpa: 210_000,
} as const;

export const DEFAULT_PLANE: PlaneParameters = {
  eps0PerMille: 1,
  gxPerMillePerM: 2,
  gyPerMillePerM: -3,
};

export const sigmaConcreteMaxMpa =
  0.85 * CONCRETE.etaC * (CONCRETE.fckMpa / CONCRETE.gammaC);
export const steelDesignStrengthMpa = STEEL.fykMpa / STEEL.gammaS;
export const steelYieldStrain = steelDesignStrengthMpa / STEEL.esMpa;

const barAreaMm2 =
  (Math.PI * SECTION.longitudinalDiameterMm ** 2) / 4;
const barAxisCoverMm =
  SECTION.coverMm +
  SECTION.stirrupDiameterMm +
  SECTION.longitudinalDiameterMm / 2;
const barX = SECTION.widthMm / 2 - barAxisCoverMm;
const barY = SECTION.heightMm / 2 - barAxisCoverMm;

const REBARS = [
  [-barX, -barY],
  [0, -barY],
  [barX, -barY],
  [-barX, 0],
  [barX, 0],
  [-barX, barY],
  [0, barY],
  [barX, barY],
] as const;

export function planeCoefficients(parameters: PlaneParameters) {
  return {
    eps0: parameters.eps0PerMille / 1_000,
    gxPerMm: parameters.gxPerMillePerM / 1_000_000,
    gyPerMm: parameters.gyPerMillePerM / 1_000_000,
  };
}

export function strainAt(
  parameters: PlaneParameters,
  xMm: number,
  yMm: number,
) {
  const { eps0, gxPerMm, gyPerMm } = planeCoefficients(parameters);
  return eps0 + gxPerMm * xMm + gyPerMm * yMm;
}

export function concreteStress(strain: number) {
  if (strain <= 0) return 0;
  if (strain >= CONCRETE.epsC2) return sigmaConcreteMaxMpa;

  const ratio = Math.min(Math.max(strain / CONCRETE.epsC2, 0), 1);
  return (
    sigmaConcreteMaxMpa *
    (1 - (1 - ratio) ** CONCRETE.exponentN)
  );
}

export function steelStress(strain: number) {
  return Math.min(
    Math.max(STEEL.esMpa * strain, -steelDesignStrengthMpa),
    steelDesignStrengthMpa,
  );
}

function uniquePoints(points: [number, number][]) {
  return points.filter(
    ([x, y], index) =>
      points.findIndex(
        ([otherX, otherY]) =>
          Math.hypot(x - otherX, y - otherY) < 1e-7,
      ) === index,
  );
}

export function neutralAxisSegment(
  parameters: PlaneParameters,
): [[number, number], [number, number]] | null {
  const { eps0, gxPerMm: gx, gyPerMm: gy } =
    planeCoefficients(parameters);
  const halfWidth = SECTION.widthMm / 2;
  const halfHeight = SECTION.heightMm / 2;
  const points: [number, number][] = [];

  if (Math.abs(gy) > 1e-15) {
    for (const x of [-halfWidth, halfWidth]) {
      const y = -(eps0 + gx * x) / gy;
      if (y >= -halfHeight - 1e-8 && y <= halfHeight + 1e-8) {
        points.push([x, Math.min(Math.max(y, -halfHeight), halfHeight)]);
      }
    }
  }

  if (Math.abs(gx) > 1e-15) {
    for (const y of [-halfHeight, halfHeight]) {
      const x = -(eps0 + gy * y) / gx;
      if (x >= -halfWidth - 1e-8 && x <= halfWidth + 1e-8) {
        points.push([Math.min(Math.max(x, -halfWidth), halfWidth), y]);
      }
    }
  }

  const unique = uniquePoints(points);
  if (unique.length < 2) return null;

  let first = unique[0];
  let second = unique[1];
  let maxDistance = -Infinity;
  for (let i = 0; i < unique.length; i += 1) {
    for (let j = i + 1; j < unique.length; j += 1) {
      const distance = Math.hypot(
        unique[i][0] - unique[j][0],
        unique[i][1] - unique[j][1],
      );
      if (distance > maxDistance) {
        maxDistance = distance;
        first = unique[i];
        second = unique[j];
      }
    }
  }
  return [first, second];
}

export function calculateSectionState(
  parameters: PlaneParameters,
  mesh: MeshSettings = SECTION,
): SectionState {
  if (![mesh.nx, mesh.ny].every(n => Number.isInteger(n) && n > 0 && n <= 200)) {
    throw new Error("A malha deve ter de 1 a 200 divisões inteiras por direção.");
  }
  const dx = SECTION.widthMm / mesh.nx;
  const dy = SECTION.heightMm / mesh.ny;
  const fiberArea = dx * dy;
  const fibers: FiberState[] = [];

  let nN = 0;
  let mxNmm = 0;
  let myNmm = 0;
  let concreteStrainMin = Infinity;
  let concreteStrainMax = -Infinity;

  for (let iy = 0; iy < mesh.ny; iy += 1) {
    const yMm = -SECTION.heightMm / 2 + dy / 2 + iy * dy;
    for (let ix = 0; ix < mesh.nx; ix += 1) {
      const xMm = -SECTION.widthMm / 2 + dx / 2 + ix * dx;
      const strain = strainAt(parameters, xMm, yMm);
      const concreteStressMpa = concreteStress(strain);
      const forceN = concreteStressMpa * fiberArea;

      nN += forceN;
      mxNmm += forceN * yMm;
      myNmm += forceN * xMm;
      concreteStrainMin = Math.min(concreteStrainMin, strain);
      concreteStrainMax = Math.max(concreteStrainMax, strain);
      fibers.push({
        xMm,
        yMm,
        areaMm2: fiberArea,
        strain,
        concreteStressMpa,
      });
    }
  }

  let steelStrainMin = Infinity;
  let steelStrainMax = -Infinity;
  const rebars = REBARS.map(([xMm, yMm], index): RebarState => {
    const strain = strainAt(parameters, xMm, yMm);
    const steelStressMpa = steelStress(strain);
    const effectiveStressMpa = steelStressMpa - concreteStress(strain);
    const forceN = effectiveStressMpa * barAreaMm2;

    nN += forceN;
    mxNmm += forceN * yMm;
    myNmm += forceN * xMm;
    steelStrainMin = Math.min(steelStrainMin, strain);
    steelStrainMax = Math.max(steelStrainMax, strain);

    return {
      id: `B${index + 1}`,
      xMm,
      yMm,
      areaMm2: barAreaMm2,
      strain,
      steelStressMpa,
      effectiveStressMpa,
    };
  });

  const corners: [number, number][] = [
    [-SECTION.widthMm / 2, -SECTION.heightMm / 2],
    [SECTION.widthMm / 2, -SECTION.heightMm / 2],
    [SECTION.widthMm / 2, SECTION.heightMm / 2],
    [-SECTION.widthMm / 2, SECTION.heightMm / 2],
  ];
  const cornerStrains = corners.map(([xMm, yMm]) =>
    strainAt(parameters, xMm, yMm),
  );
  const neutralAxis = neutralAxisSegment(parameters);
  const { gxPerMm, gyPerMm } = planeCoefficients(parameters);
  const gradientMagnitude = Math.hypot(gxPerMm, gyPerMm);
  const neutralAxisAngleDeg =
    gradientMagnitude < 1e-15
      ? null
      : (((Math.atan2(-gxPerMm, gyPerMm) * 180) / Math.PI) % 180 + 180) %
        180;

  return {
    fibers,
    rebars,
    cornerStrains,
    nKn: nN / 1_000,
    mxKnm: mxNmm / 1_000_000,
    myKnm: myNmm / 1_000_000,
    concreteStrainMin,
    concreteStrainMax,
    steelStrainMin,
    steelStrainMax,
    neutralAxisCrossesSection: neutralAxis !== null,
    neutralAxisAngleDeg,
  };
}

export function classifyStrainState(state: SectionState) {
  const min = Math.min(state.concreteStrainMin, state.steelStrainMin);
  const max = Math.max(state.concreteStrainMax, state.steelStrainMax);
  if (Math.max(Math.abs(min), Math.abs(max)) < 1e-12) {
    return "Seção sem deformação";
  }
  if (min > 0) return "Seção inteiramente comprimida";
  if (max < 0) return "Seção inteiramente tracionada";
  return "Flexão composta — a linha neutra cruza a seção";
}
