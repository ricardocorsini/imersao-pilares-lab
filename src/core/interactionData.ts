import data from "../data/interaction-surface.json";
import type { InteractionPoint, Triangle } from "./interactionMesh";

export const interactionData = data;
export const interactionVertices = data.vertices as InteractionPoint[];
export const interactionTriangles = data.triangles as Triangle[];
export const interactionBounds = [0, 1, 2].map(dimension => {
  const values = interactionVertices.map(p => p[dimension]);
  return [Math.min(...values), Math.max(...values)] as [number, number];
});
// Mesma escala para os dois momentos. O eixo N tem unidade diferente.
export const momentWorldScale = 3.25 / Math.max(...interactionBounds.slice(0, 2).flat().map(Math.abs));
export const axialWorldScale = 6 / data.nCapacityKn;
export const toWorld = (point: InteractionPoint): [number, number, number] => [
  point[0] * momentWorldScale, point[2] * axialWorldScale, -point[1] * momentWorldScale,
];
export const fromWorld = (point: { x: number; y: number; z: number }): InteractionPoint => [
  point.x / momentWorldScale, -point.z / momentWorldScale, point.y / axialWorldScale,
];

export function axialColor(fraction: number): string {
  const colors = ["#413bff", "#008cff", "#00e5ff", "#00ed9a", "#c5ff24", "#ffb300", "#ff2355"];
  const value = Math.min(1, Math.max(0, fraction)) * (colors.length - 1);
  const index = Math.min(Math.floor(value), colors.length - 2);
  const t = value - index;
  const channels = (hex: string) => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  const a = channels(colors[index]);
  const b = channels(colors[index + 1]);
  return `#${a.map((v, i) => Math.round(v + t * (b[i] - v)).toString(16).padStart(2, "0")).join("")}`;
}
