import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common'
import { R } from '../../common/domain/r'
import { PageResult } from '../../common/domain/page-result'
import { JavaStatusOk } from '../../framework/http/java-status.decorator'
import {
  blankToNull,
  intQueryParam,
  longPathParam,
  toBoolOrNull,
  toIntList,
} from '../../framework/http/query-params'
import { CurrentUser } from '../../framework/security/current-user.decorator'
import type { LoginUser } from '../../framework/security/jwt-auth.guard'
import {
  NotificationAdminService,
  type AdminPageVO,
  type AnnouncementRowVO,
  type ChannelType,
  type ChannelVO,
  type DeliveryRowVO,
  type MessageTemplateVO,
  type NotificationEventVO,
  type NotificationOverviewVO,
  type SubscriptionRowVO,
} from '../service/notification-admin.service'
import { NotificationWriteService, type TemplateWriteRequest } from '../service/notification-write.service'
import type { MessageVO } from '../service/notification.service'

/**
 * 管理端通知接口（对齐 Java `notification.admin` 包，前缀 `/api/v1/admin/notification`）。
 *
 * 所有方法都先过 `requireAdmin()`，与 Java 每个 handler 首行调用
 * `NotificationAdminAuthorization.requireAdmin()` 一致。
 *
 * 路由按资源拆成 4 个 Controller（Java 也是 4 个类），
 * 前缀不同所以互不冲突。
 */

/** 模板管理（`/api/v1/admin/notification/templates`）。 */
@Controller('api/v1/admin/notification/templates')
@JavaStatusOk()
export class NotificationTemplateController {
  constructor(
    private readonly service: NotificationAdminService,
    private readonly writeService: NotificationWriteService,
  ) {}

  /** ⚠️ 返回**裸数组**（Java 侧 `R<List<MessageTemplate>>`），不是分页对象。 */
  @Get()
  async list(@CurrentUser() user: LoginUser): Promise<R<MessageTemplateVO[]>> {
    return R.ok(await this.service.listTemplates(user))
  }

  /** 创建模板；返回模板实体。 */
  @Post()
  async create(
    @CurrentUser() user: LoginUser,
    @Body() body: Record<string, unknown>,
  ): Promise<R<MessageTemplateVO>> {
    return R.ok(await this.writeService.createTemplate(user, normalizeTemplateRequest(body)))
  }

  /**
   * 更新模板；返回模板实体。
   *
   * 路由与 `POST :id/toggle` 不冲突：方法与段数都不同，不会被互相吞掉。
   */
  @Put(':id')
  async update(
    @CurrentUser() user: LoginUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<R<MessageTemplateVO>> {
    return R.ok(
      await this.writeService.updateTemplate(user, longPathParam(id, 'id'), normalizeTemplateRequest(body)),
    )
  }

  /** 启用/停用模板（切换，不接收目标状态）。 */
  @Post(':id/toggle')
  async toggle(@CurrentUser() user: LoginUser, @Param('id') id: string): Promise<R<void>> {
    await this.writeService.toggleTemplate(user, longPathParam(id, 'id'))
    return R.ok()
  }
}

/** 渠道管理（`/api/v1/admin/notification/channels`）。 */
@Controller('api/v1/admin/notification/channels')
@JavaStatusOk()
export class NotificationChannelController {
  constructor(
    private readonly service: NotificationAdminService,
    private readonly writeService: NotificationWriteService,
  ) {}

  /** ⚠️ 返回**裸数组**。 */
  @Get()
  async list(@CurrentUser() user: LoginUser): Promise<R<ChannelVO[]>> {
    return R.ok(await this.service.listChannels(user))
  }

  /** 启用渠道（ID 1..5 是前端契约，见 `CHANNEL_BY_ID`）。 */
  @Post(':id/enable')
  async enable(@CurrentUser() user: LoginUser, @Param('id') id: string): Promise<R<void>> {
    await this.writeService.enableChannel(user, longPathParam(id, 'id'))
    return R.ok()
  }

