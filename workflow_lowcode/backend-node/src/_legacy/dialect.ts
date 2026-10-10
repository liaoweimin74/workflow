/**
 * H2(MySQL MODE) → SQLite 方言翻译层（Task 13-5）
 *
 * 纯函数 translateSql(sql)：把管理员 SQL 模板 / 内部生成 SQL 中的 H2/MySQL 方言
 * 安全改写为 SQLite 等价形式。改写点（对齐 docs/migration/data-layer-semantics.md §10.3/§10.4）：
 *
 *  - CONCAT(a,b,...)              → (a || b || ...)          —— 保守改写
 *  - NOW()                        → datetime('now','localtime')
 *  - CURDATE() / CURTIME()        → date('now','localtime') / time('now','localtime')
 *  - DATE_FORMAT(x,'fmt')         → strftime('fmt*', x)      —— %i→%M、%s→%S（其余 MySQL tokens 透传）
 *  - CAST(x AS SIGNED/UNSIGNED)   → CAST(x AS INTEGER)
 *  - CAST(x AS DECIMAL(p,s))      → CAST(x AS REAL)
 *  - JSON_UNQUOTE(JSON_EXTRACT(…))→ json_extract(…)
 *  - JSON_EXTRACT(…)              → json_extract(…)（裸调用）
 *  - JSON_CONTAINS(a,b)           → EXISTS (SELECT 1 FROM json_each(guard(a)) WHERE json_each.value = json(b))
 *  - JSON_OVERLAPS(a,b)           → EXISTS (SELECT 1 FROM json_each(guard(a)) WHERE json_each.value IN
 *                                     (SELECT value FROM json_each(json(b))))
 *  - FETCH FIRST n ROWS ONLY      → LIMIT n（SQLite 不支持 FETCH FIRST）
 *
 *  - IFNULL / IIF：SQLite 原生支持，不改写（规格 §10.3）
 *  - LIMIT n / LIMIT n,m / LIMIT ? OFFSET ?：SQLite 语义与 MySQL 一致，不改写
 *  - 反引号标识符：SQLite 兼容，保留
 *
 * 所有扫描均为「引号感知」：单引号字符串（'' 转义）、双引号/反引号标识符内部的
 * 内容不会被误改写。guard(x) = CASE WHEN json_valid(x) THEN x ELSE json_array() END，
 * 用于容忍 NULL / 非 JSON 文本列（json_each 对非法 JSON 会抛错）。
 */

/** 引号感知扫描工具：跳过 '...' / "..." / `...` 段（支持成对转义） */
function skipQuoted(sql: string, start: number): number {
  const quote = sql[start];
  let i = start + 1;
  while (i < sql.length) {
    if (sql[i] === quote) {
      if (sql[i + 1] === quote) { i += 2; continue; } // '' / "" 转义
      return i; // 闭合引号位置
    }
    i++;
  }
  return sql.length; // 未闭合：到尾
}

/** 在 from..to 内查找深度 0 的顶层逗号（引号感知） */
function topLevelCommas(segment: string): number[] {
  const out: number[] = [];
  let depth = 0;
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i];
    if (c === "'" || c === '"' || c === "`") { i = skipQuoted(segment, i); continue; }
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) out.push(i);
  }
  return out;
}

/** 求与 segment[0] 处 "(" 配对的 ")" 下标（引号感知；segment 以 "(" 开头） */
function matchParen(segment: string): number {
  let depth = 0;
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i];
    if (c === "'" || c === '"' || c === "`") { i = skipQuoted(segment, i); continue; }
    if (c === "(") depth++;
    else if (c === ")") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function isWordChar(c: string): boolean {
  return /[A-Za-z0-9_]/.test(c);
}

