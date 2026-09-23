import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  makeShapeOnlyMatcher,
  compareWithShapeOnlyPaths,
  formatDiffs,
  sortArraysAtPaths,
  splitBySeverity,
} from './lib/compare'
import { normalizeBody } from './lib/normalize'
import {
  type RecordedScenario,
  type RecordedStep,
  type ScenarioVars,
  createRunId,
  resolveDeep,
  resolveTemplate,
} from './lib/scenario'

/**
 * 契约对比器：对**运行中的 Node 后端**按场景逐步回放，与 Java 录制结果逐字段比对。
 *
 * 关键设计：不拿 Java 录到的具体 id 回放 Node —— 两个后端 id 不同。
 * 而是让 Node **自己跑完整个场景**，步骤间用 Node 自己的返回值做占位替换，
 * 再逐步比 (状态码, 响应形状)。
 *
 * 用法：
 *   $env:NODE_BASE_URL='http://localhost:8081'; pnpm contract
 *
 * 结果分档：
 *   - 一致     Node 响应与 Java 一致
 *   - 未实现   某步返回 404 → 该端点尚未迁移（P0/P1 阶段的正常状态），该场景后续步骤跳过
 *   - 不一致   形状或取值有差异 —— **必须为 0**
 *   - 告警     仅数组长度差异（数据量不同，不是契约破损）
 *
 * 退出码：有不一致 → 1；环境问题 → 2；否则 0。
 */

const BASE_URL = process.env.NODE_BASE_URL ?? 'http://localhost:8081'
const FIXTURES_DIR = join(__dirname, '..', 'test', 'fixtures', 'golden')

/**
 * 「顺序不是契约」的数组路径 —— 比对前两侧都按 JSON 字符串排序。
 *
 * 这些字段在 Java 侧是 `HashSet`，序列化顺序由 Java 的 String.hashCode 与
 * HashMap 桶布局决定，Node 无法（也不应该）复现。前端把它们当集合用。
 *
 * ⚠️ 分页列表的 `content` **绝不能**加进来 —— 它的顺序是有意义的。
 */
const UNORDERED_ARRAY_PATHS = ['$.data.user.permissions', '$.data.user.roles']

/**
 * 「只比结构、不比取值」的路径（见 makeShapeOnlyMatcher 的匹配规则）。
 *
 * 两类：
 *   1. 两个后端**各自造数据**的列表端点 —— `content` 里的 id/名称/时间必然不同，
 *      逐值比对注定失败且无意义；仍严格校验字段集合与类型。
 *   2. **取值依赖数据量或外部实现**的标量：
 *      - `totalElements` / `totalPages`：随数据量变化
 *      - `deployedXml` / `deployedConfigHash`：Flowable 归一化 XML 的产物，
 *        自研引擎不可能逐字节一致（规格 §5.4.10）。**P2 必须补语义等价测试**
 *        （两侧 XML 都解析成图再比对节点/连线/条件），仅放宽字符串比较是不够的。
 */
const SHAPE_ONLY_PATHS = [
  '$.data.content',
  '.totalElements',
  '.totalPages',
  '.deployedXml',
  '.deployedConfigHash',
]

// 注意：这里**不再**预构建全局匹配器。每一 步都要把自己的 `shapeOnly` 覆盖
// 与全局规则合并后再构建（见 main 循环），否则步骤级放宽永远不会生效 ——
// 「全局匹配器」这种写法一旦存在，就很容易被误当成唯一入口。

function walkFixtures(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walkFixtures(full))
    else if (entry.endsWith('.json')) out.push(full)
  }
  return out.sort()
}

async function tryLogin(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    })
    const json = (await res.json()) as { code?: number; data?: { accessToken?: string } }
    return json.data?.accessToken ?? null
  } catch {
    return null
  }
}

interface StepOutcome {
  status: number
  body: unknown
}

async function runStep(
  step: RecordedStep,
  vars: ScenarioVars,
  token: string | null,
  runId: string,
): Promise<StepOutcome> {
  const tpl = step.requestTemplate
  const resolvedPath = String(resolveTemplate(tpl.path, vars, runId))
  const url = new URL(resolvedPath, BASE_URL)
  for (const [k, v] of Object.entries(tpl.query)) {
    url.searchParams.set(k, String(resolveDeep(v, vars, runId)))
  }

  const headers: Record<string, string> = { ...tpl.headers }
  const resolvedBody = tpl.body === null ? undefined : resolveDeep(tpl.body, vars, runId)
  if (resolvedBody !== undefined) headers['content-type'] = 'application/json'
  if (tpl.auth === 'admin' && token !== null) headers.authorization = `Bearer ${token}`

  const res = await fetch(url, {
    method: step.endpoint.httpMethod,
    headers,
    body: resolvedBody === undefined ? undefined : JSON.stringify(resolvedBody),
  })
  const text = await res.text()
  let body: unknown
  try {
    body = text === '' ? null : JSON.parse(text)
  } catch {
    body = text
  }
  return { status: res.status, body }
}

