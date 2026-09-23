import { Injectable } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { bitToBool } from '../../framework/database/types'
import { getTenantId } from '../../framework/tenant/tenant-context'
import { FormDefinitionRepository } from './repository/form-definition.repository'
import {
  FormDataRepository,
  type FormDataRow,
} from './repository/form-data.repository'

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

  /** 保存发起页草稿（upsert，实例为 NULL）。 */
  async saveDraft(formDefId: string | null, dataJson: string | null): Promise<FormDataVO> {
    const tenantId = getTenantId()
    const formVersion = await this.requireFormVersion(formDefId, tenantId)
    const existing = await this.repository.findDraft(tenantId, String(formDefId))

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
      created_by: null,
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

  /** 查询发起页草稿（无则 null）。 */
  async findDraft(formDefId: string): Promise<FormDataDTOVO | null> {
    const row = await this.repository.findDraft(getTenantId(), formDefId)
    return row === null ? null : toDTO(row)
  }

  /** 清除发起页草稿（不存在时静默成功）。 */
  async clearDraft(formDefId: string): Promise<void> {
    const row = await this.repository.findDraft(getTenantId(), formDefId)
    if (row !== null) await this.repository.deleteById(row.id)
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
