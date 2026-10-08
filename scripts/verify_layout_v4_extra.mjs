// v4 循环列布局·加固项同构验证（user-req-4b-v4 补充回归，与 verify_layout_v4.mjs 互补）
// 覆盖：① 收集顺序缺陷修复（嵌套 BATCH 链无条件收集）② 同层循环子树横向让位
//       ③ 嵌套兄弟列纵向并行时的右移级联 ④ blockHeight/层带与实际落位几何一致
// 镜像 LogicFlowDesigner.vue handleAutoLayout v4 最终实现（含全部加固）。
const LOOP_START_ANCHOR = 0.3
const BODY_COL_GAP_X = 56
const BODY_COL_GAP_Y = 56
const BODY_COL_ANCHOR_DROP = 24
const BODY_COL_NEST_MARGIN = 24

let pass = 0, fail = 0
function assert(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`) }
}
const overlap = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

function buildLayout(nodes, edges) {
  const nodesById = new Map(nodes.map((n) => [n.id, n]))
  const size = (id) => ({ w: nodesById.get(id).w, h: nodesById.get(id).h })
  const isLoop = (e) => e.loop === true

  function collectBodyChain(batchId) {
    const chain = []
    const loopEdges = edges.filter(isLoop)
    const startEdge = loopEdges.find((e) => e.source === batchId && e.sh === 'loop_start')
    if (!startEdge) return chain
    const seen = new Set([batchId])
    let cur = startEdge.target
    let guard = 0
    while (cur && !seen.has(cur) && guard++ < 100) {
      seen.add(cur)
      const node = nodesById.get(cur)
      if (!node) break
      chain.push(cur)
      const next = loopEdges.find((e) => e.source === cur && e.sh !== 'loop_start')
      if (!next) break
      cur = next.target
    }
    return chain
  }

  return function layout() {
    // 1) v4 修复：无条件收集每个 BATCH 的 body 链
    const bodyOwner = new Map()
    const bodyChains = new Map()
    for (const n of nodes) {
      if (n.type !== 'BATCH') continue
      const chain = collectBodyChain(n.id)
      if (!chain.length) continue
      bodyChains.set(n.id, chain)
      chain.forEach((id) => bodyOwner.set(id, n.id))
    }

    // 2) 主流 Kahn 分层
    const mainIds = nodes.filter((n) => !bodyOwner.has(n.id)).map((n) => n.id)
    const idSet = new Set(mainIds)
    const depth = new Map(), indegree = new Map(), out = new Map()
    mainIds.forEach((id) => { indegree.set(id, 0); out.set(id, []) })
    edges.forEach((e) => {
      if (isLoop(e)) return
      if (idSet.has(e.source) && idSet.has(e.target)) {
        out.get(e.source).push(e.target)
        indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1)
      }
    })
    const queue = mainIds.filter((id) => (indegree.get(id) ?? 0) === 0)
    const startId = nodes.find((n) => n.type === 'START')?.id
    if (startId && idSet.has(startId) && (indegree.get(startId) ?? 0) > 0) queue.unshift(startId)
    queue.forEach((id) => { if (!depth.has(id)) depth.set(id, 0) })
    let maxDepth = 0
    while (queue.length) {
      const id = queue.shift()
      const current = depth.get(id) ?? 0
      maxDepth = Math.max(maxDepth, current)
      for (const next of out.get(id) ?? []) {
        if (current + 1 > (depth.get(next) ?? -1)) depth.set(next, current + 1)
        const remaining = (indegree.get(next) ?? 1) - 1
        indegree.set(next, remaining)
        if (remaining === 0) queue.push(next)
      }
    }
    mainIds.forEach((id) => { if (!depth.has(id)) depth.set(id, ++maxDepth) })

    // 3) blockHeight
    const blockH = new Map()
    function blockHeight(id, stack = new Set()) {
      if (blockH.has(id)) return blockH.get(id)
      const self = size(id).h
      if (stack.has(id)) return self
      stack.add(id)
      let h = self
      const chain = bodyChains.get(id)
      if (chain?.length) {
        const colTop = self * LOOP_START_ANCHOR + BODY_COL_ANCHOR_DROP
        let offset = 0, deepest = 0
        for (const cid of chain) {
          const cardH = size(cid).h
          deepest = Math.max(deepest, offset + (nodesById.get(cid).type === 'BATCH' ? blockHeight(cid, stack) : cardH))
          offset += cardH + BODY_COL_GAP_Y
        }
        h = Math.max(self, colTop + deepest)
      }
      stack.delete(id)
      blockH.set(id, h)
      return h
    }
    mainIds.forEach((id) => blockHeight(id))

    // 3b) colSubtreeW（与 placeChain nestLeft 严格同构）
    const colW = new Map()
    function colSubtreeW(id, stack = new Set()) {
      if (colW.has(id)) return colW.get(id)
      const chain = bodyChains.get(id)
      if (!chain?.length) return 0
      if (stack.has(id)) return 0
      stack.add(id)
      const colMaxW = Math.max(...chain.map((cid) => size(cid).w))
      let extent = colMaxW
      let prevRight = -Infinity
      for (const cid of chain) {
        const cn = nodesById.get(cid)
        if (!cn || cn.type !== 'BATCH') continue
        const nestLeftRel = Math.max(
          (colMaxW + size(cid).w) / 2 + BODY_COL_GAP_X,
          colMaxW + BODY_COL_NEST_MARGIN,
          prevRight + BODY_COL_GAP_X
        )
        prevRight = nestLeftRel + colSubtreeW(cid, stack)
        extent = Math.max(extent, prevRight)
      }
      stack.delete(id)
      colW.set(id, extent)
      return extent
    }
    mainIds.forEach((id) => colSubtreeW(id))

    // 4) 分层布局（含循环子树横向让位）
    const leftX = 80, colGapX = 56, topY = 60, layerGapY = 64
    const byLayer = new Map()
    mainIds.forEach((id) => {
      const layer = depth.get(id) ?? 0
      if (!byLayer.has(layer)) byLayer.set(layer, [])
      byLayer.get(layer).push(nodesById.get(id))
    })
    const layerCenter = new Map()
    let cursorY = topY
    const layers = [...byLayer.entries()].sort((a, b) => a[0] - b[0])
    layers.forEach(([layer, list]) => {
      const maxCardH = Math.max(...list.map((n) => size(n.id).h))
      const center = cursorY + maxCardH / 2
      layerCenter.set(layer, center)
      let bandBottom = center + maxCardH / 2
      list.forEach((n) => {
        bandBottom = Math.max(bandBottom, center - size(n.id).h / 2 + blockHeight(n.id))
      })
      cursorY = bandBottom + layerGapY
    })
    layers.forEach(([layer, list]) => {
      const center = layerCenter.get(layer)
      list.sort((a, b) => a.x - b.x)
      let cursorX = leftX
      list.forEach((n) => {
        const s = size(n.id)
        n.x = Math.round(cursorX)
        n.y = Math.round(center - s.h / 2)
        const subtreeW = colSubtreeW(n.id)
        cursorX += s.w + (subtreeW > 0 ? BODY_COL_GAP_X + subtreeW + colGapX : colGapX)
      })
    })

    // 5) placeChain（含兄弟列级联，返回子树右缘）
    const placed = new Set()
    function placeChain(batchId, minLeftX) {
      if (placed.has(batchId)) return minLeftX
      placed.add(batchId)
      const chain = bodyChains.get(batchId)
      const batch = nodesById.get(batchId)
      if (!chain?.length || !batch) return minLeftX
      const bSize = size(batchId)
      const colMaxW = Math.max(...chain.map((cid) => size(cid).w))
      const axisX = minLeftX + colMaxW / 2
      let colCursorY = batch.y + bSize.h * LOOP_START_ANCHOR + BODY_COL_ANCHOR_DROP
      let subtreeRight = axisX + colMaxW / 2
      let prevNestRight = -Infinity
      chain.forEach((cid) => {
        const cn = nodesById.get(cid)
        if (!cn) return
        const s = size(cid)
        cn.x = Math.round(axisX - s.w / 2)
        cn.y = Math.round(colCursorY)
        colCursorY += s.h + BODY_COL_GAP_Y
        if (cn.type === 'BATCH') {
          const nestLeft = Math.max(
            cn.x + s.w + BODY_COL_GAP_X,
            axisX + colMaxW / 2 + BODY_COL_NEST_MARGIN,
            prevNestRight + BODY_COL_GAP_X
          )
          prevNestRight = placeChain(cid, nestLeft)
          subtreeRight = Math.max(subtreeRight, prevNestRight)
        }
      })
      return subtreeRight
    }
    for (const batchId of bodyChains.keys()) {
      if (bodyOwner.has(batchId)) continue
      const batch = nodesById.get(batchId)
      if (!batch) continue
      placeChain(batchId, batch.x + size(batchId).w + BODY_COL_GAP_X)
    }
    return { bodyChains, bodyOwner, blockH, colW, nodesById }
  }
}

console.log('== 图A：基础嵌套（外层 BATCH 先建 = 旧收集缺陷的 adverse 顺序）==')
{
  const N = (id, type, w, h, x, y) => ({ id, type, w, h, x, y })
  const nodes = [
    N('start', 'START', 160, 54, 0, 0),
    N('B1', 'BATCH', 220, 190, 500, 0),
    N('end', 'END', 160, 54, 900, 0),
    N('h1', 'HTTP', 160, 54, 0, 400),
    N('B2', 'BATCH', 220, 190, 0, 500),
    N('h4', 'HTTP', 300, 54, 0, 600),
    N('h2', 'BEAN', 160, 54, 0, 700),
    N('h3', 'BEAN', 160, 54, 0, 800),
  ]
  const edges = [
    { source: 'start', target: 'B1', sh: 'out', th: 'in' },
    { source: 'B1', target: 'end', sh: 'out', th: 'in' },
    { source: 'B1', target: 'h1', sh: 'loop_start', th: 'in', loop: true },
    { source: 'h1', target: 'B2', sh: 'out', th: 'in', loop: true },
    { source: 'B2', target: 'h4', sh: 'out', th: 'in', loop: true },
    { source: 'B2', target: 'h2', sh: 'loop_start', th: 'in', loop: true },
    { source: 'h2', target: 'h3', sh: 'out', th: 'in', loop: true },
    { source: 'h3', target: 'B2', sh: 'out', th: 'loop_end', loop: true },
    { source: 'h4', target: 'B1', sh: 'out', th: 'loop_end', loop: true },
  ]
  const { bodyChains, bodyOwner, blockH } = buildLayout(nodes, edges)()
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))
  const center = (n) => n.x + n.w / 2

  assert('A1 嵌套 BATCH 链被无条件收集（顺序缺陷修复）', bodyChains.get('B2')?.join(',') === 'h2,h3')
  assert('A2 B1 链 = [h1,B2,h4]', bodyChains.get('B1')?.join(',') === 'h1,B2,h4')
  assert('A3 循环成员归属正确不进主流', bodyOwner.get('h1') === 'B1' && bodyOwner.get('B2') === 'B1' && bodyOwner.get('h2') === 'B2' && bodyOwner.get('h3') === 'B2')
  assert('A4 B1 列成员共享列中轴', Math.abs(center(byId.h1) - center(byId.B2)) < 0.6 && Math.abs(center(byId.B2) - center(byId.h4)) < 0.6)
  assert('A5 B2 列成员共享列中轴', Math.abs(center(byId.h2) - center(byId.h3)) < 0.6)
  assert('A6 B1 列链序自上而下（纵距=56）', byId.B2.y === byId.h1.y + 54 + 56 && byId.h4.y === byId.B2.y + 190 + 56)
  assert('A7 B2 列链序自上而下（纵距=56）', byId.h3.y === byId.h2.y + 54 + 56)
  assert('A8 B1 列首锚 = 卡顶+30%+24', byId.h1.y === Math.round(byId.B1.y + 190 * 0.3 + 24))
  assert('A9 B2 列首锚 = 卡顶+30%+24', byId.h2.y === Math.round(byId.B2.y + 190 * 0.3 + 24))
  const b1Axis = center(byId.h1)
  const b1ColRight = b1Axis + 300 / 2
  assert('A10 B2 列左缘 > B1 列最宽成员(h4,300)右缘+24', Math.min(byId.h2.x, byId.h3.x) > b1ColRight + 24 - 0.6)
  assert('A11 嵌套轴严格右移（外→内 = 左→右）', center(byId.h2) > b1Axis)
  assert('A12 B2 列在 B2 卡右缘 ≥56', Math.min(byId.h2.x, byId.h3.x) >= byId.B2.x + 220 + 56 - 0.6)
  let noOverlap = true, bad = ''
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++)
    if (overlap(nodes[i], nodes[j])) { noOverlap = false; bad = `${nodes[i].id}×${nodes[j].id}` }
  assert('A13 全图卡片零重叠', noOverlap, bad)
  const sub2 = Math.max(byId.B2.y + 190, byId.h2.y + 54, byId.h3.y + 54) - byId.B2.y
  const sub1 = Math.max(byId.B1.y + 190, byId.h1.y + 54, byId.h4.y + 54, byId.B2.y + sub2) - byId.B1.y
  assert('A14 blockHeight(B2)=实际子树纵向跨度', Math.abs(blockH.get('B2') - sub2) < 0.6, `bh=${blockH.get('B2')} vs ${sub2}`)
  assert('A15 blockHeight(B1)=实际子树纵向跨度', Math.abs(blockH.get('B1') - sub1) < 0.6, `bh=${blockH.get('B1')} vs ${sub1}`)
  assert('A16 END 层不被循环列侵入（层带隔离）', byId.end.y >= byId.B1.y + blockH.get('B1') + 64 - 0.6, `end.y=${byId.end.y} vs ${byId.B1.y + blockH.get('B1') + 64}`)
}

console.log('== 图B：同层并行（循环子树横向让位）==')
{
  const N = (id, type, w, h, x, y) => ({ id, type, w, h, x, y })
  const nodes = [
    N('start', 'START', 160, 54, 0, 0),
    N('B1', 'BATCH', 220, 190, 100, 0),
    N('hb', 'HTTP', 160, 54, 500, 0),
    N('end', 'END', 160, 54, 0, 0),
    N('h1', 'HTTP', 160, 54, 0, 400),
  ]
  const edges = [
    { source: 'start', target: 'B1', sh: 'out', th: 'in' },
    { source: 'start', target: 'hb', sh: 'out', th: 'in' },
    { source: 'B1', target: 'end', sh: 'out', th: 'in' },
    { source: 'hb', target: 'end', sh: 'out', th: 'in' },
    { source: 'B1', target: 'h1', sh: 'loop_start', th: 'in', loop: true },
    { source: 'h1', target: 'B1', sh: 'out', th: 'loop_end', loop: true },
  ]
  buildLayout(nodes, edges)()
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))
  const colRight = byId.B1.x + 220 + 56 + 160
  assert('B1 hb 让出 B1 循环列（列右缘+56）', byId.hb.x >= colRight + 56 - 0.6, `hb.x=${byId.hb.x} vs ${colRight + 56}`)
  assert('B2 hb 与循环成员卡片零重叠', !overlap(byId.hb, byId.h1))
  assert('B3 END 层在循环列底缘之下', byId.end.y >= byId.B1.y + 190 + 64 - 0.6)
}

console.log('== 图C：嵌套兄弟列级联（B2/B3 纵向并行、子列高）==')
{
  const N = (id, type, w, h, x, y) => ({ id, type, w, h, x, y })
  const nodes = [
    N('start', 'START', 160, 54, 0, 0),
    N('B1', 'BATCH', 220, 190, 0, 0),
    N('end', 'END', 160, 54, 0, 0),
    N('B2', 'BATCH', 220, 190, 0, 400),
    N('B3', 'BATCH', 220, 190, 0, 500),
    N('h2a', 'HTTP', 160, 54, 0, 600),
    N('h2b', 'HTTP', 160, 54, 0, 700),
    N('h2c', 'HTTP', 160, 54, 0, 800),
    N('h3a', 'BEAN', 160, 54, 0, 900),
    N('h3b', 'BEAN', 160, 54, 0, 950),
  ]
  const edges = [
    { source: 'start', target: 'B1', sh: 'out', th: 'in' },
    { source: 'B1', target: 'end', sh: 'out', th: 'in' },
    { source: 'B1', target: 'B2', sh: 'loop_start', th: 'in', loop: true },
    { source: 'B2', target: 'h2a', sh: 'loop_start', th: 'in', loop: true },
    { source: 'h2a', target: 'h2b', sh: 'out', th: 'in', loop: true },
    { source: 'h2b', target: 'h2c', sh: 'out', th: 'in', loop: true },
    { source: 'h2c', target: 'B2', sh: 'out', th: 'loop_end', loop: true },
    { source: 'B3', target: 'h3a', sh: 'loop_start', th: 'in', loop: true },
    { source: 'h3a', target: 'h3b', sh: 'out', th: 'in', loop: true },
    { source: 'h3b', target: 'B3', sh: 'out', th: 'loop_end', loop: true },
    { source: 'B2', target: 'B3', sh: 'out', th: 'in', loop: true },
    { source: 'B3', target: 'B1', sh: 'out', th: 'loop_end', loop: true },
  ]
  buildLayout(nodes, edges)()
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))
  const center = (n) => n.x + n.w / 2
  const b2ColBottom = byId.h2c.y + 54
  const b3ColTop = byId.h3a.y
  assert('C1 测试构造成立（兄弟子列纵向并行）', b3ColTop < b2ColBottom, `b2ColBottom=${b2ColBottom}, b3ColTop=${b3ColTop}`)
  assert('C2 B3 子列右移级联（轴 > B2 子列轴）', center(byId.h3a) > center(byId.h2a))
  assert('C3 B3 子列左缘 ≥ B2 子树最宽右缘+56', Math.min(byId.h3a.x, byId.h3b.x) >= Math.max(byId.h2a.x, byId.h2b.x, byId.h2c.x) + 160 + 56 - 0.6)
  let noOverlap = true, bad = ''
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++)
    if (overlap(nodes[i], nodes[j])) { noOverlap = false; bad = `${nodes[i].id}×${nodes[j].id}` }
  assert('C4 全图卡片零重叠', noOverlap, bad)
  assert('C5 B2 列链序自上而下', byId.h2b.y === byId.h2a.y + 110 && byId.h2c.y === byId.h2a.y + 220)
}

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
