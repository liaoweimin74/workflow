// ----- JOIN 配置字段候选提取 -----
// extractFormColumns：从表单 schema rule 提取业务字段（localField 候选、目标表单业务候选）
// targetFormColumns：目标表单候选 = 业务字段 + 系统列 id
//   —— 业务表单间关联通常以目标表主键 id 关联（主表存目标记录 id），
//      因此目标表关联字段（foreignField）/显示字段（joinField）候选必须包含 id。

export interface ColumnOption {
  key: string
  label: string
}

/** 系统列：目标表主键 id（wf_biz_* 表均含 id 主键，后端 JoinSqlGenerator 直接拼接列名） */
const SYSTEM_COLUMN_OPTIONS: ColumnOption[] = [{ key: 'id', label: '主键 id' }]

/**
 * 从表单 schema rule 提取字段候选（field → title）。
 * 仅业务字段；schema 为 null/空/非法 JSON 时返回空数组。
 */
export function extractFormColumns(schema: string | null | undefined): ColumnOption[] {
  if (!schema) return []
  try {
    const parsed = JSON.parse(schema)
    const rules = Array.isArray(parsed) ? parsed : (parsed.rule || [])
    const out: ColumnOption[] = []
    for (const r of rules) {
      if (r && r.field) {
        out.push({ key: String(r.field), label: r.title || String(r.field) })
      }
    }
    return out
  } catch {
    return []
  }
}

/**
 * 目标表单字段候选：业务字段 + 系统列 id。
 * schema 为 null/非法时仍返回 []（与 extractFormColumns 一致，不额外追加）。
 * schema 合法 JSON 时追加 id（若业务字段已含 id 则不重复）。
 */
export function targetFormColumns(schema: string | null | undefined): ColumnOption[] {
  if (!schema) return []
  const cols = extractFormColumns(schema)
  if (cols.length === 0) {
    // 合法空数组 schema（'[]'）→ 返回系统列 id；null/空串/非法 JSON 由上面提前 return
    try {
      JSON.parse(schema)
    } catch {
      return []
    }
  }
  if (!cols.some((c) => c.key === 'id')) {
    cols.push(...SYSTEM_COLUMN_OPTIONS)
  }
  return cols
}