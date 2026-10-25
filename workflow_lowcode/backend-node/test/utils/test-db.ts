import { createPool, type Pool } from 'mysql2'
import { loadEnv } from '../../src/framework/config/env'

/**
 * 集成测试专用数据库名。
 *
 * ⚠️ 固定值，不跟随 DB_NAME —— 集成测试会对库做断言与插入，
 *    绝不允许指向开发库（workflow_v6）。前置准备：
 *    建库后用 `DB_NAME=workflow_node_test pnpm migrate` 应用迁移。
 */
export const TEST_DB_NAME = 'workflow_node_test'

/** information_schema 查询用的 TABLE_SCHEMA 常量（与 TEST_DB_NAME 同值，防拼写漂移）。 */
export const TEST_TABLE_SCHEMA = TEST_DB_NAME

let pool: Pool | undefined

/**
 * 测试库连接池（懒建、全测试文件共享）。
 *
 * 最小基建：不提供清理钩子也不做 fixture —— 本变更的集成测试只读
 * schema/seed + 一条注定失败的重复插入，无需数据准备。
 */
export function getTestPool(): Pool {
  if (!pool) {
    const env = loadEnv()
    pool = createPool({
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      database: TEST_DB_NAME,
      charset: 'utf8mb4',
      timezone: '+08:00',
      connectionLimit: 2,
    })
  }
  return pool
}

/** 执行带参数查询，返回行数组。 */
export async function queryRows<T = any>(sql: string, params?: unknown[]): Promise<T[]> {
  const [rows] = await getTestPool().promise().query(sql, params)
  return rows as T[]
}

/** 执行 SQL（INSERT 等），错误原样抛出。 */
export async function execute(sql: string, params?: unknown[]): Promise<void> {
  await getTestPool().promise().execute(sql, params)
}

/** 释放连接池（每个 spec 文件 afterAll 调用一次，否则 vitest 进程挂起）。 */
export async function closeTestPool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = undefined
  }
}
