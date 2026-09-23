import type { ColumnConfig } from '../../../common/domain/column-config'

/** 子表定义（独立物理表 `wf_biz_<formKey>_<field>`）。 */
export interface SubTableDef {
  tableName: string
  /** `embedded`：随主表行内返回；`SUB_TABLE`：独立存储（当前未实现，见 parseBusinessColumnConfig）。 */
  subMode: string
  subColumns: ColumnConfig[]
  subKeys: string[]
}

/**
 * 业务表单运行时上下文（对齐 Java `BizDataContext`）。
 *
 * ⚠️ `columnKeys` 是**主表列**，已排除子表字段 —— 子表字段映射到独立物理表，
 *    不是主表列。查询/插入的白名单都基于它。
 */
export interface BizDataContext {
  tableName: string
  formKey: string
  columns: ColumnConfig[]
  columnKeys: string[]
  subTables: Map<string, SubTableDef>
}

/** 业务表前缀（对齐 Java `"wf_biz_" + formKey`）。 */
export const BIZ_TABLE_PREFIX = 'wf_biz_'

/** 由 formKey 推导业务表名。 */
export function bizTableName(formKey: string): string {
  return `${BIZ_TABLE_PREFIX}${formKey}`
}

/** 由 formKey + 子表字段推导子表名。 */
export function bizSubTableName(formKey: string, field: string): string {
  return `${BIZ_TABLE_PREFIX}${formKey}_${field}`
}

/**
 * 由列定义组装上下文（对齐 Java `BizDataSupport.loadContext` 的后半段）。
 *
 * 抽成纯函数是刻意的：`loadContext` 的**前半段**（查表单、查表存在性）需要数据库，
 * 后半段（列/子表划分）纯粹是数据整形。分开之后后者可以直接单测，
 * 不必为了验证「子表字段不进主表列白名单」去搭一套库。
 */
export function buildBizDataContext(
  formKey: string,
  columns: ColumnConfig[],
): BizDataContext {
  const columnKeys: string[] = []
  const subTables = new Map<string, SubTableDef>()
  for (const column of columns) {
    const isSubTable = column.subColumns !== null && column.subColumns.length > 0
    if (!isSubTable) {
      columnKeys.push(String(column.key))
      continue
    }
    const key = String(column.key)
    const mode =
      column.subMode === null || column.subMode.trim() === '' ? 'embedded' : column.subMode
    subTables.set(key, {
      tableName: bizSubTableName(formKey, key),
      subMode: mode,
      subColumns: column.subColumns as ColumnConfig[],
      subKeys: (column.subColumns as ColumnConfig[]).map((c) => String(c.key)),
    })
  }
  return { tableName: bizTableName(formKey), formKey, columns, columnKeys, subTables }
}
