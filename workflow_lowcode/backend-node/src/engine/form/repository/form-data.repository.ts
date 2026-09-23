import { Inject, Injectable } from '@nestjs/common'
import { Kysely } from 'kysely'
import type { DB, WfFormDataTable } from '../../../framework/database/types'
import { KYSELY } from '../../../framework/database/database.module'

/** 表单数据行（列名与表一致，出参时由服务层改名成 Java 的驼峰）。 */
export type FormDataRow = WfFormDataTable

/**
 * 表单实例数据访问，逐条对齐 Java `FormDataRepository` 的派生查询。
 *
 * ⚠️ 这里每个方法都带 `is_snapshot` 条件，且**不能合并**：
 *    「当前数据」与「快照」是同一张表里的两类行，查询语义完全不同
 *   （当前数据最多一条、可更新；快照多条、不可变）。合并成
 *   `findByProcessInstance(pi, formDefId, isSnapshot)` 看着更短，
 *   但会让调用点很容易把 `true/false` 传反 —— 而传反是两个端点同时错。
 */
@Injectable()
export class FormDataRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /** 当前数据（非快照）：租户 + 实例 + 表单定义。 */
  async findCurrent(
    tenantId: string,
    processInstanceId: string,
    formDefId: string,
  ): Promise<FormDataRow | null> {
    const row = await this.db
      .selectFrom('wf_form_data')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('process_instance_id', '=', processInstanceId)
      .where('form_def_id', '=', formDefId)
      .where('is_snapshot', '=', 0)
      .executeTakeFirst()
    return row ?? null
  }

  /** 发起页草稿：实例为 NULL 且非快照。 */
  async findDraft(tenantId: string, formDefId: string): Promise<FormDataRow | null> {
    const row = await this.db
      .selectFrom('wf_form_data')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('form_def_id', '=', formDefId)
      .where('process_instance_id', 'is', null)
      .where('is_snapshot', '=', 0)
      .executeTakeFirst()
    return row ?? null
  }

  /**
   * 按任务 id 取审批快照。
   *
   * ⚠️ Java 是 `...OrderByCreatedAtDesc(...).stream().findFirst()` ——
   *    同一 taskId 有多个快照时取**最新**一条。少了 orderBy 会拿到任意一条。
   */
  async findSnapshotByTaskId(tenantId: string, taskId: string): Promise<FormDataRow | null> {
    const row = await this.db
      .selectFrom('wf_form_data')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('task_id', '=', taskId)
      .where('is_snapshot', '=', 1)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst()
    return row ?? null
  }

  /** 某实例的全部表单数据（含快照）—— 无排序（对齐 Java 的派生查询）。 */
  async findByProcessInstance(
    tenantId: string,
    processInstanceId: string,
  ): Promise<FormDataRow[]> {
    return this.db
      .selectFrom('wf_form_data')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('process_instance_id', '=', processInstanceId)
      .execute()
  }

  /** 某实例的全部审批快照，按创建时间倒序。 */
  async findSnapshots(
    tenantId: string,
    processInstanceId: string,
  ): Promise<FormDataRow[]> {
    return this.db
      .selectFrom('wf_form_data')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('process_instance_id', '=', processInstanceId)
      .where('is_snapshot', '=', 1)
      .orderBy('created_at', 'desc')
      .execute()
  }

  /** 按 id 取（租户内）；不存在返回 null。 */
  async findByIdAndTenantId(id: string, tenantId: string): Promise<FormDataRow | null> {
    const row = await this.db
      .selectFrom('wf_form_data')
      .selectAll()
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst()
    return row ?? null
  }

  /** 插入新行。 */
  async insert(row: FormDataRow): Promise<void> {
    await this.db.insertInto('wf_form_data').values(row).execute()
  }

  /** 更新数据与时间戳（对齐 JPA 的 @PreUpdate）。 */
  async updateData(id: string, dataJson: string): Promise<void> {
    await this.db
      .updateTable('wf_form_data')
      .set({ data_json: dataJson, updated_at: new Date() })
      .where('id', '=', id)
      .execute()
  }

  /** 删除（草稿清除用）。 */
  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('wf_form_data').where('id', '=', id).execute()
  }
}
