import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Kysely, MysqlDialect, sql } from 'kysely'
import { createPool } from 'mysql2'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadEnv } from '../../src/framework/config/env'
import { Migrator } from '../../src/framework/database/migrator'

/**
 * SSE 实时推送的集成测试（规格 U12）。
 *
 * ## 为什么它不在契约网里
 * 契约比对器按「发一次请求读一个 JSON」工作，**流式响应不适用**（规格 U12 的原话）。
 * 所以这个端点的验证方式是本文件：真起应用 + 真开流 + 真触发推送。
 *
 * ## 为什么要自己的库和自己的端口
 * 「推送」只能由**写消息**的动作触发（站内信测试消息也真的落库）。
 * 若打在 `workflow_v6`（契约库）上，会给 admin 的收件箱留下额外消息 ⇒
 * 之后契约场景里 `GET /api/v1/notifications` 的内容列表就多一行，契约会假红。
 * 因此本文件自带一个一次性库 `workflow_node_sse_test`，与契约库彻底隔离。
 *
 * ## 覆盖点（对应 Java 的三处 `sendToUser` 之一 + 两条校验）
 *   ① 有效 access token → 200 + `text/event-stream`，且**真的能收到** `new-message`；
 *   ② 非法 token → 400「无效的访问令牌」（Java 是 `IllegalArgumentException` ⇒ 400，不是业务 200）；
 *   ③ refresh token → 400「令牌类型必须是访问令牌」。
 */

const DIST_MAIN = join(process.cwd(), 'dist', 'main.js')
const PORT = '8098'
const BASE_URL = `http://localhost:${PORT}`
const SSE_DB = 'workflow_node_sse_test'

let child: ChildProcess | undefined

function adminConnection(): Kysely<unknown> {
  const env = loadEnv()
  return new Kysely<unknown>({
    dialect: new MysqlDialect({
      pool: createPool({
        host: env.db.host,
        port: env.db.port,
        user: env.db.user,
        password: env.db.password,
        multipleStatements: false,
      }),
    }),
  })
}

