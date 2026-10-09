import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/expressao.js';
import { truthTable } from '../src/tabela.js';
import {
  agreesOnCare, coversMinterm, literalCount, minimizePOS, minimizeSOP, patternOf, posColumn,
  posText, quineMcCluskey, solutionCost, sopColumn, sopText,
} from '../src/quine.js';

const V4 = ['A', 'B', 'C', 'D'];

function columnOf(n, ones) {
  const col = new Uint8Array(1 << n);
  for (const m of ones) col[m] = 1;
  return col;
}

function solutionTexts(qm, vars, style = 'digital') {
  return qm.solutions.map((s) => sopText(s.map((i) => qm.primes[i]), vars, style)).sort();
}

/** Confere que a cobertura reproduz a função e que cada termo é implicante primo. */
function assertValidCover(n, ones, dcs, terms) {
  const target = columnOf(n, ones);
  const dc = new Set(dcs);
  assert.ok(agreesOnCare(sopColumn(terms, n), target, dcs), 'a soma de produtos deve igualar a função');
  for (const t of terms) {
    for (let m = 0; m < 1 << n; m++) {
      if (coversMinterm(t, m)) assert.ok(target[m] || dc.has(m), `termo ${patternOf(t, n)} cobre o zero ${m}`);
    }
    // primo: tirar qualquer literal faz o termo cobrir algum zero
    for (let b = 0; b < n; b++) {
      const bit = 1 << b;
      if (t.mask & bit) continue;
      const bigger = { value: t.value & ~bit, mask: t.mask | bit };
      let coversZero = false;
      for (let m = 0; m < 1 << n; m++) if (coversMinterm(bigger, m) && !target[m] && !dc.has(m)) coversZero = true;
      assert.ok(coversZero, `termo ${patternOf(t, n)} não é primo`);
    }
  }
}

test('exemplo clássico com irrelevâncias: duas soluções mínimas', () => {
  const qm = quineMcCluskey(4, [4, 8, 10, 11, 12, 15], [9, 14]);
  assert.deepEqual(qm.primes.map((p) => patternOf(p, 4)), ['10--', '1--0', '1-1-', '-100']);
  assert.deepEqual(qm.essentials.map((i) => patternOf(qm.primes[i], 4)), ['1-1-', '-100']);
  assert.deepEqual(qm.remaining, [8]);
  assert.equal(qm.method, 'petrick');
  assert.deepEqual(solutionTexts(qm, V4), ["A·B' + A·C + B·C'·D'", "A·D' + A·C + B·C'·D'"]);
  assert.deepEqual(solutionCost(qm.solution.map((i) => qm.primes[i]), 4), { terms: 3, literals: 7 });
});

test('função cíclica: sem essenciais, Petrick acha as duas coberturas de 3 termos', () => {
  const qm = quineMcCluskey(3, [0, 1, 2, 5, 6, 7]);
  assert.equal(qm.primes.length, 6);
  assert.deepEqual(qm.essentials, []);
  assert.equal(qm.method, 'petrick');
  assert.deepEqual(solutionTexts(qm, ['A', 'B', 'C']), ["A'·B' + B·C' + A·C", "A'·C' + B'·C + A·B"]);
  // a expansão final lista as coberturas irredundantes (2 de 3 termos e 3 de 4 termos)
  const sizes = qm.petrick.products.map((p) => p.length).sort();
  assert.deepEqual(sizes, [3, 3, 4, 4, 4]);
});

test('exemplos de livro-texto', () => {
  const a = quineMcCluskey(4, [0, 1, 2, 4, 5, 6, 8, 9, 12, 13, 14]);
  assert.deepEqual(solutionTexts(a, ['w', 'x', 'y', 'z']), ["y' + w'·z' + x·z'"]);
  const b = quineMcCluskey(4, [0, 1, 2, 5, 8, 9, 10]);
  assert.deepEqual(solutionTexts(b, V4), ["B'·C' + B'·D' + A'·C'·D"]);
  const c = quineMcCluskey(4, [0, 2, 8, 10]);
  assert.deepEqual(solutionTexts(c, V4), ["B'·D'"]);
  const d = quineMcCluskey(4, [1, 3, 7, 11, 15], [0, 2, 5]);
  assert.deepEqual(solutionTexts(d, ['w', 'x', 'y', 'z']), ["w'·x' + y·z", "w'·z + y·z"]);
});

