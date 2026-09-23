import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * 编译产物端到端冒烟测试。
 *
 * 【为什么必须有这个测试】
 *   它守护的是一类**只在特定转译器下才暴露**的故障：
 *   NestJS 的依赖注入依赖 emitDecoratorMetadata 产出的 design:paramtypes 元数据，
 *   而 esbuild（tsx / vitest 默认转译器）**不支持**该选项。
 *   实测踩过：用 `tsx src/main.ts` 启动时，JwtAuthGuard 的私有字段 reflector 被注入成
 *   undefined，任何请求都返回 500 —— 而 vitest+unplugin-swc 路径下（有元数据）
 *   所有测试都是绿的，完全发现不了。
 *
 *   因此本测试**不走 TestingModule**，而是真的 spawn `node dist/main.js`，
 *   用 HTTP 打真实端口。只有这样才能验证「生产启动路径」的注入是否正确。
 *
 * 依赖：dist/main.js 必须已构建（test:integration / test:e2e 脚本会先执行 nest build）。
 */

const DIST_MAIN = join(process.cwd(), 'dist', 'main.js')
// 用独立端口，避免与本机已运行的开发服务冲突
const PORT = '8099'
const BASE_URL = `http://localhost:${PORT}`

let child: ChildProcess | undefined

async function waitForHealth(timeoutMs: number): Promise<Response | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      return await fetch(`${BASE_URL}/api/health`)
    } catch {
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  return null
}

describe('编译产物端到端冒烟（真实进程 + 真实 HTTP）', () => {
  beforeAll(async () => {
    expect(
      existsSync(DIST_MAIN),
      `缺少 ${DIST_MAIN}。请先执行 nest build（pnpm build），` +
        `直接跑本文件时用 pnpm test:e2e。`,
    ).toBe(true)

    child = spawn(process.execPath, [DIST_MAIN], {
      env: { ...process.env, PORT },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    // 收集输出，启动失败时能给出可诊断的信息
    let output = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    ;(child as ChildProcess & { _captured?: () => string })._captured = () => output

    const res = await waitForHealth(30_000)
    if (res === null) {
      throw new Error(`编译产物在 30 秒内未就绪。进程输出：\n${output}`)
    }
  }, 60_000)

  afterAll(async () => {
    if (child !== undefined && child.exitCode === null) {
      child.kill('SIGTERM')
      // 给它一点时间优雅退出，避免测试进程残留子进程
      await new Promise((r) => setTimeout(r, 500))
      if (child.exitCode === null) child.kill('SIGKILL')
    }
  })

  it('GET /api/health 返回 200 与正确的 R 封装', async () => {
    const res = await fetch(`${BASE_URL}/api/health`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      code: 200,
      msg: 'success',
      data: { status: 'UP', buildTarget: 'workflow-backend-node' },
    })
  })

  it('依赖注入在无元数据的转译器下也必须工作（反射器被正确注入）', async () => {
    // 若 JwtAuthGuard 的 Reflector 未注入，@Public() 判定会抛异常，
    // 全局过滤器把 TypeError 映射成 500。这里断言绝不会是 500。
    const res = await fetch(`${BASE_URL}/api/health`)
    expect(res.status).not.toBe(500)
    const body = (await res.json()) as { code: number }
    expect(body.code).not.toBe(500)
  })

  it('未知路径返回 404（契约比对靠它区分「未实现」）', async () => {
    const res = await fetch(`${BASE_URL}/api/definitely-not-here`)
    expect(res.status).toBe(404)
  })

  it('POST 返回 200 而不是 NestJS 默认的 201（契约要求，对齐 Spring MVC）', async () => {
    // 这是实测踩到过的契约问题：NestJS 默认让 POST 返回 201，
    // 而 Java 全站返回 200。若漏了类级 @HttpCode(200)，所有 POST 端点都会不一致。
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    })
    expect(res.status).toBe(200)
    expect(res.status).not.toBe(201)
  })

  it('X-Tenant-Id 请求头不会破坏响应（租户拦截器正常工作）', async () => {
    const res = await fetch(`${BASE_URL}/api/health`, { headers: { 'X-Tenant-Id': 'default' } })
    expect(res.status).toBe(200)
  })
})
