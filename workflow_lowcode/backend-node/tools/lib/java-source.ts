import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** 一个 REST 端点的描述。 */
export interface Endpoint {
  /** 来源文件（相对 backend/src/main/java 的路径）。 */
  file: string
  /** HTTP 方法，大写。 */
  httpMethod: string
  /** 完整路径，包含类级 @RequestMapping 前缀与 {var} 模板占位。 */
  fullPath: string
  /** Java 方法名。 */
  methodName: string
  /** 路径模板变量名，从 fullPath 的 {var} 推导，如 /a/{id} → ['id']。 */
  pathParams: string[]
  /** 是否有 @RequestBody 参数。 */
  hasRequestBody: boolean
}

// 键是注解名的可变部分（正则捕获组 1 不含 "Mapping" 后缀）。
const METHOD_ANNOTATIONS: Record<string, string> = {
  Get: 'GET',
  Post: 'POST',
  Put: 'PUT',
  Delete: 'DELETE',
  Patch: 'PATCH',
}

/** 从注解参数里取路径字符串；如 @GetMapping("/a/b") → /a/b。 */
function extractPathArg(args: string): string | null {
  const m = /(?:value\s*=\s*|path\s*=\s*)?"([^"]*)"/.exec(args)
  return m ? m[1] : null
}

/** 从 @RequestMapping 参数里取 HTTP 方法；如 method = RequestMethod.POST → POST。 */
function extractRequestMappingMethod(args: string): string {
  const m = /RequestMethod\.([A-Z]+)/.exec(args)
  return m ? m[1] : 'GET'
}

/** 从路径模板里取变量名：/api/x/{id}/y/{name} → ['id', 'name']。 */
export function extractPathParams(fullPath: string): string[] {
  return Array.from(fullPath.matchAll(/\{([^}]+)\}/g)).map((m) => m[1])
}

/**
 * 解析单个 Java Controller 源码，返回其中所有端点。
 *
 * 实现思路：
 *  1) 类级 @RequestMapping 一定出现在 class 关键字之前，先摘出路径前缀；
 *  2) 只在类体内扫描方法级注解，因此无需再判断注解是类级还是方法级；
 *  3) 每个注解之后到下一个 '{' 之间是方法签名，用于找方法名与 @RequestBody；
 *  4) pathParams 直接从路径模板的 {var} 推导 —— 不去解析 @PathVariable 的 Java 语法，
 *     因为对契约回归而言，需要的是「URL 里要替换哪些片段」，而模板本身就是权威答案。
 */
export function parseControllerSource(file: string, source: string): Endpoint[] {
  // 1) 类级 @RequestMapping（允许中间夹着其它类级注解）
  let classPrefix = ''
  const classMatch =
    /@RequestMapping\s*\(([^)]*)\)\s*(?:@[\w.]+(?:\([^)]*\))?\s*)*public\s+(?:final\s+)?class\s+\w+/.exec(
      source,
    )
  if (classMatch) {
    classPrefix = extractPathArg(classMatch[1]) ?? ''
  }

  // 2) 只在类体内扫描，类级注解自然被排除
  const classKeywordAt = source.indexOf('class ')
  const classBodyStart = classKeywordAt === -1 ? -1 : source.indexOf('{', classKeywordAt)
  const body = classBodyStart === -1 ? source : source.slice(classBodyStart)

  const endpoints: Endpoint[] = []
  const annotationRe =
    /@(Get|Post|Put|Delete|Patch)Mapping\b(\s*\(([^)]*)\))?|@RequestMapping\b(\s*\(([^)]*)\))?/g

  let match: RegExpExecArray | null
  while ((match = annotationRe.exec(body)) !== null) {
    let httpMethod: string
    let pathArg: string | null
    if (match[0].startsWith('@RequestMapping')) {
      const args = match[5] ?? ''
      httpMethod = extractRequestMappingMethod(args)
      pathArg = extractPathArg(args)
    } else {
      httpMethod = METHOD_ANNOTATIONS[match[1]]
      pathArg = extractPathArg(match[3] ?? '')
    }

    const annotationEnd = match.index + match[0].length
    const signatureEnd = body.indexOf('{', annotationEnd)
    if (signatureEnd === -1) continue

    // 方法签名：注解之后到方法体 '{' 之前。@RequestBody 出现在参数列表里。
    const signature = body.slice(annotationEnd, signatureEnd)
    // 去掉注解后再找方法名，避免把注解名当成方法名
    const nameMatch = /(\w+)\s*\(/.exec(signature.replace(/@\w+(\([^)]*\))?/g, ''))
    const methodName = nameMatch ? nameMatch[1] : ''
    const hasRequestBody = /@RequestBody\b/.test(signature)

    let fullPath: string
    if (pathArg === null) {
      fullPath = classPrefix
    } else if (pathArg.startsWith('/')) {
      fullPath = `${classPrefix}${pathArg}`
    } else {
      fullPath = `${classPrefix}/${pathArg}`
    }
    fullPath = fullPath.replace(/\/{2,}/g, '/')
    if (fullPath === '') fullPath = '/'

    endpoints.push({
      file,
      httpMethod,
      fullPath,
      methodName,
      pathParams: extractPathParams(fullPath),
      hasRequestBody,
    })
  }

  return endpoints
}

/** 递归扫描目录下所有 *Controller.java 并解析。 */
export function collectEndpoints(backendJavaRoot: string): Endpoint[] {
  const out: Endpoint[] = []

  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
      } else if (entry.endsWith('Controller.java')) {
        const source = readFileSync(full, 'utf8')
        const rel = full.slice(backendJavaRoot.length + 1).replace(/\\/g, '/')
        out.push(...parseControllerSource(rel, source))
      }
    }
  }

  walk(backendJavaRoot)
  return out
}
