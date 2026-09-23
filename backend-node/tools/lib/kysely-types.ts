/**
 * 从 Kysely 的 `types.ts` 里解析出「Node 到底需要哪些表的哪些列」。
 *
 * 【为什么需要它】
 *   Java 侧开着 `spring.jpa.hibernate.ddl-auto=update`，启动时会**自动补列补表**，
 *   所以「迁移文件」并不等于 Java 实际运行的 schema —— 迁移只覆盖一部分，
 *   剩下的是 Hibernate 按实体定义补出来的（实测：Node 用到的 31 张表 / 344 个列里，
 *   有 1 张表 + 8 个列只存在于 Hibernate 补出来的库里）。
 *
 *   于是「Node 声明的列」与「只跑迁移的库」之间会悄悄漂移，后果是
 *   **Node 后端无法独立部署**（在 workflow_v6 上一切正常，换个干净库就缺列）。
 *   把 types.ts 当权威清单、在集成测试里与迁移产出的 schema 对账，
 *   这个漂移就不可能再蒙混过去。
 *
 * 【为什么解析源码而不是维护一份清单】
 *   手写清单会随代码改动过期，而过期正是我们要防的失败模式本身。
 */

export interface DeclaredTable {
  table: string
  interface: string
  columns: string[]
}

/** 匹配 `export interface XxxTable {` 直到配对的 `}`（接口体不嵌套，故非贪婪即可）。 */
const INTERFACE_RE = /export interface (\w+) \{\n([\s\S]*?)\n\}/g

/**
 * 匹配接口体里的字段行。
 *
 * 只认「两个空格缩进 + 小写/下划线标识符 + 可选 `?` + 冒号」，
 * 因此注释块、`/** … *\/`、以及跨行的泛型都不会被误当成字段。
 */
const FIELD_RE = /^\s{2}([a-z_][a-z0-9_]*)\??:/m

/** 解析 `export interface DB { ... }` 得到 表名 → 接口名。 */
export function parseDbTables(source: string): Map<string, string> {
  const block = /export interface DB \{([\s\S]*?)\n\}/.exec(source)
  if (block === null) {
    throw new Error('types.ts 里没找到 `export interface DB`，解析器需要同步更新')
  }
  const out = new Map<string, string>()
  for (const line of block[1].split('\n')) {
    const m = /^\s{2}(\w+): (\w+)$/.exec(line)
    if (m !== null) out.set(m[1], m[2])
  }
  if (out.size === 0) {
    throw new Error('`interface DB` 解析出 0 张表，解析器需要同步更新')
  }
  return out
}

/** 解析全部 `export interface XxxTable`，得到 接口名 → 字段名列表。 */
export function parseTableInterfaces(source: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  INTERFACE_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = INTERFACE_RE.exec(source)) !== null) {
    const columns: string[] = []
    for (const line of m[2].split('\n')) {
      const fm = FIELD_RE.exec(line)
      if (fm !== null) columns.push(fm[1])
    }
    out.set(m[1], columns)
  }
  return out
}

/**
 * 汇总「Node 声明需要的表与列」。
 *
 * `DB` 里引用了但没定义接口的表会**抛错**而不是静默跳过 ——
 * 静默跳过等于把这个表漏出对账范围，正好放过我们要抓的漂移。
 */
export function parseDeclaredSchema(source: string): DeclaredTable[] {
  const tables = parseDbTables(source)
  const interfaces = parseTableInterfaces(source)
  const out: DeclaredTable[] = []
  for (const [table, iface] of tables) {
    const columns = interfaces.get(iface)
    if (columns === undefined) {
      throw new Error(`types.ts 的 DB 引用了 ${table}: ${iface}，但没有定义该接口`)
    }
    out.push({ table, interface: iface, columns })
  }
  return out
}
