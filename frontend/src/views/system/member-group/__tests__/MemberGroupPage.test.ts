// ----- Task 95: MemberGroupPage 成员/规则录入改用数据引用（DataPicker） -----
// npx vitest run src/views/system/member-group/__tests__/MemberGroupPage.test.ts
//
// 覆盖：数据源绑定（user-tree 多选 / sys-posts·dept-tree 单选）、
//       添加成员（JSON id 解析→数字）、添加规则（岗位/组织维度）、空选择校验。

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import ElementPlus from 'element-plus'
import MemberGroupPage from '../MemberGroupPage.vue'

vi.mock('@/api/memberGroup', () => ({
  getMemberGroupList: vi.fn(),
  createMemberGroup: vi.fn(),
  updateMemberGroup: vi.fn(),
  deleteMemberGroup: vi.fn(),
  getGroupMembers: vi.fn(),
  addGroupMembers: vi.fn(),
  removeGroupMembers: vi.fn(),
  getGroupRules: vi.fn(),
  addGroupRule: vi.fn(),
  removeGroupRule: vi.fn(),
}))

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus')
  return {
    ...actual,
    ElMessage: { ...actual.ElMessage, success: vi.fn(), warning: vi.fn(), error: vi.fn() },
    ElMessageBox: { ...actual.ElMessageBox, confirm: vi.fn() },
  }
})

const api = (await import('@/api/memberGroup')) as any
const { ElMessage } = (await import('element-plus')) as any

const SearchTableStub = defineComponent({
  name: 'SearchTableStub',
  props: ['searchFields', 'columns', 'actionButtons', 'fetchApi', 'formConfig'],
  setup(_props, { expose }) {
    expose({ fetchList: vi.fn() })
    return () => h('div', { class: 'search-table-stub' })
  },
})

/** DataPicker 桩：透传关键 props 到 DOM 便于断言，测试用 $emit 模拟用户选择 */
const DataPickerStub = defineComponent({
  name: 'DataPickerStub',
  props: {
    modelValue: { type: String, default: '' },
    globalDataSourceId: { type: String, default: '' },
    displayField: { type: String, default: '' },
    columns: { type: Array, default: () => [] },
    searchColumns: { type: Array, default: () => [] },
    maxCount: { type: Number, default: undefined },
    placeholder: { type: String, default: '' },
  },
  emits: ['update:modelValue'],
  setup(props) {
    return () =>
      h('div', {
        class: 'data-picker-stub',
        'data-ds': props.globalDataSourceId,
        'data-max-count': props.maxCount === undefined ? '' : String(props.maxCount),
      })
  },
})

function group(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    groupName: '运维组',
    description: '',
    memberCount: 0,
    manualCount: 0,
    ruleCount: 0,
    createdAt: '2026-09-29 08:00:00',
    ...overrides,
  }
}

function mountPage() {
  return mount(MemberGroupPage, {
    global: {
      plugins: [ElementPlus],
      directives: {
        permission: { mounted() {}, updated() {} },
      },
      stubs: { SearchTable: SearchTableStub, DataPicker: DataPickerStub },
    },
  })
}

/** 打开抽屉（模拟点击第一行的成员管理按钮） */
async function openDrawer(wrapper: ReturnType<typeof mountPage>) {
  const table = wrapper.findComponent(SearchTableStub)
  const manage = (table.props('actionButtons') as any[])[0]
  await manage.onClick(group())
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(api.getMemberGroupList as any).mockResolvedValue({ data: { rows: [group()], total: 1 } })
  ;(api.getGroupMembers as any).mockResolvedValue({ data: { rows: [], total: 0 } })
  ;(api.getGroupRules as any).mockResolvedValue({ data: [] })
  ;(api.addGroupMembers as any).mockResolvedValue({ code: 200, data: null })
  ;(api.addGroupRule as any).mockResolvedValue({ code: 200, data: null })
})

