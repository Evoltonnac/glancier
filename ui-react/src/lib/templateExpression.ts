type TokenType =
  | "number"
  | "string"
  | "identifier"
  | "operator"
  | "punct"
  | "eof";

interface Token {
  type: TokenType;
  value: string;
}

type ExprNode =
  | { type: "literal"; value: any }
  | { type: "identifier"; name: string }
  | { type: "unary"; operator: string; argument: ExprNode }
  | { type: "binary"; operator: string; left: ExprNode; right: ExprNode }
  | { type: "ternary"; condition: ExprNode; consequent: ExprNode; alternate: ExprNode }
  | { type: "member"; object: ExprNode; property: ExprNode; computed: boolean }
  | { type: "call"; callee: ExprNode; args: ExprNode[] };

const FORBIDDEN_PROPS = new Set(["__proto__", "prototype", "constructor"]);

const TEMPLATE_HELPERS = {
  fixed(value: unknown, digits: unknown = 0): string {
    const n = Number(value);
    const d = Math.max(0, Math.min(8, Number(digits)));
    if (!Number.isFinite(n)) return "";
    return n.toFixed(Number.isFinite(d) ? Math.trunc(d) : 0);
  },
  round(value: unknown, digits: unknown = 0): number {
    const n = Number(value);
    const d = Math.max(0, Math.min(8, Number(digits)));
    if (!Number.isFinite(n)) return NaN;
    const factor = 10 ** (Number.isFinite(d) ? Math.trunc(d) : 0);
    return Math.round(n * factor) / factor;
  },
  floor(value: unknown): number {
    return Math.floor(Number(value));
  },
  ceil(value: unknown): number {
    return Math.ceil(Number(value));
  },
  abs(value: unknown): number {
    return Math.abs(Number(value));
  },
  min(...values: unknown[]): number {
    return Math.min(...values.map((v) => Number(v)));
  },
  max(...values: unknown[]): number {
    return Math.max(...values.map((v) => Number(v)));
  },
  clamp(value: unknown, min: unknown, max: unknown): number {
    const n = Number(value);
    const lo = Number(min);
    const hi = Number(max);
    if (!Number.isFinite(n) || !Number.isFinite(lo) || !Number.isFinite(hi)) {
      return NaN;
    }
    return Math.min(Math.max(n, lo), hi);
  },
  len(value: unknown): number {
    if (typeof value === "string" || Array.isArray(value)) return value.length;
    return 0;
  },
  lower(value: unknown): string {
    return String(value ?? "").toLowerCase();
  },
  upper(value: unknown): string {
    return String(value ?? "").toUpperCase();
  },
  string(value: unknown): string {
    return String(value ?? "");
  },
  number(value: unknown, fallback: unknown = 0): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : Number(fallback);
  },
} as const;

export type TemplateHelperName = keyof typeof TEMPLATE_HELPERS;
export const TEMPLATE_HELPER_NAMES = Object.freeze(
  Object.keys(TEMPLATE_HELPERS) as TemplateHelperName[],
);

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  const push = (type: TokenType, value: string) => tokens.push({ type, value });

  while (i < input.length) {
    const ch = input[i];

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (ch === "'" || ch === '"') {
      const quote = ch;
      i += 1;
      let value = "";
      while (i < input.length) {
        const c = input[i];
        if (c === "\\") {
          const next = input[i + 1];
          if (next === undefined) break;
          if (next === "n") value += "\n";
          else if (next === "t") value += "\t";
          else value += next;
          i += 2;
          continue;
        }
        if (c === quote) {
          i += 1;
          break;
        }
        value += c;
        i += 1;
      }
      push("string", value);
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(input[i + 1] || ""))) {
      const start = i;
      i += 1;
      while (i < input.length && /[0-9.]/.test(input[i])) i += 1;
      push("number", input.slice(start, i));
      continue;
    }

    if (/[A-Za-z_$]/.test(ch)) {
      const start = i;
      i += 1;
      while (i < input.length && /[A-Za-z0-9_$]/.test(input[i])) i += 1;
      push("identifier", input.slice(start, i));
      continue;
    }

    const three = input.slice(i, i + 3);
    const two = input.slice(i, i + 2);
    if (three === "===" || three === "!==") {
      push("operator", three);
      i += 3;
      continue;
    }
    if (
      two === "&&" ||
      two === "||" ||
      two === "??" ||
      two === "==" ||
      two === "!=" ||
      two === ">=" ||
      two === "<="
    ) {
      push("operator", two);
      i += 2;
      continue;
    }

    if ("+-*/%><!".includes(ch)) {
      push("operator", ch);
      i += 1;
      continue;
    }

    if ("().,[]?:".includes(ch)) {
      push("punct", ch);
      i += 1;
      continue;
    }

    throw new Error(`Unexpected character: ${ch}`);
  }

  push("eof", "");
  return tokens;
}

