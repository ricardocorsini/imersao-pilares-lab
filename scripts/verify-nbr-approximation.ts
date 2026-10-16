import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sliceMesh, type CutAxis, type InteractionPoint, type SliceResult, type Triangle } from "../src/core/interactionMesh.ts";
import {
  approximateBoundaryPoint, approximateInteractionIndex, buildApproximateInteractionSurface,
  compareRadialCapacities, extractUniaxialResistances,
} from "../src/core/nbrInteractionApproximation.ts";

const data = JSON.parse(readFileSync(new URL("../src/data/interaction-surface.json", import.meta.url), "utf8")) as {
  vertices: InteractionPoint[]; triangles: Triangle[]; rings: number[][]; nCapacityKn: number;
};
const close = (actual: number, expected: number, tolerance = 1e-6) => assert.ok(
  Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}; erro ${actual - expected}`,
);
const asSlice = (points: InteractionPoint[]): SliceResult => points.length === 1
  ? { paths: [], isolated: points }
  : { paths: [[...points, points[0]]], isolated: [] };
const sections = data.rings.map(ring => {
  const points = ring.map(index => data.vertices[index]);
  return extractUniaxialResistances(asSlice(points), points[0][2]);
});
assert.equal(sections.length, 54);
assert.ok(sections.slice(0, -1).every(section => section.status === "valid"));
assert.equal(sections.at(-1)!.status, "point");

// Intercepto uniaxial não é a projeção máxima de uma coordenada oblíqua.
const shiftedPeak = extractUniaxialResistances(asSlice([
  [100, 0, 10], [130, 50, 10], [0, 80, 10], [-70, 0, 10], [0, -60, 10],
]), 10);
assert.equal(shiftedPeak.mxPositive, 100);
assert.equal(shiftedPeak.mxNegative, 70);
assert.equal(shiftedPeak.myPositive, 80);
assert.equal(shiftedPeak.myNegative, 60);

for (const alpha of [1, 1.2, 2]) {
  for (const section of sections.slice(0, -1)) {
    for (const phi of [0, 17, 45, 90, 137, 180, 231, 270, 359]) {
      const point = approximateBoundaryPoint(section, alpha, phi)!;
      close(approximateInteractionIndex(section, alpha, point[0], point[1])!, 1, 1e-12);
      close(point[2], section.nKn);
    }
    close(approximateBoundaryPoint(section, alpha, 0)![0], section.mxPositive);
    close(approximateBoundaryPoint(section, alpha, 90)![1], section.myPositive);
    close(approximateBoundaryPoint(section, alpha, 180)![0], -section.mxNegative);
    close(approximateBoundaryPoint(section, alpha, 270)![1], -section.myNegative);
  }
}
// Mantém capacidades distintas por quadrante, sem espelhar um valor positivo.
close(approximateBoundaryPoint(shiftedPeak, 1.2, 180)![0], -70);
close(approximateBoundaryPoint(shiftedPeak, 1.2, 270)![1], -60);

// Mesmo N arbitrário da malha original: a aproximação usa os interceptos atuais.
for (const fraction of [0, 0.113, 0.4, 0.731, 0.999, 1]) {
  const nKn = data.nCapacityKn * fraction;
  const originalSlice = sliceMesh(data.vertices, data.triangles, "n", nKn);
  const current = extractUniaxialResistances(originalSlice, nKn);
  assert.equal(current.status, fraction === 1 ? "point" : "valid");
  const approximate = buildApproximateInteractionSurface([current, ...sections], 1.2);
  const approximateSlice = sliceMesh(approximate.vertices, approximate.triangles, "n", nKn);
  const check = extractUniaxialResistances(approximateSlice, nKn);
  assert.equal(check.status, current.status);
  for (const property of ["mxPositive", "mxNegative", "myPositive", "myNegative"] as const) {
    close(check[property], current[property]);
  }
  if (fraction === 1) {
    assert.equal(compareRadialCapacities(originalSlice, current, 1.2, 35), null);
    assert.equal(approximateInteractionIndex(current, 1.2, 0, 0), null);
  } else {
    for (const phi of [0, 35, 90, 180, 270]) {
      const comparison = compareRadialCapacities(originalSlice, current, 1.2, phi)!;
      assert.ok(comparison);
      if (phi % 90 === 0) close(comparison.differencePercent, 0, 1e-6);
    }
  }
}

for (const alpha of [1, 1.2]) {
  const mesh = buildApproximateInteractionSurface(sections, alpha);
  assert.ok(mesh.vertices.every(point => point.every(Number.isFinite) && point[2] >= 0));
  const edgeCounts = new Map<string, number>();
  for (const face of mesh.triangles) {
    assert.equal(new Set(face).size, 3);
    for (let index = 0; index < 3; index += 1) {
      const key = [face[index], face[(index + 1) % 3]].sort((a, b) => a - b).join(":");
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
  }
  assert.ok([...edgeCounts.values()].every(count => count === 2), "A malha aproximada deve ser fechada");
  assert.equal(mesh.vertices.length - edgeCounts.size + mesh.triangles.length, 2);
  for (const axis of ["n", "my", "mx"] as CutAxis[]) {
    const value = axis === "n" ? data.nCapacityKn * 0.4 : 35;
    const slice = sliceMesh(mesh.vertices, mesh.triangles, axis, value);
    assert.ok(slice.paths.length > 0);
    for (const path of slice.paths) {
      for (let dimension = 0; dimension < 3; dimension += 1) close(path[0][dimension], path.at(-1)![dimension]);
    }
  }
}
const square = extractUniaxialResistances(asSlice([[100, -100, 0], [100, 100, 0], [-100, 100, 0], [-100, -100, 0]]), 0);
close(Math.hypot(...approximateBoundaryPoint(square, 1, 45)!.slice(0, 2)), 100 / Math.sqrt(2));
assert.ok(approximateBoundaryPoint(square, 1.2, 45)![0] > approximateBoundaryPoint(square, 1, 45)![0]);
assert.throws(() => approximateBoundaryPoint(square, 0, 0), /expoente/);
assert.throws(() => extractUniaxialResistances(asSlice([[100, 0, 20], [0, 100, 20], [-100, 0, 20], [0, -100, 20]]), 10), /mesmo nível/);

console.log("Aproximação NBR: interceptos no mesmo N, sinais, α, quatro quadrantes, topo, malha fechada e cortes sincronizados verificados.");
