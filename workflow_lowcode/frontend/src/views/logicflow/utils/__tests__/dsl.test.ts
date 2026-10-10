import { describe, it, expect } from 'vitest'
import {
  parseDsl,
  serializeDsl,
  createNodeId,
  defaultConfig,
  defaultNodeName,
  isDslEqual,
} from '../dsl'
import type { FlowNode, FlowEdge } from '../dsl'

/** 构造画布节点的便捷工厂 */
function makeNode(
  id: string,
  nodeType: FlowNode['data']['nodeType'],
  x = 0,
  y = 0,
  extra: Partial<FlowNode['data']> = {}
): FlowNode {
  return {
    id,
    type: 'logic',
    position: { x, y },
    data: { nodeType, name: defaultNodeName(nodeType), ...extra },
  }
}

function makeEdge(id: string, source: string, target: string, branch?: 'true' | 'false'): FlowEdge {
  return { id, source, target, data: branch ? { branch } : undefined }
}

describe('parseDsl', () => {
  it('解析完整 DSL：节点位置/配置/元数据与边 branch 均正确映射到画布结构', () => {
    const dsl = JSON.stringify({
      nodes: [
        { id: 'start_1', type: 'START', name: '开始', x: 100, y: 80 },
        {
          id: 'http_1',
          type: 'HTTP',
          name: '调用风控',
          x: 220,
          y: 160,
          config: { url: 'http://a/b', method: 'POST', headers: { 'X-Token': 't' }, queryParams: [], bodyParams: [], connTimeoutMs: 3000, readTimeoutMs: 5000, retryCount: 1 },
          results: [{ name: 'risk', mode: 'WHOLE' }],
          errorAction: 'IGNORE_CONTINUE',
        },
        {
          id: 'cond_1',
          type: 'CONDITION',
          name: '风控通过?',
          x: 340,
          y: 240,
          config: { variable: 'risk', operator: 'EQ', value: 'PASS' },
        },
        { id: 'end_1', type: 'END', name: '结束', x: 460, y: 320 },
      ],
      edges: [
        { id: 'e1', source: 'start_1', target: 'http_1' },
        { source: 'http_1', target: 'cond_1' },
        { id: 'e2', source: 'cond_1', target: 'end_1', branch: 'true' },
        { source: 'cond_1', target: 'end_1', branch: 'false' },
      ],
    })

    const graph = parseDsl(dsl)
    expect(graph.nodes).toHaveLength(4)
    expect(graph.edges).toHaveLength(4)

    const start = graph.nodes[0]
    expect(start.id).toBe('start_1')
    expect(start.type).toBe('logic')
    expect(start.position).toEqual({ x: 100, y: 80 })
    expect(start.data.nodeType).toBe('START')
    expect(start.data.name).toBe('开始')

    const http = graph.nodes[1]
    expect(http.data.nodeType).toBe('HTTP')
    expect(http.data.results).toEqual([{ name: 'risk', mode: 'WHOLE', type: 'string' }])
    expect(http.data.errorAction).toBe('IGNORE_CONTINUE')
    expect(http.data.config).toMatchObject({ url: 'http://a/b', method: 'POST' })

    const cond = graph.nodes[2]
    expect(cond.data.nodeType).toBe('CONDITION')
    expect(cond.data.config).toMatchObject({ variable: 'risk', operator: 'EQ', value: 'PASS' })

    // 边：branch 保留到 edge.data.branch；缺 id 自动补；branch 缺省不写 data.branch
    expect(graph.edges[0].id).toBe('e1')
    expect(graph.edges[0].data).toBeUndefined()
    expect(graph.edges[1].id).toBeTruthy()
    expect(graph.edges[2].data).toEqual({ branch: 'true' })
    expect(graph.edges[3].data).toEqual({ branch: 'false' })
    // branch → sourceHandle：vue-flow 依 sourceHandle 定位真/假连接点，缺失会兜底连到「真」
    expect(graph.edges[2].sourceHandle).toBe('true')
    expect(graph.edges[3].sourceHandle).toBe('false')
    expect(graph.edges[0].sourceHandle).toBeUndefined()
  })

  it('缺失字段容错：无 name 补默认名，无 x/y 回 0，非六类 type 归一为 HTTP', () => {
    const graph = parseDsl(
      JSON.stringify({
        nodes: [{ id: 'n1', type: 'weird' }, { type: 'END' }],
        edges: [],
      })
    )
    expect(graph.nodes[0].data.nodeType).toBe('HTTP')
    expect(graph.nodes[0].data.name).toBe(defaultNodeName('HTTP'))
    expect(graph.nodes[0].position).toEqual({ x: 0, y: 0 })
    expect(graph.nodes[1].id).toBeTruthy()
    expect(graph.nodes[1].data.nodeType).toBe('END')
  })

  it('非法 JSON 抛错并带原因', () => {
    expect(() => parseDsl('{ not json')).toThrow(/JSON/)
    expect(() => parseDsl('[1,2,3]')).toThrow(/结构不符/)
    expect(() => parseDsl('null')).toThrow(/结构不符/)
  })

  it('nodes/edges 缺省按空数组处理；source/target 缺失的边被过滤', () => {
    const graph = parseDsl(JSON.stringify({ nodes: [], edges: [{ source: 'a' }, { target: 'b' }] }))
    expect(graph.nodes).toEqual([])
    expect(graph.edges).toEqual([])
  })
})

