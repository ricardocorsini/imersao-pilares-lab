import assert from "node:assert/strict";
import { drawingArrow, drawingDistance, drawingPoint, EMPTY_DRAWING, snapDrawingEnd, updateDrawing, type DrawingMark } from "../src/core/lectureDrawing.ts";

const line: DrawingMark = { tool: "line", color: "#ffe16a", width: 4, points: [{ x: .1, y: .2 }, { x: .8, y: .2 }] };
const eraser: DrawingMark = { tool: "eraser", color: "#ffffff", width: 32, points: [{ x: .4, y: .2 }] };
const first = updateDrawing(EMPTY_DRAWING, { type: "add", mark: line });
const erased = updateDrawing(first, { type: "add", mark: eraser });
assert.deepEqual(updateDrawing(erased, { type: "undo" }).present, [line]);
assert.deepEqual(updateDrawing(updateDrawing(erased, { type: "undo" }), { type: "redo" }).present, [line, eraser]);
const cleared = updateDrawing(erased, { type: "clear" });
assert.equal(cleared.present.length, 0);
assert.deepEqual(updateDrawing(cleared, { type: "undo" }).present, erased.present, "Limpar deve ser reversível, inclusive após usar a borracha");
const forked = updateDrawing(updateDrawing(erased, { type: "undo" }), { type: "add", mark: { ...line, tool: "arrow" } });
assert.equal(forked.future.length, 0, "Um novo traço deve descartar apenas o ramo de refazer");
assert.equal(EMPTY_DRAWING.present.length, 0);
assert.equal(first.present.length, 1, "O histórico anterior não pode ser alterado");
assert.equal(updateDrawing(EMPTY_DRAWING, { type: "clear" }), EMPTY_DRAWING);
assert.equal(updateDrawing(EMPTY_DRAWING, { type: "add", mark: eraser }), EMPTY_DRAWING);

assert.deepEqual(drawingPoint(120, 240, { left: 20, top: 40, width: 1000, height: 500 }), { x: .1, y: .4 });
assert.deepEqual(drawingPoint(-10, 999, { left: 0, top: 0, width: 100, height: 100 }), { x: 0, y: 1 });
const start = { x: .1, y: .1 };
const end = { x: .3, y: .7 };
const size = { width: 1000, height: 500 };
const snapped = snapDrawingEnd(start, end, size);
assert.ok(Math.abs((snapped.x - start.x) * size.width - (snapped.y - start.y) * size.height) < 1e-8);
assert.ok(Math.abs(drawingDistance(start, snapped, size) - drawingDistance(start, end, size)) < 1e-8);
for (const finish of [{ x: 200, y: 20 }, { x: -100, y: 300 }, { x: 10.01, y: 20.01 }]) {
  const origin = { x: 10, y: 20 };
  const arrow = drawingArrow(origin, finish, 4)!;
  assert.deepEqual(arrow.tip, finish);
  assert.ok(Math.hypot(arrow.base.x - finish.x, arrow.base.y - finish.y) <= Math.hypot(finish.x - origin.x, finish.y - origin.y) * .45 + 1e-8);
  assert.ok(Number.isFinite(arrow.left.x) && Number.isFinite(arrow.right.y));
}
assert.equal(drawingArrow(start, start, 4), null);
console.log("Anotações: borracha e limpeza reversíveis, histórico independente, coordenadas da tela e restrição de linhas/setas verificados.");
