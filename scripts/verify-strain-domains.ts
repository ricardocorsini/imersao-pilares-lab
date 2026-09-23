import assert from "node:assert/strict";
import {
  STRAIN_DOMAIN_DEFAULT_GEOMETRY,
  STRAIN_DOMAIN_DEFINITIONS,
  computeStrainDomainState,
  domainBoundaryLabel,
  domainProgressAtMiddle,
  strainAtDomainDepth,
} from "../src/core/strainDomainDiagram.ts";

const close = (actual: number, expected: number, tolerance = 1e-10) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `esperado ${expected}; obtido ${actual}; diferença ${actual - expected}`,
  );
};

const stateAt = (progress: number, fckMpa = 30) =>
  computeStrainDomainState({
    progress,
    fckMpa,
    ...STRAIN_DOMAIN_DEFAULT_GEOMETRY,
  });

const [uniformTension, d12, d23, d34, d44a, d45, uniformCompression] =
  Array.from({ length: 7 }, (_, index) => stateAt(index));

assert.equal(STRAIN_DOMAIN_DEFINITIONS.length, 6);
assert.deepEqual(
  STRAIN_DOMAIN_DEFINITIONS.map((domain) => domain.id),
  ["D1", "D2", "D3", "D4", "D4A", "D5"],
);
assert.deepEqual(
  STRAIN_DOMAIN_DEFINITIONS.map((domain) => domain.pivot),
  ["A", "A", "B", "B", "B", "C"],
);

// Tração uniforme e passagem pelo pivô A.
assert.equal(uniformTension.positionKind, "uniform_tension");
close(uniformTension.epsTop, -0.01);
close(uniformTension.epsAtD, -0.01);
close(uniformTension.epsBottom, -0.01);
close(uniformTension.slopePerMm, 0);
assert.equal(uniformTension.neutralAxisDepthMm, Number.NEGATIVE_INFINITY);

assert.equal(d12.positionLabel, "D1–D2 · x = 0");
close(d12.epsTop, 0);
close(d12.epsAtD, -0.01);
close(d12.neutralAxisDepthMm, 0);

// D2–D3: A e B na mesma reta; x23 decorre da compatibilidade.
assert.deepEqual(d23.activePivots, ["A", "B"]);
close(d23.epsTop, d23.concrete.epsCu);
close(d23.epsAtD, -d23.epsSu);
close(d23.neutralAxisDepthMm, d23.x23Mm);
close(
  d23.x23Mm,
  d23.concrete.epsCu * d23.input.effectiveDepthMm /
    (d23.concrete.epsCu + d23.epsSu),
);
close(d23.x23Ratio, 3.5 / 13.5);

// D3–D4: aço em d exatamente no escoamento de cálculo.
close(d34.epsTop, d34.concrete.epsCu);
close(d34.epsAtD, -d34.steel.epsYd);
close(d34.neutralAxisDepthMm, d34.xLimitMm);
close(
  d34.xLimitMm,
  d34.concrete.epsCu * d34.input.effectiveDepthMm /
    (d34.concrete.epsCu + d34.steel.epsYd),
);

// D4–D4a e D4a–D5 são, respectivamente, x=d e x=h.
close(d44a.epsAtD, 0);
close(d44a.neutralAxisDepthMm, d44a.input.effectiveDepthMm);
close(d45.epsBottom, 0);
close(d45.neutralAxisDepthMm, d45.input.heightMm);
assert.deepEqual(d45.activePivots, ["B", "C"]);
close(strainAtDomainDepth(d45, d45.pointCDepthMm), d45.concrete.epsC2);

// Compressão uniforme encerra o giro em C.
assert.equal(uniformCompression.positionKind, "uniform_compression");
close(uniformCompression.epsTop, uniformCompression.concrete.epsC2);
close(uniformCompression.epsAtD, uniformCompression.concrete.epsC2);
close(uniformCompression.epsBottom, uniformCompression.concrete.epsC2);
close(uniformCompression.slopePerMm, 0);
assert.equal(uniformCompression.neutralAxisDepthMm, Number.POSITIVE_INFINITY);

// Continuidade das retas em todas as fronteiras internas.
for (const boundary of [1, 2, 3, 4, 5]) {
  const before = stateAt(boundary - 1e-8);
  const after = stateAt(boundary + 1e-8);
  close(before.epsTop, after.epsTop, 2e-9);
  close(before.epsBottom, after.epsBottom, 2e-9);
  close(before.epsAtD, after.epsAtD, 2e-9);
}

// Concretos de alta resistência alteram εc2, εcu, x23, xlim e a posição de C.
const c60 = stateAt(5.5, 60);
assert.ok(c60.concrete.epsCu < d45.concrete.epsCu);
assert.ok(c60.concrete.epsC2 > d45.concrete.epsC2);
assert.ok(c60.x23Ratio < d45.x23Ratio);
assert.ok(c60.xLimitRatio < d45.xLimitRatio);
close(strainAtDomainDepth(c60, c60.pointCDepthMm), c60.concrete.epsC2);
const c90 = stateAt(5.5, 90);
close(c90.concrete.epsC2, c90.concrete.epsCu, 1e-12);
close(c90.pointCDepthMm, 0, 1e-9);

assert.equal(domainProgressAtMiddle("D1"), 0.5);
assert.equal(domainProgressAtMiddle("D4A"), 4.5);
assert.equal(domainBoundaryLabel(3), "D3–D4 · x = xlim");
assert.throws(() => domainProgressAtMiddle("D7" as "D1"), /desconhecido/);
assert.throws(() => domainBoundaryLabel(7), /entre 0 e 6/);
assert.throws(() => stateAt(-0.01), /entre 0 e 6/);
assert.throws(() => stateAt(6.01), /entre 0 e 6/);
assert.throws(
  () => computeStrainDomainState({
    progress: 2,
    fckMpa: 30,
    heightMm: 600,
    effectiveDepthMm: 610,
    compressionSteelDepthMm: 40,
  }),
  /0 < d ≤ h/,
);

console.log(
  "Domínios NBR: D1 a D5, fronteiras, pivôs, continuidade e concretos C30–C90 verificados.",
);
