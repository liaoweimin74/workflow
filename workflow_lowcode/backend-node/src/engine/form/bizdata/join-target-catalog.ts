/**
 * JOIN 目标表目录 —— 内建数据源作为声明式 JOIN 目标的物理映射（唯一事实源）。
 *
 * 背景：声明式 JOIN（`JoinSqlGenerator`）原只支持业务表单目标（`wf_biz_<formKey>`）。
 * 需求扩展：目标表下拉应包含**内建数据源**（系统用户/组织机构等），让业务表单
 * 直接 JOIN 系统结构数据（如按 `user_id` 关联 `sys_user` 取 `nickname`）。
 *
 * 【纳入范围】5 个结构化系统数据源 —— 底层物理表稳定、列映射干净：
 *   组织机构(sys_organization) / 系统用户(sys_user) / 系统菜单(sys_menu) /
 *   系统角色(sys_role) / 系统字典(sys_dict_type)。
 * 流程类 3 个（流程定义/流程实例/待办任务）的展示列多为跨表派生
 * （当前节点/发起人/流程名），无稳定物理列可 JOIN，暂不纳入。
 *
 * 【列语义】`key` = 下拉选项值（**物理列名**，SQL 直接引用）；
 * `label` = 前端展示名；`columnType` = 虚拟列类型推导（对齐主表列语义）。
 * 派生列（如系统用户的 orgName 来自 JOIN sys_organization）不是物理列，不列入。
 *
 * 消费方：
 *   - `join-sql-generator.ts`：resolveJoinTargetTable（LEFT JOIN 表名解析）；
 *   - `biz-data-support.ts`：目标列类型解析（resolveJoinColumnType）；
 *   - 前端 `joinColumns.ts`：目标字段下拉候选（两端映射需保持一致）。
 */

/** 单个内建 JOIN 目标列（key 即物理列名）。 */
export interface JoinTargetSystemColumn {
  key: string
  label: string
  columnType: string
}

/** 单个内建 JOIN 目标数据源。 */
export interface JoinTargetSystemSource {
  /** SYSTEM 数据源 sourceKey（前端 targetFormKey 字段传此值）。 */
  sourceKey: string
  /** 物理表名（LEFT JOIN 目标）。 */
  table: string
  /** 可用作 foreignField/joinField 的物理列。 */
  columns: JoinTargetSystemColumn[]
}

/** 内建数据源 JOIN 主键列（各系统表统一 bigint 主键 id）。 */
const ID_COLUMN: JoinTargetSystemColumn = { key: 'id', label: '主键 id', columnType: 'BIGINT' }

/** 5 个结构化内建数据源的 JOIN 物理映射（列与 V1 baseline DDL 逐字段核对）。 */
export const JOIN_TARGET_SYSTEM_SOURCES: JoinTargetSystemSource[] = [
  {
    sourceKey: 'dept-tree',
    table: 'sys_organization',
    columns: [
      ID_COLUMN,
      { key: 'parent_id', label: '上级部门 id', columnType: 'BIGINT' },
      { key: 'org_name', label: '部门名称', columnType: 'VARCHAR' },
      { key: 'org_code', label: '部门编码', columnType: 'VARCHAR' },
    ],
  },
  {
    sourceKey: 'user-tree',
    table: 'sys_user',
    columns: [
      ID_COLUMN,
      { key: 'username', label: '用户名', columnType: 'VARCHAR' },
      { key: 'nickname', label: '昵称', columnType: 'VARCHAR' },
      { key: 'org_id', label: '部门 id', columnType: 'BIGINT' },
      { key: 'status', label: '状态', columnType: 'TINYINT' },
    ],
  },
  {
    sourceKey: 'sys-menus',
    table: 'sys_menu',
    columns: [
      ID_COLUMN,
      { key: 'parent_id', label: '上级菜单 id', columnType: 'BIGINT' },
      { key: 'menu_name', label: '菜单名称', columnType: 'VARCHAR' },
      { key: 'menu_type', label: '菜单类型', columnType: 'TINYINT' },
      { key: 'path', label: '路由路径', columnType: 'VARCHAR' },
      { key: 'permission', label: '权限标识', columnType: 'VARCHAR' },
      { key: 'sort_order', label: '排序', columnType: 'TINYINT' },
    ],
  },
  {
    sourceKey: 'sys-roles',
    table: 'sys_role',
    columns: [
      ID_COLUMN,
      { key: 'role_name', label: '角色名称', columnType: 'VARCHAR' },
      { key: 'role_code', label: '角色编码', columnType: 'VARCHAR' },
      { key: 'description', label: '描述', columnType: 'VARCHAR' },
      { key: 'status', label: '状态', columnType: 'TINYINT' },
    ],
  },
  {
    sourceKey: 'sys-dicts',
    table: 'sys_dict_type',
    columns: [
      ID_COLUMN,
      { key: 'dict_code', label: '字典编码', columnType: 'VARCHAR' },
      { key: 'dict_name', label: '字典名称', columnType: 'VARCHAR' },
      { key: 'remark', label: '备注', columnType: 'VARCHAR' },
      { key: 'status', label: '状态', columnType: 'TINYINT' },
    ],
  },
]

/** sourceKey → 定义（查无返回 null）。 */
export function joinTargetSystemByKey(sourceKey: string): JoinTargetSystemSource | null {
  return JOIN_TARGET_SYSTEM_SOURCES.find((s) => s.sourceKey === sourceKey) ?? null
}

/** 是否内建 JOIN 目标 key。 */
export function isJoinTargetSystemKey(targetKey: string): boolean {
  return joinTargetSystemByKey(targetKey) !== null
}

/**
 * 内建目标的物理列类型：命中返回大写类型；目标/列任一未命中返回 null
 * （调用方 fallback，与 FORM 目标的「查不到 fallback VARCHAR」语义一致）。
 */
export function joinTargetSystemColumnType(targetKey: string, physicalColumn: string): string | null {
  const system = joinTargetSystemByKey(targetKey)
  if (system === null) return null
  const column = system.columns.find((c) => c.key === physicalColumn)
  return column !== undefined ? column.columnType.toUpperCase() : null
}

/**
 * JOIN 目标 key → 物理表名：内建数据源 → 系统物理表；其余按业务表单动态表拼接
 * （`wf_biz_<formKey>`，既有行为不变）。
 */
export function resolveJoinTargetTable(targetKey: string): string {
  const system = joinTargetSystemByKey(targetKey)
  return system !== null ? system.table : `wf_biz_${targetKey}`
}
