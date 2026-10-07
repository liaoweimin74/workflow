import { Injectable } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { bitToBool } from '../../framework/database/types'
import { getTenantId } from '../../framework/tenant/tenant-context'
import { FormDefinitionRepository } from './repository/form-definition.repository'
import {
  FormDataRepository,
  type FormDataRow,
} from './repository/form-data.repository'
import {
  extractFormConfig,
  parseInitiatorNodeId,
} from '../process/process-design.service'
import { ProcessDesignRepository } from '../process/repository/process-design.repository'

/**
 * 表单实例数据服务，对齐 Java `com.workflow.engine.form.FormDataService`。
 *
 * 三个「同一张表、三种语义」的概念，别混：
 *   - **当前数据**：同一 `进程实例 + 表单定义` 只有一条，保存时 upsert
 *   - **审批快照**：每次保存都新建，不可变
 *   - **发起页草稿**：`process_instance_id IS NULL` 的那条，保存时 upsert
 *
 * ⚠️ 错误类型：Java 这里一律用 `RuntimeException`（表单定义/数据不存在），
 *    兜底异常处理器映射成 **HTTP 500**，不是 200 + body 内 code。
 *    所以下面用普通 `Error` 而不是 `BusinessException` —— 后者会改变 HTTP 状态码。
 */
@Injectable()
export class FormDataService {
  constructor(
    private readonly repository: FormDataRepository,
    private readonly formDefRepository: FormDefinitionRepository,
    private readonly processDesignRepository: ProcessDesignRepository,
  ) {}

  /** 保存或更新当前数据（upsert）。 */
  async save(
    formDefId: string | null,
    processInstanceId: string | null,
    taskId: string | null,
    dataJson: string | null,
  ): Promise<FormDataVO> {
    const tenantId = getTenantId()
    const formVersion = await this.requireFormVersion(formDefId, tenantId)
    const existing = await this.repository.findCurrent(
      tenantId,
      String(processInstanceId),
      String(formDefId),
    )

    if (existing !== null) {
      await this.repository.updateData(existing.id, String(dataJson ?? ''))
      const updated = await this.repository.findByIdAndTenantId(existing.id, tenantId)
      return toVO(updated ?? existing)
    }

    const row: FormDataRow = {
      id: newId(),
      tenant_id: tenantId,
      form_def_id: String(formDefId),
      form_version: formVersion,
      process_instance_id: processInstanceId,
      task_id: taskId,
      data_json: dataJson,
      created_by: null,
      created_at: new Date(),
      updated_at: new Date(),
      is_snapshot: 0,
    }
    await this.repository.insert(row)
    return toVO(row)
  }

  /** 保存审批快照（每次新建，不可变）。 */
  async saveSnapshot(
    formDefId: string | null,
    processInstanceId: string | null,
    taskId: string | null,
    dataJson: string | null,
  ): Promise<FormDataVO> {
    const tenantId = getTenantId()
    const formVersion = await this.requireFormVersion(formDefId, tenantId)
    const row: FormDataRow = {
      id: newId(),
      tenant_id: tenantId,
      form_def_id: String(formDefId),
      form_version: formVersion,
      process_instance_id: processInstanceId,
      task_id: taskId,
      data_json: dataJson,
      created_by: null,
      created_at: new Date(),
      updated_at: new Date(),
      // BIT(1)：显式写 0/1，别依赖驱动把 boolean 转成 bit
      is_snapshot: 1,
    }
    await this.repository.insert(row)
    return toVO(row)
  }

  /**
   * 保存发起页草稿（upsert，实例为 NULL）。
   *
   * ⚠️ 草稿按**登录用户**隔离：`created_by` 记录发起人，读取/列表都限定
   *    同一用户 —— 否则任何人打开同一流程的发起页都会读到别人的草稿。
   */
  async saveDraft(
    formDefId: string | null,
    dataJson: string | null,
    userId: number,
  ): Promise<FormDataVO> {
    const tenantId = getTenantId()
    const createdBy = String(userId)
    const formVersion = await this.requireFormVersion(formDefId, tenantId)
    const existing = await this.repository.findDraft(tenantId, String(formDefId), createdBy)

    if (existing !== null) {
      await this.repository.updateData(existing.id, String(dataJson ?? ''))
      const updated = await this.repository.findByIdAndTenantId(existing.id, tenantId)
      return toVO(updated ?? existing)
    }

    const row: FormDataRow = {
      id: newId(),
      tenant_id: tenantId,
      form_def_id: String(formDefId),
      form_version: formVersion,
      process_instance_id: null,
      task_id: null,
      data_json: dataJson,
      created_by: createdBy,
      created_at: new Date(),
      updated_at: new Date(),
      is_snapshot: 0,
    }
    await this.repository.insert(row)
    return toVO(row)
  }

  /** 按 id 取单条；不存在抛 500（对齐 Java 的 RuntimeException）。 */
  async getById(id: string): Promise<FormDataDTOVO> {
    const row = await this.repository.findByIdAndTenantId(id, getTenantId())
    if (row === null) throw new Error(`Form data not found: ${id}`)
    return toDTO(row)
  }

