import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ExpressionError, computeColumns, evaluate, format, parse, sameTree, tokenize, uppercaseKeywords,
  variablesOf, looksLikeJuxtaposedLetters,
} from '../src/expressao.js';

const full = (src, opts) => format(parse(src, opts), { full: true });

test('notações equivalentes geram a mesma árvore', () => {
  const groups = [
    ['¬p ∧ q', '~p & q', '!p && q', 'não p e q', 'nao p . q', "p' · q", '!p * q', '¬p q'],
    ['p ∨ q', 'p | q', 'p || q', 'p ou q', 'p + q'],
    ['p → q', 'p -> q', 'p => q', 'p ⇒ q', 'se p então q', 'se p entao q'],
    ['p ↔ q', 'p <-> q', 'p <=> q', 'p ⇔ q', 'p ≡ q', 'p sse q', 'p se e somente se q'],
    ['p ⊕ q', 'p ⊻ q', 'p xor q'],
    ['1 ∧ 0', '⊤ ∧ ⊥', 'verdadeiro e falso'],
    ['(p ∨ q) ∧ r', '[p ∨ q] ∧ r', '{p ∨ q} ∧ r'],
  ];
  for (const group of groups) {
    const ref = parse(group[0]);
    for (const src of group) assert.ok(sameTree(parse(src), ref), `${src} deveria igualar ${group[0]}`);
  }
});

test('precedência documentada: ¬, ∧, ⊕, ∨, →, ↔', () => {
  assert.equal(full('p ∨ q ∧ r'), 'p ∨ (q ∧ r)');
  assert.equal(full('p ∧ q ∨ r'), '(p ∧ q) ∨ r');
  assert.equal(full('¬p ∧ q'), '¬p ∧ q');
  assert.equal(full('¬(p ∧ q)'), '¬(p ∧ q)');
  assert.equal(full('p ∧ q ⊕ r'), '(p ∧ q) ⊕ r');
  assert.equal(full('p ⊕ q ∨ r'), '(p ⊕ q) ∨ r');
  assert.equal(full('p ∨ q → r'), '(p ∨ q) → r');
  assert.equal(full('p → q ↔ r'), '(p → q) ↔ r');
  assert.equal(full('p ↔ q → r'), 'p ↔ (q → r)');
  assert.equal(full('p ∨ q ↔ ¬r ∧ s'), '(p ∨ q) ↔ (¬r ∧ s)');
});

test('associatividade: condicional à direita, os demais à esquerda', () => {
  const same = (a, b) => sameTree(parse(a), parse(b));
  assert.ok(same('p → q → r', 'p → (q → r)'));
  assert.ok(!same('p → q → r', '(p → q) → r'));
  for (const op of ['∧', '∨', '↔', '⊕']) {
    assert.ok(same(`p ${op} q ${op} r`, `(p ${op} q) ${op} r`), op);
    assert.ok(!same(`p ${op} q ${op} r`, `p ${op} (q ${op} r)`), op);
  }
  assert.equal(full('p → q → r'), 'p → (q → r)');
  // cadeias do mesmo operador associativo ficam sem parênteses na leitura
  assert.equal(full('p ∧ q ∧ r'), 'p ∧ q ∧ r');
  assert.equal(full('p ∧ (q ∧ r)'), 'p ∧ (q ∧ r)');
  assert.equal(full('p ∧ q ∨ r ∧ s ∨ t'), '(p ∧ q) ∨ (r ∧ s) ∨ t');
  // na impressão normal, condicionais encadeados sempre ganham parênteses
  assert.equal(format(parse('p → q → r')), 'p → (q → r)');
  assert.equal(format(parse('(p → q) → r')), '(p → q) → r');
  assert.equal(format(parse('(p → q) ∧ (q → r) → (p → r)')), '(p → q) ∧ (q → r) → (p → r)');
  assert.equal(format(parse('p ∧ q ∧ r')), 'p ∧ q ∧ r');
  assert.equal(format(parse('p ∧ (q ∧ r)')), 'p ∧ (q ∧ r)');
});

test('justaposição e apóstrofo pós-fixo', () => {
  assert.equal(full("A'B"), '¬A ∧ B');
  assert.equal(full("(A + B)'"), '¬(A ∨ B)');
  assert.equal(full("A''"), '¬¬A');
  assert.equal(full('p (q ∨ r)'), 'p ∧ (q ∨ r)');
  assert.equal(full('p q ∨ r'), '(p ∧ q) ∨ r');
  assert.equal(full('¬p q'), '¬p ∧ q');
  assert.deepEqual(variablesOf(parse("AB' + C")), ['AB', 'C']);
});

test('modo de variáveis de uma letra', () => {
  const opts = { singleLetter: true };
  assert.equal(full("AB'C + A'BC", opts), '(A ∧ ¬B ∧ C) ∨ (¬A ∧ B ∧ C)');
  assert.deepEqual(variablesOf(parse('x1y2 + x10', opts)), ['x1', 'x10', 'y2']);
  // palavras-chave continuam valendo quando aparecem sozinhas
  assert.equal(full('A e B ou não C', opts), '(A ∧ B) ∨ ¬C');
});

