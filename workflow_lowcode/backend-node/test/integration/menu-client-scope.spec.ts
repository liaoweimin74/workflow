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
 * Task 3+4 集成测试：sys_menu 客户端作用域。
 *
 * Task 3（V51 库内事实）：列形状 / 索引按序 / NULL=0 / 全量回填 portal。
 * Task 4（按端分树）：
 *   - A 端建树 B 端树不可见（clientId 过滤真实生效）；
 *   - portal 树响应回归快照——键名集合 = 旧 VO + 增量 clientId 字段（零破坏）；
 *   - 移动端 Tab 区第 6 个落点被服务端拒绝（BusinessException → body code 500）。
 *
 * 前置：两库已应用 V51。数据隔离：自建端 + 自建菜单（client_id 归属清理），绝不碰 portal。
 */

interface ColRow {
  COLUMN_NAME: string
  DATA_TYPE: string
  IS_NULLABLE: string
  COLUMN_DEFAULT: string | null
}

interface IdxRow {
  INDEX_NAME: string
  SEQ_IN_INDEX: number
  COLUMN_NAME: string
}

interface MenuNode {
  id: number
  parentId: number | null
  menuName: string
  menuType: number
  clientId?: number
  children: MenuNode[] | null
}

let app: INestApplication
let httpServer: Parameters<typeof request>[0]
let token = ''
/** 自建测试端 id（desktop=B、mobile=C），afterAll 级联清理其菜单与渠道。 */
let clientB = 0
let clientC = 0
const cleanClientIds: number[] = []

function auth(): { Authorization: string } {
  return { Authorization: `Bearer ${token}` }
}

function uniqueCode(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`.slice(0, 64)
}

/** 递归收集树里所有节点（回归快照断言用）。 */
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

async function createClient(name: string): Promise<number> {
  const res = await request(httpServer)
    .post('/api/clients')
    .set(auth())
    .send({ code: uniqueCode('it_scope'), name })
  expect(res.body.code).toBe(200)
  const id = res.body.data.id as number
  cleanClientIds.push(id)
  return id
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
  for (const id of cleanClientIds) {
    await execute('DELETE FROM sys_menu WHERE client_id = ?', [id])
    await execute('DELETE FROM sys_client_channel WHERE client_id = ?', [id])
    await execute('DELETE FROM sys_client WHERE id = ?', [id])
  }
  if (app) await app.close()
  await closeTestPool()
})

describe('V51 sys_menu.client_id 列（Task 3 库内事实）', () => {
  it('列为 BIGINT NOT NULL DEFAULT 1', async () => {
    const rows = await queryRows<ColRow>(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_menu' AND COLUMN_NAME = 'client_id'`,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].DATA_TYPE).toBe('bigint')
    expect(rows[0].IS_NULLABLE).toBe('NO')
    expect(rows[0].COLUMN_DEFAULT).toBe('1')
  })

  it('索引 idx_menu_client 为 (client_id, parent_id) 按序复合', async () => {
    const rows = await queryRows<IdxRow>(
      `SELECT INDEX_NAME, SEQ_IN_INDEX, COLUMN_NAME
         FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_menu' AND INDEX_NAME = 'idx_menu_client'
        ORDER BY SEQ_IN_INDEX`,
    )
    expect(rows.map((r) => r.COLUMN_NAME)).toEqual(['client_id', 'parent_id'])
  })

  it('核对查询：client_id IS NULL 计数为 0', async () => {
    const rows = await queryRows<{ c: number | string }>(
      'SELECT COUNT(*) AS c FROM sys_menu WHERE client_id IS NULL',
    )
    expect(Number(rows[0].c)).toBe(0)
  })

  it('存量菜单 100% 回填默认平台客户端（client_id=1）', async () => {
    const rows = await queryRows<{ c: number | string }>(
      'SELECT COUNT(*) AS c FROM sys_menu WHERE client_id <> 1',
    )
    expect(Number(rows[0].c)).toBe(0)
  })
})

