import { Injectable } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { BusinessException } from '../../../common/exception/business-exception'
import { getTenantId } from '../../../framework/tenant/tenant-context'
import { FormDefinitionRepository } from '../../form/repository/form-definition.repository'
import { PageDefinitionRepository } from '../../page/repository/page-definition.repository'
import { validate } from '../../form/bizdata/sql-template-engine'
import type { QueryColumn } from '../../form/bizdata/join-sql-generator'
import {
  isJoinTargetSystemKey,
  joinTargetSystemByKey,
} from '../../form/bizdata/join-target-catalog'
import {
  DataSourceRepository,
  type DataSourceRow,
} from '../repository/data-source.repository'
import {
  BUILT_IN_SOURCE_KEYS,
  BUILT_IN_TENANT,
  mapSystemInternalPath,
} from './system-source-catalog'

/** 支持的数据源类型，对齐 Java `SUPPORTED_TYPES`。 */
const SUPPORTED_TYPES = new Set(['FORM', 'SYSTEM', 'API', 'WORKFLOW', 'SQL'])

const TYPE_FORM = 'FORM'
const TYPE_SYSTEM = 'SYSTEM'
const TYPE_API = 'API'
const TYPE_WORKFLOW = 'WORKFLOW'
const TYPE_SQL = 'SQL'

const STATUS_DRAFT = 'DRAFT'
const STATUS_ENABLED = 'ENABLED'
const STATUS_DISABLED = 'DISABLED'

/**
 * 已注册的系统数据源 key，与内建目录同源（`BUILT_IN_SOURCE_KEYS`，8 个）。
 * 旧的两键字面量集合（dept-tree/user-tree）已收编，避免与 router/seeder 三处漂移。
 */
const SYSTEM_SOURCE_KEYS = BUILT_IN_SOURCE_KEYS

/**
 * 数据源定义的写路径（对齐 Java `DataSourceDefinitionService` 的
 * `create` / `update` / `enable` / `disable` / `delete`）。
 *
 * `params` 里的 `queryMode` 配置段在保存时**必须**校验：跳过校验会让非法配置进库，
 * 而库里的坏配置要到后续取数时才炸，那时更难定位。三种模式的校验：
 *   - `config` → `joins[]` 结构校验（别名/目标表单/字段/虚拟列唯一性）
 *   - `sql`    → `SqlTemplateEngine.validate`（SELECT 白名单、`:tenantId` 占位、
 *                列匹配、运行时参数白名单）
 *   - 其他     → 400「未知查询模式」（**注意**：`visual` 也在此列 —— 保存入口
 *                只接受 config/sql，所以 `visual` 分支在系统里不可达）
 */
@Injectable()
export class DataSourceWriteService {
  constructor(
    private readonly repository: DataSourceRepository,
    private readonly formDefRepository: FormDefinitionRepository,
    private readonly pageDefRepository: PageDefinitionRepository,
  ) {}

