/**
 * SQL 批处理（SQL_SCRIPT）设计时解析工具——与引擎 SqlScriptSupport 同语义的 TS 实现。
 *
 * 供属性面板实时预览：按 ; 切分（字符串字面量/反引号/注释内的 ; 不切分）、
 * 语句类型识别（首关键字白名单）、别名提取（-- name: xxx）、变量引用收集。
 * 仅做展示与静态提示；运行期以引擎实现为准。
 */

export type SqlKind = 'QUERY' | 'INSERT' | 'DML'

export interface SqlStatementPreview {
  /** 序号（0 起，即输出键 s{i}） */
  index: number
  /** 语句别名（-- name: xxx），无则 undefined */
  name?: string
  /** 语句类型 */
  kind: SqlKind
  /** 类型中文名 */
  kindLabel: string
  /** 单行摘录（用于预览行） */
  excerpt: string
  /** 引用的变量路径（{{var.sub}} → "var.sub"，去重保序） */
  vars: string[]
}

export interface SqlScriptPreview {
  statements: SqlStatementPreview[]
  /** 解析错误（引号未闭合/块注释未闭合/类型白名单外等） */
  error?: string
}

const KIND_LABELS: Record<SqlKind, string> = {
  QUERY: '查询',
  INSERT: '写入',
  DML: '更新',
}

const PLACEHOLDER = /\{\{\s*([\w]+(?:\.[\w]+)*)\s*}}/g

/** 行注释起点：# 或 -- 后接空白/行尾（与 MariaDB 语义一致，--x 不算注释） */
function isLineCommentAt(s: string, i: number): boolean {
  const c = s[i]
  if (c === '#') return true
  if (c === '-' && i + 1 < s.length && s[i + 1] === '-') {
    const next = s[i + 2]
    return i + 2 >= s.length || next === ' ' || next === '\t' || next === '\n' || next === '\r'
  }
  return false
}

/** 下一行分隔符下标；无则 -1 */
function indexOfEol(s: string, from: number): number {
  const nl = s.indexOf('\n', from)
  const cr = s.indexOf('\r', from)
  if (nl < 0) return cr
  if (cr < 0) return nl
  return Math.min(nl, cr)
}

/** 扫描引号串返回结束下标（越过后引号）；'' 双写转义；' 与 " 内支持 \x 反斜杠转义 */
function scanQuoted(s: string, start: number, quote: string): number {
  let i = start + 1
  while (i < s.length) {
    const c = s[i]
    if (quote !== '`' && c === '\\' && i + 1 < s.length) {
      i += 2
      continue
    }
    if (c === quote) {
      if (s[i + 1] === quote) {
        i += 2
        continue
      }
      return i + 1
    }
    i++
  }
  throw new Error(`第 ${start + 1} 字符附近存在未闭合的引号: ${quote}`)
}

/** 剥注释（保留字符串字面量），用于空语句判定与首关键字识别 */
function stripComments(statement: string): string {
  let out = ''
  let i = 0
  const n = statement.length
  while (i < n) {
    const c = statement[i]
    if (isLineCommentAt(statement, i)) {
      const eol = indexOfEol(statement, i)
      i = eol < 0 ? n : eol
      out += ' '
      continue
    }
    if (c === '/' && statement[i + 1] === '*') {
      const end = statement.indexOf('*/', i + 2)
      if (end < 0) throw new Error('存在未闭合的块注释 /*')
      i = end + 2
      out += ' '
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const end = scanQuoted(statement, i, c)
      out += statement.slice(i, end)
      i = end
      continue
    }
    out += c
    i++
  }
  return out
}

/** 语句类型识别：首关键字白名单；不支持类型抛错（DDL 会隐式提交破坏事务） */
export function sqlStatementKind(statement: string): SqlKind {
  const bare = stripComments(statement).trim()
  const m = /^[A-Za-z]+/.exec(bare)
  if (!m) throw new Error('无法识别的 SQL 语句')
  const kw = m[0].toUpperCase()
  if (['SELECT', 'SHOW', 'DESC', 'DESCRIBE', 'EXPLAIN', 'WITH'].includes(kw)) return 'QUERY'
  if (['INSERT', 'REPLACE'].includes(kw)) return 'INSERT'
  if (['UPDATE', 'DELETE'].includes(kw)) return 'DML'
  throw new Error(`仅支持 SELECT/INSERT/UPDATE/DELETE/REPLACE（DDL 与管理命令不支持）: ${kw}`)
}

