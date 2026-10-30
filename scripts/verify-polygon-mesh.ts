import assert from "node:assert/strict";
import {
  POLYGON_PRESETS, buildPolygonMesh, classifyPolygonPoint, formatPolygonCoordinates,
  parsePolygonCoordinates, polygonProperties, polygonRefinementStudy, resolutionForTarget,
} from "../src/core/polygonMesh.ts";

const close = (actual: number | null, expected: number, tolerance = 1e-8) => {
  assert.notEqual(actual, null);
  assert.ok(Math.abs(actual! - expected) <= tolerance, `Esperado ${expected}; obtido ${actual}.`);
};
const preset = (id: string) => POLYGON_PRESETS.find(p => p.id === id)!.vertices;

// Valores independentes da Aula 03, seção 3.10 e Figura 3.6.
const trapezoid = polygonProperties(preset("trapezio"));
close(trapezoid.area, 144000); close(trapezoid.centroid.x, 122.5); close(trapezoid.centroid.y, 275);
const mesh = buildPolygonMesh(trapezoid, 5, 10);
assert.equal(mesh.metrics.accepted, 41); assert.equal(mesh.metrics.rejected, 9);
close(mesh.dx, 60); close(mesh.dy, 60); close(mesh.metrics.area, 147600);
close(mesh.metrics.areaErrorPercent, 2.5); close(mesh.metrics.deltaArea, 3600);
// Soma independente das contagens em cada faixa horizontal: 5,5,5,4,4,4,4,4,3,3.
const counts = [5, 5, 5, 4, 4, 4, 4, 4, 3, 3];
const sumX = counts.reduce((sum, n) => sum + n * n * 30, 0);
const sumY = counts.reduce((sum, n, row) => sum + n * (30 + row * 60), 0);
close(mesh.metrics.centroid!.x, sumX / 41); close(mesh.metrics.centroid!.y, sumY / 41);
close(mesh.metrics.centroidDistance, Math.hypot(sumX / 41 - 122.5, sumY / 41 - 275));
close(mesh.metrics.centroidErrorPercent, mesh.metrics.centroidDistance! / 600 * 100);
assert.equal(mesh.cells.filter(c => c.onBoundary).length, 2);
assert.deepEqual(resolutionForTarget(trapezoid, 60), { nx: 5, ny: 10 });
assert.deepEqual(resolutionForTarget(trapezoid, 70), { nx: 5, ny: 9 });
assert.throws(() => resolutionForTarget(trapezoid, 0));
assert.throws(() => resolutionForTarget(trapezoid, 0.1));

// O retângulo cobre exatamente a geometria, inclusive em resoluções ímpares e não quadradas.
const rectangle = polygonProperties(preset("retangulo"));
for (const [nx, ny] of [[1, 1], [3, 7], [5, 10], [29, 53], [120, 120]]) {
  const rectangular = buildPolygonMesh(rectangle, nx, ny);
  close(rectangular.metrics.area, 180000); close(rectangular.metrics.centroid!.x, 150); close(rectangular.metrics.centroid!.y, 300);
  close(rectangular.metrics.areaErrorPercent, 0); close(rectangular.metrics.centroidDistance, 0);
  assert.equal(rectangular.metrics.accepted, nx * ny);
}

// Seção côncava: soma de dois retângulos sem sobreposição.
const l = polygonProperties(preset("l"));
close(l.area, 400 * 160 + 140 * 440);
close(l.centroid.x, (400 * 160 * 200 + 140 * 440 * 70) / l.area);
close(l.centroid.y, (400 * 160 * 80 + 140 * 440 * 380) / l.area);
assert.equal(classifyPolygonPoint({ x: 300, y: 400 }, l).inside, false);
assert.equal(classifyPolygonPoint({ x: 70, y: 400 }, l).inside, true);
assert.deepEqual(classifyPolygonPoint({ x: 140, y: 400 }, l), { inside: true, onBoundary: true });
const exactLMesh = buildPolygonMesh(l, 20, 30);
close(exactLMesh.metrics.area, l.area); close(exactLMesh.metrics.centroidDistance, 0);

