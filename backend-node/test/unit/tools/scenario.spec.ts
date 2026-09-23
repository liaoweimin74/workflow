import { describe, expect, it } from 'vitest'
import {
  createRunId,
  getByPath,
  resolveDeep,
  resolveTemplate,
  scenarioFileName,
  stepHeaders,
  type ScenarioVars,
} from '../../../tools/lib/scenario'

describe('getByPath', () => {
  const root = { data: { id: 'abc', rows: [{ name: 'x' }, { name: 'y' }] }, code: 200 }

  it('逐层取点路径', () => {
    expect(getByPath(root, 'data.id')).toBe('abc')
    expect(getByPath(root, 'code')).toBe(200)
  })

  it('支持数组下标', () => {
    expect(getByPath(root, 'data.rows[1].name')).toBe('y')
    expect(getByPath(root, 'data.rows[0].name')).toBe('x')
  })

  it('空路径返回根对象', () => {
    expect(getByPath(root, '')).toBe(root)
  })

  it('任一层缺失返回 undefined，不抛异常', () => {
    expect(getByPath(root, 'data.missing.deep')).toBeUndefined()
    expect(getByPath(root, 'nope.x')).toBeUndefined()
    expect(getByPath(null, 'a')).toBeUndefined()
  })

  it('对非对象取属性返回 undefined', () => {
    expect(getByPath(root, 'code.x')).toBeUndefined()
  })
})

describe('resolveTemplate', () => {
  const vars = new Map<string, unknown>([
    ['draft', { data: { id: 'd1', count: 3 } }],
    ['login', { data: { accessToken: 'tok' } }],
  ])

  it('整串恰为占位符时保持原始类型（数字仍是数字）', () => {
    expect(resolveTemplate('{{draft.data.count}}', vars)).toBe(3)
  })

  it('整串占位符可取到对象', () => {
    expect(resolveTemplate('{{draft.data}}', vars)).toEqual({ id: 'd1', count: 3 })
  })

  it('串内嵌占位符做字符串拼接', () => {
    expect(resolveTemplate('/api/v1/process-definitions/{{draft.data.id}}/deploy', vars)).toBe(
      '/api/v1/process-definitions/d1/deploy',
    )
  })

  it('一次替换多个占位符', () => {
    expect(resolveTemplate('{{draft.data.id}}-{{draft.data.count}}', vars)).toBe('d1-3')
  })

  it('引用未知步骤直接报错（避免静默产出坏请求）', () => {
    expect(() => resolveTemplate('{{nope.id}}', vars)).toThrow(/未知或尚未执行的步骤/)
  })

  // ⚠️ 这条断言被**刻意反转**过：原行为是「路径取不到值 → 替换成空串」。
  //    实测它把一次笔误（`{{pageList2.data.content[0].id}}` 漏写 `data.`）
  //    变成了 `/api/v1/pages/` 这种看似合法的 URL，于是一整轮 golden 全是 500，
  //    排查时还以为是后端的问题。契约场景里的「空值」几乎永远是笔误。
  it('取值为 undefined 时抛错（不再静默变成空串）', () => {
    expect(() => resolveTemplate('x{{draft.data.missing}}y', vars)).toThrow(/取不到值/)
  })

  it('字段存在但值为 null 时替换为空串（这是合法情形，不是笔误）', () => {
    const withNull: ScenarioVars = new Map([['d', { data: { id: 'd1', note: null } }]])
    expect(resolveTemplate('x{{d.data.note}}y', withNull)).toBe('xy')
  })

  it('无占位符时原样返回', () => {
    expect(resolveTemplate('/api/plain', vars)).toBe('/api/plain')
  })

  it('允许引用响应里的 token（登录→后续步骤）', () => {
    expect(resolveTemplate('Bearer {{login.data.accessToken}}', vars)).toBe('Bearer tok')
  })
})

describe('resolveDeep', () => {
  const vars = new Map<string, unknown>([['d', { data: { id: 'x', n: 7 } }]])

  it('深度替换嵌套对象与数组', () => {
    expect(
      resolveDeep({ a: '{{d.data.id}}', list: ['{{d.data.n}}', { b: '{{d.data.id}}' }] }, vars),
    ).toEqual({ a: 'x', list: [7, { b: 'x' }] })
  })

  it('保留非字符串标量', () => {
    expect(resolveDeep({ n: 1, b: true, z: null }, vars)).toEqual({ n: 1, b: true, z: null })
  })

  it('整串占位符在对象里也保持原始类型', () => {
    expect(resolveDeep({ n: '{{d.data.n}}' }, vars)).toEqual({ n: 7 })
  })
})

describe('内置变量 $runId', () => {
  const vars = new Map<string, unknown>()

  it('替换成传入的 runId（用于让流程 key 唯一，避免 version 累加）', () => {
    expect(resolveTemplate('contract_flow_{{$runId}}', vars, 'ab12cd')).toBe(
      'contract_flow_ab12cd',
    )
  })

  it('可以出现多次', () => {
    expect(resolveTemplate('{{$runId}}/{{$runId}}', vars, 'x1')).toBe('x1/x1')
  })

  it('深度替换时同样生效（如 BPMN XML 内部）', () => {
    expect(resolveDeep({ bpmnXml: '<process id="k_{{$runId}}">' }, vars, 'z9')).toEqual({
      bpmnXml: '<process id="k_z9">',
    })
  })

  it('未传 runId 却用到 {{$runId}} 时直接报错，而不是静默产出空串', () => {
    expect(() => resolveTemplate('k_{{$runId}}', vars)).toThrow(/没有传入 runId/)
  })

  it('未知的内置变量报错', () => {
    expect(() => resolveTemplate('{{$nope}}', vars, 'x')).toThrow(/未知的内置变量/)
  })

  it('createRunId 生成非空且长度稳定的随机串', () => {
    const a = createRunId()
    const b = createRunId()
    expect(a).toMatch(/^[a-z0-9]{6}$/)
    expect(a).not.toBe(b)
  })
})

describe('stepHeaders', () => {
  it('tenant 便捷字段转成 X-Tenant-Id 头', () => {
    expect(stepHeaders({ tenant: 'default' } as never)).toEqual({ 'X-Tenant-Id': 'default' })
  })

  it('显式 headers 与 tenant 合并，显式优先', () => {
    expect(
      stepHeaders({ headers: { 'X-Tenant-Id': 'system', A: '1' }, tenant: 'default' } as never),
    ).toEqual({ A: '1', 'X-Tenant-Id': 'default' })
  })

  it('都没有时返回空对象', () => {
    expect(stepHeaders({} as never)).toEqual({})
  })
})

describe('scenarioFileName', () => {
  it('带序号前缀且可读', () => {
    expect(scenarioFileName(0, '登录')).toBe('01__登录.json')
    expect(scenarioFileName(9, '流程定义全链路')).toBe('10__流程定义全链路.json')
  })

  it('把路径分隔等非法字符替换成下划线', () => {
    expect(scenarioFileName(1, 'a/b:c d')).toBe('02__a_b_c_d.json')
  })
})
