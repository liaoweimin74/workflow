/**
 * dash-todo（待办清单卡）单测。
 *
 * 与其余 dash 组件的根本差别：它不走聚合 adapter、没有 dataSourceId，
 * 数据来自工作流任务接口，且查询身份（assignee / userId）必须取自当前登录用户。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const listTodoMock = vi.fn()
const listHistoricMock = vi.fn()
const pushMock = vi.fn()

vi.mock('@/api/task', () => ({
  taskApi: {
    listTodo: (p: any) => listTodoMock(p),
    listHistoric: (p: any) => listHistoricMock(p),
  },
}))

// 身份只能来自登录态：测试里固定成 u9，用来验证它不出现在组件 props 上
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 'u9' } }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

import DashTodo from '../DashTodo.vue'
import { dashTodoRule } from '../../register'

function todoRes(total: number, rows: any[] = []) {
  return { code: 0, data: { content: rows, totalElements: total } }
}

const ROW = {
  taskId: 'T1',
  processInstanceId: 'I1',
  processDefinitionId: 'P1',
  processName: '请假审批',
  businessKey: 'BX1',
  initiator: 'u2',
  initiatorName: '张三',
  currentNodeName: '部门主管',
  assignee: 'u9',
  createTime: '2026-10-18 09:00:00',
  reminded: false,
  priority: 75,
  dueDate: '2026-10-19 18:00:00',
}

beforeEach(() => {
  listTodoMock.mockReset().mockResolvedValue(todoRes(12, [ROW]))
  listHistoricMock.mockReset().mockResolvedValue(todoRes(3, [{ ...ROW, endTime: '2026-10-17 10:00:00', approveResult: '通过' }]))
  pushMock.mockReset()
})

describe('dashTodoRule：拖入契约', () => {
  it('类型 dash-todo，默认 props 齐备', () => {
    const rule = dashTodoRule() as any
    expect(rule.type).toBe('dash-todo')
    expect(String(rule.field)).toMatch(/^todo/)
    expect(rule.props).toMatchObject({ title: '', view: 'todo', limit: 8, orderBy: 'priority', span: 24, height: '' })
  })

  it('没有 dataSourceId：待办不走页面数据源，也不接收聚合配置', () => {
    const rule = dashTodoRule() as any
    expect(rule.props.dataSourceId).toBeUndefined()
    expect(rule.props.agg).toBeUndefined()
  })

  it('契约里没有身份槽位：assignee / userId 不可配置', () => {
    const rule = dashTodoRule() as any
    expect(rule.props).not.toHaveProperty('assignee')
    expect(rule.props).not.toHaveProperty('userId')
  })
})

describe('DashTodo 取数', () => {
  it('待办视图查 /v1/tasks 且 assignee 取当前登录用户', async () => {
    const wrapper = mount(DashTodo, { props: { title: '我的待办' } })
    await flushPromises()
    expect(listTodoMock).toHaveBeenCalledTimes(1)
    expect(listTodoMock.mock.calls[0][0]).toMatchObject({ assignee: 'u9', page: 1, size: 8 })
    wrapper.unmount()
  })

  it('已办视图查历史接口并用 userId，跳详情走已办路由', async () => {
    const wrapper = mount(DashTodo, { props: { view: 'done' } })
    await flushPromises()
    expect(listHistoricMock).toHaveBeenCalledTimes(1)
    expect(listHistoricMock.mock.calls[0][0]).toMatchObject({ userId: 'u9', size: 8 })
    expect(listTodoMock).not.toHaveBeenCalled()
    await wrapper.find('.dash-todo-item').trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/process/todo/done/T1')
    wrapper.unmount()
  })

  it('limit 与 orderBy 进参数（orderBy=priority 时透传）', async () => {
    const wrapper = mount(DashTodo, { props: { limit: 5, orderBy: 'priority' } })
    await flushPromises()
    expect(listTodoMock.mock.calls[0][0]).toMatchObject({ size: 5, orderBy: 'priority' })
    wrapper.unmount()
  })

  it('orderBy 置空则不带该参数（退回服务端默认按接收时间）', async () => {
    const wrapper = mount(DashTodo, { props: { orderBy: '' } })
    await flushPromises()
    expect(listTodoMock.mock.calls[0][0]).not.toHaveProperty('orderBy')
    wrapper.unmount()
  })

  it('计数徽标取 totalElements，不是本页行数', async () => {
    const wrapper = mount(DashTodo, { props: { limit: 8 } })
    await flushPromises()
    expect(wrapper.find('.dash-todo-count').text()).toContain('12')
    expect(wrapper.findAll('.dash-todo-item')).toHaveLength(1)
    wrapper.unmount()
  })

  it('接口失败不抛错，落到空态', async () => {
    listTodoMock.mockRejectedValue(new Error('boom'))
    const wrapper = mount(DashTodo)
    await flushPromises()
    expect(wrapper.find('.dash-todo-empty').exists()).toBe(true)
    wrapper.unmount()
  })

  it('零条数据显示空态文案（待办 / 已办各一句）', async () => {
    listTodoMock.mockResolvedValue(todoRes(0, []))
    const wrapper = mount(DashTodo)
    await flushPromises()
    expect(wrapper.find('.dash-todo-empty').text()).toContain('没有待办')
    wrapper.unmount()

    listHistoricMock.mockResolvedValue(todoRes(0, []))
    const doneWrapper = mount(DashTodo, { props: { view: 'done' } })
    await flushPromises()
    expect(doneWrapper.find('.dash-todo-empty').text()).toContain('没有已办')
    doneWrapper.unmount()
  })
})

describe('DashTodo 行渲染与点击', () => {
  it('行内展示流程名与当前节点，优先级成档位标记', async () => {
    const wrapper = mount(DashTodo)
    await flushPromises()
    const item = wrapper.find('.dash-todo-item')
    expect(item.find('.dash-todo-item-title').text()).toBe('请假审批')
    expect(item.find('.dash-todo-item-meta').text()).toContain('部门主管')
    expect(item.find('.dash-todo-item-meta').text()).toContain('张三')
    expect(item.find('.dash-todo-tag-priority').text()).toBe('重要')
    wrapper.unmount()
  })

  it('加急（>=100）与普通（<75）标记不同档', async () => {
    listTodoMock.mockResolvedValue(todoRes(1, [{ ...ROW, priority: 100 }]))
    const urgent = mount(DashTodo)
    await flushPromises()
    expect(urgent.find('.dash-todo-tag-priority').text()).toBe('加急')

    listTodoMock.mockResolvedValue(todoRes(1, [{ ...ROW, priority: 50 }]))
    const normal = mount(DashTodo)
    await flushPromises()
    expect(normal.find('.dash-todo-tag-priority').exists()).toBe(false)
    urgent.unmount()
    normal.unmount()
  })

  it('接口回的是 ISO 时间（带 T），展示时转成空格分隔且只到分钟', async () => {
    listTodoMock.mockResolvedValue(todoRes(1, [{ ...ROW, createTime: '2026-10-13T22:36:00.000+08:00' }]))
    const wrapper = mount(DashTodo)
    await flushPromises()
    const meta = wrapper.find('.dash-todo-item-meta').text()
    expect(meta).toContain('2026-10-13 22:36')
    expect(meta).not.toContain('T22:36')
    wrapper.unmount()
  })

  it('已催办的任务带催办标记', async () => {    listTodoMock.mockResolvedValue(todoRes(1, [{ ...ROW, reminded: true }]))
    const wrapper = mount(DashTodo)
    await flushPromises()
    expect(wrapper.find('.dash-todo-tag-reminded').exists()).toBe(true)
    wrapper.unmount()
  })

  it('已办视图的节点是「我办过的那一步」，标签用办理而非节点', async () => {
    const wrapper = mount(DashTodo, { props: { view: 'done' } })
    await flushPromises()
    const meta = wrapper.find('.dash-todo-item-meta').text()
    expect(meta).toContain('办理：部门主管')
    expect(meta).not.toContain('节点：')
    wrapper.unmount()
  })

  it('待办视图点击行进任务处理页', async () => {
    const wrapper = mount(DashTodo)
    await flushPromises()
    await wrapper.find('.dash-todo-item').trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/process/todo/T1')
    wrapper.unmount()
  })

  it('设计态点击不跳转（画布上不离开设计器）', async () => {
    const wrapper = mount(DashTodo, { props: { designMode: true } })
    await flushPromises()
    await wrapper.find('.dash-todo-item').trigger('click')
    expect(pushMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

describe('DashTodo 接筛选器广播', () => {
  /** 广播载荷形状与 PageRendererPage.broadcastDashFilter 一致：{ 字段: { op, value } } */
  async function mountWithBroadcast(cond: Record<string, any>) {
    const wrapper = mount(DashTodo)
    await flushPromises()
    listTodoMock.mockClear()
    const vm = wrapper.vm as any
    vm.setFilter(cond)
    await flushPromises()
    return wrapper
  }

  it('range 条件映射到 createTimeStart / createTimeEnd，且规整成后端认的 ISO', async () => {
    // 筛选器广播的是 'YYYY-MM-DD HH:mm:ss'（SearchTable 的 value-format），
    // 而 /v1/tasks 的 LocalDateTime 只吃 ISO——空格格式实测 500，必须在出网前改写
    await mountWithBroadcast({ createTime: { op: 'range', value: ['2026-10-01 00:00:00', '2026-10-08 23:59:59'] } })
    expect(listTodoMock.mock.calls[0][0]).toMatchObject({
      createTimeStart: '2026-10-01T00:00:00',
      createTimeEnd: '2026-10-08T23:59:59',
    })
  })

  it('纯日期范围补全时刻：起始 00:00:00、截止 23:59:59（别把截止当天整日漏掉）', async () => {
    await mountWithBroadcast({ createTime: { op: 'range', value: ['2026-10-01', '2026-10-08'] } })
    expect(listTodoMock.mock.calls[0][0]).toMatchObject({
      createTimeStart: '2026-10-01T00:00:00',
      createTimeEnd: '2026-10-08T23:59:59',
    })
  })

  it('缺秒的时间值补 :00，已是 ISO 的值原样透传（不二次加工）', async () => {
    await mountWithBroadcast({ createTime: { op: 'range', value: ['2026-10-01 08:30', '2026-10-08T20:15:30'] } })
    expect(listTodoMock.mock.calls[0][0]).toMatchObject({
      createTimeStart: '2026-10-01T08:30:00',
      createTimeEnd: '2026-10-08T20:15:30',
    })
  })

  it('不像时间的值不硬改写（保持透传，错也由后端报，不至于静默变成假日期）', async () => {
    await mountWithBroadcast({ createTime: { op: 'range', value: ['上周', '这周'] } })
    expect(listTodoMock.mock.calls[0][0]).toMatchObject({ createTimeStart: '上周', createTimeEnd: '这周' })
  })

  it('已办视图的 range 映射到 endTimeStart / endTimeEnd', async () => {
    const wrapper = mount(DashTodo, { props: { view: 'done' } })
    await flushPromises()
    listHistoricMock.mockClear()
    ;(wrapper.vm as any).setFilter({ endTime: { op: 'range', value: ['a', 'b'] } })
    await flushPromises()
    expect(listHistoricMock.mock.calls[0][0]).toMatchObject({ endTimeStart: 'a', endTimeEnd: 'b' })
    wrapper.unmount()
  })

  it('流程名条件（eq / like）映射到 processName', async () => {
    await mountWithBroadcast({ processName: { op: 'like', value: '请假' } })
    expect(listTodoMock.mock.calls[0][0]).toMatchObject({ processName: '请假' })
  })

  it('表达不了的条件被忽略，不污染请求参数', async () => {
    await mountWithBroadcast({ status: { op: 'eq', value: 'running' } })
    expect(listTodoMock.mock.calls[0][0]).not.toHaveProperty('status')
    expect(listTodoMock.mock.calls[0][0]).not.toHaveProperty('processName')
  })

  it('null 清除同字段条件后重查', async () => {
    const wrapper = mount(DashTodo)
    await flushPromises()
    const vm = wrapper.vm as any
    vm.setFilter({ createTime: { op: 'range', value: ['a', 'b'] } })
    await flushPromises()
    listTodoMock.mockClear()
    vm.setFilter({ createTime: null })
    await flushPromises()
    expect(listTodoMock.mock.calls[0][0]).not.toHaveProperty('createTimeStart')
    wrapper.unmount()
  })

  it('refresh 清掉广播条件并重查（与动作总线刷新数据语义一致）', async () => {
    const wrapper = mount(DashTodo)
    await flushPromises()
    const vm = wrapper.vm as any
    vm.setFilter({ processName: { op: 'eq', value: '请假' } })
    await flushPromises()
    listTodoMock.mockClear()
    vm.refresh()
    await flushPromises()
    expect(listTodoMock.mock.calls[0][0]).not.toHaveProperty('processName')
    wrapper.unmount()
  })
})

describe('DashTodo 布局与实例上报', () => {
  it('ready 上报 refresh / setFilter 供动作总线与筛选器使用', async () => {
    const wrapper = mount(DashTodo)
    await flushPromises()
    const emitted = wrapper.emitted('ready') as any[]
    expect(emitted).toBeTruthy()
    expect(typeof emitted[0][0].refresh).toBe('function')
    expect(typeof emitted[0][0].setFilter).toBe('function')
    wrapper.unmount()
  })
})