describe('serializeDsl', () => {
  it('只保留契约字段，剥离 vue-flow 内部字段', () => {
    const nodes: FlowNode[] = [
      makeNode('start_1', 'START', 120, 60),
      makeNode('http_1', 'HTTP', 240, 140, {
        config: defaultConfig('HTTP'),
        results: [{ name: 'risk', mode: 'WHOLE', type: 'string' }],
        errorAction: 'IGNORE_CONTINUE',
      }),
      makeNode('end_1', 'END', 360, 220),
    ]
    // 模拟 vue-flow 回写：节点对象带上内部字段也不影响序列化
    const vueFlowPolluted = {
      ...nodes[1],
      dimensions: { width: 200, height: 60 },
      selected: true,
      handleBounds: { source: [], target: [] },
      computedPosition: { x: 240, y: 140, z: 0 },
    } as unknown as FlowNode

    const edges: FlowEdge[] = [makeEdge('e1', 'start_1', 'http_1')]

    const parsed = JSON.parse(serializeDsl([nodes[0], vueFlowPolluted, nodes[2]], edges))
    expect(Object.keys(parsed)).toEqual(['nodes', 'edges'])
    expect(Object.keys(parsed.nodes[1]).sort()).toEqual(
      ['config', 'errorAction', 'id', 'name', 'results', 'type', 'x', 'y'].sort()
    )
    expect(parsed.nodes[1].x).toBe(240)
    expect(parsed.nodes[1].results).toEqual([{ name: 'risk', mode: 'WHOLE', type: 'string' }])
    expect(parsed.nodes[1].errorAction).toBe('IGNORE_CONTINUE')
    expect(parsed.edges[0]).toEqual({ id: 'e1', source: 'start_1', target: 'http_1' })
  })

  it('START/END/CONDITION 节点不输出 errorAction（results 未声明也不输出）', () => {
    const nodes: FlowNode[] = [
      makeNode('cond_1', 'CONDITION', 0, 0, { errorAction: 'FAIL_FLOW' }),
    ]
    const parsed = JSON.parse(serializeDsl(nodes, []))
    expect(parsed.nodes[0].results).toBeUndefined()
    expect(parsed.nodes[0].errorAction).toBeUndefined()
  })

  it('DSL 往返：serialize → parse → serialize 结果稳定', () => {
    const nodes: FlowNode[] = [
      makeNode('start_1', 'START', 100, 80),
      makeNode('bean_1', 'BEAN', 220, 160, {
        config: { beanName: 'demoService', methodName: 'query', params: [{ source: 'a', target: 'b' }] },
        results: [{ name: 'beanOut', mode: 'WHOLE', type: 'string' }],
        errorAction: 'FAIL_FLOW',
      }),
      makeNode('script_1', 'SCRIPT', 340, 240, {
        config: { language: 'groovy', source: "return 'ok'" },
        results: [{ name: 's', mode: 'WHOLE', type: 'string' }],
        errorAction: 'IGNORE_CONTINUE',
      }),
      makeNode('cond_1', 'CONDITION', 460, 320, {
        config: { variable: 's', operator: 'NOT_EMPTY' },
      }),
      makeNode('end_1', 'END', 580, 400),
    ]
    const edges: FlowEdge[] = [
      makeEdge('e1', 'start_1', 'bean_1'),
      makeEdge('e2', 'bean_1', 'cond_1'),
      makeEdge('e3', 'cond_1', 'script_1', 'true'),
      makeEdge('e4', 'cond_1', 'end_1', 'false'),
    ]

    const first = serializeDsl(nodes, edges)
    const graph = parseDsl(first)
    const second = serializeDsl(graph.nodes, graph.edges)
    expect(isDslEqual(first, second)).toBe(true)

    // branch 语义在往返中不丢失
    const reparsed = JSON.parse(second)
    const condOut = reparsed.edges.filter((e: { source: string }) => e.source === 'cond_1')
    expect(condOut.map((e: { branch?: string }) => e.branch).sort()).toEqual(['false', 'true'])
  })

  it('CONDITION 边：serialize 优先按 sourceHandle 定 branch，data.branch 作后备', () => {
    const cond = makeNode('cond_1', 'CONDITION', 0, 0, {
      config: { variable: 'x', operator: 'EQ', value: '1' },
    })
    const end = makeNode('end_1', 'END', 200, 100)

    // 场景一：边被拖动重连后 sourceHandle='false' 而 data.branch 仍是旧值 'true' → 以 handle 为准
    const stale = serializeDsl(
      [cond, end],
      [{ id: 'e1', source: 'cond_1', target: 'end_1', sourceHandle: 'false', data: { branch: 'true' } }]
    )
    expect(JSON.parse(stale).edges[0].branch).toBe('false')

    // 场景二：只有 data.branch（旧数据形态）→ 后备生效
    const legacy = serializeDsl(
      [cond, end],
      [{ id: 'e2', source: 'cond_1', target: 'end_1', data: { branch: 'false' } }]
    )
    expect(JSON.parse(legacy).edges[0].branch).toBe('false')

    // 场景三：无 branch 语义的普通出边 → 不输出 branch
    const plain = serializeDsl([cond, end], [{ id: 'e3', source: 'cond_1', target: 'end_1' }])
    expect(JSON.parse(plain).edges[0].branch).toBeUndefined()
  })

  it('坐标取整：小数位置序列化为整数', () => {
    const node = makeNode('http_1', 'HTTP', 100.4, 60.6, { config: defaultConfig('HTTP') })
    const parsed = JSON.parse(serializeDsl([node], []))
    expect(parsed.nodes[0].x).toBe(100)
    expect(parsed.nodes[0].y).toBe(61)
  })

  it('空画布序列化为空结构', () => {
    expect(JSON.parse(serializeDsl([], []))).toEqual({ nodes: [], edges: [] })
  })
})

