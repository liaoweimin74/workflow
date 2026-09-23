import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Observable } from 'rxjs'
import { TENANT_HEADER, runWithTenant } from '../../framework/tenant/tenant-context'

/**
 * 租户拦截器，对齐 Java com.workflow.api.interceptor.TenantInterceptor。
 *
 * 行为要点：
 *  - X-Tenant-Id 是**可选**头；不存在或空白时不设置租户（业务层按需强制）。
 *  - 租户作用域必须与请求的生命周期一致，因此用 AsyncLocalStorage.run 包住
 *    整个 downstream 处理链，而不是在拦截器里 set / 在 finally 里 clear
 *    （那样在 await 跨越后会丢失）。
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>()
    const raw = request.headers[TENANT_HEADER.toLowerCase()]
    const tenantId = Array.isArray(raw) ? raw[0] : (raw as string | undefined)

    return runWithTenant(tenantId, () => next.handle())
  }
}
