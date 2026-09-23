import { Injectable } from '@nestjs/common'
import { BusinessException } from '../../../common/exception/business-exception'
import { newColumnConfig, type ColumnConfig, type DataSourceMetadata } from '../../../common/domain/column-config'
import type { BizDataPageVO, BizDataVO } from '../../../common/domain/biz-data'
import { resolveSortable } from '../../form/column/column-config-parser'
import { BizDataService } from '../../form/bizdata/biz-data.service'
import type { BizDataQueryRequest } from '../../form/bizdata/biz-data-support'
import { InternalDataSourceRouter } from '../internal-data-source-router'
import { SystemService } from '../../../system/service/system.service'
import { HttpLogicExecutor } from '../../logic/http-logic-executor'
import { WorkflowFormDataQueryService } from '../workflow-form-data-query.service'
import {
  cloneColumns,
  type DataSourceAdapter,
  type DataSourceRef,
} from './data-source-adapter'
import {
  isConfigMode,
  isSqlMode,
  isVisualMode,
  parseFormQueryConfig,
} from '../../form/bizdata/form-query-config'
import type { JoinConfig } from '../../form/bizdata/join-sql-generator'

/** 组织树节点（`SystemService.orgTree()` 的返回元素，只用到这四个字段）。 */
interface OrgTreeNode {
  id: number
  parentId: number | null
  label: string | null
  code: string | null
  children?: OrgTreeNode[] | null
}

/** 部门树列常量（对齐 Java `DEPT_COLUMNS`）。 */
const DEPT_COLUMNS: ColumnConfig[] = [
  { ...newColumnConfig(), key: 'id', label: '部门 ID', columnType: 'VARCHAR', length: 64 },
  { ...newColumnConfig(), key: 'parentId', label: '上级部门 ID', columnType: 'VARCHAR', length: 64 },
  { ...newColumnConfig(), key: 'label', label: '部门名称', columnType: 'VARCHAR', length: 128 },
  { ...newColumnConfig(), key: 'code', label: '部门编码', columnType: 'VARCHAR', length: 64 },
]

/** 用户树列常量（对齐 Java `USER_COLUMNS`）。 */
const USER_COLUMNS: ColumnConfig[] = [
  { ...newColumnConfig(), key: 'id', label: '用户 ID', columnType: 'VARCHAR', length: 64 },
  { ...newColumnConfig(), key: 'username', label: '用户名', columnType: 'VARCHAR', length: 64 },
  { ...newColumnConfig(), key: 'nickname', label: '昵称', columnType: 'VARCHAR', length: 64 },
  { ...newColumnConfig(), key: 'orgId', label: '部门 ID', columnType: 'VARCHAR', length: 64 },
  { ...newColumnConfig(), key: 'orgName', label: '部门名称', columnType: 'VARCHAR', length: 128 },
  { ...newColumnConfig(), key: 'status', label: '状态', columnType: 'TINYINT', length: 1 },
]

/**
 * 复制列并强制 `sortable=false`（对齐 Java `copyWithSortableFalse`）。
 *
 * ⚠️ **只拷 key/label/columnType**，`length` 等其余字段保持 `newColumnConfig()` 的默认值
 * （即 null）—— golden 实测 SYSTEM 元数据的列上 `length: null`，尽管常量里写了 64/128。
 * 「顺手把 length 也拷过来」会立刻与 Java 分叉。
 */
function copyWithSortableFalse(src: ColumnConfig[]): ColumnConfig[] {
  return src.map((column) => ({
    ...newColumnConfig(),
    key: column.key,
    label: column.label,
    columnType: column.columnType,
    sortable: false,
  }))
}

/**
 * 追加 sql 模式管理员声明列到 metadata；与主表列 key 重复的声明列跳过
 * （对齐 Java `appendDeclaredColumns`）。
 *
 * `label` 空白时回落 `key`。同样只拷 5 个字段。
 */
function appendDeclaredColumns(columns: ColumnConfig[], declared: ColumnConfig[]): void {
  const existing = new Set(columns.map((column) => column.key))
  for (const item of declared) {
    const key = item.key
    if (key === null || key.trim() === '' || existing.has(key)) continue
    columns.push({
      ...newColumnConfig(),
      key,
      label: item.label === null || item.label.trim() === '' ? key : item.label,
      columnType: item.columnType,
      sortable: item.sortable,
      filterable: item.filterable,
    })
    existing.add(key)
  }
}

