/**
 * 语料体检（spike 2）：把现网真实页面批量过 生成 → 回读，量出三件事
 *  1. 类型轴：TYPE_CONTRACTS 覆盖了语料里多少组件节点（能力表真实缺口）
 *  2. 已登记部分的可信度：holes 里有多少落在未登记节点子树上（预期丢弃），
 *     有多少落在已登记节点上（真 bug —— 编译器在真实数据上不忠实）
 *  3. unsupported 分类：广度债（类型/键未登记）与语义债（触发器、动作链）各占多少
 *
 * 覆盖率的分母口径（spike 7D）：按「出码器真走得到的节点」算，不是按「类型登记了没有」算。
 * 采集器走全四处 rule 载体（含 node.children 与 props.columns[].rule），和运行时取字段用的
 * formRuleWalk.ts:walkRules 同一口径；每个节点带 blocked 归因，登记了但递归进不去的不许算成绩。
 *
 * 报表走 stdout，不落文件；断言钉三条不变式：不许崩、已登记子树必须零空洞、分母口径不许漂。
 */
import { describe, expect, it } from 'vitest'

import { TYPE_CONTRACTS } from '../contract'
import { generatePage } from '../generate'
import { reverseToSchema } from '../reverse'

const corpus = import.meta.glob('./fixtures/corpus/*.json', { eager: true, import: 'default' }) as Record<
  string,
  Record<string, any>
>

const pages = Object.entries(corpus)
  .map(([p, schema]) => ({ key: p.split('/').pop()!.replace('.json', ''), schema }))
  .sort((a, b) => a.key.localeCompare(b.key))

interface NodeRef {
  type: string
  /** schema 内路径前缀，与 reverse 报出的 hole path 同一坐标系：rule[0] / rule[0].props.rule[2] */
  path: string
  /** 该节点 props 的顶层键（rule 载体键除外）—— 补契约的工作量就是这个数 */
  propsKeys: string[]
  /**
   * 出码器走不到这里的原因（null = 真能出码）。光看「类型有没有契约」会算进三类假覆盖：
   *  unregistered:<类型> —— 这个节点自己或它某个祖先压根没登记，生成器在那里就降级成 unsupported；
   *  carrier:<类型> —— 该类型把 props.rule 登记成 prop 透传（数据容器的 childRules），
   *    子树是给组件内嵌 form-create 解释的数据，不是模板；
   *  children:<类型> —— 子节点挂在 node.children（fcTable 画布态），生成器一条都不递归；
   *  columns:<类型> —— 嵌在 props.columns[].rule 里，目前没有类型把它登记成 children 载体。
   * 只保留最外层那个阻断点：补完它才看得见下一层。
   */
  blocked: string | null
}

/**
 * 组件节点遍历：走 schema 里真实存在的四处 rule 载体
 * （容器 props.rule、卡片/详情列内嵌 props.columns[].rule、画布态/布局容器的 node.children），
 * 与运行时取字段用的 formRuleWalk.ts:walkRules 同一口径 —— 少一处就少统计一类节点。
 */
