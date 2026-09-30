/**
 * variable-mapping.writer.ts — 流程变量映射写入器。
 *
 * Java `com.workflow.engine.form.mapping.VariableMappingWriter` 对位（Task 118）：
 * 按流程级 `variableMappings` 配置（wf_node_config `__PROCESS__` config_json），
 * 把源数据写入目标流程变量：
 *   - `variable:<名称>` → 当前流程变量
 *   - `form:initiator` / `form:<nodeId>` → 该节点表单在 wf_form_data 的
 *     **当前数据**（is_snapshot=0）的 sourceField
 *
 * 触发时机（对齐 Java）：流程发起成功后、任务完成/驳回后。
 * 与 Java 的差异：Java 直接 RuntimeService 写变量；Nest 引擎变量走 CAS 整体写，
 * 所以这里只**计算**目标变量集合，由调用方（start / completeTask / rejectTask）
 * 在各自的 `replaceRuntimeRows` 之前 merge 进引擎变量 —— 终态语义一致。
 *
 * 容错与 Java 一致：单条失败跳过、整体异常由调用方捕获后吞掉（不阻断主流程）。
 */
import { Inject, Injectable } from '@nestjs/common'
import { Kysely } from 'kysely'
import type { DB } from '../../../framework/database/types'
import { KYSELY } from '../../../framework/database/database.module'
import { getTenantId } from '../../../framework/tenant/tenant-context'
import { ProcessDesignRepository } from '../../process/repository/process-design.repository'
import { extractFormConfig } from '../../process/process-design.service'

/** variableMappings 条目（宽松形状：配置来自设计器 JSON，逐字段校验）。 */
interface VariableMappingLike {
  source?: unknown
  /** 目标流程变量名（对齐 Java FormMappingResolver 的字段命名）。 */
  variable?: unknown
  sourceField?: unknown
}

@Injectable()
export class VariableMappingWriter {
  constructor(
    @Inject(KYSELY) private readonly db: Kysely<DB>,
    private readonly designRepo: ProcessDesignRepository,
  ) {}

  /**
   * 计算流程级 variableMappings 的目标变量值集合。
   *
   * @param processDefinitionId 部署版本定义 id（wf_node_config 归属键）
   * @param processInstanceId   实例 id（form:* 源读该实例的 wf_form_data 当前数据）
   * @param variables           当前流程变量（variable: 源的数据源；调用方传引擎最新态）
   * @param initiatorNodeId     发起节点 id（`form:initiator` 的解析目标；模型缺失时 null）
   * @returns `{ [目标变量名]: 值 }`；无配置/全部无效时为空对象（调用方无需特判）
   */
  async compute(
    processDefinitionId: string,
    processInstanceId: string,
    variables: Record<string, unknown>,
    initiatorNodeId: string | null,
  ): Promise<Record<string, unknown>> {
    const tenantId = getTenantId()
    const processConfig = await this.designRepo.findNodeConfig(processDefinitionId, '__PROCESS__')
    if (processConfig === null) return {}
    let parsed: { variableMappings?: VariableMappingLike[] }
    try {
      parsed = JSON.parse(processConfig.config_json) as typeof parsed
    } catch {
      return {}
    }
    const mappings = parsed?.variableMappings
    if (!Array.isArray(mappings) || mappings.length === 0) return {}

    // 预取该部署版本全部节点配置（form:* 源指向节点的 formDefId 从这里解；
    // 与 TaskService.loadMappedData 同一取数口径）
    const configs = await this.designRepo.findConfigsByProcessDefinitionId(processDefinitionId)
    const formDefIdOf = (ownerNodeId: string): string | null => {
      const row = configs.find((c) => c.node_id === ownerNodeId)
      if (row === undefined) return null
      return extractFormConfig(row.config_json)?.formDefId ?? null
    }

    const result: Record<string, unknown> = {}
    for (const mapping of mappings) {
      if (mapping === null || typeof mapping !== 'object') continue
      const targetVar = typeof mapping.variable === 'string' ? mapping.variable : ''
      const source = typeof mapping.source === 'string' ? mapping.source : ''
      const sourceField = typeof mapping.sourceField === 'string' ? mapping.sourceField : ''
      if (targetVar === '' || source === '') continue
      let value: unknown = null
      if (source.startsWith('variable:')) {
        value = variables[source.slice('variable:'.length)] ?? null
      } else if (source.startsWith('form:')) {
        const sourceNodeId = source.slice('form:'.length)
        const ownerNodeId =
          sourceNodeId === 'initiator' ? initiatorNodeId : sourceNodeId || null
        const formDefId = ownerNodeId !== null ? formDefIdOf(ownerNodeId) : null
        if (formDefId !== null && sourceField !== '') {
          value = await this.readFormFieldValue(
            tenantId,
            processInstanceId,
            formDefId,
            sourceField,
          )
        }
      }
      // 源缺失 → 跳过该条（Java 同语义：源数据缺失时跳过，不写 null）
      if (value !== null && value !== undefined) result[targetVar] = value
    }
    return result
  }

  /** 读实例下指定表单当前数据（is_snapshot=0）的指定字段（与 TaskService.readFormFieldValue 同语义）。 */
  private async readFormFieldValue(
    tenantId: string,
    processInstanceId: string,
    formDefId: string,
    sourceField: string,
  ): Promise<unknown> {
    const row = await this.db
      .selectFrom('wf_form_data')
      .select('data_json')
      .where('tenant_id', '=', tenantId)
      .where('process_instance_id', '=', processInstanceId)
      .where('form_def_id', '=', formDefId)
      .where('is_snapshot', '=', 0)
      .executeTakeFirst()
    if (row?.data_json === null || row?.data_json === undefined) return null
    try {
      const data = JSON.parse(row.data_json) as Record<string, unknown>
      return data[sourceField] ?? null
    } catch {
      return null
    }
  }
}
