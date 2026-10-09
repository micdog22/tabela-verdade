// Interface: liga os módulos de lógica ao DOM.
import {
  ExpressionError, format, looksLikeJuxtaposedLetters, parse, uppercaseKeywords, variablesOf,
} from './expressao.js';
import {
  CLASS_NAMES, canonicalCNF, canonicalDNF, classify, compareExpressions, parseIndexList,
  piNotation, rowValues, sigmaNotation, tableToCSV, truthTable,
} from './tabela.js';
import {
  agreesOnCare, minimizePOS, minimizeSOP, patternOf, posColumn, posText, solutionCost,
  sopColumn, sopText, termText,
} from './quine.js';
import { cellMinterm, groupCells, groupSegments, karnaughLayout, mapValues } from './karnaugh.js';
import { circuitSVG, gateCount } from './circuito.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const STORAGE_KEY = 'tabela-verdade:v1';
const MAX_LISTED_TERMS = 200;
const MAX_CANONICAL_SHOWN = 64;

const EXAMPLES = [
  { expr: 'p → q', note: 'Condicional' },
  { expr: '¬(p ∧ q) ↔ (¬p ∨ ¬q)', note: 'Lei de De Morgan' },
  { expr: '(p → q) ∧ (q → r) → (p → r)', note: 'Silogismo hipotético' },
  { expr: 'p ∧ ¬p', note: 'Contradição' },
  { expr: 'se chove e venta então fico_em_casa', note: 'Em português' },
  { expr: '(A ∧ B) ∨ (¬A ∧ C) ∨ (B ∧ C)', note: 'Termo de consenso' },
  { expr: "A'B'C'D' + A'B'CD' + AB'C'D' + AB'CD'", note: 'Cantos do mapa', singleLetter: true },
  { expr: 'p ⊕ q ⊕ r', note: 'Paridade' },
];

const state = {
  text: '',
  ast: null,
  table: null,
  sop: null,
  pos: null,
  dontCares: [],
  dcError: '',
  solutionIndex: 0,
};

// ---------------------------------------------------------------------------
// Preferências

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function savePrefs() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      expr: $('expr').value,
      singleLetter: $('single-letter').checked,
      values: $('opt-values').value,
      order: $('opt-order').value,
      style: $('opt-style').value,
      steps: $('opt-steps').checked,
      dontCare: $('dont-care').value,
      eqA: $('eq-a').value,
      eqB: $('eq-b').value,
    }));
  } catch {
    // armazenamento indisponível (modo privado): segue sem salvar
  }
}

function options() {
  return {
    singleLetter: $('single-letter').checked,
    values: $('opt-values').value,
    firstTrue: $('opt-order').value === 'v',
    style: $('opt-style').value,
    intermediate: $('opt-steps').checked,
  };
}

const show = (bit) => (options().values === '10' ? (bit ? '1' : '0') : (bit ? 'V' : 'F'));

function rowOrder(size) {
  const order = [];
  if (options().firstTrue) for (let r = size - 1; r >= 0; r--) order.push(r);
  else for (let r = 0; r < size; r++) order.push(r);
  return order;
}

// ---------------------------------------------------------------------------
// Expressão principal

function errorHTML(err, text) {
  const normalized = String(text).normalize('NFC');
  let snippet = '';
  const located = err instanceof ExpressionError && err.length > 0;
  if (located && normalized.length) {
    const a = Math.min(err.pos, normalized.length);
    const b = Math.min(normalized.length, a + Math.max(1, err.length));
    const mid = a < normalized.length ? normalized.slice(a, b) : ' ';
    snippet = `<pre aria-hidden="true">${esc(normalized.slice(0, a))}<mark>${esc(mid)}</mark>${esc(normalized.slice(b))}</pre>`;
  }
  const title = located || !(err instanceof ExpressionError) ? 'Não deu para ler a expressão.' : 'Não dá para montar a tabela.';
  return `<div class="error-box"><strong>${title}</strong> ${esc(err.message)}${snippet}</div>`;
}

function update() {
  const text = $('expr').value;
  state.text = text;
  const opts = options();
  try {
    const ast = parse(text, { singleLetter: opts.singleLetter });
    const vars = variablesOf(ast);
    state.ast = ast;
    state.table = truthTable(ast, { vars, style: opts.style, intermediate: opts.intermediate });
  } catch (err) {
    state.ast = null;
    state.table = null;
    $('expr-status').innerHTML = errorHTML(err, text);
    clearResults(err instanceof ExpressionError ? '' : String(err));
    savePrefs();
    return;
  }
  renderStatus();
  computeMinimization();
  renderTable();
  renderCanonical();
  renderMinimization();
  renderKarnaugh();
  renderCircuit();
  savePrefs();
}

function clearResults() {
  const empty = '<p class="muted">Corrija a expressão acima para ver o resultado.</p>';
  for (const id of ['classification', 'canonical', 'minimization', 'kmap', 'circuit']) $(id).innerHTML = id === 'classification' ? '' : empty;
  $('table-wrap').innerHTML = empty;
  $('qm-steps').innerHTML = '';
}