/** 本适配器覆盖的数据源类型（与 Java `UnifiedDataSourceAdapter.supports` 完全一致）。 */
const SUPPORTED_TYPES = ['FORM', 'SYSTEM', 'API', 'WORKFLOW', 'SQL']

/**
 * 统一数据源适配器（对齐 Java `com.workflow.engine.datasource.UnifiedDataSourceAdapter`）。
 *
 * **5 种类型的读路径全部已迁移且在契约网内**（FORM / SYSTEM / API / WORKFLOW / SQL）：
 * 「数据源元数据与取数」「SYSTEM 数据源读路径」「API 数据源读路径」「WORKFLOW 数据源读路径」
 * 「SQL 数据源（管理员模板）」「FORM 数据源 config 与 sql 查询模式」六个场景覆盖。
 *
 * `supports()` 刻意对全部 5 种类型都返回 true —— **选路逻辑必须与 Java 一致**，
 * 否则一个 SYSTEM 数据源会得到「数据源类型未启用」这种**错误的**错误信息，
 * 掩盖真正的原因。真正走到「与 Java 不一致的类型」时由 `notMigrated()` 显式抛错
 * （当前只可能在数据库里出现未知 `type` 值时才触发）。
 */
@Injectable()
export class UnifiedDataSourceAdapter implements DataSourceAdapter {
  constructor(
    private readonly bizDataService: BizDataService,
    private readonly router: InternalDataSourceRouter,
    private readonly systemService: SystemService,
    private readonly httpExecutor: HttpLogicExecutor,
    private readonly workflowQuery: WorkflowFormDataQueryService,
  ) {}

  supports(type: string): boolean {
    return SUPPORTED_TYPES.includes(type)
  }

  async metadata(dataSource: DataSourceRef): Promise<DataSourceMetadata> {
    if (dataSource.type === 'SYSTEM') {
      // ⚠️ SYSTEM 的列是**常量**（Java 的 DEPT_COLUMNS / USER_COLUMNS），不查库；
      //    且 `writable=false`（系统数据源只读）。
      //    ⚠️ `copyWithSortableFalse` 只拷 key/label/columnType —— **不拷 length**，
      //    golden 实测列上 `length: null`（尽管常量里写了 64/128）。
      const columns = copyWithSortableFalse(
        dataSource.sourceKey === 'user-tree' ? USER_COLUMNS : DEPT_COLUMNS,
      )
      return { columns, writable: false, formKey: null }
    }
    if (dataSource.type === 'WORKFLOW') {
      // 列来自最新 PUBLISHED 表单的 **schema**（WORKFLOW 表单的 columnConfig 为空），
      // 只读，formKey 原样带出。
      const columns = await this.workflowQuery.columnsFor(requireFormKey(dataSource, 'metadata'))
      resolveSortable(columns)
      return { columns, writable: false, formKey: dataSource.formKey }
    }
    if (dataSource.type === 'API') {
      return this.apiMetadata(dataSource, this.parseApiParams(dataSource))
    }
    if (dataSource.type === 'SQL') {
      // 字段元数据 = params.columns（**单一来源**；探测/主表单覆盖/行内编辑由前端写入，
      // 不与绑定表单的列做默认合并）。config 模式下声明列来自 joins，故为**空列表**。
      const config = parseFormQueryConfig(dataSource.params, (message) => new BusinessException(400, message))
      const columns = isConfigMode(config) ? [] : config.columns
      const writable = dataSource.formKey !== null && dataSource.formKey.trim() !== ''
      return {
        columns,
        writable,
        formKey: writable ? dataSource.formKey : null,
      }
    }
    if (dataSource.type !== 'FORM') {
      throw notMigrated(dataSource, 'metadata')
    }
    const formKey = requireFormKey(dataSource, 'metadata')
    const columns = cloneColumns(await this.bizDataService.loadColumns(formKey))

    // config / sql 两种 queryMode 会往列清单里追加 JOIN 虚拟列或声明列
    // （对齐 Java `metadata` 的 FORM 分支：config → appendJoinColumns，sql → appendDeclaredColumns）
    const config = parseFormQueryConfig(dataSource.params, (message) => new BusinessException(400, message))
    if (isConfigMode(config)) {
      await this.appendJoinColumns(columns, config.joins)
    } else if (isSqlMode(config)) {
      appendDeclaredColumns(columns, config.columns)
    }

    resolveSortable(columns)
    return { columns, writable: true, formKey }
  }

