/**
 * schema 审计 spike（multi-client-support Task 10，tasks.md 4.1-4.3）：
 * 只读遍历存量 wf_page_def.schema（VIEW 页面配置）与 wf_form_def.schema
 * （form-create rule 数组），按「组件/区块类型 × 属性键」聚合出现次数与
 * 资产数，输出 stdout JSON，供人工分拣成语义/表现台账。
 *
 * E-0 扩面（2026-10-27）：新式页面 rule[] 深入遍历（pages.ruleGroups，
 * 含 props.* 展平、props.rule / props.columns[].rule 双容器载体）；
 * wf_form_def.column_config 键分布（columnConfig.groups.column）。
 *
 * 用法：
 *   pnpm exec tsx tools/schema-audit.ts > $env:TEMP\schema-audit.json
 *   （可用 DB_NAME=... 指定库；缺省 .env 的库）
 *
 * ⚠️ 表内列名是 `schema`（longtext JSON 文本），不是 config_json。
 * ⚠️ 表现类键只做粗筛标注（presentationCandidate），分类终审在台账人工复核。
 */
import { Kysely, MysqlDialect, sql } from 'kysely'
import { createPool } from 'mysql2'

/**
 * DB 配置：进程环境变量（DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME）+ 项目本地默认
 * （与 src/framework/config/env DEFAULTS 同口径；tools 不得依赖 src，见 eslint no-restricted-imports）。
 */
function readDbConfig(): { host: string; port: number; user: string; password: string; database: string } {
  const env = process.env
  return {
    host: env.DB_HOST ?? 'localhost',
    port: Number(env.DB_PORT ?? 3306),
    user: env.DB_USER ?? 'root',
    password: env.DB_PASSWORD ?? '740130',
    database: env.DB_NAME ?? 'workflow_v6',
  }
}

/** 表现模式候选（设计 D11 粗筛清单）：命中仅提示，不作最终分类。 */
const PRESENTATION_PATTERN =
  /(^|\.)(width|minWidth|maxWidth|height|span|colSpan|offset|gutter|size|labelWidth|dialogWidth|dialogHeight|align|hidden|visible|show|style|color|theme|fullscreen|px)/i

interface KeyStat {
  /** 出现实例总数（跨资产累加） */
  instances: number
  /** 含该键的资产数 */
  assets: number
  /** 是否命中表现粗筛 */
  presentationCandidate: boolean
  /** 记过该键的资产（聚合中间态，输出前剔除） */
  _assetIds?: string[]
}

type GroupStat = Record<string, KeyStat>

interface AuditResult {
  generatedAt: string
  database: string
  pages: {
    scanned: number
    parseErrors: string[]
    /** 区块/组件类型 → 属性键 → 统计 */
    groups: Record<string, GroupStat>
    /** 新式页面 rule[] 深入遍历（auditRuleNode 同口径），组名前缀 page-rule: */
    ruleGroups: Record<string, GroupStat>
  }
  forms: {
    scanned: number
    parseErrors: string[]
    /** rule.type（或区块名） → 属性键（含 props.* 展平）→ 统计 */
    groups: Record<string, GroupStat>
  }
  /** 扩面（E-0）：wf_form_def.column_config 数组元素键分布（数据模型列定义，出码消费面） */
  columnConfig: {
    scanned: number
    parseErrors: string[]
    groups: Record<string, GroupStat>
  }
}

function bump(group: GroupStat, key: string, assetId: string): void {
  const stat = (group[key] ??= {
    instances: 0,
    assets: 0,
    presentationCandidate: PRESENTATION_PATTERN.test(key),
    _assetIds: [],
  })
  stat.instances += 1
  // 同一资产首次出现该键才计 assets（资产内多实例只算一次覆盖）
  if (!stat._assetIds?.includes(assetId)) {
    stat.assets += 1
    stat._assetIds?.push(assetId)
  }
}

/** 输出前剔除聚合中间态字段。 */
function stripTemp(groups: Record<string, GroupStat>): void {
  for (const g of Object.values(groups)) {
    for (const stat of Object.values(g)) delete stat._assetIds
  }
}

