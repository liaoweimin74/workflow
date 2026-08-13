// ----- TDD: LookupPicker 组件测试 -----
// npx vitest run src/components/business/__tests__/LookupPicker.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import LookupPicker from '../LookupPicker.vue'

function createWrapper(props: any = {}) {
  return mount(LookupPicker, {
    props: {
      modelValue: null,
      fetchApi: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
      columns: [{ prop: 'code', label: '编号' }, { prop: 'name', label: '名称' }],
      ...props,
    },
    global: {
      plugins: [ElementPlus],
    },
  })
}

describe('LookupPicker — 基础渲染', () => {
  it('渲染输入框', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('input').exists()).toBe(true)
  })

  it('显示 placeholder', () => {
    const wrapper = createWrapper({ placeholder: '请选择盲板' })
    const input = wrapper.find('input')
    expect(input.attributes('placeholder')).toBe('请选择盲板')
  })

  it('默认为请选择', () => {
    const wrapper = createWrapper()
    const input = wrapper.find('input')
    expect(input.attributes('placeholder')).toBe('请选择')
  })

  it('disabled 时输入框不可用', () => {
    const wrapper = createWrapper({ disabled: true })
    const input = wrapper.find('input')
    expect(input.attributes('disabled')).toBeDefined()
  })
})

describe('LookupPicker — 弹窗交互', () => {
  it('点击输入框打开弹窗', async () => {
    const wrapper = createWrapper()
    await wrapper.find('input').trigger('click')
    await nextTick()
    expect(document.body.querySelector('.el-dialog') !== null).toBeTruthy()
  })

  it('disabled 时点击不打开弹窗', async () => {
    const wrapper = createWrapper({ disabled: true })
    await wrapper.find('input').trigger('click')
    await nextTick()
    expect(wrapper.find('.el-dialog__wrapper').exists()).toBe(false)
  })

  it('打开弹窗时调用 fetchApi', async () => {
    const fetchApi = vi.fn().mockResolvedValue({ rows: [], total: 0 })
    const wrapper = createWrapper({ fetchApi })
    await wrapper.find('input').trigger('click')
    await nextTick()
    expect(fetchApi).toHaveBeenCalled()
  })
})

describe('LookupPicker — 单选', () => {
  it('显示选中行 displayField', async () => {
    const wrapper = createWrapper({
      modelValue: { code: 'BL-001', name: '盲板A' },
      displayField: 'code',
    })
    await nextTick()
    const input = wrapper.find('input')
    expect(input.element.value).toBe('BL-001')
  })

  it('默认 displayField 取 columns 第一列 prop', async () => {
    const wrapper = createWrapper({
      modelValue: { code: 'BL-001', name: '盲板A' },
    })
    await nextTick()
    const input = wrapper.find('input')
    expect(input.element.value).toBe('BL-001')
  })

  it('单选选中：emit 显示文本字符串，而非整行对象', async () => {
    const wrapper = createWrapper({
      modelValue: null,
      displayField: 'code',
    })
    await wrapper.find('input').trigger('click')
    await nextTick()
    const vm = wrapper.vm as any
    vm.handleRowClick({ id: '1', code: 'BL-001', name: '盲板A' })
    await nextTick()
    const emitted = wrapper.emitted('update:modelValue')!
    expect(emitted[emitted.length - 1][0]).toBe('BL-001')
  })

  it('回显：modelValue 为字符串时直接显示', async () => {
    const wrapper = createWrapper({ modelValue: 'BL-001', displayField: 'code' })
    await nextTick()
    expect(wrapper.find('input').element.value).toBe('BL-001')
  })

  it('回显：modelValue 为旧整行对象时兼容显示', async () => {
    const wrapper = createWrapper({ modelValue: { code: 'BL-001', name: '盲板A' }, displayField: 'code' })
    await nextTick()
    expect(wrapper.find('input').element.value).toBe('BL-001')
  })
})