function collectNodes(rule: any[], prefix = 'rule', out: NodeRef[] = [], blocked: string | null = null): NodeRef[] {
  ;(rule || []).forEach((node, i) => {
    if (!node || typeof node !== 'object') return
    const path = `${prefix}[${i}]`
    const propsKeys = Object.keys(node.props || {}).filter((k) => k !== 'rule')
    const contract = TYPE_CONTRACTS[node.type]
    // 先有阻断就沿用：最高那个阻断点才是该先修的那个（下面再套几层都不改变结论）
    const own = blocked ?? (contract ? null : `unregistered:${node.type}`)
    if (typeof node.type === 'string') out.push({ type: node.type, path, propsKeys, blocked: own })
    if (Array.isArray(node.props?.rule)) {
      // 只有登记成 children 的 props.rule 才会被 planNode 递归（generate.ts 的子规则开关）
      const carrier = own ?? (contract?.props?.rule?.emit === 'children' ? null : `carrier:${node.type}`)
      collectNodes(node.props.rule, `${path}.props.rule`, out, carrier)
    }
    if (Array.isArray(node.children)) collectNodes(node.children, `${path}.children`, out, own ?? `children:${node.type}`)
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
function ownerOf(holePath: string, nodes: NodeRef[]): NodeRef | undefined {
  return nodes
    .filter((n) => under(holePath, n.path))
    .sort((a, b) => b.path.length - a.path.length)[0]
}

/**
 * 空洞分桶：
 *  A 未登记组件子树 —— 广度债，补 contract.ts 就消
 *  B 页面级（rule 之外：option / dataSources / actions）—— 页面骨架债，与组件类型无关
 *  C 已登记组件子树 —— 保真度 bug，编译器在真实数据上写错/漏写，这才是危险信号
 */
type Bucket = 'A' | 'B' | 'C'

function bucket(holePath: string, nodes: NodeRef[]): Bucket {
  if (!holePath.startsWith('rule[')) return 'B'
  const owner = ownerOf(holePath, nodes)
  return owner && !TYPE_CONTRACTS[owner.type] ? 'A' : 'C'
}

interface Row {
  key: string
  nodes: NodeRef[]
  registeredNodes: number
  /** 有契约**且**出码器走得到的节点（blocked 为空）：覆盖率只按这个数算 */
  emittableNodes: number
  unregisteredTypes: string[]
  unsupported: { type: string; key: string; message: string }[]
  holes: number
  bucketA: number
  bucketB: number
  bucketC: number
  /** C 桶明细 —— 保真度 bug，必须为空 */
  cHoles: { path: string; kind: string; owner: string }[]
  /** B 桶明细 —— 页面级债的形态 */
  bHoles: { path: string; kind: string }[]
  failedRenames: number
  failedRenameList: { path: string; to: string; detail: string; bucket: Bucket }[]
  threw: string | null
}

const memo: Row[] = []

function audit(): Row[] {
  if (memo.length) return memo
  for (const { key, schema } of pages) {
    const nodes = collectNodes(schema.rule || [])
    const unregTypes = [...new Set(nodes.filter((n) => !TYPE_CONTRACTS[n.type]).map((n) => n.type))].sort()
    let threw: string | null = null
    let unsupported: Row['unsupported'] = []
    let holes = 0
    let bucketA = 0
    let bucketB = 0
    let bucketC = 0
    const cHoles: { path: string; kind: string; owner: string }[] = []
    const bHoles: { path: string; kind: string }[] = []
    let failedRenames = 0
    const failedRenameList: { path: string; to: string; detail: string; bucket: Bucket }[] = []
    try {
      const res = generatePage(schema as any, { pageKey: key, pageName: key, exportedAt: 'corpus-audit' })
      unsupported = res.manifest.unsupported
      const vue = Object.keys(res.files).find((f) => f.endsWith('.vue'))!
      const back = reverseToSchema(schema as any, res.files[vue], res.manifest)
      holes = back.holes.length
      for (const h of back.holes as any[]) {
        const b = bucket(String(h.path), nodes)
        if (b === 'A') bucketA += 1
        else if (b === 'B') {
          bucketB += 1
          bHoles.push({ path: String(h.path), kind: String(h.kind) })
        } else {
          bucketC += 1
          cHoles.push({
            path: String(h.path),
            kind: String(h.kind),
            owner: ownerOf(String(h.path), nodes)?.type ?? '（不属于任何 rule 节点）',
          })
        }
      }
      failedRenames = back.renameChecks.filter((r: any) => !r.ok).length
      back.renameChecks
        .filter((r: any) => !r.ok)
        .forEach((r: any) =>
          failedRenameList.push({
            path: String(r.path),
            to: String(r.to),
            bucket: bucket(String(r.path), nodes),
            detail: `产物=${JSON.stringify(r.artifact)} schema=${JSON.stringify(r.schema)}`,
          }),
        )
    } catch (e: any) {
      threw = `${e.name}: ${e.message}`
    }
    memo.push({
      key,
      nodes,
      registeredNodes: nodes.filter((n) => TYPE_CONTRACTS[n.type]).length,
      emittableNodes: nodes.filter((n) => !n.blocked).length,
      unregisteredTypes: unregTypes,
      unsupported,
      holes,
      bucketA,
      bucketB,
      bucketC,
      cHoles,
      bHoles,
      failedRenames,
      failedRenameList,
      threw,
    })
  }
  return memo
}

describe('语料体检：现网真实页面批量出码回读', () => {
  it('每页都能跑完（生成器对未知类型降级为 unsupported，不许抛错）', () => {
    for (const r of audit()) {
      expect(r.threw, `${r.key} 出码崩溃`).toBeNull()
    }
  })

  it('已登记组件子树在真实页面上必须零保真度空洞（C 桶）', () => {
    for (const r of audit()) {
      expect(r.bucketC, `${r.key} 已登记组件出码不忠实：${JSON.stringify(r.cHoles)}`).toBe(0)
    }
  })

  it('分母诚实：覆盖率只算「有契约且出码器真走得到」，走不到的按最外层阻断点归因', () => {
    const rs = audit()
    const total = rs.reduce((s, r) => s + r.nodes.length, 0)
    const registered = rs.reduce((s, r) => s + r.registeredNodes, 0)
    const emittable = rs.reduce((s, r) => s + r.emittableNodes, 0)
    // 旧口径把 registered 当分子，报出 82.8%；7D 修仪器后只有 56.1%，差值就是那批
    // 「类型登记了、生成器却进不去」的假覆盖。9 登记嵌套容器（group/tableForm/subForm/select）
    // 并把 columns 载体接进递归后，可出码 88/98：剩下的 10 个是 fcTable 子树与数据容器 childRules。
    expect(total).toBe(98)
    expect(registered).toBe(94)
    expect(emittable).toBe(88)

    const of = (key: string) => rs.find((r) => r.key === key)!
    // fcTable：子节点挂 node.children，生成器不 walk。这 5 个全是已登记类型，旧口径白送 5 分。
    const dash = of('dashboard')
    expect(dash.nodes.map((n) => n.type)).toEqual(['fcTable', 'dash-todo', 'dash-kpi', 'dash-kpi', 'dash-chart', 'dash-chart'])
    expect(dash.emittableNodes).toBe(0)
    // 归因只报最外层那个阻断点：fcTable 未登记是先要补的，补完才会露出 children 这一层
    expect([...new Set(dash.nodes.filter((n) => n.path.includes('.children')).map((n) => n.blocked))]).toEqual([
      'unregistered:fcTable',
    ])
    // 数据容器：props.rule 登记成 prop 透传（childRules），子树是数据不是模板，递归进去就是双份真相
    const dc = of('tmp_data_container_verify')
    expect(dc.emittableNodes).toBe(3)
    expect(dc.nodes.map((n) => [n.path, n.blocked])).toEqual([
      ['rule[0]', null],
      ['rule[1]', null],
      ['rule[1].props.rule[0]', 'carrier:page-data-container'],
      ['rule[1].props.rule[1]', 'carrier:page-data-container'],
      ['rule[2]', null],
      ['rule[2].props.rule[0]', 'carrier:page-data-container'],
    ])
    // 阻断点归因不许越层：div 自己也未登记，但它先被 childRules 挡住 —— 越层归因会把
    // 「补 div 契约」算成收益，实际补了也出不了码。
    expect(dc.nodes[2].blocked).toBe('carrier:page-data-container')
    expect(TYPE_CONTRACTS[dc.nodes[2].type]).toBeUndefined()
  })

  it('出报表', () => {
    const rs = audit()
    const totalNodes = rs.reduce((s, r) => s + r.nodes.length, 0)
    const regNodes = rs.reduce((s, r) => s + r.registeredNodes, 0)
    const emitNodes = rs.reduce((s, r) => s + r.emittableNodes, 0)

    console.log('\n================ 页面轴 ================')
    for (const r of rs) {
      console.log(
        `${r.key.padEnd(26)} 节点${String(r.nodes.length).padStart(3)} 有契约${String(r.registeredNodes).padStart(3)} 可出码${String(r.emittableNodes).padStart(3)}  ` +
          `unsup${String(r.unsupported.length).padStart(3)}  空洞 总${String(r.holes).padStart(3)}` +
          `（A广度${r.bucketA} B页面${r.bucketB} C保真${r.bucketC}）  重命名失败${r.failedRenames}`,
      )
      console.log(`  未登记类型: ${r.unregisteredTypes.join(', ') || '-'}`)
    }
    const sum = (k: 'bucketA' | 'bucketB' | 'bucketC') => rs.reduce((s, r) => s + r[k], 0)
    // 覆盖率只认「blocked 为空」的节点。「有契约」那一栏留着，两者的差值就是假覆盖 ——
    // 类型登记了、出码器却进不去，补契约消不掉它，得改生成器或改组件的数据载体形态。
    console.log(
      `\n节点覆盖率（可出码口径）${emitNodes}/${totalNodes} = ${((emitNodes / totalNodes) * 100).toFixed(1)}%  ` +
        `（其中仅登记未接通${regNodes - emitNodes}）  ` +
        `空洞 A广度${sum('bucketA')} / B页面${sum('bucketB')} / C保真${sum('bucketC')}`,
    )
    console.log('\n================ 已登记却走不到的节点（按阻断原因归并） ================')
    const blockers = new Map<string, string[]>()
    for (const r of rs) {
      for (const n of r.nodes) {
        if (!n.blocked || !TYPE_CONTRACTS[n.type]) continue
        const list = blockers.get(n.blocked) || []
        list.push(`${r.key} ${n.path}`)
        blockers.set(n.blocked, list)
      }
    }
    for (const [reason, list] of [...blockers.entries()].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`${String(list.length).padStart(3)}  ${reason}`)
      for (const x of list) console.log(`        ${x}`)
    }
    if (!blockers.size) console.log('（空）')

    console.log('\n================ C 桶：已登记组件子树上的不忠实出码 ================')
    const cList = rs.flatMap((r) => r.cHoles.map((h) => `${r.key} ${h.kind} ${h.path}  落在[${h.owner}]`))
    console.log(cList.length ? cList.join('\n') : '（空）')
    const byOwner = new Map<string, number>()
    for (const r of rs) {
      for (const h of r.cHoles) byOwner.set(h.owner, (byOwner.get(h.owner) || 0) + 1)
    }
    console.log(
      'C 桶按落点组件归并：' +
        [...byOwner.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}×${n}`).join('  '),
    )

    console.log('\n================ 重命名核对失败（按桶） ================')
    const fr = rs.flatMap((r) => r.failedRenameList.map((x) => ({ ...x, page: r.key })))
    console.log(`C 桶（真 bug）${fr.filter((x) => x.bucket === 'C').length} / A 桶（广度连带）${fr.filter((x) => x.bucket === 'A').length}`)
    for (const x of fr.slice(0, 12)) {
      console.log(` ${x.bucket} ${x.page.padEnd(24)} ${x.path} → ${x.to}  ${x.detail.slice(0, 90)}`)
    }

    console.log('\n================ B 桶：页面级空洞形态（按路径归并） ================')
    const bGroups = new Map<string, number>()
    for (const r of rs) {
      for (const h of r.bHoles) {
        const k = h.path.replace(/\[\d+\]/g, '[*]')
        bGroups.set(`${k} (${h.kind})`, (bGroups.get(`${k} (${h.kind})`) || 0) + 1)
      }
    }
    for (const [k, n] of [...bGroups.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`${String(n).padStart(3)}  ${k}`)
    }

    console.log('\n================ 类型轴（按语料节点数排序） ================')
    const freq = new Map<string, { nodes: number; pages: Set<string>; keys: Set<string> }>()
    for (const r of rs) {
      for (const n of r.nodes) {
        const cur = freq.get(n.type) || { nodes: 0, pages: new Set<string>(), keys: new Set<string>() }
        cur.nodes += 1
        cur.pages.add(r.key)
        n.propsKeys.forEach((k) => cur.keys.add(k))
        freq.set(n.type, cur)
      }
    }
    for (const [type, c] of [...freq.entries()].sort((a, b) => b[1].nodes - a[1].nodes)) {
      const contract = TYPE_CONTRACTS[type]
      // 语料里出现、但契约表顶层键没登记的 props —— 就是这类组件的补登工作量
      const uncovered = [...c.keys].filter((k) => !contract?.props[k]).sort()
      console.log(
        `${contract ? '有契约' : '  --  '} ${type.padEnd(22)} 节点${String(c.nodes).padStart(3)} 页面${String(c.pages.size).padStart(2)}  ` +
          `语料键${String(c.keys.size).padStart(3)} 未登记${String(uncovered.length).padStart(3)}  ${uncovered.slice(0, 12).join(',')} `,
      )
    }

    console.log('\n================ unsupported 分类 ================')
    const groups = new Map<string, number>()
    for (const r of rs) {
      for (const u of r.unsupported) {
        const k = u.message.includes('无出码契约')
          ? `A 类型未登记:${u.type}`
          : u.message.includes('契约表无此键')
            ? `B props 键未登记:${u.type}`
            : `C ${u.message.slice(0, 30)}`
        groups.set(k, (groups.get(k) || 0) + 1)
      }
    }
    for (const [k, n] of [...groups.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`${String(n).padStart(4)}  ${k}`)
    }
    console.log('')
  })
})
