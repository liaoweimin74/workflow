import 'reflect-metadata'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../../src/app.module'
import { GlobalExceptionFilter } from '../../src/framework/filters/global-exception.filter'
import { decryptSecret } from '../../src/framework/security/crypto'
import { closeTestPool, execute, queryRows } from '../utils/test-db'

/**
 * Task 2 集成测试：客户端 CRUD 全链路（真实 Nest app + 真实 MySQL 测试库）。
 *
 * 覆盖简报 Step 6：create → get → update channel → options → disable，
 * 并钉死两条安全事实：secret 读回为掩码、DB 落的是密文（非明文）。
 * 另加 portal 保护、code 重复、channelType 非法、MP 缺参、WEB/testChannel 各一条。
 *
 * 前置：`DB_NAME=workflow_node_test pnpm migrate` 已把 V50 应用到测试库（含 admin seed）。
 * 数据隔离：用唯一 code `it_<随机>` 自建自清（afterAll DELETE），绝不碰 id=1 / portal。
 */

// ⚠️ 在 app 编译（ENV useFactory → loadEnv）之前把库指向测试库；
//    test-db.ts 本身已固定连 workflow_node_test，二者对齐才不会读写分裂。
process.env.DB_NAME = 'workflow_node_test'

const PLAIN_SECRET = `plain-secret-${Date.now()}`

let app: INestApplication
let httpServer: Parameters<typeof request>[0]
let token = ''
const createdClientIds: number[] = []

