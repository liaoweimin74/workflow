/**
 * 扫描 Node 侧已实现的路由，与「待补场景」清单对账，把剩余端点分成两类：
 *   - **已实现但未验证**：路由存在 ⇒ 只差补一个契约场景，性价比最高
 *   - **尚未实现**：路由不存在 ⇒ 需要先写实现
 *
 * 动机：`tools/endpoints.need-scenario.json` 由 `scenarios.json` 推导，
 * 它只知道"没有场景覆盖"，**不知道实现有没有写**。本会话已证明这个区别很要紧 ——
 * `POST /tasks/{id}/reject` 属于"早实现了但从未验证"，补一个场景就抓出 3 处偏差。
 *
 * 用法：node node_modules/tsx/dist/cli.mjs tools/list-implemented.ts
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

interface Endpoint {
  httpMethod: string
  fullPath: string
}

/** 递归收集 src 下的 controller 文件。 */
function controllerFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...controllerFiles(full))
    } else if (entry.endsWith('.controller.ts')) {
      out.push(full)
    }
  }
  return out
}

/**
 * 从 Nest 装饰器里抽路由。
 *
 * ⚠️ **一个文件里可以有多个 controller 类**（本项目的 `system.controller.ts` 就有好几个）
 *    —— 所以必须按 `@Controller('...')` 把源码**切段**，每段各自用自己那段的前缀。
 *    第一版对整个文件只取第一个 `@Controller` 的前缀，导致后续类的路由全被拼错、
 *    菜单的三个端点被误判为"未实现"（假阴性）。
 *
 * `@Controller('a/b')` + `@Get('c/:id')` → `GET /a/b/c/:id`；`@Post()` → `POST /a/b`。
 *
 * ⚠️ **`@Sse('x')` 也是 GET 路由**：它走的是 `GET`（Nest 的 `@Sse()` 固定 GET + text/event-stream）。
 *    第一版只认 `@Get|@Post|@Put|@Delete|@Patch`，于是已经实现并测过的
 *    `/api/v1/notifications/sse` 被列进「尚未实现」—— 又一处**假阴性**
 *    （本文件头注释里已经记过两次同类教训：假阴性比假阳性更危险，会让人重复劳动）。
 */
function extractRoutes(source: string): string[] {
  const controllers = [...source.matchAll(/@Controller\(\s*'([^']*)'\s*\)/g)]
  const routes: string[] = []
  for (const [index, match] of controllers.entries()) {
    const start = match.index ?? 0
    const end = controllers[index + 1]?.index ?? source.length
    const segment = source.slice(start, end)
    const prefix = (match[1] ?? '').replace(/^\/|\/$/g, '')
    // `@Sse(...)` 归一到 GET；其余按装饰器名取方法
    const re = /@(Get|Post|Put|Delete|Patch|Sse)\(\s*(?:'([^']*)'\s*)?\)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(segment)) !== null) {
      const method = m[1].toUpperCase() === 'SSE' ? 'GET' : m[1].toUpperCase()
      const sub = (m[2] ?? '').replace(/^\/|\/$/g, '')
      const path = [prefix, sub].filter((s) => s !== '').join('/')
      routes.push(`${method} /${path}`)
    }
  }
  return routes
}

/**
 * 把两侧的路径参数写成同一个占位符，便于对账：
 *   - Nest 侧是 `:id`（这段源码里的写法）
 *   - Java 侧是 `{id}`（`endpoints.generated.json` 里的写法）
 *
 * ⚠️ 第一版只归一了 `:id`，于是**所有带路径参数的端点都被误判为"未实现"**
 *    （只有 `/api/menus` 那种无参数路径才碰巧匹配上）—— 假阴性比假阳性更危险，
 *    它会让人以为"还得先写实现"而重复劳动。
 */
function normalize(route: string): string {
  return route
    .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '{p}')
    .replace(/\{[A-Za-z_][A-Za-z0-9_]*\}/g, '{p}')
}

function main(): void {
  const raw = JSON.parse(readFileSync('tools/endpoints.need-scenario.json', 'utf8')) as
    | Endpoint[]
    | { endpoints: Endpoint[] }
  const needList = Array.isArray(raw) ? raw : raw.endpoints

  const implemented = new Set<string>()
  for (const file of controllerFiles('src')) {
    for (const route of extractRoutes(readFileSync(file, 'utf8'))) {
      implemented.add(normalize(route))
    }
  }

  const done: string[] = []
  const missing: string[] = []
  for (const e of needList) {
    const key = normalize(`${e.httpMethod} ${e.fullPath}`)
    ;(implemented.has(key) ? done : missing).push(`${e.httpMethod} ${e.fullPath}`)
  }

  console.log(`待补场景端点 ${needList.length} 个；其中：`)
  console.log(`\n=== 已实现但未验证（${done.length}）—— 只需补场景 ===`)
  for (const r of done.sort()) console.log(`  ${r}`)
  console.log(`\n=== 尚未实现（${missing.length}）—— 需要先写实现 ===`)
  for (const r of missing.sort()) console.log(`  ${r}`)
}

main()
