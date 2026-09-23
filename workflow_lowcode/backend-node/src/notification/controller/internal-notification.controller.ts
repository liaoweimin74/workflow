import { BadRequestException, Body, Controller, Post, Query } from '@nestjs/common'
import { R } from '../../common/domain/r'
import { JavaStatusOk } from '../../framework/http/java-status.decorator'
import { toIntList, toStringList } from '../../framework/http/query-params'
import {
  MessageSendService,
  parseChannelType,
  type ChannelType,
} from '../service/message-send.service'

/** 按模板发送的请求体（对齐 Java `TemplateSendRequest`）。 */
interface TemplateSendRequest {
  senderId?: number | null
  templateCode?: string | null
  variables?: Record<string, unknown> | null
  messageType?: string | null
  eventCode?: string | null
}

/**
 * 内部通知接口（对齐 Java `InternalNotificationController`，前缀 `/api/v1/internal/notifications`）。
 *
 * ⚠️ 这是**给其它模块调用**的接口，不是前端接口：`recipientIds` 与 `channels`
 *    走**查询参数**（Java 是 `@RequestParam List<...>`），只有消息本身走 body。
 *    Recorder 里必须写成 `query`，写进 body 会静默变成「收件人为空 → 一条都不发」。
 *
 * ⚠️ 站内信落库是**同步**完成的（Java 的 `@EventListener` 非异步），
 *    所以响应返回时消息已经可读 —— 契约场景依赖这个时序。
 */
@Controller('api/v1/internal/notifications')
@JavaStatusOk()
export class InternalNotificationController {
  constructor(private readonly sendService: MessageSendService) {}

  /**
   * 发送自由内容消息。
   *
   * 对齐 Java `@RequestBody Message message`：body 里需要调用方自己填好
   * tenantId / templateCode / senderId / senderType / title / priority /
   * category / messageType（这几列在库里是 NOT NULL，缺了会写库失败）。
   */
  @Post('send')
  async send(
    @Body() body: Record<string, unknown>,
    @Query('recipientIds') recipientIds?: string | string[],
    @Query('channels') channels?: string | string[],
  ): Promise<R<void>> {
    const message = {
      tenantId: text(body.tenantId),
      templateCode: text(body.templateCode) ?? '',
      eventCode: text(body.eventCode),
      senderId: numberOrZero(body.senderId),
      senderType: text(body.senderType) ?? '',
      title: text(body.title),
      content: body.content ?? null,
      linkJson: body.linkJson ?? null,
      contentType: text(body.contentType),
      priority: text(body.priority) ?? '',
      category: text(body.category) ?? '',
      messageType: text(body.messageType) ?? '',
    }
    await this.sendService.sendFree(
      message,
      toIntList(recipientIds),
      requireChannels(channels),
    )
    return R.ok()
  }

  /**
   * 按模板发送。
   *
   * `messageType` 缺省为 `PRIVATE`；`eventCode` 非空时**先校验事件存在且启用**。
   */
  @Post('send-by-template')
  async sendByTemplate(
    @Body() body: TemplateSendRequest,
    @Query('recipientIds') recipientIds?: string | string[],
    @Query('channels') channels?: string | string[],
  ): Promise<R<void>> {
    await this.sendService.sendByTemplate(
      {
        senderId: body.senderId ?? null,
        templateCode: body.templateCode ?? '',
        variables: body.variables ?? null,
        messageType: body.messageType ?? null,
        eventCode: body.eventCode ?? null,
      },
      toIntList(recipientIds),
      requireChannels(channels),
    )
    return R.ok()
  }
}

/**
 * 解析 `channels` 查询参数。
 *
 * ⚠️ Java 侧 `List<ChannelType>` 遇到无法识别的枚举值会抛
 *    `MethodArgumentTypeMismatchException` → **HTTP 400**。这里必须同样拒绝，
 *    不能「静默丢掉非法渠道」：那会让一条 Java 根本没发的消息被发出去。
 *    （响应体文案与 Spring 的默认错误体不同，属规格 §9 开放项。）
 */
function requireChannels(value: string | string[] | undefined): ChannelType[] {
  const raw = toStringList(value)
  if (raw.length === 0) throw new BadRequestException('channels 必填')
  const out: ChannelType[] = []
  for (const item of raw) {
    const parsed = parseChannelType(item)
    if (parsed === null) throw new BadRequestException(`未知渠道: ${item}`)
    out.push(parsed)
  }
  return out
}

/** 仅接受字符串；其余类型按「未传」处理（对齐 Jackson 的宽松绑定）。 */
function text(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return typeof value === 'string' ? value : String(value)
}

function numberOrZero(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}