  /**
   * 创建数据源。
   *
   * ⚠️ 状态规则：**API/SQL 创建即 ENABLED**（手动配置的数据源视为已发布），
   *    其余类型一律 **DRAFT**（FORM/WORKFLOW 由表单事件建的才直接 ENABLED）。
   * ⚠️ FORM/WORKFLOW 的 `sourceKey` **恒等于 formKey**（formKey 权威，忽略入参 sourceKey）。
   */
  async create(request: {
    name: string | null
    type: string | null
    formKey: string | null
    sourceKey: string | null
    params: string | null
  }): Promise<Record<string, unknown>> {
    const tenantId = getTenantId()
    const { name, type, formKey, sourceKey, params } = request

    if (type === null || type.trim() === '') {
      throw new BusinessException(400, '数据源类型 type 必填')
    }
    if (!SUPPORTED_TYPES.has(type)) {
      throw new BusinessException(400, `不支持的数据源类型: ${type}`)
    }
    if (name === null || name.trim() === '') {
      throw new BusinessException(400, '数据源名称不能为空')
    }
    if (await this.repository.existsByTenantIdAndName(tenantId, name)) {
      throw new BusinessException(400, `数据源名称已存在: ${name}`)
    }

    // FORM/WORKFLOW：sourceKey 恒等于 formKey（formKey 权威）；其余类型以入参 sourceKey 为准
    const formBound = type === TYPE_FORM || type === TYPE_WORKFLOW
    const effSourceKey = formBound ? formKey : sourceKey
    this.validateRequiredFields(type, formKey, effSourceKey, params)
    if (formBound && !(await this.formDefRepository.existsByKey(String(formKey), tenantId))) {
      throw new BusinessException(400, `绑定的表单不存在: ${String(formKey)}`)
    }
    if (effSourceKey === null || effSourceKey.trim() === '') {
      throw new BusinessException(400, '数据源必须填写 sourceKey')
    }
    if (await this.repository.existsByTenantIdAndSourceKey(tenantId, effSourceKey)) {
      throw new BusinessException(400, `数据源标识 sourceKey 已存在: ${effSourceKey}`)
    }

    let storedParams: string | null
    if (type === TYPE_FORM || type === TYPE_SYSTEM) {
      if (type === TYPE_FORM && hasQueryModeSegment(params)) {
        await this.validateFormQueryConfig(params)
        storedParams = mergeQueryConfig(generateParams(type, String(formKey), sourceKey), String(params))
      } else {
        storedParams = generateParams(type, String(formKey), sourceKey)
      }
    } else {
      storedParams = params
    }

    const now = new Date()
    const row: DataSourceRow = {
      id: randomBytes(16).toString('hex'),
      tenant_id: tenantId,
      name,
      type,
      form_key: formKey,
      source_key: effSourceKey,
      // create 不设 formId（只有表单事件同步那条路径会设）
      form_id: null,
      params: storedParams,
      // API/SQL 为手动配置：创建即发布（ENABLED）；其余类型仍 DRAFT
      status: type === TYPE_API || type === TYPE_SQL ? STATUS_ENABLED : STATUS_DRAFT,
      created_by: null,
      created_at: now,
      updated_at: now,
    }
    await this.repository.insertDefinition(row)
    return toDto(row)
  }

  /**
   * 原地更新数据源（`null` 表示不更新）。
   *
   * ⚠️ 已启用且「类型或绑定表单」变化时要重新校验发布状态 —— 这是 Java 里
   *    `bindChanged` 那一段，容易漏。
   * ⚠️ 系统内建数据源（`tenant_id = BUILT_IN_TENANT`）受保护：改名/换绑定都会
   *    破坏预置语义与设计器引用，直接 400。
   */
  async update(
    id: string,
    request: {
      name: string | null
      type: string | null
      formKey: string | null
      sourceKey: string | null
      params: string | null
    },
  ): Promise<Record<string, unknown>> {
    const tenantId = getTenantId()
    const current = await this.requireById(id)
    this.requireNotBuiltIn(current, '修改')
    const { name, type, formKey, sourceKey, params } = request

    const newType = type === null || type.trim() === '' ? current.type : type
    if (type !== null && type.trim() !== '' && !SUPPORTED_TYPES.has(newType)) {
      throw new BusinessException(400, `不支持的数据源类型: ${newType}`)
    }
    if (
      name !== null &&
      name.trim() !== '' &&
      name !== current.name &&
      (await this.repository.existsByTenantIdAndName(tenantId, name))
    ) {
      throw new BusinessException(400, `数据源名称已存在: ${name}`)
    }

    const newFormKey = formKey === null ? current.form_key : formKey
    const newSourceKey = sourceKey === null ? current.source_key : sourceKey
    const newParams = params === null ? current.params : params
    const formBound = newType === TYPE_FORM || newType === TYPE_WORKFLOW
    // FORM/WORKFLOW：sourceKey 恒等于 formKey（formKey 权威），忽略入参 sourceKey 差异
    const effNewSourceKey = formBound ? newFormKey : newSourceKey
    this.validateRequiredFields(newType, newFormKey, effNewSourceKey, newParams)
    if (formBound && !(await this.formDefRepository.existsByKey(String(newFormKey), tenantId))) {
      throw new BusinessException(400, `绑定的表单不存在: ${String(newFormKey)}`)
    }
    if (newType === TYPE_FORM) {
      await this.validateFormQueryConfig(newParams)
    }
    // sourceKey 变更（不等于当前值）时校验租户内唯一；保持不变则跳过（自身不算冲突）
    if (
      effNewSourceKey !== current.source_key &&
      (await this.repository.existsByTenantIdAndSourceKey(tenantId, String(effNewSourceKey)))
    ) {
      throw new BusinessException(400, `数据源标识 sourceKey 已存在: ${String(effNewSourceKey)}`)
    }

    // 已启用数据源若变更类型/绑定对象，须重新校验发布状态
    const bindChanged =
      current.type !== TYPE_FORM || (formKey !== null && formKey !== current.form_key)
    if (current.status === STATUS_ENABLED && bindChanged) {
      if (newType === TYPE_FORM) {
        await this.requirePublishedForm(tenantId, String(newFormKey))
      } else if (newType === TYPE_WORKFLOW) {
        await this.requireWorkflowForm(tenantId, String(newFormKey))
      }
    }

    const patch: Partial<DataSourceRow> = {
      name: name === null ? current.name : name,
      type: newType,
      form_key: newFormKey,
      source_key: effNewSourceKey,
      params: newParams,
    }
    await this.repository.replaceDefinition(id, patch, new Date())
    return toDto({ ...current, ...patch })
  }

