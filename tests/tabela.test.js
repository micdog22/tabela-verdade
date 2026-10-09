import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/expressao.js';
import {
  canonicalCNF, canonicalDNF, classify, compareExpressions, maxtermText, mintermText,
  parseIndexList, piNotation, rowValues, sigmaNotation, tableToCSV, truthTable,
} from '../src/tabela.js';

const table = (src, opts) => truthTable(parse(src), opts);
const kind = (src) => classify(table(src).result).kind;

test('tabela do condicional segue a ordem dos mintermos', () => {
  const t = table('p → q');
  assert.deepEqual(t.vars, ['p', 'q']);
  assert.deepEqual([...t.result], [1, 1, 0, 1]);
  assert.deepEqual(t.minterms, [0, 1, 3]);
  assert.deepEqual(t.maxterms, [2]);
  assert.deepEqual(rowValues(2, 2), [1, 0]);
});

test('colunas intermediárias sem repetição, filhos antes dos pais', () => {
  const t = table('(p → q) ∧ ¬q → ¬p');
  assert.deepEqual(t.columns.map((c) => c.label), ['p → q', '¬q', '(p → q) ∧ ¬q', '¬p']);
  const t2 = table('(p ∧ q) ∨ (p ∧ q)');
  assert.deepEqual(t2.columns.map((c) => c.label), ['p ∧ q']);
  assert.deepEqual(table('p ∨ q', { intermediate: false }).columns, []);
});

test('classificação: tautologias clássicas', () => {
  for (const src of [
    'p ∨ ¬p',
    '¬(p ∧ q) ↔ (¬p ∨ ¬q)',
    '(p ∧ (p → q)) → q',
    '((p → q) ∧ ¬q) → ¬p',
    '(p → q) ∧ (q → r) → (p → r)',
    '((p ∨ q) ∧ ¬p) → q',
    'p → (q → p)',
    '(p → q) ↔ (¬q → ¬p)',
    '1',
  ]) assert.equal(kind(src), 'tautologia', src);
});

test('classificação: contradições e contingências', () => {
  for (const src of ['p ∧ ¬p', '(p ↔ q) ∧ (p ⊕ q)', '¬(p → p)', '0']) assert.equal(kind(src), 'contradicao', src);
  for (const src of ['p', 'p → q', 'p ⊕ q ⊕ r', '(p → q) → p']) assert.equal(kind(src), 'contingencia', src);
  const c = classify(table('p ∧ q').result);
  assert.deepEqual([c.trueRows, c.falseRows, c.total], [1, 3, 4]);
});

test('equivalências conhecidas', () => {
  const pairs = [
    ['p → q', '¬q → ¬p'],
    ['p → q', '¬p ∨ q'],
    ['¬(p ∨ q)', '¬p ∧ ¬q'],
    ['p ∧ (q ∨ r)', '(p ∧ q) ∨ (p ∧ r)'],
    ['p ∨ (p ∧ q)', 'p'],
    ['p ↔ q', '(p → q) ∧ (q → p)'],
    ['p ⊕ q', '¬(p ↔ q)'],
    ['(p ∧ q) → r', 'p → (q → r)'],
  ];
  for (const [a, b] of pairs) {
    const r = compareExpressions(parse(a), parse(b));
    assert.ok(r.equivalent, `${a} ≡ ${b}`);
    assert.equal(r.counterexample, null);
    assert.ok(r.aImpliesB && r.bImpliesA);
  }
});

test('não equivalência traz contraexemplo e implicações', () => {
  const r = compareExpressions(parse('p → q'), parse('q → p'));
  assert.equal(r.equivalent, false);
  assert.deepEqual(r.counterexample, { row: 1, values: [0, 1], a: 1, b: 0 });
  assert.equal(r.differences, 2);
  assert.equal(r.aImpliesB, false);
  assert.equal(r.bImpliesA, false);

  const s = compareExpressions(parse('p ∧ q'), parse('p ∨ q'));
  assert.equal(s.equivalent, false);
  assert.equal(s.aImpliesB, true);
  assert.equal(s.bImpliesA, false);
});

