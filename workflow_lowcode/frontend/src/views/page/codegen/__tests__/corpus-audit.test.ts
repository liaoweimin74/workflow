/**
 * 语料体检（spike 2，阶段 5.2 起消费出码报告）：把现网真实页面批量过 生成，量出三件事
 *  1. 类型轴：TYPE_CONTRACTS 覆盖了语料里多少组件节点（能力表真实缺口）
 *  2. 已登记部分的可信度：空洞里有多少落在未登记节点子树上（预期丢弃），
 *     有多少落在已登记节点上（真 bug —— 编译器在真实数据上不忠实）
 *  3. unsupported 分类：广度债（类型/键未登记）与语义债（触发器、动作链）各占多少
 *
 * 覆盖率的分母口径（spike 7D）：按「出码器真走得到的节点」算，不是按「类型登记了没有」算。
 * 采集与分桶现在住在 report.ts（生产模块，随每次 generatePage 执行），本文件不再自带一份口径 ——
 * 体检读的数与出码自己声称的数必须是同一个函数算出来的，否则仪器和被测物各说各话。
 *
 * 报表走 stdout，不落文件；断言钉三条不变式：不许崩、已登记子树必须零空洞、分母口径不许漂。
 */
import { describe, expect, it } from 'vitest'

import { TYPE_CONTRACTS } from '../contract'
import { generatePage, type GenerateReport } from '../generate'
import { PROFILES, supports } from '../target-profile'
import { generatePageUni } from '../uni/emit-uni'
import { BASELINE } from './baseline'

const corpus = import.meta.glob('./fixtures/corpus/*.json', { eager: true, import: 'default' }) as Record<
  string,
  Record<string, any>
>

const pages = Object.entries(corpus)
  .map(([p, schema]) => ({ key: p.split('/').pop()!.replace('.json', ''), schema }))
  .sort((a, b) => a.key.localeCompare(b.key))

interface Row {
  key: string
  /** 节点表由出码报告给出（report.ts 的采集口径），本文件不另立一份 */
  nodes: GenerateReport['nodes']
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
  failedRenameList: { path: string; to: string; detail: string; bucket: 'A' | 'B' | 'C' }[]
  threw: string | null
}

const memo: Record<'web' | 'uniapp', Row[]> = { web: [], uniapp: [] }

/**
 * 一台仪器量两个目标（Task 10.2，spec「per-target 可出码率 Gate」）：
 * 只有「同一份采集口径 + 同一个 buildReport」下的 web/uniapp 数字才可比，
 * 所以这里只把生成器调用分叉（web=generatePage / uniapp=generatePageUni），
 * 分桶、空洞、重命名核对全部共用。
 */
