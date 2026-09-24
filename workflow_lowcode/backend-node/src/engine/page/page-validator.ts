import { Injectable } from '@nestjs/common'
import { BusinessException } from '../../common/exception/business-exception'
import type { ColumnConfig } from '../../common/domain/column-config'
import { getTenantId } from '../../framework/tenant/tenant-context'
import { parseBusinessColumnConfig } from '../form/column/column-config-parser'
import { FormDefinitionRepository } from '../form/repository/form-definition.repository'
import { DataSourceService } from '../datasource/service/data-source.service'
import type { PageDefinitionRow } from './repository/page-definition.repository'

/** 不可作为查询条件的列类型（大字段），对齐 Java `NON_FILTERABLE_TYPES`。 */
const NON_FILTERABLE_TYPES = new Set(['JSON', 'TEXT', 'LONGTEXT'])

/** 可声明数据源绑定的数据组件类型，对齐 Java `DATA_COMPONENT_TYPES`。 */
const DATA_COMPONENT_TYPES = new Set(['page-table', 'page-tree'])

/**
 * 页面发布校验器（对齐 Java `PageValidator`，331 行）。
 *
 * 两套互不相交的规则，按 `type` 分派：
 * - **VIEW**：绑定来源（dataSourceId 优先，formKey 兜底）→ 取列 → schema 里的
 *   `searchFields` / `columns` 逐个比对列白名单（存在、非隐藏、非大字段）；
 * - **PAGE**：`{rule, option, dataSources, actions}` 结构 → `dataSources[].refId`
 *   指向**存在且 ENABLED** 的全局数据源 → `rule` 里数据组件的 `dataSourceId` 已声明
 *   → `actions` 的 `set-filter` 字段命中该数据源的 `searchFields` 白名单。
 *
 * ⚠️ 校验项**逐条照抄**是本文件的全部价值：漏一条的后果是"非法 schema 被存进库"，
 *    而它要到很久以后（渲染或取数）才炸，那时已经很难定位来源。
 *    Java 侧 14 处 `BusinessException` 的消息文本在这里逐字复刻。
 *
 * ⚠️ `parseColumnConfig` 用**已有的** `parseBusinessColumnConfig`，不另写一份：
 *    它内部从 `newColumnConfig()` 起步补齐默认值（Jackson 语义）。
 *    Java 用的是 `objectMapper.readValue(..., ColumnConfig.class)` ——
 *    两者对**缺省字段**的处理必须一致，否则「表单未配置某列属性」会被判成非法。
 */
@Injectable()
export class PageValidator {
  constructor(
    private readonly formDefRepository: FormDefinitionRepository,
    private readonly dataSourceService: DataSourceService,
  ) {}

  /**
   * 校验页面可发布（对齐 Java `validateForPublish`）。
   *
   * `PAGE` 类型走另一条完全独立的规则集。
   */
  async validateForPublish(page: PageDefinitionRow): Promise<void> {
    if (page.type === 'PAGE') {
      await this.validateForPublishPage(page)
      return
    }

    const tenantId = getTenantId()
    const hasDataSource = page.data_source_id !== null && page.data_source_id.trim() !== ''
    const hasFormKey = page.form_key !== null && page.form_key.trim() !== ''

    // 1. 绑定来源校验：数据源与遗留 formKey 至少其一
    if (!hasDataSource && !hasFormKey) {
      throw new BusinessException(400, '请选择数据源')
    }

    // 2. 取列并构建合法列 / 隐藏列 / 不可筛选列集合
    const columns = await this.resolveColumns(
      tenantId,
      page.data_source_id,
      page.form_key,
      '绑定表单不存在或未发布: ',
    )

    const validKeys = new Set<string>()
    const hiddenKeys = new Set<string>()
    const nonFilterableKeys = new Set<string>()
    for (const column of columns) {
      const key = String(column.key)
      validKeys.add(key)
      if (column.hidden) hiddenKeys.add(key)
      if (NON_FILTERABLE_TYPES.has(String(column.columnType))) nonFilterableKeys.add(key)
    }

    // 3. 解析页面 schema
    const root = parseSchema(page.schema)
    const searchFields = pathOf(root, 'searchFields')
    const pageColumns = pathOf(root, 'columns')

    // 4. searchFields：引用列必须存在、非隐藏、非 JSON/TEXT
    if (Array.isArray(searchFields)) {
      for (const field of searchFields) {
        const key = textAt(field, 'key')
        if (!validKeys.has(key)) {
          throw new BusinessException(400, `查询字段引用列不存在: ${key}`)
        }
        if (hiddenKeys.has(key)) {
          throw new BusinessException(400, `查询字段不能引用隐藏列: ${key}`)
        }
        if (nonFilterableKeys.has(key)) {
          throw new BusinessException(400, `查询字段不能引用大字段列（JSON/TEXT）: ${key}`)
        }
      }
    }

    // 5. columns：引用列必须存在、非隐藏（自定义列 custom=true 跳过数据源字段校验）
    if (Array.isArray(pageColumns)) {
      for (const column of pageColumns) {
        const key = textAt(column, 'key')
        const isCustom = boolAt(column, 'custom')
        if (!isCustom && !validKeys.has(key)) {
          throw new BusinessException(400, `展示列引用列不存在: ${key}`)
        }
        if (hiddenKeys.has(key)) {
          throw new BusinessException(400, `展示列不能引用隐藏列: ${key}`)
        }
      }
    }
  }