test('comparação usa a união das variáveis', () => {
  const r = compareExpressions(parse('p ∨ (q ∧ ¬q)'), parse('p'));
  assert.deepEqual(r.vars, ['p', 'q']);
  assert.ok(r.equivalent);
  const s = compareExpressions(parse('p'), parse('q'));
  assert.deepEqual(s.counterexample.values, [0, 1]);
});

test('formas canônicas FND e FNC', () => {
  const t = table('p → q');
  assert.equal(canonicalDNF(t.vars, t.minterms), '(¬p ∧ ¬q) ∨ (¬p ∧ q) ∨ (p ∧ q)');
  assert.equal(canonicalCNF(t.vars, t.maxterms), '¬p ∨ q');
  assert.equal(canonicalDNF(t.vars, t.minterms, 'digital'), "p'·q' + p'·q + p·q");
  assert.equal(mintermText(5, ['A', 'B', 'C']), 'A ∧ ¬B ∧ C');
  assert.equal(maxtermText(5, ['A', 'B', 'C']), '¬A ∨ B ∨ ¬C');
  assert.equal(canonicalDNF(['p'], []), '0');
  assert.equal(canonicalCNF(['p'], []), '1');
  assert.equal(sigmaNotation([1, 3, 5]), 'Σm(1, 3, 5)');
  assert.equal(sigmaNotation([1], [2]), 'Σm(1) + d(2)');
  assert.equal(piNotation([0, 2]), 'ΠM(0, 2)');
});

test('FND e FNC canônicas são equivalentes à expressão original', () => {
  for (const src of ['p ⊕ q ⊕ r', '(p → q) ∧ (r ∨ ¬p)', 'p ↔ (q ∧ r)', 'a ∨ b ∨ c ∨ d', '¬(x ∧ y) → z']) {
    const ast = parse(src);
    const t = truthTable(ast);
    for (const style of ['logica', 'digital', 'ascii']) {
      const fnd = parse(canonicalDNF(t.vars, t.minterms, style));
      const fnc = parse(canonicalCNF(t.vars, t.maxterms, style));
      assert.ok(compareExpressions(ast, fnd).equivalent, `FND ${style} de ${src}`);
      assert.ok(compareExpressions(ast, fnc).equivalent, `FNC ${style} de ${src}`);
    }
  }
});

test('CSV com ponto e vírgula, nas duas ordens e notações', () => {
  const t = table('p ∧ q', { intermediate: false });
  assert.equal(tableToCSV(t), 'p;q;p ∧ q\r\nV;V;V\r\nV;F;F\r\nF;V;F\r\nF;F;F\r\n');
  assert.equal(tableToCSV(t, { values: '10', firstTrue: false }), 'p;q;p ∧ q\r\n0;0;0\r\n0;1;0\r\n1;0;0\r\n1;1;1\r\n');
  const t2 = table('(p ∨ q) ∧ r');
  assert.equal(tableToCSV(t2, { sep: ',' }).split('\r\n')[0], 'p,q,r,p ∨ q,(p ∨ q) ∧ r');
});

test('limite de 10 variáveis', () => {
  const ten = 'a ∧ b ∧ c ∧ d ∧ e1 ∧ f ∧ g ∧ h ∧ i ∧ j';
  assert.equal(table(ten).size, 1024);
  assert.throws(() => table(`${ten} ∧ k`), /até 10 variáveis/);
});

test('lista de índices para irrelevâncias', () => {
  assert.deepEqual(parseIndexList('10, 11, 12-15', 16), [10, 11, 12, 13, 14, 15]);
  assert.deepEqual(parseIndexList('  ', 16), []);
  assert.deepEqual(parseIndexList('3;1 2', 8), [1, 2, 3]);
  assert.throws(() => parseIndexList('16', 16), /não existe/);
  assert.throws(() => parseIndexList('5-2', 16), /invertido/);
  assert.throws(() => parseIndexList('x', 16), /válido/);
});
