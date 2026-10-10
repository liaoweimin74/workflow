// ----- Task 3-a: DictSelect 组件测试 -----
// npx vitest run src/components/business/__tests__/DictSelect.test.ts
//
// mock @/api/dict（对齐 DictPage.test.ts 的模块 mock 模式）；
// DictDataVO 字段：label / value / sortOrder / status（status===1 启用）。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import DictSelect from '../DictSelect.vue'
import { getDictDataList } from '@/api/dict'

vi.mock('@/api/dict', () => ({
  getDictDataList: vi.fn(),
}))

const mockGetDictDataList = getDictDataList as any

function dictRow(id: number, label: string, value: string, status = 1, sortOrder = 0) {
  return { id, dictCode: 'gender', label, value, sortOrder, status, createdAt: '' }
}

function createWrapper(props: any = {}) {
  return mount(DictSelect, {
    props: {
      modelValue: '',
      dictTypeCode: 'gender',
      ...props,
    },
    global: { plugins: [ElementPlus] },
  })
}

function optionsOf(wrapper: any) {
  return wrapper.findAllComponents({ name: 'ElOption' })
}

describe('DictSelect — 选项加载', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('挂载时按 dictTypeCode 拉取字典数据并渲染选项（仅启用项）', async () => {
    mockGetDictDataList.mockResolvedValue({
      data: [dictRow(1, '男', 'M'), dictRow(2, '女', 'F', 1, 1), dictRow(3, '保密', 'X', 0, 2)],
    })
    const wrapper = createWrapper()
    await flushPromises()
    expect(mockGetDictDataList).toHaveBeenCalledWith('gender')
    const opts = optionsOf(wrapper)
    expect(opts).toHaveLength(2)
    expect(opts[0].props('label')).toBe('男')
    expect(opts[0].props('value')).toBe('M')
    expect(opts[1].props('label')).toBe('女')
  })

  it('按 sortOrder 升序排列选项', async () => {
    mockGetDictDataList.mockResolvedValue({
      data: [dictRow(1, '高', 'high', 1, 2), dictRow(2, '低', 'low', 1, 0)],
    })
    const wrapper = createWrapper()
    await flushPromises()
    expect(optionsOf(wrapper).map((o: any) => o.props('label'))).toEqual(['低', '高'])
  })

  it('dictTypeCode 变化时重新拉取', async () => {
    mockGetDictDataList.mockResolvedValue({ data: [dictRow(1, '男', 'M')] })
    const wrapper = createWrapper()
    await flushPromises()
    await wrapper.setProps({ dictTypeCode: 'opinion_type' })
    await flushPromises()
    expect(mockGetDictDataList).toHaveBeenCalledTimes(2)
    expect(mockGetDictDataList).toHaveBeenLastCalledWith('opinion_type')
  })

  it('dictTypeCode 为空时不发起请求、无选项', async () => {
    const wrapper = createWrapper({ dictTypeCode: '' })
    await flushPromises()
    expect(mockGetDictDataList).not.toHaveBeenCalled()
    expect(optionsOf(wrapper)).toHaveLength(0)
  })

  it('加载失败：console.warn + 空选项，不抛错不弹提示', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockGetDictDataList.mockRejectedValue(new Error('network down'))
    const wrapper = createWrapper()
    await flushPromises()
    expect(optionsOf(wrapper)).toHaveLength(0)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0][0])).toContain('[DictSelect]')
    expect(wrapper.findComponent({ name: 'ElSelect' }).exists()).toBe(true)
    warnSpy.mockRestore()
  })
})

describe('DictSelect — 值语义', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetDictDataList.mockResolvedValue({
      data: [dictRow(1, '男', 'M'), dictRow(2, '女', 'F', 1, 1), dictRow(3, '保密', 'X', 0, 2)],
    })
  })

  it('单选值回填 el-select', async () => {
    const wrapper = createWrapper({ modelValue: 'M' })
    await flushPromises()
    const select = wrapper.findComponent({ name: 'ElSelect' })
    expect(select.props('modelValue')).toBe('M')
  })

  it('回显补偿：当前值命中停用项时补入选项', async () => {
    const wrapper = createWrapper({ modelValue: 'X' })
    await flushPromises()
    const opts = optionsOf(wrapper)
    expect(opts).toHaveLength(3)
    expect(opts[2].props('label')).toBe('保密')
    expect(opts[2].props('value')).toBe('X')
  })

  it('多选值回填 el-select（数组透传）', async () => {
    const wrapper = createWrapper({ modelValue: ['M', 'F'], multiple: true })
    await flushPromises()
    const select = wrapper.findComponent({ name: 'ElSelect' })
    expect(select.props('multiple')).toBe(true)
    expect(select.props('modelValue')).toEqual(['M', 'F'])
  })

  it('多选容错：历史单值字符串自动包装为数组', async () => {
    const wrapper = createWrapper({ modelValue: 'M', multiple: true })
    await flushPromises()
    expect(wrapper.findComponent({ name: 'ElSelect' }).props('modelValue')).toEqual(['M'])
  })
})

describe('DictSelect — 变更事件', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetDictDataList.mockResolvedValue({ data: [dictRow(1, '男', 'M'), dictRow(2, '女', 'F')] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('单选：emit update:modelValue + change（string）', async () => {
    const wrapper = createWrapper()
    await flushPromises()
    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'F')
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:modelValue')[0]).toEqual(['F'])
    expect(wrapper.emitted('change')[0]).toEqual(['F'])
  })

  it('多选：emit update:modelValue + change（string[]）', async () => {
    const wrapper = createWrapper({ multiple: true })
    await flushPromises()
    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', ['M', 'F'])
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([['M', 'F']])
    expect(wrapper.emitted('change')[0]).toEqual([['M', 'F']])
  })

  it('props 透传：placeholder / disabled / clearable / size', () => {
    const wrapper = createWrapper({
      placeholder: '请选择性别',
      disabled: true,
      clearable: false,
      size: 'small',
    })
    const select = wrapper.findComponent({ name: 'ElSelect' })
    // EP 2.x select 的 placeholder 渲染为 span（.el-select__placeholder），非 input 属性，断言 props
    expect(select.props('placeholder')).toBe('请选择性别')
    expect(select.props('disabled')).toBe(true)
    expect(select.props('clearable')).toBe(false)
    expect(select.props('size')).toBe('small')
  })
})
