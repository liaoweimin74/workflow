import { randomBytes } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { sql } from 'kysely'
import { bizDataPageVO, bizDataVO, type BizDataPageVO, type BizDataVO } from '../../../common/domain/biz-data'
import type { ColumnConfig } from '../../../common/domain/column-config'
import { BusinessException } from '../../../common/exception/business-exception'
import { getTenantId } from '../../../framework/tenant/tenant-context'
import { FormDefinitionRepository } from '../repository/form-definition.repository'
import {
  COLUMN_NAME_PATTERN,
  parseBusinessColumnConfig,
} from '../column/column-config-parser'
import { buildBizDataContext, type BizDataContext, type SubTableDef } from './biz-data-context'
import { BizDataRepository, type BizRow } from './biz-data.repository'
import {
  buildDelete,
  buildInsert,
  buildUpdate,
} from './biz-data-query-builder'
import {
  buildCount,
  buildSelect,
  columnTypeMapOf,
} from './biz-data-query-builder'
import {
  buildCount as buildJoinCount,
  buildSelect as buildJoinSelect,
  type JoinConfig,
  type QueryColumn,
} from './join-sql-generator'
import { isConfigMode, type FormQueryConfig } from './form-query-config'
import { SqlQueryEngine } from './sql-query-engine'
import { wrap, type WrappedQuery } from './sql-template-engine'

/** 业务数据查询请求（对齐 Java `BizDataQueryRequest` 的默认值）。 */
export interface BizDataQueryRequest {
  filter: string | null
  keyword: string | null
  keywordColumn: string | null
  sort: string | null
  order: string | null
  params: string | null
  page: number
  size: number
}

/** `GET /biz-data/referenced-count` 的元素：目标表单 → 引用统计。 */
export interface ReferencedByEntry {
  count: number
  referencedBy: string[]
}

/** 表单 key 合法模式（对齐 Java `FORM_KEY_PATTERN`）。 */
const FORM_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/

/** `countReferencedBy` 的分页步长（对齐 Java 的 `size = 100`）。 */
const REF_SCAN_PAGE_SIZE = 100

/**
 * 业务数据通用实现（对齐 Java `BizDataSupport` 的**读路径**）。
 *
 * 本类覆盖：`loadContext` / `queryGeneric` / `queryJoinConfig` / `querySqlTemplate` /
 * `findById` / `resolveByFormKey` / `resolveDisplayTexts` / `countReferencedBy` /
 * 写路径（createGeneric / updateGeneric / deleteGeneric）与子表读写。
 */
@Injectable()
export class BizDataSupport {
  constructor(
    private readonly repository: BizDataRepository,
    private readonly formDefRepository: FormDefinitionRepository,
    private readonly sqlQueryEngine: SqlQueryEngine,
  ) {}

  // ==================== 上下文 ====================

  /**
   * 加载表单运行时上下文（表名 + 列 + 子表元数据）。
   *
   * 对齐 Java `loadContext` 的三步：校验 key → 校验物理表存在 → 取已发布列的映射。
   */
  async loadContext(formKey: string): Promise<BizDataContext> {
    if (formKey === null || !FORM_KEY_PATTERN.test(formKey)) {
      throw new BusinessException(400, `非法表单 key: ${String(formKey)}`)
    }
    const tableName = `wf_biz_${formKey}`
    if (!(await this.repository.tableExists(tableName))) {
      throw new BusinessException(404, `业务表单数据表不存在: ${formKey}`)
    }
    return buildBizDataContext(formKey, await this.loadColumns(formKey))
  }

  /**
   * 取已发布业务表单的列映射（对齐 Java `getBusinessColumnsByKey`）。
   *
   * 错误消息逐字对齐：未发布 → 404；非 BUSINESS → 400。
   */
  async loadColumns(formKey: string): Promise<ColumnConfig[]> {
    const published = await this.formDefRepository.findLatestPublishedByKey(formKey, getTenantId())
    if (published === null) {
      throw new BusinessException(404, `业务表单不存在或未发布: ${formKey}`)
    }
    if (published.type !== 'BUSINESS') {
      throw new BusinessException(400, `表单 ${formKey} 不是业务表单`)
    }
    return parseBusinessColumnConfig(published.column_config)
  }

  // ==================== 查询 ====================

  /** 通用分页查询（对齐 Java `queryGeneric`）。 */
  async queryGeneric(formKey: string, req: BizDataQueryRequest): Promise<BizDataPageVO> {
    const tenantId = getTenantId()
    const ctx = await this.loadContext(formKey)
    const filters = parseFilter(req.filter)
    const columnTypeOf = columnTypeMapOf(ctx.columns)

    const page = Math.max(req.page, 1)
    // size <= 0 表示不分页取全部；正数沿用原钳制上限 100
    const size = req.size <= 0 ? req.size : Math.min(Math.max(req.size, 1), 100)

    try {
      const count = buildCount(
        ctx.tableName,
        ctx.columnKeys,
        columnTypeOf,
        tenantId,
        filters,
        req.keyword,
        req.keywordColumn,
      )
      const select = buildSelect(
        ctx.tableName,
        ctx.columnKeys,
        columnTypeOf,
        tenantId,
        filters,
        req.keyword,
        req.keywordColumn,
        req.sort,
        req.order,
        page - 1,
        size,
      )
      const total = await this.repository.selectCount(count)
      const rows = await this.repository.selectRows(select)
      const records = await this.toVOs(ctx, rows)
      return bizDataPageVO(records, total, page, size)
    } catch (error) {
      throw asBusinessException(error)
    }
  }

