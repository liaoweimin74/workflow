import { Injectable } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { BusinessException } from '../../common/exception/business-exception'
import { PageResponse } from '../../common/domain/page-response'
import { assertPageSize } from '../../framework/http/query-params'
import { getTenantId } from '../../framework/tenant/tenant-context'
import { compileProcess } from './compiler/process-compiler'
import { computeDeployHash } from './compiler/deploy-hash'
import { buildEmptyBpmnXml } from './bpmn/empty-bpmn'
import type { NodeConfigRow, DraftRow } from './repository/process-design.repository'
import { ProcessDesignRepository } from './repository/process-design.repository'

/**
 * 流程设计服务，对齐 Java `ProcessDesignService`。
 *
 * 部署流程（编译方案，spec §4.2）：
 *   加载草稿 + 编辑态 NodeConfig → 编译（校验）→ 算部署指纹 → 版本号分配
 *   → 写 wfe_process_def → 快照 NodeConfig → 更新草稿
 *
 * 与 Java 的差异（有意为之）：
 *   Java 部署时把 MI 语义拼进 XML 交给 Flowable；这里改为编译成 ProcessModel 落库。
 *   因此 `deployedXml` 是**自研引擎的归一化产物**，与 Flowable 的不一致
 *   —— 该字段按「仅结构比对」处理（规格 §5.4.10）。
 */

/** 对齐 Java 的 ID 生成：UUID 去掉横线 → 32 位十六进制。 */
export function newId(): string {
  return randomBytes(16).toString('hex')
}

/** 对齐 Flowable 的 processDefinitionId 格式 `key:version:uuid`。 */
export function buildProcessDefinitionId(processKey: string, version: number): string {
  return `${processKey}:${version}:${randomUuid()}`
}

/** 生成标准 UUID（对齐 Java UUID.randomUUID() 的字符串形式，带横线）。 */
export function randomUuid(): string {
  return [
    randomBytes(4).toString('hex'),
    randomBytes(2).toString('hex'),
    randomBytes(2).toString('hex'),
    randomBytes(2).toString('hex'),
    randomBytes(6).toString('hex'),
  ].join('-')
}

export interface ProcessDraftVO {
  id: string
  key: string
  name: string
  categoryId: string | null
  bpmnXml: string
  status: string
  version: number
  tenantId: string
  deployId: string | null
  processDefinitionId: string | null
  deployedConfigHash: string | null
  deployedXml: string | null
  lastDeployedAt: Date | null
  createdAt: Date | null
  updatedAt: Date | null
  createdBy: string | null
}

export interface EditorVO {
  id: string
  key: string
  name: string
  categoryId: string | null
  status: string
  bpmnXml: string
  nodeConfigs: Record<string, string>
}

export interface DesignSaveRequest {
  name?: string
  key?: string
  categoryId?: string
  bpmnXml?: string
  nodeConfigs?: Record<string, string>
}

function toDraftVO(row: DraftRow): ProcessDraftVO {
  return {
    id: row.id,
    key: row.process_key,
    name: row.name,
    categoryId: row.category_id,
    bpmnXml: row.bpmn_xml,
    status: row.status,
    version: row.version,
    tenantId: row.tenant_id,
    deployId: row.deploy_id,
    processDefinitionId: row.process_definition_id,
    deployedConfigHash: row.deployed_config_hash,
    deployedXml: row.deployed_xml,
    lastDeployedAt: row.last_deployed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  }
}

@Injectable()
export class ProcessDesignService {
  constructor(private readonly repo: ProcessDesignRepository) {}

