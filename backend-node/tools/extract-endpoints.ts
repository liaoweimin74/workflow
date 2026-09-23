import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { collectEndpoints } from './lib/java-source'

/**
 * 从 Java Controller 源码抽取全部端点，产出 tools/endpoints.generated.json。
 * 该文件提交入库，作为契约回归网的清单来源。
 *
 * 用法：pnpm endpoints
 *
 * 为何要自动抽取：196 个端点手工登记既慢又必然遗漏。
 * Java 源码里的 @RequestMapping + @GetMapping 是权威来源。
 */
const JAVA_ROOT = join(__dirname, '..', '..', 'backend', 'src', 'main', 'java')

function main(): void {
  const endpoints = collectEndpoints(JAVA_ROOT).sort((a, b) =>
    `${a.httpMethod} ${a.fullPath}`.localeCompare(`${b.httpMethod} ${b.fullPath}`),
  )

  const outPath = join(__dirname, 'endpoints.generated.json')
  writeFileSync(outPath, `${JSON.stringify(endpoints, null, 2)}\n`, 'utf8')

  console.log(`抽取到 ${endpoints.length} 个端点 → ${outPath}`)

  const byMethod = endpoints.reduce<Record<string, number>>((acc, e) => {
    acc[e.httpMethod] = (acc[e.httpMethod] ?? 0) + 1
    return acc
  }, {})
  console.log('按方法统计:', byMethod)
  console.log(`需要请求体: ${endpoints.filter((e) => e.hasRequestBody).length}`)
  console.log(`带路径参数: ${endpoints.filter((e) => e.pathParams.length > 0).length}`)

  // 重复路由是契约层面的真问题（后者会被 Spring 覆盖），显式报出来
  const seen = new Map<string, number>()
  for (const e of endpoints) {
    const key = `${e.httpMethod} ${e.fullPath}`
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  const duplicates = [...seen.entries()].filter(([, n]) => n > 1)
  if (duplicates.length > 0) {
    console.warn(`\n⚠️ 发现 ${duplicates.length} 个重复路由（后注册的会覆盖先注册的）:`)
    for (const [key, n] of duplicates) console.warn(`  ${key} × ${n}`)
  }

  const controllers = new Set(endpoints.map((e) => e.file))
  console.log(`涉及 ${controllers.size} 个 Controller`)
}

main()
