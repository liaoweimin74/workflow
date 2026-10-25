import 'reflect-metadata'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../../src/app.module'
import { GlobalExceptionFilter } from '../../src/framework/filters/global-exception.filter'
import { closeTestPool, execute, queryRows } from '../utils/test-db'

// ⚠️ 在 app 编译（ENV useFactory → loadEnv）之前指向测试库（与 cross-client.spec 同一手法）。
process.env.DB_NAME = 'workflow_node_test'

/**
 * Task 11 · P0 端到端验收（tasks.md 4.4）：新建端全流程 = 纯配置 API、零平台代码变更。
 *
 * 链路（测试即验收）：
 *   POST /clients 建「司机端」→ PUT channels(H5/APP/MP) →【开移动渠道即播种
 *   mzone:tabs/mzone:grid 两个锁定分区根——4.4 零代码链的必要补丁，SDD ledger 裁定】
 *   → POST /roles 新建角色挂新端 → PUT /clients defaultRoleId=新角色
 *   → POST /menus 建 TAB 带 3 节点 + GRID 目录+菜单 → PUT /roles/:id/menus 授本端树
 *   → 仅本端角色用户：X-Client-Id=新端 getInfo 非空 / portal 上下文为空、
 *   /api/auth/menus 端内可见、直连 portal 挂接页面 API 403。
 *
 * 数据隔离：自建端/角色/用户/菜单，afterAll 级联清理；portal 侧仅 it.9 的两条钉 403
 * 用菜单（按 id 清除），绝不改 admin 与 portal 角色。
 */

interface MenuNode {
  id: number
  parentId: number | null
  menuName: string
  menuType: number
  component: string | null
  children: MenuNode[] | null
}

interface UserInfo {
  username: string
  roles: string[]
  permissions: string[]
}

let app: INestApplication
let httpServer: Parameters<typeof request>[0]
let token = ''
const stamp = Date.now()
const code = (p: string) => `${p}_${stamp}`

let clientX = 0
let roleId = 0
let userId = 0
let tabsRootId = 0
let gridRootId = 0
/** it.9 在 portal 上建的钉 403 菜单（dir+menu），afterAll 按 id 清理 */
const portalMenuIds: number[] = []
/** it.5 建的本端菜单 id（TAB 3 + GRID 目录 + GRID 菜单），it.6 授权用 */
const clientMenuIds: number[] = []

function auth(): { Authorization: string } {
  return { Authorization: `Bearer ${token}` }
}

function flatten(nodes: MenuNode[]): MenuNode[] {
  const out: MenuNode[] = []
  const walk = (list: MenuNode[]): void => {
    for (const n of list) {
      out.push(n)
      if (n.children) walk(n.children)
    }
  }
  walk(nodes)
  return out
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
  if (roleId > 0) {
    await execute('DELETE FROM sys_role_menu WHERE role_id = ?', [roleId])
    await execute('DELETE FROM sys_role WHERE id = ?', [roleId])
  }
  for (const id of portalMenuIds) {
    await execute('DELETE FROM sys_menu WHERE id = ?', [id])
  }
  if (clientX > 0) {
    await execute('DELETE FROM sys_menu WHERE client_id = ?', [clientX])
    await execute('DELETE FROM sys_client_channel WHERE client_id = ?', [clientX])
    await execute('DELETE FROM sys_client WHERE id = ?', [clientX])
  }
  if (app) await app.close()
  await closeTestPool()
})

