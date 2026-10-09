// Minimização pelo método de Quine-McCluskey, com a cobertura escolhida pelo método de Petrick.
//
// Um implicante é um par { value, mask }: os bits ligados em `mask` são os "traços"
// (variáveis eliminadas) e `value` guarda os bits fixos, sempre com 0 nas posições do traço.
// A variável 0 é o bit mais significativo, como nos índices dos mintermos.

/** Limite de produtos durante a expansão de Petrick; acima disso, usamos busca exata. */
export const PETRICK_LIMIT = 2000;
/** Limite de nós da busca exata (ramificação e poda). */
export const SEARCH_LIMIT = 300000;

export function popcount(x) {
  let c = 0;
  let v = x;
  while (v) {
    v &= v - 1;
    c++;
  }
  return c;
}

function popcountBig(x) {
  let c = 0;
  let v = x;
  while (v) {
    v &= v - 1n;
    c++;
  }
  return c;
}

const keyOf = (value, mask) => mask * 2048 + value;

/** Padrão do implicante com traços: por exemplo "1-0-". */
export function patternOf(imp, n) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const bit = 1 << (n - 1 - i);
    s += imp.mask & bit ? '-' : imp.value & bit ? '1' : '0';
  }
  return s;
}

/** Número de literais do termo (variáveis que não foram eliminadas). */
export function literalCount(imp, n) {
  return n - popcount(imp.mask);
}

/** O implicante cobre o mintermo m? */
export function coversMinterm(imp, m) {
  return (m & ~imp.mask) === imp.value;
}

function mergeSorted(a, b) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (j >= b.length || (i < a.length && a[i] < b[j])) out.push(a[i++]);
    else out.push(b[j++]);
  }
  return out;
}

