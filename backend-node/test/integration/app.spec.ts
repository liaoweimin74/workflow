import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../../src/app.module'
import { GlobalExceptionFilter } from '../../src/framework/filters/global-exception.filter'

/**
 * 应用装配集成测试。
 *
 * 注意：本文件**不需要 MySQL**。DatabaseModule 只在首次查询时才真正建立连接
 * （mysql2 连接池是惰性的），这里只验证模块装配、守卫、过滤器的组合行为。
 *
 * 认证守卫的 401 行为不在这里测：P0 只实现了 /api/health 且它是 @Public()，
 * 没有可用来验证 401 的真实端点（未实现路径会先被路由层拦成 404）。
 * 守卫行为由 test/unit/framework/jwt-auth.guard.spec.ts 的单元测试覆盖。
 */
describe('应用装配', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    app.useGlobalFilters(new GlobalExceptionFilter())
    await app.init()
  }, 60_000)

  afterAll(async () => {
    await app?.close()
  })

  it('GET /api/health 返回 R 封装且 status 为 UP（@Public 无需认证）', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200)
    expect(res.body).toEqual({
      code: 200,
      msg: 'success',
      data: { status: 'UP', buildTarget: 'workflow-backend-node' },
    })
  })

  it('未知路径返回 404（Node 尚未实现的端点，契约比对时计为「未实现」）', async () => {
    await request(app.getHttpServer()).get('/api/definitely-not-here').expect(404)
  })

  it('未知路径的 POST 同样返回 404，不会被守卫拦成 401', async () => {
    // 这条很关键：契约比对把 404 当作「未实现」，
    // 若守卫先于路由生效并返回 401，比对会把未实现误报成「不一致」。
    await request(app.getHttpServer()).post('/api/definitely-not-here').expect(404)
  })

  it('X-Tenant-Id 头被租户拦截器接受（不影响响应形状）', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .set('X-Tenant-Id', 'tenant-a')
      .expect(200)
    expect(res.body.code).toBe(200)
  })
})