function renderStatus() {
  const { ast, table } = state;
  const style = options().style;
  const full = format(ast, { style, full: true });
  const vars = table.vars;
  let html = `<p class="read-as">Lida como: <code>${esc(full)}</code></p>`;
  html += `<p class="muted small">${vars.length === 0 ? 'Sem variáveis: a expressão é uma constante.' : `${vars.length} ${vars.length === 1 ? 'variável' : 'variáveis'} (${esc(vars.join(', '))}), ${table.size} linhas.`}</p>`;
  if (!options().singleLetter && looksLikeJuxtaposedLetters(vars)) {
    html += '<p class="hint small">Nomes como AB foram lidos como uma variável só. Se você quis dizer A·B, marque "Variáveis de uma letra".</p>';
  }
  const upper = uppercaseKeywords(vars);
  if (upper.length) {
    html += `<p class="hint small">${esc(upper.join(', '))} ${upper.length === 1 ? 'foi lido como variável' : 'foram lidos como variáveis'}: as palavras-chave vão em minúsculas (ou, não, então...).</p>`;
  }
  $('expr-status').innerHTML = html;
}

// ---------------------------------------------------------------------------
// Tabela-verdade

function renderTable() {
  const t = state.table;
  const c = classify(t.result);
  const desc = {
    tautologia: c.total === 1 ? 'verdadeira na única linha.' : `verdadeira em todas as ${c.total} linhas.`,
    contradicao: c.total === 1 ? 'falsa na única linha.' : `falsa em todas as ${c.total} linhas.`,
    contingencia: `verdadeira em ${c.trueRows} e falsa em ${c.falseRows} das ${c.total} linhas.`,
  }[c.kind];
  $('classification').innerHTML = `<span class="badge ${c.kind}">${CLASS_NAMES[c.kind]}</span> A expressão é ${desc}`;

  const dc = new Set(state.dontCares);
  const head = ['<th scope="col" class="idx" title="número da linha (mintermo)">linha</th>']
    .concat(t.vars.map((v) => `<th scope="col">${esc(v)}</th>`))
    .concat(t.columns.map((col, i) => `<th scope="col"${i === 0 ? ' class="sep"' : ''}>${esc(col.label)}</th>`))
    .concat(`<th scope="col" class="res${t.columns.length ? '' : ' sep'}">${esc(t.label)}</th>`);
  const cell = (b, extra = '') => `<td class="v${b}${extra}">${show(b)}</td>`;
  const rows = rowOrder(t.size).map((r) => {
    const vals = rowValues(r, t.n);
    const inner = vals.map((b) => cell(b)).join('')
      + t.columns.map((col, i) => cell(col.values[r], i === 0 ? ' sep' : '')).join('')
      + `<td class="res v${t.result[r]}${t.columns.length ? '' : ' sep'}">${dc.has(r) ? 'X' : show(t.result[r])}</td>`;
    return `<tr${dc.has(r) ? ' class="dc" title="combinação irrelevante"' : ''}><td class="idx">${r}</td>${inner}</tr>`;
  });
  $('table-wrap').innerHTML = `<table class="truth"><caption class="sr-only">Tabela-verdade de ${esc(t.label)}</caption><thead><tr>${head.join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

// ---------------------------------------------------------------------------
// Formas canônicas

function shortList(terms, joiner) {
  if (terms.length <= MAX_CANONICAL_SHOWN) return terms.join(joiner);
  return `${terms.slice(0, MAX_CANONICAL_SHOWN).join(joiner)} … (mais ${terms.length - MAX_CANONICAL_SHOWN} termos; use Copiar para ter tudo)`;
}

function renderCanonical() {
  const t = state.table;
  const style = options().style;
  const fnd = canonicalDNF(t.vars, t.minterms, style);
  const fnc = canonicalCNF(t.vars, t.maxterms, style);
  const orJoin = style === 'digital' ? ' + ' : ' ∨ ';
  const andJoin = style === 'digital' ? '·' : ' ∧ ';
  const fndShown = t.minterms.length > MAX_CANONICAL_SHOWN ? shortList(fnd.split(orJoin), orJoin) : fnd;
  const fncShown = t.maxterms.length > MAX_CANONICAL_SHOWN ? shortList(fnc.split(andJoin), andJoin) : fnc;
  $('canonical').innerHTML = `
    <div class="result-line"><h3>FND: soma de mintermos</h3><button type="button" class="btn copy" data-copy="fnd" aria-label="Copiar FND">Copiar</button></div>
    <p class="muted small">Um mintermo para cada linha em que a expressão é verdadeira. ${t.minterms.length ? esc(sigmaNotation(t.minterms)) : 'Nenhuma linha verdadeira: a FND é a constante 0.'}</p>
    <div class="formula">${esc(fndShown)}</div>
    <div class="result-line"><h3>FNC: produto de maxtermos</h3><button type="button" class="btn copy" data-copy="fnc" aria-label="Copiar FNC">Copiar</button></div>
    <p class="muted small">Um maxtermo para cada linha em que a expressão é falsa. ${t.maxterms.length ? esc(piNotation(t.maxterms)) : 'Nenhuma linha falsa: a FNC é a constante 1.'}</p>
    <div class="formula">${esc(fncShown)}</div>`;
  $('canonical').dataset.fnd = fnd;
  $('canonical').dataset.fnc = fnc;
}

// ---------------------------------------------------------------------------
// Quine-McCluskey

function computeMinimization() {
  const t = state.table;
  state.dcError = '';
  let dcs = [];
  try {
    dcs = parseIndexList($('dont-care').value, t.size);
  } catch (err) {
    state.dcError = err.message;
  }
  state.dontCares = dcs;
  const dc = new Set(dcs);
  const ones = t.minterms.filter((m) => !dc.has(m));
  const zeros = t.maxterms.filter((m) => !dc.has(m));
  state.sop = minimizeSOP(t.n, ones, dcs);
  state.pos = minimizePOS(t.n, zeros, dcs);
  if (state.solutionIndex >= state.sop.qm.solutions.length) state.solutionIndex = 0;
}

function chosenTerms() {
  const qm = state.sop.qm;
  const sol = qm.solutions[state.solutionIndex] || qm.solution;
  return sol.map((i) => qm.primes[i]);
}

function renderMinimization() {
  const t = state.table;
  const style = options().style;
  const { sop, pos } = state;
  const qm = sop.qm;
  const terms = chosenTerms();
  const sopStr = sopText(terms, t.vars, style);
  const posStr = posText(pos.clauses, t.vars, style);
  const sopOk = agreesOnCare(sopColumn(terms, t.n), t.result, state.dontCares);
  const posOk = agreesOnCare(posColumn(pos.clauses, t.n), t.result, state.dontCares);
  const cost = solutionCost(terms, t.n);
  const posCost = solutionCost(pos.clauses, t.n);
  const care = t.size - state.dontCares.length;
  const where = state.dontCares.length
    ? (care === 1 ? 'na única linha que importa' : `nas ${care} linhas que importam`)
    : (t.size === 1 ? 'na única linha' : `nas ${t.size} linhas`);
  const verify = (ok) => (ok
    ? `<span class="ok">✓ Conferido: coincide com a expressão original ${where}.</span>`
    : '<span class="bad">✗ Não coincide com a original (isto não deveria acontecer).</span>');
  let alt = '';
  if (qm.solutions.length > 1) {
    const opts = qm.solutions.map((s, i) => `<option value="${i}"${i === state.solutionIndex ? ' selected' : ''}>Solução ${i + 1}: ${esc(sopText(s.map((k) => qm.primes[k]), t.vars, style))}</option>`).join('');
    alt = `<label for="solution-pick" class="small">Há ${qm.solutions.length} soluções mínimas com o mesmo custo. Escolha a que aparece no mapa e no circuito:</label><select id="solution-pick">${opts}</select>`;
  }
  const inexact = [qm.exact ? null : 'a soma de produtos', pos.qm.exact ? null : 'o produto de somas'].filter(Boolean);
  const exactNote = inexact.length ? `<p class="warn small">Para ${inexact.join(' e ')}, a cobertura foi grande demais para provar que é a menor possível (o problema de cobertura é NP-difícil). O resultado é correto, mas talvez exista outro com menos termos.</p>` : '';
  $('minimization').innerHTML = `
    ${state.dcError ? `<p class="bad small" role="alert">${esc(state.dcError)}</p>` : ''}
    <div class="result-line"><h3>Soma de produtos mínima</h3><button type="button" class="btn copy" data-copy="sop" aria-label="Copiar soma de produtos mínima">Copiar</button></div>
    <div class="formula big">${esc(sopStr)}</div>
    <p class="small">${cost.terms} ${cost.terms === 1 ? 'termo' : 'termos'}, ${cost.literals} ${cost.literals === 1 ? 'literal' : 'literais'}. ${verify(sopOk)}</p>
    ${alt}${exactNote}
    <div class="result-line"><h3>Produto de somas mínimo</h3><button type="button" class="btn copy" data-copy="pos" aria-label="Copiar produto de somas mínimo">Copiar</button></div>
    <div class="formula big">${esc(posStr)}</div>
    <p class="small">${posCost.terms} ${posCost.terms === 1 ? 'cláusula' : 'cláusulas'}, ${posCost.literals} ${posCost.literals === 1 ? 'literal' : 'literais'}. Obtido simplificando os zeros (o complemento) e aplicando De Morgan. ${verify(posOk)}</p>`;
  $('minimization').dataset.sop = sopStr;
  $('minimization').dataset.pos = posStr;
  const pick = $('solution-pick');
  if (pick) {
    pick.addEventListener('change', () => {
      state.solutionIndex = Number(pick.value);
      renderMinimization();
      renderKarnaugh();
      renderCircuit();
      const again = $('solution-pick');
      if (again) again.focus();
    });
  }
  renderSteps();
}

function primeTerm(p, vars, style) {
  return termText(p, vars, style);
}

function coverList(p, dcSet) {
  return p.covers.map((m) => (dcSet.has(m) ? `(${m})` : String(m))).join(', ');
}

function renderSteps() {
  const t = state.table;
  const style = options().style;
  const qm = state.sop.qm;
  const dcSet = new Set(qm.dontCares);
  const n = t.n;
  const out = [];
  if (qm.minterms.length === 0) {
    $('qm-steps').innerHTML = '<p>Nenhuma linha verdadeira: a forma mínima é a constante 0 e não há nada para agrupar.</p>';
    return;
  }

  out.push('<h3>1. Agrupar pelo número de 1s</h3>');
  out.push(`<p>Escrevemos cada mintermo${dcSet.size ? ' (e cada irrelevante, entre parênteses)' : ''} em binário e separamos em grupos pela quantidade de 1s. Só termos de grupos vizinhos podem se combinar, porque precisam diferir em exatamente um bit.</p>`);

  qm.columns.forEach((col, k) => {
    if (k > 0) {
      out.push(`<h3>${k + 1}. Combinar termos com ${k === 1 ? 'um traço' : `${k} traços`}</h3>`);
      out.push(`<p>Dois termos com traços nas mesmas posições que diferem em um único bit se juntam, e o bit vira traço: <code>x·y + x·y' = x</code>.</p>`);
    }
    if (col.length > MAX_LISTED_TERMS) {
      out.push(`<p class="muted">${col.length} termos nesta etapa (muitos para listar).</p>`);
      return;
    }
    const rows = [];
    let lastGroup = -1;
    for (const term of col) {
      const ones = patternOf(term, n).split('').filter((ch) => ch === '1').length;
      const cls = ones !== lastGroup && lastGroup !== -1 ? ' class="group-start"' : '';
      const groupCell = ones !== lastGroup ? String(ones) : '';
      lastGroup = ones;
      const mark = term.used ? '<span class="used" title="combinou com outro termo">✓</span>' : '<span class="prime" title="não combina: implicante primo">primo</span>';
      rows.push(`<tr${cls}><td>${groupCell}</td><td class="mono">${esc(term.covers.map((m) => (dcSet.has(m) ? `(${m})` : m)).join(', '))}</td><td class="mono">${patternOf(term, n)}</td><td>${mark}</td></tr>`);
    }
    out.push(`<div class="table-wrap"><table><thead><tr><th scope="col">nº de 1s</th><th scope="col">mintermos</th><th scope="col">padrão</th><th scope="col">situação</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`);
  });

  let step = qm.columns.length + 1;
  out.push(`<h3>${step++}. Implicantes primos</h3>`);
  out.push('<p>Os termos que não se combinaram com nenhum outro são os implicantes primos: não dá para eliminar mais nenhuma variável deles.</p>');
  if (qm.onlyDontCarePrimes) out.push(`<p class="muted small">${qm.onlyDontCarePrimes} primo(s) cobriam só irrelevâncias e foram descartados.</p>`);
  if (qm.primes.length > MAX_LISTED_TERMS) {
    out.push(`<p class="muted">${qm.primes.length} implicantes primos (muitos para listar).</p>`);
  } else {
    const rows = qm.primes.map((p) => `<tr><th scope="row">${p.label}</th><td class="mono">${patternOf(p, n)}</td><td class="mono">${esc(primeTerm(p, t.vars, style))}</td><td class="mono">${esc(coverList(p, dcSet))}</td></tr>`);
    out.push(`<div class="table-wrap"><table><thead><tr><th scope="col">nome</th><th scope="col">padrão</th><th scope="col">termo</th><th scope="col">cobre</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`);
  }

  out.push(`<h3>${step++}. Tabela de implicantes primos e essenciais</h3>`);
  out.push('<p>Marcamos quais mintermos cada primo cobre. Se uma coluna tem uma única marca, aquele primo é <strong>essencial</strong>: entra obrigatoriamente na resposta. Irrelevâncias não entram na tabela, porque não precisam ser cobertas.</p>');
  const ess = new Set(qm.essentials);
  const coveredByEss = new Set();
  for (const i of qm.essentials) for (const m of qm.primes[i].coversOnes) coveredByEss.add(m);
  if (qm.primes.length <= 40 && qm.minterms.length <= 64) {
    const head = qm.minterms.map((m) => `<th scope="col"${coveredByEss.has(m) ? ' class="done"' : ''}>${m}</th>`).join('');
    const rows = qm.primes.map((p, i) => {
      const cells = qm.minterms.map((m) => {
        const has = p.coversOnes.includes(m);
        const only = has && qm.coverers.get(m).length === 1;
        const cls = [has ? 'x' : '', only ? 'only' : '', coveredByEss.has(m) && !only ? 'done' : ''].filter(Boolean).join(' ');
        return `<td${cls ? ` class="${cls}"` : ''}>${has ? '×' : ''}</td>`;
      }).join('');
      return `<tr${ess.has(i) ? ' class="ess"' : ''}><th scope="row">${p.label}${ess.has(i) ? ' *' : ''}</th>${cells}</tr>`;
    });
    out.push(`<div class="table-wrap"><table class="chart"><thead><tr><th scope="col">primo</th>${head}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`);
    out.push('<p class="muted small">* essencial. Células destacadas: única marca da coluna.</p>');
  } else {
    out.push(`<p class="muted">Tabela grande demais para exibir (${qm.primes.length} primos × ${qm.minterms.length} mintermos).</p>`);
  }
  if (qm.essentials.length) {
    const items = qm.essentials.map((i) => {
      const p = qm.primes[i];
      const why = qm.essentialBecause.get(i).map((m) => `m${m}`).join(', ');
      return `<li><strong>${p.label}</strong> = <code>${esc(primeTerm(p, t.vars, style))}</code> (único que cobre ${esc(why)})</li>`;
    });
    if (items.length <= MAX_LISTED_TERMS) out.push(`<ul>${items.join('')}</ul>`);
    else out.push(`<p>${items.length} implicantes essenciais.</p>`);
  } else {
    out.push('<p>Nenhum primo é essencial: a tabela é cíclica, e toda a escolha fica para o método de Petrick.</p>');
  }

  if (qm.remaining.length === 0) {
    out.push(`<h3>${step++}. Cobertura</h3><p>Os essenciais já cobrem todos os mintermos. Não é preciso o método de Petrick.</p>`);
  } else {
    out.push(`<h3>${step++}. Método de Petrick</h3>`);
    out.push(renderPetrick(qm));
  }

  const terms = chosenTerms();
  out.push(`<h3>${step}. Resultado</h3><p class="formula big">${esc(sopText(terms, t.vars, style))}</p>`);
  $('qm-steps').innerHTML = out.join('');
}