describe('createNodeId', () => {
  it('生成前缀_短码格式，且不与现有 id 冲突', () => {
    const existing = ['http_aaa', 'http_bbb', 'end_x']
    const id = createNodeId('HTTP', existing)
    expect(id).toMatch(/^http_[a-z0-9]+$/)
    expect(existing).not.toContain(id)
  })

  it('随机撞码时重试直至唯一', () => {
    const taken = new Set<string>()
    const ids = new Set<string>()
    for (let i = 0; i < 50; i++) {
      const id = createNodeId('SCRIPT', taken)
      expect(taken.has(id)).toBe(false)
      taken.add(id)
      ids.add(id)
    }
    expect(ids.size).toBe(50)
  })
})

describe('isDslEqual', () => {
  it('相同内容不同键序视为相等；不同内容不等；非法 JSON 不等', () => {
    expect(isDslEqual('{"a":1,"b":2}', '{"b":2,"a":1}')).toBe(true)
    expect(isDslEqual('{"a":1}', '{"a":2}')).toBe(false)
    expect(isDslEqual('{bad', '{"a":1}')).toBe(false)
  })
})

describe('BATCH 批处理节点', () => {
  it('BATCH 属合法类型：parse 保留 config 与 results，默认名为批处理', () => {
    const graph = parseDsl(
      JSON.stringify({
        nodes: [
          {
            id: 'batch_1',
            type: 'BATCH',
            name: '批量通知',
            x: 300,
            y: 120,
            config: {
              collection: '{{users}}',
              itemVar: 'user',
              indexVar: 'i',
              actionType: 'HTTP',
              actionConfig: { url: 'https://x/api?to={{user}}', method: 'POST' },
              stopOnError: false,
              maxItems: 50,
            },
            results: [{ name: 'notifyOut', mode: 'WHOLE' }],
          },
        ],
        edges: [],
      })
    )
    expect(graph.nodes[0].data.nodeType).toBe('BATCH')
    expect(graph.nodes[0].data.name).toBe('批量通知')
    expect(graph.nodes[0].data.config).toMatchObject({ actionType: 'HTTP', itemVar: 'user', maxItems: 50 })
    expect(graph.nodes[0].data.results).toEqual([{ name: 'notifyOut', mode: 'WHOLE', type: 'string' }])
  })

  it('BATCH 序列化输出 results/errorAction（业务执行节点语义）；新默认 config 无 legacy 动作', () => {
    const nodes: FlowNode[] = [
      makeNode('batch_1', 'BATCH', 300, 120, {
        config: defaultConfig('BATCH'),
        results: [{ name: 'out', mode: 'WHOLE', type: 'json' }],
        errorAction: 'FAIL_FLOW',
      }),
    ]
    const parsed = JSON.parse(serializeDsl(nodes, []))
    expect(parsed.nodes[0].type).toBe('BATCH')
    expect(parsed.nodes[0].results).toEqual([{ name: 'out', mode: 'WHOLE', type: 'json' }])
    expect(parsed.nodes[0].errorAction).toBe('FAIL_FLOW')
    expect(parsed.nodes[0].config).toMatchObject({
      collection: '',
      itemVar: 'item',
      indexVar: 'index',
      body: [],
      stopOnError: true,
      maxItems: 100,
    })
    expect(parsed.nodes[0].config.actionType).toBeUndefined()
  })

  it('BATCH DSL 往返：legacy 单动作首次保存升级为 body 形态后稳定', () => {
    const nodes: FlowNode[] = [
      makeNode('start_1', 'START', 100, 80),
      makeNode('batch_1', 'BATCH', 300, 160, {
        config: {
          collection: '[1,2,3]',
          itemVar: 'n',
          indexVar: 'i',
          actionType: 'SCRIPT',
          actionConfig: { language: 'groovy', source: 'return n * 2' },
          stopOnError: true,
          maxItems: 10,
        },
        results: [{ name: 'doubled', mode: 'WHOLE' }],
      }),
    ]
    const edges: FlowEdge[] = [makeEdge('e1', 'start_1', 'batch_1')]
    const once = serializeDsl(nodes, edges) // 画布无循环边：legacy 原样保留
    expect(JSON.parse(once).nodes[1].config.actionType).toBe('SCRIPT')
    const graph1 = parseDsl(once) // legacy 合成单节点循环体
    const twice = serializeDsl(graph1.nodes, graph1.edges) // 升级为 body 形态
    const upgraded = JSON.parse(twice).nodes.find((n: { id: string }) => n.id === 'batch_1')
    expect(upgraded.config.actionType).toBeUndefined()
    expect(upgraded.config.body).toHaveLength(1)
    expect(upgraded.config.body[0]).toMatchObject({ type: 'SCRIPT', name: 'Groovy 脚本' })
    const graph2 = parseDsl(twice)
    const thrice = serializeDsl(graph2.nodes, graph2.edges)
    expect(isDslEqual(twice, thrice)).toBe(true) // body 形态往返稳定
  })

  it('parse：BATCH config.body 合成循环体节点与闭合循环连线', () => {
    const graph = parseDsl(
      JSON.stringify({
        nodes: [
          {
            id: 'batch_1',
            type: 'BATCH',
            name: '批处理',
            x: 300,
            y: 80,
            config: {
              collection: '{{items}}',
              itemVar: 'item',
              indexVar: 'index',
              stopOnError: true,
              maxItems: 100,
              body: [
                { id: 'step_a', type: 'SCRIPT', name: '脚本', config: { language: 'groovy', source: 'return item' } },
                { id: 'step_b', type: 'DATA_UPDATE', name: '改库存', config: { table: 'wf_biz_t', setOps: [{ column: 'c', mode: 'ADD', value: '1' }], where: [] } },
              ],
            },
          },
        ],
        edges: [],
      })
    )
    const ids = graph.nodes.map((n) => n.id)
    expect(ids).toContain('batch_1')
    expect(ids).toContain('step_a')
    expect(ids).toContain('step_b')
    // 循环链：loop_start→step_a→step_b→loop_end
    const loopEdges = graph.edges.filter((e) => e.data?.loop === true)
    expect(loopEdges).toHaveLength(3)
    expect(loopEdges.every((e) => e.type === 'smoothstep' && e.deletable === undefined)).toBe(true)
    const chain = loopEdges.map((e) => [e.source, e.target, e.sourceHandle, e.targetHandle])
    expect(chain).toContainEqual(['batch_1', 'step_a', 'loop_start', 'in'])
    expect(chain).toContainEqual(['step_a', 'step_b', 'out', 'in'])
    expect(chain).toContainEqual(['step_b', 'batch_1', 'out', 'loop_end'])
    // 合成节点位置：批处理下方横排
    const a = graph.nodes.find((n) => n.id === 'step_a')!
    const b = graph.nodes.find((n) => n.id === 'step_b')!
    expect(a.position.y).toBe(210)
    expect(b.position.x).toBeGreaterThan(a.position.x)
  })

  it('parse：BATCH 无 body 无 actionType 时合成 loop_start→loop_end 直连空循环', () => {
    const graph = parseDsl(
      JSON.stringify({
        nodes: [{ id: 'batch_1', type: 'BATCH', name: '批处理', x: 0, y: 0, config: { collection: '', stopOnError: true, maxItems: 100 } }],
        edges: [],
      })
    )
    expect(graph.nodes).toHaveLength(1)
    const loopEdges = graph.edges.filter((e) => e.data?.loop === true)
    expect(loopEdges).toHaveLength(1)
    expect(loopEdges[0]).toMatchObject({
      source: 'batch_1',
      target: 'batch_1',
      sourceHandle: 'loop_start',
      targetHandle: 'loop_end',
      // 自环走自定义 'loop' 边（右侧 U 形外凸，LoopEdge.vue），链段仍是 smoothstep
      type: 'loop',
    })
  })

  it('serialize：循环体链编入 config.body，loop 边与链上节点不进契约', () => {
    const nodes: FlowNode[] = [
      makeNode('start_1', 'START', 100, 80),
      makeNode('batch_1', 'BATCH', 300, 80, {
        config: { ...defaultConfig('BATCH'), collection: '{{items}}' },
      }),
      makeNode('batch_1__b0', 'SCRIPT', 260, 210, {
        config: { language: 'groovy', source: 'return item' },
        results: [{ name: 'r0', mode: 'WHOLE', type: 'string' }],
      }),
      makeNode('batch_1__b1', 'DATA_UPDATE', 440, 210, {
        config: { table: 'wf_biz_t', setOps: [{ column: 'c', mode: 'SET', value: '1' }], where: [] },
      }),
      makeNode('end_1', 'END', 560, 80),
    ]
    const loopEdge = (id: string, source: string, target: string, sh?: string, th?: string): FlowEdge => ({
      id,
      source,
      target,
      sourceHandle: sh,
      targetHandle: th,
      data: { loop: true },
    })
    const edges: FlowEdge[] = [
      makeEdge('e1', 'start_1', 'batch_1'),
      makeEdge('e2', 'batch_1', 'end_1'),
      loopEdge('l1', 'batch_1', 'batch_1__b0', 'loop_start', 'in'),
      loopEdge('l2', 'batch_1__b0', 'batch_1__b1', 'out', 'in'),
      loopEdge('l3', 'batch_1__b1', 'batch_1', 'out', 'loop_end'),
    ]
    const dsl = JSON.parse(serializeDsl(nodes, edges))
    const batch = dsl.nodes.find((n: { id: string }) => n.id === 'batch_1')
    expect(batch.config.body).toHaveLength(2)
    expect(batch.config.body[0]).toMatchObject({ id: 'batch_1__b0', type: 'SCRIPT', results: [{ name: 'r0', mode: 'WHOLE', type: 'string' }] })
    expect(batch.config.body[1]).toMatchObject({ id: 'batch_1__b1', type: 'DATA_UPDATE' })
    expect(batch.config.actionType).toBeUndefined()
    // 循环边/链上节点不进契约
    expect(dsl.edges.some((e: { source: string }) => e.source === 'batch_1__b0')).toBe(false)
    expect(dsl.nodes.some((n: { id: string }) => n.id === 'batch_1__b0')).toBe(false)
    // 主流边保留
    expect(dsl.edges.map((e: { id: string }) => e.id).sort()).toEqual(['e1', 'e2'])
  })

  it('serialize：嵌套批处理——子 BATCH 的 body 递归写回外层 body，子链节点剔出顶层', () => {
    const nodes: FlowNode[] = [
      makeNode('start_1', 'START', 100, 80),
      makeNode('batch_outer', 'BATCH', 300, 80, {
        config: { ...defaultConfig('BATCH'), collection: '{{rows}}' },
      }),
      makeNode('batch_inner', 'BATCH', 300, 210, {
        config: { ...defaultConfig('BATCH'), collection: '{{item}}' },
      }),
      makeNode('batch_inner__b0', 'SCRIPT', 300, 340, {
        config: { language: 'groovy', source: 'return item' },
      }),
      makeNode('end_1', 'END', 560, 80),
    ]
    const loopEdge = (id: string, source: string, target: string, sh?: string, th?: string): FlowEdge => ({
      id,
      source,
      target,
      sourceHandle: sh,
      targetHandle: th,
      data: { loop: true },
    })
    const edges: FlowEdge[] = [
      makeEdge('e1', 'start_1', 'batch_outer'),
      makeEdge('e2', 'batch_outer', 'end_1'),
      loopEdge('l1', 'batch_outer', 'batch_inner', 'loop_start', 'in'),
      loopEdge('l2', 'batch_inner', 'batch_outer', 'out', 'loop_end'),
      loopEdge('l3', 'batch_inner', 'batch_inner__b0', 'loop_start', 'in'),
      loopEdge('l4', 'batch_inner__b0', 'batch_inner', 'out', 'loop_end'),
    ]
    const dsl = JSON.parse(serializeDsl(nodes, edges))
    // 顶层：start/end/batch_outer（batch_inner 与其循环体节点剔出顶层）
    expect(dsl.nodes.map((n: { id: string }) => n.id).sort()).toEqual([
      'batch_outer',
      'end_1',
      'start_1',
    ])
    const outer = dsl.nodes.find((n: { id: string }) => n.id === 'batch_outer')
    expect(outer.config.body).toHaveLength(1)
    const inner = outer.config.body[0]
    expect(inner).toMatchObject({ id: 'batch_inner', type: 'BATCH' })
    // 嵌套写回：子 BATCH 的 body 含 SCRIPT 步骤
    expect(inner.config.body).toHaveLength(1)
    expect(inner.config.body[0]).toMatchObject({ id: 'batch_inner__b0', type: 'SCRIPT' })
  })
})