  /**
   * 启用数据源。
   *
   * ⚠️ FORM 须绑定**已发布**表单；WORKFLOW 须绑定**已发布且非 BUSINESS** 的表单
   *    （业务表单没有流程实例，无法跨实例聚合）。
   * ⚠️ FORM/SYSTEM 若 `params` 为空，启用时会补上自动生成的端点配置。
   */
  async enable(id: string): Promise<Record<string, unknown>> {
    const tenantId = getTenantId()
    const ds = await this.requireById(id)
    this.validateRequiredFields(ds.type, ds.form_key, ds.source_key, ds.params)
    if (ds.type === TYPE_FORM) {
      await this.requirePublishedForm(tenantId, String(ds.form_key))
      await this.validateFormQueryConfig(ds.params)
    } else if (ds.type === TYPE_WORKFLOW) {
      await this.requireWorkflowForm(tenantId, String(ds.form_key))
    }
    const patch: Partial<DataSourceRow> = { status: STATUS_ENABLED }
    if ((ds.type === TYPE_FORM || ds.type === TYPE_SYSTEM) && ds.params === null) {
      patch.params = generateParams(ds.type, String(ds.form_key), ds.source_key)
    }
    await this.repository.replaceDefinition(id, patch, new Date())
    return toDto({ ...ds, ...patch })
  }

  /**
   * 禁用数据源（**不做引用校验**，也不影响已发布页面运行）。
   * 系统内建数据源受保护：禁用会让设计器/页面取数失败，直接 400。
   */
  async disable(id: string): Promise<Record<string, unknown>> {
    const ds = await this.requireById(id)
    this.requireNotBuiltIn(ds, '禁用')
    await this.repository.replaceDefinition(id, { status: STATUS_DISABLED }, new Date())
    return toDto({ ...ds, status: STATUS_DISABLED })
  }

  /**
   * 删除数据源（任意状态可删，**被页面引用时拒绝**）。
   *
   * 引用统计覆盖两种绑定方式，取**并集**（任一命中即拒绝）：
   *   1. `PageDefinition.dataSourceId` 列
   *   2. PAGE 类型页面 `schema.dataSources[].refId`（软删除的 ARCHIVED 页面不算）
   * ⚠️ Java 的短路顺序：列引用 > 0 时直接返回该数，不再扫 schema ——
   *    所以报出来的「被 N 个页面引用」里的 N 语义**不是总数**。照抄。
   * ⚠️ 系统内建数据源**不允许删除**（预置语义；重启会被 seeder 补回，删除是假象）。
   */
  async remove(id: string): Promise<void> {
    const ds = await this.requireById(id)
    this.requireNotBuiltIn(ds, '删除')
    const refCount = await this.countRefs(ds.tenant_id, id)
    if (refCount > 0) {
      throw new BusinessException(400, `数据源已被 ${refCount} 个页面引用，无法删除`)
    }
    await this.repository.deleteDataSource(id)
  }