describe('LookupPicker — 多选', () => {
  it('确认选择：emit 快照数组（id + displayField + 配置列，无脏字段）', async () => {
    const wrapper = createWrapper({
      modelValue: [],
      mode: 'multiple',
      displayField: 'name',
      columns: [{ prop: 'code', label: '编号' }, { prop: 'name', label: '名称' }],
    })
    await wrapper.find('input').trigger('click')
    await nextTick()
    const vm = wrapper.vm as any
    vm.tempSelection = [
      { id: 'u1', data: { code: 'BL-001', name: '张三', level: 'P7' }, version: 1 },
      { id: 'u2', data: { code: 'BL-002', name: '李四', level: 'P6' }, version: 1 },
    ]
    vm.confirmSelection()
    await nextTick()
    const emitted = wrapper.emitted('update:modelValue')!
    expect(emitted[emitted.length - 1][0]).toEqual([
      { id: 'u1', name: '张三', code: 'BL-001' },
      { id: 'u2', name: '李四', code: 'BL-002' },
    ])
  })

  it('多选回显：输入框显示所有快照的 displayField 值（逗号分隔）', async () => {
    const wrapper = createWrapper({
      modelValue: [{ id: 'u1', name: '张三' }, { id: 'u2', name: '李四' }],
      mode: 'multiple',
      displayField: 'name',
    })
    await nextTick()
    expect(wrapper.find('input').element.value).toBe('张三,李四')
  })

  it('多选清除：emit 空数组', async () => {
    const wrapper = createWrapper({ modelValue: [{ id: 'u1', name: '张三' }], mode: 'multiple' })
    await nextTick()
    const vm = wrapper.vm as any
    vm.handleClear()
    await nextTick()
    const emitted = wrapper.emitted('update:modelValue')!
    expect(emitted[emitted.length - 1][0]).toEqual([])
  })
})

describe('LookupPicker — 清除', () => {
  it('clearable 默认为 true', () => {
    const wrapper = createWrapper()
    expect(wrapper.props('clearable')).toBe(true)
  })
})

// ----- form-create 适配测试 -----

describe('LookupPicker — form-create 适配', () => {
  /**
   * 模拟 form-create 的 formCreateInject 注入对象。
   * api.setValue 用于将选中行的字段回填到表单的其他字段。
   */
  function createFormCreateWrapper(props: any = {}, inject?: { api: { setValue: ReturnType<typeof vi.fn> } } | null) {
    const defaultApi = { setValue: vi.fn() }
    const formCreateInject = inject ?? { api: defaultApi }
    return mount(LookupPicker, {
      props: {
        modelValue: null,
        fetchApi: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
        columns: [{ prop: 'code', label: '编号' }, { prop: 'name', label: '名称' }],
        returnFields: { code: 'formCode', name: 'formName' },
        displayField: 'code',
        ...props,
      },
      global: {
        plugins: [ElementPlus],
        provide: {
          formCreateInject,
        },
      },
    })
  }

  it('选中行时通过 api.setValue 回填 returnFields', async () => {
    const setValue = vi.fn()
    const wrapper = createFormCreateWrapper(
      {},
      { api: { setValue } },
    )
    // 打开弹窗
    await wrapper.find('input').trigger('click')
    await nextTick()
    // 模拟表格行点击（handleRowClick）
    const row = { code: 'BL-001', name: '盲板A' }
    const vm = wrapper.vm as any
    vm.handleRowClick(row)
    await nextTick()
    // 应该 emit update:modelValue
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    // 应该调用 api.setValue 回填 returnFields
    expect(setValue).toHaveBeenCalledWith('formCode', 'BL-001')
    expect(setValue).toHaveBeenCalledWith('formName', '盲板A')
  })

  it('清除选择时通过 api.setValue(targetField, null) 清空 returnFields', async () => {
    const setValue = vi.fn()
    const wrapper = createFormCreateWrapper(
      { modelValue: { code: 'BL-001', name: '盲板A' } },
      { api: { setValue } },
    )
    await nextTick()
    // 触发清除
    const vm = wrapper.vm as any
    vm.handleClear()
    await nextTick()
    // 应该 emit update:modelValue 为 null
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    const emitted = wrapper.emitted('update:modelValue')!
    expect(emitted[emitted.length - 1][0]).toBeNull()
    // 应该调用 api.setValue 清空 returnFields
    expect(setValue).toHaveBeenCalledWith('formCode', null)
    expect(setValue).toHaveBeenCalledWith('formName', null)
  })

  it('无 formCreateInject 时仍正常工作（向后兼容）', async () => {
    // 不提供 inject
    const wrapper = mount(LookupPicker, {
      props: {
        modelValue: null,
        fetchApi: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
        columns: [{ prop: 'code', label: '编号' }],
        returnFields: { code: 'formCode' },
        displayField: 'code',
      },
      global: {
        plugins: [ElementPlus],
      },
    })
    // 选中行不应报错
    const row = { code: 'BL-002' }
    const vm = wrapper.vm as any
    vm.handleRowClick(row)
    await nextTick()
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    // 清除也不应报错
    vm.handleClear()
    await nextTick()
    expect(wrapper.emitted('clear')).toBeTruthy()
  })

  it('单选选中：配置 idField 时经 api.setValue 写入 id', async () => {
    const setValue = vi.fn()
    const wrapper = createFormCreateWrapper(
      { idField: 'emp_id' },
      { api: { setValue } },
    )
    await wrapper.find('input').trigger('click')
    await nextTick()
    const vm = wrapper.vm as any
    vm.handleRowClick({ id: 'u1', code: 'BL-001', name: '盲板A' })
    await nextTick()
    expect(setValue).toHaveBeenCalledWith('emp_id', 'u1')
  })

  it('单选清除：同时清空 idField', async () => {
    const setValue = vi.fn()
    const wrapper = createFormCreateWrapper(
      { modelValue: 'BL-001', idField: 'emp_id' },
      { api: { setValue } },
    )
    await nextTick()
    const vm = wrapper.vm as any
    vm.handleClear()
    await nextTick()
    expect(setValue).toHaveBeenCalledWith('emp_id', null)
  })
})

