import { Inject, Injectable } from '@nestjs/common'
import type { RowDataPacket } from 'mysql2'
import type { Pool } from 'mysql2'
import { newColumnConfig, type ColumnConfig } from '../../common/domain/column-config'
import type { BizDataPageVO, BizDataVO } from '../../common/domain/biz-data'
import { BusinessException } from '../../common/exception/business-exception'
import { MYSQL_POOL } from '../../framework/database/database.module'
import { getTenantId } from '../../framework/tenant/tenant-context'
import type { BizDataQueryRequest } from '../form/bizdata/biz-data-support'
import { FormDefinitionRepository } from '../form/repository/form-definition.repository'
import { extract, extractFromSchema } from '../form/column/form-schema-column-extractor'

/** 列名白名单（对齐 Java `COL_PATTERN`）。 */
const COL_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/

/** 可排序的系统列 key（映射底层 `start_time`）；其余系统列是派生列、不可排。 */
const START_TIME_KEY = 'startTime'

/** 派生系统列（不可排序）。 */
const DERIVED_SYSTEM_KEYS = new Set([
  'instanceId',
  'processStatus',
  'initiatorName',
  'currentNodeName',
])

const PAGE_SELECT =
  'SELECT f.id, f.data_json, f.process_instance_id, h.start_time, h.initiator'

/**
 * ⚠️ 与 Java 的**唯一结构性差异**：Java 这里 JOIN 的是 `ACT_HI_PROCINST`（Flowable 的历史实例表），
 * 而 Node 按约束 C2 **不读不写 `ACT_*`**，改用自研引擎的 `wfe_process_instance`。
 *
 * 换表之后契约仍然能对上：两个后端各读**自己引擎写的表**（录制轮 Java 建实例落 `ACT_*`、
 * 比对轮 Node 落 `wfe_*`），而观测到的语义值相同（`startTime` 是该实例的真实开始时间、
 * `status` 是 running/completed、`initiatorName` 是发起人昵称）。
 * **不能**为了"统一"而改成读同一张表 —— 那样总有一侧永远查不到数据。
 */
const BASE_FROM =
  ' FROM wf_form_data f' +
  ' LEFT JOIN wfe_process_instance h ON h.id = f.process_instance_id' +
  ' WHERE f.tenant_id = ? AND f.form_def_id IN (__IDS__)' +
  ' AND f.is_snapshot = 0 AND f.process_instance_id IS NOT NULL'

/**
 * WORKFLOW 数据源查询服务（对齐 Java `WorkflowFormDataQueryService`，427 行）：
 * 按 formKey **跨流程实例聚合** `wf_form_data`。
 *
 * - 每个流程实例一行：5 个系统列 + 最新 PUBLISHED schema 的业务列
 *   （旧版本多余字段忽略、缺失字段置 null）；
 * - 草稿行（`is_snapshot=1` 或未关联实例）排除；
 * - 列名拼进 `JSON_EXTRACT` 之前**强制白名单**（正则 + 最新 schema 键）防注入。
 *
 * ⚠️ 这里直接用原始连接池而不是 Kysely：这是一条**原生 SQL**，列名要拼进
 *    `JSON_EXTRACT(f.data_json, '$.<col>')`，Kysely 的 `sql.ref` 表达不了这种 JSON 路径，
 *    硬套反而容易把白名单绕过去。值与 IN 列表仍然全部走**参数绑定**。
 */
@Injectable()
export class WorkflowFormDataQueryService {
  constructor(
    @Inject(MYSQL_POOL) private readonly pool: Pool,
    private readonly formDefRepository: FormDefinitionRepository,
  ) {}

  /** WORKFLOW 数据源固定系统列（只有 `startTime` 可排序）。 */
  systemColumns(): ColumnConfig[] {
    const column = (key: string, label: string, type = 'VARCHAR'): ColumnConfig => ({
      ...newColumnConfig(),
      key,
      label,
      columnType: type,
    })
    return [
      { ...column('instanceId', '流程实例ID'), sortable: false },
      { ...column('processStatus', '流程状态'), sortable: false },
      { ...column('initiatorName', '发起人'), sortable: false },
      { ...column('startTime', '发起时间', 'DATETIME'), sortable: true },
      { ...column('currentNodeName', '当前节点'), sortable: false },
    ]
  }

