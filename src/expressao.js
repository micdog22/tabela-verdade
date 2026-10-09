// Analisador de expressões lógicas: tokens, árvore sintática, impressão e avaliação.
//
// Precedência (da que liga mais forte para a mais fraca):
//   1. negação       ¬ ~ ! não nao  e o apóstrofo pós-fixo (A')
//   2. conjunção     ∧ & && e . · *  e a justaposição (p q, A'B)
//   3. ou exclusivo  ⊕ ⊻ xor
//   4. disjunção     ∨ | || ou +
//   5. condicional   → -> => então  (associativa à direita: p → q → r = p → (q → r))
//   6. bicondicional ↔ <-> <=> ⇔ ≡ sse  "se e somente se"
// Conjunção, disjunção, ou exclusivo e bicondicional associam à esquerda.

export const MAX_VARS = 10;

export const PRECEDENCE = Object.freeze({ iff: 1, imp: 2, or: 3, xor: 4, and: 5, not: 6 });

export const OPERATOR_NAMES = Object.freeze({
  not: 'negação',
  and: 'conjunção',
  xor: 'ou exclusivo',
  or: 'disjunção',
  imp: 'condicional',
  iff: 'bicondicional',
});

export class ExpressionError extends Error {
  constructor(message, pos = 0, length = 1) {
    super(message);
    this.name = 'ExpressionError';
    this.pos = pos;
    this.length = length;
  }
}

// Símbolos de um ou mais caracteres, do mais longo para o mais curto.
const SYMBOLS = [
  ['<->', 'iff'], ['<=>', 'iff'], ['->', 'imp'], ['=>', 'imp'], ['&&', 'and'], ['||', 'or'],
  ['¬', 'not'], ['~', 'not'], ['!', 'not'], ["'", 'postnot'], ['’', 'postnot'],
  ['∧', 'and'], ['&', 'and'], ['.', 'and'], ['·', 'and'], ['*', 'and'],
  ['∨', 'or'], ['|', 'or'], ['+', 'or'],
  ['⊕', 'xor'], ['⊻', 'xor'],
  ['→', 'imp'], ['⇒', 'imp'],
  ['↔', 'iff'], ['⇔', 'iff'], ['≡', 'iff'],
  ['(', 'lparen'], ['[', 'lparen'], ['{', 'lparen'],
  [')', 'rparen'], [']', 'rparen'], ['}', 'rparen'],
  ['⊤', 'true'], ['⊥', 'false'],
];

const CLOSING = { '(': ')', '[': ']', '{': '}' };

// Palavras-chave (sempre em minúsculas; "E" maiúsculo continua sendo variável).
const KEYWORDS = new Map([
  ['e', 'and'], ['ou', 'or'], ['não', 'not'], ['nao', 'not'], ['xor', 'xor'],
  ['então', 'imp'], ['entao', 'imp'], ['sse', 'iff'], ['se', 'se'],
  ['verdadeiro', 'true'], ['falso', 'false'],
]);

const WORD_RE = /[\p{L}_][\p{L}\p{N}_]*/uy;
const LETTER_RE = /[\p{L}_][\p{N}_]*/uy;
const SPACE_RE = /\s+/uy;
const DIGITS_RE = /\p{N}+/uy;

const BINARY = new Set(['and', 'or', 'xor', 'imp', 'iff']);

/**
 * Divide o texto em tokens. Com `singleLetter`, cada letra é uma variável
 * (AB vira A e B, que a justaposição transforma em A ∧ B).
 */
