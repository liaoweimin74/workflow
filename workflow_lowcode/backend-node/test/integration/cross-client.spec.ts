import 'reflect-metadata'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../../src/app.module'
import { GlobalExceptionFilter } from '../../src/framework/filters/global-exception.filter'
import { closeTestPool, execute, queryRows } from '../utils/test-db'

// ⚠️ 在 app 编译（ENV useFactory → loadEnv）之前指向测试库（与 client-api.spec 同一手法）。
process.env.DB_NAME = 'workflow_node_test'

/**
 * Task 5 集成测试（Review Focus 2 矩阵）：角色挂端 + 认证链端一致性。
 *
 * 矩阵钉死：
 *   1. 不带 X-Client-Id 的存量请求行为与迁移前一致（admin 在 portal 有 ROLE_ADMIN）；
 *   2. admin 角色属 portal → `X-Client-Id: 2` 调 getInfo → roles=[]、permissions=[]（空而非报错）；
 *   3. 同请求头调 /api/menus/tree → 空数组（端上下文缺省接线）；
 *   4. 用户仅有他端角色时 portal 头 → 空；该端头 → 各端各授生效；
 *   5. PUT /api/clients/:id defaultRoleId 跨端 → 400「默认角色必须属于本端」；本端放行。
 *
 * 数据隔离：自建端/角色/用户，afterAll 级联清理；绝不改 admin 与 portal 角色。
 */

interface UserInfo {
  username: string
  roles: string[]
  permissions: string[]
}

let app: INestApplication
let httpServer: Parameters<typeof request>[0]
let token = ''
/** 自建移动端（角色/用户挂它） */
let clientC = 0
let roleId = 0
let userId = 0
const stamp = Date.now()

function auth(): { Authorization: string } {
  return { Authorization: `Bearer ${token}` }
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  app = moduleRef.createNestApplication()
  app.useGlobalFilters(new GlobalExceptionFilter())
  await app.init()
  httpServer = app.getHttpServer()

  const login = await request(httpServer)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'admin123' })
  expect(login.body.code).toBe(200)
  token = login.body.data.accessToken as string
})

afterAll(async () => {
  if (userId > 0) {
    await execute('DELETE FROM sys_user_role WHERE user_id = ?', [userId])
    await execute('DELETE FROM sys_user WHERE id = ?', [userId])
  }
  if (roleId > 0) await execute('DELETE FROM sys_role WHERE id = ?', [roleId])
  if (clientC > 0) {
    await execute('DELETE FROM sys_menu WHERE client_id = ?', [clientC])
    await execute('DELETE FROM sys_client_channel WHERE client_id = ?', [clientC])
    await execute('DELETE FROM sys_client WHERE id = ?', [clientC])
  }
  if (app) await app.close()
  await closeTestPool()
})

describe('端上下文缺省回归（不带 X-Client-Id 头 = 迁移前行为）', () => {
  it('getInfo 返回 admin 的 portal 角色与权限码', async () => {
    const res = await request(httpServer).get('/api/auth/userinfo').set(auth())
    expect(res.body.code).toBe(200)
    const user = res.body.data.user as UserInfo
    expect(user.roles).toContain('ROLE_ADMIN')
    expect(user.permissions.length).toBeGreaterThan(0)
  })

  it('GET /api/menus/tree 缺省返回 portal 树（非空、全节点 clientId=1）', async () => {
    const res = await request(httpServer).get('/api/menus/tree').set(auth())
    expect(res.body.code).toBe(200)
    const nodes = res.body.data as Array<{ clientId: number }>
    expect(nodes.length).toBeGreaterThan(0)
    expect(nodes.every((n) => n.clientId === 1)).toBe(true)
  })
})

