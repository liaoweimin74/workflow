import { Module } from '@nestjs/common'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { HealthController } from './api/controllers/health.controller'
import { SystemInternalController } from './api/controllers/system-internal.controller'
import { TenantInterceptor } from './api/interceptors/tenant.interceptor'
import { DatabaseModule } from './framework/database/database.module'
import { JwtAuthGuard } from './framework/security/jwt-auth.guard'
import { SecurityModule } from './framework/security/security.module'
import { EngineModule } from './engine/engine.module'
import { NotificationModule } from './notification/notification.module'
import { SystemModule } from './system/system.module'

/**
 * 根模块。
 *
 * 模块边界对齐 Java 侧的 Spring Modulith 显式模块：
 *   common（无模块，纯类型/函数）· framework · engine · notification · system · api
 * 依赖方向：api → engine → {system, notification} → framework → common
 * 由 eslint.config.mjs 的 import/no-restricted-paths 强制。
 *
 * 执行顺序：Nest 的请求处理链是 Guard → Interceptor → Pipe → Handler。
 * 因此 JwtAuthGuard（认证）先于 TenantInterceptor（租户作用域）执行 —— 与 Java 侧
 * SecurityFilterChain 先于 TenantInterceptor 的顺序一致。
 */
@Module({
  imports: [DatabaseModule, SecurityModule, SystemModule, NotificationModule, EngineModule],
  controllers: [HealthController, SystemInternalController],
  providers: [
    // 全局认证守卫：默认要求认证，例外由 @Public() 标记
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // 全局租户拦截器：用 AsyncLocalStorage 包住整条处理链
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
})
export class AppModule {}
