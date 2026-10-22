/**
 * 出码报告（design D6）：每次生成顺带回读自己的产物，把体检数字随 files/manifest 一起返回。
 *
 * 报告不是第二套真相：
 *  · 分母来自契约表 —— collectNodes 走的四处 rule 载体与 parse.ts 的子规则递归开关同一口径
 *    （登记成 children 才递归；登记成 prop 透传的 childRules 是组件自己解释的数据）；
 *  · 空洞与重命名核对来自当场 reverseToSchema，本模块只给每条差异标归属桶；
 *  · 四张登记表计数直接累加本次 manifest，不另起一套判定。
 *
 * 消费方：语料体检测试（持续 Gate）与脚本/CLI 输出。设计器不加入口（D6 已否决备选）。
 */

import { TYPE_CONTRACTS } from './contract'
import type {
  GeneratedManifest,
  GenerateReport,
  HoleBucket,
  ReportHole,
  ReportNode,
  ReportRenameFailure,
} from './ir'
import { reverseToSchema } from './reverse'

/**
 * 组件节点遍历：走 schema 里真实存在的四处 rule 载体
 * （容器 props.rule、卡片/详情列内嵌 props.columns[].rule、画布态/布局容器的 node.children），
 * 与运行时取字段用的 formRuleWalk.ts:walkRules 同一口径 —— 少一处就少统计一类节点。
 */
function collectNodes(rule: any[], prefix = 'rule', out: ReportNode[] = [], blocked: string | null = null): ReportNode[] {
  ;(rule || []).forEach((node, i) => {
    if (!node || typeof node !== 'object') return
    const path = `${prefix}[${i}]`
    const propsKeys = Object.keys(node.props || {}).filter((k) => k !== 'rule')
    const contract = TYPE_CONTRACTS[node.type]
    // 先有阻断就沿用：最高那个阻断点才是该先修的那个（下面再套几层都不改变结论）
    const own = blocked ?? (contract ? null : `unregistered:${node.type}`)
    if (typeof node.type === 'string') out.push({ type: node.type, path, propsKeys, blocked: own })
    if (Array.isArray(node.props?.rule)) {
      // 只有登记成 children 的 props.rule 才会被 planNode 递归（parse.ts 的子规则开关）
      const carrier = own ?? (contract?.props?.rule?.emit === 'children' ? null : `carrier:${node.type}`)
      collectNodes(node.props.rule, `${path}.props.rule`, out, carrier)
    }
    // fcTable 的子节点挂在 children 且带 slot 地址：契约登记成 table 后生成器按格递归，
    // 与 props.rule 同属「递归得进去」的载体；其余类型的 children 仍是画布态，不进模板
    if (Array.isArray(node.children))
      collectNodes(node.children, `${path}.children`, out, own ?? (contract?.table ? null : `children:${node.type}`))
    ;(node.props?.columns || []).forEach((col: any, ci: number) => {
      if (Array.isArray(col?.rule)) {
        // 列载体与 props.rule 同一口径：契约把 columns 登记成 children 的（tableForm）才递归得进去
        const colCarrier = own ?? (contract?.props?.columns?.emit === 'children' ? null : `columns:${node.type}`)
        collectNodes(col.rule, `${path}.props.columns[${ci}].rule`, out, colCarrier)
      }
    })
  })
  return out
}

/** hole path 是否落在某个前缀子树内（边界必须是 . 或 [，别拿 rule[1] 当 rule[10] 的前缀） */
function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`)
}

/** 空洞落在哪个组件子树上（最深的那个 rule 节点）—— 分桶和报表都要用它 */
function ownerOf(holePath: string, nodes: ReportNode[]): ReportNode | undefined {
  return nodes.filter((n) => under(holePath, n.path)).sort((a, b) => b.path.length - a.path.length)[0]
}

/**
 * 空洞分桶：
 *  A 未登记组件子树 —— 广度债，补 contract.ts 就消
 *  B 页面级（rule 之外：option / dataSources / actions）—— 页面骨架债，与组件类型无关
 *  C 已登记组件子树 —— 保真度 bug，编译器在真实数据上写错/漏写，这才是危险信号
 */
function bucket(holePath: string, nodes: ReportNode[]): HoleBucket {
  if (!holePath.startsWith('rule[')) return 'B'
  const owner = ownerOf(holePath, nodes)
  return owner && !TYPE_CONTRACTS[owner.type] ? 'A' : 'C'
}

/** 四张登记表计数：warnings 跨节点级 / 行为级 / 数据源级（后两者登记的是页面级绝对路径） */
function countRegisters(manifest: GeneratedManifest) {
  const sum = (pick: (n: GeneratedManifest['nodes'][number]) => unknown[]) =>
    manifest.nodes.reduce((s, n) => s + pick(n).length, 0)
  return {
    dropped: sum((n) => n.dropped),
    warnings:
      sum((n) => n.warnings) +
      (manifest.behaviors || []).reduce((s, b) => s + b.warnings.length, 0) +
      (manifest.dataSources || []).reduce((s, d) => s + d.warnings.length, 0),
    renames: sum((n) => n.renames),
    wireOnly: sum((n) => n.wireOnly),
  }
}

export function buildReport(
  schema: Record<string, any>,
  pageKey: string,
  manifest: GeneratedManifest,
  files: Record<string, string>,
): GenerateReport {
  const nodes = collectNodes(schema.rule || [])
  const holes: ReportHole[] = []
  const renameFailures: ReportRenameFailure[] = []

  const vueFile = Object.keys(files).find((f) => f.endsWith('.vue'))
  if (vueFile) {
    const back = reverseToSchema(schema, files[vueFile], manifest)
    for (const h of back.holes) {
      const path = String(h.path)
      holes.push({
        path,
        kind: String(h.kind),
        bucket: bucket(path, nodes),
        owner: ownerOf(path, nodes)?.type ?? '',
        expected: h.expected,
        actual: h.actual,
      })
    }
    for (const r of back.renameChecks) {
      if (r.ok) continue
      const path = String(r.path)
      renameFailures.push({ path, to: String(r.to), bucket: bucket(path, nodes), artifact: r.artifact, schema: r.schema })
    }
  }

  const buckets = { A: 0, B: 0, C: 0 }
  for (const h of holes) buckets[h.bucket] += 1

  const totalNodes = nodes.length
  const emittableNodes = nodes.filter((n) => !n.blocked).length

  return {
    reportVersion: 1,
    pageKey,
    codegenRate: {
      totalNodes,
      registeredNodes: nodes.filter((n) => TYPE_CONTRACTS[n.type]).length,
      emittableNodes,
      // 空页面记 1：一个组件节点都没有就没有债可出，不该报 0/0
      rate: totalNodes ? emittableNodes / totalNodes : 1,
    },
    buckets,
    holes,
    renameFailures,
    unsupported: manifest.unsupported,
    registryCounts: countRegisters(manifest),
    nodes,
  }
}
