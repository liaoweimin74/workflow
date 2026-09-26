import { describe, expect, it } from 'vitest'
import { normalizePlan, slugifyKey } from '../../../src/ai/service/ai-process-plan'

/** AI 流程计划归一化：LLM 产出 → 可保存即可部署的计划。 */
describe('slugifyKey', () => {
  it('非法字符转下划线并压缩', () => {
    expect(slugifyKey('leave approval!!x')).toBe('leave_approval_x')
  })

  it('非 ASCII 输入得到合法兜底 key', () => {
    // 全部非法字符 → 下划线 → 压缩 → 去首尾 → 空串 → 前缀兜底
    const key = slugifyKey('流程审批')
    expect(key).toMatch(/^[a-z][a-z0-9_]{2,49}$/)
  })

  it('数字开头补前缀', () => {
    expect(slugifyKey('123abc')).toBe('p_123abc')
  })

  it('过短输入补长度', () => {
    expect(slugifyKey('ab')).toMatch(/^[a-z][a-z0-9_]{2,49}$/)
  })

  it('超长输入截断到 50', () => {
    expect(slugifyKey('a'.repeat(80)).length).toBeLessThanOrEqual(50)
  })
})

describe('normalizePlan', () => {
  it('合法计划原样通过（补全 operations/timeout 缺省）', () => {
    const { plan, warnings } = normalizePlan({
      name: '请假审批',
      key: 'leave_approval',
      processForm: { formDescription: '姓名、请假类型、起止日期、事由' },
      nodes: [
        { type: 'initiator', name: '提交申请' },
        { type: 'userTask', name: '主管审批', approval: { type: 'dept_head' } },
        {
          type: 'userTask',
          name: 'HR 备案',
          approval: { type: 'dept_head' },
          operations: { allowReject: false },
        },
      ],
    })
    expect(plan.name).toBe('请假审批')
    expect(plan.key).toBe('leave_approval')
    expect(plan.nodes).toHaveLength(3)
    expect(plan.nodes[0].type).toBe('initiator')
    expect(plan.nodes[0].formRef?.formDescription).toContain('姓名')
    expect(plan.processFormRef?.formDescription).toContain('姓名')
    expect(plan.nodes[1].approval?.type).toBe('dept_head')
    expect(plan.nodes[1].operations?.allowReject).toBe(true)
    expect(plan.nodes[2].operations?.allowReject).toBe(false)
    // processForm 有值 → 发起节点沿用之，无需「跟随节点表单」告警
    expect(warnings.join('')).not.toContain('流程级表单将跟随发起节点的表单绑定')
  })

  it('首节点非发起 → 自动补发起节点', () => {
    const { plan, warnings } = normalizePlan({
      name: '报销',
      key: 'baoxiao',
      nodes: [{ type: 'userTask', name: '经理审批' }],
    })
    expect(plan.nodes[0].type).toBe('initiator')
    expect(plan.nodes[0].name).toBe('提交申请')
    expect(warnings.join('')).toContain('自动补充发起节点')
  })

  it('nodes 为空 → 自动补发起节点（长度 1，仍可成流程）', () => {
    const { plan } = normalizePlan({ name: '空流程', key: 'empty_flow', nodes: [] })
    expect(plan.nodes).toHaveLength(1)
    expect(plan.nodes[0].type).toBe('initiator')
  })

  it('审批类型 user 无名单 → 降级 dept_head 并告警', () => {
    const { plan, warnings } = normalizePlan({
      name: '降级',
      key: 'fallback_flow',
      nodes: [
        { type: 'initiator', name: '提交' },
        { type: 'userTask', name: '审批', approval: { type: 'user', userIds: [] } },
      ],
    })
    expect(plan.nodes[1].approval?.type).toBe('dept_head')
    expect(warnings.join('')).toContain('已降级为部门负责人')
  })

  it('审批类型 expression 缺表达式 → 默认表达式兜底', () => {
    const { plan } = normalizePlan({
      name: '表达式',
      key: 'expr_flow',
      nodes: [
        { type: 'initiator', name: '提交' },
        { type: 'userTask', name: '审批', approval: { type: 'expression' } },
      ],
    })
    expect(plan.nodes[1].approval?.expression).toBe('${initiator.deptManager}')
  })

  it('发起节点带审批配置 → 清除', () => {
    const { plan } = normalizePlan({
      name: '清审批',
      key: 'init_clean',
      nodes: [{ type: 'initiator', name: '提交', approval: { type: 'dept_head' } }],
    })
    expect(plan.nodes[0].approval).toBeNull()
  })

  it('key 非法 → slug 化并告警；缺 key → 从 name 生成', () => {
    const { plan, warnings } = normalizePlan({
      name: '采购 审批',
      key: '1bad key!',
      nodes: [{ type: 'initiator', name: '提交' }],
    })
    expect(plan.key).toMatch(/^[a-z][a-z0-9_]{2,49}$/)
    expect(warnings.join('')).toContain('已调整为')

    const noKey = normalizePlan({ name: 'Only Name Flow', nodes: [] })
    expect(noKey.plan.key).toMatch(/^[a-z][a-z0-9_]{2,49}$/)
  })

  it('未知节点类型跳过并告警（gateway/serviceTask）', () => {
    const { plan, warnings } = normalizePlan({
      name: '网关',
      key: 'gateway_flow',
      nodes: [
        { type: 'initiator', name: '提交' },
        { type: 'gateway', name: '金额判断' },
        { type: 'userTask', name: '审批' },
      ],
    })
    expect(plan.nodes.map((n) => n.type)).toEqual(['initiator', 'userTask'])
    expect(warnings.join('')).toContain('暂不支持')
  })

  it('timeout 非法丢弃；超 720 小时截断', () => {
    const { plan } = normalizePlan({
      name: '超时',
      key: 'timeout_flow',
      nodes: [
        { type: 'initiator', name: '提交' },
        { type: 'userTask', name: 'A', timeout: { duration: 0 } },
        { type: 'userTask', name: 'B', timeout: { duration: 10000, action: 'escalate' } },
      ],
    })
    expect(plan.nodes[1].timeout).toBeNull()
    expect(plan.nodes[2].timeout?.duration).toBe(720)
    expect(plan.nodes[2].timeout?.action).toBe('escalate')
  })

  it('节点超 20 个截断；非对象节点跳过', () => {
    const nodes: unknown[] = [{ type: 'initiator', name: '提交' }]
    for (let i = 0; i < 30; i++) {
      nodes.push({ type: 'userTask', name: `审批${i}` })
    }
    const { plan } = normalizePlan({ name: '长流程', key: 'long_flow', nodes })
    expect(plan.nodes.length).toBeLessThanOrEqual(20)
  })
})
