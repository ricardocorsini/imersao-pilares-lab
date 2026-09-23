import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  INTERACTION_AXIAL_CAPACITY_KN,
  buildInteractionCurveConstruction,
  convexHullInteractionPoints,
  orderInteractionPointsPolar,
  type InteractionConstructionPoint,
} from "../src/core/interactionCurveConstruction.ts";
import { sectionResponseAtLimitState } from "../src/core/normalForceRootSearch.ts";

function close(actual: number, expected: number, tolerance: number, label: string) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: esperado ${expected}; obtido ${actual}; diferença ${actual - expected}`,
  );
}

close(INTERACTION_AXIAL_CAPACITY_KN, 3924.8419173, 1e-6, "capacidade axial");

// θ e θ+180° trocam a borda comprimida, mantendo N e invertendo M na seção simétrica.
for (const t of [0, 0.5, 1, 1.5, 2, 2.5, 3]) {
  const first = sectionResponseAtLimitState(t, 35).state;
  const opposite = sectionResponseAtLimitState(t, 215).state;
  close(first.nKn, opposite.nKn, 1e-6, `N oposto em t=${t}`);
  close(first.mxKnm, -opposite.mxKnm, 1e-8, `Mx oposto em t=${t}`);
  close(first.myKnm, -opposite.myKnm, 1e-8, `My oposto em t=${t}`);
}

const construction = buildInteractionCurveConstruction({
  nSdKn: 1_800,
  angleCount: 36,
  rootMethod: "brent",
});
assert.equal(construction.diagnostics.length, 36);
assert.equal(construction.mechanicalCandidates.length, 36);
assert.equal(construction.selectedCandidates.length, 36);
assert.equal(construction.polarOrderedPoints.length, 36);
assert.equal(construction.convexHullPoints.length, 36);
assert.equal(construction.geometryKind, "polygon");
assert.equal(construction.missingAnglesDeg.length, 0);
assert.equal(construction.multipleRootAnglesDeg.length, 0);
assert.equal(construction.hullOmittedCount, 0);
assert.ok(construction.totalFunctionEvaluations > 36);
assert.ok(construction.maxAxialResidualKn <= 0.01);

const first = construction.diagnostics[0].candidates[0];
assert.equal(first.thetaDeg, 0);
close(first.t, 1.5162312186, 1e-8, "t em θ=0°");
assert.equal(first.domainId, "D4");
assert.equal(first.rootMethod, "brent");
assert.equal(first.rootsAtAngle, 1);
close(first.mxKnm, 0, 1e-8, "Mx em θ=0°");
close(first.myKnm, 160.2074511, 1e-6, "My em θ=0°");
const opposite = construction.diagnostics[18].candidates[0];
close(opposite.mxKnm, -first.mxKnm, 1e-8, "Mx em θ=180°");
close(opposite.myKnm, -first.myKnm, 1e-8, "My em θ=180°");

// Ordenar e envolver não pode alterar nenhuma coordenada mecânica.
const selectedIds = new Set(construction.selectedCandidates.map((point) => point.id));
assert.deepEqual(
  new Set(construction.polarOrderedPoints.map((point) => point.id)),
  selectedIds,
);
assert.ok(construction.convexHullPoints.every((point) => selectedIds.has(point.id)));
for (const point of construction.polarOrderedPoints) {
  const source = construction.selectedCandidates.find((candidate) => candidate.id === point.id)!;
  assert.equal(point.mxKnm, source.mxKnm);
  assert.equal(point.myKnm, source.myKnm);
}

// Conferência contra uma curva de 120 direções previamente gerada pelo FlexoPy.
const reference = JSON.parse(
  readFileSync(new URL("../src/data/interaction-surface.json", import.meta.url), "utf8"),
) as {
  vertices: [number, number, number][];
  rings: number[][];
};
const ring = reference.rings[20];
const ringNSdKn = reference.vertices[ring[0]][2];
const fineConstruction = buildInteractionCurveConstruction({
  nSdKn: ringNSdKn,
  angleCount: 120,
  rootMethod: "brent",
});
for (const angleIndex of [0, 17, 42, 73, 101]) {
  const diagnostic = fineConstruction.diagnostics[angleIndex];
  assert.notEqual(diagnostic.selectedIndex, null);
  const actual = diagnostic.candidates[diagnostic.selectedIndex!];
  const expected = reference.vertices[ring[angleIndex]];
  close(actual.mxKnm, expected[0], 0.001, `Mx FlexoPy em θ=${actual.thetaDeg}°`);
  close(actual.myKnm, expected[1], 0.001, `My FlexoPy em θ=${actual.thetaDeg}°`);
  close(actual.nRdKn, expected[2], 0.011, `N FlexoPy em θ=${actual.thetaDeg}°`);
}

// Exemplo geométrico controlado: o centro sobrevive à ordenação, mas não ao fecho.
const pointAt = (id: string, mxKnm: number, myKnm: number): InteractionConstructionPoint =>
  Object.freeze({
    ...first,
    id,
    mxKnm,
    myKnm,
    momentRadiusKnm: Math.hypot(mxKnm, myKnm),
  });
const synthetic = [
  pointAt("a", -1, -1),
  pointAt("b", 1, -1),
  pointAt("c", 1, 1),
  pointAt("d", -1, 1),
  pointAt("center", 0, 0),
];
assert.equal(orderInteractionPointsPolar(synthetic).length, 5);
assert.equal(convexHullInteractionPoints(synthetic).length, 4);
assert.ok(!convexHullInteractionPoints(synthetic).some((point) => point.id === "center"));

const uniform = buildInteractionCurveConstruction({
  nSdKn: INTERACTION_AXIAL_CAPACITY_KN,
  angleCount: 36,
});
assert.equal(uniform.geometryKind, "point");
assert.equal(uniform.mechanicalCandidates.length, 1);
assert.equal(uniform.mechanicalCandidates[0].t, 3);
assert.equal(uniform.mechanicalCandidates[0].rootMethod, "degenerate_endpoint");

assert.throws(
  () => buildInteractionCurveConstruction({ nSdKn: -1, angleCount: 36 }),
  /NSd ≥ 0/,
);
assert.throws(
  () => buildInteractionCurveConstruction({
    nSdKn: INTERACTION_AXIAL_CAPACITY_KN + 1,
    angleCount: 36,
  }),
  /excede/,
);
assert.throws(
  () => buildInteractionCurveConstruction({ nSdKn: 1_800, angleCount: 8 }),
  /angleCount/,
);

console.log(
  "Construção da curva: 360°, raízes, pontos externos, ordem polar, fecho e referência FlexoPy verificados.",
);