const prodText = (indices, primes) => (indices.length ? indices.map((i) => primes[i].label).join('·') : '1');

function renderPetrick(qm) {
  const pet = qm.petrick;
  const primes = qm.primes;
  const parts = ['<div class="petrick">'];
  parts.push(`<p>Sobraram os mintermos ${esc(qm.remaining.map((m) => `m${m}`).join(', '))}. Cada um precisa de pelo menos um dos primos que o cobrem, então escrevemos uma soma (OU) por mintermo e multiplicamos (E) todas:</p>`);
  const clauseStr = (list) => `(${list.map((i) => primes[i].label).join(' + ')})`;
  if (pet.clauses.length <= 60) {
    parts.push(`<p class="mono">P = ${esc(pet.clauses.map((c) => clauseStr(c.primes)).join(' · '))}</p>`);
  } else {
    parts.push(`<p class="muted">${pet.clauses.length} somas.</p>`);
  }
  if (pet.reduced.length < pet.clauses.length) {
    parts.push('<p>Somas repetidas, ou que contêm outra soma inteira, podem sair (absorção: <code>X·(X + Y) = X</code>):</p>');
    if (pet.reduced.length <= 60) parts.push(`<p class="mono">P = ${esc(pet.reduced.map((c) => clauseStr(c.primes)).join(' · '))}</p>`);
  }
  parts.push('<p>Multiplicamos uma soma por vez, aplicando a absorção (<code>X + X·Y = X</code>) a cada passo:</p><ol>');
  for (const s of pet.steps.slice(0, 40)) {
    const body = s.products ? s.products.map((p) => prodText(p, primes)).join(' + ') : `${s.count} produtos`;
    parts.push(`<li class="mono">× ${esc(clauseStr(s.clause))} → ${esc(body)}</li>`);
  }
  if (pet.steps.length > 40) parts.push(`<li class="muted">mais ${pet.steps.length - 40} passos…</li>`);
  parts.push('</ol>');
  if (!pet.overflow) {
    parts.push('<p>Cada produto final é uma forma de cobrir o que faltava. Escolhemos os de menor custo: menos primos e, no empate, menos literais.</p>');
    const shown = pet.products.slice(0, 30).map((p) => {
      const lits = p.reduce((s, i) => s + primes[i].literals, 0);
      const best = pet.minimal.some((m) => m.join() === p.join());
      return `<li class="mono">${esc(prodText(p, primes))}: ${p.length} ${p.length === 1 ? 'primo' : 'primos'}, ${lits} literais${best ? ' <strong class="ok">(mínimo)</strong>' : ''}</li>`;
    });
    parts.push(`<ul>${shown.join('')}</ul>`);
    if (pet.products.length > 30) parts.push(`<p class="muted small">e mais ${pet.products.length - 30} produtos.</p>`);
  } else {
    const s = qm.search;
    parts.push(`<p>A expansão passou do limite de produtos, então a cobertura foi escolhida por <strong>busca com poda</strong> (ramificação e limite), que testa os primos de cada mintermo e descarta caminhos que já não podem vencer a melhor solução. ${s.exact ? 'A busca terminou: a solução é mínima.' : `A busca parou depois de ${s.nodes.toLocaleString('pt-BR')} tentativas, com a melhor solução encontrada até ali.`}</p>`);
  }
  parts.push('</div>');
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Mapa de Karnaugh

function kmapGroups(mode) {
  if (mode === 'pos') return state.pos.clauses;
  return chosenTerms();
}

function renderKarnaugh() {
  const t = state.table;
  const box = $('kmap');
  if (t.n < 2 || t.n > 4) {
    box.innerHTML = `<p class="muted">O mapa de Karnaugh aparece para expressões de 2 a 4 variáveis. Esta tem ${t.n}.</p>`;
    return;
  }
  const mode = document.querySelector('input[name="kmode"]:checked').value;
  const style = options().style;
  const layout = karnaughLayout(t.n);
  const values = mapValues(layout, t.result, state.dontCares);
  const groups = kmapGroups(mode);
  const cell = 56;
  const ox = 92;
  const oy = 70;
  const rows = layout.rowCodes.length;
  const cols = layout.colCodes.length;
  const w = ox + cols * cell + 16;
  const h = oy + rows * cell + 16;
  const joinNames = (idx) => {
    const names = idx.map((i) => t.vars[i]);
    return names.every((s) => [...s].length === 1) ? names.join('') : names.join(',');
  };
  const parts = [];
  parts.push(`<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-labelledby="kmap-title" font-family="system-ui, sans-serif">`);
  parts.push(`<title id="kmap-title">Mapa de Karnaugh com ${groups.length} ${groups.length === 1 ? 'grupo' : 'grupos'}</title>`);
  parts.push(`<defs><clipPath id="kclip"><rect x="${ox}" y="${oy}" width="${cols * cell}" height="${rows * cell}"/></clipPath></defs>`);
  // rótulos dos eixos
  parts.push(`<line x1="${ox - 46}" y1="${oy - 46}" x2="${ox}" y2="${oy}" stroke="currentColor" stroke-opacity=".4"/>`);
  parts.push(`<text class="lbl" x="${ox - 4}" y="${oy - 40}" text-anchor="end" font-weight="700">${esc(joinNames(layout.colVars))}</text>`);
  parts.push(`<text class="lbl" x="${ox - 44}" y="${oy - 6}" text-anchor="start" font-weight="700">${esc(joinNames(layout.rowVars))}</text>`);
  layout.colLabels.forEach((lab, c) => parts.push(`<text class="lbl" x="${ox + c * cell + cell / 2}" y="${oy - 10}" text-anchor="middle">${lab}</text>`));
  layout.rowLabels.forEach((lab, r) => parts.push(`<text class="lbl" x="${ox - 10}" y="${oy + r * cell + cell / 2 + 4}" text-anchor="end">${lab}</text>`));
  const texts = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const m = cellMinterm(layout, r, c);
      const v = values[r][c];
      const x = ox + c * cell;
      const y = oy + r * cell;
      const target = mode === 'pos' ? '0' : '1';
      parts.push(`<rect class="cell${v === target ? ' one' : ''}" x="${x}" y="${y}" width="${cell}" height="${cell}"/>`);
      // textos por cima dos grupos, para o número do mintermo não sumir sob o contorno
      texts.push(`<text class="mi" x="${x + cell - 5}" y="${y + cell - 6}" text-anchor="end">${m}</text>`);
      texts.push(`<text class="val" x="${x + cell / 2}" y="${y + cell / 2 + 6}" text-anchor="middle">${v}</text>`);
    }
  }
  const legend = [];
  groups.forEach((g, k) => {
    const color = `var(--g${k % 8})`;
    const inset = 5 + (k % 4) * 3;
    for (const s of groupSegments(layout, g)) {
      const ext = inset + 14;
      let x0 = ox + s.c0 * cell + inset;
      let x1 = ox + (s.c1 + 1) * cell - inset;
      let y0 = oy + s.r0 * cell + inset;
      let y1 = oy + (s.r1 + 1) * cell - inset;
      if (s.open.left) x0 -= ext;
      if (s.open.right) x1 += ext;
      if (s.open.top) y0 -= ext;
      if (s.open.bottom) y1 += ext;
      parts.push(`<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="14" fill="${color}" fill-opacity=".10" stroke="${color}" stroke-width="3" clip-path="url(#kclip)"/>`);
    }
    const cells = groupCells(layout, g).map((cc) => `m${cc.minterm}`).join(', ');
    const label = mode === 'pos' ? clauseLabel(g, t.vars, style) : termText(g, t.vars, style);
    legend.push(`<li><span class="swatch" style="border-color:${color}"></span><span><code>${esc(label)}</code> <span class="muted small">(${groupCells(layout, g).length} ${groupCells(layout, g).length === 1 ? 'célula' : 'células'}: ${esc(cells)})</span></span></li>`);
  });
  parts.push(...texts, '</svg>');
  const result = mode === 'pos' ? posText(state.pos.clauses, t.vars, style) : sopText(groups, t.vars, style);
  const explain = mode === 'pos'
    ? 'Cada grupo de 0s vira uma cláusula: a variável que não muda entra negada se vale 1 no grupo e direta se vale 0.'
    : 'Cada grupo de 1s vira um produto: só ficam as variáveis que não mudam dentro do grupo.';
  box.innerHTML = `<div class="kmap-wrap"><div class="kmap">${parts.join('')}</div><div><p class="small">${explain}</p><ul class="legend">${legend.join('') || '<li class="muted">Nenhum grupo: a função é constante.</li>'}</ul><p>Resultado: <code>${esc(result)}</code></p></div></div>`;
}

