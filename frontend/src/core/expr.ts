/**
 * Safe mathematical expression evaluator.
 *
 * SECURITY: expressions are parsed by a hand-written recursive-descent parser
 * into a small AST. Nothing is passed to `eval`, `Function`, or any dynamic
 * code loader, so an expression can never reach the JavaScript runtime. The
 * grammar, operator set, constants and functions are fixed and documented in
 * docs/scientific-assumptions.md.
 *
 * Supported grammar:
 *   expr    := term (('+'|'-') term)*
 *   term    := unary (('*'|'/'|'%') unary)*
 *   unary   := ('+'|'-') unary | power
 *   power   := postfix ('^' unary)?          (right associative)
 *   postfix := primary ('!')*
 *   primary := number | constant | name '(' args ')' | '(' expr ')'
 */

export class ExprError extends Error {
  constructor(message: string, public position?: number) {
    super(message);
    this.name = 'ExprError';
  }
}

export type Node =
  | { t: 'num'; v: number }
  | { t: 'var'; name: string }
  | { t: 'bin'; op: '+' | '-' | '*' | '/' | '%' | '^'; l: Node; r: Node }
  | { t: 'neg'; a: Node }
  | { t: 'fact'; a: Node }
  | { t: 'call'; name: string; args: Node[] };

export const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  tau: 2 * Math.PI,
  e: Math.E,
  phi: (1 + Math.sqrt(5)) / 2,
};

type Fn = { arity: number | 'var'; fn: (...a: number[]) => number; doc: string };

const safeLog = (x: number, base: number) => {
  if (x <= 0) throw new ExprError('logarithm is only defined for positive arguments');
  return Math.log(x) / Math.log(base);
};
const safeSqrt = (x: number) => {
  if (x < 0) throw new ExprError('sqrt of a negative number is not real; this evaluator is real-valued');
  return Math.sqrt(x);
};

export const FUNCTIONS: Record<string, Fn> = {
  sin: { arity: 1, fn: Math.sin, doc: 'sin(x), x in radians' },
  cos: { arity: 1, fn: Math.cos, doc: 'cos(x)' },
  tan: { arity: 1, fn: Math.tan, doc: 'tan(x)' },
  asin: { arity: 1, fn: Math.asin, doc: 'arcsin(x), |x| ≤ 1' },
  acos: { arity: 1, fn: Math.acos, doc: 'arccos(x), |x| ≤ 1' },
  atan: { arity: 1, fn: Math.atan, doc: 'arctan(x)' },
  atan2: { arity: 2, fn: Math.atan2, doc: 'atan2(y, x)' },
  sinh: { arity: 1, fn: Math.sinh, doc: 'sinh(x)' },
  cosh: { arity: 1, fn: Math.cosh, doc: 'cosh(x)' },
  tanh: { arity: 1, fn: Math.tanh, doc: 'tanh(x)' },
  exp: { arity: 1, fn: Math.exp, doc: 'e^x' },
  ln: { arity: 1, fn: (x) => safeLog(x, Math.E), doc: 'natural logarithm' },
  log: { arity: 1, fn: (x) => safeLog(x, 10), doc: 'base-10 logarithm' },
  log10: { arity: 1, fn: (x) => safeLog(x, 10), doc: 'base-10 logarithm' },
  log2: { arity: 1, fn: (x) => safeLog(x, 2), doc: 'base-2 logarithm' },
  sqrt: { arity: 1, fn: safeSqrt, doc: 'square root (real)' },
  cbrt: { arity: 1, fn: Math.cbrt, doc: 'cube root' },
  abs: { arity: 1, fn: Math.abs, doc: 'absolute value' },
  sign: { arity: 1, fn: Math.sign, doc: 'sign: −1, 0 or 1' },
  floor: { arity: 1, fn: Math.floor, doc: 'floor' },
  ceil: { arity: 1, fn: Math.ceil, doc: 'ceiling' },
  round: { arity: 1, fn: Math.round, doc: 'round to nearest integer' },
  min: { arity: 'var', fn: Math.min, doc: 'min(a, b, …)' },
  max: { arity: 'var', fn: Math.max, doc: 'max(a, b, …)' },
  pow: { arity: 2, fn: Math.pow, doc: 'pow(x, y) = x^y' },
  mod: { arity: 2, fn: (a, b) => a % b, doc: 'mod(a, b)' },
  /** Normalised sinc: sin(πx)/(πx); sinc(0) = 1. */
  sinc: {
    arity: 1,
    fn: (x) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)),
    doc: 'sin(πx)/(πx), sinc(0)=1',
  },
  /** Heaviside step with u(0) = 1 (right-continuous convention). */
  heaviside: { arity: 1, fn: (x) => (x >= 0 ? 1 : 0), doc: 'u(x) = 1 for x ≥ 0, else 0' },
  u: { arity: 1, fn: (x) => (x >= 0 ? 1 : 0), doc: 'alias of heaviside' },
  deg: { arity: 1, fn: (x) => (x * 180) / Math.PI, doc: 'radians → degrees' },
  rad: { arity: 1, fn: (x) => (x * Math.PI) / 180, doc: 'degrees → radians' },
  db: { arity: 1, fn: (x) => 20 * Math.log10(Math.abs(x) || 1e-300), doc: '20·log10|x| (amplitude dB)' },
};

