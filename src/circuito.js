// Circuito com portas lógicas (E, OU, NÃO) desenhado em SVG a partir da soma de produtos mínima.
// Leiaute em "trilhos": cada variável desce num trilho vertical (e o complemento num trilho
// depois de uma porta NÃO); cada produto é uma porta E e uma porta OU junta os produtos.
import { literalsOf } from './quine.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = (x) => Math.round(x * 10) / 10;

const RAIL = 28; // distância entre trilhos
const LEFT = 24;
const RAIL_TOP = 30;
const FIRST_SLOT = 104;
const AND_W = 40;
const OR_W = 54;
const OR_DEPTH = 9;
const PIN = 14; // distância entre entradas de uma porta
const GAP = 14; // espaço entre portas E

function andPath(x, top, h) {
  const w2 = AND_W / 2;
  return `M${r1(x)},${r1(top)} H${r1(x + w2)} A${w2},${r1(h / 2)} 0 0 1 ${r1(x + w2)},${r1(top + h)} H${r1(x)} Z`;
}

function orPath(x, top, h) {
  const yc = top + h / 2;
  return `M${r1(x)},${r1(top)} Q${r1(x + 2 * OR_DEPTH)},${r1(yc)} ${r1(x)},${r1(top + h)} `
    + `Q${r1(x + OR_W * 0.62)},${r1(top + h)} ${r1(x + OR_W)},${r1(yc)} `
    + `Q${r1(x + OR_W * 0.62)},${r1(top)} ${r1(x)},${r1(top)} Z`;
}

/** Ponto da curva traseira da porta OU na altura y (a curva é uma parábola). */
function orBackX(x, top, h, y) {
  const t = Math.min(1, Math.max(0, (y - top) / h));
  return x + 4 * OR_DEPTH * t * (1 - t);
}

/**
 * Gera o SVG do circuito. `terms` são implicantes { value, mask } (a solução mínima),
 * `vars` os nomes das variáveis. Com `standalone`, inclui fundo branco e cor fixa (para baixar).
 */