  /**
   * 解析发布时编译视图所需的列（对齐 Java `resolveBindColumns`）。
   * 调用前提：`validateForPublish` 已通过。
   *
   * ⚠️ 仅供 VIEW 编译用；本批**没有**迁移 `ViewCompiler`（规格 U32），
   *    所以这个方法的调用方目前只有 `publish` 的显式拒绝分支。
   */
  async resolveBindColumns(page: PageDefinitionRow): Promise<ColumnConfig[]> {
    if (page.data_source_id !== null && page.data_source_id.trim() !== '') {
      const meta = await this.dataSourceService.metadata(page.data_source_id)
      return meta.columns ?? []
    }
    if (page.form_key === null || page.form_key.trim() === '') {
      throw new BusinessException(400, '视图必须绑定业务表单')
    }
    return this.resolveColumns(
      getTenantId(),
      null,
      page.form_key,
      '绑定表单不存在或未发布: ',
    )
  }

  /** 取列：数据源 metadata 优先，其次遗留 formKey 的 column_config。 */
  private async resolveColumns(
    tenantId: string,
    dataSourceId: string | null,
    formKey: string | null,
    missingFormMessage: string,
  ): Promise<ColumnConfig[]> {
    if (dataSourceId !== null && dataSourceId.trim() !== '') {
      // 新协议：数据源 metadata 取列（定义不存在/未启用 → dsService 自带 404/400）
      const meta = await this.dataSourceService.metadata(dataSourceId)
      return meta.columns ?? []
    }
    const boundForm = await this.formDefRepository.findLatestPublishedByKey(
      String(formKey),
      tenantId,
    )
    if (boundForm === null) {
      throw new BusinessException(400, `${missingFormMessage}${String(formKey)}`)
    }
    if (boundForm.type !== 'BUSINESS') {
      throw new BusinessException(400, `绑定表单 ${String(formKey)} 不是业务表单`)
    }
    return parseColumnConfig(boundForm.column_config)
  }

  /**
   * 自定义页面（PAGE）发布校验（对齐 Java `validateForPublishPage`）。
   *
   * 四步：schema 形状 → dataSources 条目（id 唯一、refId 非空且指向 ENABLED 数据源、
   * FORM 数据源还要求绑定表单已发布且 searchFields/columns 引用列存在）
   * → rule 中数据组件的 dataSourceId 命中 → actions 的 set-filter 字段白名单。
   */
  private async validateForPublishPage(page: PageDefinitionRow): Promise<void> {
    const tenantId = getTenantId()
    const root = parseSchema(page.schema)
    if (!Array.isArray(pathOf(root, 'rule'))) {
      throw new BusinessException(400, '自定义页面 schema 必须为 {rule, option, dataSources, actions}')
    }

    // 已启用全局数据源映射（refId → 数据源）
    const enabled = await this.dataSourceService.getEnabled()
    const enabledById = new Map(enabled.map((ds) => [ds.id, ds]))

    // 2. dataSources 校验
    const dsById = new Map<string, Record<string, unknown>>()
    const dataSources = pathOf(root, 'dataSources')
    if (Array.isArray(dataSources)) {
      for (const entry of dataSources) {
        const record = asRecord(entry)
        const id = textAt(record, 'id')
        if (id.trim() === '') {
          throw new BusinessException(400, '自定义页面 dataSources 条目 id 不能为空')
        }
        if (dsById.has(id)) {
          throw new BusinessException(400, `自定义页面 dataSources id 重复: ${id}`)
        }
        const refId = textAt(record, 'refId')
        if (refId.trim() === '') {
          throw new BusinessException(400, `自定义页面 dataSources[${id}] refId 不能为空`)
        }
        const ds = enabledById.get(refId)
        if (ds === undefined) {
          throw new BusinessException(400, `自定义页面引用的数据源不存在或未启用: ${refId}`)
        }
        // FORM 数据源：绑定表单须已发布；searchFields/columns 引用列存在
        if (ds.type === 'FORM') {
          const boundForm = await this.formDefRepository.findLatestPublishedByKey(
            String(ds.formKey),
            tenantId,
          )
          if (boundForm === null) {
            throw new BusinessException(400, `自定义页面引用的表单未发布: ${String(ds.formKey)}`)
          }
          validatePageDsFields(record, boundForm.column_config)
        }
        dsById.set(id, record)
      }
    }

    // 3. rule 中数据组件 dataSourceId 命中
    const rule = pathOf(root, 'rule')
    for (const node of Array.isArray(rule) ? rule : []) {
      const type = textAt(node, 'type')
      if (!DATA_COMPONENT_TYPES.has(type)) continue
      const dsId = textAt(pathOf(node, 'props'), 'dataSourceId')
      if (dsId.trim() !== '' && !dsById.has(dsId)) {
        throw new BusinessException(400, `数据组件 dataSourceId 未在 dataSources 声明: ${dsId}`)
      }
    }

    // 4. actions set-filter 字段白名单
    const actions = pathOf(root, 'actions')
    for (const action of Array.isArray(actions) ? actions : []) {
      const steps = pathOf(action, 'steps')
      for (const step of Array.isArray(steps) ? steps : []) {
        if (textAt(step, 'op') !== 'set-filter') continue
        const target = textAt(step, 'target')
        const field = textAt(step, 'field')
        if (target.trim() === '' || field.trim() === '') continue
        const entry = dsById.get(target)
        if (entry === undefined) {
          throw new BusinessException(400, `set-filter 目标数据源未声明: ${target}`)
        }
        const searchFields = pathOf(entry, 'searchFields')
        if (Array.isArray(searchFields) && searchFields.length > 0) {
          const declared = searchFields.some((sf) => field === String(sf))
          if (!declared) {
            throw new BusinessException(400, `set-filter 字段未在数据源 searchFields 白名单: ${field}`)
          }
        }
      }
    }
  }
}