describe('P0 全流程：新建端 → 配渠道 → 授本端角色 → 配端菜单 → 端内可见', () => {
  it('新建端：POST /clients「司机端」（WEB-only 未开渠道 = 桌面形态）', async () => {
    const res = await request(httpServer)
      .post('/api/clients')
      .set(auth())
      .send({ code: code('it_p0_drv'), name: '司机端' })
    expect(res.body.code).toBe(200)
    clientX = res.body.data.id as number
    expect(clientX).toBeGreaterThan(1)
  })

  it('配渠道：PUT channels H5/APP/MP 逐个开通（含各自 config）', async () => {
    const h5 = await request(httpServer)
      .put(`/api/clients/${clientX}/channels`)
      .set(auth())
      .send({ channelType: 'H5', enabled: 1, config: { loginMethods: ['SMS', 'PWD'] } })
    expect(h5.body.code).toBe(200)

    const app_ = await request(httpServer)
      .put(`/api/clients/${clientX}/channels`)
      .set(auth())
      .send({
        channelType: 'APP',
        enabled: 1,
        config: { downloadUrl: 'https://dl.example.com/driver.apk', minVersion: '1.0.0' },
      })
    expect(app_.body.code).toBe(200)

    const mp = await request(httpServer)
      .put(`/api/clients/${clientX}/channels`)
      .set(auth())
      .send({ channelType: 'MP', enabled: 1, config: { appid: `wx_${stamp}`, secret: 'p0_plain_secret' } })
    expect(mp.body.code).toBe(200)
    // MP secret 读出口恒掩码
    expect(mp.body.data.config.secret).toBe('******')

    // options 回显三渠道（渠道矩阵数据模型生效，无需任何平台代码改动）
    const opts = await request(httpServer).get('/api/clients/options').set(auth())
    const found = (opts.body.data as Array<{ id: number; channelTypes: string[] }>).find(
      (o) => o.id === clientX,
    )
    expect(found?.channelTypes.sort()).toEqual(['APP', 'H5', 'MP'])
  })

  it('开通移动渠道即播种分区根：tree?clientId=X 含 mzone:tabs/mzone:grid 两锁定根目录，且幂等', async () => {
    const res = await request(httpServer).get(`/api/menus/tree?clientId=${clientX}`).set(auth())
    expect(res.body.code).toBe(200)
    const roots = res.body.data as MenuNode[]
    const tabs = roots.filter((n) => n.component === 'mzone:tabs')
    const grid = roots.filter((n) => n.component === 'mzone:grid')
    expect(tabs).toHaveLength(1)
    expect(grid).toHaveLength(1)
    expect(tabs[0]).toMatchObject({ parentId: null, menuType: 0 })
    expect(grid[0].children ?? []).toEqual([])
    tabsRootId = tabs[0].id
    gridRootId = grid[0].id

    // 幂等：重复开通 H5 不产生第二组分区根
    await request(httpServer)
      .put(`/api/clients/${clientX}/channels`)
      .set(auth())
      .send({ channelType: 'H5', enabled: 1, config: { loginMethods: ['SMS', 'PWD'] } })
    const again = await request(httpServer).get(`/api/menus/tree?clientId=${clientX}`).set(auth())
    const againRoots = again.body.data as MenuNode[]
    expect(againRoots.filter((n) => n.component === 'mzone:tabs')).toHaveLength(1)
    expect(againRoots.filter((n) => n.component === 'mzone:grid')).toHaveLength(1)
  })

  it('分区根 locked：拒绝改名/移动/删除（端形态骨架不可破坏）', async () => {
    const rename = await request(httpServer)
      .put(`/api/menus/${tabsRootId}`)
      .set(auth())
      .send({ menuName: '改掉的Tab区' })
    expect(rename.body.code).toBe(500)
    expect(String(rename.body.msg)).toContain('锁定')

    const move = await request(httpServer)
      .put(`/api/menus/${gridRootId}/move`)
      .set(auth())
      .send({ parentId: tabsRootId })
    expect(move.body.code).toBe(500)

    const del = await request(httpServer).delete(`/api/menus/${tabsRootId}`).set(auth())
    expect(del.body.code).toBe(500)
  })

  it('授本端角色：POST /roles 挂新端 + PUT /clients defaultRoleId 本端放行', async () => {
    const created = await request(httpServer)
      .post('/api/roles')
      .set(auth())
      .send({ roleName: '司机', roleCode: code('IT_P0_DRIVER'), clientId: clientX })
    expect(created.body.code).toBe(200)
    roleId = created.body.data.id as number
    expect(created.body.data.clientId).toBe(clientX)

    const upd = await request(httpServer)
      .put(`/api/clients/${clientX}`)
      .set(auth())
      .send({ defaultRoleId: roleId })
    expect(upd.body.code).toBe(200)
    expect(upd.body.data.defaultRoleId).toBe(roleId)
  })

  it('配端菜单：TAB 带 3 个一级菜单（带权限码）+ GRID 目录→菜单；第 6 个 Tab 被拒', async () => {
    async function createMenu(body: Record<string, unknown>): Promise<number> {
      const res = await request(httpServer).post('/api/menus').set(auth()).send(body)
      expect(res.body.code).toBe(200)
      const id = res.body.data.id as number
      clientMenuIds.push(id)
      return id
    }
    for (let i = 1; i <= 3; i++) {
      await createMenu({
        clientId: clientX,
        parentId: tabsRootId,
        menuName: `IT-P0-Tab${i}`,
        menuType: 1,
        permission: code(`IT_P0_TAB${i}`),
      })
    }
    const gridDir = await createMenu({
      clientId: clientX,
      parentId: gridRootId,
      menuName: '订单管理',
      menuType: 0,
    })
    await createMenu({
      clientId: clientX,
      parentId: gridDir,
      menuName: '订单列表',
      menuType: 1,
      permission: code('IT_P0_GRID'),
    })

    // 端形态上限：补到 5 后第 6 个被拒（body code 500）
    await createMenu({ clientId: clientX, parentId: tabsRootId, menuName: 'IT-P0-Tab4', menuType: 1 })
    await createMenu({ clientId: clientX, parentId: tabsRootId, menuName: 'IT-P0-Tab5', menuType: 1 })
    const sixth = await request(httpServer)
      .post('/api/menus')
      .set(auth())
      .send({ clientId: clientX, parentId: tabsRootId, menuName: 'IT-P0-Tab6', menuType: 1 })
    expect(sixth.status).toBe(200)
    expect(sixth.body.code).toBe(500)
    expect(String(sixth.body.msg)).toMatch(/Tab/)
  })

  it('角色授权本端树（含分区根），GET /roles/:id/menus 回读一致', async () => {
    const treeRes = await request(httpServer).get(`/api/menus/tree?clientId=${clientX}`).set(auth())
    const allIds = flatten(treeRes.body.data as MenuNode[]).map((n) => n.id)
    expect(allIds.length).toBe(clientMenuIds.length + 2)

    const put = await request(httpServer)
      .put(`/api/roles/${roleId}/menus`)
      .set(auth())
      .send({ menuIds: allIds })
    expect(put.body.code).toBe(200)

    const back = await request(httpServer).get(`/api/roles/${roleId}/menus`).set(auth())
    expect((back.body.data as number[]).sort()).toEqual(allIds.sort())
  })

  it('端内可见：仅本端角色用户 X-Client-Id=新端 getInfo 非空 / portal 上下文空；auth/menus 出树', async () => {
    // 用户 = 密码哈希复制 admin 直接落库（数据准备手法对齐 cross-client.spec，
    // 注册/用户 API 不属 4.4 验收链）
    await execute(
      `INSERT INTO sys_user (username, password, nickname, status, is_deleted, created_at, updated_at)
       SELECT ?, admin_pw.password, 'IT-P0司机', 1, 0, NOW(), NOW()
         FROM (SELECT password FROM sys_user WHERE username = 'admin') admin_pw`,
      [code('it_p0_user')],
    )
    const u = await queryRows<{ id: number }>('SELECT id FROM sys_user WHERE username = ?', [
      code('it_p0_user'),
    ])
    userId = u[0].id
    await execute('INSERT INTO sys_user_role (user_id, role_id) VALUES (?, ?)', [userId, roleId])

    const loginX = await request(httpServer)
      .post('/api/auth/login')
      .set('X-Client-Id', String(clientX))
      .send({ username: code('it_p0_user'), password: 'admin123' })
    expect(loginX.body.code).toBe(200)
    expect(loginX.body.data.user.roles).toEqual([code('IT_P0_DRIVER')])
    const xToken = loginX.body.data.accessToken as string

    const infoX = await request(httpServer)
      .get('/api/auth/userinfo')
      .set('Authorization', `Bearer ${xToken}`)
      .set('X-Client-Id', String(clientX))
    expect(infoX.body.code).toBe(200)
    const userX = infoX.body.data.user as UserInfo
    expect(userX.roles).toEqual([code('IT_P0_DRIVER')])
    expect(userX.permissions.length).toBeGreaterThan(0)

    // portal 上下文（不带头）= 该端无角色：空而非报错
    const infoP = await request(httpServer)
      .get('/api/auth/userinfo')
      .set('Authorization', `Bearer ${xToken}`)
    const userP = infoP.body.data.user as UserInfo
    expect(userP.roles).toEqual([])
    expect(userP.permissions).toEqual([])

    // 运行态菜单：X-Client-Id=新端 出该端授权树（含分区根与 3 Tab）
    const menus = await request(httpServer)
      .get('/api/auth/menus')
      .set('Authorization', `Bearer ${xToken}`)
      .set('X-Client-Id', String(clientX))
    expect(menus.body.code).toBe(200)
    const names = flatten(menus.body.data as MenuNode[]).map((n) => n.menuName)
    expect(names).toContain('IT-P0-Tab1')
    expect(names).toContain('订单列表')
  })

  it('portal 页面 API 防线：他端用户 X-Client-Id=新端 直连 portal 挂接页面 → 403', async () => {
    // portal 自建「目录→菜单」挂 /page/{key} 与独立权限码（admin 上下文=portal）
    const dir = await request(httpServer)
      .post('/api/menus')
      .set(auth())
      .send({ parentId: null, menuName: 'IT-P0门户页', menuType: 0 })
    expect(dir.body.code).toBe(200)
    const dirId = dir.body.data.id as number
    portalMenuIds.push(dirId)
    const pageKey = code('it_p0_page')
    const menu = await request(httpServer)
      .post('/api/menus')
      .set(auth())
      .send({
        parentId: dirId,
        menuName: 'IT-P0门户菜单',
        menuType: 1,
        path: `/page/${pageKey}`,
        permission: code('IT_P0_PORTAL'),
      })
    expect(menu.body.code).toBe(200)
    portalMenuIds.push(menu.body.data.id as number)

    const loginX = await request(httpServer)
      .post('/api/auth/login')
      .set('X-Client-Id', String(clientX))
      .send({ username: code('it_p0_user'), password: 'admin123' })
    const xToken = loginX.body.data.accessToken as string

    const res = await request(httpServer)
      .get(`/api/v1/pages/${pageKey}/definition`)
      .set('Authorization', `Bearer ${xToken}`)
      .set('X-Client-Id', String(clientX))
    expect(res.body.code).toBe(403)
    expect(String(res.body.msg)).toContain('无页面访问权限')
  })
})