for (const shape of POLYGON_PRESETS) {
  const original = polygonProperties(shape.vertices);
  const reversed = polygonProperties([...shape.vertices].reverse());
  close(reversed.area, original.area); close(reversed.signedArea, -original.signedArea);
  close(reversed.centroid.x, original.centroid.x); close(reversed.centroid.y, original.centroid.y);
  const direct = buildPolygonMesh(original, 13, 19), backwards = buildPolygonMesh(reversed, 13, 19);
  assert.deepEqual(direct.cells.map(c => c.inside), backwards.cells.map(c => c.inside));
  close(backwards.metrics.area, direct.metrics.area);
  const shifted = polygonProperties(shape.vertices.map(p => ({ x: p.x + 1e8, y: p.y - 2e8 })));
  const shiftedMesh = buildPolygonMesh(shifted, 13, 19);
  close(shifted.area, original.area); close(shifted.centroid.x - 1e8, original.centroid.x, 1e-7);
  close(shifted.centroid.y + 2e8, original.centroid.y, 1e-7);
  close(shiftedMesh.metrics.centroidDistance, direct.metrics.centroidDistance!, 1e-7);
  assert.deepEqual(parsePolygonCoordinates(formatPolygonCoordinates(shape.vertices)), shape.vertices);
  const samples = polygonRefinementStudy(original);
  assert.ok(samples.length >= 10);
  assert.ok(samples.every(s => s.nx <= 120 && s.ny <= 120 && s.areaErrorPercent >= 0));
}

// Um L estreito cujo centro do envolvente está fora: não inventar centroide para área zero.
const thin = polygonProperties([{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 600 }, { x: 0, y: 600 }]);
const empty = buildPolygonMesh(thin, 1, 1);
close(empty.metrics.area, 0); close(empty.metrics.areaErrorPercent, 100);
assert.equal(empty.metrics.centroid, null); assert.equal(empty.metrics.centroidDistance, null); assert.equal(empty.metrics.centroidErrorPercent, null);

assert.deepEqual(parsePolygonCoordinates("0; 0\n300; 0\n0; 600\n0; 0"), [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 0, y: 600 }]);
close(polygonProperties(parsePolygonCoordinates("0,5; 0\n300,5; 0\n0,5; 600")).centroid.x, 100.5);
assert.deepEqual(parsePolygonCoordinates("(0, 0)\n(300, 0)\n(0, 600)"), parsePolygonCoordinates("0 0\n300 0\n0 600"));
assert.deepEqual(parsePolygonCoordinates("0,5 0\n300,5 0\n0,5 600"), parsePolygonCoordinates("0.5; 0\n300.5; 0\n0.5; 600"));
for (const invalid of [
  "0; 0\n100; 100\n0; 100\n100; 0", // laço
  "0; 0\n100; 0\n50; 0\n50; 100\n0; 100", // retorno sobre uma aresta
  "0; 0\n100; 0\n100; 100\n0; 0\n0; 100", // vértice repetido
  "0; 0\n100; 0\n100; 0\n0; 100", // aresta nula
  "0; 0\n100; 0\n200; 0", // colinear
  "0; 0\nInfinity; 0\n0; 100", "0; 0\n100; 0\n0; NaN", "0; 0\n1; 1", "0; 0\n;\n0; 100",
]) assert.throws(() => parsePolygonCoordinates(invalid), invalid);
// Vértices colineares em sequência são permitidos quando não há retorno.
close(polygonProperties(parsePolygonCoordinates("0;0\n50;0\n100;0\n100;100\n0;100")).area, 10000);
for (const n of [0, -1, 1.5, 121, NaN]) assert.throws(() => buildPolygonMesh(trapezoid, n, 10));

console.log("Malha poligonal: exemplo da Aula 03, concavidades, borda incluída, área, centroides, orientação, translação, refinamento, entrada e malha vazia conferidos.");
