import assert from "node:assert/strict";
import {
  LIMIT_STATE_CONCRETE,
  LIMIT_STATE_EPS_SU,
  LIMIT_STATE_STEEL,
  computeLimitStatePath,
  strainAtLimitStateDepth,
} from "../src/core/limitStatePath.ts";

const close = (actual: number, expected: number, tolerance = 1e-9) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `esperado ${expected}; obtido ${actual}; diferença ${actual - expected}`,
  );
};

for (const thetaDeg of [0, 35, 45, 90, 135, 180]) {
  const start = computeLimitStatePath({ t: 0, thetaDeg });
  const steelMiddle = computeLimitStatePath({ t: 0.5, thetaDeg });
  const d23 = computeLimitStatePath({ t: 1, thetaDeg });

  assert.equal(start.domainId, "D1_D2");
  assert.equal(start.branch, "steel_pivot");
  close(start.epsTop, 0);
  close(start.neutralAxisDepthMm, 0);
  close(start.minimumSteelStrain, -LIMIT_STATE_EPS_SU);
  assert.ok(start.steelPivotBarIds.length >= 1);

  assert.equal(steelMiddle.domainId, "D2");
  assert.equal(steelMiddle.branch, "steel_pivot");
  close(steelMiddle.minimumSteelStrain, -LIMIT_STATE_EPS_SU);

  assert.equal(d23.domainId, "D2_D3");
  assert.equal(d23.branch, "steel_pivot");
  close(d23.epsTop, LIMIT_STATE_CONCRETE.epsCu);
  close(d23.minimumSteelStrain, -LIMIT_STATE_EPS_SU);
  close(d23.neutralAxisDepthMm, d23.x23Mm);
  close(
    d23.x23Mm,
    LIMIT_STATE_CONCRETE.epsCu * d23.effectiveDepthMm /
      (LIMIT_STATE_CONCRETE.epsCu + LIMIT_STATE_EPS_SU),
  );
  assert.ok(1 < d23.tD3D4 && d23.tD3D4 < d23.tD4D4a && d23.tD4D4a < 2);

  const d3 = computeLimitStatePath({ t: (1 + d23.tD3D4) / 2, thetaDeg });
  const d34 = computeLimitStatePath({ t: d23.tD3D4, thetaDeg });
  const d4 = computeLimitStatePath({ t: (d23.tD3D4 + d23.tD4D4a) / 2, thetaDeg });
  const d4d4a = computeLimitStatePath({ t: d23.tD4D4a, thetaDeg });
  const d4a = computeLimitStatePath({ t: (d23.tD4D4a + 2) / 2, thetaDeg });

  assert.equal(d3.domainId, "D3");
  assert.ok(d3.minimumSteelStrain < -LIMIT_STATE_STEEL.epsYd);
  assert.equal(d34.domainId, "D3_D4");
  close(d34.minimumSteelStrain, -LIMIT_STATE_STEEL.epsYd, 1e-10);
  assert.equal(d4.domainId, "D4");
  assert.ok(d4.minimumSteelStrain > -LIMIT_STATE_STEEL.epsYd && d4.minimumSteelStrain < 0);
  assert.equal(d4d4a.domainId, "D4_D4A");
  close(d4d4a.minimumSteelStrain, 0, 1e-10);
  assert.equal(d4a.domainId, "D4A");
  assert.ok(d4a.minimumSteelStrain > 0);
  for (const state of [d3, d34, d4, d4d4a, d4a]) {
    assert.equal(state.branch, "concrete_pivot");
    close(state.epsTop, LIMIT_STATE_CONCRETE.epsCu);
  }

  const d45 = computeLimitStatePath({ t: 2, thetaDeg });
  assert.equal(d45.domainId, "D4A_D5");
  assert.equal(d45.branch, "concrete_pivot");
  close(d45.epsTop, LIMIT_STATE_CONCRETE.epsCu);
  close(d45.epsBottom, 0);
  close(d45.neutralAxisDepthMm, d45.heightMm);
  close(
    strainAtLimitStateDepth(d45, d45.pointCDepthMm),
    LIMIT_STATE_CONCRETE.epsC2,
  );

  const d5 = computeLimitStatePath({ t: 2.5, thetaDeg });
  assert.equal(d5.domainId, "D5");
  assert.equal(d5.branch, "point_c_pivot");
  assert.ok(d5.neutralAxisDepthMm > d5.heightMm);
  assert.equal(d5.neutralAxisInsideSection, false);
  close(
    strainAtLimitStateDepth(d5, d5.pointCDepthMm),
    LIMIT_STATE_CONCRETE.epsC2,
  );

  const uniform = computeLimitStatePath({ t: 3, thetaDeg });
  assert.equal(uniform.domainId, "UNIFORM");
  assert.equal(uniform.branch, "point_c_pivot");
  close(uniform.epsTop, LIMIT_STATE_CONCRETE.epsC2);
  close(uniform.epsBottom, LIMIT_STATE_CONCRETE.epsC2);
  close(uniform.slopePerMm, 0);
  assert.equal(uniform.neutralAxisDepthMm, Number.POSITIVE_INFINITY);
  for (const bar of uniform.bars) close(bar.strain, LIMIT_STATE_CONCRETE.epsC2);

  for (const t of [0, 0.37, 1, d23.tD3D4, d23.tD4D4a, 2, 2.63, 3]) {
    const state = computeLimitStatePath({ t, thetaDeg });
    for (const bar of state.bars) {
      close(bar.strain, strainAtLimitStateDepth(state, bar.depthMm));
    }
  }

  const beforeOne = computeLimitStatePath({ t: 1 - 1e-8, thetaDeg });
  const afterOne = computeLimitStatePath({ t: 1 + 1e-8, thetaDeg });
  close(beforeOne.epsTop, afterOne.epsTop, 2e-9);
  close(beforeOne.epsBottom, afterOne.epsBottom, 2e-9);
  const beforeTwo = computeLimitStatePath({ t: 2 - 1e-8, thetaDeg });
  const afterTwo = computeLimitStatePath({ t: 2 + 1e-8, thetaDeg });
  close(beforeTwo.epsTop, afterTwo.epsTop, 2e-9);
  close(beforeTwo.epsBottom, afterTwo.epsBottom, 2e-9);
}

const normalX = computeLimitStatePath({ t: 0.5, thetaDeg: 90 });
assert.equal(normalX.steelPivotBarIds.length, 3);
assert.deepEqual(normalX.steelPivotBarIds, ["B1", "B2", "B3"]);

assert.throws(() => computeLimitStatePath({ t: -0.01, thetaDeg: 0 }), /entre 0 e 3/);
assert.throws(() => computeLimitStatePath({ t: 3.01, thetaDeg: 0 }), /entre 0 e 3/);

console.log("Estados-limites: três pivôs, continuidade, fronteiras e classificação pelas barras verificados.");