test('ou exclusivo de 4 variáveis não simplifica', () => {
  const qm = quineMcCluskey(4, [1, 2, 4, 7, 8, 11, 13, 14]);
  assert.equal(qm.primes.length, 8);
  assert.equal(qm.essentials.length, 8);
  assert.equal(qm.solution.length, 8);
  assert.ok(qm.primes.every((p) => literalCount(p, 4) === 4));
});

test('constantes e casos-limite', () => {
  const zero = minimizeSOP(3, []);
  assert.equal(sopText(zero.terms, ['A', 'B', 'C']), '0');
  const one = minimizeSOP(2, [0, 1, 2, 3]);
  assert.equal(sopText(one.terms, ['A', 'B']), '1');
  const none = minimizeSOP(0, [0]);
  assert.equal(sopText(none.terms, []), '1');
  const onlyDc = quineMcCluskey(2, [], [1, 2]);
  assert.deepEqual(onlyDc.solution, []);
  assert.throws(() => quineMcCluskey(2, [4]), RangeError);
  assert.throws(() => quineMcCluskey(11, []), RangeError);
});

test('minimização da expressão do consenso', () => {
  const t = truthTable(parse('(A ∧ B) ∨ (¬A ∧ C) ∨ (B ∧ C)'));
  const { terms } = minimizeSOP(t.n, t.minterms);
  assert.equal(sopText(terms, t.vars), '(¬A ∧ C) ∨ (A ∧ B)');
  const pos = minimizePOS(t.n, t.maxterms);
  assert.equal(posText(pos.clauses, t.vars, 'digital'), "(A + C)·(A' + B)");
  assert.deepEqual([...posColumn(pos.clauses, 3)], [...t.result]);
});

// gerador com semente fixa (mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bruteMinimumOverCubes(n, ones) {
  // todos os 3^n cubos que são implicantes; procura o menor conjunto (termos, depois literais)
  const target = columnOf(n, ones);
  const cubes = [];
  for (let mask = 0; mask < 1 << n; mask++) {
    for (let value = 0; value < 1 << n; value++) {
      if (value & mask) continue;
      const cube = { value, mask };
      let ok = true;
      for (let m = 0; m < 1 << n && ok; m++) if (coversMinterm(cube, m) && !target[m]) ok = false;
      if (ok) cubes.push(cube);
    }
  }
  if (ones.length === 0) return { terms: 0, literals: 0 };
  let best = null;
  const need = (1 << (1 << n)) - 1;
  const onesMask = ones.reduce((s, m) => s | (1 << m), 0);
  const coverMask = cubes.map((c) => {
    let s = 0;
    for (let m = 0; m < 1 << n; m++) if (coversMinterm(c, m)) s |= 1 << m;
    return s;
  });
  const lits = cubes.map((c) => literalCount(c, n));
  for (let k = 1; k <= 4 && !best; k++) {
    const idx = [];
    const rec = (start, covered, litSum) => {
      if (idx.length === k) {
        if ((covered & onesMask) === onesMask && (!best || litSum < best.literals)) best = { terms: k, literals: litSum };
        return;
      }
      for (let i = start; i < cubes.length; i++) {
        idx.push(i);
        rec(i + 1, covered | coverMask[i], litSum + lits[i]);
        idx.pop();
      }
    };
    rec(0, 0, 0);
  }
  assert.ok(need > 0);
  return best;
}

test('todas as 256 funções de 3 variáveis: custo igual ao da força bruta', () => {
  for (let f = 0; f < 256; f++) {
    const ones = [];
    for (let m = 0; m < 8; m++) if (f & (1 << m)) ones.push(m);
    const { qm, terms } = minimizeSOP(3, ones);
    assertValidCover(3, ones, [], terms);
    const cost = solutionCost(terms, 3);
    const best = bruteMinimumOverCubes(3, ones);
    assert.deepEqual(cost, best, `função ${f}`);
    assert.ok(qm.exact);
  }
});

function bruteOverPrimes(qm) {
  const k = qm.primes.length;
  let best = null;
  for (let s = 1; s < 1 << k; s++) {
    const chosen = [];
    for (let i = 0; i < k; i++) if (s & (1 << i)) chosen.push(i);
    const covered = new Set(chosen.flatMap((i) => qm.primes[i].coversOnes));
    if (!qm.minterms.every((m) => covered.has(m))) continue;
    const lits = chosen.reduce((sum, i) => sum + qm.primes[i].literals, 0);
    if (!best || chosen.length < best.terms || (chosen.length === best.terms && lits < best.literals)) best = { terms: chosen.length, literals: lits };
  }
  return best;
}

