import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { solveEquilibrium } from "../src/core/fiberEquilibrium.ts";
import { FORCE_MESH_OPTIONS, FORCE_MODEL_SIGNATURE, FORCE_PRESETS, type ForceExampleCache } from "../src/core/fiberForceCatalog.ts";

const hash = createHash("sha256");
for (const file of ["sectionModel.ts", "fiberEquilibrium.ts", "fiberForceCatalog.ts"]) {
  hash.update(file).update(readFileSync(new URL(`../src/core/${file}`, import.meta.url)));
}
const cache: ForceExampleCache = {
  schemaVersion: 1,
  generatedBy: "npm run generate:forces",
  engineSha256: hash.digest("hex"),
  modelSignature: FORCE_MODEL_SIGNATURE,
  entries: [],
};
for (const mesh of FORCE_MESH_OPTIONS) {
  for (const preset of FORCE_PRESETS) {
    const solution = solveEquilibrium(preset.loads, mesh);
    if (!solution.converged) throw new Error(`Não convergiu: ${preset.id}, malha ${mesh.nx} × ${mesh.ny}.`);
    cache.entries.push({ exampleId: preset.id, mesh, loads: preset.loads, solution });
  }
}
const content = `${JSON.stringify(cache)}\n`;
writeFileSync(new URL("../src/data/fiber-force-examples.json", import.meta.url), content);
console.log(`${cache.entries.length} exemplos pré-calculados em ${FORCE_MESH_OPTIONS.length} malhas · ${(Buffer.byteLength(content) / 1024).toFixed(0)} kB.`);