/** 查找下一个函数调用出现位置（引号感知：字符串/标识符内部不命中）；未命中返回 null */
function findCall(sql: string, from: number, word: string): { start: number; open: number; close: number } | null {
  const w = word.toLowerCase();
  let i = Math.max(from, 0);
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'" || c === '"' || c === "`") { i = skipQuoted(sql, i) + 1; continue; }
    if (sql.toLowerCase().startsWith(w, i)) {
      const before = i === 0 || !isWordChar(sql[i - 1]);
      let j = i + w.length;
      while (j < sql.length && sql[j] === " ") j++;
      if (before && sql[j] === "(") {
        const close = matchParen(sql.slice(j));
        if (close < 0) return null;
        return { start: i, open: j, close: j + close };
      }
    }
    i++;
  }
  return null;
}

function replaceRange(sql: string, start: number, end: number, replacement: string): string {
  return sql.slice(0, start) + replacement + sql.slice(end + 1);
}

const MAX_PASSES = 64;

/** CONCAT(a, b, ...) → (a || b || ...) */
function rewriteConcat(sql: string): string {
  let out = sql;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const hit = findCall(out, 0, "CONCAT");
    if (!hit) break;
    const args = out.slice(hit.open + 1, hit.close);
    const commas = topLevelCommas(args);
    const parts: string[] = [];
    let prev = 0;
    for (const pos of commas) { parts.push(args.slice(prev, pos).trim()); prev = pos + 1; }
    parts.push(args.slice(prev).trim());
    out = replaceRange(out, hit.start, hit.close, "(" + parts.join(" || ") + ")");
  }
  return out;
}

/** NOW() / CURDATE() / CURTIME() → SQLite datetime/date/time */
function rewriteSimpleFuncs(sql: string): string {
  let out = sql;
  const table: Array<[string, string]> = [
    ["NOW", "datetime('now','localtime')"],
    ["CURDATE", "date('now','localtime')"],
    ["CURTIME", "time('now','localtime')"],
  ];
  for (const [word, repl] of table) {
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const hit = findCall(out, 0, word);
      if (!hit) break;
      if (out.slice(hit.open + 1, hit.close).trim() !== "") break; // 带参则非目标函数
      out = replaceRange(out, hit.start, hit.close, repl);
    }
  }
  return out;
}

/** CAST(x AS SIGNED|UNSIGNED|DECIMAL(p,s)) → INTEGER / REAL */
function rewriteCast(sql: string): string {
  let out = sql;
  let cursor = 0;
  for (let pass = 0; pass < MAX_PASSES * 4; pass++) {
    const hit = findCall(out, cursor, "CAST");
    if (!hit) break;
    const body = out.slice(hit.open + 1, hit.close);
    // 找深度 0 的 "AS"（词边界）
    let asIdx = -1;
    let typeStart = -1;
    let depth = 0;
    const lowerBody = body.toLowerCase();
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (c === "'" || c === '"' || c === "`") { i = skipQuoted(body, i); continue; }
      if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (
        depth === 0 && lowerBody.startsWith("as", i) &&
        (i === 0 || !isWordChar(body[i - 1])) &&
        !isWordChar(body[i + 2] ?? "")
      ) {
        // 确认其后为类型部分（跳过空格）
        let k = i + 2;
        while (k < body.length && body[k] === " ") k++;
        if (k > i + 2 && k < body.length) { asIdx = i; typeStart = k; break; }
      }
    }
    if (asIdx < 0) break; // 非 CAST(x AS t) 形态，跳过（避免死循环）
    const expr = body.slice(0, asIdx).trim();
    const typePart = body.slice(typeStart).trim();
    let mapped: string | null = null;
    if (/^(SIGNED|UNSIGNED)$/i.test(typePart)) mapped = "INTEGER";
    else if (/^DECIMAL\s*\(\s*\d+\s*(,\s*\d+\s*)?\)$/i.test(typePart)) mapped = "REAL";
    else if (/^NUMERIC\s*\(\s*\d+\s*(,\s*\d+\s*)?\)$/i.test(typePart)) mapped = "REAL";
    if (!mapped) { cursor = hit.start + 4; continue; } // 其余 CAST 目标类型 SQLite 兼容，跳过继续扫描
    const repl = `CAST(${expr} AS ${mapped})`;
    out = replaceRange(out, hit.start, hit.close, repl);
    cursor = hit.start + repl.length;
  }
  return out;
}

/** MySQL DATE_FORMAT fmt → SQLite strftime fmt（仅映射已知差异 token） */
function mapDateFormat(fmt: string): string {
  let out = "";
  for (let i = 0; i < fmt.length; i++) {
    if (fmt[i] === "%" && i + 1 < fmt.length) {
      const t = fmt[i + 1];
      if (t === "i") { out += "%M"; i++; continue; } // MySQL 分钟
      if (t === "s") { out += "%S"; i++; continue; } // MySQL 秒
      if (t === "f") { out += "%f"; i++; continue; }
    }
    out += fmt[i];
  }
  return out;
}

/** DATE_FORMAT(x, 'fmt') → strftime('fmt', x) */
function rewriteDateFormat(sql: string): string {
  let out = sql;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const hit = findCall(out, 0, "DATE_FORMAT");
    if (!hit) break;
    const args = out.slice(hit.open + 1, hit.close);
    const commas = topLevelCommas(args);
    if (commas.length !== 1) break; //非两参形态，保守跳过
    const expr = args.slice(0, commas[0]).trim();
    let fmtLit = args.slice(commas[0] + 1).trim();
    if (!(fmtLit.startsWith("'") && fmtLit.endsWith("'"))) break; // fmt 非字符串字面量，跳过
    const inner = fmtLit.slice(1, -1).replace(/''/g, "'");
    out = replaceRange(out, hit.start, hit.close, `strftime('${mapDateFormat(inner).replace(/'/g, "''")}', ${expr})`);
  }
  return out;
}