async function waitForHealth(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`)
      if (res.status === 200) return true
    } catch {
      // 还没起来
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

async function login(username = 'admin', password = 'admin123'): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const body = (await res.json()) as { data?: { accessToken?: string } }
  const token = body.data?.accessToken
  if (token === undefined) throw new Error(`登录失败: ${JSON.stringify(body)}`)
  return token
}

/** 从 SSE 流里读，直到出现指定事件名或超时。 */
async function readUntilEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  eventName: string,
  timeoutMs: number,
): Promise<string | null> {
  const decoder = new TextDecoder()
  let buffer = ''
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now()
    const chunk = await Promise.race([
      reader.read(),
      new Promise<{ done: true; value: undefined }>((resolve) =>
        setTimeout(() => resolve({ done: true, value: undefined }), remaining),
      ),
    ])
    if (chunk.done) break
    buffer += decoder.decode(chunk.value, { stream: true })
    if (buffer.includes(`event: ${eventName}`)) return buffer
  }
  return null
}

describe('SSE 实时推送（真实进程 + 真实流）', () => {
  beforeAll(async () => {
    expect(existsSync(DIST_MAIN), `缺少 ${DIST_MAIN}，请先 nest build（pnpm build）`).toBe(true)

    // 1) 一次性库：建库 + 跑全部迁移（与契约库隔离）
    const admin = adminConnection()
    try {
      await sql`DROP DATABASE IF EXISTS ${sql.id(SSE_DB)}`.execute(admin)
      await sql`CREATE DATABASE ${sql.id(SSE_DB)} CHARACTER SET utf8mb4`.execute(admin)
    } finally {
      await admin.destroy()
    }
    const env = loadEnv()
    const db = new Kysely<unknown>({
      dialect: new MysqlDialect({
        pool: createPool({
          host: env.db.host,
          port: env.db.port,
          user: env.db.user,
          password: env.db.password,
          database: SSE_DB,
          multipleStatements: false,
        }),
      }),
    })
    try {
      await new Migrator(db, join(process.cwd(), 'migrations')).run()
    } finally {
      await db.destroy()
    }

    // 2) 用这个库起真实编译产物
    child = spawn(process.execPath, [DIST_MAIN], {
      env: { ...process.env, PORT, DB_NAME: SSE_DB },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout?.on('data', (c: Buffer) => (output += c.toString()))
    child.stderr?.on('data', (c: Buffer) => (output += c.toString()))
    const ready = await waitForHealth(40_000)
    if (!ready) throw new Error(`应用在 40 秒内未就绪。进程输出：\n${output}`)
  }, 120_000)

  afterAll(async () => {
    if (child !== undefined && child.exitCode === null) {
      child.kill('SIGTERM')
      await new Promise((r) => setTimeout(r, 500))
      if (child.exitCode === null) child.kill('SIGKILL')
    }
  })

  it('非法 token → 400「无效的访问令牌」（IllegalArgumentException 形态，不是业务 200）', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/notifications/sse?token=not-a-jwt`)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ code: 400, msg: '无效的访问令牌', data: null })
  })

  it('refresh token → 400「令牌类型必须是访问令牌」', async () => {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    })
    const body = (await loginRes.json()) as { data?: { refreshToken?: string } }
    const refreshToken = body.data?.refreshToken
    expect(refreshToken).toBeTruthy()

    const res = await fetch(
      `${BASE_URL}/api/v1/notifications/sse?token=${encodeURIComponent(String(refreshToken))}`,
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ code: 400, msg: '令牌类型必须是访问令牌', data: null })
  })

  it('连上后发一条站内信 → 收到 new-message 事件（端到端验证推送链路）', async () => {
    const token = await login()
    const controller = new AbortController()
    const res = await fetch(
      `${BASE_URL}/api/v1/notifications/sse?token=${encodeURIComponent(token)}`,
      {
        signal: controller.signal,
        headers: { 'X-Tenant-Id': 'default' },
      },
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type') ?? '').toContain('text/event-stream')
    // ⚠️ fetch 的 headers 到达说明服务端处理器已经返回 ⇒ register() 已执行 ⇒ 连接已登记。
    //    必须在这之后才触发推送，否则 sendToUser 会按「用户不在线」跳过。
    const reader = res.body?.getReader()
    expect(reader).toBeDefined()

    // 触发推送：站内信连通性测试消息（Java `ChannelController.test` → sendToUser(userId, "new-message", msg)）
    const testRes = await fetch(`${BASE_URL}/api/v1/admin/notification/channels/1/test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'X-Tenant-Id': 'default' },
    })
    expect(testRes.status).toBe(200)

    const frame = await readUntilEvent(reader as ReadableStreamDefaultReader<Uint8Array>, 'new-message', 10_000)
    expect(frame, '10 秒内没有收到 new-message 事件').not.toBeNull()
    // 载荷必须能解析成消息对象，且形如列表元素（前端直接 unshift 进列表）
    const dataLine = String(frame)
      .split('\n')
      .find((line) => line.startsWith('data: '))
    expect(dataLine).toBeDefined()
    const payload = JSON.parse(String(dataLine).slice('data: '.length)) as Record<string, unknown>
    expect(payload.title).toBe('【渠道测试】站内信连通性测试')
    expect(payload.id).toBeTypeOf('number')

    controller.abort()
  }, 30_000)

  it('SSE 连接中途断开不影响后续写操作（推送目标是离线用户时静默跳过）', async () => {
    // 上一条测试已 abort 掉连接 ⇒ 再发一条测试消息：必须成功（推送跳过，但落库照旧）
    const token = await login()
    const res = await fetch(`${BASE_URL}/api/v1/admin/notification/channels/1/test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'X-Tenant-Id': 'default' },
    })
    expect(res.status).toBe(200)
  })
})