  /** 取数据源（含 SYSTEM 跨租户可见）；不存在 → 业务 404。 */
  private async requireById(id: string): Promise<DataSourceRow> {
    const row = await this.repository.findByIdAccessible(id, getTenantId())
    if (row === null) throw new BusinessException(404, `数据源不存在: ${id}`)
    return row
  }

  /**
   * 内建保护：`tenant_id = BUILT_IN_TENANT` 的预置行不允许修改/删除/禁用。
   * enable 不拦（对已 ENABLED 的内建行是幂等空操作，且拦了反而让前端开关卡死）。
   */
  private requireNotBuiltIn(row: DataSourceRow, action: string): void {
    if (row.tenant_id === BUILT_IN_TENANT) {
      throw new BusinessException(400, `系统内建数据源不允许${action}: ${row.name}`)
    }
  }

  /** 统计引用指定数据源的页面数（列 ∪ schema）。 */
  private async countRefs(tenantId: string, dataSourceId: string): Promise<number> {
    const { rows: columnPages } = await this.pageDefRepository.findPage(
      tenantId,
      { status: null, name: null, type: null, dataSourceId },
      0,
      Number.MAX_SAFE_INTEGER,
    )
    if (columnPages.length > 0) return columnPages.length

    // PAGE 类型页面的引用声明在 schema.dataSources[].refId（dataSourceId 列为空），需扫描；
    // 页面软删除（ARCHIVED）后不再使用，其 schema 引用不阻塞删除
    const { rows: pageTypePages } = await this.pageDefRepository.findPage(
      tenantId,
      { status: null, name: null, type: 'PAGE' },
      0,
      Number.MAX_SAFE_INTEGER,
    )
    let schemaRefs = 0
    for (const page of pageTypePages) {
      if (page.status === 'ARCHIVED') continue
      if (schemaRefsDataSource(page.schema, dataSourceId)) schemaRefs++
    }
    return schemaRefs
  }

  private async requirePublishedForm(tenantId: string, formKey: string): Promise<void> {
    const published = await this.formDefRepository.findLatestPublishedByKey(formKey, tenantId)
    if (published === null) {
      throw new BusinessException(400, `绑定的表单未发布，无法启用: ${formKey}`)
    }
  }

  private async requireWorkflowForm(tenantId: string, formKey: string): Promise<void> {
    if (!(await this.formDefRepository.existsByKey(formKey, tenantId))) {
      throw new BusinessException(400, `表单不存在: ${formKey}`)
    }
    const published = await this.formDefRepository.findLatestPublishedByKey(formKey, tenantId)
    if (published === null) {
      throw new BusinessException(400, `工作流表单必须先发布: ${formKey}`)
    }
    if (published.type === 'BUSINESS') {
      throw new BusinessException(400, `业务表单不可配置为工作流表单数据源: ${formKey}`)
    }
  }