function uniqueCode(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`.slice(0, 64)
}

function auth(): { Authorization: string } {
  return { Authorization: `Bearer ${token}` }
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  app = moduleRef.createNestApplication()
  // main.ts 里手动 useGlobalFilters；测试环境同样必须挂上才能得到 R 形态的错误体
  app.useGlobalFilters(new GlobalExceptionFilter())
  await app.init()
  httpServer = app.getHttpServer()

  const login = await request(httpServer)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'admin123' })
  expect(login.body.code).toBe(200)
  token = login.body.data.accessToken as string
  expect(typeof token).toBe('string')
  expect(token.length).toBeGreaterThan(0)
})

afterAll(async () => {
  // 清理自建数据（先子表后主表），保持 portal 的 1 行渠道不变。
  for (const id of createdClientIds) {
    await execute('DELETE FROM sys_client_channel WHERE client_id = ?', [id])
    await execute('DELETE FROM sys_client WHERE id = ?', [id])
  }
  if (app) await app.close()
  await closeTestPool()
})

describe('Client API 全链路', () => {
  const code = uniqueCode('it_crud')
  let clientId = 0

  it('POST /api/clients 创建成功，channels 为空', async () => {
    const res = await request(httpServer)
      .post('/api/clients')
      .set(auth())
      .send({ code, name: '集成测试端' })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
    expect(res.body.data.code).toBe(code)
    expect(res.body.data.channels).toEqual([])
    clientId = res.body.data.id as number
    expect(typeof clientId).toBe('number')
    createdClientIds.push(clientId)
  })

  it('GET /api/clients 列表能查到刚创建的客户端（分页形状 total/page/size/rows）', async () => {
    const res = await request(httpServer).get('/api/clients?page=1&size=200').set(auth())
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
    expect(res.body.data).toMatchObject({ page: 1, size: 200 })
    expect(typeof res.body.data.total).toBe('number')
    const found = (res.body.data.rows as unknown[]).some((r) => (r as { id: number }).id === clientId)
    expect(found).toBe(true)
  })

  it('PUT /:id/channels 开通 MP：回显 secret 为掩码、DB 落密文（非明文、可解密）', async () => {
    const res = await request(httpServer)
      .put(`/api/clients/${clientId}/channels`)
      .set(auth())
      .send({ channelType: 'MP', enabled: 1, config: { appid: 'wx_test_appid', secret: PLAIN_SECRET } })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
    expect(res.body.data.channelType).toBe('MP')
    expect(res.body.data.config.secret).toBe('******')
    expect(res.body.data.config.appid).toBe('wx_test_appid')

    // 真实 DB：config_json.secret 是密文，既不是明文也能解密回明文
    const rows = await queryRows<{ config_json: string }>(
      'SELECT config_json FROM sys_client_channel WHERE client_id = ? AND channel_type = ?',
      [clientId, 'MP'],
    )
    expect(rows).toHaveLength(1)
    const parsed = JSON.parse(rows[0].config_json) as { secret: string; appid: string }
    expect(parsed.secret).not.toBe(PLAIN_SECRET)
    expect(parsed.secret.length).toBeGreaterThan(0)
    expect(parsed.appid).toBe('wx_test_appid')
    expect(decryptSecret(parsed.secret)).toBe(PLAIN_SECRET)
  })

  it('列表读回 MP 渠道 secret 仍为掩码，明文绝不出现在响应里', async () => {
    const res = await request(httpServer).get(`/api/clients?keyword=${code}`).set(auth())
    expect(res.body.code).toBe(200)
    const row = (res.body.data.rows as Array<{ id: number; channels: Array<{ channelType: string; config: { secret?: string } }> }>).find(
      (r) => r.id === clientId,
    )
    expect(row).toBeDefined()
    const mp = row?.channels.find((c) => c.channelType === 'MP')
    expect(mp?.config.secret).toBe('******')
    expect(JSON.stringify(res.body.data)).not.toContain(PLAIN_SECRET)
  })

  it('GET /api/clients/options 含新客户端且 channelTypes 包含 MP', async () => {
    const res = await request(httpServer).get('/api/clients/options').set(auth())
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
    const opt = (res.body.data as Array<{ id: number; channelTypes: string[]; status: number }>).find(
      (o) => o.id === clientId,
    )
    expect(opt).toBeDefined()
    expect(opt?.channelTypes).toContain('MP')
    expect(opt?.status).toBe(1)
    // options 读出口不得含任何 config 原文
    expect(JSON.stringify(res.body.data)).not.toContain(PLAIN_SECRET)
  })

  it('POST /:id/channels/WEB/test 简单连通 ok=true', async () => {
    const up = await request(httpServer)
      .put(`/api/clients/${clientId}/channels`)
      .set(auth())
      .send({ channelType: 'WEB', enabled: 1, config: { loginMethods: ['account'] } })
    expect(up.body.code).toBe(200)

    const res = await request(httpServer)
      .post(`/api/clients/${clientId}/channels/WEB/test`)
      .set(auth())
      .send()
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
    expect(res.body.data).toMatchObject({ ok: true })
  })

  it('PUT /:id/status 停用成功（自建端，非 portal）', async () => {
    const res = await request(httpServer)
      .put(`/api/clients/${clientId}/status`)
      .set(auth())
      .send({ status: 0 })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
    const rows = await queryRows<{ status: number }>('SELECT status FROM sys_client WHERE id = ?', [clientId])
    expect(rows[0].status).toBe(0)
  })

  it('重复 code 被拒（BusinessException → body code 500，msg 客户端编码已存在）', async () => {
    const res = await request(httpServer)
      .post('/api/clients')
      .set(auth())
      .send({ code, name: '重复编码' })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(500)
    expect(res.body.msg).toBe('客户端编码已存在')
  })
})

describe('Client API 校验与保护', () => {
  const code = uniqueCode('it_guard')
  let clientId = 0

  beforeAll(async () => {
    const res = await request(httpServer).post('/api/clients').set(auth()).send({ code, name: '校验端' })
    expect(res.body.code).toBe(200)
    clientId = res.body.data.id as number
    createdClientIds.push(clientId)
  })

  it('channelType 非法 → body code 400（ValidationError）', async () => {
    const res = await request(httpServer)
      .put(`/api/clients/${clientId}/channels`)
      .set(auth())
      .send({ channelType: 'FOO', enabled: 1, config: {} })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(400)
  })

  it('MP enabled=1 缺 appid/secret → body code 400', async () => {
    const res = await request(httpServer)
      .put(`/api/clients/${clientId}/channels`)
      .set(auth())
      .send({ channelType: 'MP', enabled: 1, config: {} })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(400)
  })

  it('testChannel MP 未配置 → ok=false（未开通错误路径）', async () => {
    const res = await request(httpServer)
      .post(`/api/clients/${clientId}/channels/MP/test`)
      .set(auth())
      .send()
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
    expect(res.body.data.ok).toBe(false)
  })

  it('portal(id=1) 停用被拒（BusinessException → body code 500）且状态不变', async () => {
    const res = await request(httpServer)
      .put('/api/clients/1/status')
      .set(auth())
      .send({ status: 0 })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(500)
    const rows = await queryRows<{ status: number }>('SELECT status FROM sys_client WHERE id = 1')
    expect(rows[0].status).toBe(1)
  })

  it('未认证访问 /api/clients → 401（全局 JwtAuthGuard 生效）', async () => {
    const res = await request(httpServer).get('/api/clients')
    expect(res.status).toBe(401)
  })
})