// ==================== SUBFLOW / inputVars / 变量扫描 ====================

describe('SUBFLOW', () => {
  it('defaultConfig(SUBFLOW) 给出默认结构', () => {
    expect(defaultConfig('SUBFLOW')).toEqual({
      flowId: '',
      passAllVars: true,
      varsMapping: [],
    })
  })

  it('SUBFLOW DSL 往返：serialize → parse → serialize 稳定', () => {
    const nodes: FlowNode[] = [
      makeNode('start_1', 'START', 100, 80),
      makeNode('sub_1', 'SUBFLOW', 300, 160, {
        config: {
          flowId: 'abc123',
          passAllVars: false,
          varsMapping: [{ source: 'a', target: 'x' }],
        },
        results: [{ name: 'subOut', mode: 'WHOLE' }],
      }),
    ]
    const edges: FlowEdge[] = [
      makeEdge('e1', 'start_1', 'sub_1'),
    ]
    const once = serializeDsl(nodes, edges)
    const graph = parseDsl(once)
    const twice = serializeDsl(graph.nodes, graph.edges, graph.inputVars)
    expect(isDslEqual(once, twice)).toBe(true)
    const raw = JSON.parse(once)
    expect(raw.nodes[1].config.flowId).toBe('abc123')
    expect(raw.nodes[1].config.passAllVars).toBe(false)
    expect(raw.nodes[1].config.varsMapping[0]).toEqual({ source: 'a', target: 'x' })
    expect(raw.nodes[1].results).toEqual([{ name: 'subOut', mode: 'WHOLE', type: 'string' }])
  })
})

