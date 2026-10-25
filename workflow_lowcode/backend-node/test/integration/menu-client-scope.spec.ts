import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeTestPool, queryRows } from '../utils/test-db'

/**
 * Task 3 集成测试：V51 给 sys_menu 加 client_id 后的库内事实（真实 workflow_node_test）。
 *
 * 钉住简报 V51 的三条承诺：
 *   1. 列存在且形状 = BIGINT NOT NULL DEFAULT 1（存量行由 DEFAULT 回填，零破坏）；
 *   2. 索引 idx_menu_client(client_id, parent_id) 按序存在；
 *   3. 核对查询 `client_id IS NULL` 计数必须为 0（NOT NULL 约束的 sanity check），
 *      且存量菜单 100% 归属默认平台客户端 client_id=1。
 *
 * 前置：`DB_NAME=workflow_node_test pnpm migrate` 已应用 V51。
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

beforeAll(() => {
  // test-db.ts 固定连 workflow_node_test；本组只读，不造数据。
})

afterAll(async () => {
  await closeTestPool()
})

describe('V51 sys_menu.client_id 列', () => {
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
