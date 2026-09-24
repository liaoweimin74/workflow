import { newColumnConfig, type ColumnConfig } from '../../../common/domain/column-config'

/**
 * 系统内建数据源目录 —— **唯一事实源**。
 *
 * 消费方（各自取所需，改这里一处全联动）：
 *   - `migrations/V39__builtin_data_sources.sql`（两端同内容）：按本目录幂等预置
 *     `wf_data_source` 行（Flyway/Node migrator 执行；**初始化不走启动代码**）；
 *   - `unified-data-source-adapter.ts`：SYSTEM 元数据列 / 取数分支；
 *   - `internal-data-source-router.ts` 与 `data-source-write.service.ts`：
 *     SYSTEM sourceKey 白名单（原来两处各抄一份 `['dept-tree','user-tree']`，已收编）；
 *   - `SystemInternalController`：内建数据源的 REST 化取数端点。
 *
 * 【语义】这 8 个数据源是系统管理 / 流程管理的内建结构数据（系统菜单、系统用户、
 * 组织机构、系统角色、系统字典、流程定义、流程实例、待办任务），**预置且受保护**：
 * 全部 ENABLED、跨租户可见（靠 `type='SYSTEM'` 的 SQL OR 条件）、不允许改名/删除/禁用
 * （`tenant_id = BUILT_IN_TENANT` 判定，见 DataSourceWriteService.requireNotBuiltIn）。
 */

/** 内建数据源所在租户（保留域，不与真实租户冲突；跨租户可见由 type='SYSTEM' 保证）。 */
export const BUILT_IN_TENANT = 'system'

/** 内建数据源固定 id 前缀（幂等 seed 的判定键，可读、稳定）。 */
export const BUILT_IN_ID_PREFIX = 'ds-builtin-'

/** 单个内建系统数据源定义。 */
export interface BuiltInSystemSource {
  /** sourceKey（SYSTEM 类型白名单键，REST 映射见 `mapSystemInternalKey`）。 */
  sourceKey: string
  /** 预置名称（数据源列表展示）。 */
  name: string
  /** 列定义（metadata 输出；与 Java `DEPT_COLUMNS` / `USER_COLUMNS` 同构）。 */
  columns: ColumnConfig[]
  /**
   * 取数模式：
   *   - `full`：返回全部行，外壳 `page=0, size=rows.length`（忽略请求分页），
   *     对齐既有 dept-tree 的 golden 语义；
   *   - `paged`：标准分页，`{total,page,size}` 来自请求。
   */
  paging: 'full' | 'paged'
}

/** 部门树列常量（对齐 Java `DEPT_COLUMNS`；字段与旧 adapter 常量逐字段一致）。 */
const DEPT_COLUMNS: ColumnConfig[] = [
  { ...newColumnConfig(), key: 'id', label: '部门 ID', columnType: 'VARCHAR', length: 64 },
  { ...newColumnConfig(), key: 'parentId', label: '上级部门 ID', columnType: 'VARCHAR', length: 64 },
  { ...newColumnConfig(), key: 'label', label: '部门名称', columnType: 'VARCHAR', length: 128 },
  { ...newColumnConfig(), key: 'code', label: '部门编码', columnType: 'VARCHAR', length: 64 },
]

/** 用户列常量（对齐 Java `USER_COLUMNS`）。 */
const USER_COLUMNS: ColumnConfig[] = [
  { ...newColumnConfig(), key: 'id', label: '用户 ID', columnType: 'VARCHAR', length: 64 },
  { ...newColumnConfig(), key: 'username', label: '用户名', columnType: 'VARCHAR', length: 64 },
  { ...newColumnConfig(), key: 'nickname', label: '昵称', columnType: 'VARCHAR', length: 64 },
  { ...newColumnConfig(), key: 'orgId', label: '部门 ID', columnType: 'VARCHAR', length: 64 },
  { ...newColumnConfig(), key: 'orgName', label: '部门名称', columnType: 'VARCHAR', length: 128 },
  { ...newColumnConfig(), key: 'status', label: '状态', columnType: 'TINYINT', length: 1 },
]