function compareArrays(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

function sortedUnique(list, size) {
  const set = new Set();
  for (const x of list) {
    if (!Number.isInteger(x) || x < 0 || x >= size) {
      throw new RangeError(`Índice de mintermo inválido: ${x} (com estas variáveis vai de 0 a ${size - 1}).`);
    }
    set.add(x);
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * Executa Quine-McCluskey completo.
 * Devolve as colunas de combinação, os implicantes primos, a tabela de cobertura,
 * os essenciais, a etapa de Petrick e as soluções mínimas (menos termos e, depois, menos literais).
 */
export function quineMcCluskey(n, minterms, dontCares = []) {
  if (!Number.isInteger(n) || n < 0 || n > 10) throw new RangeError('O número de variáveis deve ir de 0 a 10.');
  const size = 1 << n;
  const ones = sortedUnique(minterms, size);
  const onesSet = new Set(ones);
  const dcs = sortedUnique(dontCares, size).filter((d) => !onesSet.has(d));

  const result = {
    n,
    minterms: ones,
    dontCares: dcs,
    columns: [],
    primes: [],
    onlyDontCarePrimes: 0,
    coverers: new Map(),
    essentials: [],
    essentialBecause: new Map(),
    remaining: [],
    petrick: null,
    search: null,
    method: 'constante',
    exact: true,
    solutions: [],
    solution: [],
  };
  if (ones.length === 0) {
    result.solutions = [[]];
    return result;
  }

  // 1. Combinação sucessiva: dois termos com a mesma máscara que diferem em um único bit
  //    viram um termo com traço naquele bit. Termos que nunca combinam são primos.
  let current = new Map();
  for (const m of [...ones, ...dcs].sort((a, b) => a - b)) {
    current.set(keyOf(m, 0), { value: m, mask: 0, covers: [m], used: false });
  }
  const allPrimes = [];
  while (current.size > 0) {
    const terms = [...current.values()].sort(
      (a, b) => popcount(a.value) - popcount(b.value) || compareArrays(a.covers, b.covers),
    );
    result.columns.push(terms);
    const next = new Map();
    for (const t of terms) {
      for (let b = 0; b < n; b++) {
        const bit = 1 << b;
        if ((t.mask & bit) || (t.value & bit)) continue;
        const partner = current.get(keyOf(t.value | bit, t.mask));
        if (!partner) continue;
        t.used = true;
        partner.used = true;
        const k = keyOf(t.value, t.mask | bit);
        if (!next.has(k)) {
          next.set(k, { value: t.value, mask: t.mask | bit, covers: mergeSorted(t.covers, partner.covers), used: false });
        }
      }
    }
    for (const t of terms) if (!t.used) allPrimes.push(t);
    current = next;
  }

  // 2. Implicantes primos que cobrem ao menos um mintermo (os que só cobrem irrelevâncias são inúteis).
  const useful = allPrimes.filter((p) => p.covers.some((m) => onesSet.has(m)));
  result.onlyDontCarePrimes = allPrimes.length - useful.length;
  useful.sort((a, b) => popcount(b.mask) - popcount(a.mask) || compareArrays(a.covers, b.covers));
  const primes = useful.map((p, i) => ({
    value: p.value,
    mask: p.mask,
    covers: p.covers,
    coversOnes: p.covers.filter((m) => onesSet.has(m)),
    label: `P${i + 1}`,
    literals: literalCount(p, n),
  }));
  result.primes = primes;

  // 3. Tabela de implicantes primos: quem cobre cada mintermo.
  const coverers = new Map(ones.map((m) => [m, []]));
  primes.forEach((p, i) => p.coversOnes.forEach((m) => coverers.get(m).push(i)));
  result.coverers = coverers;

  // 4. Essenciais: único primo que cobre algum mintermo.
  const essential = new Set();
  for (const m of ones) {
    const list = coverers.get(m);
    if (list.length === 1) {
      const p = list[0];
      essential.add(p);
      if (!result.essentialBecause.has(p)) result.essentialBecause.set(p, []);
      result.essentialBecause.get(p).push(m);
    }
  }
  result.essentials = [...essential].sort((a, b) => a - b);
  const covered = new Set();
  for (const p of result.essentials) for (const m of primes[p].coversOnes) covered.add(m);
  result.remaining = ones.filter((m) => !covered.has(m));

  if (result.remaining.length === 0) {
    result.method = 'essenciais';
    result.solutions = [result.essentials.slice()];
    result.solution = result.solutions[0];
    return result;
  }

  // 5. Petrick para os mintermos restantes.
  const pet = petrick(result.remaining, coverers, primes);
  result.petrick = pet;
  let picks;
  if (!pet.overflow) {
    result.method = 'petrick';
    picks = pet.minimal;
  } else {
    const search = exactCover(result.remaining, coverers, primes);
    result.search = search;
    result.method = 'busca';
    result.exact = search.exact;
    picks = [search.best];
  }
  result.solutions = picks.map((extra) => [...result.essentials, ...extra].sort((a, b) => a - b));
  result.solution = result.solutions[0];
  return result;
}

function costOf(indices, primes) {
  let lits = 0;
  for (const i of indices) lits += primes[i].literals;
  return [indices.length, lits];
}

const better = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

function bitsToIndices(bits) {
  const out = [];
  let i = 0;
  let v = bits;
  while (v) {
    if (v & 1n) out.push(i);
    v >>= 1n;
    i++;
  }
  return out;
}

/** Remove produtos que contêm outro produto (absorção: X + XY = X) e repetidos. */
function absorb(list) {
  const uniq = [...new Set(list)].map((bits) => ({ bits, count: popcountBig(bits) }));
  uniq.sort((a, b) => a.count - b.count || (a.bits < b.bits ? -1 : a.bits > b.bits ? 1 : 0));
  const kept = [];
  for (const cand of uniq) {
    if (!kept.some((k) => (k.bits & cand.bits) === k.bits)) kept.push(cand);
  }
  return kept.map((k) => k.bits);
}

/**
 * Método de Petrick: cada mintermo restante vira uma soma dos primos que o cobrem;
 * o produto dessas somas, expandido com absorção, lista todas as coberturas irredundantes.
 */
function petrick(remaining, coverers, primes) {
  const raw = remaining.map((m) => ({ minterm: m, primes: coverers.get(m).slice() }));
  // Somas repetidas ou que contêm outra soma inteira são redundantes: X(X + Y) = X.
  const byKey = new Map();
  for (const c of raw) {
    const k = c.primes.join(',');
    if (!byKey.has(k)) byKey.set(k, { primes: c.primes, minterms: [] });
    byKey.get(k).minterms.push(c.minterm);
  }
  const uniq = [...byKey.values()];
  const isStrictSubset = (a, b) => a.length < b.length && a.every((x) => b.includes(x));
  const clauses = uniq.filter((c) => !uniq.some((d) => isStrictSubset(d.primes, c.primes)));
  clauses.sort((a, b) => a.primes.length - b.primes.length || compareArrays(a.primes, b.primes));

  let products = [0n];
  const steps = [];
  for (const clause of clauses) {
    const out = [];
    for (const p of products) {
      if (clause.primes.some((i) => (p >> BigInt(i)) & 1n)) {
        out.push(p);
        continue;
      }
      for (const i of clause.primes) out.push(p | (1n << BigInt(i)));
    }
    products = absorb(out);
    steps.push({ clause: clause.primes, count: products.length, products: products.length <= 40 ? products.map(bitsToIndices) : null });
    if (products.length > PETRICK_LIMIT) {
      return { clauses: raw, reduced: clauses, steps, overflow: true, products: null, minimal: [] };
    }
  }
  const all = products.map(bitsToIndices);
  let best = null;
  for (const p of all) {
    const c = costOf(p, primes);
    if (!best || better(c, best)) best = c;
  }
  const minimal = all
    .filter((p) => {
      const c = costOf(p, primes);
      return c[0] === best[0] && c[1] === best[1];
    })
    .sort(compareArrays);
  return { clauses: raw, reduced: clauses, steps, overflow: false, products: all, minimal };
}

/**
 * Cobertura mínima por ramificação e poda, usada só quando a expansão de Petrick fica grande demais.
 * Ramifica sempre no mintermo com menos primos candidatos.
 */
function exactCover(remaining, coverers, primes) {
  // solução gulosa inicial: maior cobertura nova, depois menos literais
  const greedy = [];
  const left = new Set(remaining);
  while (left.size) {
    let pick = -1;
    let gain = -1;
    for (let i = 0; i < primes.length; i++) {
      const g = primes[i].coversOnes.reduce((s, m) => s + (left.has(m) ? 1 : 0), 0);
      if (g > gain || (g === gain && g > 0 && primes[i].literals < primes[pick].literals)) {
        pick = i;
        gain = g;
      }
    }
    greedy.push(pick);
    for (const m of primes[pick].coversOnes) left.delete(m);
  }
  let best = greedy.slice().sort((a, b) => a - b);
  let bestCost = costOf(best, primes);
  const maxCover = Math.max(...primes.map((p) => p.coversOnes.length));
  let nodes = 0;
  let exact = true;
  const chosen = [];

  const rec = (uncovered, count, lits) => {
    if (!exact) return;
    if (++nodes > SEARCH_LIMIT) {
      exact = false;
      return;
    }
    if (uncovered.size === 0) {
      if (better([count, lits], bestCost)) {
        best = chosen.slice().sort((a, b) => a - b);
        bestCost = [count, lits];
      }
      return;
    }
    const lower = count + Math.ceil(uncovered.size / maxCover);
    if (lower > bestCost[0]) return;
    let pickList = null;
    for (const m of uncovered) {
      const list = coverers.get(m);
      if (!pickList || list.length < pickList.length) pickList = list;
    }
    const gainOf = (i) => primes[i].coversOnes.reduce((s, m) => s + (uncovered.has(m) ? 1 : 0), 0);
    const ordered = pickList.slice().sort((a, b) => gainOf(b) - gainOf(a) || primes[a].literals - primes[b].literals);
    for (const i of ordered) {
      const next = new Set(uncovered);
      for (const m of primes[i].coversOnes) next.delete(m);
      chosen.push(i);
      rec(next, count + 1, lits + primes[i].literals);
      chosen.pop();
    }
  };
  rec(new Set(remaining), 0, 0);
  if (!exact) best = dropRedundant(best, remaining, primes);
  return { best, exact, nodes, greedy: greedy.slice().sort((a, b) => a - b) };
}

/** Remove primos dispensáveis (os de mais literais primeiro) enquanto o resto ainda cobre tudo. */
function dropRedundant(chosen, remaining, primes) {
  let keep = chosen.slice();
  const order = keep.slice().sort((a, b) => primes[b].literals - primes[a].literals || b - a);
  for (const i of order) {
    const others = keep.filter((x) => x !== i);
    const covered = new Set(others.flatMap((x) => primes[x].coversOnes));
    if (remaining.every((m) => covered.has(m))) keep = others;
  }
  return keep.sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Atalhos para a forma mínima em soma de produtos (SOP) e em produto de somas (POS)

/** Soma de produtos mínima: Quine-McCluskey sobre os mintermos (uns) da função. */
export function minimizeSOP(n, minterms, dontCares = []) {
  const qm = quineMcCluskey(n, minterms, dontCares);
  return { qm, terms: qm.solution.map((i) => qm.primes[i]) };
}

/**
 * Produto de somas mínimo: minimiza o complemento (os zeros) e aplica De Morgan.
 * Cada implicante de f' vira uma cláusula de f com os literais trocados.
 */
export function minimizePOS(n, maxterms, dontCares = []) {
  const qm = quineMcCluskey(n, maxterms, dontCares);
  return { qm, clauses: qm.solution.map((i) => qm.primes[i]) };
}

/** Literais do implicante: [{ index, positive }] na ordem das variáveis. */
export function literalsOf(imp, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const bit = 1 << (n - 1 - i);
    if (!(imp.mask & bit)) out.push({ index: i, positive: Boolean(imp.value & bit) });
  }
  return out;
}

const TXT = {
  logica: { neg: (v) => `¬${v}`, and: ' ∧ ', or: ' ∨ ' },
  digital: { neg: (v) => `${v}'`, and: '·', or: ' + ' },
  ascii: { neg: (v) => `~${v}`, and: ' & ', or: ' | ' },
};

/** Produto de literais do implicante (para SOP). Sem literais, vale 1. */
export function termText(imp, vars, style = 'logica') {
  const s = TXT[style] || TXT.logica;
  const lits = literalsOf(imp, vars.length).map((l) => (l.positive ? vars[l.index] : s.neg(vars[l.index])));
  return lits.length ? lits.join(s.and) : '1';
}

/** Cláusula de POS a partir de um implicante do complemento (De Morgan). Sem literais, vale 0. */
export function clauseText(imp, vars, style = 'logica') {
  const s = TXT[style] || TXT.logica;
  const lits = literalsOf(imp, vars.length).map((l) => (l.positive ? s.neg(vars[l.index]) : vars[l.index]));
  return lits.length ? lits.join(s.or) : '0';
}

/** Soma de produtos. Lista vazia é a constante 0. */
export function sopText(terms, vars, style = 'logica') {
  if (terms.length === 0) return '0';
  const s = TXT[style] || TXT.logica;
  const parts = terms.map((t) => termText(t, vars, style));
  if (parts.length === 1) return parts[0];
  return parts.map((p, i) => (style !== 'digital' && literalsOf(terms[i], vars.length).length > 1 ? `(${p})` : p)).join(s.or);
}

/** Produto de somas. Lista vazia é a constante 1. */
export function posText(clauses, vars, style = 'logica') {
  if (clauses.length === 0) return '1';
  const s = TXT[style] || TXT.logica;
  const parts = clauses.map((c) => clauseText(c, vars, style));
  if (parts.length === 1) return parts[0];
  return parts.map((p, i) => (literalsOf(clauses[i], vars.length).length > 1 ? `(${p})` : p)).join(s.and);
}

/** Valores da soma de produtos em todas as 2^n linhas. */
export function sopColumn(terms, n) {
  const out = new Uint8Array(1 << n);
  for (let r = 0; r < out.length; r++) out[r] = terms.some((t) => coversMinterm(t, r)) ? 1 : 0;
  return out;
}

/** Valores do produto de somas (cláusulas vindas dos implicantes do complemento). */
export function posColumn(clauses, n) {
  const out = new Uint8Array(1 << n);
  for (let r = 0; r < out.length; r++) out[r] = clauses.some((c) => coversMinterm(c, r)) ? 0 : 1;
  return out;
}

/** A coluna coincide com a original em todas as linhas que importam (fora das irrelevâncias)? */
export function agreesOnCare(column, target, dontCares = []) {
  const dc = new Set(dontCares);
  for (let r = 0; r < target.length; r++) {
    if (!dc.has(r) && column[r] !== target[r]) return false;
  }
  return true;
}

/** Custo da solução: número de termos e total de literais. */
export function solutionCost(terms, n) {
  return { terms: terms.length, literals: terms.reduce((s, t) => s + literalCount(t, n), 0) };
}