describe('DATA_UPDATE 数据更新节点', () => {
  it('defaultConfig(DATA_UPDATE) 给出统一多表默认结构（单条目=单表更新）；默认名为数据更新', () => {
    expect(defaultConfig('DATA_UPDATE')).toEqual({
      table: '',
      setOps: [],
      where: [],
      updates: [{ table: '', setOps: [{ column: '', mode: 'SET', value: '' }], where: [] }],
    })
    expect(defaultNodeName('DATA_UPDATE')).toBe('数据更新')
  })

  it('DATA_UPDATE 属合法类型：parse 保留 config 与 results/errorAction', () => {
    const dsl = JSON.stringify({
      nodes: [
        { id: 'start_1', type: 'START', name: '开始', x: 100, y: 80 },
        {
          id: 'du_1',
          type: 'DATA_UPDATE',
          name: '扣减库存',
          x: 300,
          y: 160,
          config: {
            table: 'wf_biz_warehouse',
            setOps: [{ column: 'qty', mode: 'ADD', value: '{{formData.qty}}' }],
            where: [{ column: 'sku', op: 'EQ', value: '{{formData.sku}}' }],
          },
          results: [{ name: 'updatedRows', mode: 'WHOLE' }],
          errorAction: 'FAIL_FLOW',
        },
        { id: 'end_1', type: 'END', name: '结束', x: 500, y: 240 },
      ],
      edges: [
        { source: 'start_1', target: 'du_1' },
        { source: 'du_1', target: 'end_1' },
      ],
    })
    const graph = parseDsl(dsl)
    const du = graph.nodes[1]
    expect(du.data.nodeType).toBe('DATA_UPDATE')
    expect(du.data.results).toEqual([{ name: 'updatedRows', mode: 'WHOLE', type: 'string' }])
    expect(du.data.errorAction).toBe('FAIL_FLOW')
    const cfg = du.data.config as { table: string; setOps: unknown[]; where: unknown[] }
    expect(cfg.table).toBe('wf_biz_warehouse')
    expect(cfg.setOps).toHaveLength(1)
    expect(cfg.where).toHaveLength(1)
  })

  it('DATA_UPDATE DSL 往返：serialize → parse → serialize 稳定', () => {
    const nodes: FlowNode[] = [
      makeNode('start_1', 'START', 100, 80),
      makeNode('du_1', 'DATA_UPDATE', 300, 160, {
        config: {
          table: 'wf_biz_product',
          setOps: [
            { column: 'stock', mode: 'SUB', value: '12' },
            { column: 'last_op', mode: 'SET', value: '入库' },
          ],
          where: [{ column: 'id', op: 'EQ', value: '{{dataId}}' }],
        },
        results: [{ name: 'updatedRows', mode: 'WHOLE' }],
      }),
    ]
    const edges: FlowEdge[] = [makeEdge('e1', 'start_1', 'du_1')]
    const once = serializeDsl(nodes, edges)
    const graph = parseDsl(once)
    const twice = serializeDsl(graph.nodes, graph.edges, graph.inputVars)
    expect(isDslEqual(once, twice)).toBe(true)
    const raw = JSON.parse(once)
    expect(raw.nodes[1].config.table).toBe('wf_biz_product')
    expect(raw.nodes[1].config.setOps[0]).toEqual({ column: 'stock', mode: 'SUB', value: '12' })
    expect(raw.nodes[1].config.where[0]).toEqual({ column: 'id', op: 'EQ', value: '{{dataId}}' })
    expect(raw.nodes[1].results).toEqual([{ name: 'updatedRows', mode: 'WHOLE', type: 'string' }])
  })
})