describe('跨端一致性矩阵（Review Focus 2）', () => {
  it('admin 角色属 portal：X-Client-Id: 2 调 getInfo → roles=[]、permissions=[]（空而非报错）', async () => {
    const res = await request(httpServer).get('/api/auth/userinfo').set(auth()).set('X-Client-Id', '2')
    expect(res.body.code).toBe(200)
    const user = res.body.data.user as UserInfo
    expect(user.roles).toEqual([])
    expect(user.permissions).toEqual([])
  })

  it('同头调 GET /api/menus/tree → 空数组（端上下文接线为该端取树）', async () => {
    const res = await request(httpServer).get('/api/menus/tree').set(auth()).set('X-Client-Id', '2')
    expect(res.body.code).toBe(200)
    expect(res.body.data).toEqual([])
  })

  it('非法 X-Client-Id 头（非数字）按缺省 portal 处理', async () => {
    const res = await request(httpServer).get('/api/auth/userinfo').set(auth()).set('X-Client-Id', 'abc')
    expect(res.body.code).toBe(200)
    const user = res.body.data.user as UserInfo
    expect(user.roles).toContain('ROLE_ADMIN')
  })

  it('用户仅有 C 端角色：portal 头空 / C 端头生效（各端各授不串用）', async () => {
    // 自建端 C
    const created = await request(httpServer)
      .post('/api/clients')
      .set(auth())
      .send({ code: `it_cc_${stamp}`, name: 'IT跨端C' })
    expect(created.body.code).toBe(200)
    clientC = created.body.data.id as number

    // C 端角色 + 新用户（密码哈希复制 admin，走正常登录）
    await execute(
      `INSERT INTO sys_role (client_id, role_code, role_name, status, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, 1, 0, NOW(), NOW())`,
      [clientC, `IT_CC_ROLE_${stamp}`, 'IT跨端角色'],
    )
    const r = await queryRows<{ id: number }>(
      'SELECT id FROM sys_role WHERE role_code = ?',
      [`IT_CC_ROLE_${stamp}`],
    )
    roleId = r[0].id
    await execute(
      `INSERT INTO sys_user (username, password, nickname, status, is_deleted, created_at, updated_at)
       SELECT ?, admin_pw.password, 'IT跨端用户', 1, 0, NOW(), NOW()
         FROM (SELECT password FROM sys_user WHERE username = 'admin') admin_pw`,
      [`it_cc_${stamp}`],
    )
    const u = await queryRows<{ id: number }>('SELECT id FROM sys_user WHERE username = ?', [
      `it_cc_${stamp}`,
    ])
    userId = u[0].id
    await execute('INSERT INTO sys_user_role (user_id, role_id) VALUES (?, ?)', [userId, roleId])

    // portal 上下文（不带头）登录：角色应为空
    const loginPortal = await request(httpServer)
      .post('/api/auth/login')
      .send({ username: `it_cc_${stamp}`, password: 'admin123' })
    expect(loginPortal.body.code).toBe(200)
    expect(loginPortal.body.data.user.roles).toEqual([])
    const portalToken = loginPortal.body.data.accessToken as string

    // C 端上下文登录：角色应含 C 端角色
    const loginC = await request(httpServer)
      .post('/api/auth/login')
      .set('X-Client-Id', String(clientC))
      .send({ username: `it_cc_${stamp}`, password: 'admin123' })
    expect(loginC.body.code).toBe(200)
    expect(loginC.body.data.user.roles).toEqual([`IT_CC_ROLE_${stamp}`])
    const cToken = loginC.body.data.accessToken as string

    // getInfo 同样按头过滤
    const infoPortal = await request(httpServer)
      .get('/api/auth/userinfo')
      .set('Authorization', `Bearer ${portalToken}`)
    expect((infoPortal.body.data.user as UserInfo).roles).toEqual([])
    const infoC = await request(httpServer)
      .get('/api/auth/userinfo')
      .set('Authorization', `Bearer ${cToken}`)
      .set('X-Client-Id', String(clientC))
    expect((infoC.body.data.user as UserInfo).roles).toEqual([`IT_CC_ROLE_${stamp}`])

    // /api/auth/menus：C 端头下该用户无授权菜单 → 空数组；portal 头 → 也空（无 portal 角色）
    const menusC = await request(httpServer)
      .get('/api/auth/menus')
      .set('Authorization', `Bearer ${cToken}`)
      .set('X-Client-Id', String(clientC))
    expect(menusC.body.code).toBe(200)
    expect(menusC.body.data).toEqual([])
  })
})

describe('defaultRoleId 归属校验（tasks 3.3）', () => {
  it('指向他端角色（ROLE_ADMIN=1 属 portal）→ body code 400「默认角色必须属于本端」', async () => {
    // 复用上一组创建的端 C（独立跑时兜底自建）
    if (clientC === 0) {
      const created = await request(httpServer)
        .post('/api/clients')
        .set(auth())
        .send({ code: `it_cc_b_${stamp}`, name: 'IT跨端B' })
      clientC = created.body.data.id as number
    }
    const res = await request(httpServer)
      .put(`/api/clients/${clientC}`)
      .set(auth())
      .send({ defaultRoleId: 1 })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(400)
    expect(String(res.body.msg)).toContain('默认角色必须属于本端')
  })

  it('指向本端角色 → 放行（body code 200，defaultRoleId 回显）', async () => {
    expect(roleId).toBeGreaterThan(0)
    const res = await request(httpServer)
      .put(`/api/clients/${clientC}`)
      .set(auth())
      .send({ defaultRoleId: roleId })
    expect(res.body.code).toBe(200)
    expect(res.body.data.defaultRoleId).toBe(roleId)
  })
})
