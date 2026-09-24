import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Endpoint } from './lib/java-source'
import { normalizeBody, normalizeHeaders } from './lib/normalize'
import {
  type RecordedScenario,
  type RecordedStep,
  type Scenario,
  type ScenarioStep,
  type ScenarioVars,
  resolveDeep,
  resolveTemplate,
  scenarioFileName,
  createRunId,
  stepHeaders,
} from './lib/scenario'

/**
 * 黄金样本录制器：对**运行中的 Java 后端**按场景逐步执行，把每步的响应落盘为契约基准。
 *
 * 前置条件：Java 后端已运行（本项目在 8082；8080 被 DSH Web GUI 占用）。
 * 按 AGENTS.md，Java 后端要在**独立的 Windows 终端窗口**启动。
 *
 * 用法：
 *   $env:JAVA_BASE_URL='http://localhost:8082'; pnpm golden:record
 *
 * 产出：
 *   test/fixtures/golden/<NN>__<场景名>.json   —— 每个场景一个文件，含全部步骤
 *   tools/endpoints.need-scenario.json         —— 尚未覆盖的端点清单
 */

const BASE_URL = process.env.JAVA_BASE_URL ?? 'http://localhost:8080'
const FIXTURES_DIR = join(__dirname, '..', 'test', 'fixtures', 'golden')

async function waitForBackend(): Promise<void> {
  for (let i = 0; i < 30; i++) {
    try {
      await fetch(`${BASE_URL}/api/auth/login`, { method: 'POST' })
      return
    } catch {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
  throw new Error(
    `Java 后端 ${BASE_URL} 不可达。请先启动（见 AGENTS.md）：\n` +
      `  pwsh -File docs/local/scripts/run-java-8082.ps1`,
  )
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  })
  const json = (await res.json()) as { code: number; msg?: string; data?: { accessToken?: string } }
  if (json.code !== 200 || !json.data?.accessToken) {
    throw new Error(
      `登录失败，无法录制需要认证的场景（code=${json.code}, msg=${json.msg}）。` +
        `请确认 admin/admin123 可用。`,
    )
  }
  return json.data.accessToken
}

/** 单步执行：解析模板 → 发请求 → 返回（录制结果, 解析后的响应体）。 */
async function runStep(
  step: ScenarioStep,
  vars: ScenarioVars,
  token: string | null,
  runId: string,
): Promise<{ recorded: RecordedStep; responseBody: unknown }> {
  const resolvedPath = String(resolveTemplate(step.path, vars, runId))
  const url = new URL(resolvedPath, BASE_URL)
  for (const [k, v] of Object.entries(step.query ?? {})) {
    url.searchParams.set(k, String(resolveDeep(v, vars, runId)))
  }

  const headers: Record<string, string> = stepHeaders(step)
  const resolvedBody = step.body === undefined ? undefined : resolveDeep(step.body, vars, runId)
  if (resolvedBody !== undefined) headers['content-type'] = 'application/json'
  if ((step.auth ?? 'none') === 'admin') {
    if (token === null) throw new Error(`步骤 ${step.id} 需要认证，但没有拿到 token`)
    headers.authorization = `Bearer ${token}`
  }

  const res = await fetch(url, {
    method: step.httpMethod,
    headers,
    body: resolvedBody === undefined ? undefined : JSON.stringify(resolvedBody),
  })

  const text = await res.text()
  let parsed: unknown
  try {
    parsed = text === '' ? null : JSON.parse(text)
  } catch {
    parsed = text
  }

  const recorded: RecordedStep = {
    id: step.id,
    endpoint: { httpMethod: step.httpMethod, fullPath: step.fullPath },
    // 请求以【模板】形式落盘：比对时要用 Node 自己的返回值重新填充，
    // 不能拿 Java 的具体 id 去回放。
    requestTemplate: {
      path: step.path,
      query: step.query ?? {},
      headers: stepHeaders(step),
      body: step.body ?? null,
      auth: step.auth ?? 'none',
    },
    resolvedPath,
    ...(step.shapeOnly === undefined ? {} : { shapeOnly: step.shapeOnly }),
    ...(step.unorderedArrays === undefined ? {} : { unorderedArrays: step.unorderedArrays }),
    response: {
      status: res.status,
      headers: normalizeHeaders(res.headers),
      body: normalizeBody(parsed, [runId]),
    },
  }

  return { recorded, responseBody: parsed }
}