export function circuitSVG(terms, vars, { output = 'F', standalone = false, title = '' } = {}) {
  const n = vars.length;
  const head = (w, h, inner) => {
    const label = title || `Circuito lógico de ${output}`;
    const bg = standalone ? `<rect width="100%" height="100%" fill="#ffffff"/>` : '';
    const color = standalone ? ' color="#1b1f24"' : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r1(w)} ${r1(h)}" width="${r1(w)}" height="${r1(h)}"${color} role="img" aria-label="${esc(label)}" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="13">`
      + `<title>${esc(label)}</title>${bg}${inner}</svg>`;
  };

  // Constantes: sem termos é 0; um termo sem literais é 1.
  if (terms.length === 0 || terms.some((t) => literalsOf(t, n).length === 0)) {
    const value = terms.length === 0 ? '0' : '1';
    const note = value === '0' ? 'nível lógico baixo (terra)' : 'nível lógico alto (VCC)';
    const inner = `<text x="16" y="30" fill="currentColor">${esc(value)}</text>`
      + `<line x1="30" y1="25" x2="120" y2="25" stroke="currentColor" stroke-width="2"/>`
      + `<text x="128" y="30" fill="currentColor" font-weight="700">${esc(output)}</text>`
      + `<text x="16" y="56" fill="currentColor" font-size="12">Saída constante: ${note}.</text>`;
    return head(300, 72, inner);
  }

  // Trilhos: só as variáveis (e os complementos) que aparecem na expressão.
  const usePos = new Array(n).fill(false);
  const useNeg = new Array(n).fill(false);
  const lits = terms.map((t) => literalsOf(t, n));
  for (const list of lits) for (const l of list) (l.positive ? usePos : useNeg)[l.index] = true;
  const rails = []; // { index, pos?: x, neg?: x }
  let x = LEFT;
  for (let i = 0; i < n; i++) {
    if (!usePos[i] && !useNeg[i]) continue;
    const rail = { index: i };
    if (usePos[i]) { rail.pos = x; x += RAIL; }
    if (useNeg[i]) { rail.neg = x; x += RAIL; }
    rails.push(rail);
  }
  const railOf = new Map(rails.map((r) => [r.index, r]));
  const xAnd = x + 30;

  // Posições verticais de cada produto.
  const slots = [];
  let y = FIRST_SLOT;
  for (const list of lits) {
    const k = list.length;
    const h = k >= 2 ? Math.max(30, k * PIN) : 18;
    const pins = list.map((_, j) => y + (j + 0.5) * (h / k));
    slots.push({ top: y, h, pins, out: y + h / 2, gate: k >= 2, list });
    y += h + GAP;
  }
  const bottom = y - GAP;
  const parts = [];
  const wire = (x1, y1, x2, y2) => parts.push(`<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="currentColor" stroke-width="1.6"/>`);
  const dot = (cx, cy) => parts.push(`<circle cx="${r1(cx)}" cy="${r1(cy)}" r="3" fill="currentColor"/>`);
  const text = (tx, ty, s, extra = '') => parts.push(`<text x="${r1(tx)}" y="${r1(ty)}" fill="currentColor"${extra}>${esc(s)}</text>`);

  // Entradas, portas NÃO e trilhos.
  for (const rail of rails) {
    const name = vars[rail.index];
    const xin = rail.pos ?? rail.neg;
    text(xin, 18, name, ' text-anchor="middle" font-weight="700"');
    if (rail.pos !== undefined) wire(rail.pos, RAIL_TOP - 6, rail.pos, bottom + 8);
    if (rail.neg !== undefined) {
      const xn = rail.neg;
      if (rail.pos !== undefined) {
        // derivação do trilho direto até a porta NÃO
        dot(rail.pos, 40);
        wire(rail.pos, 40, xn, 40);
      } else {
        wire(xn, RAIL_TOP - 6, xn, 40);
      }
      wire(xn, 40, xn, 48);
      parts.push(`<g><title>${esc(`NÃO ${name}`)}</title><path d="M${r1(xn - 8)},48 L${r1(xn + 8)},48 L${r1(xn)},64 Z" fill="none" stroke="currentColor" stroke-width="1.6"/>`
        + `<circle cx="${r1(xn)}" cy="67.5" r="3.5" fill="none" stroke="currentColor" stroke-width="1.6"/></g>`);
      wire(xn, 71, xn, bottom + 8);
      text(xn + 5, 88, `${name}'`, ' font-size="11"');
    }
  }

  // Portas E (ou ligação direta, para termo de um literal só).
  const outs = [];
  slots.forEach((slot, idx) => {
    const termLabel = slot.list.map((l) => (l.positive ? vars[l.index] : `${vars[l.index]}'`)).join('·');
    if (slot.gate) {
      slot.list.forEach((l, j) => {
        const rail = railOf.get(l.index);
        const rx = l.positive ? rail.pos : rail.neg;
        dot(rx, slot.pins[j]);
        wire(rx, slot.pins[j], xAnd, slot.pins[j]);
      });
      parts.push(`<g><title>${esc(`Porta E ${idx + 1}: ${termLabel}`)}</title><path d="${andPath(xAnd, slot.top, slot.h)}" fill="none" stroke="currentColor" stroke-width="1.8"/></g>`);
      outs.push({ x: xAnd + AND_W, y: slot.out, label: termLabel });
    } else {
      const l = slot.list[0];
      const rail = railOf.get(l.index);
      const rx = l.positive ? rail.pos : rail.neg;
      dot(rx, slot.out);
      outs.push({ x: rx, y: slot.out, label: termLabel });
    }
  });

  let width;
  let height = bottom + 24;
  if (outs.length === 1) {
    const o = outs[0];
    const xEnd = Math.max(o.x, xAnd + AND_W) + 50;
    wire(o.x, o.y, xEnd, o.y);
    text(xEnd + 6, o.y + 5, output, ' font-weight="700"');
    width = xEnd + 40;
  } else {
    const xOr = xAnd + AND_W + 40;
    const yFirst = outs[0].y;
    const yLast = outs[outs.length - 1].y;
    const yc = (yFirst + yLast) / 2;
    const h = Math.min(100, Math.max(44, outs.length * 14));
    const top = yc - h / 2;
    // extensões da entrada da porta OU quando há muitas entradas
    if (yFirst < top) wire(xOr, yFirst, xOr, top);
    if (yLast > top + h) wire(xOr, top + h, xOr, yLast);
    for (const o of outs) {
      const xe = o.y >= top && o.y <= top + h ? orBackX(xOr, top, h, o.y) : xOr;
      wire(o.x, o.y, xe, o.y);
    }
    parts.push(`<g><title>Porta OU</title><path d="${orPath(xOr, top, h)}" fill="none" stroke="currentColor" stroke-width="1.8"/></g>`);
    const xEnd = xOr + OR_W + 34;
    wire(xOr + OR_W, yc, xEnd, yc);
    text(xEnd + 6, yc + 5, output, ' font-weight="700"');
    width = xEnd + 40;
    height = Math.max(height, top + h + 24);
  }
  return head(width, height, parts.join(''));
}

/** Contagem de portas usadas (para o resumo exibido abaixo do circuito). */
export function gateCount(terms, n) {
  const lits = terms.map((t) => literalsOf(t, n));
  const neg = new Set();
  for (const list of lits) for (const l of list) if (!l.positive) neg.add(l.index);
  const and = lits.filter((l) => l.length >= 2).length;
  const or = terms.length >= 2 ? 1 : 0;
  return { not: neg.size, and, or, total: neg.size + and + or };
}