/** 菜单列常量（`SystemService.menuTree()` 字段面）。 */
const MENU_COLUMNS: ColumnConfig[] = [
  { ...newColumnConfig(), key: 'id', label: '菜单 ID', columnType: 'VARCHAR', length: 64 },
  { ...newColumnConfig(), key: 'parentId', label: '上级菜单 ID', columnType: 'VARCHAR', length: 64 },
  { ...newColumnConfig(), key: 'menuName', label: '菜单名称', columnType: 'VARCHAR', length: 128 },
  { ...newColumnConfig(), key: 'menuType', label: '类型', columnType: 'TINYINT', length: 1 },
  { ...newColumnConfig(), key: 'path', label: '路由路径', columnType: 'VARCHAR', length: 255 },
  { ...newColumnConfig(), key: 'permission', label: '权限标识', columnType: 'VARCHAR', length: 128 },
  { ...newColumnConfig(), key: 'sortOrder', label: '排序', columnType: 'INTEGER' },
]

/** 角色列常量（`SystemService.listRoles()` 字段面）。 */
const ROLE_COLUMNS: ColumnConfig[] = [
  { ...newColumnConfig(), key: 'id', label: '角色 ID', columnType: 'VARCHAR', length: 64 },
  { ...newColumnConfig(), key: 'roleName', label: '角色名称', columnType: 'VARCHAR', length: 128 },
  { ...newColumnConfig(), key: 'roleCode', label: '角色编码', columnType: 'VARCHAR', length: 64 },
  { ...newColumnConfig(), key: 'description', label: '描述', columnType: 'VARCHAR', length: 255 },
  { ...newColumnConfig(), key: 'status', label: '状态', columnType: 'TINYINT', length: 1 },
]

/** 字典类型列常量（`SystemService.listDictTypes()` 字段面）。 */
const DICT_COLUMNS: ColumnConfig[] = [
  { ...newColumnConfig(), key: 'id', label: '字典 ID', columnType: 'VARCHAR', length: 64 },
  { ...newColumnConfig(), key: 'dictCode', label: '字典编码', columnType: 'VARCHAR', length: 64 },
  { ...newColumnConfig(), key: 'dictName', label: '字典名称', columnType: 'VARCHAR', length: 128 },
  { ...newColumnConfig(), key: 'remark', label: '备注', columnType: 'VARCHAR', length: 255 },
  { ...newColumnConfig(), key: 'status', label: '状态', columnType: 'TINYINT', length: 1 },
]

/** 流程定义列常量（`ProcessDesignService.listSummaries()` 字段面）。 */
const PROCESS_DEF_COLUMNS: ColumnConfig[] = [
  { ...newColumnConfig(), key: 'id', label: '流程定义 ID', columnType: 'VARCHAR', length: 64 },
  { ...newColumnConfig(), key: 'key', label: '流程标识', columnType: 'VARCHAR', length: 64 },
  { ...newColumnConfig(), key: 'name', label: '流程名称', columnType: 'VARCHAR', length: 128 },
  { ...newColumnConfig(), key: 'version', label: '版本', columnType: 'INTEGER' },
]

/** 流程实例列常量（`ProcessInstanceService.listInstances()` 字段面）。 */
const PROCESS_INSTANCE_COLUMNS: ColumnConfig[] = [
  { ...newColumnConfig(), key: 'id', label: '实例 ID', columnType: 'VARCHAR', length: 64 },
  { ...newColumnConfig(), key: 'name', label: '实例名称', columnType: 'VARCHAR', length: 128 },
  { ...newColumnConfig(), key: 'processDefinitionName', label: '流程名称', columnType: 'VARCHAR', length: 128 },
  { ...newColumnConfig(), key: 'businessKey', label: '业务标识', columnType: 'VARCHAR', length: 64 },
  { ...newColumnConfig(), key: 'currentNode', label: '当前节点', columnType: 'VARCHAR', length: 128 },
  { ...newColumnConfig(), key: 'status', label: '状态', columnType: 'VARCHAR', length: 32 },
  { ...newColumnConfig(), key: 'startTime', label: '发起时间', columnType: 'VARCHAR', length: 64 },
]