// ============================================================
// fetch 配置模式（设计器 schema 可序列化的数据源配置）
// ============================================================

vi.mock('@/utils/http', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

import http from '@/utils/http'
import { buildFetchApiFromConfig } from '../lookupFetch'

const mockHttp = http as any

beforeEach(() => {
  mockHttp.get.mockReset()
  mockHttp.post.mockReset()
})

describe('buildFetchApiFromConfig — GET', () => {
  it('从 R.data 的 parse 表达式提取 rows 与 total', async () => {
    mockHttp.get.mockResolvedValue({
      code: 200,
      data: { records: [{ id: '1', name: '张三' }], total: 1 },
    })
    const fetchApi = buildFetchApiFromConfig({
      action: '/v1/biz-data/emp_profile',
      method: 'GET',
      parse: 'records',
    })
    const res = await fetchApi({ page: 1, size: 10 })
    expect(mockHttp.get).toHaveBeenCalledWith('/v1/biz-data/emp_profile', expect.objectContaining({}))
    expect(res).toEqual({ rows: [{ id: '1', name: '张三' }], total: 1 })
  })

  it('parse 缺省时依次尝试 rows 与 records，total 缺省取 data.total', async () => {
    mockHttp.get.mockResolvedValue({
      code: 200,
      data: { rows: [{ id: '2' }], total: 7 },
    })
    const fetchApi = buildFetchApiFromConfig({ action: '/v1/xxx' })
    expect(await fetchApi({ page: 1, size: 10 })).toEqual({ rows: [{ id: '2' }], total: 7 })
  })

  it('解析失败时返回空列表与长度兜底', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: { message: 'no data' } })
    const fetchApi = buildFetchApiFromConfig({ action: '/v1/empty', parse: 'list' })
    const res = await fetchApi({ page: 1, size: 10 })
    expect(res.rows).toEqual([])
    expect(res.total).toBe(0)
  })

  it('totalParse 显式指定时以约定路径为准', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: { content: [{ id: '3' }], page: { totalElements: 42 } } })
    const fetchApi = buildFetchApiFromConfig({ action: '/v1/x', parse: 'content', totalParse: 'page.totalElements' })
    expect(await fetchApi({ page: 1, size: 10 })).toEqual({ rows: [{ id: '3' }], total: 42 })
  })
})

