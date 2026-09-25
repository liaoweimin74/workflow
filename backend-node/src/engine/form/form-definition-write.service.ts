import { Injectable } from '@nestjs/common'
import { randomBytes, randomUUID } from 'node:crypto'
import { BusinessException } from '../../common/exception/business-exception'
import { getTenantId } from '../../framework/tenant/tenant-context'
import type { ColumnConfig } from '../../common/domain/column-config'
import { DynamicTableManager } from './column/dynamic-table-manager'
import { parseBusinessColumnConfig } from './column/column-config-parser'
import { collectUnknownBusinessComponentTypes } from './column/business-component-whitelist'
import { DataSourceRepository } from '../datasource/repository/data-source.repository'
import {
  FormDefinitionRepository,
  type FormDefinitionRow,
} from './repository/form-definition.repository'

/**
 * 表单定义的写路径（对齐 Java `FormDefinitionService.create/update/delete`
 * 以及 `DataSourceSyncListener` 的三个事件处理）。
 *
 * 【为什么把「数据源同步」放在这里】Java 用 Spring 事件解耦
 * （`FormCreatedEvent` → `DataSourceSyncListener`）。Node 没有事件总线，
 * 直接同步调用即可 —— 但**语义必须一一对应**，见下面三个 private 方法的注释。
 * 这是有用户可见后果的行为：新建业务/流程表单后，数据源管理页会多出一条数据源。
 */
@Injectable()
export class FormDefinitionWriteService {
  constructor(
    private readonly repository: FormDefinitionRepository,
    private readonly dataSources: DataSourceRepository,
    private readonly tableManager: DynamicTableManager,
  ) {}

  /**
   * 创建表单定义。
   *
   * ⚠️ key 重复抛的是 `RuntimeException("Form key already exists: " + key)` → HTTP **500**，
   *    不是业务 200。这里用普通 Error 保持同样的状态码。
   * ⚠️ `type` 为空/空白时落 `WORKFLOW`；`schema` 初始化为字面量 `"[]"`；
   *    `version` 为 1；`status` 为 `DRAFT`；`column_config` 保持 null。
   */
  async create(
    name: string,
    key: string,
    type: string | null,
    processKey: string | null,
  ): Promise<Record<string, unknown>> {
    const tenantId = getTenantId()
    if (await this.repository.existsByKey(key, tenantId)) {
      throw new Error(`Form key already exists: ${key}`)
    }

    const now = new Date()
    const row: FormDefinitionRow = {
      id: randomBytes(16).toString('hex'),
      tenant_id: tenantId,
      name,
      key,
      type: type === null || type.trim() === '' ? 'WORKFLOW' : type,
      schema: '[]',
      column_config: null,
      version: 1,
      status: 'DRAFT',
      published_version: null,
      process_key: processKey,
      created_by: null,
      created_at: now,
      updated_at: now,
    }
    await this.repository.insert(row)
    await this.syncOnCreated(tenantId, row)
    return toEntity(row)
  }

  /**
   * 更新表单定义（原地更新，不创建新版本）。
   *
   * ⚠️ 五个字段都是「**null 表示不改**」—— 与菜单/组织的 update 一致。
   * ⚠️ **不改 `version`、不改 `status`**：Java 在 PUBLISHED 上也直接原地改。
   */
  async update(
    id: string,
    name: string | null,
    key: string | null,
    schema: string | null,
    columnConfig: string | null,
    processKey: string | null,
  ): Promise<Record<string, unknown>> {
    const tenantId = getTenantId()
    const current = await this.repository.findByIdAndTenantId(id, tenantId)
    if (current === null) throw new Error(`Form definition not found: ${id}`)

    const patch: Partial<FormDefinitionRow> = { updated_at: new Date() }
    if (name !== null) patch.name = name
    if (key !== null) patch.key = key
    if (schema !== null) patch.schema = schema
    if (columnConfig !== null) patch.column_config = columnConfig
    if (processKey !== null) patch.process_key = processKey
    await this.repository.update(id, patch)

    const updated = { ...current, ...patch }
    await this.syncOnUpdated(tenantId, updated)
    return toEntity(updated)
  }

