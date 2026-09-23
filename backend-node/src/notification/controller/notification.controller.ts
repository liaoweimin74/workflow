import { Body, Controller, Delete, Get, Param, Post, Put, Query, Sse } from '@nestjs/common'
import type { MessageEvent } from '@nestjs/common'
import type { Observable } from 'rxjs'
import { R } from '../../common/domain/r'
import { PageResult } from '../../common/domain/page-result'
import { JavaStatusOk } from '../../framework/http/java-status.decorator'
import {
  blankToNull,
  intQueryParam,
  longPathParam,
  toBoolOrNull,
  toTimestampOrNull,
} from '../../framework/http/query-params'
import { CurrentUser } from '../../framework/security/current-user.decorator'
import { Public, type LoginUser } from '../../framework/security/jwt-auth.guard'
import { ACCESS_TOKEN_TYPE, JwtTokenProvider } from '../../framework/security/jwt-token.provider'
import { NotificationService, type MessageVO } from '../service/notification.service'
import { NotificationSseManager } from '../sse/notification-sse.manager'

/**
 * 抛 `IllegalArgumentException` 形态的错（⇒ HTTP 400，而不是业务 200）。
 *
 * Java 的 `NotificationSseController` 用的是 `throw new IllegalArgumentException(...)`，
 * 全局异常处理器把它映射成 HTTP 400 + `R{code:400,...}`。用 `BusinessException` 会变成 200，分叉。
 */
function invalidArgument(message: string): Error {
  const error = new Error(message)
  error.name = 'IllegalArgumentException'
  return error
}

/**
 * 用户端消息接口（对齐 Java `NotificationController`，前缀 `/api/v1/notifications`）。
 *
 * ⚠️ 分页形状是 `PageResult{total,page,size,rows}`，**不是** PageResponse。
 *    本项目三种分页形状并存，必须按 golden 选，不能凭感觉。
 *
 * ⚠️ 当前登录用户取自 SecurityContext（Node 侧是 `@CurrentUser()`），
 *    **不接收前端传 userId** —— 否则任何人可以读别人的消息。
 *
 * ⚠️ **路由声明顺序即匹配顺序**（Nest 与 Spring 不同：Spring 让字面量优先于变量，
 *    Nest 按声明先后）。`unread-count` / `read-batch` / `read-all` 必须排在
 *    `:id` 系列之前，否则会被 `:id` 吃掉（本项目已被这个坑绊过两次）。
 */
@Controller('api/v1/notifications')
@JavaStatusOk()
export class NotificationController {
  constructor(
    private readonly service: NotificationService,
    private readonly sseManager: NotificationSseManager,
    private readonly jwt: JwtTokenProvider,
  ) {}

  /** 消息分页列表（标题/分类/已读状态/时间段/消息类型筛选）。 */
  @Get()
  async list(
    @CurrentUser() user: LoginUser,
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('keyword') keyword?: string,
    @Query('category') category?: string,
    @Query('unread') unread?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('messageType') messageType?: string,
  ): Promise<R<PageResult<MessageVO>>> {
    return R.ok(
      // `page`/`size` 是显式 `@RequestParam int`（形态 A）：非法值 → HTTP 500
      await this.service.listByUserId(
        user.userId,
        intQueryParam(page, 'page', 1),
        intQueryParam(size, 'size', 20),
        {
          keyword: blankToNull(keyword),
          category: blankToNull(category),
          unread: toBoolOrNull(unread),
          start: toTimestampOrNull(start),
          end: toTimestampOrNull(end),
          messageType: blankToNull(messageType),
        },
      ),
    )
  }

  /** 未读消息数（必须声明在 `:id` 之前）。 */
  @Get('unread-count')
  async unreadCount(@CurrentUser() user: LoginUser): Promise<R<number>> {
    return R.ok(await this.service.getUnreadCount(user.userId))
  }

  /**
   * SSE 实时消息推送（对齐 Java `NotificationSseController`）。
   *
   * ⚠️ **公开路由 + token 走 query 参数**：浏览器的 `EventSource` **无法自定义请求头**，
   *    所以前端把 JWT 放在 `?token=`（`frontend/src/modules/notification/stores/notification.ts`），
   *    Java 侧同样是 `@RequestParam("token")` 并把这个路径在 SecurityConfig 里放行。
   *    校验逻辑照抄：`validateToken` 失败 → 「无效的访问令牌」；
   *    不是 access token → 「令牌类型必须是访问令牌」；两者都是 `IllegalArgumentException` ⇒ **HTTP 400**。
   *
   * ⚠️ **必须声明在 `:id` 之前**（Nest 按声明顺序匹配，否则 `sse` 会被当成 id）。
   *
   * ⚠️ **不进契约网**：契约比对按「发一次请求读一个 JSON」工作，流式响应不适用
   *    （规格 U12）。它的验证方式是 `test/integration/sse.spec.ts`：
   *    真起应用 → 用有效 token 连上 → 发一条站内信 → 断言收到 `new-message`。
   */
  @Public()
  @Sse('sse')
  sse(@Query('token') token?: string): Observable<MessageEvent> {
    const value = token ?? ''
    if (!this.jwt.validateToken(value)) {
      throw invalidArgument('无效的访问令牌')
    }
    if (this.jwt.getTokenType(value) !== ACCESS_TOKEN_TYPE) {
      throw invalidArgument('令牌类型必须是访问令牌')
    }
    return this.sseManager.register(this.jwt.getUserIdFromToken(value))
  }

  /** 批量标记已读（必须声明在 `:id` 之前）；body 是**裸数字数组**。 */
  @Post('read-batch')
  async batchMarkAsRead(
    @CurrentUser() user: LoginUser,
    @Body() messageIds: number[],
  ): Promise<R<void>> {
    await this.service.batchMarkAsRead(messageIds, user.userId)
    return R.ok()
  }

  /** 全部标记已读（必须声明在 `:id` 之前）。 */
  @Post('read-all')
  async markAllAsRead(@CurrentUser() user: LoginUser): Promise<R<void>> {
    await this.service.markAllAsRead(user.userId)
    return R.ok()
  }

  /** 消息详情。 */
  @Get(':id')
  async getById(
    @CurrentUser() user: LoginUser,
    @Param('id') id: string,
  ): Promise<R<MessageVO>> {
    return R.ok(await this.service.getById(longPathParam(id, 'id'), user.userId))
  }

  /** 标记已读。 */
  @Put(':id/read')
  async markAsRead(@CurrentUser() user: LoginUser, @Param('id') id: string): Promise<R<void>> {
    await this.service.markAsRead(longPathParam(id, 'id'), user.userId)
    return R.ok()
  }

  /** 切换已读状态，返回**切换后**的状态（PENDING / SENT）。 */
  @Post(':id/toggle-read')
  async toggleRead(
    @CurrentUser() user: LoginUser,
    @Param('id') id: string,
  ): Promise<R<string>> {
    return R.ok(await this.service.toggleRead(longPathParam(id, 'id'), user.userId))
  }

  /** 删除消息（只删当前用户自己的收件人行）。 */
  @Delete(':id')
  async delete(@CurrentUser() user: LoginUser, @Param('id') id: string): Promise<R<void>> {
    await this.service.delete(longPathParam(id, 'id'), user.userId)
    return R.ok()
  }
}
