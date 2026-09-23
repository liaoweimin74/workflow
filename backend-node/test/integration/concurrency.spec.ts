import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Kysely, MysqlDialect, sql } from 'kysely'
import { createPool } from 'mysql2'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadEnv } from '../../src/framework/config/env'
import { Migrator } from '../../src/framework/database/migrator'
import { EnginePersistence } from '../../src/engine/runtime/engine-persistence'
import type { DB } from '../../src/framework/database/types'

/**
 * 并发控制（乐观锁 CAS）的集成测试。
 *
 * ## 为什么必须有
 * 契约网是**串行**执行的，永远观察不到并发缺陷。而引擎的写路径是"读-改-写"：
 * 两个针对同一实例的并发请求会在各自内存态里看到旧状态，后落库的一方覆盖前一方
 * （丢更新），副作用还会重复。Java 靠 Flowable 的 `REV_` 乐观锁兜底，
 * Node 侧补的就是同一件事：`UPDATE ... WHERE id = ? AND lock_version = ?`
 * （见 `migrations/V37` 与 `EnginePersistence.bumpLockVersion`）。
 *
 * ## 两部分
 * - **A 确定性**：直接调持久化层，用同一个（过期的）版本写两次 ⇒ 第二次必须抛冲突。
 *   这条不依赖调度时序，是 CAS 能力本身的证明。
 * - **B 端到端**：真起编译产物 + 真并发两个 complete 请求 ⇒ 恰好一个成功；
 *   并且实例只推进一次（审批意见只有一条）。
 *
 * ## 为什么自带库
 * 会写 wfe_* 与评论表。与契约库隔离（`workflow_node_concurrency_test`），
 * 避免给契约场景留下残余数据造成假红。
 */

const DIST_MAIN = join(process.cwd(), 'dist', 'main.js')
const PORT = '8097'
const BASE_URL = `http://localhost:${PORT}`
const DB_NAME = 'workflow_node_concurrency_test'

let child: ChildProcess | undefined
let db: Kysely<DB>

function envPool(database?: string) {
  const env = loadEnv()
  return createPool({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database,
    multipleStatements: false,
  })
}