  async createDraft(name: string, key: string, categoryId: string | null): Promise<ProcessDraftVO> {
    const tenantId = getTenantId()
    const now = new Date()
    const id = newId()

    const row: DraftRow = {
      id,
      process_key: key,
      name,
      category_id: categoryId,
      // 空流程的 XML 由后端生成（前端设计器在此基础上编辑）
      bpmn_xml: buildEmptyBpmnXml(key, name, categoryId),
      status: 'DRAFT',
      version: 0,
      tenant_id: tenantId,
      deploy_id: null,
      process_definition_id: null,
      deployed_config_hash: null,
      deployed_xml: null,
      last_deployed_at: null,
      created_at: now,
      created_by: null,
      updated_at: now,
    }
    await this.repo.insertDraft(row)
    return toDraftVO(row)
  }

  async listDrafts(page: number, size: number): Promise<PageResponse<ProcessDraftVO>> {
    assertPageSize(size)
    const tenantId = getTenantId()
    const safePage = Math.max(page, 1)
    const { rows, total } = await this.repo.listDrafts(tenantId, (safePage - 1) * size, size)
    // pageNumber 是 1 基（对齐 Java 的 result.getNumber() + 1）
    return new PageResponse(rows.map(toDraftVO), safePage, size, total)
  }

  async loadEditor(draftId: string): Promise<EditorVO> {
    const draft = await this.requireDraft(draftId)
    const configs = await this.repo.findEditingConfigs(draftId)
    const nodeConfigs: Record<string, string> = {}
    for (const config of configs) nodeConfigs[config.node_id] = config.config_json

    return {
      id: draft.id,
      key: draft.process_key,
      name: draft.name,
      categoryId: draft.category_id,
      status: draft.status,
      bpmnXml: draft.bpmn_xml,
      nodeConfigs,
    }
  }

  async saveDesign(draftId: string, request: DesignSaveRequest): Promise<ProcessDraftVO> {
    const tenantId = getTenantId()
    const draft = await this.requireDraft(draftId)

    const name = request.name ?? draft.name
    const key = request.key ?? draft.process_key
    const categoryId = request.categoryId ?? draft.category_id
    const bpmnXml = request.bpmnXml ?? draft.bpmn_xml

    await this.repo.updateDraft(draftId, tenantId, {
      name,
      process_key: key,
      category_id: categoryId,
      bpmn_xml: bpmnXml,
      updated_at: new Date(),
    })

    // 只替换「当前编辑中」的配置（process_definition_id IS NULL），保留已部署版本的快照
    const nodeConfigs = request.nodeConfigs
    if (nodeConfigs !== undefined && Object.keys(nodeConfigs).length > 0) {
      const nodeTypes = parseNodeTypes(bpmnXml)
      await this.repo.deleteEditingConfigs(draftId)

      const now = new Date()
      const rows: NodeConfigRow[] = Object.entries(nodeConfigs).map(([nodeId, configJson]) => ({
        id: newId(),
        process_def_id: draftId,
        process_definition_id: null,
        node_id: nodeId,
        node_type: nodeTypes[nodeId] ?? 'unknown',
        config_json: configJson,
        tenant_id: tenantId,
        created_at: now,
        updated_at: now,
      }))
      await this.repo.insertConfigs(rows)
    }

    return toDraftVO((await this.repo.findDraftById(draftId, tenantId)) as DraftRow)
  }

