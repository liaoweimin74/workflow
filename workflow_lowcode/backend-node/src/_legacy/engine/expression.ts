/**
 * ${...} UEL 子集求值器（Task 13-6）
 * 依据 engine-semantics.md C.9：网关出线条件 = UEL 表达式。
 * 支持语法子集：
 *   - 变量引用：${initiator} / ${amount} / ${nrOfCompletedInstances}
 *   - 字面量：数字 / '字符串' / "字符串" / true / false / null
 *   - 比较：== != > < >= <= eq neq gt lt ge le（uel 别名）
 *   - 逻辑：&& || ! / and or not
 *   - 算术：+ - * / %（数字）
 *   - 括号
 * 求值上下文 = 实例变量 + 发起人（initiator）+ MI 计数变量（nrOfInstances 等）。
 */

export type UelValue = string | number | boolean | null | undefined | UelValue[];

interface Tok {
  t: "num" | "str" | "id" | "op";
  v: string;
}

function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      toks.push({ t: "num", v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let s = "";
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\" && j + 1 < src.length) { s += src[j + 1]; j += 2; continue; }
        s += src[j];
        j++;
      }
      toks.push({ t: "str", v: s });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < src.length && /[\w$]/.test(src[j])) j++;
      toks.push({ t: "id", v: src.slice(i, j) });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (["==", "!=", ">=", "<=", "&&", "||"].includes(two)) { toks.push({ t: "op", v: two }); i += 2; continue; }
    if ("+-*/%()!<>".includes(c)) { toks.push({ t: "op", v: c }); i++; continue; }
    throw new Error(`UEL 表达式包含不支持的字符: "${c}" (@${i})`);
  }
  return toks;
}

/** UEL 关键字别名归一 */
const OP_ALIAS: Record<string, string> = {
  eq: "==", ne: "!=", neq: "!=", gt: ">", lt: "<", ge: ">=", le: "<=", gte: ">=", lte: "<=",
  and: "&&", or: "||", not: "!",
};

function truthy(v: UelValue): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v !== "" && v !== "false" && v !== "0";
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}

function num(v: UelValue): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function eqVal(a: UelValue, b: UelValue): boolean {
  if (a === b) return true;
  if (a === null || a === undefined) return b === null || b === undefined || b === "" || b === "null";
  if (b === null || b === undefined) return a === "" || a === "null";
  // 数字/布尔字面量宽松比较（Java UEL 中 ${approved == true} 常遇字符串 "true"）
  const na = Number(a), nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && String(a).trim() !== "" && String(b).trim() !== "") return na === nb;
  return String(a) === String(b);
}

class Parser {
  private pos = 0;
  constructor(private toks: Tok[], private ctx: Record<string, UelValue>) {}

  private peek(): Tok | null { return this.toks[this.pos] ?? null; }
  private next(): Tok | null { return this.toks[this.pos++] ?? null; }
  private isOp(v: string): boolean {
    const t = this.peek();
    if (!t) return false;
    const val = t.t === "op" ? t.v : OP_ALIAS[t.v.toLowerCase()] ?? "";
    return val === v;
  }
  private eatOp(v: string): boolean {
    if (this.isOp(v)) { this.pos++; return true; }
    return false;
  }