  /** 按类型校验必填项（对齐 Java `validateRequiredFields`，错误消息逐字一致）。 */
  private validateRequiredFields(
    type: string,
    formKey: string | null,
    sourceKey: string | null,
    params: string | null,
  ): void {
    if (type === TYPE_FORM || type === TYPE_WORKFLOW) {
      if (formKey === null || formKey.trim() === '') {
        throw new BusinessException(400, `${type} 类型数据源必须绑定表单 formKey`)
      }
      return
    }
    if (type === TYPE_SYSTEM || type === TYPE_API || type === TYPE_SQL) {
      if (sourceKey === null || sourceKey.trim() === '') {
        throw new BusinessException(400, `${type} 类型数据源必须填写 sourceKey`)
      }
      if (type === TYPE_SYSTEM && !SYSTEM_SOURCE_KEYS.has(sourceKey)) {
        throw new BusinessException(400, `未注册的系统数据源: ${sourceKey}`)
      }
      if (type === TYPE_API) {
        // LookupFetchConfig 契约：params 须为 JSON 对象且 action 必填
        if (params === null || params.trim() === '') {
          throw new BusinessException(400, 'API 数据源参数 params 必须包含 action（API 路径）')
        }
        let parsed: unknown
        try {
          parsed = JSON.parse(params)
        } catch (error) {
          throw new BusinessException(
            400,
            `API 数据源参数 params 必须是合法 JSON: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new BusinessException(400, 'API 数据源参数 params 必须是 JSON 对象')
        }
        const action = (parsed as Record<string, unknown>).action
        if (action === null || action === undefined || String(action).trim() === '') {
          throw new BusinessException(400, 'API 数据源参数 params 必须包含 action（API 路径）')
        }
      }
      // SQL：仅要求 sourceKey（query 配置在 params 中，DRAFT 阶段可为空）
    }
  }

  /**
   * FORM 数据源 `params` 的 `queryMode` 配置段校验。
   *
   * 无 queryMode 段直接返回（单表查询，向后兼容）；
   * `config` 校验 joins；`sql` 复用 `SqlTemplateEngine.validate`（SELECT / `:tenantId` /
   * 列匹配 / 参数白名单）；未知模式 → 400。
   *
   * ⚠️ `validate` 抛的是 `IllegalArgumentException` 形态（HTTP 400），这里统一转成
   *    `BusinessException(400, 同文案)` —— 两条路径的错误码一致，且消息逐字保留。
   */
  private async validateFormQueryConfig(params: string | null): Promise<void> {
    if (params === null || params.trim() === '') return
    let root: unknown
    try {
      root = JSON.parse(params)
    } catch (error) {
      throw new BusinessException(
        400,
        `数据源参数 params 必须是合法 JSON: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    if (root === null || typeof root !== 'object' || Array.isArray(root)) {
      throw new BusinessException(400, '数据源参数 params 必须是 JSON 对象')
    }
    const record = root as Record<string, unknown>
    const modeNode = record.queryMode
    if (modeNode === null || modeNode === undefined || String(modeNode).trim() === '') return
    const mode = String(modeNode)
    if (mode === 'config') {
      await this.validateConfigJoins(record.joins)
      return
    }
    if (mode === 'sql') {
      this.validateSqlConfig(record)
      return
    }
    throw new BusinessException(400, `未知查询模式 queryMode: ${mode}（支持 config / sql）`)
  }

  /** sql 模式：`query`/`columns`/参数白名单复用 `SqlTemplateEngine.validate`。 */
  private validateSqlConfig(root: Record<string, unknown>): void {
    const query = textOf(root, 'query')
    const columns = parseSqlColumns(root.columns)
    const declaredParams = parseStringList(root.params)
    try {
      validate(query, columns, declaredParams)
    } catch (error) {
      throw new BusinessException(400, error instanceof Error ? error.message : String(error))
    }
  }

  /** config 模式：joins[] 结构校验（别名/目标表/字段/虚拟列唯一性）。
   *
   * alias 可缺省：前端不录入，由运行时 parseJoins 自动分配（j1/j2/...）；
   * 传入则校验格式与唯一性。目标表支持内建数据源（join-target-catalog 白名单）：
   * SYSTEM 目标不查 form_def，且 foreignField/joinField 必须是目录内物理列。 */
  private async validateConfigJoins(joins: unknown): Promise<void> {
    if (!Array.isArray(joins) || joins.length === 0) {
      throw new BusinessException(400, 'queryMode=config 时必须配置至少一个关联 joins')
    }
    const tenantId = getTenantId()
    const virtualKeys = new Set<string>()
    const aliases = new Set<string>()
    let idx = 0
    for (const item of joins) {
      idx++
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        throw new BusinessException(400, `joins 第 ${idx} 项必须是对象`)
      }
      const join = item as Record<string, unknown>
      const alias = textOf(join, 'alias')
      if (alias !== null) {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias)) {
          throw new BusinessException(400, `joins 第 ${idx} 项 alias 非法: ${alias}`)
        }
        if (aliases.has(alias)) {
          throw new BusinessException(400, `joins 第 ${idx} 项 alias 重复: ${alias}`)
        }
        aliases.add(alias)
      }
      const targetFormKey = textOf(join, 'targetFormKey')
      if (targetFormKey === null || targetFormKey.trim() === '') {
        throw new BusinessException(400, `joins 第 ${idx} 项必须指定目标表 targetFormKey`)
      }
      let foreignCandidates: ReadonlySet<string> | null = null
      if (isJoinTargetSystemKey(targetFormKey)) {
        // 内建目标：物理列白名单来自 join-target-catalog（不走 form_def）
        const system = joinTargetSystemByKey(targetFormKey)
        foreignCandidates = system !== null ? new Set(system.columns.map((c) => c.key)) : null
      } else {
        if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(targetFormKey)) {
          throw new BusinessException(400, `非法关联目标: ${targetFormKey}`)
        }
        if (!(await this.formDefRepository.existsByKey(targetFormKey, tenantId))) {
          throw new BusinessException(400, `目标表单不存在: ${targetFormKey}`)
        }
      }
      const foreignField = textOf(join, 'foreignField')
      requireJoinField(join, 'foreignField', '目标表关联字段', idx)
      requireJoinField(join, 'localField', '主表关联字段', idx)
      requireJoinField(join, 'joinField', '显示字段', idx)
      if (foreignCandidates !== null) {
        if (foreignField === null || !foreignCandidates.has(foreignField)) {
          throw new BusinessException(400, `joins 第 ${idx} 项目标表关联字段不在内建数据源物理列中: ${String(foreignField)}`)
        }
        const joinFieldValue = textOf(join, 'joinField')
        if (joinFieldValue === null || !foreignCandidates.has(joinFieldValue)) {
          throw new BusinessException(400, `joins 第 ${idx} 项显示字段不在内建数据源物理列中: ${String(joinFieldValue)}`)
        }
      }
      requireJoinField(join, 'label', '显示名称', idx)
      const virtualKey = textOf(join, 'virtualKey')
      if (virtualKey === null || virtualKey.trim() === '') {
        throw new BusinessException(400, `joins 第 ${idx} 项必须指定虚拟列标识 virtualKey`)
      }
      if (virtualKeys.has(virtualKey)) {
        throw new BusinessException(400, `虚拟列 virtualKey 重复: ${virtualKey}`)
      }
      virtualKeys.add(virtualKey)
    }
  }
}

