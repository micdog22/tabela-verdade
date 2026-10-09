import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cellMinterm, cyclicRuns, groupCells, groupSegments, karnaughLayout, mapValues, mintermCell,
} from '../src/karnaugh.js';
import { minimizeSOP, popcount } from '../src/quine.js';

test('disposição em código Gray para 2, 3 e 4 variáveis', () => {
  const l2 = karnaughLayout(2);
  assert.deepEqual([l2.rowLabels, l2.colLabels], [['0', '1'], ['0', '1']]);
  const l3 = karnaughLayout(3);
  assert.deepEqual([l3.rowLabels, l3.colLabels], [['0', '1'], ['00', '01', '11', '10']]);
  assert.deepEqual(l3.colVars, [1, 2]);
  const l4 = karnaughLayout(4);
  assert.deepEqual([l4.rowLabels, l4.colLabels], [['00', '01', '11', '10'], ['00', '01', '11', '10']]);
  assert.throws(() => karnaughLayout(5), RangeError);
  assert.throws(() => karnaughLayout(1), RangeError);
});

test('células e mintermos', () => {
  const l4 = karnaughLayout(4);
  // linha "11" (AB = 11) e coluna "10" (CD = 10) é ABCD = 1110 = 14
  assert.equal(cellMinterm(l4, 2, 3), 14);
  assert.deepEqual(mintermCell(l4, 14), { row: 2, col: 3 });
  const l3 = karnaughLayout(3);
  assert.equal(cellMinterm(l3, 1, 2), 7);
  for (let m = 0; m < 16; m++) {
    const { row, col } = mintermCell(l4, m);
    assert.equal(cellMinterm(l4, row, col), m);
  }
});

test('vizinhos no mapa (inclusive pelas bordas) diferem em um único bit', () => {
  for (const n of [2, 3, 4]) {
    const l = karnaughLayout(n);
    const R = l.rowCodes.length;
    const C = l.colCodes.length;
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const m = cellMinterm(l, r, c);
        if (C > 1) assert.equal(popcount(m ^ cellMinterm(l, r, (c + 1) % C)), 1);
        if (R > 1) assert.equal(popcount(m ^ cellMinterm(l, (r + 1) % R, c)), 1);
      }
    }
  }
});

test('trechos cíclicos', () => {
  assert.deepEqual(cyclicRuns([1, 2], 4), [{ start: 1, end: 2, wrapsBefore: false, wrapsAfter: false }]);
  assert.deepEqual(cyclicRuns([0, 3], 4), [
    { start: 0, end: 0, wrapsBefore: true, wrapsAfter: false },
    { start: 3, end: 3, wrapsBefore: false, wrapsAfter: true },
  ]);
  assert.deepEqual(cyclicRuns([0, 1, 2, 3], 4), [{ start: 0, end: 3, wrapsBefore: false, wrapsAfter: false }]);
  assert.deepEqual(cyclicRuns([], 4), []);
});

test("grupo dos quatro cantos (B'D') vira 4 pedaços com as bordas abertas", () => {
  const l4 = karnaughLayout(4);
  const { terms } = minimizeSOP(4, [0, 2, 8, 10]);
  assert.equal(terms.length, 1);
  const cells = groupCells(l4, terms[0]).map((c) => [c.row, c.col]);
  assert.deepEqual(cells, [[0, 0], [0, 3], [3, 0], [3, 3]]);
  const segs = groupSegments(l4, terms[0]);
  assert.equal(segs.length, 4);
  const corner = segs.find((s) => s.r0 === 0 && s.c0 === 0);
  assert.deepEqual(corner.open, { top: true, bottom: false, left: true, right: false });
});

test("grupo que atravessa a borda lateral (C' com 3 variáveis)", () => {
  const l3 = karnaughLayout(3);
  const { terms } = minimizeSOP(3, [0, 2, 4, 6]);
  const segs = groupSegments(l3, terms[0]);
  assert.equal(segs.length, 2);
  assert.deepEqual(segs.map((s) => [s.r0, s.r1, s.c0, s.c1]), [[0, 1, 0, 0], [0, 1, 3, 3]]);
  assert.ok(segs[0].open.left && segs[1].open.right);
});

test("grupo em uma linha inteira (A'B) e no mapa todo (1)", () => {
  const l4 = karnaughLayout(4);
  const row = minimizeSOP(4, [4, 5, 6, 7]).terms[0];
  assert.deepEqual(groupSegments(l4, row).map((s) => [s.r0, s.r1, s.c0, s.c1]), [[1, 1, 0, 3]]);
  const all = minimizeSOP(4, [...Array(16).keys()]).terms[0];
  const segs = groupSegments(l4, all);
  assert.equal(segs.length, 1);
  assert.deepEqual(segs[0].open, { top: false, bottom: false, left: false, right: false });
});

test('grupos da solução mínima cobrem exatamente os 1s', () => {
  const l4 = karnaughLayout(4);
  const ones = [0, 1, 2, 4, 5, 6, 8, 9, 12, 13, 14];
  const { terms } = minimizeSOP(4, ones);
  const covered = new Set(terms.flatMap((t) => groupCells(l4, t).map((c) => c.minterm)));
  assert.deepEqual([...covered].sort((a, b) => a - b), ones);
  for (const t of terms) assert.ok([1, 2, 4, 8, 16].includes(groupCells(l4, t).length));
});

test('valores do mapa com irrelevâncias', () => {
  const l2 = karnaughLayout(2);
  const col = Uint8Array.from([0, 1, 1, 0]);
  assert.deepEqual(mapValues(l2, col, [3]), [['0', '1'], ['1', 'X']]);
});
