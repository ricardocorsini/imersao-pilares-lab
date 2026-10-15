import assert from "node:assert/strict";
import {
  FRAME_EXAMPLES,
  computeReferenceFrame,
  sumLongitudinalForces,
  translateFrameResultants,
} from "../src/core/referenceFrame.ts";

const close = (actual: number, expected: number, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `Esperado ${expected}; obtido ${actual}.`);

const force = FRAME_EXAMPLES[0].forces;
const initial = sumLongitudinalForces(force);
close(initial.nKn, 100);
close(initial.mxKnm, 15);
close(initial.myKnm, 10);

const moved = computeReferenceFrame(force, { xMm: 40, yMm: 50 });
close(moved.shifted.nKn, 100);
close(moved.shifted.mxKnm, 10);
close(moved.shifted.myKnm, 6);
close(moved.contributions[0].xLocalMm, 60);
close(moved.contributions[0].yLocalMm, 100);
close(moved.equivalentPoint!.xMm, 100);
close(moved.equivalentPoint!.yMm, 150);

const atForce = computeReferenceFrame(force, { xMm: 100, yMm: 150 });
close(atForce.shifted.mxKnm, 0);
close(atForce.shifted.myKnm, 0);

const centered = computeReferenceFrame(FRAME_EXAMPLES[1].forces, { xMm: 40, yMm: 50 });
close(centered.original.mxKnm, 0);
close(centered.shifted.mxKnm, -5);
close(centered.shifted.myKnm, -4);

const tension = computeReferenceFrame(FRAME_EXAMPLES[2].forces, { xMm: 40, yMm: 50 });
close(tension.shifted.nKn, -100);
close(tension.shifted.mxKnm, -10);
close(tension.shifted.myKnm, -6);

for (const origin of [{ xMm: 0, yMm: 0 }, { xMm: 200, yMm: -350 }, { xMm: 0, yMm: 150 }]) {
  const couple = computeReferenceFrame(FRAME_EXAMPLES[3].forces, origin);
  close(couple.shifted.nKn, 0);
  close(couple.shifted.mxKnm, 30);
  close(couple.shifted.myKnm, 0);
  assert.equal(couple.equivalentPoint, null);
}

const symmetric = computeReferenceFrame(FRAME_EXAMPLES[4].forces, { xMm: 0, yMm: 0 });
close(symmetric.original.nKn, 100);
close(symmetric.original.mxKnm, 0);
close(symmetric.original.myKnm, 0);

// Conferência independente: somar as forças nas coordenadas transladadas
// deve dar o mesmo que transformar as resultantes já conhecidas.
for (const example of FRAME_EXAMPLES) {
  for (const xMm of [-200, -40, 0, 100, 200]) {
    for (const yMm of [-350, -150, 0, 50, 350]) {
      const state = computeReferenceFrame(example.forces, { xMm, yMm });
      close(state.residualKnm, 0);
      const roundTrip = translateFrameResultants(state.shifted, { xMm: -xMm, yMm: -yMm });
      close(roundTrip.nKn, state.original.nKn);
      close(roundTrip.mxKnm, state.original.mxKnm);
      close(roundTrip.myKnm, state.original.myKnm);
    }
  }
}

// Translação encadeada: O -> O′ -> O″ equivale ao deslocamento total.
const first = translateFrameResultants(initial, { xMm: 40, yMm: 50 });
const second = translateFrameResultants(first, { xMm: -10, yMm: 25 });
const total = translateFrameResultants(initial, { xMm: 30, yMm: 75 });
close(second.mxKnm, total.mxKnm);
close(second.myKnm, total.myKnm);

const empty = computeReferenceFrame([], { xMm: 10, yMm: 20 });
assert.deepEqual(empty.shifted, { nKn: 0, mxKnm: 0, myKnm: 0 });
assert.equal(empty.equivalentPoint, null);
assert.throws(() => computeReferenceFrame(force, { xMm: NaN, yMm: 0 }));
assert.throws(() => sumLongitudinalForces([{ ...force[0], forceKn: Infinity }]));
console.log("Eixos e origem: exemplos, sinais, unidades, binário, translações e soma direta conferidos.");