export function tokenize(src, { singleLetter = false } = {}) {
  const text = String(src).normalize('NFC');
  const tokens = [];
  let i = 0;
  const matchAt = (re, at) => {
    re.lastIndex = at;
    const m = re.exec(text);
    return m ? m[0] : null;
  };
  while (i < text.length) {
    const space = matchAt(SPACE_RE, i);
    if (space) { i += space.length; continue; }

    const sym = SYMBOLS.find(([s]) => text.startsWith(s, i));
    if (sym) {
      tokens.push({ type: sym[1], text: sym[0], pos: i, len: sym[0].length });
      i += sym[0].length;
      continue;
    }

    const digits = matchAt(DIGITS_RE, i);
    if (digits) {
      if (digits !== '0' && digits !== '1') {
        throw new ExpressionError(`Número inválido "${digits}": as constantes são só 0 (falso) e 1 (verdadeiro).`, i, digits.length);
      }
      tokens.push({ type: digits === '1' ? 'true' : 'false', text: digits, pos: i, len: 1 });
      i += 1;
      continue;
    }

    const word = matchAt(WORD_RE, i);
    if (word) {
      const kw = KEYWORDS.get(word);
      if (kw === 'se') {
        // "se e somente se" vira um único token bicondicional.
        const rest = /\s+e\s+somente\s+se(?![\p{L}\p{N}_])/uy;
        rest.lastIndex = i + word.length;
        const m = rest.exec(text);
        if (m) {
          const len = word.length + m[0].length;
          tokens.push({ type: 'iff', text: text.slice(i, i + len), pos: i, len });
          i += len;
          continue;
        }
      }
      if (kw) {
        tokens.push({ type: kw, text: word, pos: i, len: word.length, word: true });
      } else if (singleLetter) {
        // cada letra (seguida de dígitos ou sublinhados, como x1 ou x_2) é uma variável
        let j = i;
        while (j < i + word.length) {
          const piece = matchAt(LETTER_RE, j);
          if (piece === 'e') {
            throw new ExpressionError(`No modo de variáveis de uma letra, o "e" minúsculo de "${word}" fica ambíguo com o conectivo "e". Separe com espaços ("A e B") ou use E maiúsculo como variável.`, j, 1);
          }
          tokens.push({ type: 'var', text: piece, pos: j, len: piece.length });
          j += piece.length;
        }
      } else {
        tokens.push({ type: 'var', text: word, pos: i, len: word.length });
      }
      i += word.length;
      continue;
    }

    const ch = String.fromCodePoint(text.codePointAt(i));
    throw new ExpressionError(unknownSymbolMessage(ch, text, i), i, ch.length);
  }
  tokens.push({ type: 'eof', text: '', pos: text.length, len: 0 });
  return tokens;
}

function unknownSymbolMessage(ch, text, i) {
  if (ch === '^') {
    return 'O símbolo ^ é ambíguo (em lógica lembra ∧, em programação é ou exclusivo). Use ∧ ou & para "e" e ⊕ ou xor para "ou exclusivo".';
  }
  if (ch === '-') return 'Hífen solto: para condicional use -> e para negação use ¬, ~ ou !.';
  if (ch === '<') return 'Use <-> ou <=> para o bicondicional.';
  if (ch === '=') return text[i + 1] === '=' ? 'Para "equivale a" use <-> ou ↔.' : 'Use => ou -> para o condicional.';
  return `Símbolo não reconhecido: "${ch}" na coluna ${i + 1}.`;
}

// Tokens que podem começar um operando: entre dois operandos sem operador, vale a conjunção.
const startsOperand = (tok) => tok.type === 'var' || tok.type === 'true' || tok.type === 'false'
  || tok.type === 'not' || tok.type === 'lparen';

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.i = 0;
    this.seDepth = 0; // dentro de "se ...", a palavra "então" encerra o antecedente
  }

  peek() { return this.tokens[this.i]; }

  next() { return this.tokens[this.i++]; }

  parseExpression(minBp) {
    let left = this.parsePrefix();
    for (;;) {
      const tok = this.peek();
      if (this.seDepth > 0 && tok.type === 'imp' && tok.word) break;
      let op;
      let implicit = false;
      if (BINARY.has(tok.type)) op = tok.type;
      else if (startsOperand(tok)) { op = 'and'; implicit = true; }
      else break;
      const bp = PRECEDENCE[op];
      if (bp < minBp) break;
      if (!implicit) this.next();
      // condicional associa à direita; os demais, à esquerda
      const right = this.parseExpression(op === 'imp' ? bp : bp + 1);
      left = { type: op, left, right };
    }
    return left;
  }

  parsePostfix(node) {
    let out = node;
    while (this.peek().type === 'postnot') {
      this.next();
      out = { type: 'not', arg: out };
    }
    return out;
  }

  parsePrefix() {
    const tok = this.next();
    switch (tok.type) {
      case 'var':
        return this.parsePostfix({ type: 'var', name: tok.text });
      case 'true':
      case 'false':
        return this.parsePostfix({ type: 'const', value: tok.type === 'true' });
      case 'not':
        return { type: 'not', arg: this.parseExpression(PRECEDENCE.not) };
      case 'lparen': {
        if (this.peek().type === 'rparen') {
          throw new ExpressionError('Parênteses vazios: coloque uma expressão dentro deles.', tok.pos, 2);
        }
        const saved = this.seDepth;
        this.seDepth = 0; // um "então" entre parênteses pertence ao que está dentro deles
        const inner = this.parseExpression(1);
        this.seDepth = saved;
        const close = this.peek();
        if (close.type !== 'rparen') {
          if (close.type === 'eof') {
            throw new ExpressionError(`O "${tok.text}" aberto na coluna ${tok.pos + 1} não foi fechado.`, tok.pos, 1);
          }
          throw unexpected(close);
        }
        if (close.text !== CLOSING[tok.text]) {
          throw new ExpressionError(`Esperava "${CLOSING[tok.text]}" para fechar o "${tok.text}" da coluna ${tok.pos + 1}, mas encontrei "${close.text}".`, close.pos, 1);
        }
        this.next();
        return this.parsePostfix(inner);
      }
      case 'se': {
        // o antecedente vai até a palavra "então" (pode conter → e ↔: "se p → q então r")
        this.seDepth++;
        const antecedent = this.parseExpression(1);
        this.seDepth--;
        const then = this.peek();
        if (!(then.type === 'imp' && then.word)) {
          throw new ExpressionError('Depois de "se ..." esperava a palavra "então".', then.pos, Math.max(1, then.len));
        }
        this.next();
        const consequent = this.parseExpression(PRECEDENCE.imp);
        return { type: 'imp', left: antecedent, right: consequent };
      }
      case 'eof':
        throw new ExpressionError(this.i <= 1 ? 'Digite uma expressão.' : 'A expressão terminou cedo: falta um operando no fim.', tok.pos, 1);
      case 'postnot':
        throw new ExpressionError(`O apóstrofo (coluna ${tok.pos + 1}) nega o que vem antes dele, mas não há nada ali.`, tok.pos, 1);
      case 'rparen':
        throw new ExpressionError(`Encontrei "${tok.text}" na coluna ${tok.pos + 1} onde esperava um operando.`, tok.pos, 1);
      default:
        throw new ExpressionError(`Falta um operando antes de "${tok.text}" (coluna ${tok.pos + 1}).`, tok.pos, tok.len);
    }
  }
}