  /**
   * config 模式分页查询实现（声明式 JOIN，含虚拟列）。
   *
   * 对齐 Java `queryJoinConfig`。两点必须照抄：
   *   1. `size` 的钳制方向 —— `page` 至少 1；`size <= 0` **原样**传（不分页取全部），
   *      正数才钳到 `[1, 100]`。
   *   2. 生成器抛的 `IllegalArgumentException` 在这一层转成 **400**（`asBusinessException`），
   *      否则白名单拒绝会变成 HTTP 500。
   */
  async queryJoinConfig(
    formKey: string,
    req: BizDataQueryRequest,
    joins: JoinConfig[],
  ): Promise<BizDataPageVO> {
    const tenantId = getTenantId()
    const ctx = await this.loadContext(formKey)

    const columns = await this.buildJoinColumns(ctx, joins)
    const filters = parseFilter(req.filter)
    const page = Math.max(req.page, 1)
    // size <= 0 表示不分页取全部（buildSelect 跳过 LIMIT/OFFSET）；正数沿用原钳制上限
    const size = req.size <= 0 ? req.size : Math.min(Math.max(req.size, 1), 100)

    try {
      const count = buildJoinCount(
        ctx.tableName,
        tenantId,
        joins,
        columns,
        filters,
        req.keyword,
        req.keywordColumn,
      )
      const select = buildJoinSelect(
        ctx.tableName,
        tenantId,
        joins,
        columns,
        filters,
        req.keyword,
        req.keywordColumn,
        req.sort,
        req.order,
        page - 1,
        size,
      )
      return await this.sqlQueryEngine.execPage(page, size, count, select, (row) =>
        this.toJoinVO(ctx, joins, row),
      )
    } catch (error) {
      throw asBusinessException(error)
    }
  }

  /**
   * sql 模式分页查询实现（管理员 SQL 模板包裹，运行时参数白名单透传）。
   *
   * 仅校验 `formKey` 合法性（有值时），**不校验主表单物理表** ——
   * 管理员 SQL 独立定义，可跨表/聚合（对齐 Java `querySqlTemplate`）。
   */
  async querySqlTemplate(
    formKey: string | null,
    req: BizDataQueryRequest,
    config: FormQueryConfig,
  ): Promise<BizDataPageVO> {
    if (formKey !== null && !FORM_KEY_PATTERN.test(formKey)) {
      throw new BusinessException(400, `非法表单 key: ${String(formKey)}`)
    }
    if (!isConfigMode(config) && config.query === null) {
      // 调用方应先判 isSqlMode/isVisualMode；走到这里说明配置不成立
      throw new BusinessException(400, 'SQL 数据源缺少查询配置')
    }
    const tenantId = getTenantId()
    const columns = toQueryColumns(config.columns)
    const filters = parseFilter(req.filter)
    const runtimeParams = parseRuntimeParams(req.params)
    const page = Math.max(req.page, 1)
    const size = req.size <= 0 ? req.size : Math.min(Math.max(req.size, 1), 100)

    try {
      const wrapped: WrappedQuery = wrap(
        config.query as string,
        tenantId,
        columns,
        filters,
        req.keyword,
        req.keywordColumn,
        req.sort,
        req.order,
        page,
        size,
        config.declaredParams,
        runtimeParams,
      )
      return await this.sqlQueryEngine.execPage(
        page,
        size,
        wrapped.count,
        wrapped.select,
        (row) => this.toSqlVO(config.columns, row),
      )
    } catch (error) {
      throw asBusinessException(error)
    }
  }

  /**
   * 构建查询列映射：主表列（`ref = "m." + key`，默认全可排可筛）+ 虚拟列
   * （`ref = alias + "." + joinField`，能力取 join 声明）。
   */
  private async buildJoinColumns(
    ctx: BizDataContext,
    joins: JoinConfig[],
  ): Promise<QueryColumn[]> {
    const typeOf = new Map<string, string>()
    for (const column of ctx.columns) {
      typeOf.set(String(column.key), column.columnType === null ? '' : column.columnType.toUpperCase())
    }
    const columns: QueryColumn[] = []
    for (const key of ctx.columnKeys) {
      columns.push({
        key,
        ref: `m.${key}`,
        columnType: typeOf.get(key) ?? '',
        sortable: true,
        filterable: true,
      })
    }
    for (const join of joins) {
      columns.push({
        key: String(join.virtualKey),
        ref: `${String(join.alias)}.${String(join.joinField)}`,
        columnType: await this.resolveJoinColumnType(join),
        sortable: join.sortable,
        filterable: join.filterable,
      })
    }
    return columns
  }