describe('buildFetchApiFromConfig — POST 与固定参数', () => {
  it('POST 将固定 data 作 body、合并参数作 query', async () => {
    mockHttp.post.mockResolvedValue({
      code: 200,
      data: { list: [{ id: '4' }], total: 3 },
    })
    const fetchApi = buildFetchApiFromConfig({
      action: '/v1/search',
      method: 'POST',
      parse: 'list',
      data: { dept: 'A' },
    })
    await fetchApi({ page: 1, size: 10 })
    expect(mockHttp.post).toHaveBeenCalledWith(
      '/v1/search',
      { dept: 'A' },
      expect.objectContaining({ params: expect.objectContaining({ page: 1, size: 10, dept: 'A' }) }),
    )
    const res = await fetchApi({ page: 1, size: 10 })
    expect(res.rows).toEqual([{ id: '4' }])
    expect(res.total).toBe(3)
  })
})

describe('buildFetchApiFromConfig — 分页基准', () => {
  it('默认（无 pageBase）按原样透传 page（1 起 API）', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: { records: [], total: 0 } })
    const fetchApi = buildFetchApiFromConfig({ action: '/v1/users' })
    await fetchApi({ page: 2, size: 10 })
    const params = mockHttp.get.mock.calls[0][1].params
    expect(params.page).toBe(2)
  })

  it('pageBase=0 时把 el-pagination 的 1 起页码转为 0 起（底表接口）', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: { records: [], total: 0 } })
    const fetchApi = buildFetchApiFromConfig({ action: '/v1/biz-data/emp_profile', pageBase: 0 })
    await fetchApi({ page: 1, size: 10 })
    const params = mockHttp.get.mock.calls[0][1].params
    expect(params.page).toBe(0)
    await fetchApi({ page: 2, size: 10 })
    expect(mockHttp.get.mock.calls[1][1].params.page).toBe(1)
  })
})

describe('buildFetchApiFromConfig — 搜索参数匹配', () => {
  it('默认 searchParam 为 keyword：关键字映射到 query.keyword', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: { records: [], total: 0 } })
    const fetchApi = buildFetchApiFromConfig({ action: '/v1/biz-data/emp_profile', parse: 'records' })
    await fetchApi({ page: 1, size: 10, keyword: '张' })
    expect(mockHttp.get).toHaveBeenCalledWith(
      '/v1/biz-data/emp_profile',
      expect.objectContaining({ params: expect.objectContaining({ keyword: '张', page: 0, size: 10 }) }),
    )
  })

  it('自定义 searchParam 时关键字映射到指定参数名', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: { records: [], total: 0 } })
    const fetchApi = buildFetchApiFromConfig({ action: '/v1/users', searchParam: 'name' })
    await fetchApi({ page: 1, size: 10, keyword: '李' })
    expect(mockHttp.get).toHaveBeenCalledWith(
      '/v1/users',
      expect.objectContaining({ params: expect.objectContaining({ name: '李' }) }),
    )
  })

  it('配置 keywordColumn 时透传查询列名（底表按列搜索）', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: { records: [], total: 0 } })
    const fetchApi = buildFetchApiFromConfig({
      action: '/v1/biz-data/emp_profile',
      keywordColumn: 'name',
    })
    await fetchApi({ page: 1, size: 10, keyword: '王' })
    expect(mockHttp.get).toHaveBeenCalledWith(
      '/v1/biz-data/emp_profile',
      expect.objectContaining({ params: expect.objectContaining({ keyword: '王', keywordColumn: 'name' }) }),
    )
  })

  it('无关键字时 query 不携带 keyword 参数', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: { records: [], total: 0 } })
    const fetchApi = buildFetchApiFromConfig({ action: '/v1/biz-data/emp_profile' })
    await fetchApi({ page: 1, size: 10 })
    const params = mockHttp.get.mock.calls[0][1].params
    expect(params.keyword).toBeUndefined()
    expect(params.page).toBe(0)
  })
})