/** 提取前置注释中的别名声明（-- name: xxx / # name=xxx / 块注释），无则 undefined */
export function sqlStatementName(statement: string): string | undefined {
  let i = 0
  const n = statement.length
  while (i < n) {
    while (i < n && /\s/.test(statement[i])) i++
    if (i >= n) return undefined
    if (isLineCommentAt(statement, i)) {
      const eol = indexOfEol(statement, i)
      const m = /\bname\s*[:=]\s*(\w+)/i.exec(statement.slice(i, eol < 0 ? n : eol))
      if (m) return m[1]
      i = eol < 0 ? n : eol
      continue
    }
    if (statement[i] === '/' && statement[i + 1] === '*') {
      const end = statement.indexOf('*/', i + 2)
      if (end < 0) return undefined
      const m = /\bname\s*[:=]\s*(\w+)/i.exec(statement.slice(i, end + 2))
      if (m) return m[1]
      i = end + 2
      continue
    }
    return undefined
  }
  return undefined
}

/** 语句内引用的变量路径（去重保序） */
export function sqlStatementVars(statement: string): string[] {
  const vars: string[] = []
  for (const m of statement.matchAll(PLACEHOLDER)) {
    if (!vars.includes(m[1])) vars.push(m[1])
  }
  return vars
}

/** 单行摘录：压扁空白 + 截断 */
function excerptOf(statement: string, max = 64): string {
  const flat = statement.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`
}

/**
 * 解析 SQL 批处理文本为预览结构（永不抛错，错误进 error 字段供 UI 展示）。
 * 语句键名约定与引擎一致：-- name: 别名优先，否则 s{index}。
 */
export function parseSqlScriptPreview(sql: string): SqlScriptPreview {
  const statements: SqlStatementPreview[] = []
  try {
    const parts = splitSqlStatements(sql)
    parts.forEach((raw, index) => {
      try {
        const kind = sqlStatementKind(raw)
        statements.push({
          index,
          name: sqlStatementName(raw),
          kind,
          kindLabel: KIND_LABELS[kind],
          excerpt: excerptOf(raw),
          vars: sqlStatementVars(raw),
        })
      } catch (e) {
        throw new Error(`第 ${index + 1} 条: ${e instanceof Error ? e.message : String(e)}`)
      }
    })
  } catch (e) {
    return { statements, error: e instanceof Error ? e.message : String(e) }
  }
  if (!statements.length && sql.trim()) {
    return { statements, error: '未包含可执行语句' }
  }
  return { statements }
}

/** 按 ; 切分（引号/注释感知）；未闭合引号/注释抛错；空语句剔除 */
export function splitSqlStatements(sql: string): string[] {
  if (!sql || !sql.trim()) return []
  const raw: string[] = []
  let cur = ''
  let i = 0
  const n = sql.length
  while (i < n) {
    const c = sql[i]
    if (isLineCommentAt(sql, i)) {
      const eol = indexOfEol(sql, i)
      cur += sql.slice(i, eol < 0 ? n : eol)
      i = eol < 0 ? n : eol
      continue
    }
    if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2)
      if (end < 0) throw new Error(`第 ${i + 1} 字符附近存在未闭合的块注释 /*`)
      cur += sql.slice(i, end + 2)
      i = end + 2
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const end = scanQuoted(sql, i, c)
      cur += sql.slice(i, end)
      i = end
      continue
    }
    if (c === ';') {
      raw.push(cur)
      cur = ''
      i++
      continue
    }
    cur += c
    i++
  }
  raw.push(cur)
  return raw
    .filter((s) => {
      try {
        return stripComments(s).trim().length > 0
      } catch {
        return s.trim().length > 0
      }
    })
    .map((s) => s.trim())
}