  /**
   * 该 formKey 最新 PUBLISHED schema 解析出的**业务列**（不含系统列）。
   *
   * ⚠️ WORKFLOW 类型**始终**从 schema 的 rule 数组解析，忽略 `column_config`
   *    （防止被误存的数据干扰）；其他类型才用 `column_config`。
   */
  async columnsFor(formKey: string): Promise<ColumnConfig[]> {
    const latest = await this.latestPublished(formKey)
    return [...(await this.businessColumns(latest)).values()]
  }

  /** 跨实例分页查询（filter/keyword 只接受最新 schema 白名单列）。 */
  async query(formKey: string, req: BizDataQueryRequest): Promise<BizDataPageVO> {
    const tenantId = getTenantId()
    const latest = await this.latestPublished(formKey)
    const bizCols = await this.businessColumns(latest)
    const filters = await this.parseFilters(req.filter, latest, bizCols)
    const keywordColumn = this.resolveKeywordColumn(req, bizCols)

    const ids = await this.versionIds(formKey)
    const size = Math.max(1, req.size)
    const page = Math.max(req.page, 1)
    if (ids.length === 0) {
      return { records: [], total: 0, page, size }
    }

    const params: unknown[] = [tenantId, ...ids]
    let where = BASE_FROM.replace('__IDS__', ids.map(() => '?').join(', '))
    for (const [key, value] of Object.entries(filters)) {
      where += ` AND JSON_UNQUOTE(JSON_EXTRACT(f.data_json, '$.${key}')) = ?`
      params.push(String(value))
    }
    if (keywordColumn !== null) {
      where += ` AND JSON_UNQUOTE(JSON_EXTRACT(f.data_json, '$.${keywordColumn}')) LIKE CONCAT('%', ?, '%')`
      params.push(String(req.keyword).trim())
    }

    const [countRows] = await this.pool
      .promise()
      .query<Array<RowDataPacket & { c: number | string }>>(`SELECT COUNT(*) AS c${where}`, params)
    const total = Number(countRows[0]?.c ?? 0)

    const orderBy = this.buildOrderBy(req, bizCols)
    const [rows] = await this.pool.promise().query<RowDataPacket[]>(
      `${PAGE_SELECT}${where}${orderBy} LIMIT ? OFFSET ?`,
      [...params, size, (page - 1) * size],
    )
    return await this.assemble(latest, rows, total, page, size)
  }

  /** 单条详情；不存在 → 404。 */
  async getById(formKey: string, id: string): Promise<BizDataVO> {
    const tenantId = getTenantId()
    const latest = await this.latestPublished(formKey)
    const ids = await this.versionIds(formKey)
    if (ids.length === 0) {
      throw new BusinessException(404, `数据不存在: ${id}`)
    }
    const where =
      BASE_FROM.replace('__IDS__', ids.map(() => '?').join(', ')) +
      ' AND f.id = ? ORDER BY COALESCE(h.start_time, f.created_at) DESC LIMIT 1'
    const [rows] = await this.pool
      .promise()
      .query<RowDataPacket[]>(`${PAGE_SELECT}${where}`, [tenantId, ...ids, id])
    if (rows.length === 0) {
      throw new BusinessException(404, `数据不存在: ${id}`)
    }
    const page = await this.assemble(latest, rows, rows.length, 0, 1)
    return page.records[0]
  }

  // ==================== 行组装 ====================

  /** 系统列在前，业务列只取**最新** schema 的键（多余忽略、缺失置 null）。 */
  private async assemble(
    latest: { key: string; type: string; schema: string | null; column_config: string | null },
    rows: RowDataPacket[],
    total: number,
    page: number,
    size: number,
  ): Promise<BizDataPageVO> {
    const bizCols = await this.businessColumns(latest)
    const bizKeys = [...bizCols.keys()]

    const pids: string[] = []
    for (const row of rows) {
      const pid = row.process_instance_id
      if (pid !== null && pid !== undefined && String(pid).trim() !== '') pids.push(String(pid))
    }
    const statuses = await this.resolveStatuses(pids)
    const nodes = await this.resolveCurrentNodes(pids)
    const userNames = await this.resolveUserNames(rows)

    const records: BizDataVO[] = rows.map((row) => {
      const raw = parseDataJson(row.data_json)
      const pid = row.process_instance_id === null ? '' : String(row.process_instance_id)
      const userId = parseUserId(row.initiator)
      const startTime = row.start_time === null || row.start_time === undefined ? null : row.start_time
      const data: Record<string, unknown> = {
        instanceId: pid.trim() === '' ? null : pid,
        processStatus: statuses.get(pid) ?? null,
        initiatorName: userId === null ? null : (userNames.get(userId) ?? null),
        startTime,
        currentNodeName: nodes.get(pid) ?? null,
      }
      for (const key of bizKeys) data[key] = raw[key] ?? null
      return { id: String(row.id), data, version: null, createdAt: null, updatedAt: null }
    })
    return { records, total, page, size }
  }

