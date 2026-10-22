/**
 * 动作链的目标端生成：IrChain → 产物语句 + 按需材料。
 *
 * 这里只读 IR（emit 侧不得回头读 schema）：parse 已把「能不能执行、执行要什么材料」判完，
 * 本文件负责把它写成 Vue/EP 目标能直接跑的语句。运行期在组件里做的模板替换
 * （$row.x / {row.x}）在这一步就展开成表达式，产物里不留字符串模板。
 */

import type { ChainNeed, IrChain, IrChainStep, IrTemplatePart } from './ir'

const lit = (v: unknown): string => (typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : JSON.stringify(v))

/** 对象/属性键：蛇形与短横线字段要加引号，裸写会成非法标识符 */
const keyText = (k: string): string => (/^\w+$/.test(k) ? k : lit(k))

/** 行字段取值：业务字段大量带短横线，不是合法标识符就走下标 */
const rowAccess = (field: string): string =>
  /^\w+$/.test(field) ? `row?.${field}` : `row?.[${lit(field)}]`

/**
 * 取值片段 → 表达式：字面量与取值段用 + 串起来，等价于运行期的 resolveParams。
 * 空值一律收成 ''（组件里模板替换不出来就是空串），产物不再回头判 undefined。
 */
export function exprOf(parts: IrTemplatePart[]): string {
  if (!parts.length) return "''"
  return parts
    .map((p) =>
      p.kind === 'text'
        ? lit(p.text)
        : p.kind === 'row'
          ? `String(${rowAccess(p.field)} ?? '')`
          : `String(route.query[${lit(p.key)}] ?? '')`,
    )
    .join(' + ')
}

const argOf = (step: IrChainStep, name: string): IrTemplatePart[] => step.args.find((a) => a.name === name)?.parts ?? []

/** 只有字面量段时取出来，混了取值段就得留到运行期表达式 */
const literalOf = (parts: IrTemplatePart[]): string | undefined =>
  parts.length === 1 && parts[0].kind === 'text' ? parts[0].text : undefined

/** 容器动作的打开语义：按钮 key 带的模式优先（edit→edit、view→只读），否则按有没有记录 id */
function containerCall(step: IrChainStep, chain: IrChain): string {
  const recordId = argOf(step, 'recordId')
  const hasId = recordId.length > 0
  const mode = chain.mode ?? (hasId ? 'edit' : 'create')
  const readonly = chain.readonly ?? false
  return `void openContainer(${hasId ? exprOf(recordId) : "''"}, ${readonly}, '${mode}')`
}

/**
 * 一个步骤 → 产物语句（可能多行）。返回空数组表示这一步不产出代码 —— 那种情况在 parse
 * 就已经记成 unsupported 走到不了这里，所以调用方可以按「有语句」来假定它会执行。
 */
export function stepStatements(step: IrChainStep, chain: IrChain, indent: string): string[] {
  const ref = `${chain.ref}.value`
  const line = (s: string) => `${indent}${s}`
  switch (step.op) {
    case 'message':
      return [line(`ElMessage({ message: ${exprOf(argOf(step, 'message'))}, type: ${exprOf(argOf(step, 'type'))} })`)]
    case 'set-filter':
      return [line(`${ref}?.setFilter({ ${step.args.map((a) => `${keyText(a.name)}: ${exprOf(a.parts)}`).join(', ')} })`)]
    case 'refresh':
      return [line(`${ref}?.refresh()`)]
    case 'set-page': {
      const parts = argOf(step, 'page')
      const literal = literalOf(parts)
      const n = literal === undefined ? NaN : Number(literal)
      if (Number.isInteger(n) && n > 0) return [line(`${ref}?.setPage(${n})`)]
      // 运行期是 parseInt + 正数守卫：值来自模板/参数时产物也得判，否则 NaN 直接把列表打空
      return [
        line(`const target = parseInt(${exprOf(parts)}, 10)`),
        line(`if (!isNaN(target) && target > 0) ${ref}?.setPage(target)`),
      ]
    }
    case 'set-sort':
      return [line(`${ref}?.setSort(${exprOf(argOf(step, 'field'))}, ${exprOf(argOf(step, 'order'))})`)]
    case 'open-link':
      return [line(`void router.push(${exprOf(argOf(step, 'url'))})`)]
    case 'clear-selection':
      return [line(`${ref}?.clearSelection()`)]
    case 'export':
      return [line(`exportRows(${ref}?.records ?? [])`)]
    case 'delete':
      // 回调位不能出注释：箭头后只剩注释就是非法 TS，没句柄时包成空块
      return [
        line(
          `if (row?.id != null) void deleteData(String(row.id)).then(() => ${
            chain.ref ? `${ref}?.refresh()` : `{ /* 列表组件未 defineExpose，删除后刷新需人工接 */ }`
          })`,
        ),
      ]
    case 'open-container':
    case 'load-record':
      return [line(containerCall(step, chain))]
    case 'close-container':
      return [line('closeContainer()')]
    case 'save-container':
      return [line('void confirmSave()')]
    case 'script': {
      const fn = step.script!
      // 出口没有行对象（selection-change / sort-change）时不传参：函数形参声明成可选
      return [line(`void ${fn.fn}(${chain.hasRow ? 'row' : ''})`)]
    }
    default:
      return []
  }
}

/** case 体里有 const/let 就要包块：switch 的 case 共享函数作用域，两个 case 声明同名会直接编译失败 */
export function needsBlock(lines: string[]): boolean {
  return lines.some((l) => /^\s*(const|let)\s/.test(l))
}

/** 链要的材料：op 用的（ElMessage/router/route/导出）与脚本用的（message 别名/page/http）分开记 */
export function materialsOf(chains: IrChain[]): { ops: Set<ChainNeed>; scripts: Set<ChainNeed> } {
  const ops = new Set<ChainNeed>()
  const scripts = new Set<ChainNeed>()
  for (const c of chains) {
    for (const s of c.steps) {
      const sink = s.script ? scripts : ops
      for (const n of s.needs || []) sink.add(n)
    }
  }
  return { ops, scripts }
}

/** 脚本函数：正文原样搬进来，只加缩进。运行期的 new Function 沙箱不复制 —— 白名单在生成期把关 */
export function scriptFunction(chain: IrChain, step: IrChainStep): string[] {
  const fn = step.script!
  const lines = fn.body.split('\n').map((l) => (l.trim() ? `  ${l.replace(/^ +/, '')}` : ''))
  return [
    `/** lc:behavior ← ${step.path}（${chain.kind} 链 / ${chain.trigger}）：正文照搬 schema，白名单在出码期把关 */`,
    `async function ${fn.fn}(${fn.params}) {`,
    ...lines,
    '}',
  ]
}

/** 导出 helper：复刻 PageDataTable.exportData 的 JSON 下载，产物没有组件实例可借 */
export function exportHelper(pageKey: string): string[] {
  return [
    '/** 导出当前页记录（对齐 PageDataTable.exportData 的 JSON 下载） */',
    'function exportRows(rows: Record<string, unknown>[]) {',
    '  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: \'application/json\' })',
    '  const url = URL.createObjectURL(blob)',
    '  const a = document.createElement(\'a\')',
    '  a.href = url',
    `  a.download = '${pageKey}-data.json'`,
    '  a.click()',
    '  URL.revokeObjectURL(url)',
    '}',
  ]
}
