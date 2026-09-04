import data from "../data/fiber-force-examples.json" with { type: "json" };
import { FORCE_MODEL_SIGNATURE, forceExampleKey, type ForceExampleCache } from "./fiberForceCatalog.ts";
import type { MeshSettings } from "./sectionModel.ts";
import type { SectionLoads } from "./fiberEquilibrium.ts";

const cache: ForceExampleCache = data;
const examples = new Map(
  cache.schemaVersion === 1 && cache.modelSignature === FORCE_MODEL_SIGNATURE
    ? cache.entries.map(entry => [forceExampleKey(entry.mesh, entry.loads), entry.solution])
    : [],
);

/** Apenas correspondências exatas: nunca interpola ou reutiliza outro carregamento. */
export function cachedForceExample(mesh: MeshSettings, loads: SectionLoads) {
  return examples.get(forceExampleKey(mesh, loads));
}