  /**
   * 虚拟列类型：目标表单 `joinField` 的列类型，找不到 fallback `"VARCHAR"`
   * （查询与 metadata 两处必须一致）。
   */
  private async resolveJoinColumnType(join: JoinConfig): Promise<string> {
    try {
      const targetColumns = await this.loadColumns(String(join.targetFormKey))
      for (const column of targetColumns) {
        if (join.joinField === column.key) {
          return column.columnType === null ? 'VARCHAR' : column.columnType.toUpperCase()
        }
      }
    } catch (error) {
      // 目标表单不可解析时 fallback 类型（对齐 Java 的 `catch (BusinessException ignored)`）
      if (!(error instanceof BusinessException)) throw error
    }
    return 'VARCHAR'
  }

  /** 查询单条业务数据；不存在抛 404（对齐 Java `findById`）。 */
  async findById(ctx: BizDataContext, tenantId: string, id: string): Promise<BizDataVO> {
    const rows = await this.repository.selectRows(
      sql`SELECT * FROM ${sql.table(ctx.tableName)} WHERE id = ${id} AND tenant_id = ${tenantId}`,
    )
    if (rows.length === 0) {
      throw new BusinessException(404, `业务数据不存在: ${id}`)
    }
    return this.toVO(ctx, rows[0])
  }

  // ==================== 显示文本解析 ====================

  /** 按表单 key 批量解析显示文本（对齐 Java `resolveByFormKey`）。 */
  async resolveByFormKey(
    formKey: string,
    ids: string[],
    displayField: string | null,
  ): Promise<Record<string, string>> {
    const ctx = await this.loadContext(formKey)
    let field = displayField
    if (field === null || field.trim() === '') {
      const first = ctx.columns.find(
        (column) => !column.hidden && column.pickerConfig === null,
      )
      if (first === undefined) {
        throw new BusinessException(400, '目标表单无可解析的显示字段')
      }
      field = String(first.key)
    }
    return this.resolveDisplayTexts(formKey, ids, field)
  }

  /** 批量解析被引用记录的显示文本（`id → displayField 值`）。 */
  async resolveDisplayTexts(
    sourceFormKey: string,
    ids: string[],
    displayField: string,
  ): Promise<Record<string, string>> {
    if (sourceFormKey === null || !FORM_KEY_PATTERN.test(sourceFormKey)) {
      throw new BusinessException(400, `非法目标表单 key: ${String(sourceFormKey)}`)
    }
    if (ids.length === 0) return {}
    if (!COLUMN_NAME_PATTERN.test(displayField)) {
      throw new BusinessException(400, `非法显示字段: ${String(displayField)}`)
    }

    const result = await this.repository.selectRows(
      sql`SELECT id, ${sql.ref(displayField)} FROM ${sql.table(`wf_biz_${sourceFormKey}`)}
          WHERE tenant_id = ${getTenantId()} AND id IN (${sql.join(
            ids.map((id) => sql`${id}`),
            sql`, `,
          )})`,
    )

    const out: Record<string, string> = {}
    for (const row of result) {
      const value = row[displayField]
      out[String(row.id)] = value === null || value === undefined ? '' : String(value)
    }
    return out
  }

  // ==================== 引用统计 ====================

  /**
   * 统计各业务表单被 dataPicker 引用的情况（对齐 Java `countReferencedBy`）。
   *
   * 只返回**被引用过**的目标表单；遍历全部 BUSINESS 表单的 `column_config`。
   */
  async countReferencedBy(): Promise<Record<string, ReferencedByEntry>> {
    const tenantId = getTenantId()
    const result: Record<string, ReferencedByEntry> = {}
    let page = 1
    for (;;) {
      const { rows } = await this.formDefRepository.findPage(
        tenantId,
        { status: null, name: null, type: 'BUSINESS' },
        (page - 1) * REF_SCAN_PAGE_SIZE,
        REF_SCAN_PAGE_SIZE,
      )
      for (const row of rows) collectPickerRefs(row.column_config, row.key, result)
      if (rows.length === 0 || rows.length < REF_SCAN_PAGE_SIZE) break
      page += 1
    }
    return result
  }

  // ==================== 行映射 ====================

  /**
   * 行 → `BizDataVO`（对齐 Java `toVO`）。
   *
   * 两条容易做错的规则：
   *   1. **值为 null 的列不进 `data`** —— 不是输出 null，而是整键缺失。
   *   2. `columnType == 'JSON'` 的列要**反序列化成对象/数组**再输出，
   *      而库里的原始值在 typeCast 之后是字符串。
   */
  private async toVO(ctx: BizDataContext, row: BizRow): Promise<BizDataVO> {
    const data: Record<string, unknown> = {}
    for (const column of ctx.columns) {
      const key = String(column.key)
      const value = row[key]
      if (value === null || value === undefined) continue
      data[key] = column.columnType === 'JSON' ? deserializeJsonValue(value) : value
    }

    // embedded 模式：附加子表行（按 sort_no 升序）
    for (const [field, def] of ctx.subTables) {
      if (def.subMode === 'embedded') {
        data[field] = await this.readSubRows(def, String(row.id))
      }
    }

    return bizDataVO(
      String(row.id),
      data,
      asInt(row.version),
      asDateTime(row.created_at),
      asDateTime(row.updated_at),
    )
  }

