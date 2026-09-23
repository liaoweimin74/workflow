import { Global, Module } from '@nestjs/common'
import type { Env } from '../config/env'
import { ENV } from '../database/database.module'
import { JwtAuthGuard } from './jwt-auth.guard'
import { JwtTokenProvider } from './jwt-token.provider'

/** 认证相关提供者。全局导出，便于 engine / system 模块复用。 */
@Global()
@Module({
  providers: [
    {
      provide: JwtTokenProvider,
      inject: [ENV],
      useFactory: (env: Env) => new JwtTokenProvider(env.jwt),
    },
    JwtAuthGuard,
  ],
  exports: [JwtTokenProvider],
})
export class SecurityModule {}