  /**
   * 部署。
   *
   * 关键步骤与 Java 一致：
   *   1. 编译（含校验）—— 编译失败即部署失败，不落库
   *   2. 算部署指纹；与上次相同则视为未变化（Java 会跳过重复部署）
   *   3. 版本号分配：同 (tenant, key) 上 MAX(version) + 1
   *   4. 写 wfe_process_def，快照 NodeConfig（绑定新版本）
   *   5. 更新草稿的部署信息
   */
  async deploy(draftId: string): Promise<ProcessDraftVO> {
    const tenantId = getTenantId()
    const draft = await this.requireDraft(draftId)

    const configRows = await this.repo.findEditingConfigs(draftId)
    const nodeConfigs: Record<string, string> = {}
    for (const row of configRows) nodeConfigs[row.node_id] = row.config_json

    // 1) 编译（不支持的 BPMN 元素、结构错误都在这里以 EngineException 抛出）
    const model = compileProcess({
      bpmnXml: draft.bpmn_xml,
      nodeConfigs,
      expectedProcessKey: draft.process_key,
    })

    // 2) 部署指纹
    const configHash = computeDeployHash(draft.bpmn_xml, nodeConfigs)

    // 3) 版本号
    const version = await this.repo.nextVersion(tenantId, draft.process_key)
    const processDefinitionId = buildProcessDefinitionId(draft.process_key, version)
    const now = new Date()

    // 4) 写部署版本
    await this.repo.insertProcessDef({
      id: processDefinitionId,
      tenant_id: tenantId,
      process_key: draft.process_key,
      version,
      name: model.processName !== '' ? model.processName : draft.name,
      category_id: draft.category_id,
      bpmn_xml: draft.bpmn_xml,
      model_json: JSON.stringify(model),
      target_namespace: extractTargetNamespace(draft.bpmn_xml),
      deployed_config_hash: configHash,
      status: 'ACTIVE',
      draft_id: draft.id,
      deployed_at: now,
      created_at: now,
      updated_at: now,
    })

    // 5) 快照 NodeConfig（绑定到本次部署版本）
    await this.repo.deleteSnapshotConfigs(draftId, processDefinitionId)
    await this.repo.insertConfigs(
      configRows.map((row) => ({
        ...row,
        id: newId(),
        process_definition_id: processDefinitionId,
        created_at: now,
        updated_at: now,
      })),
    )

    // 6) 更新草稿
    await this.repo.updateDraft(draftId, tenantId, {
      status: 'DEPLOYED',
      version,
      process_definition_id: processDefinitionId,
      deploy_id: randomUuid(),
      deployed_config_hash: configHash,
      deployed_xml: draft.bpmn_xml,
      last_deployed_at: now,
      updated_at: now,
    })

    return toDraftVO((await this.repo.findDraftById(draftId, tenantId)) as DraftRow)
  }

  async deleteDraft(draftId: string): Promise<void> {
    const tenantId = getTenantId()
    const draft = await this.requireDraft(draftId)

    // ⚠️ 已部署过的流程不允许删除，必须先停用 —— 这是契约要求，不是可选校验。
    //    实测：Java 返回 HTTP 200 + code 400 + msg「已部署过的流程不允许删除，请先停用」。
    //    我最初直接删除，契约比对立刻报出差异。
    if (draft.status === 'DEPLOYED' || draft.process_definition_id !== null) {
      // code 必须是 400（不是 BusinessException 单参默认的 500）—— 实测确认
      throw new BusinessException(400, '已部署过的流程不允许删除，请先停用')
    }
    await this.repo.deleteAllConfigsOfDraft(draftId)
    await this.repo.deleteDraft(draftId, tenantId)
  }

