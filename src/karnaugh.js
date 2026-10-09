// Mapas de Karnaugh de 2 a 4 variáveis: disposição em código Gray e grupos (com "dobra" nas bordas).
import { coversMinterm } from './quine.js';

const GRAY = { 1: [0, 1], 2: [0, 1, 3, 2] };

/**
 * Disposição do mapa. Linhas: primeiras variáveis; colunas: as demais.
 *   2 variáveis: A nas linhas, B nas colunas
 *   3 variáveis: A nas linhas, BC nas colunas
 *   4 variáveis: AB nas linhas, CD nas colunas
 * Vizinhos no mapa diferem em uma única variável (código Gray), inclusive entre as bordas.
 */
export function karnaughLayout(n) {
  if (n < 2 || n > 4) throw new RangeError('O mapa de Karnaugh aqui vai de 2 a 4 variáveis.');
  const rowBits = n === 4 ? 2 : 1;
  const colBits = n - rowBits;
  const rowCodes = GRAY[rowBits];
  const colCodes = GRAY[colBits];
  const bin = (code, bits) => code.toString(2).padStart(bits, '0');
  return {
    n,
    rowBits,
    colBits,
    rowVars: [...Array(rowBits).keys()],
    colVars: [...Array(colBits).keys()].map((i) => i + rowBits),
    rowCodes,
    colCodes,
    rowLabels: rowCodes.map((c) => bin(c, rowBits)),
    colLabels: colCodes.map((c) => bin(c, colBits)),
  };
}

/** Mintermo da célula (linha r, coluna c) do mapa. */
export function cellMinterm(layout, r, c) {
  return (layout.rowCodes[r] << layout.colBits) | layout.colCodes[c];
}

/** Posição (linha, coluna) do mintermo m no mapa. */
export function mintermCell(layout, m) {
  const rowCode = m >> layout.colBits;
  const colCode = m & ((1 << layout.colBits) - 1);
  return { row: layout.rowCodes.indexOf(rowCode), col: layout.colCodes.indexOf(colCode) };
}

/** Células cobertas por um implicante, em ordem de linha e coluna. */
export function groupCells(layout, imp) {
  const cells = [];
  for (let r = 0; r < layout.rowCodes.length; r++) {
    for (let c = 0; c < layout.colCodes.length; c++) {
      const m = cellMinterm(layout, r, c);
      if (coversMinterm(imp, m)) cells.push({ row: r, col: c, minterm: m });
    }
  }
  return cells;
}

/**
 * Divide posições cíclicas em trechos contíguos. Ex.: em 4 posições, {0, 3} vira
 * [{start: 3, end: 3}, {start: 0, end: 0}] com dobra; {0, 1, 2, 3} é um trecho só.
 */
export function cyclicRuns(positions, length) {
  const set = new Set(positions);
  if (set.size === 0) return [];
  if (set.size === length) return [{ start: 0, end: length - 1, wrapsBefore: false, wrapsAfter: false }];
  const runs = [];
  for (let p = 0; p < length; p++) {
    if (set.has(p) && !set.has((p - 1 + length) % length)) {
      let end = p;
      while (set.has((end + 1) % length) && (end + 1) % length !== p) end = (end + 1) % length;
      runs.push({ start: p, end });
    }
  }
  // um trecho que passa da última posição para a primeira é desenhado em dois pedaços
  const out = [];
  for (const run of runs) {
    if (run.end >= run.start) out.push({ start: run.start, end: run.end, wrapsBefore: false, wrapsAfter: false });
    else {
      out.push({ start: run.start, end: length - 1, wrapsBefore: false, wrapsAfter: true });
      out.push({ start: 0, end: run.end, wrapsBefore: true, wrapsAfter: false });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * Retângulos que desenham o grupo no mapa. Um grupo que dobra a borda vira 2 pedaços
 * (ou 4, nos quatro cantos). `open` indica os lados que continuam do outro lado do mapa.
 */
export function groupSegments(layout, imp) {
  const cells = groupCells(layout, imp);
  const rows = [...new Set(cells.map((c) => c.row))];
  const cols = [...new Set(cells.map((c) => c.col))];
  const rowRuns = cyclicRuns(rows, layout.rowCodes.length);
  const colRuns = cyclicRuns(cols, layout.colCodes.length);
  const segments = [];
  for (const rr of rowRuns) {
    for (const cr of colRuns) {
      segments.push({
        r0: rr.start,
        r1: rr.end,
        c0: cr.start,
        c1: cr.end,
        open: { top: rr.wrapsBefore, bottom: rr.wrapsAfter, left: cr.wrapsBefore, right: cr.wrapsAfter },
      });
    }
  }
  return segments;
}

/** Valor exibido em cada célula: "1", "0" ou "X" (irrelevante). */
export function mapValues(layout, column, dontCares = []) {
  const dc = new Set(dontCares);
  return layout.rowCodes.map((_, r) => layout.colCodes.map((__, c) => {
    const m = cellMinterm(layout, r, c);
    if (dc.has(m)) return 'X';
    return column[m] ? '1' : '0';
  }));
}