  /** 禁用渠道。 */
  @Post(':id/disable')
  async disable(@CurrentUser() user: LoginUser, @Param('id') id: string): Promise<R<void>> {
    await this.writeService.disableChannel(user, longPathParam(id, 'id'))
    return R.ok()
  }

  /**
   * 更新渠道配置（**整批覆盖**：未出现在 body 里的键会被删掉）。
   * 传 `{}` 即清空该渠道的全部凭据配置（`__enabled` 开关保留）。
   */
  @Put(':id/config')
  async updateConfig(
    @CurrentUser() user: LoginUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<R<void>> {
    await this.writeService.updateChannelConfig(user, longPathParam(id, 'id'), body ?? {})
    return R.ok()
  }

  /**
   * 渠道连通性测试。
   *
   * ⚠️ IN_APP 会真实落库一条测试消息（无法撤回），契约场景只覆盖其错误分支。
   */
  @Post(':id/test')
  async test(@CurrentUser() user: LoginUser, @Param('id') id: string): Promise<R<void>> {
    await this.writeService.testChannel(user, longPathParam(id, 'id'))
    return R.ok()
  }
}

/** 业务事件定义管理（`/api/v1/admin/notification/events`）。 */
@Controller('api/v1/admin/notification/events')
@JavaStatusOk()
export class NotificationEventController {
  constructor(
    private readonly service: NotificationAdminService,
    private readonly writeService: NotificationWriteService,
  ) {}

  /** 分页形状是 `PageResult{total,page,size,rows}`。 */
  @Get()
  async list(
    @CurrentUser() user: LoginUser,
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('keyword') keyword?: string,
    @Query('enabled') enabled?: string,
  ): Promise<R<PageResult<NotificationEventVO>>> {
    return R.ok(
      await this.service.listEvents(
        user,
        intQueryParam(page, 'page', 1),
        intQueryParam(size, 'size', 20),
        blankToNull(keyword),
        toBoolOrNull(enabled),
      ),
    )
  }

  /** 创建事件定义（body 是字符串映射，Java 侧签名是 `Map<String, String>`）。 */
  @Post()
  async create(
    @CurrentUser() user: LoginUser,
    @Body() body: Record<string, unknown>,
  ): Promise<R<NotificationEventVO>> {
    return R.ok(
      await this.writeService.createEvent(user, {
        eventCode: str(body.eventCode),
        eventName: str(body.eventName),
        description: str(body.description),
        businessDomain: str(body.businessDomain),
      }),
    )
  }

  /** 更新事件定义（**不含 eventCode** —— 事件代码不可改）。 */
  @Put(':id')
  async update(
    @CurrentUser() user: LoginUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<R<NotificationEventVO>> {
    return R.ok(
      await this.writeService.updateEvent(user, longPathParam(id, 'id'), {
        eventName: str(body.eventName),
        description: str(body.description),
        businessDomain: str(body.businessDomain),
      }),
    )
  }

  /** 删除事件定义；被模板或订阅规则引用时 409。 */
  @Delete(':id')
  async remove(@CurrentUser() user: LoginUser, @Param('id') id: string): Promise<R<void>> {
    await this.writeService.deleteEvent(user, longPathParam(id, 'id'))
    return R.ok()
  }

  /** 启用/停用（切换）。 */
  @Post(':id/toggle')
  async toggle(@CurrentUser() user: LoginUser, @Param('id') id: string): Promise<R<void>> {
    await this.writeService.toggleEvent(user, longPathParam(id, 'id'))
    return R.ok()
  }
}

/** 统计（`/api/v1/admin/notification/stats`）。 */
@Controller('api/v1/admin/notification/stats')
@JavaStatusOk()
export class NotificationStatsController {
  constructor(private readonly service: NotificationAdminService) {}

