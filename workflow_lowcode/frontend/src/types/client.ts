/** 客户端（sys_client）类型定义——字段与后端 ClientVO/ClientOptionVO 逐一对齐（camelCase）。 */

/** 渠道行（config 中 secret 恒为掩码 '******' 或 null，绝不回明文）。 */
export interface ClientChannelVO {
  channelType: 'WEB' | 'H5' | 'APP' | 'MP' | string
  enabled: number
  config: Record<string, unknown> & { secret?: string | null }
}

/** 客户端主 VO（A1 列表行 / 详情）。 */
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

/** 下拉选项（不带 config 字段，防泄 config_json）。 */
export interface ClientOptionVO {
  id: number
  code: string
  name: string
  channelTypes: string[]
  status: number
}

/** 新建/编辑 DTO（后端 zod：code/name 必填，其余可空）。 */
export interface ClientSaveDTO {
  code: string
  name: string
  icon?: string | null
  status?: number | null
  defaultRoleId?: number | null
  defaultMemberGroupId?: number | null
}

/** 渠道开通/更新 DTO（channelType 走 body；MP 启用时 appid 必填由服务端校验）。 */
export interface ChannelUpsertDTO {
  channelType: string
  enabled: number
  config?: Record<string, unknown> | null
}

/** A1 列表查询参数。 */
export interface ClientQueryParams {
  page: number
  size: number
  keyword?: string
  status?: number | null
}
