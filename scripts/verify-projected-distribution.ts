import assert from "node:assert/strict";
import { calculateSectionState } from "../src/core/sectionModel.ts";
import {
  PROJECTED_SECTION,
  computeProjectedDistribution,
  strainAtProjectedDepth,
} from "../src/core/projectedDistribution.ts";

const close = (actual: number, expected: number, tolerance = 1e-9) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `esperado ${expected}; obtido ${actual}; diferença ${actual - expected}`,
  );
};

const horizontal = computeProjectedDistribution({
  thetaDeg: 0,
  epsTopPerMille: 3.5,
  epsBottomPerMille: -10,
});
close(horizontal.heightMm, PROJECTED_SECTION.widthMm);
close(strainAtProjectedDepth(horizontal, 0), 0.0035);
close(strainAtProjectedDepth(horizontal, horizontal.heightMm), -0.01);

const vertical = computeProjectedDistribution({
  thetaDeg: 90,
  epsTopPerMille: 3.5,
  epsBottomPerMille: -10,
});
close(vertical.heightMm, PROJECTED_SECTION.heightMm);

const uniform = computeProjectedDistribution({
  thetaDeg: 37,
  epsTopPerMille: 2,
  epsBottomPerMille: 2,
});
const uniformReference = calculateSectionState({
  eps0PerMille: 2,
  gxPerMillePerM: 0,
  gyPerMillePerM: 0,
});
close(uniform.nKn, uniformReference.nKn, 1e-9);
close(uniform.mxKnm, uniformReference.mxKnm, 1e-10);
close(uniform.myKnm, uniformReference.myKnm, 1e-10);
assert.equal(uniform.neutralAxisDepthMm, null);

const oblique = computeProjectedDistribution({
  thetaDeg: 35,
  epsTopPerMille: 3.5,
  epsBottomPerMille: -6,
  bands: 60,
});
const obliqueReference = calculateSectionState({
  eps0PerMille: oblique.eps0 * 1_000,
  gxPerMillePerM: oblique.gxPerMm * 1_000_000,
  gyPerMillePerM: oblique.gyPerMm * 1_000_000,
});
close(oblique.nKn, obliqueReference.nKn, 1e-9);
close(oblique.mxKnm, obliqueReference.mxKnm, 1e-9);
close(oblique.myKnm, obliqueReference.myKnm, 1e-9);
close(
  oblique.bands.reduce((sum, band) => sum + band.areaMm2, 0),
  PROJECTED_SECTION.widthMm * PROJECTED_SECTION.heightMm,
  1e-8,
);
close(
  oblique.bands.reduce((sum, band) => sum + band.concreteForceKn, 0),
  oblique.concreteNKn,
  1e-9,
);
assert.ok(oblique.neutralAxisDepthMm !== null);
assert.equal(oblique.bars.length, 8);

assert.throws(
  () => computeProjectedDistribution({
    thetaDeg: 0,
    epsTopPerMille: -2,
    epsBottomPerMille: 1,
  }),
  /não pode exceder/,
);

console.log("Distribuições projetadas: geometria, compatibilidade, faixas e resultantes verificadas.");
