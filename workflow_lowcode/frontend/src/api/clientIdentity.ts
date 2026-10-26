import http from '@/utils/http'
import type { R } from '@/types/common'
import type { BindCodeVO, ClientIdentityVO } from '@/types/clientIdentity'

/** A4 端身份接口（对齐后端 /api/users/:id/... J5a 端点，形状 R<...>）。 */

/** 账号按端的 openid 绑定 + 推送设备列表（服务端已掩码）。 */
export function listClientIdentities(userId: number) {
  return http.get<any, R<ClientIdentityVO[]>>(`/users/${userId}/client-identities`)
}

/** 管理员解绑指定端身份（与本人 /auth/client/unbind 分离）。 */
export function adminUnbindClient(userId: number, clientId: number) {
  return http.post<any, R<null>>(`/users/${userId}/client-identities/${clientId}/unbind`)
}

/** 吊销指定推送设备。 */
export function revokeDevice(userId: number, deviceId: number) {
  return http.post<any, R<null>>(`/users/${userId}/devices/${deviceId}/revoke`)
}

/** 为「账号 × 端」签发一次性绑定码（复用 J3 /auth/bind-code/issue）。 */
export function issueBindCode(data: { userId: number; clientId: number }) {
  return http.post<any, R<BindCodeVO>>('/auth/bind-code/issue', data)
}