describe('inputVars', () => {
  it('inputVars 声明往返：序列化包含声明，解析还原', () => {
    const declared = [
      { name: 'orderId', type: 'string' as const, required: true, desc: '订单号' },
      { name: 'amount', type: 'number' as const, required: false },
    ]
    const once = serializeDsl(
      [
        makeNode('start_1', 'START'),
        makeNode('end_1', 'END'),
      ],
      [
        makeEdge('e1', 'start_1', 'end_1'),
      ],
      declared
    )
    const raw = JSON.parse(once)
    expect(raw.inputVars).toHaveLength(2)
    expect(raw.inputVars[0]).toEqual({ name: 'orderId', type: 'string', required: true, desc: '订单号' })
    const graph = parseDsl(once)
    expect(graph.inputVars[0].name).toBe('orderId')
    expect(graph.inputVars[0].required).toBe(true)
    // 空白名声明被过滤
    const filtered = serializeDsl([], [], [{ name: ' ', type: 'string' }])
    expect(JSON.parse(filtered).inputVars).toBeUndefined()
  })

  it('无 inputVars 时序列化不输出该字段（兼容旧 DSL）', () => {
    expect(Object.keys(JSON.parse(serializeDsl([], [])))).toEqual(['nodes', 'edges'])
  })
})

