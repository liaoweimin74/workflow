import { Injectable } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { PageResponse } from '../../../common/domain/page-response'
import { BusinessException } from '../../../common/exception/business-exception'
import { assertPageSize, blankToNull } from '../../../framework/http/query-params'
import { getTenantId } from '../../../framework/tenant/tenant-context'
import { PageValidator } from '../page-validator'
import { ViewCompiler } from '../view-compiler'
import {
  PageDefinitionRepository,
  type PageDefinitionRow,
} from '../repository/page-definition.repository'

/**
 * 页面定义 DTO，逐字对齐 Java `com.workflow.api.dto.PageDefinitionDTO`（列表用，12 个字段）。
 *
 * ⚠️ 详情端点（`PageDefinitionDetailDTO`）多一个 `schema` 字段，是**另一个类型**。
 *    两者不能合并 —— 列表响应里出现 `schema` 就是契约破损。
 */
export interface PageDefinitionVO {
  id: string
  name: string
  key: string
  type: string
  formKey: string | null
  dataSourceId: string | null
  version: number
  status: string
  publishedVersion: number | null
  createdBy: string | null
  createdAt: Date | null
  updatedAt: Date | null
}

function toVO(row: PageDefinitionRow): PageDefinitionVO {
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    type: row.type,
    formKey: row.form_key,
    dataSourceId: row.data_source_id,
    version: row.version,
    status: row.status,
    publishedVersion: row.published_version,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * 页面定义详情 DTO（12 个字段 + `schema`）。
 *
 * ⚠️ 比列表 DTO 多一个 `schema` —— 列表响应里出现 `schema` 就是契约破损，
 *    详情响应里缺 `schema` 同样是。两个类型刻意分开声明。
 */
export interface PageDefinitionDetailVO extends PageDefinitionVO {
  schema: string | null
}

function toDetailVO(row: PageDefinitionRow): PageDefinitionDetailVO {
  return { ...toVO(row), schema: row.schema }
}

/**
 * 写端点（create / update / publish）返回的形状 —— 就是 **JPA 实体本身**。
 *
 * ⚠️ 比详情 DTO **多一个 `tenantId`**（实体上有、`PageDefinitionDetailDTO` 上没有）。
 *    这是三个形状而不是两个：
 *      - 列表 → `PageDefinitionDTO`（12 字段，无 schema / tenantId）
 *      - 详情 → `PageDefinitionDetailDTO`（13 字段，有 schema，无 tenantId）
 *      - 写端点 → 实体（14 字段，schema 与 tenantId 都有）
 *    首版把写端点也映射成详情 DTO，契约当场报出 5 步
 *    `$.data.tenantId: 缺少字段（Java 有 "default"）` —— 只差这一个字段。
 */
export interface PageDefinitionEntityVO extends PageDefinitionDetailVO {
  tenantId: string
}

function toEntityVO(row: PageDefinitionRow): PageDefinitionEntityVO {
  return { ...toDetailVO(row), tenantId: row.tenant_id }
}

/**
 * schema 语义比较（对齐 Java `PageDefinitionService.schemaEquals`）。
 *
 * 三步：空/空白 → `{}`；剔除**顶层**编译产物 `rule` / `option`；再做结构化比较。
 *
 * ⚠️ 剔除是关键：发布时编译产物会被合并进 schema，直接比较会把"同一份声明"
 *    误判成"已变化"。
 * ⚠️ 比较必须**忽略对象键顺序**（Jackson 的 `ObjectNode.equals` 比较的是底层 map，
 *    与书写顺序无关），但**数组顺序敏感**。所以走 canonical 序列化而不是 `===`。
 * ⚠️ 已知微小偏差：Jackson 里 `1` 与 `1.0` 是**不同**的节点（`IntNode` vs `DoubleNode`），
 *    而 JS 的 `JSON.parse` 把两者都变成 `number` ⇒ 这里会判为相同。
 *    该情形只在"人工手写 schema 且数字写法不同"时出现，无 golden 覆盖，记入规格 §9。
 */
export function schemaEquals(a: string | null, b: string | null): boolean {
  let na: unknown
  let nb: unknown
  try {
    na = JSON.parse(a === null || a.trim() === '' ? '{}' : a)
    nb = JSON.parse(b === null || b.trim() === '' ? '{}' : b)
  } catch {
    return false
  }
  return canonicalize(stripCompiled(na)) === canonicalize(stripCompiled(nb))
}

/**
 * schema 是否已含编译产物（对齐 Java `schemaHasCompiled`）：解析成功且是对象且**有 `rule` 键**。
 *
 * ⚠️ 解析失败 → false（不抛错）：库里的 schema 坏掉时应当退回「重新编译」，
 *    而不是让预览直接 500。
 */
function schemaHasCompiled(schema: string): boolean {
  try {
    const parsed: unknown = JSON.parse(schema.trim() === '' ? '{}' : schema)
    return (
      parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      'rule' in (parsed as Record<string, unknown>)
    )
  } catch {
    return false
  }
}

/** 移除 schema 顶层的编译产物键（`rule` / `option`），仅保留用户声明内容。 */
function stripCompiled(node: unknown): unknown {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return node
  const copy: Record<string, unknown> = { ...(node as Record<string, unknown>) }
  delete copy.rule
  delete copy.option
  return copy
}

/**
 * 把编译产物 `{rule, option, display}` 合并进声明 schema（对齐 Java `mergeCompiled`）。
 *
 * ⚠️ 结果是**字符串**，而字符串是逐字比对的 ⇒ 这里的键顺序就是契约：
 *    - 原 schema 的键**保持原位置原顺序**；
 *    - `rule` / `option` 若已存在 → **原地替换**；不存在 → **追加到末尾**；
 *    - `display` 同理（`compile` 总是带它，所以它通常出现在最后）。
 *    JS 对象对「已存在键赋值」保持位置、对新键追加到末尾，与 Jackson 的 `ObjectNode.set/put`
 *    语义一致 —— 这正是可以直接用赋值实现的原因。
 */
function mergeCompiled(schema: string | null, compiled: string): string {
  let root: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(schema === null || schema.trim() === '' ? '{}' : schema)
    root =
      parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {}
  } catch {
    throw new BusinessException(400, '视图编译产物合并失败')
  }

  let compiledNode: Record<string, unknown>
  try {
    compiledNode = JSON.parse(compiled) as Record<string, unknown>
  } catch {
    throw new BusinessException(400, '视图编译产物合并失败')
  }

  if ('rule' in compiledNode) root.rule = compiledNode.rule
  if ('option' in compiledNode) root.option = compiledNode.option
  if ('display' in compiledNode) root.display = compiledNode.display
  return JSON.stringify(root)
}