  /** 按实例 + 表单定义取当前数据（无则 null）。 */
  async findByProcessInstance(
    processInstanceId: string,
    formDefId: string,
  ): Promise<FormDataDTOVO | null> {
    const row = await this.repository.findCurrent(
      getTenantId(),
      processInstanceId,
      formDefId,
    )
    return row === null ? null : toDTO(row)
  }

  /** 按 taskId 取最新审批快照（无则 null）。 */
  async findByTaskId(taskId: string): Promise<FormDataDTOVO | null> {
    const row = await this.repository.findSnapshotByTaskId(getTenantId(), taskId)
    return row === null ? null : toDTO(row)
  }

  /** 某实例的全部表单数据（含快照）。 */
  async findByProcessInstanceAll(processInstanceId: string): Promise<FormDataDTOVO[]> {
    const rows = await this.repository.findByProcessInstance(getTenantId(), processInstanceId)
    return rows.map(toDTO)
  }

  /** 某实例的全部审批快照（创建时间倒序）。 */
  async findSnapshots(processInstanceId: string): Promise<FormDataDTOVO[]> {
    const rows = await this.repository.findSnapshots(getTenantId(), processInstanceId)
    return rows.map(toDTO)
  }

  /** 查询发起页草稿（限定当前用户，无则 null）。 */
  async findDraft(formDefId: string, userId: number): Promise<FormDataDTOVO | null> {
    const row = await this.repository.findDraft(getTenantId(), formDefId, String(userId))
    return row === null ? null : toDTO(row)
  }

  /** 清除发起页草稿（限定当前用户；不存在时静默成功）。 */
  async clearDraft(formDefId: string, userId: number): Promise<void> {
    const row = await this.repository.findDraft(getTenantId(), formDefId, String(userId))
    if (row !== null) await this.repository.deleteById(row.id)
  }

  /**
   * 草稿箱列表：当前用户的全部发起页草稿，附表单名与「发起流程」反查结果。
   *
   * 反查规则（与 `resolveFormDefIds` 的发起表单解析互为镜像）：
   *   - 只映射 **ACTIVE** 的部署版本（挂起流程不可发起，草稿只能删除）；
   *   - 同 key 只取**最新版本**（发起入口永远指向最新定义）；
   *   - 优先发起人节点表单，其次 `__PROCESS__` 流程级表单；
   *   - 同一表单被多个流程引用时取 key 升序遇到的第一个（确定性）。
   *    反查不到（流程下线/表单解绑）时 processDefId 为 null，前端禁用「继续填写」。
   */
  async listMyDrafts(userId: number): Promise<DraftBoxItemVO[]> {
    const tenantId = getTenantId()
    const drafts = await this.repository.listDraftsByUser(tenantId, String(userId))
    if (drafts.length === 0) return []

    // 表单名回填（批量，草稿数量有限）
    const formIds = drafts.map((d) => d.form_def_id)
    const forms = await this.formDefRepository.findByIds(formIds, tenantId)
    const formNameById = new Map(forms.map((f) => [f.id, f.name]))

    // 发起表单 → 已部署流程定义（ACTIVE、同 key 最新版优先）
    const ownerByFormId = await this.resolveStartFormOwners(tenantId)

    return drafts.map((d) => {
      const owner = ownerByFormId.get(d.form_def_id) ?? null
      return {
        id: d.id,
        formDefId: d.form_def_id,
        formName: formNameById.get(d.form_def_id) ?? null,
        processDefId: owner?.id ?? null,
        processKey: owner?.processKey ?? null,
        processName: owner?.name ?? null,
        processVersion: owner?.version ?? null,
        dataJson: d.data_json,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      }
    })
  }

  /**
   * 删除草稿箱里的指定草稿。仅允许删除「自己的、发起页草稿」；
   * 不存在/非草稿/非本人一律返回 false（由控制器映射成 404 语义）。
   */
  async deleteMyDraft(id: string, userId: number): Promise<boolean> {
    const row = await this.repository.findByIdAndTenantId(id, getTenantId())
    if (row === null) return false
    if (row.process_instance_id !== null) return false
    if (bitToBool(row.is_snapshot)) return false
    if (row.created_by !== String(userId)) return false
    await this.repository.deleteById(id)
    return true
  }