  private async toVOs(ctx: BizDataContext, rows: BizRow[]): Promise<BizDataVO[]> {
    const out: BizDataVO[] = []
    for (const row of rows) out.push(await this.toVO(ctx, row))
    return out
  }

  /** config 模式行映射：主表列（`toVO` 逻辑）+ 虚拟列（virtualKey → joinField 值）。 */
  private async toJoinVO(
    ctx: BizDataContext,
    joins: JoinConfig[],
    row: Record<string, unknown>,
  ): Promise<BizDataVO> {
    const vo = await this.toVO(ctx, row)
    for (const join of joins) {
      const value = row[String(join.virtualKey)]
      // ⚠️ 值为 null 的虚拟列**整键缺失**（与 toVO 的同一条规则）
      if (value !== null && value !== undefined) {
        vo.data[String(join.virtualKey)] = value
      }
    }
    return vo
  }

  /**
   * sql 模式行映射：外层子查询输出列全量保留（可含聚合列），绕过 `toVO` 的仅主表列逻辑。
   *
   * 输出列名与声明列的 key 做**大小写不敏感**对齐：匹配某声明列 key（忽略大小写）时
   * 输出声明列的**精确 key**（前端按配置的驼峰 key 取值）；未匹配列统一转小写。
   * `version`/`created_at`/`updated_at`/`tenant_id` 从 `data` 里剔除，
   * 但 `version`/时间戳仍从**原始行**取值填进 `BizDataVO` 的同名字段；`id` 保留在 `data` 里。
   */
  private toSqlVO(declared: ColumnConfig[], row: Record<string, unknown>): BizDataVO {
    const keyNormalizer = new Map<string, string>()
    for (const column of declared) {
      const key = column.key
      if (key !== null && key.trim() !== '') {
        // putIfAbsent：声明列存在仅大小写不同的重名时，保留先出现的精确 key
        const lower = key.toLowerCase()
        if (!keyNormalizer.has(lower)) keyNormalizer.set(lower, key)
      }
    }
    const data: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(row)) {
      const lower = key.toLowerCase()
      data[keyNormalizer.get(lower) ?? lower] = value
    }
    for (const key of ['version', 'created_at', 'updated_at', 'tenant_id']) {
      delete data[key]
    }
    return bizDataVO(
      String(row.id),
      data,
      asInt(row.version),
      asDateTime(row.created_at),
      asDateTime(row.updated_at),
    )
  }

  /** 读子表行（对齐 Java `readSubRows`；表内以 `sort_no` 升序）。 */
  private async readSubRows(def: SubTableDef, bizId: string): Promise<BizRow[]> {
    if (!(await this.repository.tableExists(def.tableName))) return []
    return this.repository.selectRows(
      sql`SELECT * FROM ${sql.table(def.tableName)}
          WHERE tenant_id = ${getTenantId()} AND biz_id = ${bizId}
          ORDER BY sort_no`,
    )
  }

  /**
   * 读独立子表行（`/biz-data/{formKey}/{id}/sub/{field}` 的返回）。
   *
   * 与私有的 `readSubRows` 是同一个查询 —— 区别只在**调用方**：
   * 一个供行映射内联 embedded 子表，一个供子表端点直接返回。
   * 对齐 Java `BizDataSupport.listSubRows` 复用 `readSubRows` 的写法。
   */
  async readSubTableRows(def: SubTableDef, bizId: string): Promise<BizRow[]> {
    return this.readSubRows(def, bizId)
  }

  // ==================== 写路径（对齐 Java createGeneric / updateGeneric / deleteGeneric） ====================

  /**
   * 必填校验（`validateRequired`）。
   *
   * ⚠️ 只有 `null` 与**空白字符串**算「空」—— 数字 `0`、布尔 `false`、空数组都算有值。
   *    消息里用的是列的 `label`（不是 key）。
   */
  validateRequired(columns: ColumnConfig[], data: Record<string, unknown> | null): void {
    const safe = data ?? {}
    for (const column of columns) {
      if (!column.required) continue
      const value = safe[String(column.key)]
      if (value === null || value === undefined) {
        throw new BusinessException(400, `必填字段不能为空: ${String(column.label)}`)
      }
      if (typeof value === 'string' && value.trim() === '') {
        throw new BusinessException(400, `必填字段不能为空: ${String(column.label)}`)
      }
    }
  }

  /**
   * 非字符串值序列化为 JSON 字符串（`serializeJsonColumns`）。
   *
   * ⚠️ `null` 与字符串**原样保留**（字符串是"旧格式容错"），数组/对象才序列化。
   */
  private serializeJsonColumns(data: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...data }
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined || typeof value === 'string') continue
      out[key] = JSON.stringify(value)
    }
    return out
  }

  /**
   * 通用新增（`createGeneric`）。
   *
   * 顺序照抄 Java：必填校验 → 序列化 → 取 picker 冗余文本 → INSERT → 主表行回读 →
   * **子表行批量写入**（`data` 里出现的子表字段为数组时）。
   */
  async createGeneric(formKey: string, data: Record<string, unknown> | null): Promise<BizDataVO> {
    const tenantId = getTenantId()
    const ctx = await this.loadContext(formKey)
    const body = data ?? {}

    this.validateRequired(ctx.columns, body)

    const merged = this.serializeJsonColumns(body)
    Object.assign(merged, await this.resolvePickerValues(ctx, merged))

    const insert = buildInsert(ctx.tableName, ctx.columnKeys, merged, tenantId)
    await this.repository.executeWrite(insert.query)

    for (const [field, def] of ctx.subTables) {
      const raw = body[field]
      if (Array.isArray(raw)) {
        await this.writeSubRows(def, insert.id, raw)
      }
    }
    return this.findById(ctx, tenantId, insert.id)
  }

  /**
   * 通用更新（`updateGeneric`，乐观锁）。
   *
   * ⚠️ 受影响 0 行时要**再查一次**区分两种情况：记录不存在 → 业务 **404**；
   *    记录在但版本不符 → 业务 **409**。只报一种会让前端无法区分"重试"与"刷新"。
   */
  async updateGeneric(
    formKey: string,
    id: string,
    data: Record<string, unknown> | null,
    version: number | null,
  ): Promise<BizDataVO> {
    const tenantId = getTenantId()
    const ctx = await this.loadContext(formKey)
    const body = data ?? {}

    this.validateRequired(ctx.columns, body)
    const currentVersion = version ?? 1

    const merged = this.serializeJsonColumns(body)
    Object.assign(merged, await this.resolvePickerValues(ctx, merged))

    const query = buildUpdate(ctx.tableName, ctx.columnKeys, merged, tenantId, id, currentVersion)
    const affected = await this.repository.executeWrite(query)

    if (affected === 0) {
      const exists = await this.repository.rowExists(ctx.tableName, tenantId, id)
      if (!exists) throw new BusinessException(404, `业务数据不存在: ${id}`)
      throw new BusinessException(409, '数据已被他人修改，请刷新后重试')
    }

    // 子表行增量 diff（**仅当请求携带了该子表字段**时）
    for (const [field, def] of ctx.subTables) {
      const raw = body[field]
      if (Array.isArray(raw)) {
        await this.diffSubRows(def, id, raw)
      }
    }
    return this.findById(ctx, tenantId, id)
  }

  /**
   * 通用删除（`deleteGeneric`）。
   *
   * ⚠️ 先**级联删除全部子表行**，再删主表行；主表受影响 0 行 → 业务 404。
   *    注意与 `createGeneric`/`updateGeneric` 不同：这里不校验必填、也不回读。
   */
  async deleteGeneric(formKey: string, id: string): Promise<void> {
    const tenantId = getTenantId()
    const ctx = await this.loadContext(formKey)

    for (const def of ctx.subTables.values()) {
      await this.repository.deleteSubRows(def.tableName, tenantId, id)
    }
    const affected = await this.repository.executeWrite(buildDelete(ctx.tableName, tenantId, id))
    if (affected === 0) throw new BusinessException(404, `业务数据不存在: ${id}`)
  }

  // ==================== 独立子表行 CRUD ====================

  /** 新增独立子表行（`addSubRow`：追加到末尾，`sort_no` 续接，超 100 行拒绝）。 */
  async addSubRow(
    formKey: string,
    id: string,
    field: string,
    data: Record<string, unknown> | null,
  ): Promise<Record<string, unknown>> {
    const ctx = await this.loadContext(formKey)
    const def = await this.requireSubTable(ctx, field)
    await this.requireMainRow(ctx, id)
    const rows = await this.readSubRows(def, id)
    if (rows.length >= MAX_SUB_ROWS) {
      throw new BusinessException(400, `子表行数超限（最多 ${MAX_SUB_ROWS} 行）: ${def.tableName}`)
    }
    return this.insertOneSubRow(def, id, toRowMap(data ?? {}, def.tableName), rows.length)
  }

  /**
   * 更新独立子表行（`updateSubRow`，乐观锁）。
   *
   * ⚠️ 三点照抄 Java：
   *    ① 只允许更新**子业务列**（`subKeys` 白名单过滤，防止篡改内部列）；
   *    ② 过滤后为空 → 业务 400「更新内容不能为空: <field>」；
   *    ③ 受影响 0 行统一报 **409**（不区分"不存在"与"版本冲突"）。
   */
  async updateSubRow(
    formKey: string,
    id: string,
    field: string,
    rowId: string,
    data: Record<string, unknown> | null,
    version: number | null,
  ): Promise<Record<string, unknown>> {
    const ctx = await this.loadContext(formKey)
    const def = await this.requireSubTable(ctx, field)
    await this.requireMainRow(ctx, id)

    const safe: Record<string, unknown> = {}
    for (const key of def.subKeys) {
      if (data !== null && key in data) safe[key] = data[key]
    }
    if (Object.keys(safe).length === 0) {
      throw new BusinessException(400, `更新内容不能为空: ${field}`)
    }

    const affected = await this.repository.updateSubRow(
      def.tableName,
      safe,
      getTenantId(),
      id,
      rowId,
      version ?? 1,
    )
    if (affected === 0) {
      throw new BusinessException(409, '子表行已被他人修改或不存在，请刷新后重试')
    }
    const rows = await this.readSubRows(def, id)
    const row = rows.find((r) => rowId === String(r.id))
    if (row === undefined) throw new BusinessException(404, `子表行不存在: ${rowId}`)
    return row
  }

  /** 删除独立子表行（`deleteSubRow`：**不校验受影响行数**，删不存在的行也返回成功）。 */
  async deleteSubRow(formKey: string, id: string, field: string, rowId: string): Promise<void> {
    const ctx = await this.loadContext(formKey)
    const def = await this.requireSubTable(ctx, field)
    await this.requireMainRow(ctx, id)
    await this.repository.deleteSubRow(def.tableName, getTenantId(), id, rowId)
  }

  // ==================== 写路径的内部工具 ====================

  /** 取子表定义；字段不存在 → 业务 404。 */
  private async requireSubTable(
    ctx: BizDataContext,
    field: string,
  ): Promise<SubTableDef> {
    const def = ctx.subTables.get(field)
    if (def === undefined) throw new BusinessException(404, `子表字段不存在: ${field}`)
    return def
  }

  /** 校验主表行存在（不存在时 `findById` 会抛 404）。 */
  private async requireMainRow(ctx: BizDataContext, id: string): Promise<void> {
    await this.findById(ctx, getTenantId(), id)
  }

  /** 批量写入子表行（create 场景；`sort_no` 从 0 递增）。 */
  private async writeSubRows(
    def: SubTableDef,
    bizId: string,
    rows: unknown[],
  ): Promise<void> {
    if (rows.length > MAX_SUB_ROWS) {
      throw new BusinessException(400, `子表行数超限（最多 ${MAX_SUB_ROWS} 行）: ${def.tableName}`)
    }
    let sortNo = 0
    for (const row of rows) {
      await this.insertOneSubRow(def, bizId, toRowMap(row, def.tableName), sortNo)
      sortNo++
    }
  }

  /**
   * 子表行增量 diff（update 场景）。
   *
   * 对齐 Java `diffSubRows` 的三段式：
   *   ① 入参里带 `id` 且该行已存在 → 子列或 `sort_no` 有变化才 UPDATE；
   *   ② 其余（新行、或 id 不存在的行）→ **剥掉客户端传的 id** 走内部生成插入；
   *   ③ 现有行里没出现在入参中的 → 批量 DELETE。
   */
  private async diffSubRows(
    def: SubTableDef,
    bizId: string,
    rows: unknown[],
  ): Promise<void> {
    if (rows.length > MAX_SUB_ROWS) {
      throw new BusinessException(400, `子表行数超限（最多 ${MAX_SUB_ROWS} 行）: ${def.tableName}`)
    }
    const existing = await this.readSubRows(def, bizId)
    const existingById = new Map<string, BizRow>()
    for (const row of existing) existingById.set(String(row.id), row)

    const keepIds = new Set<string>()
    let sortNo = 0
    for (const raw of rows) {
      const row = toRowMap(raw, def.tableName)
      const rowId = row.id === null || row.id === undefined ? null : String(row.id)
      if (rowId !== null && existingById.has(rowId)) {
        const current = existingById.get(rowId) ?? {}
        const changed =
          def.subKeys.some((key) => !sameValue(current[key], row[key])) ||
          !sameValue(current.sort_no, sortNo)
        if (changed) {
          await this.repository.updateSubRowFull(def.tableName, def.subKeys, row, sortNo, getTenantId(), bizId, rowId)
        }
        keepIds.add(rowId)
      } else {
        const newRow = { ...row }
        delete newRow.id
        await this.insertOneSubRow(def, bizId, newRow, sortNo)
      }
      sortNo++
    }

    if (existingById.size > keepIds.size) {
      const toDelete = [...existingById.keys()].filter((id) => !keepIds.has(id))
      await this.repository.deleteSubRowIds(def.tableName, getTenantId(), bizId, toDelete)
    }
  }


  /** 插入单行子表数据（`id/biz_id/tenant_id/sort_no/version` + 子业务列）。 */
  private async insertOneSubRow(
    def: SubTableDef,
    bizId: string,
    row: Record<string, unknown>,
    sortNo: number,
  ): Promise<Record<string, unknown>> {
    const rowId = randomBytes(16).toString('hex')
    await this.repository.insertSubRow(def.tableName, def.subKeys, rowId, bizId, getTenantId(), sortNo, row)
    return { ...row, id: rowId, sort_no: sortNo }
  }

  /**
   * 遍历 data-picker 引用列：校验 id 存在并生成 `<key>_text` 展示缓存文本。
   *
   * ⚠️ 不改原 `data`，返回**附加字段**（`<key>_text` → 文本）；引用值为空时返回空文本。
   * ⚠️ 哪些列算 data-picker 见 `isDataPickerColumn`：`pickerType=lookupPicker` 明确排除，
   *    `pickerType=dataPicker` 明确包含；**没有 pickerType 的旧配置**则看该列有没有
   *    `<key>_text` 冗余列（有才算）。
   */
  private async resolvePickerValues(
    ctx: BizDataContext,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const extra: Record<string, unknown> = {}
    for (const column of ctx.columns) {
      const pickerConfig = column.pickerConfig
      if (pickerConfig === null || pickerConfig.trim() === '') continue
      if (!isDataPickerColumn(ctx, column)) continue
      const key = String(column.key)
      /**
       * ⚠️ 这个 `await` 不能省：Java 的 `resolvePickerText` 是同步方法，
       *    Node 版是 async（要批量查显示文本）。漏掉它不会报错 ——
       *    存进去的是一个 **pending Promise**，落库时被序列化成 `{}`，
       *    于是列表里的「显示列」永远是空对象。契约回归抓不到：
       *    两张契约表单里带 pickerConfig 的列都是 `lookupPicker`，整列被跳过。
       *    由 `test/unit/engine/biz-data-write.spec.ts` 钉住。
       */
      extra[`${key}_text`] = await this.resolvePickerText(column, data[key])
    }
    return extra
  }

  /**
   * 解析单个 data-picker 列的 `<key>_text` 值。
   *
   * 值以 **JSON 数组字符串**存储（单选也是 `["u1"]`）；输出同样是与 id 顺序一致的
   * JSON 数组字符串。三种业务 400：引用值不是 JSON 数组、`maxCount` 超限、
   * 引用的数据不存在。
   */
  private async resolvePickerText(column: ColumnConfig, raw: unknown): Promise<string> {
    const key = String(column.key)
    let picker: Record<string, unknown>
    try {
      picker = JSON.parse(String(column.pickerConfig)) as Record<string, unknown>
    } catch {
      // 对齐 Java 的 catch (JsonProcessingException)：配置坏掉时**整段视为非 data-picker**
      return ''
    }
    const sourceFormKey = picker.sourceFormKey === null || picker.sourceFormKey === undefined
      ? null
      : String(picker.sourceFormKey)
    const displayField = picker.displayField === null || picker.displayField === undefined
      ? null
      : String(picker.displayField)
    const maxCountRaw = picker.maxCount

    if (raw === null || raw === undefined || String(raw).trim() === '') return ''

    let ids: string[]
    try {
      const parsed: unknown = JSON.parse(String(raw))
      if (!Array.isArray(parsed)) throw new Error('not an array')
      ids = parsed.map((v) => String(v))
    } catch {
      throw new BusinessException(400, `data-picker 引用值格式非法（需 JSON 数组）: ${key}`)
    }
    ids = ids.filter((id) => id.trim() !== '')
    if (ids.length === 0) return ''

    if (maxCountRaw !== null && maxCountRaw !== undefined) {
      const maxCount = Number(maxCountRaw)
      if (!Number.isFinite(maxCount)) {
        throw new BusinessException(400, `data-picker maxCount 配置非法: ${key}`)
      }
      if (maxCount > 0 && ids.length > maxCount) {
        throw new BusinessException(400, `data-picker 引用数量超出限制（最多 ${maxCount}）: ${key}`)
      }
    }

    // 复用读路径的批量解析（`/biz-data/{formKey}/resolve` 用的是同一个方法）
    const texts = await this.resolveDisplayTexts(sourceFormKey ?? '', ids, displayField ?? '')
    const ordered: string[] = []
    for (const id of ids) {
      const text = texts[id]
      if (text === undefined) {
        throw new BusinessException(400, `引用的数据不存在: ${key}=${id}`)
      }
      ordered.push(text)
    }
    return JSON.stringify(ordered)
  }
}

