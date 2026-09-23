import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { R } from '../../../common/domain/r'
import { PageResponse } from '../../../common/domain/page-response'
import { JavaStatusOk } from '../../../framework/http/java-status.decorator'
import { intQueryParam } from '../../../framework/http/query-params'
import { CurrentUser } from '../../../framework/security/current-user.decorator'
import type { LoginUser } from '../../../framework/security/jwt-auth.guard'
import {
  TaskService,
  type CompleteTaskResponse,
  type TaskDetailVO,
  type TaskDoneVO,
  type TaskTodoVO,
} from '../task.service'

/**
 * 任务接口，对齐 Java `TaskController`（前缀 `/api/v1/tasks`）。
 *
 * ⚠️ `/historic` 必须在 `/:id` 之前声明，否则会被 `/:id` 捕获。
 *
 * 任务 VO 的字段名是实测确认的：主键字段叫 **`taskId`** 而不是 `id`
 * （我最初按 `id` 写模板，导致契约场景里路径解析为空、请求打到 `/api/v1/tasks/`）。
 */
@Controller('api/v1/tasks')
@JavaStatusOk()
export class TaskController {
  constructor(private readonly service: TaskService) {}

  @Get()
  async listTodo(
    @Query('assignee') assignee: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ): Promise<R<PageResponse<TaskTodoVO>>> {
    return R.ok(await this.service.listTodo(assignee, intQueryParam(page, 'page', 1), intQueryParam(size, 'size', 20)))
  }