function unexpected(tok) {
  if (tok.type === 'rparen') {
    return new ExpressionError(`"${tok.text}" na coluna ${tok.pos + 1} não tem abertura correspondente.`, tok.pos, 1);
  }
  if (tok.type === 'postnot') {
    return new ExpressionError(`Apóstrofo inesperado na coluna ${tok.pos + 1}.`, tok.pos, 1);
  }
  return new ExpressionError(`"${tok.text}" inesperado na coluna ${tok.pos + 1}.`, tok.pos, Math.max(1, tok.len));
}

/** Converte o texto em árvore sintática. Lança ExpressionError com a coluna do problema. */
export function parse(src, options = {}) {
  const tokens = tokenize(src, options);
  const parser = new Parser(tokens);
  const ast = parser.parseExpression(1);
  const rest = parser.peek();
  if (rest.type !== 'eof') throw unexpected(rest);
  return ast;
}

// ---------------------------------------------------------------------------
// Impressão

const STYLES = {
  logica: { not: '¬', and: ' ∧ ', or: ' ∨ ', xor: ' ⊕ ', imp: ' → ', iff: ' ↔ ', postfix: false },
  digital: { not: "'", and: '·', or: ' + ', xor: ' ⊕ ', imp: ' → ', iff: ' ↔ ', postfix: true },
  ascii: { not: '~', and: ' & ', or: ' | ', xor: ' xor ', imp: ' -> ', iff: ' <-> ', postfix: false },
};

export const STYLE_NAMES = Object.keys(STYLES);

const ATOM = 99;

function render(node, s, full) {
  switch (node.type) {
    case 'var':
      return { text: node.name, bp: ATOM };
    case 'const':
      return { text: node.value ? '1' : '0', bp: ATOM };
    case 'not': {
      const inner = render(node.arg, s, full);
      if (s.postfix) {
        const t = inner.bp === ATOM ? inner.text : `(${inner.text})`;
        return { text: `${t}${s.not}`, bp: ATOM };
      }
      const t = inner.bp >= PRECEDENCE.not ? inner.text : `(${inner.text})`;
      return { text: `${s.not}${t}`, bp: PRECEDENCE.not };
    }
    default: {
      const bp = PRECEDENCE[node.type];
      // O condicional associa à direita, mas na impressão sempre ganha parênteses quando
      // aparece dentro de outro condicional: "(p → q) → r" e "p → (q → r)" ficam explícitos.
      const isImp = node.type === 'imp';
      const l = render(node.left, s, full);
      const r = render(node.right, s, full);
      const isBinary = (n) => BINARY.has(n.type);
      // Com `full`, todo operando binário de outro operador ganha parênteses; cadeias do mesmo
      // operador associativo (p ∧ q ∧ r) ficam sem, porque ali a ordem não muda o resultado.
      const wrapL = l.bp < bp || (l.bp === bp && isImp) || (full && isBinary(node.left) && node.left.type !== node.type);
      const wrapR = r.bp < bp || r.bp === bp || (full && isBinary(node.right));
      const lt = wrapL ? `(${l.text})` : l.text;
      const rt = wrapR ? `(${r.text})` : r.text;
      return { text: `${lt}${s[node.type]}${rt}`, bp };
    }
  }
}

