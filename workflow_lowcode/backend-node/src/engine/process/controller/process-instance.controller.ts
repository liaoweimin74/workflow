import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { R } from '../../../common/domain/r'
import { PageResponse } from '../../../common/domain/page-response'
import { JavaStatusOk } from '../../../framework/http/java-status.decorator'
import { intQueryParam } from '../../../framework/http/query-params'
import {
  ProcessInstanceService,
  type ExecutionNodeVO,
  type ProcessInstanceVO,
  type StartProcessResult,
} from '../../runtime/process-instance.service'

/** 发起流程请求体，对齐 Java `StartProcessRequest`。 */
interface StartProcessRequest {
  processKey?: string
  businessKey?: string
  formDefId?: string
  variables?: Record<string, unknown>
}

/**
 * 流程实例接口，对齐 Java `ProcessInstanceController`（前缀 `/api/v1/process-instances`）。
 *
 * ⚠️ 路由声明顺序有讲究：`/history` 必须在 `/:id` **之前**声明，
 *    否则 `/history` 会被 `/:id` 捕获（Nest 按声明顺序匹配）。
 */
@Controller('api/v1/process-instances')
@JavaStatusOk()
export class ProcessInstanceController {
  constructor(private readonly service: ProcessInstanceService) {}

  @Post()
  async start(@Body() body: StartProcessRequest): Promise<R<StartProcessResult>> {
    return R.ok(
      await this.service.start(body.processKey ?? '', body.businessKey ?? null, body.variables),
    )
  }

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('size') size?: string,
  ): Promise<R<PageResponse<ProcessInstanceVO>>> {
    return R.ok(await this.service.listInstances(intQueryParam(page, 'page', 1), intQueryParam(size, 'size', 20)))
  }

  /** 历史实例（含已结束）。必须声明在 `/:id` 之前。 */
  @Get('history')
  async listHistory(
    @Query('page') page?: string,
    @Query('size') size?: string,
  ): Promise<R<PageResponse<ProcessInstanceVO>>> {
    return R.ok(await this.service.listHistory(intQueryParam(page, 'page', 1), intQueryParam(size, 'size', 20)))
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<R<ProcessInstanceVO>> {
    return R.ok(await this.service.getInstance(id))
  }

  @Get(':id/highlight')
  async highlight(
    @Param('id') id: string,
  ): Promise<R<{ completedActivityIds: string[]; activeActivityIds: string[] }>> {
    return R.ok(await this.service.getHighlight(id))
  }

  @Get(':id/prediction')
  async prediction(@Param('id') id: string): Promise<R<ExecutionNodeVO[]>> {
    return R.ok(await this.service.getPrediction(id))
  }

  @Get(':processInstanceId/variables')
  async variables(
    @Param('processInstanceId') processInstanceId: string,
  ): Promise<R<Record<string, unknown>>> {
    return R.ok(await this.service.getVariables(processInstanceId))
  }

  /**
   * 取单个流程变量；不存在时 data 为 null（**不是** 404）。
   *
   * 3 段路由，与本控制器的其它路由都不冲突：
   * `:a/variables/:c` 要求中间段字面量是 `variables`，因此
   * `tasks/<id>/variables` 不会被它吞掉（那一段是 `<id>`）。
   */
  @Get(':processInstanceId/variables/:name')
  async variable(
    @Param('processInstanceId') processInstanceId: string,
    @Param('name') name: string,
  ): Promise<R<unknown>> {
    return R.ok(await this.service.getVariable(processInstanceId, name))
  }

  /**
   * 经任务设置流程变量（写到任务所属实例）。
   *
   * ⚠️ 声明在实例变量路由**之前**：虽然按段数与字面量规则两者不会互相遮蔽，
   *    但「字面量段 `tasks` 先于参数段」是这套控制器的一贯约定，
   *    保持它能让后来加路由的人不必重新推演一遍匹配顺序。
   */
  @Put('tasks/:taskId/variables')
  async setTaskVariables(
    @Param('taskId') taskId: string,
    @Body() body: Record<string, unknown> | null,
  ): Promise<R<null>> {
    await this.service.setTaskVariables(taskId, body ?? {})
    return R.ok()
  }

  /** 批量设置流程变量（合并语义）。 */
  @Put(':processInstanceId/variables')
  async setVariables(
    @Param('processInstanceId') processInstanceId: string,
    @Body() body: Record<string, unknown> | null,
  ): Promise<R<null>> {
    await this.service.setVariables(processInstanceId, body ?? {})
    return R.ok()
  }

  /**
   * 设置单个流程变量。
   *
   * ⚠️ 请求体形状是 `{value: ...}` —— Java 取的是 `body.get("value")`，
   *    所以 `body` 为空对象时写入的是 `undefined`（变量被置为 null），
   *    而不是把整个 body 当值。
   */
  @Put(':processInstanceId/variables/:name')
  async setVariable(
    @Param('processInstanceId') processInstanceId: string,
    @Param('name') name: string,
    @Body() body: Record<string, unknown> | null,
  ): Promise<R<null>> {
    await this.service.setVariable(processInstanceId, name, body == null ? null : body.value)
    return R.ok()
  }

  /** 删除流程变量（不存在时静默成功）。 */
  @Delete(':processInstanceId/variables/:name')
  async removeVariable(
    @Param('processInstanceId') processInstanceId: string,
    @Param('name') name: string,
  ): Promise<R<null>> {
    await this.service.removeVariable(processInstanceId, name)
    return R.ok()
  }

  /** 流转记录（审批意见 + 节点信息）。Java 里挂在 ProcessHistoryController，前缀同为 process-instances。 */
  @Get(':id/history')
  async history(@Param('id') id: string): Promise<R<unknown[]>> {
    return R.ok(await this.service.getHistory(id))
  }

  /** 挂起实例（挂起后仍出现在运行列表中，与 Flowable 一致）。 */
  @Post(':id/suspend')
  async suspend(@Param('id') id: string): Promise<R<null>> {
    await this.service.suspendInstance(id)
    return R.ok()
  }

  /** 恢复实例。 */
  @Post(':id/resume')
  async resume(@Param('id') id: string): Promise<R<null>> {
    await this.service.resumeInstance(id)
    return R.ok()
  }

  /**
   * 终止实例。
   *
   * ⚠️ `reason` 是查询参数（不是请求体）；为空时 Java 传字面量 `"User terminated"`。
   */
  @Post(':id/terminate')
  async terminate(
    @Param('id') id: string,
    @Query('reason') reason?: string,
  ): Promise<R<null>> {
    await this.service.terminateInstance(id, reason ?? null)
    return R.ok()
  }
}