function audit(target: 'web' | 'uniapp' = 'web'): Row[] {
  if (memo[target].length) return memo[target]
  for (const { key, schema } of pages) {
    let threw: string | null = null
    let nodes: Row['nodes'] = []
    let unsupported: Row['unsupported'] = []
    let registeredNodes = 0
    let emittableNodes = 0
    let bucketA = 0
    let bucketB = 0
    let bucketC = 0
    let holes = 0
    let failedRenames = 0
    const cHoles: { path: string; kind: string; owner: string }[] = []
    const bHoles: { path: string; kind: string }[] = []
    const failedRenameList: { path: string; to: string; detail: string; bucket: 'A' | 'B' | 'C' }[] = []
    try {
      const { report } =
        target === 'uniapp'
          ? (generatePageUni(schema as any, {
              pageKey: key,
              pageName: key,
              client: { key, pages: [{ key, title: key }] },
            }) as unknown as { report: GenerateReport })
          : generatePage(schema as any, { pageKey: key, pageName: key, exportedAt: 'corpus-audit' })
      nodes = report.nodes
      unsupported = report.unsupported
      registeredNodes = report.codegenRate.registeredNodes
      // per-target 数字（spec「per-target 可出码率 Gate」）：web 侧与顶层同值，
      // uniapp 侧的分母排除 web-only 组件（能力过滤与契约阻断正交）——读错这一层
      // 就等于拿 web 的账去判 uniapp 的债。
      emittableNodes = report.codegenRateByTarget[target].emittableNodes
      bucketA = report.bucketsByTarget[target].A
      bucketB = report.bucketsByTarget[target].B
      bucketC = report.bucketsByTarget[target].C
      // 空洞总数 = 按 target 过滤后的三桶之和（与 bucketsByTarget 同源，避免「总数含 web-only、桶不含」的矛盾）
      holes = bucketA + bucketB + bucketC
      // 逐条空洞的桶归属同样按 target 过滤：web-only 子树上的空洞在 uniapp 目标
      // 已整体登记 unsupported（随组件一起不交付），不算 uniapp 的债。
      const ownerSupported = (path: string) => {
        if (target === 'web') return true
        let deepest: any
        for (const n of report.nodes) {
          if (path === n.path || path.startsWith(`${n.path}.`) || path.startsWith(`${n.path}[`)) {
            if (!deepest || n.path.length > deepest.path.length) deepest = n
          }
        }
        return deepest ? supports(PROFILES.uniapp, deepest.type) : true
      }
      for (const h of report.holes) {
        if (!ownerSupported(String(h.path))) continue
        if (h.bucket === 'B') bHoles.push({ path: h.path, kind: h.kind })
        else if (h.bucket === 'C') cHoles.push({ path: h.path, kind: h.kind, owner: h.owner || '（不属于任何 rule 节点）' })
      }
      failedRenames = report.renameFailures.length
      for (const r of report.renameFailures)
        failedRenameList.push({
          path: r.path,
          to: r.to,
          bucket: r.bucket,
          detail: `产物=${JSON.stringify(r.artifact)} schema=${JSON.stringify(r.schema)}`,
        })
    } catch (e: any) {
      threw = `${e.name}: ${e.message}`
    }
    memo[target].push({
      key,
      nodes,
      registeredNodes,
      emittableNodes,
      unregisteredTypes: [...new Set(nodes.filter((n) => !TYPE_CONTRACTS[n.type]).map((n) => n.type))].sort(),
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
  return memo[target]
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

  it('基线桶计数与固化值一致（阶段 2 起只许变好，C 恒为 0）', () => {
    const rs = audit()
    const sum = (k: 'bucketA' | 'bucketB' | 'bucketC') => rs.reduce((s, r) => s + r[k], 0)
    expect(sum('bucketA')).toBe(BASELINE.corpus.bucketA)
    expect(sum('bucketB')).toBe(BASELINE.corpus.bucketB)
    expect(sum('bucketC')).toBe(BASELINE.corpus.bucketC)
  })

  it('持续 Gate：C 桶必须为 0，可出码率不得低于上一基线（5.2）', () => {
    const rs = audit()
    const total = rs.reduce((s, r) => s + r.nodes.length, 0)
    const emittable = rs.reduce((s, r) => s + r.emittableNodes, 0)
    expect(rs.reduce((s, r) => s + r.bucketC, 0), 'C 桶必须为 0').toBe(0)
    expect(
      emittable / total,
      `可出码率 ${emittable}/${total} 低于基线 ${BASELINE.corpus.emittableNodes}/${BASELINE.corpus.totalNodes}`,
    ).toBeGreaterThanOrEqual(BASELINE.corpus.nodeRate)
  })

  // ----- Task 10.2：per-target（uniapp）持续 Gate（spec: uniapp-codegen-target「per-target 可出码率 Gate」） -----

  it('语料体检覆盖 uniapp 目标：每页都能跑完，C 保真桶必须为 0', () => {
    for (const r of audit('uniapp')) {
      expect(r.threw, `${r.key} uniapp 出码崩溃`).toBeNull()
      // 口径注记：V1 的 uni 报告不带产物回导（emit-uni 调 buildReport 时 files 传空），
      // C 桶（已登记组件子树上的不忠实出码）在 uniapp 侧结构上恒 0。这条断言是
      // 「将来接上 uni 产物回导后 C 桶非零即失败」的前置闸门，不是当下的假绿。
      expect(r.bucketC, `${r.key} uniapp 已登记组件出码不忠实：${JSON.stringify(r.cHoles)}`).toBe(0)
    }
  })

  it('uniapp 持续 Gate：分桶与基线一致，可出码率不得低于基线，C 桶非零即失败', () => {
    const rs = audit('uniapp')
    const sum = (k: 'bucketA' | 'bucketB' | 'bucketC') => rs.reduce((s, r) => s + r[k], 0)
    const total = rs.reduce((s, r) => s + r.nodes.length, 0)
    const emittable = rs.reduce((s, r) => s + r.emittableNodes, 0)
    expect(total).toBe(BASELINE.corpusUniapp.totalNodes)
    expect(rs.reduce((s, r) => s + r.registeredNodes, 0)).toBe(BASELINE.corpusUniapp.registeredNodes)
    expect(emittable).toBe(BASELINE.corpusUniapp.emittableNodes)
    expect(sum('bucketA')).toBe(BASELINE.corpusUniapp.bucketA)
    expect(sum('bucketB')).toBe(BASELINE.corpusUniapp.bucketB)
    expect(sum('bucketC'), 'uniapp C 桶必须为 0').toBe(0)
    expect(
      emittable / total,
      `uniapp 可出码率 ${emittable}/${total} 低于基线 ${BASELINE.corpusUniapp.emittableNodes}/${BASELINE.corpusUniapp.totalNodes}`,
    ).toBeGreaterThanOrEqual(BASELINE.corpusUniapp.nodeRate)
  })

  it('web 与 uniapp 两套分桶同源可比：节点分母一致，差异只在两端可达性', () => {
    const web = audit('web')
    const uni = audit('uniapp')
    expect(uni.reduce((s, r) => s + r.nodes.length, 0)).toBe(web.reduce((s, r) => s + r.nodes.length, 0))
  })

  it('分母诚实：覆盖率只算「有契约且出码器真走得到」，走不到的按最外层阻断点归因', () => {
    const rs = audit()
    const total = rs.reduce((s, r) => s + r.nodes.length, 0)
    const registered = rs.reduce((s, r) => s + r.registeredNodes, 0)
    const emittable = rs.reduce((s, r) => s + r.emittableNodes, 0)
    // 旧口径把 registered 当分子，报出 82.8%；7D 修仪器后只有 56.1%，差值就是那批
    // 「类型登记了、生成器却进不去」的假覆盖。9 登记嵌套容器（group/tableForm/subForm/select）
    // 并把 columns 载体接进递归；P2 阶段 2 登记 fcTable（children 按 slot 递归）后，可出码 94/98：
    // 剩下 4 个是数据容器的 childRules（3，数据不是模板）与一张 material 节点（1，首版不支持）。
    // 数字固化在 baseline.ts：Gate 只许不降。
    expect(total).toBe(BASELINE.corpus.totalNodes)
    expect(registered).toBe(BASELINE.corpus.registeredNodes)
    expect(emittable).toBe(BASELINE.corpus.emittableNodes)

    const of = (key: string) => rs.find((r) => r.key === key)!
    // fcTable 整页可出码：表本体 + 5 个 slot 子节点都走得到。
    // 旧口径下这 5 个子节点挂在 node.children，生成器不 walk，已登记的类型白送 5 分。
    const dash = of('dashboard')
    expect(dash.nodes.map((n) => n.type)).toEqual(['fcTable', 'dash-todo', 'dash-kpi', 'dash-kpi', 'dash-chart', 'dash-chart'])
    expect(dash.emittableNodes).toBe(6)
    // fcTable 登记成 table 载体后，children 不再算阻断；5 个 slot 子节点全部可出码
    expect([...new Set(dash.nodes.filter((n) => n.path.includes('.children')).map((n) => n.blocked))]).toEqual([null])
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
    console.log('\n================ uniapp 目标分桶（Task 10.2 per-target Gate） ================')
    {
      const uni = audit('uniapp')
      const uniTotal = uni.reduce((s, r) => s + r.nodes.length, 0)
      const uniEmit = uni.reduce((s, r) => s + r.emittableNodes, 0)
      const uniSum = (k: 'bucketA' | 'bucketB' | 'bucketC') => uni.reduce((s, r) => s + r[k], 0)
      console.log(
        `uniapp 可出码率 ${uniEmit}/${uniTotal} = ${((uniEmit / uniTotal) * 100).toFixed(1)}%  ` +
          `空洞 A广度${uniSum('bucketA')} / B页面${uniSum('bucketB')} / C保真${uniSum('bucketC')}`,
      )
      // 「不可出码」在 uniapp 侧不是静默丢弃：由 unsupported 清单按最外层阻断点逐条登记
      // （V1 未接 uni 产物回导，空洞为 0，账目看这里）。
      const uniUnsup = uni.reduce((s, r) => s + r.unsupported.length, 0)
      console.log(
        `uniapp 不可出码 ${uniTotal - uniEmit} 节点，unsupported 清单 ${uniUnsup} 条（按最外层阻断点登记，含 web-only 能力过滤）`,
      )
      for (const r of uni) {
        if (!r.nodes.length) continue
        console.log(
          `${r.key.padEnd(26)} 可出码${String(r.emittableNodes).padStart(3)}/${String(r.nodes.length).padStart(3)}  ` +
            `unsup${String(r.unsupported.length).padStart(3)}  ` +
            `A${r.bucketA} B${r.bucketB} C${r.bucketC}`,
        )
      }
    }

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
