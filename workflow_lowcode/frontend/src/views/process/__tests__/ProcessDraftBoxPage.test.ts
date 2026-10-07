// ----- Task 94: ProcessDraftBoxPage 草稿箱（SearchTable 重构版） -----
// npx vitest run src/views/process/__tests__/ProcessDraftBoxPage.test.ts
//
// 页面已改为 SearchTable 范式：本文件挂载真实 SearchTable，覆盖
// ① 列表渲染（流程名/版本标签/表单名/摘要/时间） ② 已下线流程隐藏「继续填写」
// ③ 关键字客户端过滤 + 重置 ④ 删除确认→删除 API→刷新 ⑤ 继续填写路由跳转
// ⑥ listDrafts 失败兜底（toast + 空表不崩）

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import ProcessDraftBoxPage from '../ProcessDraftBoxPage.vue'

vi.mock('@/api/form', () => ({
  formApi: {
    listDrafts: vi.fn(),
    deleteDraft: vi.fn(),
  },
}))

// 局部 mock：只替换 ElMessage/ElMessageBox，保留组件等真实导出（ElIcon/ElTag 仍真实渲染）
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus')
  return {
    ...actual,
    ElMessage: { ...actual.ElMessage, success: vi.fn(), error: vi.fn() },
    ElMessageBox: { ...actual.ElMessageBox, confirm: vi.fn() },
  }
})

const push = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ path: '/process/drafts' }),
}))

const { formApi } = await import('@/api/form').then((m) => m as any)
const { ElMessage, ElMessageBox } = (await import('element-plus')) as any

function draft(overrides: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    formDefId: 'f1',
    formName: '请假表单',
    processDefId: 'leave:2:2',
    processKey: 'leave',
    processName: '请假',
    processVersion: 2,
    dataJson: JSON.stringify({ reason: '家中有事', days: 2 }),
    createdAt: '2026-09-29 05:00:00',
    updatedAt: '2026-09-29 06:00:00',
    ...overrides,
  }
}

function mountPage() {
  return mount(ProcessDraftBoxPage, {
    global: {
      plugins: [ElementPlus],
      directives: {
        // SearchTable 内部操作按钮使用 v-permission，测试环境无全局注册
        permission: { mounted() {}, updated() {} },
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(formApi.listDrafts as any).mockResolvedValue({ data: [] })
})

describe('ProcessDraftBoxPage 草稿箱（SearchTable 版）', () => {
  it('渲染草稿行：流程名 + 版本标签 + 表单名 + 摘要 + 时间，且出现分页', async () => {
    ;(formApi.listDrafts as any).mockResolvedValue({ data: [draft()] })
    const wrapper = mountPage()
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('请假')
    expect(text).toContain('v2')
    expect(text).toContain('请假表单')
    expect(text).toContain('reason: 家中有事')
    expect(text).toContain('2026-09-29 06:00:00')
    // 工具栏说明 + 分页栏（total>0 才渲染）
    expect(text).toContain('保存草稿')
    expect(wrapper.find('.el-pagination').exists()).toBe(true)
    wrapper.unmount()
  })

  it('流程已下线（processDefId=null）时显示标签且无「继续填写」按钮', async () => {
    ;(formApi.listDrafts as any).mockResolvedValue({
      data: [draft({ processDefId: null, processName: null, processVersion: null })],
    })
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('流程已下线')
    expect(wrapper.text()).toContain('未知流程')
    const labels = wrapper.findAll('button').map((b) => b.text())
    expect(labels.some((t) => t.includes('继续填写'))).toBe(false)
    expect(labels.some((t) => t.includes('删除'))).toBe(true)
    wrapper.unmount()
  })

  it('关键字过滤：搜索后只保留流程名命中的草稿，重置后恢复全量', async () => {
    ;(formApi.listDrafts as any).mockResolvedValue({
      data: [
        draft(),
        draft({
          id: 'd2',
          processKey: 'expense',
          processName: '报销',
          formName: '报销单',
          formDefId: 'f2',
          dataJson: JSON.stringify({ item: '差旅费', amount: 300 }),
        }),
      ],
    })
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('家中有事')

    // 输入关键字 → 点击搜索（圆形主色按钮）
    const input = wrapper.find('input[placeholder="搜索流程名称 / 表单名称…"]')
    expect(input.exists()).toBe(true)
    await input.setValue('报销')
    const searchBtn = wrapper.findAll('.search-card .toolbar-buttons button')[0]
    await searchBtn.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('item: 差旅费')
    expect(wrapper.text()).not.toContain('家中有事')
    // 搜索触发重新拉取（初始 1 次 + 搜索 1 次）
    expect(formApi.listDrafts).toHaveBeenCalledTimes(2)

    // 点击重置 → 关键字清空，恢复全量
    const resetBtn = wrapper.findAll('.search-card .toolbar-buttons button')[1]
    await resetBtn.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('家中有事')
    wrapper.unmount()
  })

  it('确认删除后调用 deleteDraft、toast 成功并刷新列表', async () => {
    ;(formApi.listDrafts as any)
      .mockResolvedValueOnce({ data: [draft()] })
      .mockResolvedValue({ data: [] })
    ;(formApi.deleteDraft as any).mockResolvedValue({ code: 200, msg: 'success', data: null })
    ;(ElMessageBox.confirm as any).mockResolvedValue('confirm')

    const wrapper = mountPage()
    await flushPromises()

    const delBtn = wrapper.findAll('button').find((b) => b.text().includes('删除'))
    await delBtn!.trigger('click')
    await flushPromises()

    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(formApi.deleteDraft).toHaveBeenCalledWith('d1')
    expect(ElMessage.success).toHaveBeenCalledWith('草稿已删除')
    // 刷新后列表为空 → 无数据行、分页隐藏
    expect(formApi.listDrafts).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.el-table__empty-text').exists()).toBe(true)
    expect(wrapper.find('.el-pagination').exists()).toBe(false)
    wrapper.unmount()
  })

  it('继续填写：跳转到发起页并携带流程定义 id', async () => {
    ;(formApi.listDrafts as any).mockResolvedValue({ data: [draft()] })
    const wrapper = mountPage()
    await flushPromises()

    const continueBtn = wrapper.findAll('button').find((b) => b.text().includes('继续填写'))
    await continueBtn!.trigger('click')
    expect(push).toHaveBeenCalledWith('/process/start/leave:2:2')
    wrapper.unmount()
  })

  it('listDrafts 失败时 toast 错误且页面不崩（空表兜底）', async () => {
    ;(formApi.listDrafts as any).mockRejectedValue(new Error('network down'))
    const wrapper = mountPage()
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith('加载草稿列表失败')
    expect(wrapper.find('.el-table__empty-text').exists()).toBe(true)
    wrapper.unmount()
  })
})