/**
 * Escreve a árvore como texto. Estilos: "logica" (¬ ∧ ∨), "digital" (A' · +) e "ascii".
 * Com `full`, os parênteses mostram como a precedência agrupou a expressão.
 */
export function format(node, { style = 'logica', full = false } = {}) {
  const s = STYLES[style] || STYLES.logica;
  return render(node, s, full).text;
}

// ---------------------------------------------------------------------------
// Variáveis e avaliação

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

/** Ordena nomes de variáveis em ordem "natural": p, q, r; x2 antes de x10. */
export function sortVariables(names) {
  return [...names].sort((a, b) => collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0));
}

/** Variáveis da expressão, em ordem natural e sem repetição. */
export function variablesOf(node) {
  const set = new Set();
  walk(node, (n) => { if (n.type === 'var') set.add(n.name); });
  return sortVariables(set);
}

/** Percorre a árvore em pós-ordem (filhos antes do pai). */
export function walk(node, visit) {
  if (node.type === 'not') walk(node.arg, visit);
  else if (BINARY.has(node.type)) {
    walk(node.left, visit);
    walk(node.right, visit);
  }
  visit(node);
}

/** Avalia a expressão para uma valoração (objeto ou Map de nome para booleano). */
export function evaluate(node, env) {
  const get = (name) => {
    const v = env instanceof Map ? env.get(name) : env[name];
    if (v === undefined) throw new ExpressionError(`A variável ${name} não tem valor.`, 0, 0);
    return Boolean(v);
  };
  const ev = (n) => {
    switch (n.type) {
      case 'var': return get(n.name);
      case 'const': return n.value;
      case 'not': return !ev(n.arg);
      case 'and': return ev(n.left) && ev(n.right);
      case 'or': return ev(n.left) || ev(n.right);
      case 'xor': return ev(n.left) !== ev(n.right);
      case 'imp': return !ev(n.left) || ev(n.right);
      case 'iff': return ev(n.left) === ev(n.right);
      default: throw new Error(`nó desconhecido: ${n.type}`);
    }
  };
  return ev(node);
}

/**
 * Valor da variável `index` (0 = mais significativa) na linha `row` da tabela.
 * A linha r corresponde ao mintermo r: as variáveis formam o número binário.
 */
export function bitOf(row, index, n) {
  return (row >> (n - 1 - index)) & 1;
}

/**
 * Calcula a coluna (valores em todas as 2^n linhas) de cada nó da árvore.
 * Devolve um Map de nó para Uint8Array.
 */
export function computeColumns(root, vars) {
  const n = vars.length;
  if (n > MAX_VARS) {
    throw new ExpressionError(`A tabela suporta até ${MAX_VARS} variáveis; esta expressão tem ${n}.`, 0, 0);
  }
  const size = 1 << n;
  const index = new Map(vars.map((v, i) => [v, i]));
  const cols = new Map();
  walk(root, (node) => {
    const out = new Uint8Array(size);
    switch (node.type) {
      case 'var': {
        const i = index.get(node.name);
        if (i === undefined) throw new ExpressionError(`A variável ${node.name} não está na lista.`, 0, 0);
        for (let r = 0; r < size; r++) out[r] = bitOf(r, i, n);
        break;
      }
      case 'const':
        out.fill(node.value ? 1 : 0);
        break;
      case 'not': {
        const a = cols.get(node.arg);
        for (let r = 0; r < size; r++) out[r] = a[r] ^ 1;
        break;
      }
      default: {
        const a = cols.get(node.left);
        const b = cols.get(node.right);
        for (let r = 0; r < size; r++) {
          switch (node.type) {
            case 'and': out[r] = a[r] & b[r]; break;
            case 'or': out[r] = a[r] | b[r]; break;
            case 'xor': out[r] = a[r] ^ b[r]; break;
            case 'imp': out[r] = (a[r] ^ 1) | b[r]; break;
            default: out[r] = a[r] === b[r] ? 1 : 0;
          }
        }
      }
    }
    cols.set(node, out);
  });
  return cols;
}

/** Igualdade estrutural de duas árvores. */
export function sameTree(a, b) {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'var': return a.name === b.name;
    case 'const': return a.value === b.value;
    case 'not': return sameTree(a.arg, b.arg);
    default: return sameTree(a.left, b.left) && sameTree(a.right, b.right);
  }
}

/** Dica para quem digitou "AB" querendo A·B: nomes só com 2 a 5 maiúsculas. */
export function looksLikeJuxtaposedLetters(vars) {
  return vars.some((v) => /^[A-Z]{2,5}$/.test(v));
}

/** Variáveis que parecem palavras-chave em maiúsculas (OU, NÃO...), que não são operadores. */
export function uppercaseKeywords(vars) {
  return vars.filter((v) => v !== 'E' && KEYWORDS.has(v.toLowerCase()) && v !== v.toLowerCase());
}