interface Token {
  type: 'num' | 'name' | 'op' | 'lparen' | 'rparen' | 'comma' | 'end';
  value: string;
  pos: number;
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      // scientific notation: 1e-3
      if (j < src.length && /[eE]/.test(src[j]) && /[0-9+-]/.test(src[j + 1] ?? '')) {
        j++;
        if (/[+-]/.test(src[j])) j++;
        while (j < src.length && /[0-9]/.test(src[j])) j++;
      }
      const raw = src.slice(i, j);
      if (!/^\d*\.?\d+(?:[eE][+-]?\d+)?$|^\d+\.$/.test(raw)) throw new ExprError(`Invalid number "${raw}"`, i);
      tokens.push({ type: 'num', value: raw, pos: i });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      tokens.push({ type: 'name', value: src.slice(i, j), pos: i });
      i = j;
      continue;
    }
    if ('+-*/^%!'.includes(ch)) {
      tokens.push({ type: 'op', value: ch, pos: i });
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen', value: ch, pos: i });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ch, pos: i });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma', value: ch, pos: i });
      i++;
      continue;
    }
    throw new ExprError(`Unexpected character "${ch}"`, i);
  }
  tokens.push({ type: 'end', value: '', pos: src.length });
  return tokens;
}

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0) throw new ExprError('factorial requires a non-negative integer');
  if (n > 170) throw new ExprError('factorial argument too large (limit 170)');
  let r = 1;
  for (let k = 2; k <= n; k++) r *= k;
  return r;
}

class Parser {
  private i = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.i];
  }
  private take(): Token {
    return this.tokens[this.i++];
  }
  private expect(type: Token['type'], what: string): Token {
    const t = this.peek();
    if (t.type !== type) throw new ExprError(`Expected ${what} but found "${t.value || 'end of expression'}"`, t.pos);
    return this.take();
  }

  parse(): Node {
    const node = this.expr();
    if (this.peek().type !== 'end') {
      const t = this.peek();
      throw new ExprError(`Unexpected "${t.value}" after a complete expression`, t.pos);
    }
    return node;
  }

  private expr(): Node {
    let left = this.term();
    for (;;) {
      const t = this.peek();
      if (t.type === 'op' && (t.value === '+' || t.value === '-')) {
        this.take();
        left = { t: 'bin', op: t.value as '+' | '-', l: left, r: this.term() };
      } else return left;
    }
  }

  private term(): Node {
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      if (t.type === 'op' && (t.value === '*' || t.value === '/' || t.value === '%')) {
        this.take();
        left = { t: 'bin', op: t.value as '*' | '/' | '%', l: left, r: this.unary() };
      } else return left;
    }
  }

  private unary(): Node {
    const t = this.peek();
    if (t.type === 'op' && (t.value === '+' || t.value === '-')) {
      this.take();
      const a = this.unary();
      return t.value === '-' ? { t: 'neg', a } : a;
    }
    return this.power();
  }

  private power(): Node {
    const base = this.postfix();
    const t = this.peek();
    if (t.type === 'op' && t.value === '^') {
      this.take();
      const exponent = this.unary(); // right associative, allows 2^-1
      return { t: 'bin', op: '^', l: base, r: exponent };
    }
    return base;
  }

  private postfix(): Node {
    let node = this.primary();
    while (this.peek().type === 'op' && this.peek().value === '!') {
      this.take();
      node = { t: 'fact', a: node };
    }
    return node;
  }

  private primary(): Node {
    const t = this.take();
    if (t.type === 'num') return { t: 'num', v: Number(t.value) };
    if (t.type === 'lparen') {
      const node = this.expr();
      this.expect('rparen', '")"');
      return node;
    }
    if (t.type === 'name') {
      const name = t.value;
      if (this.peek().type === 'lparen') {
        this.take();
        const args: Node[] = [];
        if (this.peek().type !== 'rparen') {
          args.push(this.expr());
          while (this.peek().type === 'comma') {
            this.take();
            args.push(this.expr());
          }
        }
        this.expect('rparen', '")"');
        const fn = FUNCTIONS[name];
        if (!fn) throw new ExprError(`Unknown function "${name}"`, t.pos);
        if (fn.arity === 'var') {
          if (args.length === 0) throw new ExprError(`Function "${name}" needs at least one argument`, t.pos);
        } else if (args.length !== fn.arity) {
          throw new ExprError(`Function "${name}" expects ${fn.arity} argument(s), got ${args.length}`, t.pos);
        }
        return { t: 'call', name, args };
      }
      if (name in CONSTANTS) return { t: 'num', v: CONSTANTS[name] };
      return { t: 'var', name };
    }
    throw new ExprError(`Unexpected "${t.value || 'end of expression'}"`, t.pos);
  }
}