/** 子表行数上限（对齐 Java `MAX_SUB_ROWS`）。 */
const MAX_SUB_ROWS = 100

/**
 * sql 模式列映射：管理员声明列 → `QueryColumn`（`ref = key`，外层子查询输出列名）。
 *
 * ⚠️ `sortable`/`filterable` 用 `=== true` 判定（对齐 Java 的 `Boolean.TRUE.equals(...)`）：
 *    声明列里这两个字段是**可空** `Boolean`，缺失即不可排/不可筛。
 */
function toQueryColumns(columns: ColumnConfig[]): QueryColumn[] {
  return columns.map((column) => ({
    key: String(column.key),
    ref: String(column.key),
    columnType: column.columnType === null ? '' : column.columnType.toUpperCase(),
    sortable: column.sortable === true,
    filterable: column.filterable === true,
  }))
}

/**
 * 解析运行时参数（sql 模式透传）；null/空白 → 空对象；非法 JSON → 400。
 *
 * ⚠️ 非对象**也**是 400（对齐 Java：`objectMapper.readValue(paramsJson, Map.class)`
 *    对数组/标量抛 `MismatchedInputException`），只有 JSON 字面量 `null` 回落空对象。
 *    消息里的 Jackson 原文无法逐字复刻，保留同一前缀 `运行时参数 params 格式非法，应为 JSON 对象: `。
 */