function clauseLabel(imp, vars, style) {
  return posText([imp], vars, style);
}

// ---------------------------------------------------------------------------
// Circuito

function renderCircuit() {
  const t = state.table;
  const terms = chosenTerms();
  const svg = circuitSVG(terms, t.vars, { title: `Circuito de ${sopText(terms, t.vars, 'digital')}` });
  const g = gateCount(terms, t.n);
  const unused = t.vars.filter((v, i) => !terms.some((term) => !(term.mask & (1 << (t.n - 1 - i)))));
  const unusedNote = unused.length && terms.length && !(terms.length === 1 && terms[0].mask === (1 << t.n) - 1)
    ? ` A saída não depende de ${esc(unused.join(', '))}, por isso ${unused.length === 1 ? 'essa entrada não aparece' : 'essas entradas não aparecem'}.`
    : '';
  $('circuit').innerHTML = `${svg}<p class="small muted">Portas: ${g.not} NÃO, ${g.and} E, ${g.or} OU (total ${g.total}).${unusedNote}</p>`;
}

function downloadSVG() {
  if (!state.table) return;
  const terms = chosenTerms();
  const svg = circuitSVG(terms, state.table.vars, { standalone: true, title: `Circuito de ${sopText(terms, state.table.vars, 'digital')}` });
  download('circuito.svg', `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`, 'image/svg+xml');
}

