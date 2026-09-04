import { CONCRETE, SECTION, STEEL, type MeshSettings } from "./sectionModel.ts";
import { DEFAULT_FORCE_LOADS, type EquilibriumSolution, type SectionLoads } from "./fiberEquilibrium.ts";

/** Células quadradas: a altura da seção é o dobro da largura. */
export const FORCE_MESH_OPTIONS: MeshSettings[] = [4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]
  .map(nx => ({ nx, ny: nx * 2 }));
export const DEFAULT_FORCE_MESH_INDEX = 3;
export const FORCE_PRESETS = [
  { id: "obliqua", label: "Oblíqua", loads: DEFAULT_FORCE_LOADS },
  { id: "compressao", label: "Compressão", loads: { nKn: 1500, mxKnm: 0, myKnm: 0 } },
  { id: "flexao", label: "Flexão", loads: { nKn: 0, mxKnm: 120, myKnm: 0 } },
  { id: "tracao", label: "Tração", loads: { nKn: -300, mxKnm: 0, myKnm: 0 } },
  { id: "zero", label: "Zero", loads: { nKn: 0, mxKnm: 0, myKnm: 0 } },
];
export const FORCE_MODEL_SIGNATURE = JSON.stringify({ section: SECTION, concrete: CONCRETE, steel: STEEL });
export type ForceExampleCache = {
  schemaVersion: number;
  generatedBy: string;
  engineSha256: string;
  modelSignature: string;
  entries: {
    exampleId: string;
    mesh: MeshSettings;
    loads: SectionLoads;
    solution: EquilibriumSolution;
  }[];
};
export const forceExampleKey = (mesh: MeshSettings, loads: SectionLoads) =>
  [mesh.nx, mesh.ny, loads.nKn, loads.mxKnm, loads.myKnm].join("/");
