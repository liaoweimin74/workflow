import { Injectable } from '@nestjs/common'
import { PageResult } from '../../common/domain/page-result'
import { BusinessException } from '../../common/exception/business-exception'
import { ValidationError } from '../../common/exception/validation-error'
import { assertPageSize } from '../../framework/http/query-params'
import { decryptSecret, encryptSecret } from '../../framework/security/crypto'
import {
  ClientRepository,
  type ClientChannelRow,
  type ClientFilter,
  type ClientRow,
} from '../repository/client.repository'

/**
 * 客户端业务服务（多端支持 Task 2）。
 *
 * ## secret 边界约定（务必遵守）
 * - 加密只发生在这里：`upsertChannel` 写库前 `encryptSecret`；内部使用处 `decryptSecret`。
 * - repository 不碰加解密；任何**读出口**（listPage / options / upsertChannel 回显）
 *   的 config.secret 一律替换为掩码 `'******'`，config_json 原文绝不出 API。
 */

/** 平台端客户端 id（V50 seed）。改名/改码/停用一律拒绝，避免把管理入口本身关掉。 */
export const PORTAL_CLIENT_ID = 1

/** 合法渠道类型集合。 */
const CHANNEL_TYPES = ['WEB', 'H5', 'APP', 'MP'] as const
export type ChannelType = (typeof CHANNEL_TYPES)[number]

/** secret 读出口固定掩码。 */
const SECRET_MASK = '******'

export interface ClientChannelVO {
  channelType: string
  enabled: number
  config: Record<string, unknown> & { secret?: '******' | null }
}

export interface ClientVO {
  id: number
  code: string
  name: string
  icon: string | null
  status: number
  defaultRoleId: number | null
  defaultMemberGroupId: number | null
  channels: ClientChannelVO[]
}

export interface ClientOptionVO {
  id: number
  code: string
  name: string
  channelTypes: string[]
  status: number
}

export interface ClientCreateDto {
  code: string
  name: string
  icon?: string | null
  status?: number | null
  defaultRoleId?: number | null
  defaultMemberGroupId?: number | null
}

export type ClientUpdateDto = Partial<ClientCreateDto>

export interface ChannelUpsertDto {
  enabled: number
  config?: Record<string, unknown> | null
}

@Injectable()
export class ClientService {
  constructor(private readonly repo: ClientRepository) {}

  // ------------------------------------------------------------ 读

  async listPage(page: number, size: number, filter: ClientFilter): Promise<PageResult<ClientVO>> {
    assertPageSize(size)
    const safePage = Math.max(page, 1)
    const { rows, total } = await this.repo.listPage((safePage - 1) * size, size, filter)
    const channels = await this.repo.listChannelsByClientIds(rows.map((r) => r.id))
    const byClient = new Map<number, ClientChannelRow[]>()
    for (const ch of channels) {
      const list = byClient.get(ch.client_id) ?? []
      list.push(ch)
      byClient.set(ch.client_id, list)
    }
    const vos = rows.map((row) => toClientVO(row, byClient.get(row.id) ?? []))
    return new PageResult(total, safePage, size, vos)
  }

  async options(): Promise<ClientOptionVO[]> {
    const rows = await this.repo.listOptions()
    const byId = new Map<number, ClientOptionVO>()
    const order: number[] = []
    for (const row of rows) {
      let vo = byId.get(row.id)
      if (vo === undefined) {
        // status 原样透传（含停用端 0）；channelTypes 只收已开通渠道。
        // ⚠️ 不带上任何 config 字段——options 是下拉，绝不能泄 config_json。
        vo = { id: row.id, code: row.code, name: row.name, status: row.status, channelTypes: [] }
        byId.set(row.id, vo)
        order.push(row.id)
      }
      if (row.channelType !== null && row.channelType !== undefined) {
        vo.channelTypes.push(row.channelType)
      }
    }
    return order.map((id) => byId.get(id) as ClientOptionVO)
  }