  /** 运行中/挂起走实例表，其余视为已结束（对齐 Java 的三态）。 */
  private async resolveStatuses(pids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    const unique = [...new Set(pids)]
    if (unique.length === 0) return map
    const [rows] = await this.pool.promise().query<RowDataPacket[]>(
      `SELECT id, status FROM wfe_process_instance WHERE tenant_id = ? AND id IN (${unique
        .map(() => '?')
        .join(', ')})`,
      [getTenantId(), ...unique],
    )
    for (const row of rows) {
      const status = String(row.status)
      map.set(String(row.id), status === 'RUNNING' ? 'running' : status === 'SUSPENDED' ? 'suspended' : 'completed')
    }
    for (const pid of unique) map.set(pid, map.get(pid) ?? 'completed')
    return map
  }

  /**
   * 当前活动节点名，多个节点用「、」连接（对齐 Java `resolveCurrentNodes`）。
   *
   * ⚠️ 节点名要回**流程模型**里取（BPMN 的元素名）：`wfe_task.name` 是 null
   *    （引擎建任务时不写它），不能用它。（本路径未进契约网 —— 场景里的实例没有活跃任务。）
   */
  private async resolveCurrentNodes(pids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    const unique = [...new Set(pids)]
    if (unique.length === 0) return map
    const [rows] = await this.pool.promise().query<RowDataPacket[]>(
      `SELECT t.instance_id, t.node_id, i.process_def_id FROM wfe_task t
        JOIN wfe_process_instance i ON i.id = t.instance_id
       WHERE t.instance_id IN (${unique.map(() => '?').join(', ')})
         AND t.status IN ('CREATED','CLAIMED')`,
      unique,
    )
    if (rows.length === 0) return map
    const modelCache = new Map<string, Record<string, { name?: string | null }>>()
    for (const row of rows) {
      const defId = String(row.process_def_id)
      if (!modelCache.has(defId)) {
        const [defs] = await this.pool
          .promise()
          .query<RowDataPacket[]>('SELECT model_json FROM wfe_process_def WHERE id = ?', [defId])
        const model = defs[0]?.model_json === undefined ? null : JSON.parse(String(defs[0].model_json))
        modelCache.set(defId, (model?.nodes ?? {}) as Record<string, { name?: string | null }>)
      }
      const model = modelCache.get(defId) ?? {}
      const name = model[String(row.node_id)]?.name
      if (name === null || name === undefined || String(name).trim() === '') continue
      const pid = String(row.instance_id)
      const existing = map.get(pid)
      map.set(pid, existing === undefined ? String(name) : `${existing}、${String(name)}`)
    }
    return map
  }

  /** 发起人姓名批量解析（昵称优先、用户名兜底），对齐 Java。 */
  private async resolveUserNames(rows: RowDataPacket[]): Promise<Map<number, string>> {
    const map = new Map<number, string>()
    const ids = [
      ...new Set(
        rows.map((r: RowDataPacket) => parseUserId(r.initiator)).filter((v): v is number => v !== null),
      ),
    ]
    if (ids.length === 0) return map
    const [users] = await this.pool.promise().query<RowDataPacket[]>(
      `SELECT id, username, nickname FROM sys_user WHERE id IN (${ids.map(() => '?').join(', ')})`,
      ids,
    )
    for (const user of users) {
      const nickname = user.nickname === null || String(user.nickname).trim() === '' ? null : String(user.nickname)
      map.set(Number(user.id), nickname ?? String(user.username))
    }
    return map
  }

  // ==================== 白名单与 schema ====================

  /** 最新 PUBLISHED 表单定义；不存在 → 404。 */
  private async latestPublished(formKey: string): Promise<{
    key: string
    type: string
    schema: string | null
    column_config: string | null
  }> {
    const row = await this.formDefRepository.findLatestPublishedByKey(formKey, getTenantId())
    if (row === null) {
      throw new BusinessException(404, `表单不存在或未发布: ${formKey}`)
    }
    return row
  }