  async query(dataSource: DataSourceRef, req: BizDataQueryRequest): Promise<BizDataPageVO> {
    if (dataSource.type === 'SYSTEM') {
      // 先过 router（Java 的 SYSTEM 分支里有 `router.resolve(ds, "list")`），再取数
      this.router.resolve(dataSource, 'list')
      return this.systemQuery(dataSource, req)
    }
    if (dataSource.type === 'WORKFLOW') {
      return this.workflowQuery.query(String(dataSource.formKey), req)
    }
    if (dataSource.type === 'API') {
      return this.apiQuery(dataSource, req)
    }
    if (dataSource.type === 'SQL') {
      this.router.resolve(dataSource, 'list')
      const config = parseFormQueryConfig(dataSource.params, (message) => new BusinessException(400, message))
      if (isVisualMode(config) || isSqlMode(config)) {
        // 绕过表单 covering handler：SQL 数据源执行管理员显式 SQL，不被绑定表单业务定制劫持
        return this.bizDataService.querySqlRaw(dataSource.formKey, req, config)
      }
      throw new BusinessException(400, 'SQL 数据源缺少查询配置')
    }
    if (dataSource.type !== 'FORM') {
      throw notMigrated(dataSource, 'query')
    }
    const formKey = requireFormKey(dataSource, 'query')
    const config = parseFormQueryConfig(dataSource.params, (message) => new BusinessException(400, message))
    if (isConfigMode(config)) {
      return this.bizDataService.queryJoin(formKey, req, config.joins)
    }
    if (isSqlMode(config)) {
      return this.bizDataService.querySql(formKey, req, config)
    }
    // visual 模式在 FORM 类型上**不**生效（Java 只判 config/sql），回退单表查询
    return this.bizDataService.query(formKey, req)
  }

  async get(dataSource: DataSourceRef, id: string): Promise<BizDataVO> {
    if (dataSource.type === 'SYSTEM') {
      // Java `systemGet`：取**全部行**（忽略分页）再按 id 找，找不到 → 业务 404
      const all = await this.systemQuery(dataSource, {
        filter: null,
        keyword: null,
        keywordColumn: null,
        sort: null,
        order: null,
        params: null,
        page: 1,
        size: 20,
      })
      const row = all.records.find((r) => r.id === id)
      if (row === undefined) {
        throw new BusinessException(404, `系统数据不存在: ${id}`)
      }
      return row
    }
    if (dataSource.type === 'WORKFLOW') {
      return this.workflowQuery.getById(String(dataSource.formKey), id)
    }
    if (dataSource.type === 'API') {
      return this.apiGet(dataSource, id)
    }
    if (dataSource.type === 'SQL') {
      // SQL 类型行级操作**始终走绑定表单**（`get` 未绑定 → 400）
      return this.bizDataService.getById(requireFormKey(dataSource, 'get'), id)
    }
    if (dataSource.type !== 'FORM') {
      throw notMigrated(dataSource, 'get')
    }
    const formKey = requireFormKey(dataSource, 'get')
    return this.bizDataService.getById(formKey, id)
  }

  // ==================== SYSTEM 取数（对齐 Java 的 systemQuery 两个分支） ====================

