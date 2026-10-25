import { afterAll, describe, expect, it } from 'vitest'
import { closeTestPool, execute, queryRows, TEST_TABLE_SCHEMA } from '../utils/test-db'

/**
 * Task 1 集成测试：sys_client / sys_client_channel 数据建模（V50）。
 *
 * 断言全部打在 information_schema 与真实行数据上（不是摆设测试）：
 * 表存在 → 唯一键存在 → portal seed 行 → WEB 渠道默认开通 → 重复渠道触发唯一键冲突。
 *
 * 前置：`DB_NAME=workflow_node_test pnpm migrate` 已把迁移应用到测试库。
 */

afterAll(async () => {
  await closeTestPool()
})

async function tableExists(name: string): Promise<boolean> {
  const rows = await queryRows<{ c: number }>(
    'SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
    [TEST_TABLE_SCHEMA, name],
  )
  return rows[0].c > 0
}

async function uniqueKeyColumns(table: string, keyName: string): Promise<string[]> {
  // ⚠️ information_schema 结果列名由服务端决定（MySQL 8 返回大写），
  //    必须用 AS 别名固定成小写键，否则 r.non_unique 取到 undefined。
  const rows = await queryRows<{ column_name: string; non_unique: number }>(
    'SELECT column_name AS column_name, non_unique AS non_unique FROM information_schema.statistics ' +
      'WHERE table_schema = ? AND table_name = ? AND index_name = ? ORDER BY seq_in_index',
    [TEST_TABLE_SCHEMA, table, keyName],
  )
  if (rows.length === 0) return []
  if (rows.some((r) => r.non_unique !== 0)) {
    throw new Error(`索引 ${keyName} 存在但不是唯一键`)
  }
  return rows.map((r) => r.column_name)
}

describe('sys_client 表结构', () => {
  it('表 sys_client 已创建', async () => {
    expect(await tableExists('sys_client')).toBe(true)
  })

  it('uk_client_code 唯一键约束 code 列', async () => {
    expect(await uniqueKeyColumns('sys_client', 'uk_client_code')).toEqual(['code'])
  })
})

describe('sys_client_channel 表结构', () => {
  it('表 sys_client_channel 已创建', async () => {
    expect(await tableExists('sys_client_channel')).toBe(true)
  })

  it('uk_client_channel 唯一键约束 (client_id, channel_type)', async () => {
    expect(await uniqueKeyColumns('sys_client_channel', 'uk_client_channel')).toEqual([
      'client_id',
      'channel_type',
    ])
  })
})

describe('portal seed 数据', () => {
  it('sys_client 含 id=1 / code=portal / name=平台端 / status=1 行', async () => {
    const rows = await queryRows<{ id: number; code: string; name: string; status: number }>(
      'SELECT id, code, name, status FROM sys_client WHERE id = 1',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 1, code: 'portal', name: '平台端', status: 1 })
  })

  it('sys_client_channel 恰有 1 行：client_id=1 的 WEB 渠道已开通、config_json 为空', async () => {
    const rows = await queryRows<{
      client_id: number
      channel_type: string
      enabled: number
      config_json: string | null
    }>('SELECT client_id, channel_type, enabled, config_json FROM sys_client_channel')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ client_id: 1, channel_type: 'WEB', enabled: 1 })
    expect(rows[0].config_json).toBeNull()
  })
})

describe('唯一键约束的真实行为', () => {
  it('重复插入 (client_id=1, channel_type=WEB) 触发 uk_client_channel 冲突', async () => {
    await expect(
      execute(
        "INSERT INTO sys_client_channel (client_id, channel_type, enabled) VALUES (1, 'WEB', 1)",
      ),
    ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' })
  })
})