  /** 消息统计概览。 */
  @Get('overview')
  async overview(@CurrentUser() user: LoginUser): Promise<R<NotificationOverviewVO>> {
    return R.ok(await this.service.overview(user))
  }
}

/** 公告管理（`/api/v1/admin/notification/announcements`）。 */
@Controller('api/v1/admin/notification/announcements')
@JavaStatusOk()
export class NotificationAnnouncementController {
  constructor(
    private readonly service: NotificationAdminService,
    private readonly writeService: NotificationWriteService,
  ) {}

  /** 公告列表（分页外壳是 `{rows,total,page,size}`）。 */
  @Get()
  async list(
    @CurrentUser() user: LoginUser,
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('keyword') keyword?: string,
  ): Promise<R<AdminPageVO<AnnouncementRowVO>>> {
    return R.ok(
      await this.service.listAnnouncements(user, intQueryParam(page, 'page', 1), intQueryParam(size, 'size', 20), blankToNull(keyword)),
    )
  }

  /**
   * 发布公告。
   *
   * ⚠️ 入参全部走**查询参数**（Java 是 `@RequestParam`），body 是空的 ——
   *    写成 JSON body 会得到「required 参数缺失 → HTTP 400」。
   * ⚠️ `recipientIds` 是 `List<Long>`：既接受 `?recipientIds=1,2` 也接受重复参数。
   */
  @Post()
  async publish(
    @CurrentUser() user: LoginUser,
    @Query('title') title?: string,
    @Query('content') content?: string,
    @Query('recipientIds') recipientIds?: string | string[],
  ): Promise<R<void>> {
    const ids = toIntList(recipientIds)
    if (title === undefined || content === undefined || ids.length === 0) {
      // Java 的 @RequestParam 必填缺失/类型不符 → HTTP 400（响应体文案属规格 §9 开放项）
      throw new BadRequestException('title / content / recipientIds 均为必填')
    }
    await this.writeService.publishAnnouncement(user, title, content, ids)
    return R.ok()
  }

  /** 公告详情（返回消息实体，`readStatus` 恒为 null）。 */
  @Get(':id')
  async detail(
    @CurrentUser() user: LoginUser,
    @Param('id') id: string,
  ): Promise<R<MessageVO>> {
    return R.ok(await this.writeService.getAnnouncement(user, longPathParam(id, 'id')))
  }

  /** 撤回公告（硬删收件人行 + 消息行）。 */
  @Delete(':id')
  async recall(@CurrentUser() user: LoginUser, @Param('id') id: string): Promise<R<void>> {
    await this.writeService.recallAnnouncement(user, longPathParam(id, 'id'))
    return R.ok()
  }
}

/** 投递记录（`/api/v1/admin/notification/deliveries`）。 */
@Controller('api/v1/admin/notification/deliveries')
@JavaStatusOk()
export class NotificationDeliveryController {
  constructor(
    private readonly service: NotificationAdminService,
    private readonly writeService: NotificationWriteService,
  ) {}

  /**
   * 投递记录列表。
   *
   * `channel` 是 Java 的 `ChannelType` 枚举参数：传了无法识别的值，
   * Spring 会抛转换异常 → HTTP 400。这里退化为 null（不过滤），
   * 与 `toInt` 的已知分歧同类，已记入规格开放项。
   */
  @Get()
  async list(
    @CurrentUser() user: LoginUser,
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('keyword') keyword?: string,
    @Query('recipient') recipient?: string,
    @Query('channel') channel?: string,
  ): Promise<R<AdminPageVO<DeliveryRowVO>>> {
    return R.ok(
      await this.service.listDeliveries(
        user,
        intQueryParam(page, 'page', 1),
        intQueryParam(size, 'size', 20),
        blankToNull(keyword),
        blankToNull(recipient),
        parseChannel(channel),
      ),
    )
  }