/** VIEW 页面配置：顶层区块聚合；数组区块逐元素、对象区块逐键。 */
function auditPageSchema(config: Record<string, unknown>, assetId: string, out: Record<string, GroupStat>): void {
  for (const [section, value] of Object.entries(config)) {
    const group = (out[section] ??= {})
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object') {
          for (const k of Object.keys(item as object)) bump(group, k, assetId)
        }
      }
      // 区块自身作为能力键也记一次（该资产用了此区块）
      bump(group, '@section', assetId)
    } else if (value && typeof value === 'object') {
      for (const k of Object.keys(value as object)) bump(group, k, assetId)
      bump(group, '@section', assetId)
    } else {
      bump(group, '@scalar', assetId)
    }
  }
}

/** form-create rule：递归节点，分组 = 节点 type；props.* 展平记录。 */
function auditRuleNode(node: Record<string, unknown>, out: Record<string, GroupStat>, assetId: string): void {
  const type = typeof node.type === 'string' ? node.type : '(no-type)'
  const group = (out[type] ??= {})
  for (const [k, v] of Object.entries(node)) {
    if (k === 'props' && v && typeof v === 'object') {
      for (const pk of Object.keys(v as object)) bump(group, `props.${pk}`, assetId)
      continue
    }
    if (k === 'validate' && Array.isArray(v)) {
      const vg = (out['validate'] ??= {})
      for (const item of v) {
        if (item && typeof item === 'object') {
          for (const vk of Object.keys(item as object)) bump(vg, vk, assetId)
        }
      }
      continue
    }
    if (k === 'children' || k === 'options' || v === undefined || v === null) continue
    bump(group, k, assetId)
  }
  // 递归子 rule（form-create 嵌套：children 数组里的对象可能是 rule）
  const children = node.children
  if (Array.isArray(children)) {
    for (const c of children) {
      if (c && typeof c === 'object' && !Array.isArray(c) && ('type' in c || 'field' in c)) {
        auditRuleNode(c as Record<string, unknown>, out, assetId)
      }
    }
  }
}

function parseJson(text: unknown): unknown {
  if (text === null || text === undefined) return null
  // mysql2 对 JSON 列类型自动反序列化为对象（column_config 是 JSON 列）；longtext 列仍是字符串
  if (typeof text !== 'string') return text
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return undefined // 区分「空」与「坏 JSON」：undefined=坏
  }
}

