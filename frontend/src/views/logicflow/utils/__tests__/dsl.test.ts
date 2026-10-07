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
          resultVar: 'risk',
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
    expect(http.data.resultVar).toBe('risk')
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
        resultVar: 'risk',
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
      ['config', 'errorAction', 'id', 'name', 'resultVar', 'type', 'x', 'y'].sort()
    )
    expect(parsed.nodes[1].x).toBe(240)
    expect(parsed.nodes[1].resultVar).toBe('risk')
    expect(parsed.nodes[1].errorAction).toBe('IGNORE_CONTINUE')
    expect(parsed.edges[0]).toEqual({ id: 'e1', source: 'start_1', target: 'http_1' })
  })

  it('START/END/CONDITION 节点不输出 resultVar/errorAction', () => {
    const nodes: FlowNode[] = [
      makeNode('cond_1', 'CONDITION', 0, 0, { resultVar: 'x', errorAction: 'FAIL_FLOW' }),
    ]
    const parsed = JSON.parse(serializeDsl(nodes, []))
    expect(parsed.nodes[0].resultVar).toBeUndefined()
    expect(parsed.nodes[0].errorAction).toBeUndefined()
  })

  it('DSL 往返：serialize → parse → serialize 结果稳定', () => {
    const nodes: FlowNode[] = [
      makeNode('start_1', 'START', 100, 80),
      makeNode('bean_1', 'BEAN', 220, 160, {
        config: { beanName: 'demoService', methodName: 'query', params: [{ source: 'a', target: 'b' }] },
        resultVar: 'beanOut',
        errorAction: 'FAIL_FLOW',
      }),
      makeNode('script_1', 'SCRIPT', 340, 240, {
        config: { language: 'groovy', source: "return 'ok'" },
        resultVar: 's',
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
