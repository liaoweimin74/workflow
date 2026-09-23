import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { R } from '../../../common/domain/r'
import { JavaStatusOk } from '../../../framework/http/java-status.decorator'
import {
  FormDataService,
  type FormDataDTOVO,
  type FormDataVO,
} from '../form-data.service'

/** 表单数据保存请求体，对齐 Java `FormDataSaveRequest`。 */
interface FormDataSaveRequest {
  formDefId?: string | null
  processInstanceId?: string | null
  taskId?: string | null
  dataJson?: string | null
}

/**
 * 表单实例数据（对齐 Java `FormDataController`，前缀 `/api/v1/form-data`）。
 *
 * ⚠️ **写端点与读端点的形状不同**（这是契约的一部分，不要"统一"）：
 *    写端点返回实体的序列化 —— 11 个字段、**含 `tenantId`**；
 *    读端点返回 `FormDataDTO` —— 10 个字段、**没有 `tenantId`**。
 *    已由 golden 逐字段确认。
 *
 * ⚠️ 路由顺序：`draft/...`、`task/...`、`process-instance/...` 这些字面量段
 *    必须排在 `:id` 之前。Nest 按声明顺序匹配（Spring 另有"字面量优先"兜底，Nest 没有）。
 */
@Controller('api/v1/form-data')
@JavaStatusOk()
export class FormDataController {
  constructor(private readonly service: FormDataService) {}

  /** 保存当前数据（upsert，用于节点间传递）。 */
  @Post()
  async save(@Body() body: FormDataSaveRequest | null): Promise<R<FormDataVO>> {
    return R.ok(
      await this.service.save(
        body?.formDefId ?? null,
        body?.processInstanceId ?? null,
        body?.taskId ?? null,
        body?.dataJson ?? null,
      ),
    )
  }

  /** 保存审批快照（每次新建，不可变）。 */
  @Post('snapshot')
  async saveSnapshot(@Body() body: FormDataSaveRequest | null): Promise<R<FormDataVO>> {
    return R.ok(
      await this.service.saveSnapshot(
        body?.formDefId ?? null,
        body?.processInstanceId ?? null,
        body?.taskId ?? null,
        body?.dataJson ?? null,
      ),
    )
  }

  /** 保存发起页草稿（`processInstanceId` 为 null）。 */
  @Post('draft')
  async saveDraft(@Body() body: FormDataSaveRequest | null): Promise<R<FormDataVO>> {
    return R.ok(await this.service.saveDraft(body?.formDefId ?? null, body?.dataJson ?? null))
  }

  /** 查询发起页草稿（无草稿时 data 为 null）。 */
  @Get('draft/:formDefId')
  async getDraft(@Param('formDefId') formDefId: string): Promise<R<FormDataDTOVO | null>> {
    return R.ok(await this.service.findDraft(formDefId))
  }

  /** 清除发起页草稿。 */
  @Delete('draft/:formDefId')
  async clearDraft(@Param('formDefId') formDefId: string): Promise<R<null>> {
    await this.service.clearDraft(formDefId)
    return R.ok()
  }

  /** 按 taskId 查询审批快照。 */
  @Get('task/:taskId')
  async getByTaskId(@Param('taskId') taskId: string): Promise<R<FormDataDTOVO | null>> {
    return R.ok(await this.service.findByTaskId(taskId))
  }

  /** 按流程实例查询全部审批快照（创建时间倒序）。 */
  @Get('process-instance/:processInstanceId/snapshots')
  async getSnapshots(
    @Param('processInstanceId') processInstanceId: string,
  ): Promise<R<FormDataDTOVO[]>> {
    return R.ok(await this.service.findSnapshots(processInstanceId))
  }

  /** 按流程实例查询全部表单数据（含快照）。 */
  @Get('process-instance/:processInstanceId')
  async getByProcessInstance(
    @Param('processInstanceId') processInstanceId: string,
  ): Promise<R<FormDataDTOVO[]>> {
    return R.ok(await this.service.findByProcessInstanceAll(processInstanceId))
  }

  /**
   * 按实例 + 表单定义查询当前数据。
   *
   * ⚠️ 两个查询参数在 Java 里都是**必填**（`@RequestParam` 无 `required=false`）：
   *    缺一个会抛 `MissingServletRequestParameterException`。golden 已覆盖该端点的
   *    正常路径；缺参时的状态码属于规格 U8 的已知分歧（Node 会退化成空串查询）。
   */
  @Get()
  async getCurrent(
    @Query('processInstanceId') processInstanceId?: string,
    @Query('formDefId') formDefId?: string,
  ): Promise<R<FormDataDTOVO | null>> {
    return R.ok(
      await this.service.findByProcessInstance(
        processInstanceId ?? '',
        formDefId ?? '',
      ),
    )
  }

  /** 获取单条表单数据（不存在 → 500，对齐 Java 的 RuntimeException）。 */
  @Get(':id')
  async getById(@Param('id') id: string): Promise<R<FormDataDTOVO>> {
    return R.ok(await this.service.getById(id))
  }

  /** 更新当前数据（只改 dataJson）。 */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: FormDataSaveRequest | null,
  ): Promise<R<FormDataVO>> {
    return R.ok(await this.service.update(id, body?.dataJson ?? null))
  }
}
