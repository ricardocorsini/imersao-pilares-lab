import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateSectionState } from "../src/core/sectionModel.ts";
import { CUT_INDEX, sliceMesh, type CutAxis, type InteractionPoint, type Triangle } from "../src/core/interactionMesh.ts";

const data = JSON.parse(readFileSync(new URL("../src/data/interaction-surface.json", import.meta.url), "utf8"));
const vertices = data.vertices as InteractionPoint[];
const triangles = data.triangles as Triangle[];
const close = (a: number, b: number, tolerance = 1e-5) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
assert.equal(data.nLevels, 54);
assert.equal(data.nAngles, 120);
assert.ok(data.maxAxialResidualN < 0.001);
assert.ok(vertices.every(p => p.length === 3 && p.every(Number.isFinite) && p[2] >= 0));

// Mesmas leis constitutivas e mesmos planos do motor Python original.
for (const check of data.referenceChecks) {
  const state = calculateSectionState(check.plane);
  [state.mxKnm, state.myKnm, state.nKn].forEach((v, i) => close(v, check.point[i]));
}
const uniform = calculateSectionState({ eps0PerMille: 2, gxPerMillePerM: 0, gyPerMillePerM: 0 });
close(uniform.nKn, data.nCapacityKn);

// Malha fechada, sem buracos, índices inválidos ou faces degeneradas.
const edgeCounts = new Map<string, number>();
for (const face of triangles) {
  assert.equal(new Set(face).size, 3);
  assert.ok(face.every(i => i >= 0 && i < vertices.length));
  for (let j = 0; j < 3; j++) {
    const key = [face[j], face[(j + 1) % 3]].sort((a, b) => a - b).join(":");
    edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
  }
}
assert.ok([...edgeCounts.values()].every(count => count === 2), "Cada aresta deve ter duas faces");
assert.equal(vertices.length - edgeCounts.size + triangles.length, 2);

const bounds = [0, 1, 2].map(d => [Math.min(...vertices.map(p => p[d])), Math.max(...vertices.map(p => p[d]))]);
const started = performance.now();
let checked = 0;
for (const axis of ["n", "my", "mx"] as CutAxis[]) {
  const dimension = CUT_INDEX[axis];
  const [min, max] = bounds[dimension];
  for (const ratio of [0, 0.01, 0.2, 0.4, 0.5, 0.72, 0.99, 1]) {
    const value = min + ratio * (max - min);
    const result = sliceMesh(vertices, triangles, axis, value);
    assert.ok(result.paths.length || result.isolated.length, `${axis}=${value}: interseção ausente`);
    for (const point of [...result.paths.flat(), ...result.isolated]) close(point[dimension], value, 1e-8);
    for (const path of result.paths) {
      for (let i = 0; i < 3; i++) close(path[0][i], path[path.length - 1][i]);
    }
    if (ratio > 0 && ratio < 1) assert.equal(result.paths.length, 1, `Contorno conexo: ${axis}=${value}`);
    checked++;
  }
  const outside = sliceMesh(vertices, triangles, axis, max + 10);
  assert.equal(outside.paths.length + outside.isolated.length, 0);
}

// Um corte em um nível pré-gerado precisa passar por todos os seus pontos.
for (const ringIndex of [0, 20, 40]) {
  const ring: number[] = data.rings[ringIndex];
  const n = vertices[ring[0]][2];
  const result = sliceMesh(vertices, triangles, "n", n);
  assert.equal(result.paths.length, 1);
  for (const index of ring) assert.ok(result.paths[0].some(p => Math.hypot(p[0] - vertices[index][0], p[1] - vertices[index][1]) < 1e-5));
}
const top = sliceMesh(vertices, triangles, "n", data.nCapacityKn);
assert.equal(top.paths.length, 0);
assert.equal(top.isolated.length, 1);
close(top.isolated[0][0], 0); close(top.isolated[0][1], 0);
console.log(`Superfície conferida com o Python; ${checked} cortes, base, topo e continuidade validados em ${(performance.now() - started).toFixed(0)} ms.`);