async function main(): Promise<void> {
  try {
    await fetch(`${BASE_URL}/api/auth/login`, { method: 'POST' })
  } catch {
    throw new Error(`Node 后端 ${BASE_URL} 不可达。请先启动：pnpm dev`)
  }

  let fixtures: string[]
  try {
    fixtures = walkFixtures(FIXTURES_DIR)
  } catch {
    throw new Error(`未找到黄金样本目录 ${FIXTURES_DIR}。请先运行 pnpm golden:record。`)
  }
  if (fixtures.length === 0) {
    throw new Error(`黄金样本目录为空（${FIXTURES_DIR}）。请先运行 pnpm golden:record。`)
  }

  const token = await tryLogin()
  const runId = createRunId()
  let passedSteps = 0
  let unimplementedSteps = 0
  let failedSteps = 0
  let noticeCount = 0
  const failures: string[] = []
  const notices: string[] = []

  for (const file of fixtures) {
    const fixture = JSON.parse(readFileSync(file, 'utf8')) as RecordedScenario
    const vars: ScenarioVars = new Map()
    let scenarioBlocked = false

    for (const step of fixture.steps) {
      if (scenarioBlocked) {
        unimplementedSteps++
        continue
      }

      let outcome: StepOutcome
      try {
        outcome = await runStep(step, vars, token, runId)
      } catch (err) {
        failedSteps++
        failures.push(
          `[${fixture.scenario}] ${step.id} ${step.endpoint.httpMethod} ${step.endpoint.fullPath}\n` +
            `  请求失败: ${err instanceof Error ? err.message : String(err)}`,
        )
        scenarioBlocked = true
        continue
      }

      // 404 = 该端点尚未在 Node 实现。后续步骤依赖它，整个场景跳过。
      if (outcome.status === 404) {
        unimplementedSteps++
        scenarioBlocked = true
        continue
      }

      vars.set(step.id, outcome.body)

      // 本步骤的 shape-only 覆盖与全局规则**合并**：全局管「所有端点都成立的放宽」，
      // 步骤级管「只对这个端点成立的放宽」。两者都必须写明理由。
      const shapeOnlyMatcher = makeShapeOnlyMatcher([
        ...SHAPE_ONLY_PATHS,
        ...(step.shapeOnly ?? []),
      ])
      // 「顺序不是契约」的路径同理：全局管所有端点都成立的，步骤级管只对这个端点成立的
      const unorderedPaths = [...UNORDERED_ARRAY_PATHS, ...(step.unorderedArrays ?? [])]

      const diffs = []
      if (outcome.status !== step.response.status) {
        diffs.push({
          path: '$.<http-status>',
          kind: 'value' as const,
          expected: step.response.status,
          actual: outcome.status,
        })
      }
      diffs.push(
        ...compareWithShapeOnlyPaths(
          sortArraysAtPaths(step.response.body, unorderedPaths),
          sortArraysAtPaths(normalizeBody(outcome.body, [runId]), unorderedPaths),
          shapeOnlyMatcher,
        ),
      )

      const { failures: hard, notices: soft } = splitBySeverity(diffs)
      noticeCount += soft.length
      if (soft.length > 0) {
        notices.push(
          `[${fixture.scenario}] ${step.id} ${step.endpoint.httpMethod} ${step.endpoint.fullPath}\n` +
            formatDiffs(soft),
        )
      }

      if (hard.length === 0) {
        passedSteps++
      } else {
        failedSteps++
        failures.push(
          `[${fixture.scenario}] ${step.id} ${step.endpoint.httpMethod} ${step.endpoint.fullPath}\n` +
            formatDiffs(hard),
        )
      }
    }
  }

  console.log('=== 契约回归结果 ===')
  console.log(`  场景数: ${fixtures.length}`)
  console.log(`  一致:   ${passedSteps} 步`)
  console.log(`  未实现: ${unimplementedSteps} 步`)
  console.log(`  不一致: ${failedSteps} 步`)
  console.log(`  告警:   ${noticeCount} 项（仅数组长度差异，非契约破损）`)

  if (notices.length > 0) {
    console.log('\n=== 告警详情（数据量差异，不阻断）===')
    for (const n of notices) console.log(`\n${n}`)
  }
  if (failures.length > 0) {
    console.log('\n=== 不一致详情 ===')
    for (const f of failures) console.log(`\n${f}`)
  }

  process.exitCode = failedSteps > 0 ? 1 : 0
}

main().catch((err) => {
  console.error('[contract] 失败:', err instanceof Error ? err.message : err)
  process.exitCode = 2
})