test('"se ... então" e "se e somente se"', () => {
  assert.equal(full('se p e q então r ou s'), '(p ∧ q) → (r ∨ s)');
  assert.equal(full('se p então se q então r'), 'p → (q → r)');
  assert.equal(full('se p então q ↔ r'), '(p → q) ↔ r');
  // só a palavra "então" fecha o "se": o antecedente pode ter → dentro
  assert.equal(full('se p → q então r'), '(p → q) → r');
  assert.equal(full('se se p então q então r'), '(p → q) → r');
  assert.equal(full('se (p então q) então r'), '(p → q) → r');
  assert.equal(full('p então q'), 'p → q');
  assert.throws(() => parse('se p'), /então/);
  assert.throws(() => parse('se p -> q'), /palavra "então"/);
  assert.throws(() => parse('p se q'), ExpressionError);
});

test('modo de uma letra recusa o "e" minúsculo grudado', () => {
  assert.throws(() => parse('AeB', { singleLetter: true }), /ambíguo/);
  assert.throws(() => parse('Se p então q', { singleLetter: true }), /ambíguo/);
  assert.equal(full('A e B', { singleLetter: true }), 'A ∧ B');
});

test('erros trazem mensagem em português e a posição', () => {
  const cases = [
    ['', /Digite uma expressão/, 0],
    ['p ∧', /terminou cedo/, 3],
    ['(p ∨ q', /não foi fechado/, 0],
    ['p ∨ q)', /não tem abertura/, 5],
    ['[p ∧ q)', /Esperava "\]"/, 6],
    ['p ^ q', /ambíguo/, 2],
    ['p - q', /Hífen solto/, 2],
    ['p ∧ 2', /Número inválido/, 4],
    ['∧ p', /Falta um operando antes/, 0],
    ["'p", /apóstrofo/, 0],
    ['()', /Parênteses vazios/, 0],
    ['p # q', /não reconhecido/, 2],
  ];
  for (const [src, re, pos] of cases) {
    try {
      parse(src);
      assert.fail(`deveria falhar: ${src}`);
    } catch (err) {
      assert.ok(err instanceof ExpressionError, src);
      assert.match(err.message, re, src);
      assert.equal(err.pos, pos, `posição em ${src}`);
    }
  }
});

test('tokens guardam posição e texto original', () => {
  const toks = tokenize('p <-> não q');
  assert.deepEqual(toks.map((t) => [t.type, t.pos]), [['var', 0], ['iff', 2], ['not', 6], ['var', 10], ['eof', 11]]);
});

test('formas decompostas de acento são normalizadas', () => {
  const decomposed = 'na\u0303o p';
  assert.ok(sameTree(parse(decomposed), parse('não p')));
});

test('variáveis em ordem natural', () => {
  assert.deepEqual(variablesOf(parse('x10 ∧ x2 ∧ x1')), ['x1', 'x2', 'x10']);
  assert.deepEqual(variablesOf(parse('r ∨ q ∨ p ∨ q')), ['p', 'q', 'r']);
  assert.deepEqual(variablesOf(parse('1 ∨ 0')), []);
});

test('dicas de digitação', () => {
  assert.ok(looksLikeJuxtaposedLetters(['AB', 'C']));
  assert.ok(!looksLikeJuxtaposedLetters(['chove', 'p']));
  assert.deepEqual(uppercaseKeywords(['OU', 'E', 'NÃO', 'p']), ['OU', 'NÃO']);
});

// gerador pseudoaleatório com semente fixa (mulberry32)
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

function randomTree(rand, depth) {
  const vars = ['p', 'q', 'r', 's'];
  if (depth === 0 || rand() < 0.25) {
    if (rand() < 0.08) return { type: 'const', value: rand() < 0.5 };
    return { type: 'var', name: vars[Math.floor(rand() * vars.length)] };
  }
  if (rand() < 0.2) return { type: 'not', arg: randomTree(rand, depth - 1) };
  const ops = ['and', 'or', 'xor', 'imp', 'iff'];
  return { type: ops[Math.floor(rand() * ops.length)], left: randomTree(rand, depth - 1), right: randomTree(rand, depth - 1) };
}

test('imprimir e ler de novo devolve a mesma árvore (aleatório, semente fixa)', () => {
  const rand = rng(2026);
  for (let i = 0; i < 400; i++) {
    const tree = randomTree(rand, 5);
    for (const style of ['logica', 'digital', 'ascii']) {
      for (const fullParens of [false, true]) {
        const text = format(tree, { style, full: fullParens });
        assert.ok(sameTree(parse(text), tree), `${style}: ${text}`);
      }
    }
  }
});

test('colunas calculadas batem com a avaliação direta', () => {
  const rand = rng(7);
  for (let i = 0; i < 150; i++) {
    const tree = randomTree(rand, 4);
    const vars = ['p', 'q', 'r', 's'];
    const col = computeColumns(tree, vars).get(tree);
    for (let r = 0; r < 16; r++) {
      const env = { p: (r >> 3) & 1, q: (r >> 2) & 1, r: (r >> 1) & 1, s: r & 1 };
      assert.equal(col[r], evaluate(tree, env) ? 1 : 0);
    }
  }
});

test('avaliação de cada conectivo', () => {
  const t = (src, env) => evaluate(parse(src), env);
  assert.equal(t('p → q', { p: true, q: false }), false);
  assert.equal(t('p → q', { p: false, q: false }), true);
  assert.equal(t('p ↔ q', { p: false, q: false }), true);
  assert.equal(t('p ⊕ q', { p: true, q: true }), false);
  assert.equal(t('¬p ∨ q', new Map([['p', true], ['q', true]])), true);
  assert.throws(() => t('p ∧ z', { p: true }), /não tem valor/);
});
