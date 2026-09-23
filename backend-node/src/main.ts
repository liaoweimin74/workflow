import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { loadEnv } from './framework/config/env'
import { GlobalExceptionFilter } from './framework/filters/global-exception.filter'
import { BUILD_TARGET } from './common/version'

async function bootstrap(): Promise<void> {
  const env = loadEnv()
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] })
  // 与 Java 的 @RestControllerAdvice 一样，异常一律走统一响应封装
  app.useGlobalFilters(new GlobalExceptionFilter())
  await app.listen(env.port)

  const logger = new Logger('Bootstrap')
  logger.log(`${BUILD_TARGET} 已启动: http://localhost:${env.port}`)
  logger.log(`数据库: ${env.db.host}:${env.db.port}/${env.db.database}`)
}

void bootstrap()