  private async loadClientVO(id: number): Promise<ClientVO> {
    const row = await this.requireClient(id)
    const channels = await this.repo.listChannelsByClientIds([id])
    return toClientVO(row, channels)
  }

  // ------------------------------------------------------------ 客户端写
  async create(dto: ClientCreateDto): Promise<ClientVO> {
    if (await this.repo.codeExists(dto.code)) {
      throw new BusinessException('客户端编码已存在')
    }
    const id = await this.repo.insertClient({
      code: dto.code,
      name: dto.name,
      icon: dto.icon ?? null,
      status: dto.status ?? 1,
      default_role_id: dto.defaultRoleId ?? null,
      default_member_group_id: dto.defaultMemberGroupId ?? null,
    })
    return this.loadClientVO(id)
  }

  async update(id: number, dto: ClientUpdateDto): Promise<ClientVO> {
    const row = await this.requireClient(id)
    const patch: Partial<ClientRow> = {}

    if (dto.code !== undefined && dto.code !== row.code) {
      // portal 保护：平台端不允许改码（改码会连带影响端上下文识别）。
      if (id === PORTAL_CLIENT_ID) throw new BusinessException('平台端不允许修改编码')
      if (await this.repo.codeExists(dto.code, id)) throw new BusinessException('客户端编码已存在')
      patch.code = dto.code
    }
    if (dto.name !== undefined && dto.name !== row.name) {
      // portal 保护：平台端不允许改名。
      if (id === PORTAL_CLIENT_ID) throw new BusinessException('平台端不允许修改名称')
      patch.name = dto.name
    }
    if (dto.icon !== undefined) patch.icon = dto.icon ?? null
    // status 列为 NOT NULL：只有传数字才改（传 null 视为不改），杜绝把状态写空。
    if (typeof dto.status === 'number' && dto.status !== row.status) {
      // portal 保护也覆盖经 update 携带的停用（与 setStatus 同口径）。
      if (id === PORTAL_CLIENT_ID && dto.status === 0) throw new BusinessException('平台端不允许停用')
      patch.status = dto.status
    }
    if (dto.defaultRoleId !== undefined) patch.default_role_id = dto.defaultRoleId ?? null
    if (dto.defaultMemberGroupId !== undefined) {
      patch.default_member_group_id = dto.defaultMemberGroupId ?? null
    }

    if (Object.keys(patch).length > 0) {
      await this.repo.updateClient(id, patch)
    }
    return this.loadClientVO(id)
  }

  async setStatus(id: number, status: number): Promise<void> {
    await this.requireClient(id)
    // portal 保护：平台端不允许停用（停用等于关掉整个管理入口）。
    if (id === PORTAL_CLIENT_ID && status === 0) throw new BusinessException('平台端不允许停用')
    await this.repo.updateStatus(id, status)
  }

  // ------------------------------------------------------------ 渠道

  async upsertChannel(clientId: number, channelType: string, dto: ChannelUpsertDto): Promise<ClientChannelVO> {
    assertChannelType(channelType)
    const enabled = dto.enabled
    const config: Record<string, unknown> = { ...(dto.config ?? {}) }

    // secret 边界：掩码回传=保留原密文；有明文=加密；空=清除。
    const raw = config.secret
    if (raw === undefined || raw === null || raw === '') {
      delete config.secret
    } else if (raw === SECRET_MASK) {
      const existing = await this.repo.findChannel(clientId, channelType)
      const prev = existing === null ? undefined : parseConfig(existing.config_json).secret
      if (typeof prev === 'string' && prev !== '') {
        config.secret = prev // 已是密文，原样保留
      } else {
        delete config.secret
      }
    } else {
      config.secret = encryptSecret(String(raw))
    }

    // MP 开通必填 appid/secret（校验放在 secret 解析之后：掩码保留也算有值）。
    if (channelType === 'MP' && enabled === 1) {
      const appid = config.appid
      if (typeof appid !== 'string' || appid.trim() === '') {
        throw new ValidationError('小程序渠道 appid 不能为空')
      }
      if (typeof config.secret !== 'string' || config.secret === '') {
        throw new ValidationError('小程序渠道 secret 不能为空')
      }
    }

    await this.repo.upsertChannel(clientId, channelType, {
      enabled,
      config_json: JSON.stringify(config),
    })
    const stored = await this.repo.findChannel(clientId, channelType)
    if (stored === null) throw new BusinessException('渠道写入失败')
    return toChannelVO(stored)
  }