/** JSON_UNQUOTE(JSON_EXTRACT(x,p)) → json_extract(x,p)；裸 JSON_EXTRACT → json_extract */
function rewriteJsonExtract(sql: string): string {
  let out = sql;
  // 1) unwrap JSON_UNQUOTE(JSON_EXTRACT(...)) 对
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const outer = findCall(out, 0, "JSON_UNQUOTE");
    if (!outer) break;
    const inner = out.slice(outer.open + 1, outer.close).trim();
    const innerHit = findCall(inner, 0, "JSON_EXTRACT");
    if (!innerHit || innerHit.start !== 0 || innerHit.close !== inner.length - 1) break;
    out = replaceRange(out, outer.start, outer.close, inner);
  }
  // 2) 裸 JSON_EXTRACT → json_extract
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const hit = findCall(out, 0, "JSON_EXTRACT");
    if (!hit) break;
    const args = out.slice(hit.open + 1, hit.close);
    out = replaceRange(out, hit.start, hit.close, "json_extract(" + args + ")");
  }
  return out;
}

/** json_valid 守护包装（容忍 NULL / 非 JSON 文本） */
function guard(expr: string): string {
  return `CASE WHEN json_valid(${expr}) THEN ${expr} ELSE json_array() END`;
}

/** JSON_CONTAINS(a,b) → EXISTS(json_each 守护等值)；JSON_OVERLAPS(a,b) → EXISTS(json_each 交集) */
function rewriteJsonPredicates(sql: string): string {
  let out = sql;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const hit = findCall(out, 0, "JSON_CONTAINS");
    if (!hit) break;
    const args = out.slice(hit.open + 1, hit.close);
    const commas = topLevelCommas(args);
    if (commas.length !== 1) break; // 3 参（路径）形态不改写
    const target = args.slice(0, commas[0]).trim();
    const candidate = args.slice(commas[0] + 1).trim();
    const repl =
      `EXISTS (SELECT 1 FROM json_each(${guard(target)}) WHERE json_each.value = json(${candidate}))`;
    out = replaceRange(out, hit.start, hit.close, repl);
  }
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const hit = findCall(out, 0, "JSON_OVERLAPS");
    if (!hit) break;
    const args = out.slice(hit.open + 1, hit.close);
    const commas = topLevelCommas(args);
    if (commas.length !== 1) break;
    const target = args.slice(0, commas[0]).trim();
    const candidate = args.slice(commas[0] + 1).trim();
    const repl =
      `EXISTS (SELECT 1 FROM json_each(${guard(target)}) WHERE json_each.value IN ` +
      `(SELECT value FROM json_each(json(${candidate}))))`;
    out = replaceRange(out, hit.start, hit.close, repl);
  }
  return out;
}

/** FETCH FIRST n ROWS ONLY → LIMIT n */
function rewriteFetchFirst(sql: string): string {
  return sql.replace(
    /(\s)FETCH\s+FIRST\s+(\d+)\s+ROWS\s+ONLY(\s*|$)/gi,
    (_m, pre: string, n: string) => `${pre}LIMIT ${n}`,
  );
}

/**
 * 主入口：H2(MySQL 模式) SQL → SQLite SQL（幂等；已是 SQLite 方言的语句原样通过）。
 */
export function translateSql(sql: string): string {
  if (!sql) return sql;
  let out = sql;
  out = rewriteFetchFirst(out);
  out = rewriteJsonPredicates(out);
  out = rewriteJsonExtract(out);
  out = rewriteCast(out);
  out = rewriteConcat(out);
  out = rewriteDateFormat(out);
  out = rewriteSimpleFuncs(out);
  return out;
}

/** 当前时间字符串（Java LocalDateTime / Jackson "yyyy-MM-dd HH:mm:ss" 语义） */
export function nowStr(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 归一时间戳：兼容 "2026-09-16 02:39:12.345" / ISO T 分隔（对齐 Jackson 序列化格式） */
export function normTs(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace("T", " ");
  const m = s.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
  return m ? m[1] : s;
}

/** 32 位无连字符 UUID（对齐 Java UUID.randomUUID().toString().replace("-","")） */
export function uuid32(): string {
  return crypto.randomUUID().replace(/-/g, "");
}