  /**
   * 删除表单定义（**软删除**：`status` 改成 `ARCHIVED`，行保留）。
   *
   * ⚠️ 已发布的表单**不允许删除**：Java 抛 `BusinessException(400, "已发布的表单不能删除")`
   *    —— 这是业务异常（HTTP 200 + body 内 code 400），与上面两个 500 不同，
   *    所以这里用 `BusinessException`。
   */
  async remove(id: string): Promise<void> {
    const tenantId = getTenantId()
    const current = await this.repository.findByIdAndTenantId(id, tenantId)
    if (current === null) throw new Error(`Form definition not found: ${id}`)
    if (current.status === 'PUBLISHED') {
      throw new BusinessException(400, '已发布的表单不能删除')
    }
    await this.repository.update(id, { status: 'ARCHIVED', updated_at: new Date() })
    await this.syncOnDeleted(tenantId, current)
  }

  // ==================== 复制（跨类型：WORKFLOW ↔ BUSINESS） ====================

  /**
   * 复制表单定义（新功能端点，无 Java 契约；错误形态刻意向 create 族看齐）。
   *
   * 产物语义：
   *  - **新记录**：新 id、新 key、`version=1`、`status=DRAFT`、`published_version=null`
   *    —— 即「复制完为草稿」，发布走既有 `publish` 校验链；
   *  - `schema` 原样复制（含设计器扩展段 dataSources / actions）；
   *  - `column_config` 仅在目标类型为 BUSINESS 时保留 —— 发布建表只消费业务表单的
   *    列映射，WORKFLOW 发布链路完全不读它，带过去只是脏数据；
   *  - `process_key` 仅在目标类型为 WORKFLOW 时保留 —— 业务表单没有流程语义；
   *  - 复制即建数据源（`syncOnCreated`：BUSINESS → FORM、WORKFLOW → WORKFLOW），
   *    数据源 name 跟随**新**表单名。
   *
   * 校验分工（复制时不做组件兼容性拦截 —— 这正是「工作流表单复制为业务表单」
   * 场景的设计：复制放行，**发布时**由 `validateBusinessSchema` 白名单拦截
   * 审批类组件，由 `parseBusinessColumnConfig` 拦截未配置列映射）：
   *  - 源不存在 → 普通 Error（→ HTTP 500，与 create/update 族一致）
   *  - name/key 空白、type 非法 → `BusinessException` 400
   *  - key 重复 → 普通 Error `Form key already exists`（→ HTTP 500，与 create 一致）
   */
  async copy(
    sourceId: string,
    name: string,
    key: string,
    type: string | null,
  ): Promise<Record<string, unknown>> {
    const tenantId = getTenantId()
    const source = await this.repository.findByIdAndTenantId(sourceId, tenantId)
    if (source === null) throw new Error(`Form definition not found: ${sourceId}`)

    const trimmedName = name.trim()
    const trimmedKey = key.trim()
    if (trimmedName === '') throw new BusinessException(400, '表单名称不能为空')
    if (trimmedKey === '') throw new BusinessException(400, '表单标识不能为空')
    const targetType = type === null || type.trim() === '' ? source.type : type.trim()
    if (targetType !== 'WORKFLOW' && targetType !== 'BUSINESS') {
      throw new BusinessException(400, `无效的表单类型: ${targetType}`)
    }
    if (await this.repository.existsByKey(trimmedKey, tenantId)) {
      throw new Error(`Form key already exists: ${trimmedKey}`)
    }

    const now = new Date()
    const row: FormDefinitionRow = {
      id: randomBytes(16).toString('hex'),
      tenant_id: tenantId,
      name: trimmedName,
      key: trimmedKey,
      type: targetType,
      schema: source.schema,
      column_config: targetType === 'BUSINESS' ? source.column_config : null,
      version: 1,
      status: 'DRAFT',
      published_version: null,
      process_key: targetType === 'WORKFLOW' ? source.process_key : null,
      created_by: null,
      created_at: now,
      updated_at: now,
    }
    await this.repository.insert(row)
    await this.syncOnCreated(tenantId, row)
    return toEntity(row)
  }

  // ==================== 发布（对齐 FormDefinitionService.publish） ====================