class Parser {
  private readonly tokens: Token[];
  private index = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parseExpression(): ExprNode {
    const node = this.parseTernary();
    this.expect("eof");
    return node;
  }

  private parseTernary(): ExprNode {
    const condition = this.parseNullish();
    if (this.match("punct", "?")) {
      const consequent = this.parseTernary();
      this.expect("punct", ":");
      const alternate = this.parseTernary();
      return { type: "ternary", condition, consequent, alternate };
    }
    return condition;
  }

  private parseNullish(): ExprNode {
    let node = this.parseLogicalOr();
    while (this.match("operator", "??")) {
      const right = this.parseLogicalOr();
      node = { type: "binary", operator: "??", left: node, right };
    }
    return node;
  }

  private parseLogicalOr(): ExprNode {
    let node = this.parseLogicalAnd();
    while (this.match("operator", "||")) {
      const right = this.parseLogicalAnd();
      node = { type: "binary", operator: "||", left: node, right };
    }
    return node;
  }

  private parseLogicalAnd(): ExprNode {
    let node = this.parseEquality();
    while (this.match("operator", "&&")) {
      const right = this.parseEquality();
      node = { type: "binary", operator: "&&", left: node, right };
    }
    return node;
  }

  private parseEquality(): ExprNode {
    let node = this.parseComparison();
    while (
      this.match("operator", "==") ||
      this.match("operator", "!=") ||
      this.match("operator", "===") ||
      this.match("operator", "!==")
    ) {
      const operator = this.previous().value;
      const right = this.parseComparison();
      node = { type: "binary", operator, left: node, right };
    }
    return node;
  }

  private parseComparison(): ExprNode {
    let node = this.parseAdditive();
    while (
      this.match("operator", ">") ||
      this.match("operator", ">=") ||
      this.match("operator", "<") ||
      this.match("operator", "<=")
    ) {
      const operator = this.previous().value;
      const right = this.parseAdditive();
      node = { type: "binary", operator, left: node, right };
    }
    return node;
  }

  private parseAdditive(): ExprNode {
    let node = this.parseMultiplicative();
    while (this.match("operator", "+") || this.match("operator", "-")) {
      const operator = this.previous().value;
      const right = this.parseMultiplicative();
      node = { type: "binary", operator, left: node, right };
    }
    return node;
  }

  private parseMultiplicative(): ExprNode {
    let node = this.parseUnary();
    while (
      this.match("operator", "*") ||
      this.match("operator", "/") ||
      this.match("operator", "%")
    ) {
      const operator = this.previous().value;
      const right = this.parseUnary();
      node = { type: "binary", operator, left: node, right };
    }
    return node;
  }

  private parseUnary(): ExprNode {
    if (
      this.match("operator", "!") ||
      this.match("operator", "+") ||
      this.match("operator", "-")
    ) {
      return {
        type: "unary",
        operator: this.previous().value,
        argument: this.parseUnary(),
      };
    }
    return this.parseMember();
  }

  private parseMember(): ExprNode {
    let node = this.parsePrimary();

    while (true) {
      if (this.match("punct", ".")) {
        const name = this.expect("identifier").value;
        node = {
          type: "member",
          object: node,
          property: { type: "literal", value: name },
          computed: false,
        };
        continue;
      }

      if (this.match("punct", "[")) {
        const property = this.parseTernary();
        this.expect("punct", "]");
        node = { type: "member", object: node, property, computed: true };
        continue;
      }

      if (this.match("punct", "(")) {
        const args: ExprNode[] = [];
        if (!this.check("punct", ")")) {
          do {
            args.push(this.parseTernary());
          } while (this.match("punct", ","));
        }
        this.expect("punct", ")");
        node = { type: "call", callee: node, args };
        continue;
      }

      break;
    }

    return node;
  }

