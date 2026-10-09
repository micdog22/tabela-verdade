// Tabela-verdade, classificação, equivalência e formas canônicas.
import {
  MAX_VARS, ExpressionError, bitOf, computeColumns, format, sortVariables, variablesOf, walk,
} from './expressao.js';

/**
 * Monta a tabela-verdade. As linhas seguem a ordem dos mintermos (0 a 2^n - 1),
 * com a primeira variável como bit mais significativo; a interface decide a ordem de exibição.
 * `columns` traz as subexpressões intermediárias (filhos antes dos pais), sem repetição.
 */
export function truthTable(ast, { vars = variablesOf(ast), style = 'logica', intermediate = true } = {}) {
  if (vars.length > MAX_VARS) {
    throw new ExpressionError(`A tabela suporta até ${MAX_VARS} variáveis; esta expressão tem ${vars.length}.`, 0, 0);
  }
  const cols = computeColumns(ast, vars);
  const result = cols.get(ast);
  const columns = [];
  if (intermediate) {
    const seen = new Set();
    walk(ast, (node) => {
      if (node === ast || node.type === 'var' || node.type === 'const') return;
      const label = format(node, { style });
      if (seen.has(label)) return;
      seen.add(label);
      columns.push({ label, values: cols.get(node) });
    });
  }
  const minterms = [];
  const maxterms = [];
  result.forEach((v, r) => (v ? minterms : maxterms).push(r));
  return {
    vars,
    n: vars.length,
    size: result.length,
    columns,
    result,
    label: format(ast, { style }),
    minterms,
    maxterms,
  };
}

/** Valores das variáveis na linha `row` (array de 0 e 1). */
export function rowValues(row, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(bitOf(row, i, n));
  return out;
}

/** Tautologia (sempre V), contradição (sempre F) ou contingência (às vezes V, às vezes F). */
export function classify(result) {
  let ones = 0;
  for (const v of result) ones += v;
  const total = result.length;
  let kind = 'contingencia';
  if (ones === total) kind = 'tautologia';
  else if (ones === 0) kind = 'contradicao';
  return { kind, trueRows: ones, falseRows: total - ones, total };
}

export const CLASS_NAMES = Object.freeze({
  tautologia: 'Tautologia',
  contradicao: 'Contradição',
  contingencia: 'Contingência',
});

/**
 * Compara duas expressões em todas as valorações das variáveis das duas.
 * São equivalentes quando A ↔ B é tautologia; A implica B quando A → B é tautologia.
 */
export function compareExpressions(astA, astB) {
  const vars = sortVariables(new Set([...variablesOf(astA), ...variablesOf(astB)]));
  if (vars.length > MAX_VARS) {
    throw new ExpressionError(`A comparação suporta até ${MAX_VARS} variáveis no total; aqui são ${vars.length}.`, 0, 0);
  }
  const a = computeColumns(astA, vars).get(astA);
  const b = computeColumns(astB, vars).get(astB);
  let counterexample = null;
  let differences = 0;
  let aImpliesB = true;
  let bImpliesA = true;
  for (let r = 0; r < a.length; r++) {
    if (a[r] !== b[r]) {
      differences++;
      if (!counterexample) counterexample = { row: r, values: rowValues(r, vars.length), a: a[r], b: b[r] };
      if (a[r] && !b[r]) aImpliesB = false;
      if (b[r] && !a[r]) bImpliesA = false;
    }
  }
  return {
    vars,
    size: a.length,
    equivalent: differences === 0,
    differences,
    counterexample,
    aImpliesB,
    bImpliesA,
    a,
    b,
  };
}

// ---------------------------------------------------------------------------
// Formas canônicas

const LIT = {
  logica: { neg: (v) => `¬${v}`, and: ' ∧ ', or: ' ∨ ' },
  digital: { neg: (v) => `${v}'`, and: '·', or: ' + ' },
  ascii: { neg: (v) => `~${v}`, and: ' & ', or: ' | ' },
};

const litStyle = (style) => LIT[style] || LIT.logica;