  parse(): UelValue {
    const v = this.parseOr();
    return v;
  }
  private parseOr(): UelValue {
    let left = this.parseAnd();
    while (this.isOp("||")) {
      this.pos++;
      const right = this.parseAnd();
      left = truthy(left) || truthy(right);
    }
    return left;
  }
  private parseAnd(): UelValue {
    let left = this.parseNot();
    while (this.isOp("&&")) {
      this.pos++;
      const right = this.parseNot();
      left = truthy(left) && truthy(right);
    }
    return left;
  }
  private parseNot(): UelValue {
    if (this.isOp("!")) { this.pos++; return !truthy(this.parseNot()); }
    return this.parseCompare();
  }
  private parseCompare(): UelValue {
    const left = this.parseAdd();
    const t = this.peek();
    if (t && (t.t === "op" || OP_ALIAS[t.v.toLowerCase()])) {
      const op = t.t === "op" ? t.v : OP_ALIAS[t.v.toLowerCase()];
      if (["==", "!=", ">", "<", ">=", "<="].includes(op)) {
        this.pos++;
        const right = this.parseAdd();
        switch (op) {
          case "==": return eqVal(left, right);
          case "!=": return !eqVal(left, right);
          case ">": return num(left) > num(right);
          case "<": return num(left) < num(right);
          case ">=": return num(left) >= num(right);
          case "<=": return num(left) <= num(right);
        }
      }
    }
    return left;
  }
  private parseAdd(): UelValue {
    let left = this.parseMul();
    for (;;) {
      if (this.isOp("+")) { this.pos++; const r = this.parseMul(); left = num(left) + num(r); }
      else if (this.isOp("-")) { this.pos++; const r = this.parseMul(); left = num(left) - num(r); }
      else break;
    }
    return left;
  }
  private parseMul(): UelValue {
    let left = this.parseUnary();
    for (;;) {
      if (this.isOp("*")) { this.pos++; left = num(left) * num(this.parseUnary()); }
      else if (this.isOp("/")) { this.pos++; left = num(left) / num(this.parseUnary()); }
      else if (this.isOp("%")) { this.pos++; left = num(left) % num(this.parseUnary()); }
      else break;
    }
    return left;
  }
  private parseUnary(): UelValue {
    if (this.isOp("-")) { this.pos++; return -num(this.parseUnary()); }
    return this.parsePrimary();
  }
  private parsePrimary(): UelValue {
    const t = this.next();
    if (!t) throw new Error("UEL 表达式意外结束");
    if (t.t === "num") return Number(t.v);
    if (t.t === "str") return t.v;
    if (t.t === "op" && t.v === "(") {
      const v = this.parseOr();
      if (!this.eatOp(")")) throw new Error("UEL 括号不匹配");
      return v;
    }
    if (t.t === "id") {
      const k = t.v.toLowerCase();
      if (k === "true") return true;
      if (k === "false") return false;
      if (k === "null") return null;
      if (k === "empty") return null;
      if (Object.prototype.hasOwnProperty.call(this.ctx, t.v)) return this.ctx[t.v];
      // 未知变量 → null（Flowable 对未定义变量求值失败/undefined 的宽松等价）
      return null;
    }
    throw new Error(`UEL 意外 token: ${t.v}`);
  }
}

/** 求值单个 ${...} 内层表达式。raw 允许带 ${} 包裹。 */
export function evalExpression(raw: string, ctx: Record<string, UelValue>): UelValue {
  const inner = raw.trim().replace(/^\$\{/, "").replace(/\}$/, "").trim();
  if (!inner) return null;
  const toks = lex(inner);
  if (!toks.length) return null;
  return new Parser(toks, ctx).parse();
}

/** ${var} 变量引用提取：整串就是一个引用时返回变量值（用于 assignee=${manager} 场景） */
export function resolveVarRef(raw: string | undefined, ctx: Record<string, UelValue>): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^\$\{\s*([A-Za-z_$][\w$]*)\s*\}$/);
  if (!m) return raw.startsWith("${") ? null : raw; // 纯文本（固定用户 ID）
  const v = ctx[m[1]];
  return v === null || v === undefined ? null : String(v);
}

/** {{var}} 占位替换（backend-logic http URL/参数用，对齐 VariableResolver） */
export function substituteDoubles(template: string, ctx: Record<string, UelValue>): string {
  return template.replace(/\{\{\s*([\w$]+)\s*\}\}/g, (_m, name: string) => {
    const v = ctx[name];
    return v === null || v === undefined ? "" : String(v);
  });
}