function parseRuntimeParams(paramsJson: string | null): Record<string, unknown> {
  if (paramsJson === null || paramsJson.trim() === '') return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(paramsJson)
  } catch (error) {
    throw new BusinessException(
      400,
      `运行时参数 params 格式非法，应为 JSON 对象: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (parsed === null) return {}
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BusinessException(
      400,
      '运行时参数 params 格式非法，应为 JSON 对象: 不是 JSON 对象',
    )
  }
  return parsed as Record<string, unknown>
}

/** 子表行必须是 JSON 对象；非法抛 400（对齐 Java `toRowMap`）。 */
function toRowMap(row: unknown, tableName: string): Record<string, unknown> {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) {
    throw new BusinessException(400, `子表行数据格式非法（需对象）: ${tableName}`)
  }
  return { ...(row as Record<string, unknown>) }
}

/** 值相等判定（`diffSubRows` 的变更检测；对齐 Java 的 `Objects.equals`）。 */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || a === undefined || b === null || b === undefined) return false
  // 数字与数字字符串（`version` / `sort_no` 从库里回来可能是字符串）视为不同 ——
  // Java 的 Objects.equals 也是严格比较，不做类型转换
  return false
}

/**
 * 该列是否 data-picker 引用列（对齐 Java `isDataPickerColumn`）。
 *
 * 判定顺序：`lookupPicker` → 否；`dataPicker` → 是；
 * 没有 `pickerType` 的旧配置 → 看它有没有 `<key>_text` 冗余列；
 * 配置解析失败 → 否。
 */
function isDataPickerColumn(ctx: BizDataContext, column: ColumnConfig): boolean {
  let picker: Record<string, unknown>
  try {
    picker = JSON.parse(String(column.pickerConfig)) as Record<string, unknown>
  } catch {
    return false
  }
  const pickerType =
    picker.pickerType === null || picker.pickerType === undefined
      ? null
      : String(picker.pickerType)
  if (pickerType === 'lookupPicker') return false
  if (pickerType === 'dataPicker') return true
  const textKey = `${String(column.key)}_text`
  return ctx.columns.some((c) => textKey === String(c.key))
}

// ==================== 纯函数（可单测） ====================

/** 解析 filter JSON 字符串；空/空白返回空对象，非法 JSON 抛 400（对齐 Java `parseFilter`）。 */
export function parseFilter(filterJson: string | null): Record<string, unknown> {
  if (filterJson === null || filterJson.trim() === '') return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(filterJson)
  } catch (error) {
    throw new BusinessException(
      400,
      `筛选参数 filter 格式非法，应为 JSON 对象: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BusinessException(400, '筛选参数 filter 格式非法，应为 JSON 对象')
  }
  return parsed as Record<string, unknown>
}