/** 单个 join 的必填字段校验（对齐 Java `requireJoinField`）。 */
function requireJoinField(
  join: Record<string, unknown>,
  field: string,
  label: string,
  idx: number,
): void {
  const value = textOf(join, field)
  if (value === null || value.trim() === '') {
    throw new BusinessException(400, `joins 第 ${idx} 项必须指定${label} ${field}`)
  }
}

function textOf(node: Record<string, unknown>, field: string): string | null {
  const value = node[field]
  return value === null || value === undefined ? null : String(value)
}

/** `params` 是否含 `queryMode` 配置段（非合法 JSON 视为无，交给后续校验报错）。 */
export function hasQueryModeSegment(params: string | null): boolean {
  if (params === null || params.trim() === '') return false
  try {
    const root: unknown = JSON.parse(params)
    return (
      root !== null &&
      typeof root === 'object' &&
      !Array.isArray(root) &&
      'queryMode' in (root as Record<string, unknown>)
    )
  } catch {
    return false
  }
}

/**
 * 为 FORM/SYSTEM 数据源生成 `params` JSON（只读配置，UI 不可编辑）。
 *
 * ⚠️ 这是一个**字符串**字段，且 Java 用 `ObjectNode.toString()` 产出**紧凑 JSON**、
 *    键顺序是插入顺序。所以下面的书写顺序就是契约的一部分 —— 不能改写键的顺序，
 *    也不能用 `JSON.stringify` 之外的格式化方式。
 */
export function generateParams(
  type: string,
  formKey: string,
  sourceKey: string | null,
): string {
  if (type === TYPE_FORM) {
    const base = `/api/v1/biz-data/${formKey}`
    return JSON.stringify({
      list: { action: base, method: 'GET', parse: 'records', totalParse: 'total' },
      create: { action: base, method: 'POST' },
      get: { action: `${base}/{id}`, method: 'GET' },
      update: { action: `${base}/{id}`, method: 'PUT' },
      delete: { action: `${base}/{id}`, method: 'DELETE' },
    })
  }
  if (type === TYPE_SYSTEM) {
    return JSON.stringify({
      list: { action: `/api/v1/internal/system/${mapSystemInternalKey(sourceKey)}`, method: 'GET' },
    })
  }
  return JSON.stringify({})
}