/** Parse a source string into an AST. Throws `ExprError` with a position on failure. */
export function parseExpression(source: string): Node {
  if (!source.trim()) throw new ExprError('Expression is empty');
  if (source.length > 2000) throw new ExprError('Expression is too long (limit 2000 characters)');
  return new Parser(tokenize(source)).parse();
}

/** Evaluate an AST with the given variable bindings (all real numbers). */
export function evaluateNode(node: Node, scope: Record<string, number> = {}): number {
  const v = evalNode(node, scope);
  if (!Number.isFinite(v)) {
    if (Number.isNaN(v)) throw new ExprError('Result is not a number (check domains, e.g. 0/0)');
    throw new ExprError('Result is not finite (overflow or division by zero)');
  }
  return v;
}

function evalNode(node: Node, scope: Record<string, number>): number {
  switch (node.t) {
    case 'num':
      return node.v;
    case 'var': {
      if (!(node.name in scope)) throw new ExprError(`Unknown variable "${node.name}"`);
      return scope[node.name];
    }
    case 'neg':
      return -evalNode(node.a, scope);
    case 'fact':
      return factorial(evalNode(node.a, scope));
    case 'bin': {
      const l = evalNode(node.l, scope);
      switch (node.op) {
        case '+':
          return l + evalNode(node.r, scope);
        case '-':
          return l - evalNode(node.r, scope);
        case '*':
          return l * evalNode(node.r, scope);
        case '/': {
          const r = evalNode(node.r, scope);
          if (r === 0) throw new ExprError('Division by zero');
          return l / r;
        }
        case '%': {
          const r = evalNode(node.r, scope);
          if (r === 0) throw new ExprError('Modulo by zero');
          return l % r;
        }
        case '^': {
          const r = evalNode(node.r, scope);
          const v = Math.pow(l, r);
          if (Number.isNaN(v)) throw new ExprError(`Cannot raise ${l} to the power ${r} as a real number`);
          return v;
        }
      }
    }
    // eslint-disable-next-line no-fallthrough
    case 'call': {
      const fn = FUNCTIONS[node.name];
      if (!fn) throw new ExprError(`Unknown function "${node.name}"`);
      const args = node.args.map((a) => evalNode(a, scope));
      return fn.fn(...args);
    }
  }
  throw new ExprError('Malformed expression');
}

/** Convenience: parse + evaluate in one call. */
export function evalExpression(source: string, scope: Record<string, number> = {}): number {
  return evaluateNode(parseExpression(source), scope);
}

/** Render an AST back to a fully parenthesised infix string (for display). */
export function stringify(node: Node, parentPrec = 0): string {
  const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 };
  const wrap = (s: string, p: number) => (p < parentPrec ? `(${s})` : s);
  switch (node.t) {
    case 'num':
      return String(node.v);
    case 'var':
      return node.name;
    case 'neg':
      return wrap(`-${stringify(node.a, 4)}`, 4);
    case 'fact':
      return `${stringify(node.a, 5)}!`;
    case 'bin': {
      const p = prec[node.op];
      return wrap(`${stringify(node.l, p)} ${node.op === '*' ? '·' : node.op} ${stringify(node.r, p + (node.op === '^' ? 0 : 1))}`, p);
    }
    case 'call':
      return `${node.name}(${node.args.map((a) => stringify(a, 0)).join(', ')})`;
  }
}

/** Collect variable names referenced by an AST (excluding constants). */
export function collectVariables(node: Node, out = new Set<string>()): Set<string> {
  if (node.t === 'var') out.add(node.name);
  else if (node.t === 'bin') {
    collectVariables(node.l, out);
    collectVariables(node.r, out);
  } else if (node.t === 'neg' || node.t === 'fact') collectVariables(node.a, out);
  else if (node.t === 'call') node.args.forEach((a) => collectVariables(a, out));
  return out;
}