  /** 全部 ACTIVE 部署定义的「发起表单 → 定义」映射（同 key 只留最新版）。 */
  private async resolveStartFormOwners(
    tenantId: string,
  ): Promise<Map<string, { id: string; processKey: string; name: string | null; version: number }>> {
    const defs = await this.processDesignRepository.listDeployedDefsWithModel(tenantId)
    const active = defs.filter((row) => String(row.status) === 'ACTIVE')
    if (active.length === 0) return new Map()

    const configs = await this.processDesignRepository.findConfigsByProcessDefinitionIds(
      active.map((row) => String(row.id)),
    )
    const configsByDef = new Map<string, typeof configs>()
    for (const config of configs) {
      // 已部署定义的配置行 process_definition_id 不会为 null，但类型上允许，防御性跳过
      if (config.process_definition_id === null) continue
      const list = configsByDef.get(config.process_definition_id) ?? []
      list.push(config)
      configsByDef.set(config.process_definition_id, list)
    }

    // defs 已按 key 升序 + version 倒序：先到先得 ⇒ 同 key 命中最新版、同表单命中首个 key
    const ownerByFormId = new Map<
      string,
      { id: string; processKey: string; name: string | null; version: number }
    >()
    for (const row of active) {
      const defId = String(row.id)
      const defConfigs = configsByDef.get(defId) ?? []

      // 与 ProcessDesignService.resolveFormDefIds 同构：发起人节点表单 > __PROCESS__ 表单
      let effectiveFormDefId: string | null = null
      const initiatorNodeId = parseInitiatorNodeId(String(row.model_json ?? ''))
      if (initiatorNodeId !== null) {
        const config = defConfigs.find((c) => c.node_id === initiatorNodeId)
        if (config !== undefined) {
          effectiveFormDefId = extractFormConfig(config.config_json)?.formDefId ?? null
        }
      }
      if (effectiveFormDefId === null) {
        for (const config of defConfigs) {
          if (config.node_id !== '__PROCESS__') continue
          effectiveFormDefId = extractFormConfig(config.config_json)?.formDefId ?? null
          if (effectiveFormDefId !== null) break
        }
      }
      if (effectiveFormDefId === null) continue

      if (!ownerByFormId.has(effectiveFormDefId)) {
        ownerByFormId.set(effectiveFormDefId, {
          id: defId,
          processKey: String(row.process_key),
          name: row.name === null ? null : String(row.name),
          version: Number(row.version),
        })
      }
    }
    return ownerByFormId
  }

  /** 更新当前数据（不动 form_version / task_id，对齐 Java）。 */
  async update(id: string, dataJson: string | null): Promise<FormDataVO> {
    const tenantId = getTenantId()
    const row = await this.repository.findByIdAndTenantId(id, tenantId)
    if (row === null) throw new Error(`Form data not found: ${id}`)
    await this.repository.updateData(id, String(dataJson ?? ''))
    const updated = await this.repository.findByIdAndTenantId(id, tenantId)
    return toVO(updated ?? row)
  }

  /** 取表单定义的当前版本（用于写快照版本号）；不存在抛 500。 */
  private async requireFormVersion(
    formDefId: string | null,
    tenantId: string,
  ): Promise<number> {
    const row = await this.formDefRepository.findByIdAndTenantId(String(formDefId), tenantId)
    if (row === null) throw new Error(`Form definition not found: ${String(formDefId)}`)
    return row.version
  }
}

/** 对齐 Java 的 ID 生成：UUID 去掉横线 → 32 位十六进制。 */
function newId(): string {
  return randomBytes(16).toString('hex')
}

/**
 * 写端点返回的形状 —— Java 直接返回 **`FormData` 实体**（含 `tenantId`）。
 */
export interface FormDataVO {
  id: string
  tenantId: string
  formDefId: string
  formVersion: number
  processInstanceId: string | null
  taskId: string | null
  dataJson: string | null
  createdBy: string | null
  createdAt: Date | null
  updatedAt: Date | null
  isSnapshot: boolean
}

/** 读端点返回的形状 —— Java 返回 **`FormDataDTO`**（**没有** `tenantId`）。 */
export interface FormDataDTOVO {
  id: string
  formDefId: string
  formVersion: number
  processInstanceId: string | null
  taskId: string | null
  dataJson: string | null
  createdBy: string | null
  createdAt: Date | null
  updatedAt: Date | null
  isSnapshot: boolean
}

/**
 * 草稿箱列表项（Node 侧新能力，无 Java 对齐物）。
 *
 * `processDefId` 为 null 表示该草稿的发起表单已没有可发起的部署流程
 * （流程下线/挂起/表单解绑），前端应禁用「继续填写」。
 */
export interface DraftBoxItemVO {
  id: string
  formDefId: string
  formName: string | null
  processDefId: string | null
  processKey: string | null
  processName: string | null
  processVersion: number | null
  dataJson: string | null
  createdAt: Date | null
  updatedAt: Date | null
}

function toVO(row: FormDataRow): FormDataVO {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    formDefId: row.form_def_id,
    formVersion: row.form_version,
    processInstanceId: row.process_instance_id,
    taskId: row.task_id,
    dataJson: row.data_json,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isSnapshot: bitToBool(row.is_snapshot),
  }
}

function toDTO(row: FormDataRow): FormDataDTOVO {
  return {
    id: row.id,
    formDefId: row.form_def_id,
    formVersion: row.form_version,
    processInstanceId: row.process_instance_id,
    taskId: row.task_id,
    dataJson: row.data_json,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isSnapshot: bitToBool(row.is_snapshot),
  }
}