  /**
   * 系统数据源取数。
   *
   * ⚠️ 两个分支的**分页语义完全不同**（golden 实测）：
   *   - `user-tree`：走用户分页（keyword + page/size 都生效），`{total, page, size}` 来自请求；
   *   - 其余（含 `dept-tree`）：返回**全部扁平化节点**，外壳是 `page=0, size=rows.length`
   *     —— **忽略请求里的分页**。照抄，不要"顺手"改成尊重分页。
   *
   * ⚠️ 空值一律给**空串**而不是 null（`parentId`/`code`/`nickname`/`orgId`/`orgName`），
   *    这与「null 列不进 data」的 FORM 路径完全不同。
   */
  private async systemQuery(
    dataSource: DataSourceRef,
    req: BizDataQueryRequest,
  ): Promise<BizDataPageVO> {
    if (dataSource.sourceKey === 'user-tree') {
      const page = Math.max(req.page, 1)
      const result = await this.systemService.listUsersByUsername(req.keyword, page, req.size)
      const records: BizDataVO[] = result.rows.map((row) => ({
        id: String(row.id),
        data: {
          id: String(row.id),
          username: row.username,
          nickname: row.nickname ?? '',
          orgId: row.orgId === null || row.orgId === undefined ? '' : String(row.orgId),
          orgName: row.orgName ?? '',
          status: row.status,
        },
        version: null,
        createdAt: null,
        updatedAt: null,
      }))
      return { records, total: result.total, page: result.page, size: result.size }
    }

    const nodes = await this.systemService.orgTree()
    const records: BizDataVO[] = []
    const collect = (node: OrgTreeNode): void => {
      records.push({
        id: String(node.id),
        data: {
          id: String(node.id),
          parentId: node.parentId === null || node.parentId === undefined ? '' : String(node.parentId),
          label: node.label ?? '',
          code: node.code ?? '',
        },
        version: null,
        createdAt: null,
        updatedAt: null,
      })
      for (const child of node.children ?? []) collect(child)
    }
    for (const node of nodes) collect(node)
    return { records, total: records.length, page: 0, size: records.length }
  }

  // ==================== 写路径（对齐 Java create / update / delete） ====================

  /**
   * 新增（对齐 Java `create`）。
   *
   * ⚠️ **每个类型走的是不同的分支，错误形态完全不同**，不能合并：
   *    - FORM：先 `router.resolve`（不是 `requireFormKey`）→ `bizDataService.create`
   *    - WORKFLOW：**只读**，恒 400
   *    - API：外部 HTTP（见 `apiCreate`）
   *    - SQL：`requireFormKey`（消息是 SQL 专属的）→ `bizDataService.create`
   *    - SYSTEM 及未知类型：`default` → 「该数据源不支持create」
   *    SYSTEM 在这里**不经过 router**（Java 的 switch 里没有 SYSTEM 分支），
   *    所以 dept-tree/user-tree 都只报「不支持」，而不是先撞 allowlist。
   */
  async create(dataSource: DataSourceRef, data: Record<string, unknown> | null): Promise<string> {
    switch (dataSource.type) {
      case 'FORM': {
        const formKey = this.formKeyAfterResolve(dataSource, 'create')
        const created = await this.bizDataService.create(formKey, data)
        return created.id
      }
      case 'WORKFLOW':
        throw readOnlyWorkflow()
      case 'API':
        return this.apiCreate(dataSource, data)
      case 'SQL': {
        const formKey = requireFormKey(dataSource, 'create')
        const created = await this.bizDataService.create(formKey, data)
        return created.id
      }
      default:
        throw unsupported(dataSource, 'create')
    }
  }

  /** 更新（对齐 Java `update`）；分支与 `create` 一一对应。 */
  async update(
    dataSource: DataSourceRef,
    id: string,
    data: Record<string, unknown> | null,
    version: number | null,
  ): Promise<void> {
    switch (dataSource.type) {
      case 'FORM': {
        const formKey = this.formKeyAfterResolve(dataSource, 'update')
        await this.bizDataService.update(formKey, id, data, version)
        return
      }
      case 'WORKFLOW':
        throw readOnlyWorkflow()
      case 'API':
        // ⚠️ 必须 `return`/`await`：`apiUpdate` 是 async，写成「调用 + return」会让
        //    拒绝变成一个**游离的 Promise**（既不抛也不等）—— 端点返回 200 而实际失败了。
        return this.apiUpdate(dataSource, id, data)
      case 'SQL': {
        const formKey = requireFormKey(dataSource, 'update')
        await this.bizDataService.update(formKey, id, data, version)
        return
      }
      default:
        throw unsupported(dataSource, 'update')
    }
  }