  /**
   * 发布表单定义。
   *
   * ⚠️ **DDL 发生在 `publish`，不是 `create`**：`create` 只写定义行，
   *    发布时才按 `column_config` 建/改物理表 `wf_biz_<key>`（子表 `wf_biz_<key>_<field>`）。
   *
   * 状态机与校验链（顺序即契约 —— 顺序变了先报哪条错就变了）：
   *   ① 记录不存在 → `RuntimeException("Form definition not found: <id>")` → HTTP 500
   *   ② 状态不是 DRAFT/PUBLISHED → 业务 400「仅草稿或已发布表单可发布，当前状态: X」
   *   ③ **schema 与上一已发布版本相同 → 业务 400「表单内容未变化，无需发布」**
   *      （重新发布时要**排除自身**再比，否则自己和自己比恒等）
   *   ④ `type=BUSINESS` 才建表，建表前依次跑：
   *      `validateBusinessSchema` → `validatePickerReferences` →
   *      `collectExternalDisplayFields` → 过滤 `page-list-cards` 组件与外部展示字段 →
   *      `parseColumnConfig`（逐列校验）→ 非空才 `ensureTable` → 有子列的再 `ensureSubTable`
   *   ⑤ 同 key 的**其它** PUBLISHED 记录降为 ARCHIVED
   *   ⑥ 当前记录置 PUBLISHED、`publishedVersion = version`
   *   ⑦ 触发数据源同步（对齐 `FormCreatedEvent` → `DataSourceSyncListener`）
   *
   * ⚠️ **未照抄的一点（已记入规格）**：Java 用 `findByIdForUpdate` 悲观锁串行化发布，
   *    而 MySQL 的 DDL 会**隐式提交**事务 —— 锁在 DDL 前后并不真正成立；
   *    Node 侧 DDL 又走独立连接（不在同一事务里），照抄一个"看起来有锁"的实现
   *    只会掩盖这一点。这里**不加锁**，行为差异仅在并发发布同一表单时可见，
   *    契约场景是串行的、观察不到。
   */
  async publish(id: string): Promise<Record<string, unknown>> {
    const tenantId = getTenantId()
    const draft = await this.repository.findByIdAndTenantId(id, tenantId)
    if (draft === null) throw new Error(`Form definition not found: ${id}`)

    const republish = draft.status === 'PUBLISHED'
    if (draft.status !== 'DRAFT' && !republish) {
      throw new BusinessException(400, `仅草稿或已发布表单可发布，当前状态: ${draft.status}`)
    }

    const lastPublished = republish
      ? await this.repository.findLatestPublishedByKeyExcluding(draft.key, tenantId, draft.id)
      : await this.repository.findLatestPublishedByKey(draft.key, tenantId)

    if (lastPublished !== null && lastPublished.schema === draft.schema) {
      throw new BusinessException(400, '表单内容未变化，无需发布')
    }

    if (draft.type === 'BUSINESS') {
      validateBusinessSchema(draft.schema)
      await this.validatePickerReferences(tenantId, draft.schema)
      const externalDisplayFields = collectExternalDisplayFields(draft.schema)
      // ⚠️ 复用既有的 `parseBusinessColumnConfig`，**不要另写一份** ——
      //    它就是 Java `FormDefinitionService.parseColumnConfig` 的移植
      //    （错误消息逐字一致、含 storageMode 与逐列校验），而且它内部用
      //    `normalizeColumn` 补齐了 `ColumnConfig` 的默认值。
      //    自写的那份会漏掉「JSON 里缺省的 `subColumns` 是 `undefined` 而不是 `null`」，
      //    导致 `subColumns.length` 直接抛 TypeError（实测被契约场景抓到的）。
      const columns = parseBusinessColumnConfig(draft.column_config)
        .filter((column) => column.componentType !== 'page-list-cards')
        .filter((column) => column.key === null || !externalDisplayFields.has(column.key))
      // 仅含外部数据展示组件时无需建底表
      if (columns.length > 0) {
        await this.tableManager.ensureTable(draft.key, columns)
      }
      for (const column of columns) {
        if (column.subColumns !== null && column.subColumns.length > 0 && column.key !== null) {
          await this.tableManager.ensureSubTable(draft.key, column.key, column.subColumns)
        }
      }
    }

    // 同 key 的其它已发布记录降为 ARCHIVED
    if (lastPublished !== null) {
      await this.repository.update(lastPublished.id, {
        status: 'ARCHIVED',
        updated_at: new Date(),
      })
    }
    const published: FormDefinitionRow = {
      ...draft,
      status: 'PUBLISHED',
      published_version: draft.version,
      updated_at: new Date(),
    }
    await this.repository.update(draft.id, {
      status: 'PUBLISHED',
      published_version: draft.version,
      updated_at: published.updated_at,
    })
    await this.syncOnCreated(tenantId, published)
    return toEntity(published)
  }

