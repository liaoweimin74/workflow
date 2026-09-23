import { Inject, Injectable } from '@nestjs/common'
import { Kysely } from 'kysely'
import type { DB, WfNodeConfigTable, WfProcessDraftTable } from '../../../framework/database/types'
import { KYSELY } from '../../../framework/database/database.module'

/** 流程定义草稿的行（字段名与表列一致，出参时再由服务层改名成 Java 的驼峰）。 */
export type DraftRow = WfProcessDraftTable
export type NodeConfigRow = WfNodeConfigTable

@Injectable()
export class ProcessDesignRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  // -------------------------------------------------------------- 草稿

  async findDraftById(id: string, tenantId: string): Promise<DraftRow | null> {
    const row = await this.db
      .selectFrom('wf_process_draft')
      .selectAll()
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst()
    return row ?? null
  }

  async insertDraft(row: DraftRow): Promise<void> {
    await this.db.insertInto('wf_process_draft').values(row).execute()
  }

  async updateDraft(id: string, tenantId: string, patch: Partial<DraftRow>): Promise<void> {
    await this.db
      .updateTable('wf_process_draft')
      .set(patch)
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .execute()
  }

  async deleteDraft(id: string, tenantId: string): Promise<void> {
    await this.db
      .deleteFrom('wf_process_draft')
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .execute()
  }

  /** 草稿分页（无筛选），按 updated_at 倒序 —— 与 Java Pageable 默认一致。 */
  async listDrafts(
    tenantId: string,
    offset: number,
    limit: number,
  ): Promise<{ rows: DraftRow[]; total: number }> {
    const countRow = await this.db
      .selectFrom('wf_process_draft')
      .select((eb) => eb.fn.countAll<number>().as('c'))
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst()

    const rows = await this.db
      .selectFrom('wf_process_draft')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .orderBy('updated_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute()

    return { rows, total: Number(countRow?.c ?? 0) }
  }

  // -------------------------------------------------------------- 节点配置

  /** 当前编辑态配置（process_definition_id IS NULL）。 */
  async findEditingConfigs(draftId: string): Promise<NodeConfigRow[]> {
    const rows = await this.db
      .selectFrom('wf_node_config')
      .selectAll()
      .where('process_def_id', '=', draftId)
      .where('process_definition_id', 'is', null)
      .execute()
    return rows
  }

  /** 某部署版本下某个节点的配置（任务详情的 operations 按钮开关用它）。 */
  async findNodeConfig(
    processDefinitionId: string,
    nodeId: string,
  ): Promise<NodeConfigRow | null> {
    const row = await this.db
      .selectFrom('wf_node_config')
      .selectAll()
      .where('process_definition_id', '=', processDefinitionId)
      .where('node_id', '=', nodeId)
      .executeTakeFirst()
    return row ?? null
  }

  /** 某部署版本的配置快照。 */
  async findConfigsByProcessDefinitionId(processDefinitionId: string): Promise<NodeConfigRow[]> {
    const rows = await this.db
      .selectFrom('wf_node_config')
      .selectAll()
      .where('process_definition_id', '=', processDefinitionId)
      .execute()
    return rows
  }

  async deleteEditingConfigs(draftId: string): Promise<void> {
    await this.db
      .deleteFrom('wf_node_config')
      .where('process_def_id', '=', draftId)
      .where('process_definition_id', 'is', null)
      .execute()
  }

  async deleteSnapshotConfigs(draftId: string, processDefinitionId: string): Promise<void> {
    await this.db
      .deleteFrom('wf_node_config')
      .where('process_def_id', '=', draftId)
      .where('process_definition_id', '=', processDefinitionId)
      .execute()
  }

  async insertConfigs(rows: NodeConfigRow[]): Promise<void> {
    if (rows.length === 0) return
    await this.db.insertInto('wf_node_config').values(rows).execute()
  }

  async deleteAllConfigsOfDraft(draftId: string): Promise<void> {
    await this.db.deleteFrom('wf_node_config').where('process_def_id', '=', draftId).execute()
  }

  // -------------------------------------------------------------- 部署版本

  /** 同一 (tenant, key) 上的下一个版本号 = MAX(version) + 1（无则 1）。 */
  async nextVersion(tenantId: string, processKey: string): Promise<number> {
    const row = await this.db
      .selectFrom('wfe_process_def')
      .select((eb) => eb.fn.max<number>('version').as('maxVersion'))
      .where('tenant_id', '=', tenantId)
      .where('process_key', '=', processKey)
      .executeTakeFirst()
    const max = row?.maxVersion
    return max === null || max === undefined ? 1 : Number(max) + 1
  }

  async insertProcessDef(row: {
    id: string
    tenant_id: string
    process_key: string
    version: number
    name: string | null
    category_id: string | null
    bpmn_xml: string
    model_json: string
    target_namespace: string | null
    deployed_config_hash: string | null
    status: string
    draft_id: string | null
    deployed_at: Date
    created_at: Date
    updated_at: Date
  }): Promise<void> {
    await this.db.insertInto('wfe_process_def').values(row).execute()
  }

  /** 已部署版本分页（对齐 Java 的 ProcessDefinition 列表）。 */
  async listProcessDefs(
    tenantId: string,
    offset: number,
    limit: number,
  ): Promise<{ rows: Array<Record<string, unknown>>; total: number }> {
    const countRow = await this.db
      .selectFrom('wfe_process_def')
      .select((eb) => eb.fn.countAll<number>().as('c'))
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst()

    const rows = await this.db
      .selectFrom('wfe_process_def')
      .select([
        'id',
        'process_key',
        'name',
        'version',
        'category_id',
        'target_namespace',
        'status',
        'draft_id',
        'deployed_at',
      ])
      .where('tenant_id', '=', tenantId)
      .orderBy('deployed_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute()

    return { rows: rows as Array<Record<string, unknown>>, total: Number(countRow?.c ?? 0) }
  }

  /** 取某 key 的最新已部署版本（发起流程时用）。 */
  async findLatestDeployed(tenantId: string, processKey: string): Promise<{
    id: string
    version: number
    model_json: string
    name: string | null
    status: string
  } | null> {
    const row = await this.db
      .selectFrom('wfe_process_def')
      .select(['id', 'version', 'model_json', 'name', 'status'])
      .where('tenant_id', '=', tenantId)
      .where('process_key', '=', processKey)
      .orderBy('version', 'desc')
      .limit(1)
      .executeTakeFirst()
    return row ?? null
  }

  /** 按 id 取已部署流程定义（含 BPMN XML）。 */
  async findProcessDefById(
    id: string,
    tenantId: string,
  ): Promise<Record<string, unknown> | null> {
    const row = await this.db
      .selectFrom('wfe_process_def')
      .select([
        'id',
        'process_key',
        'name',
        'version',
        'category_id',
        'target_namespace',
        'bpmn_xml',
        'status',
        'draft_id',
        'deployed_at',
      ])
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst()
    return (row as Record<string, unknown> | undefined) ?? null
  }

  /**
   * 某 key 的全部已部署版本，按 version 倒序（对齐 Java 的
   * `createProcessDefinitionQuery().orderByProcessDefinitionVersion().desc()`）。
   */
  async listProcessDefsByKey(
    tenantId: string,
    processKey: string,
  ): Promise<Array<Record<string, unknown>>> {
    const rows = await this.db
      .selectFrom('wfe_process_def')
      .select([
        'id',
        'process_key',
        'name',
        'version',
        'target_namespace',
        'status',
        'deployed_at',
      ])
      .where('tenant_id', '=', tenantId)
      .where('process_key', '=', processKey)
      .orderBy('version', 'desc')
      .execute()
    return rows as Array<Record<string, unknown>>
  }

  /**
   * 全部已部署流程定义，按 **key 升序**（`summaries` 用）。
   *
   * ⚠️ 不带分页、也不去重：Java 侧 `listSummaries()` 返回的就是全部已部署定义，
   *    去重逻辑（按 key 取最新）在服务层做。这里的顺序刻意选 key 升序 ——
   *    与 Java 侧实测的顺序一致（Flowable 的 ACT_RE_PROCDEF 查询就是这个序）。
   */
  async listProcessDefsByKeyAsc(tenantId: string): Promise<Array<Record<string, unknown>>> {
    const rows = await this.db
      .selectFrom('wfe_process_def')
      .select(['id', 'process_key', 'name', 'version'])
      .where('tenant_id', '=', tenantId)
      .orderBy('process_key', 'asc')
      .orderBy('version', 'desc')
      .execute()
    return rows as Array<Record<string, unknown>>
  }

  /**
   * 更新已部署流程的状态（`ACTIVE` / `SUSPENDED`）。
   *
   * 对应 Flowable 的 `suspendProcessDefinitionById` / `activateProcessDefinitionById`。
   * 列表与详情里的 `suspended` 都取 `status !== 'ACTIVE'`。
   */
  async updateProcessDefStatus(id: string, tenantId: string, status: string): Promise<void> {
    await this.db
      .updateTable('wfe_process_def')
      .set({ status, updated_at: new Date() })
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .execute()
  }
}