  /**
   * 删除（对齐 Java `delete`）。
   *
   * ⚠️ 与 create/update 的唯一结构差异：**SYSTEM 有显式分支**，它会先
   *    `router.resolve(ds, "delete")` 再抛「不支持」。Java 注释写明了原因 ——
   *    「SYSTEM is read-only at adapter level; router allows for audit」：
   *    即先让 allowlist 审计一次这次删除尝试，再拒绝。
   *    结果消息与 default 分支相同，但**未注册的 sourceKey 会先被拦下**。
   */
  async delete(dataSource: DataSourceRef, id: string): Promise<void> {
    switch (dataSource.type) {
      case 'FORM': {
        const formKey = this.formKeyAfterResolve(dataSource, 'delete')
        await this.bizDataService.remove(formKey, id)
        return
      }
      case 'SYSTEM':
        this.router.resolve(dataSource, 'delete')
        throw unsupported(dataSource, 'delete')
      case 'WORKFLOW':
        throw readOnlyWorkflow()
      case 'API':
        // 同上：必须 return，否则拒绝变成游离 Promise、outbound 失败被吞掉
        return this.apiDelete(dataSource, id)
      case 'SQL': {
        const formKey = requireFormKey(dataSource, 'delete')
        await this.bizDataService.remove(formKey, id)
        return
      }
      default:
        throw unsupported(dataSource, 'delete')
    }
  }

  // ==================== FORM helpers ====================

  /**
   * FORM 分支的 formKey：**先过 router 再取值**（顺序与 Java 一致）。
   *
   * `router.resolve` 已经拦掉了空 formKey，下面那次判断因此不可达 ——
   * 它存在的意义只是让类型收窄，消息与 router 里的那条保持逐字一致。
   */
  private formKeyAfterResolve(dataSource: DataSourceRef, op: string): string {
    this.router.resolve(dataSource, op)
    if (dataSource.formKey === null || dataSource.formKey.trim() === '') {
      throw new BusinessException(400, 'FORM 数据源缺少 formKey')
    }
    return dataSource.formKey
  }

  /**
   * 追加 config 模式 JOIN 虚拟列到 metadata；与主表列 key 重复的 `virtualKey` 跳过
   * （防御性去重，对齐 Java `appendJoinColumns`）。
   *
   * ⚠️ 这里**只拷 5 个字段**（key/label/columnType/sortable/filterable），
   *    其余（`length`/`required`/`pickerConfig`…）保持默认值。与 SYSTEM 的
   *    `copyWithSortableFalse` 是同一类坑：多拷一个字段就与 Java 分叉。
   */
  private async appendJoinColumns(
    columns: ColumnConfig[],
    joins: JoinConfig[],
  ): Promise<void> {
    const existing = new Set(columns.map((column) => column.key))
    for (const join of joins) {
      const virtualKey = join.virtualKey
      if (
        virtualKey === null ||
        virtualKey.trim() === '' ||
        existing.has(virtualKey)
      ) {
        continue
      }
      columns.push({
        ...newColumnConfig(),
        key: virtualKey,
        label: join.label === null || join.label.trim() === '' ? virtualKey : join.label,
        columnType: await this.resolveJoinColumnType(join),
        sortable: join.sortable,
        filterable: join.filterable,
      })
      existing.add(virtualKey)
    }
  }

  /**
   * 虚拟列 `columnType`：目标表单 `joinField` 的列类型；查不到 fallback `"VARCHAR"`。
   *
   * ⚠️ 与 `BizDataSupport.resolveJoinColumnType`（query 路径）**不是同一份实现**：
   *    这里要求目标列类型**非空非空白**才采用（空白继续找下一列），
   *    那边是「首个同名列，null 才 fallback」。两份差异照抄 Java，不要合并。
   */
  private async resolveJoinColumnType(join: JoinConfig): Promise<string> {
    try {
      const target = await this.bizDataService.loadColumns(String(join.targetFormKey))
      for (const column of target) {
        if (
          join.joinField === column.key &&
          column.columnType !== null &&
          column.columnType.trim() !== ''
        ) {
          return column.columnType.toUpperCase()
        }
      }
    } catch (error) {
      // 目标表单不可解析时回退（对齐 Java 的 `catch (BusinessException ignored)`）
      if (!(error instanceof BusinessException)) throw error
    }
    return 'VARCHAR'
  }

  // ==================== API helpers ====================