  /**
   * 校验 data-picker 字段的引用配置（`validatePickerReferences`）。
   *
   * 只校验 `sourceFormKey` 模式；`dataSourceId` 模式跳过列级校验
   * （运行时由数据源 metadata 动态验证）。
   */
  private async validatePickerReferences(tenantId: string, schema: string | null): Promise<void> {
    const rules = parseRuleArray(schema)
    if (rules === null) return
    for (const field of rules) {
      if (String(field.type ?? '') !== 'dataPicker') continue
      const fieldKey = String(field.field ?? '')
      const props = asRecord(field.props)
      const dataSourceId = String(props.dataSourceId ?? '')
      const sourceFormKey = String(props.sourceFormKey ?? '')
      if (dataSourceId.trim() === '' && sourceFormKey.trim() === '') {
        throw new BusinessException(400, `data-picker 字段 ${fieldKey} 未配置数据源（dataSourceId）`)
      }
      if (dataSourceId.trim() !== '') continue

      const target = await this.repository.findLatestPublishedByKey(sourceFormKey, tenantId)
      if (target === null || target.type !== 'BUSINESS') {
        throw new BusinessException(400, `data-picker 目标表单不存在或未发布: ${sourceFormKey}`)
      }
      let targetColumns: ColumnConfig[]
      try {
        targetColumns = parseBusinessColumnConfig(target.column_config)
      } catch {
        throw new BusinessException(400, `data-picker 目标表单不存在或未发布: ${sourceFormKey}`)
      }
      const targetKeys = new Set(targetColumns.map((c) => c.key))
      const hiddenKeys = new Set(targetColumns.filter((c) => c.hidden).map((c) => c.key))

      const displayField = String(props.displayField ?? '')
      if (displayField.trim() === '') {
        throw new BusinessException(400, `data-picker 字段 ${fieldKey} 未配置显示字段`)
      }
      if (!targetKeys.has(displayField)) {
        throw new BusinessException(400, `data-picker 引用列已不存在: ${displayField}`)
      }
      for (const item of asArray(props.columns)) {
        const key = String(item)
        if (key.trim() !== '' && !targetKeys.has(key)) {
          throw new BusinessException(400, `data-picker 引用列已不存在: ${key}`)
        }
      }
      const sourceColumn = String(asRecord(props.dependOn).sourceColumn ?? '')
      if (sourceColumn.trim() !== '' && !targetKeys.has(sourceColumn)) {
        throw new BusinessException(400, `data-picker 级联引用列已不存在: ${sourceColumn}`)
      }
      for (const filter of asArray(props.filters)) {
        const column = String(asRecord(filter).column ?? '')
        if (column.trim() === '') continue
        if (!targetKeys.has(column)) {
          throw new BusinessException(400, `data-picker 过滤条件引用列已不存在: ${column}`)
        }
        if (hiddenKeys.has(column)) {
          throw new BusinessException(400, `data-picker 过滤条件不能引用隐藏列: ${column}`)
        }
      }
    }
  }

  // ==================== 数据源同步（对齐 DataSourceSyncListener） ====================

