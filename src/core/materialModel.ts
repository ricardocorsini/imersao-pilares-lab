export type ConcreteMaterial = Readonly<{
  fckMpa: number;
  gammaC: number;
  fcdMpa: number;
  etaC: number;
  exponentN: number;
  epsC2: number;
  epsCu: number;
  sigmaPlateauMpa: number;
}>;

export type SteelMaterial = Readonly<{
  fykMpa: number;
  gammaS: number;
  esMpa: number;
  fydMpa: number;
  epsYd: number;
}>;

export const STEEL_ULTIMATE_STRAIN_REFERENCE = 0.01;

function requireFinitePositive(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} deve ser finito e positivo.`);
  }
}

export function createConcreteMaterial(
  fckMpa: number,
  gammaC = 1.4,
): ConcreteMaterial {
  requireFinitePositive(fckMpa, "fck");
  requireFinitePositive(gammaC, "gammaC");
  if (fckMpa < 20 || fckMpa > 90) {
    throw new Error("O modelo do concreto requer 20 ≤ fck ≤ 90 MPa.");
  }

  const etaC = fckMpa <= 40 ? 1 : (40 / fckMpa) ** (1 / 3);
  const exponentN =
    fckMpa <= 50
      ? 2
      : 1.4 + 23.4 * ((90 - fckMpa) / 100) ** 4;
  const epsCu =
    fckMpa <= 50
      ? 0.0035
      : 0.0026 + 0.035 * ((90 - fckMpa) / 100) ** 4;

  let epsC2 =
    fckMpa <= 50
      ? 0.002
      : 0.002 + 0.000085 * (fckMpa - 50) ** 0.53;

  if (epsC2 > epsCu) {
    if (epsC2 - epsCu > 1e-6) {
      throw new Error("epsC2 excedeu epsCu além da tolerância esperada.");
    }
    epsC2 = epsCu;
  }

  const fcdMpa = fckMpa / gammaC;
  return Object.freeze({
    fckMpa,
    gammaC,
    fcdMpa,
    etaC,
    exponentN,
    epsC2,
    epsCu,
    sigmaPlateauMpa: 0.85 * etaC * fcdMpa,
  });
}

export function concreteStressFor(
  material: ConcreteMaterial,
  strain: number,
) {
  if (!Number.isFinite(strain)) {
    throw new Error("A deformação do concreto deve ser finita.");
  }
  if (strain <= 0) return 0;
  if (strain >= material.epsC2) return material.sigmaPlateauMpa;

  const ratio = Math.min(Math.max(strain / material.epsC2, 0), 1);
  return (
    material.sigmaPlateauMpa *
    (1 - (1 - ratio) ** material.exponentN)
  );
}

export function createSteelMaterial(
  fykMpa = 500,
  gammaS = 1.15,
  esMpa = 210_000,
): SteelMaterial {
  requireFinitePositive(fykMpa, "fyk");
  requireFinitePositive(gammaS, "gammaS");
  requireFinitePositive(esMpa, "Es");
  const fydMpa = fykMpa / gammaS;
  return Object.freeze({
    fykMpa,
    gammaS,
    esMpa,
    fydMpa,
    epsYd: fydMpa / esMpa,
  });
}

export function steelStressFor(material: SteelMaterial, strain: number) {
  if (!Number.isFinite(strain)) {
    throw new Error("A deformação do aço deve ser finita.");
  }
  return Math.min(
    Math.max(material.esMpa * strain, -material.fydMpa),
    material.fydMpa,
  );
}
