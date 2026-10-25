import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common'
import { z } from 'zod'
import { R } from '../../common/domain/r'
import { PageResult } from '../../common/domain/page-result'
import { ValidationError } from '../../common/exception/validation-error'
import { JavaStatusOk } from '../../framework/http/java-status.decorator'
import { bindIntegerProperty } from '../../framework/http/query-params'
import {
  ClientService,
  type ChannelUpsertDto,
  type ClientChannelVO,
  type ClientOptionVO,
  type ClientVO,
} from '../service/client.service'

/**
 * 客户端接口（对齐 Java 侧多端支持，前缀 `/api/clients`）。
 *
 * ⚠️ 全部经全局 JwtAuthGuard 保护（无 @Public）。
 * ⚠️ 分页形状是 `PageResult{total,page,size,rows}`（对齐系统管理，不是流程模块的 PageResponse）。
 * ⚠️ `GET /options` 声明在任何 `:id` 路由之前（同 `/users/batch` 的教训，避免被当参数吃掉）。
 */
@Controller('api/clients')
@JavaStatusOk()
export class ClientController {
  constructor(private readonly service: ClientService) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
  ): Promise<R<PageResult<ClientVO>>> {
    return R.ok(
      await this.service.listPage(bindIntegerProperty(page, 1), bindIntegerProperty(size, 20), {
        keyword: keyword ?? null,
        status: status !== undefined && status !== '' ? Number(status) : null,
      }),
    )
  }

  @Get('options')
  async options(): Promise<R<ClientOptionVO[]>> {
    return R.ok(await this.service.options())
  }

  @Post()
  async create(@Body() body: unknown): Promise<R<ClientVO>> {
    return R.ok(await this.service.create(parseBody(clientCreateSchema, body)))
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<R<ClientVO>> {
    return R.ok(await this.service.update(Number(id), parseBody(clientUpdateSchema, body)))
  }

  /** 改状态。portal(id=1) 停用由 service 拒绝。 */
  @Put(':id/status')
  async setStatus(@Param('id') id: string, @Body() body: unknown): Promise<R<null>> {
    const { status } = parseBody(statusSchema, body)
    await this.service.setStatus(Number(id), status)
    return R.ok()
  }

  /** 渠道开通/更新（channelType 走 body；非法类型与 MP 必填由 service 校验）。 */
  @Put(':id/channels')
  async upsertChannel(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<R<ClientChannelVO>> {
    const parsed = parseBody(channelUpsertSchema, body)
    const dto: ChannelUpsertDto = { enabled: parsed.enabled, config: parsed.config ?? null }
    return R.ok(await this.service.upsertChannel(Number(id), parsed.channelType, dto))
  }

  /** 渠道连通测试。 */
  @Post(':id/channels/:type/test')
  async testChannel(
    @Param('id') id: string,
    @Param('type') type: string,
  ): Promise<R<{ ok: boolean; msg: string }>> {
    return R.ok(await this.service.testChannel(Number(id), type))
  }
}

// ------------------------------------------------------------ zod 校验

const clientCreateSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  icon: z.string().nullable().optional(),
  status: z.number().int().nullable().optional(),
  defaultRoleId: z.number().int().nullable().optional(),
  defaultMemberGroupId: z.number().int().nullable().optional(),
})

const clientUpdateSchema = clientCreateSchema.partial()

const statusSchema = z.object({ status: z.number().int() })

const channelUpsertSchema = z.object({
  channelType: z.string().min(1),
  enabled: z.number().int(),
  config: z.record(z.string(), z.unknown()).nullable().optional(),
})

/**
 * zod 结构校验：失败取**第一条** issue 抛 ValidationError（HTTP 200 + body code 400，
 * 对齐 Java 的 FieldError 取第一个）。业务级校验（code 重复、channelType 合法、MP 必填）
 * 留在 service，单一事实来源。
 */
function parseBody<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body)
  if (!result.success) {
    const issue = result.error.issues[0]
    const path = issue.path.join('.')
    throw new ValidationError(path !== '' ? `${path}: ${issue.message}` : issue.message)
  }
  return result.data
}