  /**
   * 表单创建 → 自动建数据源。
   *
   * 映射：`BUSINESS → FORM`、`WORKFLOW → WORKFLOW`；**其余类型不建**。
   * 幂等：同租户同 formKey 已有数据源时跳过。
   * 名称固定为 `<表单名> 数据源`，状态直接 `ENABLED`，`createdBy` 为 `system`。
   */
  private async syncOnCreated(tenantId: string, form: FormDefinitionRow): Promise<void> {
    const dataSourceType = dataSourceTypeOf(form.type)
    if (dataSourceType === null) return
    if ((await this.dataSources.findByTenantIdAndFormKey(tenantId, form.key)) !== null) return

    const now = new Date()
    await this.dataSources.insertDataSource({
      id: randomUUID().replace(/-/g, ''),
      tenant_id: tenantId,
      name: `${form.name} 数据源`,
      type: dataSourceType,
      form_key: form.key,
      /**
       * ⚠️ FORM / WORKFLOW 数据源的 `source_key` **必须等于** `form_key`。
       *
       *    Java 是在实体的 `@PrePersist` 里做这件事的
       *    （`DataSourceDefinition.syncSourceKeyWithFormKey`），
       *    注释里明说这是为了保证唯一索引 `uk_ds_tenant_source_key` 下
       *    FORM/WORKFLOW 行的 source_key 始终非空且等于 form_key，
       *    「绕过 Service 直接 save 的路径也要覆盖到」。
       *    这里一开始写成了 null，契约立刻报出来：
       *    `$.data[i].sourceKey: 类型不符（Java string vs Node null）` ——
       *    而且它还**连带引起顺序差异**：比对前按元素 JSON 排序，
       *    元素内容不同，排序位置自然也不同（所以一开始看起来像"排序放宽没生效"）。
       */
      source_key: form.key,
      form_id: form.id,
      params: null,
      // 监听器里直接建成 ENABLED（不是 DRAFT）
      status: 'ENABLED',
      created_by: 'system',
      created_at: now,
      updated_at: now,
    })
  }

  /**
   * 表单更新 → 同步数据源名称。
   *
   * ⚠️ Java 用**事件里的 formKey** 去找数据源，而事件是在 update 之后发的、
   *    带的是**更新后**的 key。所以「改了表单 key」会导致找不到旧数据源、
   *    数据源名称不同步 —— 这是 Java 的既有行为，照抄（不额外去按旧 key 兜底）。
   */
  private async syncOnUpdated(tenantId: string, form: FormDefinitionRow): Promise<void> {
    const dataSourceType = dataSourceTypeOf(form.type)
    if (dataSourceType === null) return
    const existing = await this.dataSources.findByTenantIdAndFormKey(tenantId, form.key)
    if (existing === null) return
    await this.dataSources.updateDataSourceName(
      existing.id,
      `${form.name} 数据源`,
      new Date(),
    )
  }

  /** 表单删除 → **硬删除**对应数据源（对齐 `dsRepository.delete(ds)`）。 */
  private async syncOnDeleted(tenantId: string, form: FormDefinitionRow): Promise<void> {
    const existing = await this.dataSources.findByTenantIdAndFormKey(tenantId, form.key)
    if (existing === null) return
    await this.dataSources.deleteDataSource(existing.id)
  }
}

/** 表单类型 → 数据源类型；不支持的返回 null（不自动创建）。 */
function dataSourceTypeOf(formType: string): string | null {
  if (formType === 'BUSINESS') return 'FORM'
  if (formType === 'WORKFLOW') return 'WORKFLOW'
  return null
}
/**
 * 实体出参 —— 对齐 Java：**写端点直接返回 `FormDefinition` 实体**，不是 DTO。
 *
 * ⚠️ 这就是「写端点返回实体、读端点返回 DTO」这条契约差异的来源：
 *    实体的字段集与 `FormDefinitionDetailVO` 不同（实体带 `tenantId`）。
 *    两者不能合并成同一个类型，否则这条差异会无声消失。
 */
function toEntity(row: FormDefinitionRow): Record<string, unknown> {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    key: row.key,
    type: row.type,
    schema: row.schema,
    columnConfig: row.column_config,
    version: row.version,
    status: row.status,
    publishedVersion: row.published_version,
    processKey: row.process_key,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}


// ==================== schema / column_config 的解析与校验 ====================
// 都是 `FormDefinitionService` 里同名逻辑的移植。**错误消息逐字照抄** —— 它们是契约。
// （历史黑名单 userPicker/deptPicker/divider/groupContainer/dataTable 已由
//   `business-component-whitelist.ts` 的白名单制取代——它们不在白名单，自然被拒。）