  /** 最新 schema 的业务列（有序 key→列，非法键名过滤；重复键取首次出现）。 */
  private async businessColumns(latest: {
    type: string
    schema: string | null
    column_config: string | null
  }): Promise<Map<string, ColumnConfig>> {
    const columns =
      latest.type === 'WORKFLOW' ? extractFromSchema(latest.schema) : extract(latest.column_config)
    const map = new Map<string, ColumnConfig>()
    for (const column of columns) {
      const key = column.key === null || column.key === undefined ? '' : String(column.key)
      if (key.trim() === '' || !COL_PATTERN.test(key)) continue
      if (!map.has(key)) map.set(key, column)
    }
    return map
  }

  /** 该 key 下全部版本定义 id（版本倒序）。 */
  private async versionIds(formKey: string): Promise<string[]> {
    const rows = await this.formDefRepository.findAllVersionsByKey(formKey, getTenantId())
    return rows.map((row) => row.id)
  }

  /** 解析 sort/order 生成 ORDER BY（缺省按发起时间倒序）。 */
  private buildOrderBy(req: BizDataQueryRequest, bizCols: Map<string, ColumnConfig>): string {
    const sort = req.sort
    if (sort === null || sort === undefined || sort.trim() === '') {
      return ' ORDER BY COALESCE(h.start_time, f.created_at) DESC'
    }
    const dir = String(req.order).toLowerCase() === 'asc' ? 'ASC' : 'DESC'
    if (START_TIME_KEY === sort) return ` ORDER BY h.start_time ${dir}`
    if (DERIVED_SYSTEM_KEYS.has(sort)) {
      throw new BusinessException(400, `排序字段不可排序: ${sort}`)
    }
    const col = bizCols.get(sort)
    if (col === undefined || !COL_PATTERN.test(sort)) {
      throw new BusinessException(400, `排序字段不在表单字段中: ${sort}`)
    }
    const type = col.columnType === null || col.columnType === undefined ? 'VARCHAR' : String(col.columnType).toUpperCase()
    if (type.includes('INT') || type.includes('DECIMAL')) {
      // 数值列先 CAST 再排，避免 JSON 字符串字典序（10 < 2）
      const cast = type.includes('DECIMAL')
        ? `DECIMAL(20,${col.scale === null || col.scale === undefined ? 2 : col.scale})`
        : 'SIGNED'
      return ` ORDER BY CAST(JSON_UNQUOTE(JSON_EXTRACT(f.data_json, '$.${sort}')) AS ${cast}) ${dir}`
    }
    return ` ORDER BY JSON_UNQUOTE(JSON_EXTRACT(f.data_json, '$.${sort}')) ${dir}`
  }

  /** filter 的键必须命中最新 schema 白名单，否则 400。 */
  private async parseFilters(
    filterJson: string | null,
    latest: { type: string; schema: string | null; column_config: string | null },
    bizCols: Map<string, ColumnConfig>,
  ): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {}
    if (filterJson === null || filterJson.trim() === '') return out
    let parsed: unknown
    try {
      parsed = JSON.parse(filterJson)
    } catch {
      throw new BusinessException(400, '筛选条件不是合法 JSON')
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new BusinessException(400, '筛选条件不是合法 JSON')
    }
    void latest
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!COL_PATTERN.test(key) || !bizCols.has(key)) {
        throw new BusinessException(400, `筛选项不在表单字段中: ${key}`)
      }
      out[key] = value
    }
    return out
  }

  /** 关键词非空时必须给出白名单内的匹配列。 */
  private resolveKeywordColumn(
    req: BizDataQueryRequest,
    bizCols: Map<string, ColumnConfig>,
  ): string | null {
    if (req.keyword === null || req.keyword === undefined || String(req.keyword).trim() === '') {
      return null
    }
    const column = req.keywordColumn
    if (column === null || column === undefined || !COL_PATTERN.test(column) || !bizCols.has(column)) {
      throw new BusinessException(400, `关键词列不在表单字段中: ${String(req.keywordColumn)}`)
    }
    return column
  }
}

/** `data_json` 解析（失败 → 空对象，对齐 Java 的容错）。 */
function parseDataJson(json: unknown): Record<string, unknown> {
  if (json === null || json === undefined) return {}
  try {
    const parsed: unknown = JSON.parse(String(json))
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return {}
  } catch {
    return {}
  }
}

/** 用户 id 解析（非数字 → null，对齐 Java `parseUserId`）。 */
function parseUserId(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const parsed = Number(String(value))
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}