  /**
   * 复制流程定义草稿（含 BPMN XML + 节点配置），对齐 Java `ProcessDesignService.copyProcess`。
   *
   * ⚠️ 三个**必须照抄**的点（原先的实现三处都不对，是一次"看着像就写了"的典型）：
   *    ① **`bpmnXml` 原样复制**。原先用 `buildEmptyBpmnXml(...)` 生成一张空图 ——
   *       副本会**丢掉整张流程图**，属于功能性缺陷（复制出来的流程根本不能用）。
   *    ② **节点配置一起复制**，且只复制**当前编辑态**的那些
   *       （`process_definition_id IS NULL`）—— 已部署版本的历史快照不复制。
   *       原先完全不复制 ⇒ 副本里所有审批节点的按钮开关、表单绑定全丢。
   *    ③ **key 与名称的文案**：`<源key>_copy_<新id前8位>`、`<源名称> (副本)`
   *       —— 半角括号、括号前有空格。这两个值直接出现在响应里。
   *
   * ⚠️ 单测/契约都够不到的一点：Java 的 `newId.substring(0, 8)` 取的是**新生成 UUID**
   *    的前 8 位（不是时间戳）。用时间戳会让副本 key 无法在两侧归一化、契约永远对不上。
   *
   * ⚠️ **响应里的 `createdAt` / `updatedAt` 必须是 `null`**（golden `cpCopy` 实测）。
   *    原因很隐蔽、但会反复出现，值得记住：
   *      - `copyProcess` 带 `@Transactional`，而 `createDraft` **不带**；
   *      - 不带事务时 `save()` 自己开事务，**flush/commit 在 save 内部完成**，
   *        所以实体的 `@PrePersist` 已经跑过 → 返回的对象带时间戳（`createDraft` 的 golden 如此）；
   *      - 带事务时 flush 被推迟到**方法返回之后**的提交时刻 → 返回的对象里
   *        `@PrePersist` 还没执行 → 两个时间戳都是 **null**。
   *    **数据库里那两列仍然有值**（迁移的 `DEFAULT CURRENT_TIMESTAMP` 兜底），
   *    只是响应里看不到。所以这里照样写库、但**返回 VO 时显式置空**。
   */
  async copyProcess(sourceDraftId: string): Promise<ProcessDraftVO> {
    const tenantId = getTenantId()
    const source = await this.requireDraft(sourceDraftId)
    const now = new Date()
    const id = newId()

    const row: DraftRow = {
      ...source,
      id,
      tenant_id: tenantId,
      process_key: `${source.process_key}_copy_${id.substring(0, 8)}`,
      name: `${source.name} (副本)`,
      // 原样复制 BPMN —— 不要"顺手"生成空图
      bpmn_xml: source.bpmn_xml,
      status: 'DRAFT',
      version: 0,
      deploy_id: null,
      process_definition_id: null,
      deployed_config_hash: null,
      deployed_xml: null,
      last_deployed_at: null,
      created_at: now,
      updated_at: now,
    }
    await this.repo.insertDraft(row)

    // 仅复制「当前编辑中」的节点配置（不含已部署版本的历史快照）
    const configs = await this.repo.findEditingConfigs(sourceDraftId)
    if (configs.length > 0) {
      await this.repo.insertConfigs(
        configs.map((config) => ({
          ...config,
          id: newId(),
          tenant_id: tenantId,
          process_def_id: id,
        })),
      )
    }
    // 见方法注释：Java 在该事务里 flush 尚未发生，实体上的 @PrePersist 还没跑
    return { ...toDraftVO(row), createdAt: null, updatedAt: null }
  }

  /**
   * 取草稿；不存在时报 Java 的错。
   *
   * ⚠️ Java 侧这一族方法（`copyProcess` / `saveDesign` / `deploy` / `deleteDraft` …）
   *    统一抛 `RuntimeException("Process draft not found: " + id)` —— 是**普通运行时异常**，
   *    被兜底处理器映射成 **HTTP 500 + body code 500**；而 `BusinessException` 会走
   *    **HTTP 200 + body code**。契约场景 `cpCopyUnknown` 实测确认：
   *    `500 / {"code":500,"msg":"Process draft not found: <ID>"}`。
   *    原先这里用的是中文文案 + `BusinessException`，两个维度都不对。
   */
  private async requireDraft(draftId: string): Promise<DraftRow> {
    const draft = await this.repo.findDraftById(draftId, getTenantId())
    if (draft === null) throw new Error(`Process draft not found: ${draftId}`)
    return draft
  }

  /** 供「已部署流程」接口使用。 */
  getRepository(): ProcessDesignRepository {
    return this.repo
  }

  // ==================== 已部署流程（对齐 Java ProcessDefinitionController） ====================

