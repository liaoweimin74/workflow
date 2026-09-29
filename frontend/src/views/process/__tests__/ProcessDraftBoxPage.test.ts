// ----- Task 93: ProcessDraftBoxPage 草稿箱 -----
// npx vitest run src/views/process/__tests__/ProcessDraftBoxPage.test.ts
//
// 覆盖：列表渲染（流程名/表单名/版本标签）、已下线流程「继续填写」禁用、
//       关键字过滤、删除确认调用删除 API 后刷新。

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

const push = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ path: '/process/drafts' }),
}))

const { formApi } = await import('@/api/form').then((m) => m as any)

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
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(formApi.listDrafts as any).mockResolvedValue({ data: [] })
})

describe('ProcessDraftBoxPage 草稿箱', () => {
  it('空列表展示空态文案', async () => {
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('暂无流程草稿')
    wrapper.unmount()
  })

  it('渲染草稿行：流程名 + 版本标签 + 表单名 + 摘要', async () => {
    ;(formApi.listDrafts as any).mockResolvedValue({
      data: [draft()],
    })
    const wrapper = mountPage()
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('请假')
    expect(text).toContain('v2')
    expect(text).toContain('请假表单')
    expect(text).toContain('reason: 家中有事')
    expect(text).toContain('共 1 条草稿')
    wrapper.unmount()
  })

  it('流程已下线（processDefId=null）时显示标签且继续填写禁用', async () => {
    ;(formApi.listDrafts as any).mockResolvedValue({
      data: [draft({ processDefId: null, processName: null, processVersion: null })],
    })
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('流程已下线')
    expect(wrapper.text()).toContain('未知流程')
    const continueBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('继续填写'))
    expect(continueBtn?.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('关键字过滤：只保留流程名或表单名命中的草稿', async () => {
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

    const input = wrapper.find('input')
    await input.setValue('报销')
    await flushPromises()

    expect(wrapper.text()).toContain('报销')
    expect(wrapper.text()).not.toContain('reason')
    expect(wrapper.text()).toContain('共 1 条草稿')
    wrapper.unmount()
  })

  it('确认删除后调用 deleteDraft 并刷新列表', async () => {
    ;(formApi.listDrafts as any)
      .mockResolvedValueOnce({ data: [draft()] })
      .mockResolvedValueOnce({ data: [] })
    ;(formApi.deleteDraft as any).mockResolvedValue({ code: 200, msg: 'success', data: null })

    // 拦截 ElMessageBox.confirm 返回 resolved
    const ElMessageBox = await import('element-plus').then((m) => m.ElMessageBox)
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm')

    const wrapper = mountPage()
    await flushPromises()

    const delBtn = wrapper.findAll('button').find((b) => b.text().includes('删除'))
    await delBtn!.trigger('click')
    await flushPromises()

    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(formApi.deleteDraft).toHaveBeenCalledWith('d1')
    // 第二次加载返回空列表 → 空态
    expect(wrapper.text()).toContain('暂无流程草稿')
    wrapper.unmount()
  })
})