/** 待办任务列常量（`TaskService.listTodo()` 字段面；主键字段是 `taskId` 不是 `id`）。 */
const TODO_TASK_COLUMNS: ColumnConfig[] = [
  { ...newColumnConfig(), key: 'taskId', label: '任务 ID', columnType: 'VARCHAR', length: 64 },
  { ...newColumnConfig(), key: 'currentNodeName', label: '当前节点', columnType: 'VARCHAR', length: 128 },
  { ...newColumnConfig(), key: 'processName', label: '流程名称', columnType: 'VARCHAR', length: 128 },
  { ...newColumnConfig(), key: 'assignee', label: '办理人', columnType: 'VARCHAR', length: 64 },
  { ...newColumnConfig(), key: 'initiatorName', label: '发起人', columnType: 'VARCHAR', length: 64 },
  { ...newColumnConfig(), key: 'createTime', label: '创建时间', columnType: 'VARCHAR', length: 64 },
]

/** 8 个系统内建数据源（顺序即预置顺序；前 2 个是历史既有 key，后 6 个本轮新增）。 */
export const BUILT_IN_SYSTEM_SOURCES: BuiltInSystemSource[] = [
  { sourceKey: 'dept-tree', name: '组织机构', columns: DEPT_COLUMNS, paging: 'full' },
  { sourceKey: 'user-tree', name: '系统用户', columns: USER_COLUMNS, paging: 'paged' },
  { sourceKey: 'sys-menus', name: '系统菜单', columns: MENU_COLUMNS, paging: 'full' },
  { sourceKey: 'sys-roles', name: '系统角色', columns: ROLE_COLUMNS, paging: 'paged' },
  { sourceKey: 'sys-dicts', name: '系统字典', columns: DICT_COLUMNS, paging: 'paged' },
  { sourceKey: 'process-definitions', name: '流程定义', columns: PROCESS_DEF_COLUMNS, paging: 'full' },
  { sourceKey: 'process-instances', name: '流程实例', columns: PROCESS_INSTANCE_COLUMNS, paging: 'paged' },
  { sourceKey: 'todo-tasks', name: '待办任务', columns: TODO_TASK_COLUMNS, paging: 'paged' },
]

/** 内建 sourceKey 集合（SYSTEM 类型白名单 = 本目录）。 */
export const BUILT_IN_SOURCE_KEYS: ReadonlySet<string> = new Set(
  BUILT_IN_SYSTEM_SOURCES.map((source) => source.sourceKey),
)

/** 按 sourceKey 取内建定义；未知 key 返回 null。 */
export function builtInSourceByKey(sourceKey: string): BuiltInSystemSource | null {
  return BUILT_IN_SYSTEM_SOURCES.find((source) => source.sourceKey === sourceKey) ?? null
}

/**
 * sourceKey → 内部 REST 路径段（对齐 Java `mapSystemInternalKey` 的角色）。
 *
 * `dept-tree` / `user-tree` 是历史契约（dept-tree 原样、user-tree → users）；
 * 新 6 个按语义命名，指向 `SystemInternalController` 的对应端点。
 */
export function mapSystemInternalPath(sourceKey: string | null): string {
  switch (sourceKey) {
    case 'dept-tree':
      return 'dept-tree'
    case 'user-tree':
      return 'users'
    case 'sys-menus':
      return 'menus'
    case 'sys-roles':
      return 'roles'
    case 'sys-dicts':
      return 'dicts'
    case 'process-definitions':
      return 'process/definitions'
    case 'process-instances':
      return 'process/instances'
    case 'todo-tasks':
      return 'process/todo-tasks'
    default:
      return ''
  }
}