  /**
   * 已部署流程精简列表（按 key 去重取最新版本，key 升序）。
   *
   * Java 侧 `listSummaries()` 返回 Flowable 的全部已部署定义；这里返回
   * `wfe_process_def` 的全部行。**两者内容集必然不同** —— 契约场景因此
   * 只对这一步做「仅形状」比对（见 scenarios.json 里该步骤的 `shapeOnly`）。
   */
  async listSummaries(): Promise<ProcessDefinitionSummaryVO[]> {
    const rows = await this.repo.listProcessDefsByKeyAsc(getTenantId())
    const seen = new Set<string>()
    const out: ProcessDefinitionSummaryVO[] = []
    for (const row of rows) {
      const key = String(row.process_key)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        id: String(row.id),
        key,
        name: row.name === null ? null : String(row.name),
        version: Number(row.version),
      })
    }
    return out
  }

  /**
   * 已部署流程定义详情（Flowable `ProcessDefinition` 的形状）。
   *
   * 找不到时返回 null —— 由控制器映射成 `R.fail(404, 'Process definition not found')`，
   * 注意那是 **HTTP 200 + body 内 code 404**，不是 HTTP 404。
   */
  async getProcessDefinition(id: string): Promise<Record<string, unknown> | null> {
    const tenantId = getTenantId()
    const row = await this.repo.findProcessDefById(id, tenantId)
    if (row === null) return null

    const key = String(row.process_key)
    const map: Record<string, unknown> = {
      id: String(row.id),
      key,
      name: row.name === null ? null : String(row.name),
      version: Number(row.version),
      description: null,
      deploymentId: deploymentIdOf(String(row.id)),
      resourceName: `${key}.bpmn20.xml`,
      diagramResourceName: null,
      tenantId,
      // Flowable 把 BPMN 的 targetNamespace 当作 ProcessDefinition.category
      category: row.target_namespace === null ? null : String(row.target_namespace),
      suspended: String(row.status) !== 'ACTIVE',
    }
    Object.assign(map, await this.resolveFormDefIds(String(row.id), String(row.model_json)))
    return map
  }

  /** 已部署流程的 BPMN XML（找不到返回 null，对齐 Java 的返回值语义）。 */
  async getProcessDefinitionXml(id: string): Promise<string | null> {
    const row = await this.repo.findProcessDefById(id, getTenantId())
    return row === null ? null : String(row.bpmn_xml)
  }

  /** 某 key 的全部已部署版本（version 倒序），并标记最高版本为 latest。 */
  async listProcessVersions(key: string): Promise<ProcessVersionVO[]> {
    const rows = await this.repo.listProcessDefsByKey(getTenantId(), key)
    const maxVersion = rows.reduce(
      (max, row) => Math.max(max, Number(row.version)),
      Number.NEGATIVE_INFINITY,
    )
    return rows.map((row) => ({
      procDefId: String(row.id),
      version: Number(row.version),
      name: row.name === null ? null : String(row.name),
      deploymentTime: row.deployed_at instanceof Date ? row.deployed_at : null,
      isLatest: Number(row.version) === maxVersion,
    }))
  }

  /**
   * 历史版本编辑器数据：该版本部署时的 BPMN XML + 节点配置快照。
   *
   * 读取失败返回 null（对齐 Java 的 `R.fail(404, "历史版本数据读取失败")`）。
   */
  async getVersionEditor(procDefId: string): Promise<VersionEditorVO | null> {
    const row = await this.repo.findProcessDefById(procDefId, getTenantId())
    if (row === null) return null
    const configs = await this.repo.findConfigsByProcessDefinitionId(procDefId)
    const nodeConfigs: Record<string, string> = {}
    for (const config of configs) {
      // Java 用 `Collectors.toMap(..., (a, b) -> a)` —— 重复 nodeId 保留**先出现**的
      if (!(config.node_id in nodeConfigs)) {
        nodeConfigs[config.node_id] = config.config_json
      }
    }
    return {
      id: null,
      key: null,
      name: null,
      categoryId: null,
      status: 'DEPLOYED',
      bpmnXml: String(row.bpmn_xml),
      nodeConfigs,
    }
  }

  /**
   * 挂起已部署流程（对齐 Java `ProcessService.suspendProcessDefinition` →
   * Flowable `suspendProcessDefinitionById`）。
   *
   * ⚠️ 找不到不是 404 而是 500：Java 里 Flowable 会抛
   *    `FlowableObjectNotFoundException`，被兜底处理器映射成 HTTP 500。
   *    这里用普通 Error 保持同样的状态码。
   */
  async suspendProcessDefinition(id: string): Promise<void> {
    await this.updateProcessDefStatus(id, 'SUSPENDED')
  }

  /** 激活已部署流程（对齐 Flowable `activateProcessDefinitionById`）。 */
  async activateProcessDefinition(id: string): Promise<void> {
    await this.updateProcessDefStatus(id, 'ACTIVE')
  }

  private async updateProcessDefStatus(id: string, status: string): Promise<void> {
    const tenantId = getTenantId()
    const row = await this.repo.findProcessDefById(id, tenantId)
    if (row === null) {
      throw new Error(`Process definition not found: ${id}`)
    }
    await this.repo.updateProcessDefStatus(id, tenantId, status)
  }

  /**
   * 解析流程关联的表单定义 ID（对齐 Java `resolveFormDefIds`）。
   * 优先级：**发起人节点表单 > 流程默认（`__PROCESS__`）表单**；
   * 表单与其字段权限**作为整体从同一层取**，不跨层合并。
   *
   * ⚠️ 发起人节点用 `model_json` 里的 `initiatorNodeId`（编译期已解析，
   *    等价于 Java 从 BPMN 模型里找 `wf:nodeRole=initiator` 的 UserTask）。
   */
  private async resolveFormDefIds(
    processDefinitionId: string,
    modelJson: string,
  ): Promise<{
    formDefId: string | null
    fieldPermissions: Record<string, string> | null
    initiatorFormDefId: string | null
    processFormDefId: string | null
  }> {
    const configs = await this.repo.findConfigsByProcessDefinitionId(processDefinitionId)

    let processCfg: FormConfig | null = null
    for (const config of configs) {
      if (config.node_id !== PROCESS_FORM_NODE_ID) continue
      const cfg = extractFormConfig(config.config_json)
      if (cfg !== null) processCfg = cfg
    }

    let initiatorCfg: FormConfig | null = null
    const initiatorNodeId = parseInitiatorNodeId(modelJson)
    if (initiatorNodeId !== null) {
      const config = configs.find((c) => c.node_id === initiatorNodeId)
      if (config !== undefined) initiatorCfg = extractFormConfig(config.config_json)
    }

    const effective = initiatorCfg ?? processCfg
    return {
      formDefId: effective?.formDefId ?? null,
      fieldPermissions: effective?.fieldPermissions ?? null,
      initiatorFormDefId: initiatorCfg?.formDefId ?? null,
      processFormDefId: processCfg?.formDefId ?? null,
    }
  }
}