async function main(): Promise<void> {
  await waitForBackend()

  const endpointsPath = join(__dirname, 'endpoints.generated.json')
  if (!existsSync(endpointsPath)) {
    throw new Error(`缺少 ${endpointsPath}。请先运行：pnpm endpoints`)
  }
  const endpoints = JSON.parse(readFileSync(endpointsPath, 'utf8')) as Endpoint[]
  const known = new Set(endpoints.map((e) => `${e.httpMethod} ${e.fullPath}`))

  const { scenarios } = JSON.parse(readFileSync(join(__dirname, 'scenarios.json'), 'utf8')) as {
    scenarios: Scenario[]
  }

  // 强校验：场景引用的端点必须真实存在，否则会把「路径写错的 404」当成契约录下来
  const unknown: string[] = []
  for (const s of scenarios) {
    for (const step of s.steps) {
      if (!known.has(`${step.httpMethod} ${step.fullPath}`)) {
        unknown.push(`  [${s.name}] ${step.id}: ${step.httpMethod} ${step.fullPath}`)
      }
    }
  }
  if (unknown.length > 0) {
    throw new Error(
      `以下场景步骤引用了不存在的端点（检查 scenarios.json 的 fullPath）：\n${unknown.join('\n')}`,
    )
  }

  const token = await login()
  const runId = createRunId()

  /**
   * 清理「孤儿」fixture。
   *
   * ⚠️ 必须做：场景文件名带序号前缀（01__ …），一旦在中间插入新场景，
   *    后续场景的序号会整体后移，旧文件就留在目录里变成孤儿 ——
   *    而比对器是遍历整个目录的，会把它们一起回放，**凭空多出若干步**，
   *    让契约结果失真（实测踩到过：实际 35 步却报 37 步）。
   *
   * 因此每次录制都先按当前场景集算出应存在的文件名，删掉其余 json。
   */
  mkdirSync(FIXTURES_DIR, { recursive: true })
  const expectedFiles = new Set(scenarios.map((s, i) => scenarioFileName(i, s.name)))
  for (const name of readdirSync(FIXTURES_DIR)) {
    if (name.endsWith('.json') && !expectedFiles.has(name)) {
      unlinkSync(join(FIXTURES_DIR, name))
      console.log(`  [清理孤儿样本] ${name}`)
    }
  }
  console.log(`本次运行标识 runId=${runId}（用于让流程 key 唯一，避免 version 累加）\n`)
  const covered = new Set<string>()
  let totalSteps = 0

  for (const [index, scenario] of scenarios.entries()) {
    const vars: ScenarioVars = new Map()
    const steps: RecordedStep[] = []

    for (const step of scenario.steps) {
      const { recorded, responseBody } = await runStep(step, vars, token, runId)
      vars.set(step.id, responseBody)
      steps.push(recorded)
      covered.add(`${step.httpMethod} ${step.fullPath}`)
      totalSteps++
      console.log(
        `  [${scenario.name}] ${step.id}: ${step.httpMethod} ${recorded.resolvedPath} → ${recorded.response.status}`,
      )
    }

    const fixture: RecordedScenario = {
      scenario: scenario.name,
      recordedAt: new Date().toISOString(),
      steps,
    }
    const outPath = join(FIXTURES_DIR, scenarioFileName(index, scenario.name))
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8')
  }

  console.log(`\n录制完成：${scenarios.length} 个场景 / ${totalSteps} 个步骤`)

  const missing = endpoints.filter((e) => !covered.has(`${e.httpMethod} ${e.fullPath}`))
  console.log(`端点总数 ${endpoints.length}，已覆盖 ${covered.size}，待补场景 ${missing.length}`)

  const reportPath = join(__dirname, 'endpoints.need-scenario.json')
  writeFileSync(reportPath, `${JSON.stringify(missing, null, 2)}\n`, 'utf8')
  console.log(`待补场景清单已写入 ${reportPath}`)
}

main().catch((err) => {
  console.error('[golden:record] 失败:', err instanceof Error ? err.message : err)
  process.exitCode = 1
})
