import assert from "node:assert/strict";
import {
  ROOT_FORCE_TOLERANCE_KN,
  analyzeNormalForceRoots,
  sectionNormalResistanceKn,
} from "../src/core/normalForceRootSearch.ts";

const close = (actual: number, expected: number, tolerance = 1e-9) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `esperado ${expected}; obtido ${actual}; diferença ${actual - expected}`,
  );
};

for (const thetaDeg of [0, 35, 45, 90, 135]) {
  const forces = Array.from(
    { length: 25 },
    (_, index) => sectionNormalResistanceKn(3 * index / 24, thetaDeg),
  );
  assert.ok(forces[0] < 0, "o início deve representar tração resultante");
  assert.ok(forces.at(-1)! > 3_900, "o fim deve representar compressão uniforme");
  for (let index = 1; index < forces.length; index += 1) {
    assert.ok(
      forces[index] >= forces[index - 1] - 1e-8,
      `NRd(t) deixou de ser crescente em θ=${thetaDeg}°`,
    );
  }
}

const physicalBisection = analyzeNormalForceRoots({
  scenarioId: "section",
  thetaDeg: 35,
  nSdKn: 1_800,
  method: "bisection",
});
assert.equal(physicalBisection.scenario.isArtificial, false);
assert.equal(physicalBisection.candidates.length, 1);
assert.equal(physicalBisection.candidates[0].kind, "sign_change");
assert.equal(physicalBisection.solutions[0].methodUsed, "bisection");
assert.ok(physicalBisection.solutions[0].converged);
assert.ok(
  Math.abs(physicalBisection.solutions[0].residualKn) <= ROOT_FORCE_TOLERANCE_KN,
);
for (const step of physicalBisection.solutions[0].trace) {
  close(step.intervalAfter, step.intervalBefore / 2, 1e-12);
  assert.ok(step.nextAT >= step.aT && step.nextBT <= step.bT);
}

const physicalBrent = analyzeNormalForceRoots({
  scenarioId: "section",
  thetaDeg: 35,
  nSdKn: 1_800,
  method: "brent",
});
assert.equal(physicalBrent.solutions.length, 1);
assert.equal(physicalBrent.solutions[0].methodUsed, "brent");
assert.ok(physicalBrent.solutions[0].converged);
assert.ok(
  Math.abs(physicalBrent.solutions[0].residualKn) <= ROOT_FORCE_TOLERANCE_KN,
);
close(
  physicalBrent.solutions[0].rootT,
  physicalBisection.solutions[0].rootT,
  2e-5,
);
assert.ok(
  physicalBrent.solutions[0].refinementEvaluations <
    physicalBisection.solutions[0].refinementEvaluations,
);

const exactTarget = sectionNormalResistanceKn(1.5, 35);
const directSample = analyzeNormalForceRoots({
  scenarioId: "section",
  thetaDeg: 35,
  nSdKn: exactTarget,
  method: "brent",
});
assert.equal(directSample.candidates.length, 1);
assert.equal(directSample.candidates[0].kind, "sample");
assert.equal(directSample.solutions[0].methodUsed, "sample");
close(directSample.solutions[0].rootT, 1.5);
close(directSample.solutions[0].residualKn, 0);
assert.equal(directSample.solutions[0].refinementEvaluations, 0);

const roundedDirectSample = analyzeNormalForceRoots({
  scenarioId: "section",
  thetaDeg: 35,
  nSdKn: Math.round(exactTarget * 100) / 100,
  method: "brent",
});
assert.equal(roundedDirectSample.candidates[0].kind, "sample");
assert.ok(Math.abs(roundedDirectSample.solutions[0].residualKn) <= ROOT_FORCE_TOLERANCE_KN);

const twoRoots = analyzeNormalForceRoots({
  scenarioId: "two_roots",
  thetaDeg: 35,
  nSdKn: 0,
  method: "brent",
});
assert.equal(twoRoots.scenario.isArtificial, true);
assert.equal(twoRoots.nSdKn, 2_200);
assert.equal(twoRoots.signChangeCount, 2);
assert.equal(twoRoots.solutions.length, 2);
const expectedOffset = Math.sqrt(850 / 950);
close(twoRoots.solutions[0].rootT, 1.5 - expectedOffset, 2e-5);
close(twoRoots.solutions[1].rootT, 1.5 + expectedOffset, 2e-5);
for (const solution of twoRoots.solutions) {
  assert.ok(solution.converged);
  assert.ok(Math.abs(solution.residualKn) <= ROOT_FORCE_TOLERANCE_KN);
}

const tangent = analyzeNormalForceRoots({
  scenarioId: "tangent",
  thetaDeg: 35,
  nSdKn: 0,
  method: "brent",
});
assert.equal(tangent.signChangeCount, 0);
assert.equal(tangent.directSampleCount, 0);
assert.equal(tangent.tangentCandidateCount, 1);
assert.equal(tangent.tangentProbeEvaluations, 1);
assert.ok(tangent.samples.every((sample) => sample.residualKn > 0));
assert.ok(tangent.candidates[0].faKn * tangent.candidates[0].fbKn > 0);
assert.equal(tangent.solutions[0].methodUsed, "tangent_minimization");
assert.ok(tangent.solutions[0].converged);
close(tangent.solutions[0].rootT, 1.37, 8e-4);
assert.ok(Math.abs(tangent.solutions[0].residualKn) <= ROOT_FORCE_TOLERANCE_KN);
assert.ok(
  tangent.solutions[0].trace.every(
    (step, index, trace) =>
      step.intervalAfter < step.intervalBefore &&
      (index === 0 || step.intervalBefore <= trace[index - 1].intervalAfter + 1e-12),
  ),
);

assert.throws(
  () => analyzeNormalForceRoots({
    scenarioId: "section",
    thetaDeg: 0,
    nSdKn: 1_000,
    sampleCount: 4,
  }),
  /sampleCount/,
);
assert.throws(() => sectionNormalResistanceKn(-0.1, 0), /entre 0 e 3/);

console.log(
  "Busca de raízes: seção real, amostra direta, bisseção, Brent, duas raízes e tangência verificados.",
);