/** JSON 列值反序列化；解析失败原样返回（对齐 Java `deserializeJsonValue` 的容错语义）。 */
export function deserializeJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

/** 解析单个表单 column_config 中的 dataPicker 引用列，聚合到 result。 */
export function collectPickerRefs(
  columnConfig: string | null,
  formKey: string,
  result: Record<string, ReferencedByEntry>,
): void {
  if (columnConfig === null || columnConfig.trim() === '') return
  let columns: unknown
  try {
    columns = JSON.parse(columnConfig)
  } catch {
    // 非法 column_config 跳过（发布链路已校验，此处容错 —— 对齐 Java 的空 catch）
    return
  }
  if (!Array.isArray(columns)) return

  for (const column of columns) {
    if (column === null || typeof column !== 'object') continue
    const pickerConfig = (column as Record<string, unknown>).pickerConfig
    if (typeof pickerConfig !== 'string' || pickerConfig.trim() === '') continue

    let picker: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(pickerConfig)
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) continue
      picker = parsed as Record<string, unknown>
    } catch {
      continue
    }

    const target = picker.sourceFormKey
    if (target === null || target === undefined || String(target).trim() === '') continue
    const targetKey = String(target)
    const entry = (result[targetKey] ??= { count: 0, referencedBy: [] })
    entry.count += 1
    entry.referencedBy.push(formKey)
  }
}

/** 对齐 Java `asInt`：Number 取 intValue，其余按字符串解析；null → null。 */
export function asInt(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Math.trunc(value)
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

/**
 * 对齐 Java `asDateTime`：Timestamp/LocalDateTime → 时间；null → null。
 *
 * Node 侧 mysql2 已经把 `datetime` 列转成 `Date`，直接透传即可 ——
 * 序列化后的 ISO 形式与 Java 的 `LocalDateTime` 都被规范化器映射成 `<TIME>`。
 */
export function asDateTime(value: unknown): Date | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** 把查询生成器抛出的普通 Error 转成业务 400（对齐 Java 的 `catch (IllegalArgumentException)`）。 */
function asBusinessException(error: unknown): BusinessException {
  if (error instanceof BusinessException) return error
  return new BusinessException(400, error instanceof Error ? error.message : String(error))
}