/** 对象键排序后的规范 JSON（数组保持原序）——用来做"忽略键顺序"的深度比较。 */
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const parts = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    return `{${parts.join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/**
 * 页面定义服务（对齐 Java `PageDefinitionService`）。
 *
 * 读侧（list / getById / getPublishedByKey）与写侧（create / update / delete / publish）
 * 都在这里。
 *
 * ⚠️ `getByKey` / `getVersions` / `getPublishedVersion` 三个方法**没有任何端点调用**，
 *    因此不实现。**澄清两件容易被误读的事**（2026-09-18 核实）：
 *    - 页面**预览**（`GET /pages/{key}/definition?preview=true`）**已实现**，
 *      它就是 `getByKey` 那条端点的 preview 分支（预览时编译但不落库，契约场景
 *      「VIEW 页面编译与取数」覆盖）—— 与这里的 `getVersions` 无关；
 *    - **版本列表端点在 Java 侧根本不存在**（`endpoints.generated.json` 里 `/pages` 只有
 *      list/getById/definition/menus/data 等 12 条），所以不是"尚未迁移"，而是"本来就没有"。
 */
@Injectable()
export class PageDefinitionService {
  constructor(
    private readonly repository: PageDefinitionRepository,
    private readonly validator: PageValidator,
    private readonly compiler: ViewCompiler,
  ) {}

  /**
   * 分页查询页面定义列表。
   *
   * `page` 按 Java 用 `Math.max(page, 1)` 归一（1 基）；`size` 直接透传，
   * 与 `DataSourceService.list` 的取舍一致（不做会让状态码分叉的兜底）。
   */
  async list(
    page: number,
    size: number,
    status: string | null,
    name: string | null,
    type: string | null,
  ): Promise<PageResponse<PageDefinitionVO>> {
    // Java 走 `PageRequest.of(Math.max(page, 1) - 1, size)` ⇒ size < 1 → HTTP 400
    assertPageSize(size)
    const tenantId = getTenantId()
    const normalizedPage = Math.max(page, 1)
    const { rows, total } = await this.repository.findPage(
      tenantId,
      { status: blankToNull(status), name: blankToNull(name), type: blankToNull(type) },
      (normalizedPage - 1) * size,
      size,
    )
    return new PageResponse<PageDefinitionVO>(rows.map(toVO), normalizedPage, size, total)
  }

  /** 按 id 取页面定义详情（含 schema）；不存在 → 404。 */
  async getById(id: string): Promise<PageDefinitionDetailVO> {
    const row = await this.repository.findByIdAndTenantId(id, getTenantId())
    if (row === null) {
      throw new BusinessException(404, `页面不存在: ${id}`)
    }
    return toDetailVO(row)
  }

  /**
   * 按 key 取**已发布**页面定义（含 schema）。
   *
   * ⚠️ 404 消息与 `getById` **不同**：这里是「页面未发布或不存在」。
   *    两条消息都要逐字对齐 Java，不能图省事共用一个。
   *
   * 调用方需先过 `PageAccessGuard`（Java 的 `/definition` 端点在不带
   * `preview=true` 时会校验页面访问权限）。
   */
  async getPublishedByKey(key: string): Promise<PageDefinitionDetailVO> {
    const row = await this.repository.findPublishedByKey(key, getTenantId())
    if (row === null) {
      throw new BusinessException(404, `页面未发布或不存在: ${key}`)
    }
    return toDetailVO(row)
  }

  /**
   * 预览：按 key 取最新定义，**未发布的 DRAFT 视图动态编译**（对齐 Java `getPreviewByKey`）。
   *
   * 与 `publish` 的唯一区别：编译结果**不落库**（不调 save），只返回内存里合并后的 schema，
   * 好让设计器的预览效果与发布后一致。
   *
   * 四个分支的顺序照抄 Java：
   *   ① 非 VIEW → 原样返回（PAGE 不做编译）；
   *   ② schema 里**已经有 `rule`**（发布过或残留）→ 原样返回，不重复编译；
   *   ③ 校验（`validateForPublish`）+ 取绑定列 → 编译；
   *   ④ 合并进 schema 后返回（**不持久化**）。
   *
   * ⚠️ 调用方（控制器）在 `preview=true` 时**不做页面访问校验** —— 预览正是给还没挂菜单的
   *    DRAFT 页面用的（Java 的 `/definition` 端点就是这么分流的）。
   */
  async getPreviewByKey(key: string): Promise<PageDefinitionDetailVO> {
    const row = await this.repository.findLatestByKey(getTenantId(), key)
    if (row === null) {
      throw new BusinessException(404, `页面不存在: ${key}`)
    }
    if (row.type !== 'VIEW') return toDetailVO(row)
    if (row.schema !== null && schemaHasCompiled(row.schema)) return toDetailVO(row)

    await this.validator.validateForPublish(row)
    const bindColumns = await this.validator.resolveBindColumns(row)
    const compiled = this.compiler.compile(row, bindColumns)
    // ⚠️ 只改副本，**不写库** —— 预览不产生副作用（golden 用「预览之后再读详情，
    //    schema 里仍然没有 rule」钉住了这一点）。
    return toDetailVO({ ...row, schema: mergeCompiled(row.schema, compiled) })
  }

  // ==================== 写路径 ====================
  /**
   * 创建页面定义（`POST /pages`，默认 `status=DRAFT`、`version=1`）。
   *
   * ⚠️ `type` 缺省/空白 → **VIEW**（Java 的三元表达式）。
   * ⚠️ key 唯一性用 `existsByTenantIdAndKey`，它**不过滤 status** ——
   *    软删除（ARCHIVED）的行照样占着 key。
   * ⚠️ 返回的是**实体**（含 `schema`、`tenantId`），不是列表 DTO；
   *    端点间形状不统一是契约的一部分。
   */
  async create(request: {
    name: string | null
    key: string | null
    type: string | null
    formKey: string | null
    dataSourceId: string | null
  }): Promise<PageDefinitionEntityVO> {
    const tenantId = getTenantId()
    const key = request.key === null ? '' : request.key
    if (await this.repository.existsByTenantIdAndKey(tenantId, key)) {
      throw new BusinessException(400, `页面 key 已存在: ${key}`)
    }

    const now = new Date()
    const row: PageDefinitionRow = {
      id: randomBytes(16).toString('hex'),
      tenant_id: tenantId,
      name: request.name === null ? '' : request.name,
      key,
      type: request.type === null || request.type.trim() === '' ? 'VIEW' : request.type,
      form_key: request.formKey,
      data_source_id: request.dataSourceId,
      schema: null,
      version: 1,
      status: 'DRAFT',
      published_version: null,
      created_by: null,
      created_at: now,
      updated_at: now,
    }
    await this.repository.insert(row)
    // ⚠️ 这里**回读**而不是直接返回构造出来的行：Java 返回的是 JPA 保存后的实体，
    //    时间戳由 `@PrePersist`/数据库决定。回读保证响应与库里逐字一致
    //    （golden 显示 create 的时间戳是 `<TIME>`，即真实存在的值）。
    return toEntityVO(await this.requireById(row.id, tenantId))
  }

  /**
   * 原地更新（`PUT /pages/{id}`）：`null` 表示不更新该字段，**不改状态、不加版本**。
   *
   * ⚠️ `key` 也能改，而且**不查重**（Java 就是这么写的）—— 不额外补校验，
   *    否则会出现「Java 允许、Node 拒绝」的分叉。
   */
  async update(
    id: string,
    request: {
      name: string | null
      key: string | null
      schema: string | null
      formKey: string | null
      dataSourceId: string | null
    },
  ): Promise<PageDefinitionEntityVO> {
    const tenantId = getTenantId()
    const current = await this.requireById(id, tenantId)

    const patch: PageDefinitionRow = {
      ...current,
      name: request.name === null ? current.name : request.name,
      key: request.key === null ? current.key : request.key,
      schema: request.schema === null ? current.schema : request.schema,
      form_key: request.formKey === null ? current.form_key : request.formKey,
      data_source_id:
        request.dataSourceId === null ? current.data_source_id : request.dataSourceId,
    }
    await this.repository.save(patch, new Date())
    return toEntityVO(await this.requireById(id, tenantId))
  }

  /**
   * 删除页面定义（**软删除**：`status=ARCHIVED`；已发布页面拒绝）。
   *
   * ⚠️ 行不删 —— 所以同一个 key 之后再也建不出来（见 `create` 的唯一性判定）。
   */
  async remove(id: string): Promise<void> {
    const tenantId = getTenantId()
    const current = await this.requireById(id, tenantId)
    if (current.status === 'PUBLISHED') {
      throw new BusinessException(400, '已发布的页面不能删除')
    }
    await this.repository.save({ ...current, status: 'ARCHIVED' }, new Date())
  }

  /**
   * 发布页面（`POST /pages/{id}/publish`）。
   *
   * 流程（顺序照抄 Java）：
   *   行锁取行（404）→ ARCHIVED 拒绝 → **内容未变化**拒绝（同 key 排除自身的最新 PUBLISHED
   *   做「剔除编译产物后」的语义比较）→ 校验（PAGE 走基础校验）→ 旧 PUBLISHED 降 ARCHIVED
   *   → 当前置 PUBLISHED 并写 `publishedVersion`。
   *
   * ⚠️ `type=VIEW` 会编译视图（`resolveBindColumns` + `ViewCompiler.compile`）把编译产物
   *    `{rule, option}` 合并进 schema（**已迁移**，见下方 `current.type === 'VIEW'` 分支；
   *    契约场景「VIEW 页面编译与取数」24 步钉住，规格 U32 关闭）。
   *    顺序与 Java 一致：**校验之后、写库之前**编译 —— 这样非法 schema 的报错仍与 Java 相同。
   *
   * ⚠️ Java 用 `synchronized(publishLocks.computeIfAbsent(...))` 做**按 key 的进程内串行化**，
   *    因为 `findByIdForUpdate` 只锁单行、挡不住「同 key 不同 id」的并发发布。
   *    单实例 Node 里 `forUpdate()` 已经是数据库级锁，且发布是短事务；这里**不加**进程内锁，
   *    记入规格（多实例部署时才需要）。
   */
  async publish(id: string): Promise<PageDefinitionEntityVO> {
    const tenantId = getTenantId()
    const current = await this.repository.findByIdForUpdate(id, tenantId)
    if (current === null) {
      throw new BusinessException(404, `页面不存在: ${id}`)
    }
    if (current.status === 'ARCHIVED') {
      throw new BusinessException(400, '已归档页面不能发布')
    }

    // 内容未变化拒绝：与同 key 最新已发布版本（排除自身）比较 schema
    const oldPublished = await this.repository.findPublishedByKeyExcluding(tenantId, current.key, id)
    if (oldPublished !== null && schemaEquals(current.schema, oldPublished.schema)) {
      throw new BusinessException(400, '页面内容与已发布版本未变化，无需发布')
    }

    await this.validator.validateForPublish(current)
    if (current.type === 'VIEW') {
      const bindColumns = await this.validator.resolveBindColumns(current)
      const compiled = this.compiler.compile(current, bindColumns)
      current.schema = mergeCompiled(current.schema, compiled)
    }

    if (oldPublished !== null) {
      await this.repository.save({ ...oldPublished, status: 'ARCHIVED' }, new Date())
    }
    await this.repository.save(
      { ...current, status: 'PUBLISHED', published_version: current.version },
      new Date(),
    )
    return toEntityVO(await this.requireById(id, tenantId))
  }

  /** 取页面定义（租户内）；不存在 → 404「页面不存在: <id>」。 */
  private async requireById(id: string, tenantId: string): Promise<PageDefinitionRow> {
    const row = await this.repository.findByIdAndTenantId(id, tenantId)
    if (row === null) {
      throw new BusinessException(404, `页面不存在: ${id}`)
    }
    return row
  }
}
