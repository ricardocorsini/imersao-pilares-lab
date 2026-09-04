import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { calculateSectionState, DEFAULT_PLANE } from "../src/core/sectionModel.ts";
import {
  DEFAULT_FORCE_LOADS, forceArrowDirection, forceArrowLength, forceElements,
  solveEquilibrium, sumForces,
} from "../src/core/fiberEquilibrium.ts";
import { FORCE_MESH_OPTIONS, FORCE_MODEL_SIGNATURE, FORCE_PRESETS, type ForceExampleCache } from "../src/core/fiberForceCatalog.ts";
import { cachedForceExample } from "../src/core/fiberForceCache.ts";

const close = (a: number, b: number, tol = 1e-7) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
const started = performance.now();
assert.equal(FORCE_MESH_OPTIONS.length, 12);
for (const mesh of FORCE_MESH_OPTIONS) {
  const state = calculateSectionState(DEFAULT_PLANE, mesh);
  const elements = forceElements(state);
  const sum = sumForces(elements);
  close(sum.nKn, state.nKn); close(sum.mxKnm, state.mxKnm); close(sum.myKnm, state.myKnm);
  for (const bar of elements.filter(e => e.kind === "steel")) close(bar.forceKn, bar.steelForceKn - bar.displacedConcreteKn);
  for (const loads of [
    DEFAULT_FORCE_LOADS,
    { nKn: 0, mxKnm: 0, myKnm: 0 },
    { nKn: 1500, mxKnm: 0, myKnm: 0 },
    { nKn: -300, mxKnm: 0, myKnm: 0 },
    { nKn: 0, mxKnm: 120, myKnm: 0 },
    { nKn: 1800, mxKnm: -160, myKnm: -45 },
  ]) {
    const result = solveEquilibrium(loads, mesh);
    assert.ok(result.converged, `Não convergiu: ${JSON.stringify({ mesh, loads, residual: result.residual })}`);
    close(result.state.nKn, loads.nKn, 0.005);
    close(result.state.mxKnm, loads.mxKnm, 0.001);
    close(result.state.myKnm, loads.myKnm, 0.001);
  }
}
const cache = JSON.parse(readFileSync(new URL("../src/data/fiber-force-examples.json", import.meta.url), "utf8")) as ForceExampleCache;
assert.equal(cache.schemaVersion, 1);
assert.equal(cache.modelSignature, FORCE_MODEL_SIGNATURE);
assert.equal(cache.entries.length, FORCE_MESH_OPTIONS.length * FORCE_PRESETS.length);
const hash = createHash("sha256");
for (const file of ["sectionModel.ts", "fiberEquilibrium.ts", "fiberForceCatalog.ts"]) {
  hash.update(file).update(readFileSync(new URL(`../src/core/${file}`, import.meta.url)));
}
assert.equal(cache.engineSha256, hash.digest("hex"), "Cache desatualizado: execute npm run generate:forces.");
for (const mesh of FORCE_MESH_OPTIONS) {
  for (const preset of FORCE_PRESETS) {
    const cached = cachedForceExample(mesh, preset.loads);
    assert.ok(cached, `Exemplo ausente: ${preset.id}, ${mesh.nx} × ${mesh.ny}.`);
    assert.ok(cached.converged);
    assert.equal(cached.state.fibers.length, mesh.nx * mesh.ny);
    assert.equal(cached.state.rebars.length, 8);
    assert.deepEqual(cached.state, calculateSectionState(cached.plane, mesh));
    const sums = sumForces(forceElements(cached.state));
    close(sums.nKn, preset.loads.nKn, 0.005);
    close(sums.mxKnm, preset.loads.mxKnm, 0.001);
    close(sums.myKnm, preset.loads.myKnm, 0.001);
    close(cached.residual.nKn, sums.nKn - preset.loads.nKn);
    close(cached.residual.mxKnm, sums.mxKnm - preset.loads.mxKnm);
    close(cached.residual.myKnm, sums.myKnm - preset.loads.myKnm);
  }
}
assert.equal(cachedForceExample(FORCE_MESH_OPTIONS[3], { ...DEFAULT_FORCE_LOADS, nKn: 1800.001 }), undefined);
assert.throws(() => calculateSectionState(DEFAULT_PLANE, { nx: 0, ny: 8 }));
assert.throws(() => calculateSectionState(DEFAULT_PLANE, { nx: 4.5, ny: 8 }));
const coarse = forceElements(calculateSectionState({ eps0PerMille: 1, gxPerMillePerM: 0, gyPerMillePerM: 0 }, { nx: 4, ny: 8 }));
const fine = forceElements(calculateSectionState({ eps0PerMille: 1, gxPerMillePerM: 0, gyPerMillePerM: 0 }, { nx: 8, ny: 16 }));
close(coarse[0].forceKn, fine[0].forceKn * 4);
close(sumForces(coarse).nKn, sumForces(fine).nKn);
assert.equal(forceArrowLength(0, 1), 0);
close(forceArrowLength(40, 1), 2 * forceArrowLength(20, 1));
close(forceArrowLength(-40, 1), forceArrowLength(40, 1));
assert.equal(forceArrowDirection(10), -1);
assert.equal(forceArrowDirection(-10), 1);
const impossible = solveEquilibrium({ nKn: 10000, mxKnm: 0, myKnm: 0 }, { nx: 8, ny: 16 });
assert.equal(impossible.converged, false);
assert.ok(impossible.residualNorm > 0.1);
assert.ok(Number.isFinite(impossible.state.nKn));
console.log(`Forças por elemento, 72 equilíbrios, 60 exemplos pré-calculados, refinamento e escala de setas validados em ${(performance.now() - started).toFixed(0)} ms.`);