describe('LookupPicker — fetch 配置模式', () => {
  it('未配置任何数据源时打开弹窗给出提示且不请求', async () => {
    const wrapper = createWrapper({ fetchApi: undefined, fetch: undefined })
    await wrapper.find('input').trigger('click')
    await nextTick()
    expect(mockHttp.get).not.toHaveBeenCalled()
  })

  it('fetch 配置存在时打开弹窗调用 http.get 加载数据（biz-data 接口按 0 起分页）', async () => {
    mockHttp.get.mockResolvedValue({
      code: 200,
      data: { records: [{ id: '1', name: '张三' }], total: 1 },
    })
    const wrapper = createWrapper({
      fetchApi: undefined,
      fetch: { action: '/v1/biz-data/emp_profile', parse: 'records' },
    })
    await wrapper.find('input').trigger('click')
    await nextTick()
    await nextTick()
    expect(mockHttp.get).toHaveBeenCalledWith(
      '/v1/biz-data/emp_profile',
      expect.objectContaining({ params: expect.objectContaining({ page: 0, size: 10 }) }),
    )
  })

  it('fetchApi 函数优先于 fetch 配置', async () => {
    const fn = vi.fn().mockResolvedValue({ rows: [{ id: '9' }], total: 1 })
    const wrapper = createWrapper({
      fetchApi: fn,
      fetch: { action: '/v1/should-not-use' },
    })
    await wrapper.find('input').trigger('click')
    await nextTick()
    await nextTick()
    expect(fn).toHaveBeenCalled()
    expect(mockHttp.get).not.toHaveBeenCalledWith('/v1/should-not-use', expect.anything())
  })
})

// ============================================================
// BizDataVO 嵌套结构适配（底表接口返回 { id, data: {...}, version, ... }）
// ============================================================

describe('LookupPicker — BizDataVO 嵌套行', () => {
  it('displayText 从选中行 data 内层取 displayField', async () => {
    const wrapper = createWrapper({
      modelValue: { id: '1', data: { code: 'BL-001', name: '盲板A' }, version: 1 },
      displayField: 'code',
    })
    await nextTick()
    const input = wrapper.find('input')
    expect(input.element.value).toBe('BL-001')
  })

  it('displayText 无 data 内层时回退取顶层字段（外部 API 平铺行）', async () => {
    const wrapper = createWrapper({
      modelValue: { code: 'PLAIN-1', name: '平铺A' },
      displayField: 'code',
    })
    await nextTick()
    const input = wrapper.find('input')
    expect(input.element.value).toBe('PLAIN-1')
  })

  it('弹窗表格列从 row.data 内层取列值（readCellValue 嵌套取值）', async () => {
    const fetchApi = vi.fn().mockResolvedValue({
      rows: [{ id: '1', data: { code: 'BL-001', name: '盲板A' }, version: 1 }],
      total: 1,
    })
    const wrapper = createWrapper({ fetchApi })
    await wrapper.find('input').trigger('click')
    await nextTick()
    await nextTick()
    const vm = wrapper.vm as any
    // fetchData 已填充 tableData
    expect(vm.tableData.length).toBe(1)
    // 表格列 cell 通过 readCellValue 从 data 内层取值
    expect(vm.readCellValue(vm.tableData[0], 'code')).toBe('BL-001')
    expect(vm.readCellValue(vm.tableData[0], 'name')).toBe('盲板A')
    // 平铺行回退取顶层
    expect(vm.readCellValue({ code: 'PLAIN-1' }, 'code')).toBe('PLAIN-1')
  })

  it('选中 BizDataVO 行时回填 returnFields 取 data 内层字段', async () => {
    const setValue = vi.fn()
    const wrapper = mount(LookupPicker, {
      props: {
        modelValue: null,
        fetchApi: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
        columns: [{ prop: 'code', label: '编号' }, { prop: 'name', label: '名称' }],
        returnFields: { code: 'formCode', name: 'formName' },
        displayField: 'code',
      },
      global: {
        plugins: [ElementPlus],
        provide: { formCreateInject: { api: { setValue } } },
      },
    })
    await wrapper.find('input').trigger('click')
    await nextTick()
    const vm = wrapper.vm as any
    vm.handleRowClick({ id: '1', data: { code: 'BL-001', name: '盲板A' }, version: 1 })
    await nextTick()
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(setValue).toHaveBeenCalledWith('formCode', 'BL-001')
    expect(setValue).toHaveBeenCalledWith('formName', '盲板A')
  })
})