describe('MemberGroupPage 数据引用录入（Task 95）', () => {
  it('操作列提供「成员管理」入口', () => {
    const wrapper = mountPage()
    const table = wrapper.findComponent(SearchTableStub)
    const labels = (table.props('actionButtons') as any[]).map((b) => b.label)
    expect(labels).toContain('成员管理')
    wrapper.unmount()
  })

  it('成员 Tab：DataPicker 绑定系统用户源（多选），解析 JSON id 后提交', async () => {
    const wrapper = mountPage()
    await openDrawer(wrapper)

    const pickers = wrapper.findAllComponents(DataPickerStub)
    expect(pickers.length).toBe(2) // 成员 picker + 岗位规则 picker（v-if 默认 position）
    const memberPicker = pickers[0]
    expect(memberPicker.attributes('data-ds')).toBe('ds-builtin-user-tree')
    expect(memberPicker.attributes('data-max-count')).toBe('') // 不限数量 = 多选

    // 模拟用户在弹窗勾选 2 名成员并确认
    memberPicker.vm.$emit('update:modelValue', '["1","2"]')
    await flushPromises()

    const addBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('添加成员'))!
    await addBtn.trigger('click')
    await flushPromises()

    expect(api.addGroupMembers).toHaveBeenCalledWith(7, [1, 2])
    expect(ElMessage.success).toHaveBeenCalledWith('已添加 2 名成员')
    // 提交后清空待选值
    expect(memberPicker.props('modelValue') as string).toBe('')
    wrapper.unmount()
  })

  it('未选择成员时点击添加 → warning 不调接口', async () => {
    const wrapper = mountPage()
    await openDrawer(wrapper)

    const addBtn = wrapper.findAll('button').find((b) => b.text().includes('添加成员'))!
    await addBtn.trigger('click')
    await flushPromises()

    expect(ElMessage.warning).toHaveBeenCalledWith('请先选择要添加的成员')
    expect(api.addGroupMembers).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('规则 Tab·按岗位：DataPicker 绑定系统岗位源（单选），提交解析第一个 id', async () => {
    const wrapper = mountPage()
    await openDrawer(wrapper)

    // 切到「自动规则」页签（drawer 未开 append-to-body，内容在 wrapper 内）
    const tabItems = wrapper.element.querySelectorAll('.el-tabs__item')
    ;(tabItems[1] as HTMLElement).click()
    await flushPromises()

    const pickers = wrapper.findAllComponents(DataPickerStub)
    const postPicker = pickers.find((p) => p.attributes('data-ds') === 'ds-builtin-sys-posts')!
    expect(postPicker).toBeDefined()
    expect(postPicker.attributes('data-max-count')).toBe('1') // 单选

    postPicker.vm.$emit('update:modelValue', '["5"]')
    await flushPromises()

    const addRuleBtn = wrapper.findAll('button').find((b) => b.text().includes('添加规则'))!
    await addRuleBtn.trigger('click')
    await flushPromises()

    expect(api.addGroupRule).toHaveBeenCalledWith(7, 'position', 5)
    expect(postPicker.props('modelValue') as string).toBe('')
    wrapper.unmount()
  })

  it('规则 Tab·按组织机构：切换维度后 DataPicker 换绑组织机构源', async () => {
    const wrapper = mountPage()
    await openDrawer(wrapper)

    const tabItems = wrapper.element.querySelectorAll('.el-tabs__item')
    ;(tabItems[1] as HTMLElement).click()
    await flushPromises()

    // 切维度为「按组织机构」（rule-add-bar 里第一个 select）
    const selects = wrapper.element.querySelectorAll('.rule-add-bar .el-select')
    ;(selects[0] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    const options = Array.from(document.body.querySelectorAll('.el-select-dropdown__item'))
    const orgOption = options.find((o) => o.textContent?.includes('按组织机构')) as HTMLElement
    orgOption.click()
    await flushPromises()

    const orgPicker = wrapper
      .findAllComponents(DataPickerStub)
      .find((p) => p.attributes('data-ds') === 'ds-builtin-dept-tree')!
    expect(orgPicker).toBeDefined()
    expect(orgPicker.attributes('data-max-count')).toBe('1')

    orgPicker.vm.$emit('update:modelValue', '["3"]')
    await flushPromises()

    const addRuleBtn = wrapper.findAll('button').find((b) => b.text().includes('添加规则'))!
    await addRuleBtn.trigger('click')
    await flushPromises()

    expect(api.addGroupRule).toHaveBeenCalledWith(7, 'org', 3)
    wrapper.unmount()
  })
})
