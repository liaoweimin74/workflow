import { Injectable } from '@nestjs/common'
import { BusinessException } from '../../../common/exception/business-exception'
import { getTenantId } from '../../../framework/tenant/tenant-context'
import { BizDataSupport, type BizDataQueryRequest } from './biz-data-support'
import type { FormQueryConfig } from './form-query-config'
import type { JoinConfig } from './join-sql-generator'
import type { BizDataPageVO, BizDataVO } from '../../../common/domain/biz-data'

/**
 * 业务数据门面（对齐 Java `com.workflow.engine.form.bizdata.BizDataService`）。
 *
 * Java 侧这一层还有「业务定制 handler 覆盖」与「流程守卫」两套扩展点
 * （`coveringIndex` / `guards`）。当前系统里注册的 handler 只覆盖
 * `emp_profile` 与 `leave_bill` 两个示例表单，与本次迁移的表单无交集，
 * 因此没有实现 —— 但**必须留痕**：一旦将来有表单需要定制，
 * 这里是唯一的接入点，不要绕过它直接调 `BizDataSupport`。
 */
@Injectable()
export class BizDataService {
  constructor(private readonly support: BizDataSupport) {}

  /** 已发布业务表单的列映射（供数据源适配器组装 metadata）。 */
  async loadColumns(formKey: string) {
    return this.support.loadColumns(formKey)
  }

  /** 分页查询业务数据。 */
  async query(formKey: string, req: BizDataQueryRequest): Promise<BizDataPageVO> {
    return this.support.queryGeneric(formKey, req)
  }

  /**
   * config 模式分页查询（声明式 JOIN + 虚拟列，对齐 Java `BizDataService.queryJoin`）。
   *
   * Java 在这一层还会先查业务定制 handler（`coveringIndex`）；当前系统注册的 handler
   * 只覆盖 `emp_profile` / `leave_bill` 两个示例表单，与本次迁移的表单无交集，
   * 因此与其余方法一致地**不实现** handler 覆盖（见类注释留痕）。
   */
  async queryJoin(
    formKey: string,
    req: BizDataQueryRequest,
    joins: JoinConfig[],
  ): Promise<BizDataPageVO> {
    return this.support.queryJoinConfig(formKey, req, joins)
  }

  /** sql 模式分页查询（走业务定制 handler，对齐 Java `BizDataService.querySql`）。 */
  async querySql(
    formKey: string,
    req: BizDataQueryRequest,
    config: FormQueryConfig,
  ): Promise<BizDataPageVO> {
    return this.support.querySqlTemplate(formKey, req, config)
  }

  /**
   * sql 模式分页查询（**绕过**业务定制 handler）。
   *
   * SQL 数据源执行的是管理员显式 SQL，不能被绑定表单的业务定制劫持
   * （对齐 Java `BizDataService.querySqlRaw`）。
   */
  async querySqlRaw(
    formKey: string | null,
    req: BizDataQueryRequest,
    config: FormQueryConfig,
  ): Promise<BizDataPageVO> {
    return this.support.querySqlTemplate(formKey, req, config)
  }

  /** 查询单条业务数据。 */
  async getById(formKey: string, id: string): Promise<BizDataVO> {
    const ctx = await this.support.loadContext(formKey)
    return this.support.findById(ctx, getTenantId(), id)
  }

  /** 按表单 key 批量解析显示文本。 */
  async resolveByFormKey(
    formKey: string,
    ids: string[],
    displayField: string | null,
  ): Promise<Record<string, string>> {
    return this.support.resolveByFormKey(formKey, ids, displayField)
  }

  /** 批量解析被引用记录的显示文本。 */
  async resolveDisplayTexts(
    sourceFormKey: string,
    ids: string[],
    displayField: string,
  ): Promise<Record<string, string>> {
    return this.support.resolveDisplayTexts(sourceFormKey, ids, displayField)
  }

  /** 统计各业务表单被 dataPicker 引用的情况。 */
  async countReferencedBy() {
    return this.support.countReferencedBy()
  }

  /**
   * 分页查询独立子表行。
   *
   * 对齐 Java `BizDataService.listSubRows`。**校验顺序不可换**：
   * `loadContext` → `requireSubTable`（404）→ `requireMainRow`（404）→ 读子表。
   * 顺序错了，同一个请求会从「字段不存在」变成「主行不存在」，错误消息就分叉了。
   */
  async listSubRows(
    formKey: string,
    id: string,
    field: string,
  ): Promise<Array<Record<string, unknown>>> {
    const ctx = await this.support.loadContext(formKey)
    const def = ctx.subTables.get(field)
    if (def === undefined) {
      throw new BusinessException(404, `子表字段不存在: ${field}`)
    }
    // 主表行不存在也返回 404（与 Java 的 requireMainRow 一致）
    await this.support.findById(ctx, getTenantId(), id)
    return this.support.readSubTableRows(def, id)
  }

  // ==================== 写路径（原为 notMigratedWrite 占位） ====================

  /** 新增业务数据（`BizDataService.create`）。 */
  async create(formKey: string, data: Record<string, unknown> | null): Promise<BizDataVO> {
    return this.support.createGeneric(formKey, data)
  }

  /** 更新业务数据（乐观锁；`version` 来自请求体）。 */
  async update(
    formKey: string,
    id: string,
    data: Record<string, unknown> | null,
    version: number | null,
  ): Promise<BizDataVO> {
    return this.support.updateGeneric(formKey, id, data, version)
  }

  /** 删除业务数据（级联删除子表行）。 */
  async remove(formKey: string, id: string): Promise<void> {
    await this.support.deleteGeneric(formKey, id)
  }

  /** 新增独立子表行。 */
  async addSubRow(
    formKey: string,
    id: string,
    field: string,
    data: Record<string, unknown> | null,
  ): Promise<Record<string, unknown>> {
    return this.support.addSubRow(formKey, id, field, data)
  }

  /** 更新独立子表行（乐观锁；`version` 来自请求体）。 */
  async updateSubRow(
    formKey: string,
    id: string,
    field: string,
    rowId: string,
    data: Record<string, unknown> | null,
    version: number | null,
  ): Promise<Record<string, unknown>> {
    return this.support.updateSubRow(formKey, id, field, rowId, data, version)
  }

  /** 删除独立子表行。 */
  async deleteSubRow(
    formKey: string,
    id: string,
    field: string,
    rowId: string,
  ): Promise<void> {
    await this.support.deleteSubRow(formKey, id, field, rowId)
  }
}