  /** 手动重发（按原消息重新走一遍发送链路）。 */
  @Post(':id/retry')
  async retry(@CurrentUser() user: LoginUser, @Param('id') id: string): Promise<R<void>> {
    await this.writeService.retryDelivery(user, longPathParam(id, 'id'))
    return R.ok()
  }
}

/** 订阅规则（`/api/v1/admin/notification/subscriptions`）。 */
@Controller('api/v1/admin/notification/subscriptions')
@JavaStatusOk()
export class NotificationSubscriptionController {
  constructor(
    private readonly service: NotificationAdminService,
    private readonly writeService: NotificationWriteService,
  ) {}

  /** 订阅规则列表。 */
  @Get()
  async list(
    @CurrentUser() user: LoginUser,
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('eventCode') eventCode?: string,
  ): Promise<R<AdminPageVO<SubscriptionRowVO>>> {
    return R.ok(
      await this.service.listSubscriptions(
        user,
        intQueryParam(page, 'page', 1),
        intQueryParam(size, 'size', 20),
        blankToNull(eventCode),
      ),
    )
  }

  /** 创建订阅规则（Java 侧不校验必填，NOT NULL 由数据库拒绝）。 */
  @Post()
  async create(
    @CurrentUser() user: LoginUser,
    @Body() body: Record<string, unknown>,
  ): Promise<R<void>> {
    await this.writeService.createSubscription(user, body ?? {})
    return R.ok()
  }

  /** 更新订阅规则（只有非 null 的字段才覆盖）。 */
  @Put(':id')
  async update(
    @CurrentUser() user: LoginUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<R<void>> {
    await this.writeService.updateSubscription(user, longPathParam(id, 'id'), body ?? {})
    return R.ok()
  }

  /** 删除订阅规则；不存在 → 500「订阅规则不存在」。 */
  @Delete(':id')
  async remove(@CurrentUser() user: LoginUser, @Param('id') id: string): Promise<R<void>> {
    await this.writeService.deleteSubscription(user, longPathParam(id, 'id'))
    return R.ok()
  }
}

/** 渠道枚举参数解析；无法识别返回 null（见 delivery 控制器上的说明）。 */
function parseChannel(value: string | undefined): ChannelType | null {
  const normalized = blankToNull(value)
  if (normalized === null) return null
  const upper = normalized.toUpperCase()
  return CHANNELS.includes(upper as ChannelType) ? (upper as ChannelType) : null
}

const CHANNELS: ChannelType[] = ['IN_APP', 'SMS', 'WECHAT_WORK', 'WECHAT_MINIPROGRAM', 'APP']

/**
 * 把模板写请求的 body 归一成 `string | null` / `boolean | null`。
 *
 * ⚠️ **必须在控制器边界做这件事**：JSON 里没写的字段在 JS 里是 `undefined`，
 *    而 Java 反序列化后是 `null`，后续所有判断（`!= null`、`??`）都建立在
 *    null 语义上。一旦让 `undefined` 漏进服务层，
 *    `request.channel !== null` 这种照抄 Java 的写法就会**误判为「传了值」**，
 *    进而走进本该跳过的分支 —— 第一版就是这样在 `eventCode` 上崩了 500。
 */
function normalizeTemplateRequest(body: Record<string, unknown>): TemplateWriteRequest {
  return {
    templateCode: str(body.templateCode),
    eventCode: str(body.eventCode),
    name: str(body.name),
    title: str(body.title),
    content: str(body.content),
    contentType: str(body.contentType),
    channel: str(body.channel),
    priority: str(body.priority),
    category: str(body.category),
    enabled: bool(body.enabled),
  }
}

/** 任意值 → `string | null`（缺省与 null 一律归一成 null）。 */
function str(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return typeof value === 'string' ? value : String(value)
}

/** 任意值 → `boolean | null`（只认 null/undefined 为「未传」，其余按真值转换）。 */
function bool(value: unknown): boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value
  return String(value).toLowerCase() === 'true'
}
