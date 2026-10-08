// ----- Task 115: DictPage 交互重构测试——左导航列表 + 上下文注入 dictCode -----
// npx vitest run src/views/system/dict/__tests__/DictPage.test.ts
//
// 背景：旧版左表右表双 SearchTable 存在 LookupPicker 反模式（左侧已选中类型，
// 右侧新增字典项弹窗还要再选一遍「字典分类」）；重构后 dictCode 由选中上下文注入。
// 同时修复列绑 createTime（实际字段 createdAt）导致创建时间恒空白的既有 bug。

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import DictPage from '../DictPage.vue'

vi.mock('@/api/dict', () => ({
  getDictTypeList: vi.fn(),
  createDictType: vi.fn(),
  updateDictType: vi.fn(),
  deleteDictType: vi.fn(),
  getDictDataList: vi.fn(),
  createDictData: vi.fn(),
  updateDictData: vi.fn(),
  deleteDictData: vi.fn(),
}))

const { getDictTypeList, getDictDataList, createDictData } = await import('@/api/dict').then(
  (m) => m as any,
)

function typeRow(id: number, dictName: string, dictCode: string, status = 1) {
  return { id, dictName, dictCode, status, remark: '', createTime: '', createdAt: '' }
}

describe('DictPage 交互重构（Task 115）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  async function mountPage(types?: any[]) {
    ;(getDictTypeList as any).mockResolvedValue({
      data: { rows: types ?? [typeRow(1, '审批意见类型', 'opinion_type'), typeRow(2, '性别', 'gender')], total: types?.length ?? 2 },
    })
    ;(getDictDataList as any).mockResolvedValue({
      data: [{ id: 11, dictCode: 'opinion_type', label: '同意', value: '1', sortOrder: 1, status: 1, createdAt: '2025-01-01T00:00:00Z' }],
    })
    const wrapper = mount(DictPage, {
      global: {
        plugins: [ElementPlus],
        stubs: {
          // SearchTable 为重型业务组件：本页只测导航与表单配置逻辑，不测其内部
          SearchTable: { template: '<div class="search-table-stub" />' },
          ElScrollbar: { template: '<div><slot /></div>' },
        },
      },
    })
    await flushPromises()
    return wrapper
  }

  it('挂载后拉取类型列表并自动选中第一个类型', async () => {
    const wrapper = await mountPage()
    expect(getDictTypeList).toHaveBeenCalledWith({ page: 1, size: 999 })
    const items = wrapper.findAll('.sidenav-item')
    expect(items).toHaveLength(2)
    expect(items[0].classes()).toContain('is-selected')
    expect(items[1].classes()).not.toContain('is-selected')
  })

  it('点击第二个类型切换选中态（高亮迁移）', async () => {
    const wrapper = await mountPage()
    const items = wrapper.findAll('.sidenav-item')
    await items[1].trigger('click')
    expect(items[1].classes()).toContain('is-selected')
    expect(items[0].classes()).not.toContain('is-selected')
  })

  it('关键字过滤只匹配名称/编码命中的项', async () => {
    const wrapper = await mountPage()
    const input = wrapper.find('input[aria-label="搜索字典类型"]')
    await input.setValue('gender')
    await flushPromises()
    expect(wrapper.findAll('.sidenav-item')).toHaveLength(1)
    expect(wrapper.findAll('.sidenav-item')[0].text()).toContain('性别')
  })

  it('停用类型渲染灰显样式与停用标签', async () => {
    const wrapper = await mountPage([typeRow(1, '旧类型', 'legacy', 0)])
    const item = wrapper.find('.sidenav-item')
    expect(item.classes()).toContain('is-disabled')
    expect(item.text()).toContain('停用')
  })

  it('字典项表单已移除 LookupPicker（不再二次选择字典分类）', async () => {
    const wrapper = await mountPage()
    const rule = (wrapper.vm as any).dataFormConfig.rule as any[]
    const ruleFields = rule.map((r) => r.field)
    expect(ruleFields).toEqual(['label', 'value', 'sortOrder'])
    expect(ruleFields).not.toContain('dictTypeRow')
  })

  it('createApi 自动注入左侧选中类型的 dictCode（上下文传递，无二次选择）', async () => {
    const wrapper = await mountPage()
    ;(createDictData as any).mockResolvedValue({ data: {} })
    const cfg = (wrapper.vm as any).dataFormConfig
    await cfg.createApi({ label: '不同意', value: '2', sortOrder: 2 })
    expect(createDictData).toHaveBeenCalledWith(
      expect.objectContaining({ dictCode: 'opinion_type', label: '不同意' }),
    )
  })

  it('右表列绑定 createdAt（修复 createTime 恒空白的既有 bug）', async () => {
    const wrapper = await mountPage()
    const cols = (wrapper.vm as any).dataColumns as any[]
    const timeCol = cols.find((c) => c.label === '创建时间')
    expect(timeCol?.prop).toBe('createdAt')
  })

  it('类型编辑弹窗中编码不可修改（后端 UpdateForm 不含 dictCode）', async () => {
    const wrapper = await mountPage()
    ;(wrapper.vm as any).openTypeEdit(typeRow(1, '审批意见类型', 'opinion_type'))
    await flushPromises()
    expect((wrapper.vm as any).typeEditing).not.toBeNull()
    const codeInput = wrapper.findAll('.el-dialog .el-input__inner')[1]
      .element as HTMLInputElement
    expect(codeInput.disabled).toBe(true)
  })
})