async function main(): Promise<void> {
  const dbConfig = readDbConfig()
  const db = new Kysely<unknown>({
    dialect: new MysqlDialect({
      pool: createPool({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        database: dbConfig.database,
        multipleStatements: false,
      }),
    }),
  })

  const result: AuditResult = {
    generatedAt: new Date().toISOString(),
    database: dbConfig.database,
    pages: { scanned: 0, parseErrors: [], groups: {}, ruleGroups: {} },
    forms: { scanned: 0, parseErrors: [], groups: {} },
    columnConfig: { scanned: 0, parseErrors: [], groups: {} },
  }

  try {
    // 全量都扫（含草稿）；spike 只需键分布，行少无需瘦身投影
    const pageRows = await sql<{ id: string; key: string; status: string; schema: string | null }>`
      SELECT id, \`key\`, \`status\`, \`schema\` FROM wf_page_def ORDER BY id
    `.execute(db)
    for (const row of pageRows.rows) {
      const config = parseJson(row.schema)
      if (config === undefined) {
        result.pages.parseErrors.push(`${row.key}#${row.id.slice(0, 8)}`)
        continue
      }
      if (config === null || typeof config !== 'object' || Array.isArray(config)) continue
      result.pages.scanned += 1
      const assetId = `${row.key}#${row.id.slice(0, 8)}`
      auditPageSchema(config as Record<string, unknown>, assetId, result.pages.groups)
      // E-0 扩面：新式页面 rule[] 按 form-create 口径深入遍历（props.* 展平、validate 分组、children 递归）
      const rule = (config as Record<string, unknown>).rule
      if (Array.isArray(rule)) {
        const sub: Record<string, GroupStat> = {}
        const walk = (rules: unknown[]): void => {
          for (const r of rules) {
            if (r && typeof r === 'object' && !Array.isArray(r)) {
              auditRuleNode(r as Record<string, unknown>, sub, assetId)
              // auditRuleNode 未跟随的容器载体：props.rule（subForm 存盘形态）与 props.columns[].rule（tableForm）
              const node = r as Record<string, unknown>
              const props = node.props as Record<string, unknown> | undefined
              if (props) {
                if (Array.isArray(props.rule)) walk(props.rule as unknown[])
                if (Array.isArray(props.columns)) {
                  for (const c of props.columns as unknown[]) {
                    const cc = c as Record<string, unknown> | null
                    if (cc && Array.isArray(cc.rule)) walk(cc.rule as unknown[])
                  }
                }
              }
            } else if (Array.isArray(r)) walk(r)
          }
        }
        walk(rule)
        // 本次资产级统计并入全局 ruleGroups：实例累加、资产按并集计数
        for (const [g, stats] of Object.entries(sub)) {
          const target = (result.pages.ruleGroups[`page-rule:${g}`] ??= {})
          for (const [k, s] of Object.entries(stats)) {
            const t = (target[k] ??= { instances: 0, assets: 0, presentationCandidate: s.presentationCandidate, _assetIds: [] })
            t.instances += s.instances
            for (const aid of s._assetIds ?? []) {
              if (!t._assetIds!.includes(aid)) {
                t._assetIds!.push(aid)
                t.assets += 1
              }
            }
          }
        }
      }
    }

    const formRows = await sql<{ id: string; key: string; status: string; schema: string | null }>`
      SELECT id, \`key\`, \`status\`, \`schema\` FROM wf_form_def ORDER BY id
    `.execute(db)
    for (const row of formRows.rows) {
      const schema = parseJson(row.schema)
      if (schema === undefined) {
        result.forms.parseErrors.push(`${row.key}#${row.id.slice(0, 8)}`)
        continue
      }
      if (!Array.isArray(schema)) continue
      result.forms.scanned += 1
      const walk = (rules: unknown[]): void => {
        for (const r of rules) {
          if (r && typeof r === 'object' && !Array.isArray(r)) {
            auditRuleNode(r as Record<string, unknown>, result.forms.groups, `${row.key}#${row.id.slice(0, 8)}`)
          } else if (Array.isArray(r)) walk(r)
        }
      }
      walk(schema)
    }

    // E-0 扩面：column_config（数据模型列定义数组）键分布
    const colRows = await sql<{ id: string; key: string; column_config: string | null }>`
      SELECT id, \`key\`, \`column_config\` FROM wf_form_def ORDER BY id
    `.execute(db)
    for (const row of colRows.rows) {
      const cc = parseJson(row.column_config)
      if (cc === undefined) {
        result.columnConfig.parseErrors.push(`${row.key}#${row.id.slice(0, 8)}`)
        continue
      }
      if (!Array.isArray(cc) || cc.length === 0) continue
      result.columnConfig.scanned += 1
      const assetId = `${row.key}#${row.id.slice(0, 8)}`
      const g = (result.columnConfig.groups['column'] ??= {})
      const bumpItem = (item: Record<string, unknown>): void => {
        for (const k of Object.keys(item)) bump(g, k, assetId)
      }
      for (const item of cc) {
        if (item && typeof item === 'object' && !Array.isArray(item)) bumpItem(item as Record<string, unknown>)
      }
    }
    stripTemp(result.pages.groups)
    stripTemp(result.pages.ruleGroups)
    stripTemp(result.forms.groups)
    stripTemp(result.columnConfig.groups)
  } finally {
    await db.destroy()
  }

  process.stdout.write(JSON.stringify(result, null, 2))
}

main().catch((e) => {
  console.error('[schema-audit] 失败:', e)
  process.exit(1)
})