describe('collectReferencedVars', () => {
  it('提取占位符/结构化引用并剔除本流产出（results/itemVar/indexVar）', async () => {
    const { collectReferencedVars } = await import('../dsl')
    const graph = parseDsl(JSON.stringify({
      nodes: [
        { id: 's', type: 'START', name: '开始', x: 0, y: 0 },
        {
          id: 'h', type: 'HTTP', name: '调用', x: 10, y: 10,
          config: { url: 'http://a/{{orderId}}', method: 'GET', headers: {}, queryParams: [{ source: 'token', target: 't' }], bodyParams: [] },
          results: [{ name: 'resp', mode: 'WHOLE' }],
        },
        {
          id: 'b', type: 'BATCH', name: '批', x: 20, y: 20,
          config: { collection: '{{resp}}', itemVar: 'item', indexVar: 'index', actionType: 'SCRIPT', actionConfig: { language: 'groovy', source: 'return item' } },
        },
        {
          id: 'sf', type: 'SUBFLOW', name: '子流程', x: 30, y: 30,
          config: { flowId: 'x', passAllVars: true, varsMapping: [{ source: 'orderId', target: 'id' }] },
        },
        { id: 'e', type: 'END', name: '结束', x: 40, y: 40 },
      ],
      edges: [
        { source: 's', target: 'h' },
        { source: 'h', target: 'b' },
        { source: 'b', target: 'sf' },
        { source: 'sf', target: 'e' },
      ],
    }))
    const refs = collectReferencedVars(graph)
    // orderId（占位符+映射）、token（queryParams source）为输入候选；
    // resp 虽被 BATCH collection 引用，但它是本流产出（results 声明）→ 剔除；item/index 产出 → 剔除
    expect(refs).toContain('orderId')
    expect(refs).toContain('token')
    expect(refs).not.toContain('resp')
    expect(refs).not.toContain('item')
    expect(refs).not.toContain('index')
  })
})