  /**
   * API 数据源 `params` 解析（对齐 Java `parseParams`）。
   *
   * 三种失败形态各有专属消息，且**都带数据源名**；`requireAction` 的消息反而
   * **不带**名字 —— 逐字照抄，不要「统一美化」。
   */
  private parseApiParams(dataSource: DataSourceRef): Record<string, unknown> {
    const json = dataSource.params
    if (json === null || json.trim() === '') {
      throw new BusinessException(400, `API 数据源缺少 params: ${dataSource.name}`)
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch {
      throw new BusinessException(400, `API 数据源 params 不是合法 JSON: ${dataSource.name}`)
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new BusinessException(400, `API 数据源 params 必须是 JSON 对象: ${dataSource.name}`)
    }
    return parsed as Record<string, unknown>
  }

  /**
   * 取某个操作段的配置（对齐 Java `operation`）。
   *
   * `list` 有一条**兼容旧格式**的旁路：顶层直接放 `action`/`method`/`parse` 时
   * 组装成与 `list` 子对象等价的映射。写路径的三个操作**没有**这条旁路 ——
   * 所以顶层 `action` 对 create/update/delete 不生效（这正是 golden 里
   * 「API 数据源未配置 create 操作」那条断言的来源）。
   */
  private apiOperation(
    params: Record<string, unknown>,
    name: 'list' | 'get' | 'create' | 'update' | 'delete',
  ): Record<string, unknown> | null {
    const op = params[name]
    if (op !== null && typeof op === 'object' && !Array.isArray(op)) {
      return op as Record<string, unknown>
    }
    if (name === 'list' && params.action !== null && params.action !== undefined) {
      return {
        action: params.action,
        method: params.method,
        parse: params.parse,
        totalParse: params.totalParse,
      }
    }
    return null
  }

  /** 操作段必须有非空 `action`（对齐 Java `requireAction`）。 */
  private requireApiAction(op: Record<string, unknown>, name: string): string {
    const action = op.action
    if (action === null || action === undefined || String(action).trim() === '') {
      throw new BusinessException(400, `API 数据源 ${name} 操作缺少 action`)
    }
    return String(action)
  }

  /**
   * 出站调用（对齐 Java 的 `httpExecutor.execute(action, opMethod(op), headers(params), …, vars, 10000, 10000, 0)`）。
   *
   * ⚠️ 三个常量与 Java 一致：超时 10000ms、重试 0 次、query/body 映射为空
   *    （API 数据源的参数**只通过 URL 模板变量**传递，不走 query/body 映射）。
   */
  private async apiExecute(
    dataSource: DataSourceRef,
    params: Record<string, unknown>,
    op: Record<string, unknown>,
    opName: string,
    vars: Record<string, unknown>,
  ): Promise<string> {
    const action = this.requireApiAction(op, opName)
    const method = op.method === null || op.method === undefined || String(op.method).trim() === ''
      ? 'GET'
      : String(op.method).toUpperCase()
    const headers: Record<string, string> = {}
    if (params.headers !== null && typeof params.headers === 'object' && !Array.isArray(params.headers)) {
      for (const [key, value] of Object.entries(params.headers as Record<string, unknown>)) {
        headers[key] = String(value)
      }
    }
    return this.httpExecutor.execute(
      action,
      method,
      headers,
      [],
      [],
      vars,
      DEFAULT_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
      DEFAULT_RETRY,
    )
  }

  private async apiCreate(
    dataSource: DataSourceRef,
    data: Record<string, unknown> | null,
  ): Promise<string> {
    const params = this.parseApiParams(dataSource)
    const op = this.apiOperation(params, 'create')
    if (op === null) {
      throw new BusinessException(400, `API 数据源未配置 create 操作: ${dataSource.name}`)
    }
    // Java：vars 直接就是整个 body（不是 body 映射）
    const raw = await this.apiExecute(dataSource, params, op, 'create', { ...(data ?? {}) })
    const id = asDataMap(raw).id
    return id === null || id === undefined ? '' : String(id)
  }

  private async apiUpdate(
    dataSource: DataSourceRef,
    id: string,
    data: Record<string, unknown> | null,
  ): Promise<void> {
    const params = this.parseApiParams(dataSource)
    const op = this.apiOperation(params, 'update')
    if (op === null) {
      throw new BusinessException(400, `API 数据源未配置 update 操作: ${dataSource.name}`)
    }
    await this.apiExecute(dataSource, params, op, 'update', { id, ...(data ?? {}) })
  }

  private async apiDelete(dataSource: DataSourceRef, id: string): Promise<void> {
    const params = this.parseApiParams(dataSource)
    const op = this.apiOperation(params, 'delete')
    if (op === null) {
      throw new BusinessException(400, `API 数据源未配置 delete 操作: ${dataSource.name}`)
    }
    await this.apiExecute(dataSource, params, op, 'delete', { id })
  }

  // ==================== API 读路径（对齐 Java 的 apiMetadata / apiQuery / apiGet） ====================

  /**
   * API 元数据（对齐 Java `apiMetadata` + `metadata` 里的 API 分支）。
   *
   * ⚠️ 列**来自 `params.columns`**（不查库、不探测），而且外层还会再套一次
   *    `copyWithSortableFalse` —— golden 实测：即便 `params.columns` 里写了
   *    `length: 64`，返回的列上 `length` 仍是 **null**、`sortable` 是 **false**。
   *    只拷 key/label/columnType 这一点与 SYSTEM 分支同源。
   * ⚠️ `writable` = 「配了 create / update / delete 任一」（`operation` 的旧格式旁路
   *    **只对 list 生效**，所以顶层 action 不会让 writable 变 true）。
   */
  private apiMetadata(dataSource: DataSourceRef, params: Record<string, unknown>): DataSourceMetadata {
    const columns: ColumnConfig[] = []
    const colsNode = params.columns
    if (Array.isArray(colsNode)) {
      for (const entry of colsNode) {
        if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue
        columns.push({ ...newColumnConfig(), ...(entry as Partial<ColumnConfig>) })
      }
    }
    const writable =
      this.apiOperation(params, 'create') !== null ||
      this.apiOperation(params, 'update') !== null ||
      this.apiOperation(params, 'delete') !== null
    return {
      columns: copyWithSortableFalse(columns),
      writable,
      formKey: dataSource.formKey,
    }
  }

  /**
   * API 取数（对齐 Java `apiQuery`）。
   *
   * 变量表与 Java 一致：`params.data` 的键值 + `page`/`size` + `keyword`（null → 空串），
   * 以及「keyword 非空且配了 `searchParam`」时把 keyword 再塞进 `vars[searchParam]`。
   */
  private async apiQuery(
    dataSource: DataSourceRef,
    req: BizDataQueryRequest,
  ): Promise<BizDataPageVO> {
    const params = this.parseApiParams(dataSource)
    const op = this.apiOperation(params, 'list')
    if (op === null) {
      throw new BusinessException(400, `API 数据源未配置 list 操作: ${dataSource.name}`)
    }
    const vars: Record<string, unknown> = {}
    if (params.data !== null && typeof params.data === 'object' && !Array.isArray(params.data)) {
      for (const [key, value] of Object.entries(params.data as Record<string, unknown>)) {
        vars[key] = value
      }
    }
    vars.page = req.page
    vars.size = req.size
    const keyword = req.keyword
    vars.keyword = keyword === null || keyword === undefined ? '' : keyword
    const searchParam = params.searchParam === null || params.searchParam === undefined
      ? null
      : String(params.searchParam)
    if (
      keyword !== null &&
      keyword !== undefined &&
      keyword.trim() !== '' &&
      searchParam !== null &&
      searchParam.trim() !== ''
    ) {
      vars[searchParam] = keyword
    }
    const raw = await this.apiExecute(dataSource, params, op, 'list', vars)
    return toPageVO(raw, op, req)
  }

  /** API 单行取数（对齐 Java `apiGet`）：变量只有 `id`。 */
  private async apiGet(dataSource: DataSourceRef, id: string): Promise<BizDataVO> {
    const params = this.parseApiParams(dataSource)
    const op = this.apiOperation(params, 'get')
    if (op === null) {
      throw new BusinessException(400, `API 数据源未配置 get 操作: ${dataSource.name}`)
    }
    const raw = await this.apiExecute(dataSource, params, op, 'get', { id })
    return { id, data: asDataMap(raw), version: null, createdAt: null, updatedAt: null }
  }
}

/** API 数据源的固定出站超时（对齐 Java `DEFAULT_TIMEOUT_MS`）。 */
const DEFAULT_TIMEOUT_MS = 10000
/** API 数据源的固定重试次数（对齐 Java `DEFAULT_RETRY`）。 */
const DEFAULT_RETRY = 0

/**
 * 出站响应 → `{id, data}` 映射（对齐 Java `asDataMap`）。
 *
 * ⚠️ 字符串响应要**先当 JSON 解析**；解析失败时 Java 抛
 * 「外部 API 响应不是合法 JSON」（400）。对象直接返回；其余（数组/标量/null）→ 空对象。
 */
export function asDataMap(raw: unknown): Record<string, unknown> {
  if (raw === null || raw === undefined) return {}
  if (typeof raw === 'string') {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new BusinessException(400, '外部 API 响应不是合法 JSON')
    }
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return {}
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  return {}
}

/**
 * 出站响应 → 分页结果（对齐 Java `toPageVO`）。
 *
 * 三步：把响应解析成 JSON 树 → 按 `op.parse` 的路径 walk 到数组（walk 不到或不是数组 →
 * **空页**，不是报错）→ 逐行取 `id` 字段；`total` 默认取行数，配了 `totalParse`
 * 且该处是数字时以它为准。
 *
 * ⚠️ `page` 用 `Math.max(req.page, 1)` 归一，`size` 原样透传（与 Java 一致）。
 */
export function toPageVO(
  raw: unknown,
  op: Record<string, unknown>,
  req: BizDataQueryRequest,
): BizDataPageVO {
  const page = Math.max(req.page, 1)
  let root: unknown
  try {
    root = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    throw new BusinessException(400, '外部 API 响应不是合法 JSON')
  }

  const parsePath = op.parse === null || op.parse === undefined ? null : String(op.parse)
  const recordsNode = parsePath === null || parsePath.trim() === '' ? root : walkPath(root, parsePath)
  if (!Array.isArray(recordsNode)) {
    return { records: [], total: 0, page, size: req.size }
  }

  const records: BizDataVO[] = recordsNode.map((item) => {
    const data =
      item !== null && typeof item === 'object' && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : {}
    const id = data.id === null || data.id === undefined ? '' : String(data.id)
    return { id, data, version: null, createdAt: null, updatedAt: null }
  })

  let total = records.length
  const totalParse = op.totalParse === null || op.totalParse === undefined ? null : String(op.totalParse)
  if (totalParse !== null && totalParse.trim() !== '') {
    const node = walkPath(root, totalParse)
    if (typeof node === 'number') total = node
  }
  return { records, total, page, size: req.size }
}

/** 按 `.` 分段 walk JSON（对齐 Java `walkPath`：中途不是对象 → null）。 */
function walkPath(root: unknown, path: string): unknown {
  let current: unknown = root
  for (const part of path.split('.')) {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) return null
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

/** FORM 数据源必须有 formKey（对齐 Java `UnifiedDataSourceAdapter.requireFormKey`）。 */
function requireFormKey(dataSource: DataSourceRef, op: string): string {
  if (dataSource.formKey === null || dataSource.formKey.trim() === '') {
    throw new BusinessException(400, `SQL 数据源未绑定表单，不支持${op}操作: ${dataSource.name}`)
  }
  return dataSource.formKey
}

/** WORKFLOW 数据源只读（对齐 Java 里硬编码的那条消息）。 */
function readOnlyWorkflow(): BusinessException {
  return new BusinessException(400, '工作流表单数据源为只读，不支持该操作')
}

/** 该类型不支持该操作（对齐 Java `unsupported`）。 */
function unsupported(dataSource: DataSourceRef, op: string): BusinessException {
  return new BusinessException(400, `该数据源不支持${op}: ${dataSource.name}`)
}

/**
 * 兜底分支（未知 `type`）。
 *
 * ⚠️ `supports()` 只声明 FORM/SYSTEM/API/WORKFLOW/SQL 五种类型，`adapterOf` 也只会在这些
 *    类型上选中本适配器 —— 所以这条路径**只有在数据库里出现未知 `type` 值时**才会走到。
 *    文案刻意写「未知类型」而不是「尚未迁移」：五条分支都已迁移完，
 *    留着旧文案会让人以为还有没做完的活（本仓库已经因为过期留痕误判过几次）。
 */
function notMigrated(dataSource: DataSourceRef, op: string): BusinessException {
  return new BusinessException(
    500,
    `数据源类型 ${dataSource.type} 的 ${op} 未实现：未知类型（不在支持的 5 种数据源类型内）`,
  )
}
