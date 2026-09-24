// ----- JOIN 配置字段候选提取 -----
// extractFormColumns：从表单 schema rule 提取业务字段（localField 候选、目标表单业务候选）
// targetFormColumns：目标表单候选 = 业务字段 + 系统列 id
//   —— 业务表单间关联通常以目标表主键 id 关联（主表存目标记录 id），
//      因此目标表关联字段（foreignField）/显示字段（joinField）候选必须包含 id。
// SYSTEM_JOIN_TARGET_COLUMNS：内建数据源作为 JOIN 目标时的物理列候选。
//   ⚠️ 与后端 `backend-node/src/engine/form/bizdata/join-target-catalog.ts` 保持一致
//   （key = 物理列名，SQL 直接引用；流程类 3 个数据源为派生列，不纳入 JOIN 目标）。

export interface ColumnOption {
  key: string
  label: string
}

/** 系统列：目标表主键 id（wf_biz_* 表均含 id 主键，后端 JoinSqlGenerator 直接拼接列名） */
const SYSTEM_COLUMN_OPTIONS: ColumnOption[] = [{ key: 'id', label: '主键 id' }]

/**
 * 内建数据源 JOIN 目标的物理列候选（key = 物理列名，提交后端 joinField/foreignField）。
 * 与后端 join-target-catalog.ts 的 JOIN_TARGET_SYSTEM_SOURCES 逐条一致。
 */
export const SYSTEM_JOIN_TARGET_COLUMNS: Record<string, ColumnOption[]> = {
  'dept-tree': [
    { key: 'id', label: '主键 id' },
    { key: 'parent_id', label: '上级部门 id' },
    { key: 'org_name', label: '部门名称' },
    { key: 'org_code', label: '部门编码' },
  ],
  'user-tree': [
    { key: 'id', label: '主键 id' },
    { key: 'username', label: '用户名' },
    { key: 'nickname', label: '昵称' },
    { key: 'org_id', label: '部门 id' },
    { key: 'status', label: '状态' },
  ],
  'sys-menus': [
    { key: 'id', label: '主键 id' },
    { key: 'parent_id', label: '上级菜单 id' },
    { key: 'menu_name', label: '菜单名称' },
    { key: 'menu_type', label: '菜单类型' },
    { key: 'path', label: '路由路径' },
    { key: 'permission', label: '权限标识' },
    { key: 'sort_order', label: '排序' },
  ],
  'sys-roles': [
    { key: 'id', label: '主键 id' },
    { key: 'role_name', label: '角色名称' },
    { key: 'role_code', label: '角色编码' },
    { key: 'description', label: '描述' },
    { key: 'status', label: '状态' },
  ],
  'sys-dicts': [
    { key: 'id', label: '主键 id' },
    { key: 'dict_code', label: '字典编码' },
    { key: 'dict_name', label: '字典名称' },
    { key: 'remark', label: '备注' },
    { key: 'status', label: '状态' },
  ],
}

/** 是否内建 JOIN 目标（key 为 SYSTEM 数据源 sourceKey）。 */
export function isSystemJoinTarget(targetKey: string): boolean {
  return Object.prototype.hasOwnProperty.call(SYSTEM_JOIN_TARGET_COLUMNS, targetKey)
}

/** 内建 JOIN 目标 sourceKey 清单（供目标表下拉按数据源列表过滤，顺序即展示顺序）。 */
export const SYSTEM_JOIN_TARGET_KEYS: string[] = Object.keys(SYSTEM_JOIN_TARGET_COLUMNS)

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