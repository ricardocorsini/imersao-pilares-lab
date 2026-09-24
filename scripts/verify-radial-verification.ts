import assert from "node:assert/strict";
import { buildInteractionCurveConstruction } from "../src/core/interactionCurveConstruction.ts";
import {
  createRadialScenarios,
  radialIntersections,
  verifyRadialDemand,
  type RadialPoint,
} from "../src/core/radialVerification.ts";

function close(actual: number, expected: number, tolerance: number, label: string) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: esperado ${expected}; obtido ${actual}; diferença ${actual - expected}`,
  );
}

const square: readonly RadialPoint[] = [
  { xKnm: -100, yKnm: -100 },
  { xKnm: 100, yKnm: -100 },
  { xKnm: 100, yKnm: 100 },
  { xKnm: -100, yKnm: 100 },
];

const internal = verifyRadialDemand(square, { xKnm: 30, yKnm: 40 });
assert.equal(internal.applicable, true);
assert.equal(internal.position, "inside");
assert.equal(internal.intersections.length, 1);
close(internal.demandRadiusKnm, 50, 1e-12, "módulo da demanda interna");
close(internal.radialCapacityKnm!, 125, 1e-12, "capacidade radial interna");
close(internal.utilization!, 0.4, 1e-12, "u_rad interno");

const boundary = verifyRadialDemand(square, { xKnm: 75, yKnm: 100 });
assert.equal(boundary.applicable, true);
assert.equal(boundary.position, "boundary");
close(boundary.utilization!, 1, 1e-12, "u_rad na fronteira");

const external = verifyRadialDemand(square, { xKnm: 150, yKnm: 0 });
assert.equal(external.applicable, true);
assert.equal(external.position, "outside");
close(external.radialCapacityKnm!, 100, 1e-12, "capacidade radial externa");
close(external.utilization!, 1.5, 1e-12, "u_rad externo");

const zero = verifyRadialDemand(square, { xKnm: 0, yKnm: 0 });
assert.equal(zero.applicable, true);
assert.equal(zero.inside, true);
assert.equal(zero.directionDeg, null);
assert.equal(zero.radialCapacityKnm, null);
assert.equal(zero.utilization, 0);

const point = verifyRadialDemand([{ xKnm: 0, yKnm: 0 }], { xKnm: 0, yKnm: 0 });
assert.equal(point.geometryKind, "point");
assert.equal(point.inside, true);
assert.equal(point.applicable, false);
assert.equal(point.utilization, 0);

const segment = verifyRadialDemand(
  [{ xKnm: -10, yKnm: -4 }, { xKnm: 10, yKnm: 4 }],
  { xKnm: 5, yKnm: 2 },
);
assert.equal(segment.geometryKind, "segment");
assert.equal(segment.inside, true);
assert.equal(segment.applicable, false);
assert.equal(segment.utilization, null);

const shifted = verifyRadialDemand([
  { xKnm: 40, yKnm: -50 },
  { xKnm: 160, yKnm: -50 },
  { xKnm: 160, yKnm: 50 },
  { xKnm: 40, yKnm: 50 },
], { xKnm: 100, yKnm: 10 });
assert.equal(shifted.inside, true);
assert.equal(shifted.originInside, false);
assert.equal(shifted.applicable, false);
assert.equal(shifted.utilization, null);

const nonStarShaped: readonly RadialPoint[] = [
  { xKnm: -150, yKnm: -120 },
  { xKnm: 220, yKnm: -120 },
  { xKnm: 220, yKnm: 120 },
  { xKnm: 100, yKnm: 120 },
  { xKnm: 100, yKnm: -30 },
  { xKnm: 40, yKnm: -30 },
  { xKnm: 40, yKnm: 120 },
  { xKnm: -150, yKnm: 120 },
];
const multiple = verifyRadialDemand(nonStarShaped, { xKnm: 160, yKnm: 0 });
assert.equal(multiple.originInside, true);
assert.equal(multiple.inside, true);
assert.equal(multiple.intersections.length, 3);
assert.deepEqual(multiple.intersections.map((intersection) => intersection.radiusKnm), [40, 100, 220]);
assert.equal(multiple.applicable, false);
assert.equal(multiple.utilization, null);

// Um vértice atingido por duas arestas deve aparecer como uma única interseção.
const vertexHit = radialIntersections({ xKnm: 1, yKnm: 1 }, square);
assert.equal(vertexHit.intersections.length, 1);
close(vertexHit.intersections[0].radiusKnm, Math.sqrt(20_000), 1e-10, "vértice deduplicado");
assert.equal(vertexHit.intersections[0].edgeIndices.length, 2);

// A curva efetivamente calculada para a seção também satisfaz as hipóteses.
const construction = buildInteractionCurveConstruction({
  nSdKn: 1_800,
  angleCount: 72,
  rootMethod: "brent",
});
const mechanicalBoundary = construction.convexHullPoints.map((candidate) => ({
  xKnm: candidate.mxKnm,
  yKnm: candidate.myKnm,
}));
const scenarios = createRadialScenarios(mechanicalBoundary);
for (const scenarioId of ["internal", "boundary", "external", "zero"] as const) {
  const scenario = scenarios.find((candidate) => candidate.id === scenarioId)!;
  const result = verifyRadialDemand(scenario.boundary, scenario.initialDemand);
  assert.equal(result.applicable, true, `${scenarioId} deve ser aplicável`);
}
close(
  verifyRadialDemand(scenarios[0].boundary, scenarios[0].initialDemand).utilization!,
  0.58,
  1e-8,
  "preset interno mecânico",
);
close(
  verifyRadialDemand(scenarios[1].boundary, scenarios[1].initialDemand).utilization!,
  1,
  1e-8,
  "preset na fronteira mecânica",
);
close(
  verifyRadialDemand(scenarios[2].boundary, scenarios[2].initialDemand).utilization!,
  1.26,
  1e-8,
  "preset externo mecânico",
);

console.log(
  "Verificação radial: dentro/fronteira/fora, M=0, degenerações, origem e interseções múltiplas verificados.",
);