async function waitForHealth(timeoutMs: number): Promise<string | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`)
      if (res.status === 200) return null
    } catch {
      // 还没起来
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return '应用未在超时内就绪'
}

async function api<T>(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = { 'X-Tenant-Id': 'default' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token !== undefined) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json()) as T }
}

function bpmnFor(key: string): string {
  return [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:wf="http://workflow.com/schema/bpmn/wf" xmlns:flowable="http://flowable.org/bpmn" targetNamespace="conc">',
    `  <bpmn:process id="${key}" name="并发测试流程" isExecutable="true">`,
  '    <bpmn:startEvent id="Start_1"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>',
  '    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Initiator_1" />',
  '    <bpmn:userTask id="Initiator_1" name="发起" wf:nodeRole="initiator" flowable:assignee="${initiator}"><bpmn:incoming>Flow_1</bpmn:incoming><bpmn:outgoing>Flow_2</bpmn:outgoing></bpmn:userTask>',
  '    <bpmn:sequenceFlow id="Flow_2" sourceRef="Initiator_1" targetRef="Approve_1" />',
  '    <bpmn:userTask id="Approve_1" name="审批" flowable:assignee="concuser"><bpmn:incoming>Flow_2</bpmn:incoming><bpmn:outgoing>Flow_3</bpmn:outgoing></bpmn:userTask>',
  '    <bpmn:sequenceFlow id="Flow_3" sourceRef="Approve_1" targetRef="End_1" />',
  '    <bpmn:endEvent id="End_1"><bpmn:incoming>Flow_3</bpmn:incoming></bpmn:endEvent>',
  '  </bpmn:process>',
  '</bpmn:definitions>',
  '',
  ].join('\n')
}

/** 建一个「发起 → 审批 → 结束」的流程并部署。 */
async function deployProcess(token: string, key: string): Promise<void> {
  const draft = await api<{ data?: { id?: string } }>(
    'POST',
    `/api/v1/process-definitions/drafts?name=${encodeURIComponent('并发测试流程')}&key=${key}`,
    undefined,
    token,
  )
  const draftId = draft.body.data?.id
  expect(draftId, `建草稿失败：${JSON.stringify(draft.body)}`).toBeTruthy()

  const saved = await api<{ code: number }>(
    'PUT',
    `/api/v1/process-definitions/${String(draftId)}/design`,
    {
      name: '并发测试流程',
      key,
      bpmnXml: bpmnFor(key),
      nodeConfigs: {
        Approve_1: JSON.stringify({ basic: { name: '审批' }, approval: { multiMode: '' } }),
        __PROCESS__: JSON.stringify({ numberRule: { enabled: false } }),
      },
    },
    token,
  )
  expect(saved.body.code, `保存设计失败：${JSON.stringify(saved.body)}`).toBe(200)

  const deployed = await api<{ code: number }>(
    'POST',
    `/api/v1/process-definitions/${String(draftId)}/deploy`,
    undefined,
    token,
  )
  expect(deployed.body.code, `部署失败：${JSON.stringify(deployed.body)}`).toBe(200)
}

describe('并发控制（乐观锁 CAS）', () => {
  beforeAll(async () => {
    expect(existsSync(DIST_MAIN), `缺少 ${DIST_MAIN}，请先 nest build`).toBe(true)

    const admin = new Kysely<unknown>({
      dialect: new MysqlDialect({ pool: envPool() }),
    })
    try {
      await sql`DROP DATABASE IF EXISTS ${sql.id(DB_NAME)}`.execute(admin)
      await sql`CREATE DATABASE ${sql.id(DB_NAME)} CHARACTER SET utf8mb4`.execute(admin)
    } finally {
      await admin.destroy()
    }

    db = new Kysely<DB>({ dialect: new MysqlDialect({ pool: envPool(DB_NAME) }) })
    // Migrator 的签名是 `Kysely<unknown>`（迁移全是裸 DDL/DML，与表类型无关）
    await new Migrator(db as never, join(process.cwd(), 'migrations')).run()

    child = spawn(process.execPath, [DIST_MAIN], {
      env: { ...process.env, PORT, DB_NAME },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout?.on('data', (c: Buffer) => (output += c.toString()))
    child.stderr?.on('data', (c: Buffer) => (output += c.toString()))
    const failure = await waitForHealth(40_000)
    if (failure !== null) throw new Error(`${failure}。进程输出：\n${output}`)
  }, 120_000)

  afterAll(async () => {
    if (child !== undefined && child.exitCode === null) {
      child.kill('SIGTERM')
      await new Promise((r) => setTimeout(r, 500))
      if (child.exitCode === null) child.kill('SIGKILL')
    }
    if (db !== undefined) await db.destroy()
  })

  it('A 确定性：用过期版本写两次，第二次必须抛并发冲突（而不是静默覆盖）', async () => {
    const persistence = new EnginePersistence(db)
    const token = await login()
    const instanceId = await startInstance(token, 'conc_flow_a')

    const first = await persistence.loadState(instanceId)
    const second = await persistence.loadState(instanceId)
    // 两次读到的版本必须一致（没人写过）
    expect(second.lockVersion).toBe(first.lockVersion)

    // 第一次写：成功，版本 +1
    await persistence.replaceRuntimeRows(
      instanceId,
      'default',
      first.state,
      first.variables,
      first.lockVersion,
    )
    expect(await persistence.currentLockVersion(instanceId)).toBe(first.lockVersion + 1)

    // 第二次写：仍用**过期**版本 ⇒ 必须抛并发冲突
    await expect(
      persistence.replaceRuntimeRows(
        instanceId,
        'default',
        second.state,
        second.variables,
        second.lockVersion,
      ),
    ).rejects.toThrow(/并发修改冲突/)

    // 变量路径同理
    await expect(
      persistence.replaceVariables(instanceId, { x: 1 }, first.lockVersion),
    ).rejects.toThrow(/并发修改冲突/)
  })

  it('B 端到端：同一任务被并发完成时，恰好一个成功，实例只推进一次', async () => {
    const token = await login()
    const instanceId = await startInstance(token, 'conc_flow_b')
    const taskId = await firstTaskId(token)

    // 真并发：两个请求几乎同时到达
    const [a, b] = await Promise.all([
      api<{ code: number; msg: string }>(
        'POST',
        `/api/v1/tasks/${taskId}/complete`,
        { userId: 'concuser', comment: '同意' },
        token,
      ),
      api<{ code: number; msg: string }>(
        'POST',
        `/api/v1/tasks/${taskId}/complete`,
        { userId: 'concuser', comment: '同意' },
        token,
      ),
    ])

    const succeeded = [a, b].filter((r) => r.status === 200 && r.body.code === 200)
    const failed = [a, b].filter((r) => !(r.status === 200 && r.body.code === 200))
    expect(succeeded, `并发完成应恰好一个成功：${JSON.stringify([a.body, b.body])}`).toHaveLength(1)
    expect(failed).toHaveLength(1)

    /**
     * ⚠️ 失败的那一个有两种合法形态，取决于两个请求在时间上是否真的重叠：
     *   - 重叠 ⇒ 落库时 CAS 失败 ⇒ **500「并发修改冲突」**（新加的能力）
     *   - 完全串行 ⇒ 第二个请求读到的任务已是终态 ⇒ 400「任务已处理」（既有行为）
     * 两种都保证"不会重复推进"，所以这里只断言失败消息属于这两类之一，
     * 不做"一定出现并发冲突"的脆弱断言（那取决于调度时序）。
     */
    expect(failed[0].body.msg).toMatch(/并发修改冲突|任务已处理/)

    // 实例只推进一次：审批意见恰好一条，且流程已结束
    const comments = await db
      .selectFrom('wf_task_comment')
      .select((eb) => eb.fn.countAll<number>().as('c'))
      .where('process_instance_id', '=', instanceId)
      .where('action', '=', 'approve')
      .executeTakeFirst()
    expect(Number(comments?.c ?? 0), '审批意见被重复插入 ⇒ 说明并发推进发生了').toBe(1)

    const instance = await api<{ data?: { ended?: boolean } }>(
      'GET',
      `/api/v1/process-instances/${instanceId}`,
      undefined,
      token,
    )
    expect(instance.body.data?.ended).toBe(true)
  }, 60_000)
})

async function login(): Promise<string> {
  const res = await api<{ data?: { accessToken?: string } }>('POST', '/api/auth/login', {
    username: 'admin',
    password: 'admin123',
  })
  const token = res.body.data?.accessToken
  if (token === undefined) throw new Error(`登录失败: ${JSON.stringify(res.body)}`)
  return token
}

let deployCounter = 0

async function startInstance(token: string, keyPrefix: string): Promise<string> {
  const key = `${keyPrefix}_${++deployCounter}`
  await deployProcess(token, key)
  const started = await api<{ code: number; data?: { id?: string }; msg?: string }>(
    'POST',
    '/api/v1/process-instances',
    { processKey: key, businessKey: `${key}-biz`, variables: { initiator: '1' } },
    token,
  )
  const instanceId = started.body.data?.id
  expect(instanceId, `发起失败：${JSON.stringify(started.body)}`).toBeTruthy()
  return String(instanceId)
}

async function firstTaskId(token: string): Promise<string> {
  const res = await api<{ data?: { content?: Array<{ taskId: string }> } }>(
    'GET',
    '/api/v1/tasks?assignee=concuser&page=1&size=20',
    undefined,
    token,
  )
  const taskId = res.body.data?.content?.[0]?.taskId
  expect(taskId, `没拿到待办任务：${JSON.stringify(res.body)}`).toBeTruthy()
  return String(taskId)
}