  async testChannel(clientId: number, channelType: string): Promise<{ ok: boolean; msg: string }> {
    assertChannelType(channelType)
    const channel = await this.repo.findChannel(clientId, channelType)
    if (channel === null || channel.enabled !== 1) return { ok: false, msg: '渠道未开通' }

    const config = parseConfig(channel.config_json)
    switch (channelType) {
      case 'WEB':
      case 'H5':
        // WEB/H5 无外部依赖：已开通即视为连通。
        return { ok: true, msg: '连通正常' }
      case 'APP': {
        const downloadUrl = config.downloadUrl
        const minVersion = config.minVersion
        if (
          typeof downloadUrl !== 'string' ||
          downloadUrl.trim() === '' ||
          minVersion === undefined ||
          minVersion === null ||
          minVersion === ''
        ) {
          return { ok: false, msg: 'APP 渠道缺少 downloadUrl/minVersion' }
        }
        return { ok: true, msg: '连通正常' }
      }
      case 'MP': {
        const appid = config.appid
        const rawSecret = config.secret
        const secret = typeof rawSecret === 'string' ? decryptSecret(rawSecret) : undefined
        if (
          typeof appid !== 'string' ||
          appid.trim() === '' ||
          typeof secret !== 'string' ||
          secret.trim() === ''
        ) {
          return { ok: false, msg: '小程序渠道缺少 appid/secret' }
        }
        // ⚠️ 无外网环境不真正调用微信 API（简报允许）：解密可达性通过后，
        //    返回不可达而非发起阻塞请求。真实连通探测在具备出网条件时接入。
        return { ok: false, msg: '无法验证小程序连通性（未接入外网）' }
      }
      default:
        return { ok: false, msg: '未知渠道类型' }
    }
  }

  // ------------------------------------------------------------ 内部

  private async requireClient(id: number): Promise<ClientRow> {
    const row = await this.repo.findClientById(id)
    if (row === null) throw new BusinessException(`客户端不存在: ${id}`)
    return row
  }
}

/** channelType ∈ 集合，否则 ValidationError（HTTP 200 + body code 400）。 */
function assertChannelType(channelType: string): void {
  if (!(CHANNEL_TYPES as readonly string[]).includes(channelType)) {
    throw new ValidationError(`渠道类型非法，仅支持 ${CHANNEL_TYPES.join('/')}`)
  }
}

function parseConfig(json: string | null): Record<string, unknown> {
  if (json === null || json === '') return {}
  try {
    const v: unknown = JSON.parse(json)
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      return v as Record<string, unknown>
    }
  } catch {
    // config_json 非法 JSON（不该发生）——降级为空对象，读出口不崩。
  }
  return {}
}

/** 渠道行 → VO：secret 有值即掩码，无值则不带 secret 字段。config_json 原文不外泄。 */
function toChannelVO(row: ClientChannelRow): ClientChannelVO {
  const config = parseConfig(row.config_json)
  const secret = config.secret
  if (typeof secret === 'string' && secret !== '') {
    config.secret = SECRET_MASK
  } else {
    delete config.secret
  }
  return { channelType: row.channel_type, enabled: row.enabled, config }
}

function toClientVO(row: ClientRow, channels: ClientChannelRow[]): ClientVO {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    icon: row.icon,
    status: row.status,
    defaultRoleId: row.default_role_id,
    defaultMemberGroupId: row.default_member_group_id,
    channels: channels.map(toChannelVO),
  }
}
