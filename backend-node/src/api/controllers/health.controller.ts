import { Controller, Get } from '@nestjs/common'
import { BUILD_TARGET } from '../../common/version'
import { R } from '../../common/domain/r'
import { Public } from '../../framework/security/jwt-auth.guard'

/**
 * 健康检查端点。
 *
 * ⚠️ 这不是 Java 契约的一部分 —— P0 阶段用它验证装配与响应封装。
 * P1 起真实端点接管验证职责，本端点在 P8 收尾时移除或改为内部端点。
 * @Public() 使其无需认证，否则全局 JwtAuthGuard 会让健康检查返回 401。
 */
@Controller('api/health')
export class HealthController {
  @Get()
  @Public()
  health(): R<{ status: string; buildTarget: string }> {
    return R.ok({ status: 'UP', buildTarget: BUILD_TARGET })
  }
}