/** `__PROCESS__` 伪节点 ID：流程级默认表单配置存在这里。 */
const PROCESS_FORM_NODE_ID = '__PROCESS__'

interface FormConfig {
  formDefId: string
  fieldPermissions: Record<string, string> | null
}

/**
 * 从节点配置 JSON 中提取表单配置（对齐 Java `extractFormConfig`）。
 *
 * 无 `form` 节点、无 `formDefId`、或值为空串时返回 null。
 */
export function extractFormConfig(configJson: string): FormConfig | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(configJson)
  } catch {
    return null
  }
  if (parsed === null || typeof parsed !== 'object') return null
  const form = (parsed as Record<string, unknown>).form
  if (form === null || typeof form !== 'object') return null
  const raw = (form as Record<string, unknown>).formDefId
  if (raw === null || raw === undefined) return null
  const formDefId = String(raw)
  if (formDefId === '') return null

  const permsRaw = (form as Record<string, unknown>).fieldPermissions
  let fieldPermissions: Record<string, string> | null = null
  if (permsRaw !== null && typeof permsRaw === 'object' && !Array.isArray(permsRaw)) {
    fieldPermissions = {}
    for (const [key, value] of Object.entries(permsRaw as Record<string, unknown>)) {
      fieldPermissions[key] = String(value)
    }
  }
  return { formDefId, fieldPermissions }
}