describe('DATA_UPSERT 数据写入节点', () => {
  it('defaultConfig(DATA_UPSERT) 给出 upsert 默认结构（含 upserts 空条目）；默认名为数据写入', () => {
    expect(defaultConfig('DATA_UPSERT')).toEqual({
      formKey: '',
      conflictKey: '',
      values: [{ column: '', value: '' }],
      onUpdate: [],
      upserts: [{ formKey: '', conflictKey: '', values: [{ column: '', value: '' }], onUpdate: [] }],
    })
    expect(defaultNodeName('DATA_UPSERT')).toBe('数据写入')
  })

  it('DATA_UPSERT 属合法类型：parse 保留 config 与 results/errorAction', () => {
    const dsl = JSON.stringify({
      nodes: [
        { id: 'start_1', type: 'START', name: '开始', x: 100, y: 80 },
        {
          id: 'up_1',
          type: 'DATA_UPSERT',
          name: '台账写入',
          x: 300,
          y: 160,
          config: {
            formKey: 'warehouse',
            conflictKey: 'sku',
            values: [
              { column: 'sku', value: '{{formData.sku}}' },
              { column: 'qty', value: '{{formData.qty}}' },
            ],
            onUpdate: [{ column: 'qty', value: '{{formData.qty}}' }],
          },
          results: [{ name: 'upserted', mode: 'WHOLE' }],
          errorAction: 'IGNORE_CONTINUE',
        },
        { id: 'end_1', type: 'END', name: '结束', x: 500, y: 240 },
      ],
      edges: [
        { source: 'start_1', target: 'up_1' },
        { source: 'up_1', target: 'end_1' },
      ],
    })
    const graph = parseDsl(dsl)
    const up = graph.nodes[1]
    expect(up.data.nodeType).toBe('DATA_UPSERT')
    expect(up.data.results).toEqual([{ name: 'upserted', mode: 'WHOLE', type: 'string' }])
    expect(up.data.errorAction).toBe('IGNORE_CONTINUE')
    const cfg = up.data.config as { formKey: string; conflictKey: string; values: unknown[]; onUpdate?: unknown[] }
    expect(cfg.formKey).toBe('warehouse')
    expect(cfg.conflictKey).toBe('sku')
    expect(cfg.values).toHaveLength(2)
    expect(cfg.onUpdate).toHaveLength(1)
  })

  it('DATA_UPSERT DSL 往返：serialize → parse → serialize 稳定', () => {
    const nodes: FlowNode[] = [
      makeNode('start_1', 'START', 100, 80),
      makeNode('up_1', 'DATA_UPSERT', 300, 160, {
        config: {
          formKey: 'warehouse',
          conflictKey: 'sku',
          values: [{ column: 'sku', value: 'A-001' }],
        },
        results: [{ name: 'upserted', mode: 'WHOLE' }],
      }),
    ]
    const edges: FlowEdge[] = [makeEdge('e1', 'start_1', 'up_1')]
    const once = serializeDsl(nodes, edges)
    const graph = parseDsl(once)
    const twice = serializeDsl(graph.nodes, graph.edges, graph.inputVars)
    expect(isDslEqual(once, twice)).toBe(true)
    const raw = JSON.parse(once)
    expect(raw.nodes[1].config).toEqual({
      formKey: 'warehouse',
      conflictKey: 'sku',
      values: [{ column: 'sku', value: 'A-001' }],
    })
    expect(raw.nodes[1].results).toEqual([{ name: 'upserted', mode: 'WHOLE', type: 'string' }])
  })

  it('DATA_UPSERT 可入 BATCH 循环体：parse/serialize 往返保留循环体步骤', () => {
    const dsl = JSON.stringify({
      nodes: [
        { id: 'start_1', type: 'START', name: '开始', x: 100, y: 80 },
        {
          id: 'batch_1',
          type: 'BATCH',
          name: '批处理',
          x: 300,
          y: 160,
          config: {
            collection: '{{items}}',
            itemVar: 'item',
            indexVar: 'index',
            stopOnError: true,
            maxItems: 100,
            body: [
              {
                type: 'DATA_UPSERT',
                name: '数据写入',
                config: {
                  formKey: 'warehouse',
                  conflictKey: 'sku',
                  values: [{ column: 'sku', value: '{{item.sku}}' }],
                },
              },
            ],
          },
        },
        { id: 'end_1', type: 'END', name: '结束', x: 500, y: 240 },
      ],
      edges: [
        { source: 'start_1', target: 'batch_1' },
        { source: 'batch_1', target: 'end_1' },
      ],
    })
    const graph = parseDsl(dsl)
    // 循环体节点被合成到画布（body 链），类型为 DATA_UPSERT
    const bodyNode = graph.nodes.find((n) => n.data.nodeType === 'DATA_UPSERT')
    expect(bodyNode).toBeTruthy()
    const once = serializeDsl(graph.nodes, graph.edges, graph.inputVars)
    const raw = JSON.parse(once)
    const batch = raw.nodes.find((n: { type: string }) => n.type === 'BATCH')
    expect(batch.config.body).toHaveLength(1)
    expect(batch.config.body[0].type).toBe('DATA_UPSERT')
    expect(batch.config.body[0].config.formKey).toBe('warehouse')
  })
})
