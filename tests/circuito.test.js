import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circuitSVG, gateCount } from '../src/circuito.js';
import { minimizeSOP } from '../src/quine.js';

const count = (svg, re) => (svg.match(re) || []).length;

test('circuito da soma de produtos tem uma porta E por produto e uma OU', () => {
  const { terms } = minimizeSOP(4, [4, 8, 10, 11, 12, 15], [9, 14]);
  const svg = circuitSVG(terms, ['A', 'B', 'C', 'D']);
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.endsWith('</svg>'));
  assert.equal(count(svg, /<title>Porta E \d+:/g), 3);
  assert.equal(count(svg, /<title>Porta OU<\/title>/g), 1);
  // B', C' e D' aparecem negados: três portas NÃO
  assert.equal(count(svg, /<title>NÃO /g), 3);
  assert.deepEqual(gateCount(terms, 4), { not: 3, and: 3, or: 1, total: 7 });
});

test('termo de um literal liga direto na porta OU', () => {
  const { terms } = minimizeSOP(4, [0, 1, 2, 4, 5, 6, 8, 9, 12, 13, 14]); // y' + w'z' + xz'
  const svg = circuitSVG(terms, ['w', 'x', 'y', 'z']);
  assert.equal(count(svg, /<title>Porta E \d+:/g), 2);
  assert.deepEqual(gateCount(terms, 4), { not: 3, and: 2, or: 1, total: 6 });
});

test('um único produto dispensa a porta OU; um literal dispensa tudo', () => {
  const single = minimizeSOP(2, [3]).terms; // A·B
  const svg = circuitSVG(single, ['A', 'B']);
  assert.equal(count(svg, /Porta OU/g), 0);
  assert.equal(count(svg, /<title>Porta E 1: A·B<\/title>/g), 1);
  const lit = minimizeSOP(2, [2, 3]).terms; // A
  assert.deepEqual(gateCount(lit, 2), { not: 0, and: 0, or: 0, total: 0 });
  assert.match(circuitSVG(lit, ['A', 'B']), />F<\/text>/);
});

test('constantes', () => {
  assert.match(circuitSVG([], ['A']), /Saída constante: nível lógico baixo/);
  const one = minimizeSOP(1, [0, 1]).terms;
  assert.match(circuitSVG(one, ['A']), /nível lógico alto/);
});

test('versão para baixar tem fundo e cor fixos; textos são escapados', () => {
  const { terms } = minimizeSOP(2, [1, 2]);
  const svg = circuitSVG(terms, ['A', 'B'], { standalone: true, title: 'F = A<B & "x"' });
  assert.match(svg, /<rect width="100%" height="100%" fill="#ffffff"\/>/);
  assert.match(svg, / color="#1b1f24"/);
  assert.match(svg, /F = A&lt;B &amp; &quot;x&quot;/);
  assert.ok(!svg.includes('A<B'));
});