function downloadCSV() {
  if (!state.table) return;
  const o = options();
  const csv = tableToCSV(state.table, { values: o.values, firstTrue: o.firstTrue });
  download('tabela-verdade.csv', `\ufeff${csv}`, 'text/csv;charset=utf-8');
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// Equivalência

function renderEquivalence() {
  const box = $('equivalence');
  const a = $('eq-a').value;
  const b = $('eq-b').value;
  if (!a.trim() || !b.trim()) {
    box.innerHTML = '<p class="muted">Preencha as duas expressões.</p>';
    return;
  }
  const opts = { singleLetter: options().singleLetter };
  let astA;
  let astB;
  try {
    astA = parse(a, opts);
  } catch (err) {
    box.innerHTML = errorHTML(err, a).replace('Não deu para ler a expressão.', 'Não deu para ler a expressão A.');
    return;
  }
  try {
    astB = parse(b, opts);
  } catch (err) {
    box.innerHTML = errorHTML(err, b).replace('Não deu para ler a expressão.', 'Não deu para ler a expressão B.');
    return;
  }
  let cmp;
  try {
    cmp = compareExpressions(astA, astB);
  } catch (err) {
    box.innerHTML = errorHTML(err, '');
    return;
  }
  const style = options().style;
  const fa = format(astA, { style });
  const fb = format(astB, { style });
  const yes = (v) => (v ? '<span class="ok">sim</span>' : '<span class="bad">não</span>');
  let html;
  if (cmp.equivalent) {
    html = `<p class="verdict ok">✓ Equivalentes.</p><p>As duas têm o mesmo valor ${cmp.size === 1 ? 'na única linha' : `nas ${cmp.size} linhas`}: <code>(${esc(fa)}) ↔ (${esc(fb)})</code> é uma tautologia.</p>`;
  } else {
    const ce = cmp.counterexample;
    const assign = cmp.vars.map((v, i) => `${esc(v)} = ${show(ce.values[i])}`).join(', ');
    html = `<p class="verdict bad">✗ Não são equivalentes.</p>
      <p><strong>Contraexemplo:</strong> ${assign ? `com ${assign}` : 'sem variáveis'}, A vale ${show(ce.a)} e B vale ${show(ce.b)}.</p>
      <p class="small">Elas diferem em ${cmp.differences} de ${cmp.size} ${cmp.size === 1 ? 'linha' : 'linhas'}.</p>`;
    const rows = [];
    for (const r of rowOrder(cmp.size)) {
      if (cmp.a[r] === cmp.b[r]) continue;
      if (rows.length >= 16) break;
      rows.push(`<tr><td class="idx">${r}</td>${rowValues(r, cmp.vars.length).map((v) => `<td class="v${v}">${show(v)}</td>`).join('')}<td class="v${cmp.a[r]} sep">${show(cmp.a[r])}</td><td class="v${cmp.b[r]}">${show(cmp.b[r])}</td></tr>`);
    }
    html += `<div class="table-wrap"><table class="truth"><thead><tr><th scope="col" class="idx">linha</th>${cmp.vars.map((v) => `<th scope="col">${esc(v)}</th>`).join('')}<th scope="col" class="sep">A</th><th scope="col">B</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
    if (cmp.differences > 16) html += `<p class="muted small">Mostrando 16 de ${cmp.differences} linhas diferentes.</p>`;
  }
  html += `<p class="small">A implica B (<code>A → B</code> é tautologia)? ${yes(cmp.aImpliesB)}. B implica A? ${yes(cmp.bImpliesA)}.</p>`;
  box.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Eventos

function debounce(fn, ms) {
  let id = 0;
  return () => {
    clearTimeout(id);
    id = setTimeout(fn, ms);
  };
}

function insertAtCursor(input, text) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  const pos = start + text.length;
  input.focus();
  input.setSelectionRange(pos, pos);
  input.dispatchEvent(new Event('input'));
}

async function copyText(text, button) {
  if (!button.dataset.label) button.dataset.label = button.textContent;
  clearTimeout(Number(button.dataset.timer || 0));
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copiado!';
  } catch {
    button.textContent = 'Não foi possível copiar';
  }
  button.dataset.timer = String(setTimeout(() => { button.textContent = button.dataset.label; }, 1500));
}

function renderExamples() {
  $('examples').innerHTML = EXAMPLES.map((ex, i) => `<button type="button" data-example="${i}"><code>${esc(ex.expr)}</code><small>${esc(ex.note)}</small></button>`).join('');
}

function readHash() {
  const h = location.hash.slice(1);
  if (!h) return null;
  const params = new URLSearchParams(h);
  const expr = params.get('e');
  if (!expr) return null;
  return { expr, singleLetter: params.get('l') === '1', dontCare: params.get('d') || '' };
}

function init() {
  renderExamples();
  const prefs = loadPrefs();
  const fromHash = readHash();
  $('expr').value = fromHash?.expr ?? prefs.expr ?? '(p → q) ∧ (q → r) → (p → r)';
  $('single-letter').checked = fromHash ? fromHash.singleLetter : Boolean(prefs.singleLetter);
  if (prefs.values) $('opt-values').value = prefs.values;
  if (prefs.order) $('opt-order').value = prefs.order;
  if (prefs.style) $('opt-style').value = prefs.style;
  if (typeof prefs.steps === 'boolean') $('opt-steps').checked = prefs.steps;
  $('dont-care').value = fromHash ? fromHash.dontCare : (prefs.dontCare || '');
  $('eq-a').value = prefs.eqA ?? 'p → q';
  $('eq-b').value = prefs.eqB ?? '¬q → ¬p';

  const later = debounce(update, 120);
  const fresh = () => {
    state.solutionIndex = 0;
    later();
  };
  $('expr').addEventListener('input', fresh);
  $('dont-care').addEventListener('input', fresh);
  for (const id of ['single-letter', 'opt-values', 'opt-order', 'opt-style', 'opt-steps']) {
    $(id).addEventListener('change', () => { update(); renderEquivalence(); });
  }
  document.querySelectorAll('input[name="kmode"]').forEach((r) => r.addEventListener('change', () => state.table && renderKarnaugh()));

  document.querySelector('.keypad').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-insert]');
    if (btn) insertAtCursor($('expr'), btn.dataset.insert);
  });
  $('examples').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-example]');
    if (!btn) return;
    const ex = EXAMPLES[Number(btn.dataset.example)];
    $('expr').value = ex.expr;
    $('single-letter').checked = Boolean(ex.singleLetter);
    $('dont-care').value = '';
    state.solutionIndex = 0;
    update();
    renderEquivalence();
  });
  $('copy-link').addEventListener('click', (ev) => {
    const params = new URLSearchParams({ e: $('expr').value });
    if ($('single-letter').checked) params.set('l', '1');
    if ($('dont-care').value.trim()) params.set('d', $('dont-care').value.trim());
    const url = `${location.origin}${location.pathname}#${params.toString()}`;
    history.replaceState(null, '', `#${params.toString()}`);
    copyText(url, ev.currentTarget);
  });
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-copy]');
    if (!btn) return;
    const key = btn.dataset.copy;
    const source = key === 'fnd' || key === 'fnc' ? $('canonical') : $('minimization');
    copyText(source.dataset[key] || '', btn);
  });
  $('csv').addEventListener('click', downloadCSV);
  $('svg-download').addEventListener('click', downloadSVG);

  const eqLater = debounce(() => { renderEquivalence(); savePrefs(); }, 150);
  $('eq-a').addEventListener('input', eqLater);
  $('eq-b').addEventListener('input', eqLater);
  $('eq-use-main').addEventListener('click', () => {
    $('eq-a').value = $('expr').value;
    renderEquivalence();
    savePrefs();
  });
  document.querySelectorAll('button[data-eq]').forEach((btn) => btn.addEventListener('click', () => {
    const [a, b] = btn.dataset.eq.split('|');
    $('eq-a').value = a;
    $('eq-b').value = b;
    renderEquivalence();
    savePrefs();
  }));
  window.addEventListener('hashchange', () => {
    const h = readHash();
    if (!h) return;
    $('expr').value = h.expr;
    $('single-letter').checked = h.singleLetter;
    $('dont-care').value = h.dontCare;
    state.solutionIndex = 0;
    update();
    renderEquivalence();
  });

  update();
  renderEquivalence();
}

init();
