import assert from "node:assert/strict";
import {
  PROJECTION_GEOMETRIES,
  computeProjectedGeometry,
  projectPoint,
  type Point2D,
} from "../src/core/projectedGeometry.ts";

const close = (actual: number, expected: number, tolerance = 1e-9) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `esperado ${expected}; obtido ${actual}; diferença ${actual - expected}`,
  );
};

const centroid = (points: readonly Point2D[]) => {
  let areaTwice = 0;
  let xSum = 0;
  let ySum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = current.xMm * next.yMm - next.xMm * current.yMm;
    areaTwice += cross;
    xSum += (current.xMm + next.xMm) * cross;
    ySum += (current.yMm + next.yMm) * cross;
  }
  return { x: xSum / (3 * areaTwice), y: ySum / (3 * areaTwice) };
};

const horizontal = computeProjectedGeometry({
  geometryId: "rectangle",
  thetaDeg: 0,
  neutralAxisRatio: 0.4,
});
close(horizontal.pMaxMm, 150);
close(horizontal.pMinMm, -150);
close(horizontal.heightMm, 300);
close(horizontal.neutralAxisDepthMm, 120);
close(horizontal.neutralAxisProjectionMm, 30);

const vertical = computeProjectedGeometry({
  geometryId: "rectangle",
  thetaDeg: 90,
  neutralAxisRatio: 0.4,
});
close(vertical.pMaxMm, 300);
close(vertical.pMinMm, -300);
close(vertical.heightMm, 600);

const diagonal = computeProjectedGeometry({
  geometryId: "rectangle",
  thetaDeg: 45,
  neutralAxisRatio: 0.38,
});
close(diagonal.heightMm, (300 + 600) / Math.sqrt(2));

for (const state of [horizontal, vertical, diagonal]) {
  for (const point of state.geometry.outline) {
    const projection = projectPoint(point, state.cosine, state.sine);
    assert.ok(projection <= state.pMaxMm + 1e-9);
    assert.ok(projection >= state.pMinMm - 1e-9);
  }
  for (const bar of state.bars) {
    close(bar.depthMm, state.pMaxMm - bar.projectionMm);
    close(bar.relativeDepth, bar.depthMm / state.heightMm);
    assert.ok(bar.depthMm >= 0 && bar.depthMm <= state.heightMm);
  }
  if (state.effectiveDepthMm !== null) {
    const totalArea = state.tensileBars.reduce((sum, bar) => sum + bar.areaMm2, 0);
    const weightedDepth = state.tensileBars.reduce(
      (sum, bar) => sum + bar.depthMm * bar.areaMm2,
      0,
    ) / totalArea;
    close(state.effectiveDepthMm, weightedDepth);
  }
}

assert.notEqual(horizontal.effectiveDepthMm, diagonal.effectiveDepthMm);

const reversed = computeProjectedGeometry({
  geometryId: "rectangle",
  thetaDeg: 180,
  neutralAxisRatio: 0.4,
});
for (const bar of horizontal.bars) {
  const reverseBar = reversed.bars.find((candidate) => candidate.id === bar.id);
  assert.ok(reverseBar);
  close(reverseBar.depthMm, horizontal.heightMm - bar.depthMm, 1e-8);
}

const fullyCompressedBars = computeProjectedGeometry({
  geometryId: "rectangle",
  thetaDeg: 35,
  neutralAxisRatio: 1,
});
assert.equal(fullyCompressedBars.tensileBars.length, 0);
assert.equal(fullyCompressedBars.effectiveDepthMm, null);

const lHorizontal = computeProjectedGeometry({
  geometryId: "l-section",
  thetaDeg: 0,
  neutralAxisRatio: 0.38,
});
const lVertical = computeProjectedGeometry({
  geometryId: "l-section",
  thetaDeg: 90,
  neutralAxisRatio: 0.38,
});
const lOblique = computeProjectedGeometry({
  geometryId: "l-section",
  thetaDeg: 35,
  neutralAxisRatio: 0.38,
});
close(lHorizontal.heightMm, 450);
close(lVertical.heightMm, 600);
assert.ok(lOblique.heightMm > lVertical.heightMm);
assert.equal(lOblique.bars.length, 10);

for (const geometry of PROJECTION_GEOMETRIES) {
  const center = centroid(geometry.outline);
  close(center.x, 0, 1e-10);
  close(center.y, 0, 1e-10);
  assert.equal(new Set(geometry.bars.map((bar) => bar.id)).size, geometry.bars.length);
}

assert.throws(
  () => computeProjectedGeometry({
    geometryId: "rectangle",
    thetaDeg: 0,
    neutralAxisRatio: 1.1,
  }),
  /entre 0 e 1/,
);

console.log("Geometria projetada: p, z, h, linha neutra, barras e profundidade efetiva verificados.");
