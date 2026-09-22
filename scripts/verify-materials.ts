import assert from "node:assert/strict";
import {
  STEEL_ULTIMATE_STRAIN_REFERENCE,
  concreteStressFor,
  createConcreteMaterial,
  createSteelMaterial,
  steelStressFor,
} from "../src/core/materialModel.ts";

const close = (actual: number, expected: number, tolerance = 1e-12) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `esperado ${expected}; obtido ${actual}`,
  );
};

const c30 = createConcreteMaterial(30, 1.4);
close(c30.etaC, 1);
close(c30.exponentN, 2);
close(c30.epsC2, 0.002);
close(c30.epsCu, 0.0035);
close(concreteStressFor(c30, -0.001), 0);
close(concreteStressFor(c30, c30.epsC2), c30.sigmaPlateauMpa);
close(concreteStressFor(c30, c30.epsCu + 0.001), c30.sigmaPlateauMpa);

const c90 = createConcreteMaterial(90, 1.4);
close(c90.epsC2, 0.0026, 1e-15);
close(c90.epsCu, 0.0026, 1e-15);
assert.ok(c90.epsC2 <= c90.epsCu);

for (const fck of [20, 30, 40, 50, 60, 70, 80, 90]) {
  const material = createConcreteMaterial(fck, 1.4);
  let previous = 0;
  for (let index = 0; index <= 100; index += 1) {
    const strain = (material.epsC2 * index) / 100;
    const stress = concreteStressFor(material, strain);
    assert.ok(stress + 1e-12 >= previous, `curva não monotônica em C${fck}`);
    previous = stress;
  }
}

const ca50 = createSteelMaterial(500, 1.15, 210_000);
close(ca50.fydMpa, 500 / 1.15);
close(ca50.epsYd, ca50.fydMpa / 210_000);
close(steelStressFor(ca50, ca50.epsYd), ca50.fydMpa);
close(steelStressFor(ca50, -ca50.epsYd), -ca50.fydMpa);
close(steelStressFor(ca50, STEEL_ULTIMATE_STRAIN_REFERENCE * 2), ca50.fydMpa);

console.log("Materiais: parâmetros, limites e leis constitutivas verificados.");
