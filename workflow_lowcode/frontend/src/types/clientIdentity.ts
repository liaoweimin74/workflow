/** A4 端身份 Tab 类型（对齐 Java ClientIdentityVO/DeviceVO，掩码由服务端输出）。 */

export interface IdentityDeviceVO {
  id: number
  platform: string | null
  deviceTokenMasked: string | null
  /** 1 已吊销（通知发送侧跳过） */
  revoked: number
  lastLoginAt: string | null
}

export interface ClientIdentityVO {
  clientId: number
  clientName: string
  clientCode: string
  /** null = 该端只有设备记录、未绑 openid */
  openidMasked: string | null
  boundAt: string | null
  devices: IdentityDeviceVO[]
}

/** 绑定码签发结果（复用 POST /api/auth/bind-code/issue，code 一次性全文仅展示一次）。 */
export interface BindCodeVO {
  code: string
  expiresAt: string
}