/**
 * sql 模式声明列解析（对齐 Java `DataSourceDefinitionService.parseSqlColumns`）。
 *
 * ⚠️ `ref = key`（不是 `m.key`）—— 这是 `SqlTemplateEngine` 的语义：
 *    引用的是外层子查询的输出列名。布尔字段用 `boolVal`（仅 `true` 算 true）。
 */
function parseSqlColumns(node: unknown): QueryColumn[] {
  const out: QueryColumn[] = []
  if (!Array.isArray(node)) return out
  for (const item of node) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    const key = textOf(record, 'key')
    out.push({
      key: String(key),
      ref: String(key),
      columnType: textOf(record, 'columnType') ?? '',
      sortable: record.sortable === true,
      filterable: record.filterable === true,
    })
  }
  return out
}

/** 字符串数组解析（对齐 Java `parseStringList`：只收非空白文本项）。 */
function parseStringList(node: unknown): string[] {
  const out: string[] = []
  if (!Array.isArray(node)) return out
  for (const item of node) {
    if (typeof item === 'string' && item.trim() !== '') out.push(item)
  }
  return out
}

/**
 * sourceKey → internal API 路径段（dept-tree→dept-tree，user-tree→users；
 * 新 6 个见 `mapSystemInternalPath`）。未知 key 报错文案逐字保留。
 */
function mapSystemInternalKey(sourceKey: string | null): string {
  const mapped = mapSystemInternalPath(sourceKey)
  if (mapped === '') {
    throw new BusinessException(400, `未注册的系统数据源: ${String(sourceKey)}`)
  }
  return mapped
}

/** 合并：生成端点 params 之上叠加 queryMode 配置段。 */
export function mergeQueryConfig(generated: string, params: string): string {
  let out: Record<string, unknown>
  let input: Record<string, unknown>
  try {
    out = JSON.parse(generated) as Record<string, unknown>
    input = JSON.parse(params) as Record<string, unknown>
  } catch (error) {
    throw new BusinessException(
      400,
      `数据源参数 params 必须是合法 JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  for (const field of ['queryMode', 'joins', 'query', 'columns', 'params']) {
    if (field in input) out[field] = input[field]
  }
  return JSON.stringify(out)
}

/** schema 的 `dataSources[].refId` 是否指向指定数据源。 */
export function schemaRefsDataSource(schema: string | null, dataSourceId: string): boolean {
  if (schema === null || schema.trim() === '') return false
  try {
    const root: unknown = JSON.parse(schema)
    if (root === null || typeof root !== 'object') return false
    const dataSources = (root as Record<string, unknown>).dataSources
    if (!Array.isArray(dataSources)) return false
    return dataSources.some((ds) => {
      if (ds === null || typeof ds !== 'object') return false
      const refId = (ds as Record<string, unknown>).refId
      return refId !== null && refId !== undefined && String(refId) === dataSourceId
    })
  } catch {
    return false
  }
}

/**
 * 出参 —— 对齐 Java `DataSourceController.toDTO`：写端点与读端点返回**同一个**
 * `DataSourceDTO`（11 个字段）。
 *
 * ⚠️ 实测修正：先前这里返回「实体」并多带一个 `formId`，是**错的**。
 *    `DataSourceDefinition` 实体确实有 `formId` 列，但控制器每一个端点都走
 *    `toDTO(...)`，而 `toDTO` 只搬运上面这 11 个字段、**从不设 formId**
 *    （`DataSourceDTO` 里根本没有该字段）。golden `dswCreate` 的键集合即 11 个。
 *    注意实体**有** `formId` 这一点仍属实 —— 它只存在于库里，不出现在任何响应中。
 *
 * ⚠️ `formId` 这一列本实现仍会写：`form_id` 由表单事件同步那条路径设置，
 *    见 `DataSourceRepository.insertDefinition` 的调用方。
 */
function toDto(row: DataSourceRow): Record<string, unknown> {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    type: row.type,
    formKey: row.form_key,
    sourceKey: row.source_key,
    params: row.params,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