/**
 * 取 schema 的 rule 数组。
 *
 * ⚠️ `null` 表示「整体不是数组形态」—— 调用方的处理**各不相同**：
 *    `validateBusinessSchema` 抛 400「表单 schema 格式非法」，
 *    而 `collectExternalDisplayFields` / `validatePickerReferences` 直接返回空/跳过。
 *    所以这里返回 `null` 而不是空数组，让调用方各自决定。
 */
function parseRuleArray(schema: string | null): Array<Record<string, unknown>> | null {
  // ⚠️ 三类输入的下场**各不相同**，必须与 Jackson 对齐：
  //    - `null` → Java 用字面量 "[]" 兜底 ⇒ 空数组（合法）
  //    - **空串** → `readTree("")` 返回 MissingNode（**不抛异常**）⇒ 不是数组 ⇒
  //      由 `validateBusinessSchema` 报 400「表单 schema 格式非法」
  //    - 非法 JSON → 抛 `JsonProcessingException` ⇒ 400「表单 schema 解析失败」
  //    把空串也当成 "[]" 会**吞掉**「格式非法」这条错误（很容易写错）。
  if (schema === null) return []
  if (schema.trim() === '') return null
  let root: unknown
  try {
    root = JSON.parse(schema)
  } catch {
    throw new BusinessException(400, '表单 schema 解析失败')
  }
  if (Array.isArray(root)) return root as Array<Record<string, unknown>>
  const rule = asRecord(root).rule
  return Array.isArray(rule) ? (rule as Array<Record<string, unknown>>) : null
}

/** 宽松取对象（非对象一律当空对象，对齐 Jackson 的 `path()` 语义）。 */
function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** 宽松取数组（非数组一律空数组）。 */
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/**
 * 校验业务表单 schema 不含不支持组件（`validateBusinessSchema`）。
 *
 * ⚠️ 白名单制（`BUSINESS_FORM_ALLOWED_TYPES`）：递归 children / props.rule /
 * props.columns[].rule，任何未知 type 一律 400 拒绝。原黑名单制（userPicker 等五个）
 * 对「AI 生成的不存在类型名」（如 formgen 曾输出的 date/inputTextarea）不设防 ——
 * 设计器渲染「不支持」占位却能照常发布建表。
 * 子表组件（group/tableForm/subForm）与布局容器均在白名单内放行，逐层递归校验。
 */
function validateBusinessSchema(schema: string | null): void {
  const rules = parseRuleArray(schema)
  if (rules === null) {
    throw new BusinessException(400, '表单 schema 格式非法')
  }
  const unknown = collectUnknownBusinessComponentTypes(rules)
  if (unknown.length > 0) {
    throw new BusinessException(
      400,
      `业务表单暂不支持组件（${[...new Set(unknown)].join('、')}），请在设计器中使用标准组件后发布`,
    )
  }
}

/**
 * 收集「仅展示外部数据」的组件字段（`collectExternalDisplayFields`）。
 *
 * 目的：防止旧版 `column_config` 残留时误生成业务表列。
 * ⚠️ 递归口径照抄 Java：先看 `children`，再看 `props.rule`，最后看 `props.columns[].rule`；
 *    命中 `page-list-cards` 时取它的 `field` 并 **continue**（不再往下递归）。
 */
function collectExternalDisplayFields(schema: string | null): Set<string> {
  const out = new Set<string>()
  const rules = parseRuleArray(schema)
  if (rules !== null) collectFromRules(rules, out)
  return out
}

function collectFromRules(rules: unknown, out: Set<string>): void {
  for (const field of asArray(rules)) {
    const record = asRecord(field)
    if (String(record.type ?? '') === 'page-list-cards') {
      const key = String(record.field ?? '')
      if (key.trim() !== '') out.add(key)
      continue
    }
    collectFromRules(record.children, out)
    collectFromRules(asRecord(record.props).rule, out)
    for (const column of asArray(asRecord(record.props).columns)) {
      collectFromRules(asRecord(column).rule, out)
    }
  }
}