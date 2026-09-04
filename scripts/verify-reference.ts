import assert from "node:assert/strict";
import {
  DEFAULT_PLANE,
  calculateSectionState,
  classifyStrainState,
  concreteStress,
  sigmaConcreteMaxMpa,
  steelDesignStrengthMpa,
  steelStress,
} from "../src/core/sectionModel.ts";
import { strainToVisualHeight } from "../src/core/visualEncoding.ts";
import {
  concreteStressColor,
  steelStressColor,
  strainColor,
} from "../src/core/colors.ts";

function closeTo(actual: number, expected: number, tolerance: number, label: string) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: esperado ${expected}, obtido ${actual}`,
  );
}

const reference = calculateSectionState(DEFAULT_PLANE);

// Valores produzidos pelo examples/01_estado_secao.py da versão anexada.
closeTo(reference.nKn, 2536.462, 0.001, "N");
closeTo(reference.mxKnm, -192.061, 0.001, "Mx");
closeTo(reference.myKnm, 28.99, 0.001, "My");
closeTo(reference.concreteStrainMin, -0.000181, 0.000001, "eps_c,min");
closeTo(reference.concreteStrainMax, 0.002181, 0.000001, "eps_c,max");

const uniform = calculateSectionState({
  eps0PerMille: 2,
  gxPerMillePerM: 0,
  gyPerMillePerM: 0,
});
closeTo(uniform.mxKnm, 0, 1e-10, "Mx uniforme");
closeTo(uniform.myKnm, 0, 1e-10, "My uniforme");
assert.equal(concreteStress(-0.001), 0, "concreto tracionado deve ser ignorado");
assert.equal(
  steelStress(0.1),
  steelDesignStrengthMpa,
  "aço deve ser limitado em +fyd",
);
assert.equal(
  steelStress(-0.1),
  -steelDesignStrengthMpa,
  "aço deve ser limitado em -fyd",
);

const zero = calculateSectionState({
  eps0PerMille: 0,
  gxPerMillePerM: 0,
  gyPerMillePerM: 0,
});
assert.equal(classifyStrainState(zero), "Seção sem deformação");

assert.ok(
  strainToVisualHeight(0.002) < 0,
  "compressão positiva deve ser desenhada abaixo da seção",
);
assert.ok(
  strainToVisualHeight(-0.002) > 0,
  "tração negativa deve ser desenhada acima da seção",
);
assert.equal(
  strainToVisualHeight(0),
  0,
  "deformação nula deve permanecer no plano da seção",
);

assert.equal(
  concreteStressColor(0, sigmaConcreteMaxMpa, -0.001),
  "#071a34",
  "concreto tracionado deve ocupar o extremo sem tensão da escala",
);
assert.equal(
  concreteStressColor(sigmaConcreteMaxMpa, sigmaConcreteMaxMpa, 0.0035),
  "#ff174d",
  "compressão máxima do concreto deve ocupar o extremo quente da escala",
);
assert.equal(strainColor(-0.01), "#5b3df5", "tração de referência na escala");
assert.equal(strainColor(0.0035), "#ff174d", "compressão de referência na escala");
assert.equal(
  steelStressColor(steelDesignStrengthMpa, steelDesignStrengthMpa),
  "#ff174d",
  "aço em +fyd deve ocupar o extremo quente da escala",
);

console.log("Referência mecânica, sinais e escalas visuais conferidos com sucesso.");