/** 校验 PAGE dataSources 条目的 searchFields/columns 引用列存在（FORM 绑定）。 */
function validatePageDsFields(entry: Record<string, unknown>, columnConfig: string | null): void {
  const validKeys = new Set(parseColumnConfig(columnConfig).map((c) => String(c.key)))
  const searchFields = pathOf(entry, 'searchFields')
  for (const sf of Array.isArray(searchFields) ? searchFields : []) {
    const key = String(sf)
    if (key.trim() !== '' && !validKeys.has(key)) {
      throw new BusinessException(400, `数据源 searchFields 引用列不存在: ${key}`)
    }
  }
  const columns = pathOf(entry, 'columns')
  for (const col of Array.isArray(columns) ? columns : []) {
    const key = String(col)
    if (key.trim() !== '' && !validKeys.has(key)) {
      throw new BusinessException(400, `数据源 columns 引用列不存在: ${key}`)
    }
  }
}

/**
 * 解析 schema JSON（对齐 Java `parseSchema`）。
 *
 * ⚠️ 兼容**纯数组**形式：裸数组会被包成 `{rule: [...]}`。
 * ⚠️ 空 / 空白 schema 视为 `{}`（不是报错）；非法 JSON → 400「页面 schema 解析失败」。
 */
function parseSchema(schema: string | null): Record<string, unknown> {
  if (schema === null || schema.trim() === '') return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(schema)
  } catch {
    throw new BusinessException(400, '页面 schema 解析失败')
  }
  if (Array.isArray(parsed)) return { rule: parsed }
  if (parsed === null || typeof parsed !== 'object') return {}
  return parsed as Record<string, unknown>
}

/**
 * 解析 column_config（空 → 400；非法 JSON → 400），复用既有的解析器补齐默认值。
 *
 * ⚠️ **已知偏差**：`parseBusinessColumnConfig` 比 Jackson 严格 —— 它对
 *    非法列名 / 保留列 / 未知列类型也会抛 `BusinessException`，而 Java 的
 *    `objectMapper.readValue(..., ColumnConfig.class)` 只关心**反序列化**，这类
 *    语义问题它根本不看（要么留给下游，要么永远不报）。这里把两者统一映射成
 *    Java 那条消息，代价是「非法列名」这类情形在 VIEW 发布时会变成
 *    「绑定表单列映射配置非法」而不是照常通过。
 *    该分支（VIEW + 只有 formKey 的遗留页）当前没有 golden 覆盖、且被 U32 挡在后面，
 *    属规格 §9 的开放项 —— **不要在没有 golden 的情况下擅自选择其中一种语义**。
 */
function parseColumnConfig(columnConfig: string | null): ColumnConfig[] {
  if (columnConfig === null || columnConfig.trim() === '') {
    throw new BusinessException(400, '绑定表单未配置列映射（column_config）')
  }
  try {
    return parseBusinessColumnConfig(columnConfig)
  } catch {
    throw new BusinessException(400, '绑定表单列映射配置非法')
  }
}

/** 取一个「可能是对象」的值的属性（对齐 Jackson 的 `path(...)`：非对象 → 缺失）。 */
function pathOf(node: unknown, field: string): unknown {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return undefined
  return (node as Record<string, unknown>)[field]
}

/** 对齐 Jackson 的 `path(x).asText()`：缺失/null → `""`。 */
function textAt(node: unknown, field: string): string {
  const value = pathOf(node, field)
  if (value === null || value === undefined) return ''
  return String(value)
}

/** 对齐 Jackson 的 `path(x).asBoolean(default)`：仅真正布尔为 true。 */
function boolAt(node: unknown, field: string): boolean {
  return pathOf(node, field) === true
}

/** 非对象 → 空对象（后续 `pathOf` 会返回 undefined，与 Jackson 语义一致）。 */
function asRecord(node: unknown): Record<string, unknown> {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return {}
  return node as Record<string, unknown>
}
