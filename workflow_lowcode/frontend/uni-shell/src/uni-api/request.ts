/**
 * uni-shell 侧请求接线（Task 3.3）：以 shell 基线配置实例化 @lc/runtime-uni
 * 的 uniRequest——token（本地存储 access_token）与租户头（X-Tenant-Id/default）
 * 口径与 web 端 http.ts 一致（PROFILES.uniapp.apiAdapter，Task 2.3）。
 * baseURL 留空 = 同源相对路径（部署时经反向代理）；Task 8.x 预览取数复用本实例。
 */
import { uniRequest } from '@lc/runtime-uni/http'

export const request = uniRequest({
  tenantHeader: 'X-Tenant-Id',
  tenantId: 'default',
  tokenKey: 'access_token',
  baseURL: '',
})