  private parsePrimary(): ExprNode {
    if (this.match("number")) {
      return { type: "literal", value: Number(this.previous().value) };
    }

    if (this.match("string")) {
      return { type: "literal", value: this.previous().value };
    }

    if (this.match("identifier")) {
      const value = this.previous().value;
      if (value === "true") return { type: "literal", value: true };
      if (value === "false") return { type: "literal", value: false };
      if (value === "null") return { type: "literal", value: null };
      if (value === "undefined") return { type: "literal", value: undefined };
      return { type: "identifier", name: value };
    }

    if (this.match("punct", "(")) {
      const node = this.parseTernary();
      this.expect("punct", ")");
      return node;
    }

    throw new Error(`Unexpected token: ${this.peek().type} ${this.peek().value}`);
  }

  private expect(type: TokenType, value?: string): Token {
    const token = this.peek();
    if (token.type !== type || (value !== undefined && token.value !== value)) {
      throw new Error(`Expected ${type} ${value || ""}, got ${token.type} ${token.value}`);
    }
    this.index += 1;
    return token;
  }

  private match(type: TokenType, value?: string): boolean {
    const token = this.peek();
    if (token.type !== type) return false;
    if (value !== undefined && token.value !== value) return false;
    this.index += 1;
    return true;
  }

  private check(type: TokenType, value?: string): boolean {
    const token = this.peek();
    if (token.type !== type) return false;
    if (value !== undefined && token.value !== value) return false;
    return true;
  }

  private previous(): Token {
    return this.tokens[this.index - 1];
  }

  private peek(): Token {
    return this.tokens[this.index];
  }
}

function safePropKey(value: unknown): string | number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  if (FORBIDDEN_PROPS.has(value)) return null;
  return value;
}

function evalNode(node: ExprNode, context: Record<string, any>): any {
  switch (node.type) {
    case "literal":
      return node.value;
    case "identifier":
      return context[node.name];
    case "member": {
      const obj = evalNode(node.object, context);
      if (obj === null || obj === undefined) return undefined;
      const rawProp = node.computed
        ? evalNode(node.property, context)
        : (node.property as { type: "literal"; value: string }).value;
      const prop = safePropKey(rawProp);
      if (prop === null) return undefined;
      return obj[prop as keyof typeof obj];
    }
    case "call": {
      if (node.callee.type !== "identifier") return undefined;
      const helper = TEMPLATE_HELPERS[node.callee.name as TemplateHelperName] as
        | ((...args: any[]) => any)
        | undefined;
      if (typeof helper !== "function") return undefined;
      const args = node.args.map((arg) => evalNode(arg, context));
      return helper(...args);
    }
    case "unary": {
      const value = evalNode(node.argument, context);
      if (node.operator === "!") return !value;
      if (node.operator === "+") return +value;
      if (node.operator === "-") return -value;
      return undefined;
    }
    case "binary": {
      if (node.operator === "&&") {
        const left = evalNode(node.left, context);
        return left ? evalNode(node.right, context) : left;
      }
      if (node.operator === "||") {
        const left = evalNode(node.left, context);
        return left ? left : evalNode(node.right, context);
      }
      if (node.operator === "??") {
        const left = evalNode(node.left, context);
        return left ?? evalNode(node.right, context);
      }

      const left = evalNode(node.left, context);
      const right = evalNode(node.right, context);

      switch (node.operator) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          return left / right;
        case "%":
          return left % right;
        case ">":
          return left > right;
        case ">=":
          return left >= right;
        case "<":
          return left < right;
        case "<=":
          return left <= right;
        case "==":
          return left == right;
        case "!=":
          return left != right;
        case "===":
          return left === right;
        case "!==":
          return left !== right;
        default:
          return undefined;
      }
    }
    case "ternary":
      return evalNode(node.condition, context)
        ? evalNode(node.consequent, context)
        : evalNode(node.alternate, context);
    default:
      return undefined;
  }
}

export function evaluateTemplateExpression(
  expression: string,
  context: Record<string, any>,
): any {
  const ast = getCachedAst(expression);
  if (!ast) {
    return undefined;
  }
  return evalNode(ast, context);
}

const TEMPLATE_AST_CACHE_MAX = 256;
const templateAstCache = new Map<string, ExprNode | null>();

function getCachedAst(expression: string): ExprNode | null {
  if (templateAstCache.has(expression)) {
    return templateAstCache.get(expression) ?? null;
  }

  let ast: ExprNode | null = null;
  try {
    const parser = new Parser(tokenize(expression));
    ast = parser.parseExpression();
  } catch {
    ast = null;
  }

  templateAstCache.set(expression, ast);
  if (templateAstCache.size > TEMPLATE_AST_CACHE_MAX) {
    const oldestKey = templateAstCache.keys().next().value;
    if (oldestKey !== undefined) {
      templateAstCache.delete(oldestKey);
    }
  }

  return ast;
}
