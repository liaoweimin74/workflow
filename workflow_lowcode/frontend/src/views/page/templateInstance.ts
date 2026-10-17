/**
 * 模板实例化：模板 schema 快照 → 可直接保存为新页面的 schema。
 * 纯逻辑（不含 Vue/API），组合 templateSchema.remapPageSchema：
 * - 生成全新 ds ID（时间戳 36 进制 + 递增序号，扫描全 schema 字符串避让碰撞）
 * - 可选 rebinds（跨项目导入的 refId 重绑）：改绑后 searchFields 无法本地重推导，
 *   未显式提供时置空并告警（PageValidator 对 FORM 绑定校验 searchFields 引用列存在，
 *   空数组合法；残留白名单会导致发布 400）
 */

import { remapPageSchema, type PageSchema, type DsBinding, type RemapReportItem } from './templateSchema'

/** 重绑声明：旧 ds ID → 新 refId（可选新 searchFields） */
export interface TemplateRebind {
  refId: string
  searchFields?: string[]
}

export interface TemplateInstanceResult {
  schema: PageSchema
  /** 旧 ds ID → 新 ds ID */
  idMap: Record<string, string>
  /** remap 内核报告（实例化路径理论上无 dangling，除非模板本身损坏） */
  report: RemapReportItem[]
  /** 重绑降级等非阻断提示（面向用户的中文文案） */
  warnings: string[]
}

/** 收集 schema JSON 中的全部字符串值（候选 ID 碰撞扫描用） */
function collectStrings(value: unknown, out: Set<string>): void {
  if (typeof value === 'string') {
    out.add(value)
  } else if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, out)
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectStrings(v, out)
  }
}

function genCandidate(base: string, seq: number): string {
  return `ds_${base}${seq > 0 ? seq.toString(36) : ''}`
}

export function buildTemplateInstance(
  schema: PageSchema,
  rebinds?: Record<string, TemplateRebind>,
  now: number = Date.now(),
): TemplateInstanceResult {
  const report: RemapReportItem[] = []
  const warnings: string[] = []
  const base = now.toString(36)

  const existing = new Set<string>()
  collectStrings(schema, existing)

  const bindings: Record<string, DsBinding> = {}
  const idMap: Record<string, string> = {}
  let seq = 0
  const takeId = (): string => {
    let candidate = genCandidate(base, seq)
    while (existing.has(candidate)) {
      seq++
      candidate = genCandidate(base, seq)
    }
    seq++ // 下一个候选从后一位开始，预留本值
    existing.add(candidate)
    return candidate
  }

  const knownIds = new Set(schema.dataSources.map((d) => d.id))
  for (const oldId of Object.keys(rebinds || {})) {
    if (!knownIds.has(oldId)) {
      report.push({
        level: 'error',
        kind: 'unknown-rebind',
        path: `rebinds(${oldId})`,
        value: oldId,
        message: `重绑声明指向不存在的数据源条目 ${oldId}，已忽略`,
      })
    }
  }

  for (const ds of schema.dataSources) {
    const newId = takeId()
    idMap[ds.id] = newId
    const rebind = rebinds?.[ds.id]
    if (rebind && knownIds.has(ds.id)) {
      const refChanged = rebind.refId !== ds.refId
      const searchFields = rebind.searchFields ?? []
      if (refChanged && rebind.searchFields === undefined && (ds.searchFields?.length ?? 0) > 0) {
        warnings.push(`数据源 ${ds.id} 改绑后筛选字段白名单无法自动迁移，已清空，请在设计器重新配置`)
      }
      bindings[ds.id] = { id: newId, refId: rebind.refId, searchFields }
    } else {
      bindings[ds.id] = { id: newId, refId: ds.refId, searchFields: ds.searchFields ?? [] }
    }
  }

  const remapped = remapPageSchema(schema, bindings)
  report.push(...remapped.report)
  return { schema: remapped.schema, idMap, report, warnings }
}

/**
 * 导入绑定确认的数据层：不改 ds ID（模板库内保留原始 ID），仅重绑 refId。
 * 原 refId 不在目标环境已启用集合 → 必须显式提供新 refId；
 * 改绑且未提供 searchFields → 置空（同 buildTemplateInstance 的白名单降级规则）。
 */
export function applyTemplateRebinds(
  schema: PageSchema,
  rebinds: Record<string, TemplateRebind>,
  availableRefIds: Set<string>,
): { schema: PageSchema; warnings: string[] } {
  const warnings: string[] = []
  const next: PageSchema = JSON.parse(JSON.stringify(schema))
  for (const ds of next.dataSources) {
    const rebind = rebinds[ds.id]
    if (rebind) {
      if (rebind.refId !== ds.refId) {
        if (rebind.searchFields === undefined && (ds.searchFields?.length ?? 0) > 0) {
          warnings.push(`数据源 ${ds.id} 改绑后筛选字段白名单已清空，实例化后请在设计器重新配置`)
        }
        ds.refId = rebind.refId
        ds.searchFields = rebind.searchFields ?? []
      }
      continue
    }
    if (!availableRefIds.has(ds.refId)) {
      warnings.push(`数据源 ${ds.id}（原绑定 ${ds.refId}）在当前环境不存在或未启用，已原样保留；实例化创建页面时需先完成绑定`)
    }
  }
  return { schema: next, warnings }
}
