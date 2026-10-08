/**
 * v4 循环列布局同构验证（镜像 LogicFlowDesigner.vue handleAutoLayout v4 @ 18:11:43 版）
 * 用户需求：① 循环连线节点从上至下排列、列中轴垂直居中对齐；
 *          ② 嵌套批处理从外层到内层自左向右排列。
 * 覆盖：双节点序（外层先/后）、三层嵌套、同层右邻让位、全局两两不重叠、层距安全。
 */
const LOOP_START_ANCHOR = 0.3
const BODY_COL_GAP_X = 56
const BODY_COL_GAP_Y = 56
const BODY_COL_ANCHOR_DROP = 24
const BODY_COL_NEST_MARGIN = 24

let pass = 0, fail = 0
function assert(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name} ${detail}`) }
}

function collectBodyChain(batchId, nodesById, edges) {
  const chain = []
  const loopEdges = edges.filter((e) => e.isLoop)
  const startEdge = loopEdges.find((e) => e.source === batchId && e.sourceHandle === 'loop_start')
  if (!startEdge) return chain
  const seen = new Set([batchId])
  let cur = startEdge.target, guard = 0
  while (cur && !seen.has(cur) && guard++ < 100) {
    seen.add(cur)
    const node = nodesById.get(cur)
    if (!node) break
    chain.push(cur)
    if (node.nodeType === 'BATCH') break
    const next = loopEdges.find((e) => e.source === cur)
    if (!next) break
    cur = next.target
  }
  return chain
}

function autoLayout(inputNodes, edges) {
  const nodes = inputNodes.map((n) => ({ ...n, position: { x: n.x, y: n.y } }))
  const nodesById = new Map(nodes.map((n) => [n.id, n]))
  const size = (n) => ({ w: n.w, h: n.h })
  const leftX = 80, colGapX = 56, topY = 60, layerGapY = 64

  // 1) 无条件收链
  const bodyOwner = new Map(), bodyChains = new Map()
  for (const n of nodes) {
    if (n.nodeType !== 'BATCH') continue
    const chain = collectBodyChain(n.id, nodesById, edges)
    if (!chain.length) continue
    bodyChains.set(n.id, chain)
    chain.forEach((id) => bodyOwner.set(id, n.id))
  }

  // 2) Kahn
  const mainIds = nodes.filter((n) => !bodyOwner.has(n.id)).map((n) => n.id)
  const idSet = new Set(mainIds)
  const depth = new Map(), indegree = new Map(), out = new Map()
  mainIds.forEach((id) => { indegree.set(id, 0); out.set(id, []) })
  edges.forEach((e) => {
    if (e.isLoop) return
    if (idSet.has(e.source) && idSet.has(e.target)) {
      out.get(e.source).push(e.target)
      indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1)
    }
  })
  let queue = mainIds.filter((id) => (indegree.get(id) ?? 0) === 0)
  const startId = nodes.find((n) => n.nodeType === 'START')?.id
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
    const self = size(nodesById.get(id)).h
    if (stack.has(id)) return self
    stack.add(id)
    let h = self
    const chain = bodyChains.get(id)
    if (chain?.length) {
      const colTop = self * LOOP_START_ANCHOR + BODY_COL_ANCHOR_DROP
      let offset = 0, deepest = 0
      for (const cid of chain) {
        const cn = nodesById.get(cid)
        const cardH = cn ? size(cn).h : 0
        deepest = Math.max(deepest, offset + (cn?.nodeType === 'BATCH' ? blockHeight(cid, stack) : cardH))
        offset += cardH + BODY_COL_GAP_Y
      }
      h = Math.max(self, colTop + deepest)
    }
    stack.delete(id)
    blockH.set(id, h)
    return h
  }
  mainIds.forEach((id) => blockHeight(id))

  // 3b) colSubtreeW
  const colW = new Map()
  function colSubtreeW(id, stack = new Set()) {
    if (colW.has(id)) return colW.get(id)
    const chain = bodyChains.get(id)
    if (!chain?.length) return 0
    if (stack.has(id)) return 0
    stack.add(id)
    const colMaxW = Math.max(...chain.map((cid) => size(nodesById.get(cid)).w))
    let extent = colMaxW
    let prevRight = -Infinity
    for (const cid of chain) {
      const cn = nodesById.get(cid)
      if (!cn || cn.nodeType !== 'BATCH') continue
      const nestLeftRel = Math.max(
        (colMaxW + size(cn).w) / 2 + BODY_COL_GAP_X,
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

  // 4) layers
  const byLayer = new Map()
  mainIds.forEach((id) => {
    const layer = depth.get(id) ?? 0
    if (!byLayer.has(layer)) byLayer.set(layer, [])
    byLayer.get(layer).push(nodesById.get(id))
  })
  const layerCenter = new Map(), bandBottoms = new Map()
  let cursorY = topY
  const layers = [...byLayer.entries()].sort((a, b) => a[0] - b[0])
  layers.forEach(([layer, list]) => {
    const maxCardH = Math.max(...list.map((n) => size(n).h))
    const center = cursorY + maxCardH / 2
    layerCenter.set(layer, center)
    let bandBottom = center + maxCardH / 2
    list.forEach((n) => { bandBottom = Math.max(bandBottom, center - size(n).h / 2 + blockHeight(n.id)) })
    bandBottoms.set(layer, bandBottom)
    cursorY = bandBottom + layerGapY
  })
  layers.forEach(([layer, list]) => {
    const center = layerCenter.get(layer)
    list.sort((a, b) => a.position.x - b.position.x)
    let cursorX = leftX
    list.forEach((n) => {
      const s = size(n)
      n.position = { x: Math.round(cursorX), y: Math.round(center - s.h / 2) }
      const subtreeW = colSubtreeW(n.id)
      cursorX += s.w + (subtreeW > 0 ? BODY_COL_GAP_X + subtreeW + colGapX : colGapX)
    })
  })

  // 5) placeChain
  const placed = new Set()
  function placeChain(batchId, minLeftX) {
    if (placed.has(batchId)) return minLeftX
    placed.add(batchId)
    const chain = bodyChains.get(batchId)
    const batch = nodesById.get(batchId)
    if (!chain?.length || !batch) return minLeftX
    const bSize = size(batch)
    const colMaxW = Math.max(...chain.map((cid) => size(nodesById.get(cid)).w))
    const axisX = minLeftX + colMaxW / 2
    let cursorY2 = batch.position.y + bSize.h * LOOP_START_ANCHOR + BODY_COL_ANCHOR_DROP
    let subtreeRight = axisX + colMaxW / 2
    let prevNestRight = -Infinity
    chain.forEach((cid) => {
      const cn = nodesById.get(cid)
      if (!cn) return
      const s = size(cn)
      cn.position = { x: Math.round(axisX - s.w / 2), y: Math.round(cursorY2) }
      cursorY2 += s.h + BODY_COL_GAP_Y
      if (cn.nodeType === 'BATCH') {
        const nestLeft = Math.max(
          cn.position.x + s.w + BODY_COL_GAP_X,
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
    placeChain(batchId, batch.position.x + size(batch).w + BODY_COL_GAP_X)
  }
  return { nodesById, bodyChains, bodyOwner, depth, blockH, colW, bandBottoms }
}

function aabb(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}
function box(n) { return { x: n.position.x, y: n.position.y, w: n.w, h: n.h } }

/** 通用断言组：列中轴/纵序锚距/嵌套左界/全局不重叠/层距 */
function commonChecks(tag, r, edges, batchIds) {
  const N = r.nodesById
  // 嵌套链已收集（顺序依赖回归）
  for (const bid of batchIds) {
    assert(`[${tag}] ${bid} 的循环链已收集`, r.bodyChains.has(bid))
  }
  // 列中轴垂直居中 + 纵序锚距
  for (const bid of batchIds) {
    const chain = r.bodyChains.get(bid)
    if (!chain) continue
    const cxs = chain.map((id) => N.get(id).position.x + N.get(id).w / 2)
    assert(`[${tag}] ${bid} 列成员共享列中轴（垂直居中对齐）`, new Set(cxs).size === 1, JSON.stringify(cxs))
    const ys = chain.map((id) => N.get(id).position.y)
    const hs = chain.map((id) => N.get(id).h)
    const expY0 = N.get(bid).position.y + N.get(bid).h * LOOP_START_ANCHOR + BODY_COL_ANCHOR_DROP
    assert(`[${tag}] ${bid} 列首锚定 loop_start 线下方 24`, Math.abs(ys[0] - expY0) < 1, `y0=${ys[0]} exp=${expY0}`)
    let ok = true
    for (let i = 1; i < chain.length; i++) if (Math.abs(ys[i] - (ys[i - 1] + hs[i - 1] + BODY_COL_GAP_Y)) > 1) ok = false
    assert(`[${tag}] ${bid} 列链序自上而下、纵距 56`, ok, JSON.stringify(ys))
  }
  // 嵌套列从外到内左→右
  for (const bid of batchIds) {
    const chain = r.bodyChains.get(bid) ?? []
    for (const cid of chain) {
      const cn = N.get(cid)
      if (!cn || cn.nodeType !== 'BATCH' || !r.bodyChains.has(cid)) continue
      const hostChain = r.bodyChains.get(bid)
      const hostColMaxW = Math.max(...hostChain.map((id) => N.get(id).w))
      const hostAxis = Math.min(...hostChain.map((id) => N.get(id).position.x)) + hostColMaxW / 2
      const childLeft = Math.min(...r.bodyChains.get(cid).map((id) => N.get(id).position.x))
      const childAxis = r.bodyChains.get(cid).reduce((s, id) => s + N.get(id).position.x + N.get(id).w / 2, 0) / r.bodyChains.get(cid).length
      assert(`[${tag}] ${cid} 子列左缘 ≥ 子卡右缘+56`, childLeft >= cn.position.x + cn.w + BODY_COL_GAP_X - 0.5, `${childLeft} vs ${cn.position.x + cn.w + 56}`)
      assert(`[${tag}] ${cid} 子列左缘 ≥ 宿主列右缘+24`, childLeft >= hostAxis + hostColMaxW / 2 + BODY_COL_NEST_MARGIN - 0.5, `${childLeft} vs ${hostAxis + hostColMaxW / 2 + 24}`)
      assert(`[${tag}] ${cid} 子列中轴在宿主列中轴右侧（外→内=左→右）`, childAxis > hostAxis)
    }
  }
  // 全局两两不重叠
  const all = [...N.values()]
  let clash = null
  for (let i = 0; i < all.length && !clash; i++)
    for (let j = i + 1; j < all.length; j++)
      if (aabb(box(all[i]), box(all[j]))) { clash = `${all[i].id}×${all[j].id}`; break }
  assert(`[${tag}] 全局两两不重叠`, !clash, clash ?? '')
  // blockHeight 覆盖循环闭包最深底缘
  for (const bid of batchIds) {
    if (!r.bodyChains.has(bid)) continue
    const closure = new Set()
    const walk = (id) => { for (const c of r.bodyChains.get(id) ?? []) if (!closure.has(c)) { closure.add(c); if ((N.get(c)?.nodeType === 'BATCH')) walk(c) } }
    walk(bid)
    const deepestBottom = Math.max(...[...closure].map((id) => N.get(id).position.y + N.get(id).h))
    const a = N.get(bid)
    assert(`[${tag}] blockHeight(${bid}) 覆盖闭包最深底缘`, r.blockH.get(bid) >= deepestBottom - a.position.y - 0.5, `bh=${r.blockH.get(bid)} need=${deepestBottom - a.position.y}`)
  }
}

// ============ G1a: 两层嵌套，外层 A 先入列（DSL parse 后的典型序）============
console.log('\n== G1a 两层嵌套 · 外层先入列 ==')
function g1Nodes(order) {
  const defs = {
    S: { id: 'S', nodeType: 'START', x: 300, y: 60, w: 160, h: 54 },
    A: { id: 'A', nodeType: 'BATCH', x: 300, y: 200, w: 180, h: 90 },
    E: { id: 'E', nodeType: 'END', x: 300, y: 500, w: 160, h: 54 },
    n1: { id: 'n1', nodeType: 'HTTP', x: 600, y: 300, w: 160, h: 54 },
    n2: { id: 'n2', nodeType: 'SQL', x: 800, y: 300, w: 200, h: 80 },
    B: { id: 'B', nodeType: 'BATCH', x: 1000, y: 300, w: 180, h: 90 },
    p1: { id: 'p1', nodeType: 'HTTP', x: 1200, y: 300, w: 160, h: 54 },
    p2: { id: 'p2', nodeType: 'SQL', x: 1400, y: 300, w: 220, h: 70 },
  }
  return order.map((id) => defs[id])
}
const g1Edges = [
  { source: 'S', target: 'A', isLoop: false },
  { source: 'A', target: 'E', isLoop: false },
  { source: 'A', target: 'n1', sourceHandle: 'loop_start', isLoop: true },
  { source: 'n1', target: 'n2', isLoop: true },
  { source: 'n2', target: 'B', isLoop: true },
  { source: 'B', target: 'p1', sourceHandle: 'loop_start', isLoop: true },
  { source: 'p1', target: 'p2', isLoop: true },
  { source: 'p2', target: 'B', targetHandle: 'loop_end', isLoop: true },
  { source: 'B', target: 'E', isLoop: false },
]
commonChecks('G1a', autoLayout(g1Nodes(['S', 'A', 'E', 'n1', 'n2', 'B', 'p1', 'p2']), g1Edges), g1Edges, ['A', 'B'])

// ============ G1b: 同图，内层 B 先入列 ============
console.log('\n== G1b 两层嵌套 · 内层先入列 ==')
commonChecks('G1b', autoLayout(g1Nodes(['S', 'E', 'B', 'p1', 'p2', 'A', 'n1', 'n2']), g1Edges), g1Edges, ['A', 'B'])

// ============ G2: 同层右邻让位 ============
console.log('\n== G2 同层右邻让位 ==')
{
  const nodes = [
    { id: 'S', nodeType: 'START', x: 300, y: 60, w: 160, h: 54 },
    { id: 'A', nodeType: 'BATCH', x: 300, y: 200, w: 180, h: 90 },
    { id: 'T', nodeType: 'SQL', x: 700, y: 200, w: 160, h: 120 },
    { id: 'n1', nodeType: 'HTTP', x: 600, y: 400, w: 160, h: 54 },
    { id: 'n2', nodeType: 'SQL', x: 800, y: 400, w: 200, h: 80 },
  ]
  const edges = [
    { source: 'S', target: 'A', isLoop: false },
    { source: 'S', target: 'T', isLoop: false },
    { source: 'A', target: 'n1', sourceHandle: 'loop_start', isLoop: true },
    { source: 'n1', target: 'n2', isLoop: true },
    { source: 'n2', target: 'A', targetHandle: 'loop_end', isLoop: true },
  ]
  const r = autoLayout(nodes, edges)
  const N = r.nodesById
  const t = N.get('T')
  const colRight = Math.max(...r.bodyChains.get('A').map((id) => N.get(id).position.x + N.get(id).w))
  assert('[G2] 循环列与同层右邻无重叠且留距 ≥56', t.position.x >= colRight + BODY_COL_GAP_X - 0.5, `T.x=${t.position.x} colRight=${colRight}`)
  commonChecks('G2', r, edges, ['A'])
}

// ============ G4: 三层嵌套 A⊃B⊃C + 同层右邻 ============
console.log('\n== G4 三层嵌套 + 同层右邻 ==')
{
  const nodes = [
    { id: 'S', nodeType: 'START', x: 300, y: 60, w: 160, h: 54 },
    { id: 'A', nodeType: 'BATCH', x: 300, y: 200, w: 180, h: 90 },
    { id: 'T', nodeType: 'SQL', x: 700, y: 200, w: 160, h: 120 },
    { id: 'E', nodeType: 'END', x: 300, y: 700, w: 160, h: 54 },
    { id: 'a1', nodeType: 'HTTP', x: 600, y: 300, w: 160, h: 54 },
    { id: 'a2', nodeType: 'SQL', x: 800, y: 300, w: 200, h: 80 },
    { id: 'B', nodeType: 'BATCH', x: 1000, y: 300, w: 200, h: 90 },
    { id: 'b1', nodeType: 'HTTP', x: 1200, y: 300, w: 160, h: 54 },
    { id: 'C', nodeType: 'BATCH', x: 1400, y: 300, w: 180, h: 90 },
    { id: 'c1', nodeType: 'SQL', x: 1600, y: 300, w: 220, h: 70 },
  ]
  const edges = [
    { source: 'S', target: 'A', isLoop: false },
    { source: 'S', target: 'T', isLoop: false },
    { source: 'A', target: 'E', isLoop: false },
    { source: 'A', target: 'a1', sourceHandle: 'loop_start', isLoop: true },
    { source: 'a1', target: 'a2', isLoop: true },
    { source: 'a2', target: 'B', isLoop: true },
    { source: 'B', target: 'b1', sourceHandle: 'loop_start', isLoop: true },
    { source: 'b1', target: 'C', isLoop: true },
    { source: 'C', target: 'c1', sourceHandle: 'loop_start', isLoop: true },
    { source: 'c1', target: 'C', targetHandle: 'loop_end', isLoop: true },
    { source: 'C', target: 'B', targetHandle: 'loop_end', isLoop: true },
    { source: 'B', target: 'A', targetHandle: 'loop_end', isLoop: true },
  ]
  const r = autoLayout(nodes, edges)
  const N = r.nodesById
  const axisA = r.bodyChains.get('A').reduce((s, id) => s + N.get(id).position.x + N.get(id).w / 2, 0) / 3
  const axisB = r.bodyChains.get('B').reduce((s, id) => s + N.get(id).position.x + N.get(id).w / 2, 0) / 2
  const axisC = N.get('c1').position.x + N.get('c1').w / 2
  assert('[G4] 三层列中轴严格递增（外→内 = 左→右）', axisA < axisB && axisB < axisC, `${axisA} < ${axisB} < ${axisC}`)
  const t = N.get('T')
  const subtreeRight = Math.max(...[...r.bodyChains.get('A'), ...r.bodyChains.get('B'), 'B', ...r.bodyChains.get('C'), 'C'].map((id) => N.get(id).position.x + N.get(id).w))
  assert('[G4] 同层右邻为整棵循环子树让位 ≥56', t.position.x >= subtreeRight + BODY_COL_GAP_X - 0.5, `T.x=${t.position.x} subtreeRight=${subtreeRight}`)
  commonChecks('G4', r, edges, ['A', 'B', 'C'])
}

// ============ G3: 单成员循环列 ============
console.log('\n== G3 单成员循环列 ==')
{
  const nodes = [
    { id: 'S', nodeType: 'START', x: 300, y: 60, w: 160, h: 54 },
    { id: 'A', nodeType: 'BATCH', x: 300, y: 200, w: 180, h: 90 },
    { id: 'E', nodeType: 'END', x: 300, y: 400, w: 160, h: 54 },
    { id: 'n1', nodeType: 'HTTP', x: 600, y: 300, w: 160, h: 54 },
  ]
  const edges = [
    { source: 'S', target: 'A', isLoop: false },
    { source: 'A', target: 'E', isLoop: false },
    { source: 'A', target: 'n1', sourceHandle: 'loop_start', isLoop: true },
    { source: 'n1', target: 'A', targetHandle: 'loop_end', isLoop: true },
  ]
  const r = autoLayout(nodes, edges)
  const N = r.nodesById
  const m = N.get('n1')
  const a = N.get('A')
  assert('[G3] 单成员列中轴 = 卡右缘+56+半宽', Math.abs(m.position.x + m.w / 2 - (a.position.x + a.w + BODY_COL_GAP_X + m.w / 2)) < 1)
  assert('[G3] 单成员列首锚 = 卡顶+30%+24', Math.abs(m.position.y - (a.position.y + 27 + 24)) < 1)
  commonChecks('G3', r, edges, ['A'])
}

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