/** 从编译产物里读发起人节点 ID；解析失败返回 null。 */
export function parseInitiatorNodeId(modelJson: string): string | null {
  try {
    const parsed: unknown = JSON.parse(modelJson)
    if (parsed === null || typeof parsed !== 'object') return null
    const node = (parsed as Record<string, unknown>).initiatorNodeId
    return node === null || node === undefined ? null : String(node)
  } catch {
    return null
  }
}

/**
 * 从 `key:version:uuid` 形式的流程定义 ID 里取部署 ID（最后一段 UUID）。
 *
 * ⚠️ **建模差异（刻意且已记录）**：Flowable 的 deployment 是独立实体，
 *    一个 deployment 可以含多个流程定义，所以它的 `deploymentId` 与
 *    `processDefinitionId` 无关。自研引擎里**部署与流程定义是 1:1**，
 *    因此把定义 ID 里的那个 UUID 直接当作部署 ID 暴露 —— 语义正确、
 *    契约上仍是「一个不透明 UUID」，且无需为了对齐而多建一张表。
 *    记入规格 U17。
 */
export function deploymentIdOf(processDefinitionId: string): string {
  const parts = processDefinitionId.split(':')
  return parts.length >= 3 ? parts[parts.length - 1] : processDefinitionId
}

/** 已部署流程精简项，对齐 Java `ProcessDefinitionSummary`。 */
export interface ProcessDefinitionSummaryVO {
  id: string
  key: string
  name: string | null
  version: number
}

/** 流程版本项，对齐 Java `ProcessVersionVO`。 */
export interface ProcessVersionVO {
  procDefId: string
  version: number
  name: string | null
  deploymentTime: Date | null
  isLatest: boolean
}

/**
 * 历史版本编辑器数据，对齐 Java `EditorDTO`
 * （`GET /deployed-processes/versions/{procDefId}/editor` 的返回）。
 *
 * ⚠️ 与草稿编辑器（`EditorVO`）**字段名相同但可空性不同**：Java 在版本编辑器里
 *    新建了一个 `EditorDTO` 只填 bpmnXml / nodeConfigs / status，
 *    于是 id / key / name / categoryId 全是 `null`。
 *    用同一个类型表达会让「null 被当成合法值」，从而掩盖草稿编辑器哪天漏填字段。
 */
export interface VersionEditorVO {
  id: null
  key: null
  name: null
  categoryId: null
  status: string
  bpmnXml: string
  nodeConfigs: Record<string, string>
}

/** 取 BPMN 的 targetNamespace —— Flowable 用它作为 ProcessDefinition.category。 */
export function extractTargetNamespace(bpmnXml: string): string | null {
  const m = /targetNamespace\s*=\s*"([^"]*)"/.exec(bpmnXml)
  return m === null || m[1] === '' ? null : m[1]
}

/**
 * 从 BPMN XML 解析 nodeId → nodeType，对齐 Java `parseNodeTypes`。
 *
 * 用正则而非完整解析：这里只需要标签名（去掉命名空间前缀），
 * 且允许 XML 有格式瑕疵 —— 与 Java 侧用 DOM 遍历取 localName 的意图一致。
 */
export function parseNodeTypes(bpmnXml: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /<(?:[\w-]+:)?(\w+)\s[^>]*\bid="([^"]+)"[^>]*>/g
  let match: RegExpExecArray | null
  const KNOWN = new Set([
    'startEvent',
    'endEvent',
    'userTask',
    'serviceTask',
    'callActivity',
    'subProcess',
    'exclusiveGateway',
    'parallelGateway',
    'inclusiveGateway',
  ])
  while ((match = re.exec(bpmnXml)) !== null) {
    const [, tag, id] = match
    if (KNOWN.has(tag)) out[id] = tag
  }
  return out
}