test('funções aleatórias de 4 variáveis com irrelevâncias: mínimo confere com busca exaustiva', () => {
  const rand = rng(42);
  let checked = 0;
  for (let i = 0; i < 300; i++) {
    const ones = [];
    const dcs = [];
    for (let m = 0; m < 16; m++) {
      const x = rand();
      if (x < 0.45) ones.push(m);
      else if (x < 0.55) dcs.push(m);
    }
    const { qm, terms } = minimizeSOP(4, ones, dcs);
    assertValidCover(4, ones, dcs, terms);
    if (ones.length && qm.primes.length <= 16) {
      assert.deepEqual(solutionCost(terms, 4), bruteOverPrimes(qm));
      checked++;
    }
  }
  assert.ok(checked > 250);
});

test('funções aleatórias de 5 a 7 variáveis: cobertura sempre igual à original (SOP e POS)', () => {
  const rand = rng(1234);
  for (let i = 0; i < 60; i++) {
    const n = 5 + (i % 3);
    const ones = [];
    const zeros = [];
    const dcs = [];
    const p = 0.2 + rand() * 0.6;
    for (let m = 0; m < 1 << n; m++) {
      const x = rand();
      if (x < 0.05) dcs.push(m);
      else if (x < p) ones.push(m);
      else zeros.push(m);
    }
    const target = columnOf(n, ones);
    const { qm, terms } = minimizeSOP(n, ones, dcs);
    assertValidCover(n, ones, dcs, terms);
    assert.ok(['essenciais', 'petrick', 'busca'].includes(qm.method));
    const pos = minimizePOS(n, zeros, dcs);
    assert.ok(agreesOnCare(posColumn(pos.clauses, n), target, dcs), 'produto de somas deve igualar a função');
  }
});

test('quando a expansão de Petrick explode, a busca exata assume e a resposta continua correta', () => {
  const rand = rng(99);
  const n = 8;
  const ones = [];
  for (let m = 0; m < 1 << n; m++) if (rand() < 0.5) ones.push(m);
  const { qm, terms } = minimizeSOP(n, ones);
  assert.equal(qm.method, 'busca');
  assert.ok(qm.petrick.overflow);
  assertValidCover(n, ones, [], terms);
  // a busca nunca é pior que a solução gulosa inicial
  assert.ok(qm.search.best.length <= qm.search.greedy.length);
});

test('cobertura de busca interrompida não tem primo sobrando', () => {
  const rand = rng(2468);
  let inexact = 0;
  for (let k = 0; k < 12; k++) {
    const n = 7 + (k % 2);
    const ones = [];
    for (let m = 0; m < 1 << n; m++) if (rand() < 0.5) ones.push(m);
    const { qm, terms } = minimizeSOP(n, ones);
    assertValidCover(n, ones, [], terms);
    if (qm.method !== 'busca' || qm.exact) continue;
    inexact++;
    // tirar qualquer termo deixa algum mintermo descoberto
    for (let i = 0; i < terms.length; i++) {
      const others = terms.filter((_, j) => j !== i);
      const col = sopColumn(others, n);
      assert.ok(ones.some((m) => !col[m]), `o termo ${patternOf(terms[i], n)} era dispensável`);
    }
  }
  assert.ok(inexact > 0, 'o teste precisa exercitar buscas interrompidas');
});

test('a forma mínima de uma expressão digitada é equivalente a ela (texto relido)', () => {
  for (const src of ['p ⊕ q ⊕ r', '(p → q) ∧ (q → r)', '¬(a ∧ b) ∨ (c ↔ d)', 'x ∨ y ∧ z ↔ (x ∨ y) ∧ (x ∨ z)']) {
    const t = truthTable(parse(src));
    const { terms } = minimizeSOP(t.n, t.minterms);
    for (const style of ['logica', 'digital', 'ascii']) {
      const again = truthTable(parse(sopText(terms, t.vars, style)), { vars: t.vars });
      assert.deepEqual([...again.result], [...t.result], `${src} (${style})`);
    }
    const pos = minimizePOS(t.n, t.maxterms);
    const back = truthTable(parse(posText(pos.clauses, t.vars)), { vars: t.vars });
    assert.deepEqual([...back.result], [...t.result], `POS de ${src}`);
  }
});