  @Get('historic')
  async listHistoric(
    @Query('userId') userId: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ): Promise<R<PageResponse<TaskDoneVO>>> {
    return R.ok(await this.service.listHistoric(userId, intQueryParam(page, 'page', 1), intQueryParam(size, 'size', 20)))
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<R<TaskDetailVO>> {
    return R.ok(await this.service.getTaskDetail(id))
  }

  @Post(':id/claim')
  async claim(@Param('id') id: string, @Query('userId') userId: string): Promise<R<null>> {
    await this.service.claimTask(id, userId)
    return R.ok()
  }

  @Post(':id/complete')
  async complete(
    @Param('id') id: string,
    @Body() body: { userId?: string; comment?: string; variables?: Record<string, unknown> },
  ): Promise<R<CompleteTaskResponse>> {
    return R.ok(await this.service.completeTask(id, body ?? {}))
  }

  /**
   * 驳回（任务退回发起人节点，流程继续）。
   *
   * ⚠️ 操作人取**登录态**（Java `RejectService` 用的是 `getCurrentUserId()`）；
   *    body 里只有 `reason`（Java 的 `RejectRequest` 也只有这一个字段）。
   * ⚠️ 两条错误都是 HTTP 500（不是 200+code），见 `rejectTask` 的注释。
   */
  @Post(':id/reject')
  async reject(
    @CurrentUser() user: LoginUser,
    @Param('id') id: string,
    @Body() body: { reason?: string } | undefined,
  ): Promise<R<null>> {
    await this.service.rejectTask(id, String(user.userId), body?.reason ?? null)
    return R.ok()
  }

  /**
   * 拒绝（不同意并**终止整个流程**）。
   *
   * ⚠️ 与 `reject`（驳回）不同：驳回退回发起人、流程继续；拒绝直接终止实例。
   * ⚠️ 操作人取**登录态**，不接收 body 里的 userId（对齐 Java：refuse 用的是
   *    `getCurrentUserId()`，而 transfer/add-sign 才允许 body 覆盖）。
   */
  @Post(':id/refuse')
  async refuse(
    @CurrentUser() user: LoginUser,
    @Param('id') id: string,
    @Body() body: { reason?: string } | undefined,
  ): Promise<R<null>> {
    await this.service.refuseTask(id, String(user.userId), body?.reason ?? null)
    return R.ok()
  }

  /**
   * 转办（彻底移交任务，与「委派」不同）。
   *
   * ⚠️ body 里的 `fromUser` **允许覆盖操作人**：Java 用
   *    `resolveCurrentUserId(request.getFromUser())` —— 传了就用传的，没传才取登录态。
   *    （`refuse` 正相反，只认登录态。）
   * ⚠️ 三种错误的 HTTP 形态各不相同，见 `transferTask` 的注释。
   */
  @Post(':id/transfer')
  async transfer(
    @CurrentUser() user: LoginUser,
    @Param('id') id: string,
    @Body() body: { fromUser?: string; toUser?: string; reason?: string } | undefined,
  ): Promise<R<null>> {
    const resolved = body?.fromUser
    const fromUser =
      resolved !== undefined && resolved !== null && resolved.trim() !== ''
        ? resolved
        : String(user.userId)
    await this.service.transferTask(id, { ...(body ?? {}), fromUser })
    return R.ok()
  }

  /**
   * 委派（对齐 Java `TaskController.delegate`）。
   *
   * ⚠️ `fromUser` 允许 body 覆盖（与 transfer/add-sign/forward-sign 相同）。
   * ⚠️ 委派与转办的区别见服务层注释：被委派人「完成」时会把任务**交还**原办理人再推进。
   */
  @Post(':id/delegate')
  async delegate(
    @CurrentUser() user: LoginUser,
    @Param('id') id: string,
    @Body() body: { delegateTo?: string; fromUser?: string; comment?: string } | undefined,
  ): Promise<R<null>> {
    const resolved = body?.fromUser
    const fromUser =
      resolved !== undefined && resolved !== null && resolved.trim() !== ''
        ? resolved
        : String(user.userId)
    await this.service.delegateTask(id, {
      delegateTo: body?.delegateTo ?? null,
      fromUser,
      comment: body?.comment ?? null,
    })
    return R.ok()
  }

  /**
   * 加签（对齐 Java `TaskController.addSign`）。
   *
   * ⚠️ `userId` 允许 body 覆盖（与 transfer/forward-sign 相同）。
   * ⚠️ `users` 为空时服务层抛 `IllegalArgumentException` 形态 → **HTTP 400**。
   */
  @Post(':id/add-sign')
  async addSign(
    @CurrentUser() user: LoginUser,
    @Param('id') id: string,
    @Body() body: { users?: string[]; userId?: string; comment?: string } | undefined,
  ): Promise<R<null>> {
    const resolved = body?.userId
    const userId =
      resolved !== undefined && resolved !== null && resolved.trim() !== ''
        ? resolved
        : String(user.userId)
    await this.service.addSignTask(id, {
      users: body?.users ?? null,
      userId,
      comment: body?.comment ?? null,
    })
    return R.ok()
  }

  /**
   * 转签（对齐 Java `TaskController.forwardSign`）。
   *
   * ⚠️ 这里的 `userId` 是**允许 body 覆盖**的（与 transfer 相同、与 refuse/reject 相反）：
   *    先看 `body.userId`，为空才回落到登录态。而登录态**一定**有值（有 JWT 才有这个请求），
   *    所以「不写意见」那条分支（Java 的 `userId == null`）在本项目里不可达 ——
   *    服务层仍保留该判定，因为隔离测试直接调服务时会用到。
   */
  @Post(':id/forward-sign')
  async forwardSign(
    @CurrentUser() user: LoginUser,
    @Param('id') id: string,
    @Body() body: { userId?: string; toUser?: string; comment?: string } | undefined,
  ): Promise<R<null>> {
    const resolved = body?.userId
    const userId =
      resolved !== undefined && resolved !== null && resolved.trim() !== ''
        ? resolved
        : String(user.userId)
    await this.service.forwardSignTask(id, {
      userId,
      toUser: body?.toUser ?? null,
      comment: body?.comment ?? null,
    })
    return R.ok()
  }

  /**
   * 对指定任务发起催办（对齐 Java `TaskRemindController.remind`）。
   *
   * 催办发起人从登录态取（Java 也是从 SecurityContext 取，不接收前端传 userId）。
   * 路由与 `by-instance/...` 不冲突：段数不同（2 段 vs 3 段）。
   */
  @Post(':taskId/remind')
  async remind(
    @CurrentUser() user: LoginUser,
    @Param('taskId') taskId: string,
  ): Promise<R<null>> {
    await this.service.remindTask(taskId, String(user.userId))
    return R.ok()
  }

  /**
   * 对某流程实例下所有活跃任务逐个催办（对齐 Java `remindByInstance`）。
   *
   * ⚠️ 失败走的是 `R.fail(...)` —— **HTTP 200 + body 内 code**（404 / 429），
   *    不是 HTTP 4xx。这是 Java 的写法，照抄。
   */
  @Post('by-instance/:processInstanceId/remind')
  async remindByInstance(
    @CurrentUser() user: LoginUser,
    @Param('processInstanceId') processInstanceId: string,
  ): Promise<R<null>> {
    const outcome = await this.service.remindByInstance(processInstanceId, String(user.userId))
    if (outcome === 'noTasks') return R.fail(404, '当前没有待办任务，无需催办')
    if (outcome === 'allSkipped') return R.fail(429, '催办失败：24小时内已催办过或无有效办理人')
    return R.ok()
  }
}