describe('Task 4：菜单树按端作用域', () => {
  /** 两个自建端：B=纯桌面（不开渠道，WEB 形态）、C=开 H5（移动形态）。 */
  const bRootName = `IT-B根_${Date.now()}`

  it('准备：创建测试端 B/C', async () => {
    clientB = await createClient('IT作用域B')
    clientC = await createClient('IT作用域C')
    const h5 = await request(httpServer)
      .put(`/api/clients/${clientC}/channels`)
      .set(auth())
      .send({ channelType: 'H5', enabled: 1, config: { loginMethods: ['account'] } })
    expect(h5.body.code).toBe(200)
  })

  it('POST /api/menus 带 clientId 在 B 端建目录成功', async () => {
    const res = await request(httpServer)
      .post('/api/menus')
      .set(auth())
      .send({ clientId: clientB, parentId: null, menuName: bRootName, menuType: 0 })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
    expect(typeof res.body.data.id).toBe('number')
    // VO 增量字段：clientId 回显归属端
    expect(res.body.data.clientId).toBe(clientB)
  })

  it('GET /api/menus/tree?clientId=B 只见 B 端树', async () => {
    const res = await request(httpServer).get(`/api/menus/tree?clientId=${clientB}`).set(auth())
    expect(res.body.code).toBe(200)
    const names = (res.body.data as MenuNode[]).map((n) => n.menuName)
    expect(names).toContain(bRootName)
    // B 端树不含任何 portal 一级节点（如「系统管理」）
    expect(names).not.toContain('系统管理')
  })

  it('缺省 GET /api/menus/tree（portal）不可见 B 端节点——零破坏回归快照', async () => {
    const res = await request(httpServer).get('/api/menus/tree').set(auth())
    expect(res.body.code).toBe(200)
    const nodes = flatten(res.body.data as MenuNode[])
    expect(nodes.length).toBeGreaterThan(0)
    // 增量字段：每个节点带 clientId，缺省树全为 portal(1)
    expect(nodes.every((n) => n.clientId === 1)).toBe(true)
    // 键名集合 = 旧 VO 十个键 + clientId，无其他增减
    expect(Object.keys(nodes[0]).sort()).toEqual(
      [
        'children',
        'component',
        'icon',
        'id',
        'menuName',
        'menuType',
        'parentId',
        'path',
        'permission',
        'sortOrder',
        'clientId',
      ].sort(),
    )
    // B 端节点绝不出现在 portal 树
    expect(nodes.some((n) => n.menuName === bRootName)).toBe(false)
  })

  it('move 到 Tab 区第 6 个落点被拒（body code 500，端形态约束消息）', async () => {
    // zone 根与 5 个子菜单直接落库（V52 seed 属后续任务，这里自建自清）
    await execute(
      `INSERT INTO sys_menu (client_id, parent_id, menu_name, menu_type, sort_order, status, is_deleted)
       VALUES (?, NULL, 'mzone:tabs 根', 0, 1, 1, 0)`,
      [clientC],
    )
    const tabsRootId = Number(
      (
        await queryRows<{ id: number }>(
          'SELECT id FROM sys_menu WHERE client_id = ? AND parent_id IS NULL AND menu_name = ? ORDER BY id DESC LIMIT 1',
          [clientC, 'mzone:tabs 根'],
        )
      )[0].id,
    )
    expect(tabsRootId).toBeGreaterThan(0)
    // component 置为约定 zone 根标识
    await execute("UPDATE sys_menu SET component = 'mzone:tabs' WHERE id = ?", [tabsRootId])
    for (let i = 1; i <= 5; i++) {
      await execute(
        `INSERT INTO sys_menu (client_id, parent_id, menu_name, menu_type, sort_order, status, is_deleted)
         VALUES (?, ?, ?, 1, ?, 1, 0)`,
        [clientC, tabsRootId, `IT-Tab-${i}`, i],
      )
    }
    // 待移动节点：先挂 C 端另一目录下（绕过 create 校验直接落库）
    await execute(
      `INSERT INTO sys_menu (client_id, parent_id, menu_name, menu_type, sort_order, status, is_deleted)
       VALUES (?, NULL, 'IT-待移动', 1, 9, 1, 0)`,
      [clientC],
    )
    const moveId = Number(
      (
        await queryRows<{ id: number }>(
          `SELECT id FROM sys_menu WHERE client_id = ? AND menu_name = 'IT-待移动'`,
          [clientC],
        )
      )[0].id,
    )

    const res = await request(httpServer)
      .put(`/api/menus/${moveId}/move`)
      .set(auth())
      .send({ parentId: tabsRootId })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(500)
    expect(String(res.body.msg)).toMatch(/Tab/)
  })

  it('move 到 GRID 区（深度 1）成功——校验非一刀切', async () => {
    // 建 GRID 根
    await execute(
      `INSERT INTO sys_menu (client_id, parent_id, menu_name, menu_type, component, sort_order, status, is_deleted)
       VALUES (?, NULL, 'mzone:grid 根', 0, 'mzone:grid', 2, 1, 0)`,
      [clientC],
    )
    const gridRootId = Number(
      (
        await queryRows<{ id: number }>(
          `SELECT id FROM sys_menu WHERE client_id = ? AND component = 'mzone:grid'`,
          [clientC],
        )
      )[0].id,
    )
    const moveId = Number(
      (
        await queryRows<{ id: number }>(
          `SELECT id FROM sys_menu WHERE client_id = ? AND menu_name = 'IT-待移动'`,
          [clientC],
        )
      )[0].id,
    )
    const res = await request(httpServer)
      .put(`/api/menus/${moveId}/move`)
      .set(auth())
      .send({ parentId: gridRootId })
    expect(res.body.code).toBe(200)
    expect(res.body.data.parentId).toBe(gridRootId)
  })
})