/** Mintermo m_i: conjunção em que cada variável aparece direta (bit 1) ou negada (bit 0). */
export function mintermText(row, vars, style = 'logica') {
  const s = litStyle(style);
  if (vars.length === 0) return '1';
  return vars.map((v, i) => (bitOf(row, i, vars.length) ? v : s.neg(v))).join(s.and);
}

/** Maxtermo M_i: disjunção em que cada variável aparece direta (bit 0) ou negada (bit 1). */
export function maxtermText(row, vars, style = 'logica') {
  const s = litStyle(style);
  if (vars.length === 0) return '0';
  return vars.map((v, i) => (bitOf(row, i, vars.length) ? s.neg(v) : v)).join(s.or);
}

/** FND canônica (soma de mintermos). Sem mintermos, a função é a constante 0. */
export function canonicalDNF(vars, minterms, style = 'logica') {
  if (minterms.length === 0) return '0';
  const terms = minterms.map((m) => mintermText(m, vars, style));
  if (terms.length === 1) return terms[0];
  const wrap = vars.length > 1 && style !== 'digital';
  return terms.map((t) => (wrap ? `(${t})` : t)).join(litStyle(style).or);
}

/** FNC canônica (produto de maxtermos). Sem maxtermos, a função é a constante 1. */
export function canonicalCNF(vars, maxterms, style = 'logica') {
  if (maxterms.length === 0) return '1';
  const clauses = maxterms.map((m) => maxtermText(m, vars, style));
  if (clauses.length === 1) return clauses[0];
  const wrap = vars.length > 1;
  return clauses.map((c) => (wrap ? `(${c})` : c)).join(litStyle(style).and);
}

/** Notação compacta: Σm(1, 3, 5) e ΠM(0, 2, 4, 6, 7). */
export function sigmaNotation(minterms, dontCares = []) {
  const d = dontCares.length ? ` + d(${dontCares.join(', ')})` : '';
  return `Σm(${minterms.join(', ')})${d}`;
}

export function piNotation(maxterms, dontCares = []) {
  const d = dontCares.length ? ` · D(${dontCares.join(', ')})` : '';
  return `ΠM(${maxterms.join(', ')})${d}`;
}

// ---------------------------------------------------------------------------
// Exportação CSV

function csvField(value, sep) {
  const s = String(value);
  return /["\r\n]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Exporta a tabela em CSV (ponto e vírgula por padrão, que o Excel em português abre direto).
 * `values`: "VF" ou "10"; `firstTrue`: começa pela linha com tudo verdadeiro.
 */
export function tableToCSV(table, { values = 'VF', firstTrue = true, sep = ';' } = {}) {
  const show = (b) => (values === '10' ? (b ? '1' : '0') : (b ? 'V' : 'F'));
  const header = [...table.vars, ...table.columns.map((c) => c.label), table.label];
  const lines = [header.map((h) => csvField(h, sep)).join(sep)];
  for (let k = 0; k < table.size; k++) {
    const r = firstTrue ? table.size - 1 - k : k;
    const cells = [
      ...rowValues(r, table.n).map(show),
      ...table.columns.map((c) => show(c.values[r])),
      show(table.result[r]),
    ];
    lines.push(cells.map((c) => csvField(c, sep)).join(sep));
  }
  return `${lines.join('\r\n')}\r\n`;
}

/** Faz o parse de uma lista de índices como "1, 3, 5-7" (usada para as irrelevâncias). */
export function parseIndexList(text, size) {
  const out = new Set();
  const src = String(text).trim();
  if (!src) return [];
  for (const raw of src.split(/[\s,;]+/)) {
    if (!raw) continue;
    const m = /^(\d+)(?:-(\d+))?$/.exec(raw);
    if (!m) throw new ExpressionError(`"${raw}" não é um número de linha válido (use, por exemplo, 3, 5, 10-12).`, 0, 0);
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    if (b < a) throw new ExpressionError(`Intervalo invertido: ${raw}.`, 0, 0);
    if (b >= size) throw new ExpressionError(`A linha ${b} não existe: com estas variáveis vão de 0 a ${size - 1}.`, 0, 0);
    for (let x = a; x <= b; x++) out.add(x);
  }
  return [...out].sort((x, y) => x - y);
}
