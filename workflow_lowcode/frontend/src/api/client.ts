import http from '@/utils/http'
import type { R, PageResult } from '@/types/common'
import type {
  ChannelUpsertDTO,
  ClientChannelVO,
  ClientOptionVO,
  ClientQueryParams,
  ClientSaveDTO,
  ClientVO,
} from '@/types/client'

/** 客户端管理接口（对齐后端 /api/clients，形状 R<PageResult<ClientVO>>）。 */

export function listClients(params: ClientQueryParams) {
  return http.get<any, R<PageResult<ClientVO>>>('/clients', { params })
}

/** 端下拉（含停用端 status 原样；不带任何 config 字段）。 */
export function clientOptions() {
  return http.get<any, R<ClientOptionVO[]>>('/clients/options')
}

export function createClient(data: ClientSaveDTO) {
  return http.post<any, R<ClientVO>>('/clients', data)
}

export function updateClient(id: number, data: Partial<ClientSaveDTO>) {
  return http.put<any, R<ClientVO>>(`/clients/${id}`, data)
}

/** 启停。portal(id=1) 停用由服务端拒绝。 */
export function setClientStatus(id: number, status: number) {
  return http.put<any, R<null>>(`/clients/${id}/status`, { status })
}

/** 渠道开通/更新（secret 留空=不改动）。 */
export function upsertChannel(id: number, data: ChannelUpsertDTO) {
  return http.put<any, R<ClientChannelVO>>(`/clients/${id}/channels`, data)
}

/** 渠道连通测试。 */
export function testChannel(id: number, type: string) {
  return http.post<any, R<{ ok: boolean; msg: string }>>(`/clients/${id}/channels/${type}/test`)
}

/** A2 初始授权的角色下拉：仅本端角色（tasks 3.3 数据侧，服务端 clientId 过滤裁决）。 */
export function listRolesByClient(clientId: number) {
  return http.get<
    any,
    R<{ rows: Array<{ id: number; roleName: string; roleCode: string; status: number; clientId: number }>; total: number }>
  >('/roles', { params: { page: 1, size: 200, clientId } })
}
