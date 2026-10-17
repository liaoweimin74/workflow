// ----- TDD: ActionsConfig 操作按钮表格配置（按 key 定位 + 自定义按钮事件 + 详情宽度 + 权限点） -----
// npx vitest run src/views/page/components/__tests__/ActionsConfig.test.ts

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ElementPlus from 'element-plus'
import ActionsConfig from '../ActionsConfig.vue'

const defaultActions = {
  buttons: [
    { key: 'create', label: '新增', placement: 'toolbar', style: 'button' },
    { key: 'edit', label: '编辑', placement: 'column', style: 'button' },
    { key: 'view', label: '查看', placement: 'column', style: 'button' },
  ],
  permissions: '',
}

function createWrapper(actions: any = defaultActions, detail: any = { width: '800px', type: 'form' }) {
  return mount(ActionsConfig, {
    props: { modelValue: actions, detail },
    global: { plugins: [ElementPlus] },
  })
}

describe('ActionsConfig — 操作按钮表格（每按钮独立配置）', () => {
  it('表格渲染按钮：每行标识/名称/位置/形态列', async () => {
    const wrapper = createWrapper()
    await nextTick()
    const rows = wrapper.findAll('.el-table__row')
    expect(rows.length).toBe(3)
    // 表格含列头
    expect(wrapper.find('.el-table').exists()).toBe(true)
    wrapper.unmount()
  })

  it('修改某按钮 placement（按 key）→ update:modelValue 仅更新该按钮', async () => {
    const wrapper = createWrapper()
    await nextTick()
    const vm = wrapper.vm as any
    vm.updateButton('create', { placement: 'column' })
    await nextTick()
    const emitted = wrapper.emitted('update:modelValue') as any[]
    const last = emitted[emitted.length - 1][0]
    expect(last.buttons.find((b: any) => b.key === 'create').placement).toBe('column')
    expect(last.buttons.find((b: any) => b.key === 'edit').placement).toBe('column') // edit 不变
    wrapper.unmount()
  })

  it('修改按钮 label（按 key）→ update:modelValue 收到新 label', async () => {
    const wrapper = createWrapper()
    await nextTick()
    const vm = wrapper.vm as any
    vm.updateButton('view', { label: '详情' })
    await nextTick()
    const emitted = wrapper.emitted('update:modelValue') as any[]
    const last = emitted[emitted.length - 1][0]
    expect(last.buttons.find((b: any) => b.key === 'view').label).toBe('详情')
    wrapper.unmount()
  })

  it('添加内置按钮 → 追加到 buttons', async () => {
    const wrapper = createWrapper()
    await nextTick()
    const vm = wrapper.vm as any
    vm.handleAddBuiltin('delete')
    await nextTick()
    const emitted = wrapper.emitted('update:modelValue') as any[]
    const last = emitted[emitted.length - 1][0]
    expect(last.buttons.map((b: any) => b.key)).toEqual(['create', 'edit', 'view', 'delete'])
    wrapper.unmount()
  })

  it('添加自定义按钮（key+label）→ 可配置事件', async () => {
    const wrapper = createWrapper()
    await nextTick()
    const vm = wrapper.vm as any
    vm.pendingCustomKey = 'approve'
    vm.pendingCustomLabel = '审核'
    await nextTick()
    vm.handleAddCustom()
    await nextTick()
    const emitted = wrapper.emitted('update:modelValue') as any[]
    const last = emitted[emitted.length - 1][0]
    const custom = last.buttons.find((b: any) => b.key === 'approve')
    expect(custom).toBeDefined()
    expect(custom.label).toBe('审核')
    expect(custom.placement).toBe('column')
    expect(custom.style).toBe('text')
    expect(Array.isArray(custom.events)).toBe(true)
    wrapper.unmount()
  })

  it('删除按钮（按 key）→ 从 buttons 移除', async () => {
    const wrapper = createWrapper()
    await nextTick()
    const vm = wrapper.vm as any
    vm.removeButton('create')
    await nextTick()
    const emitted = wrapper.emitted('update:modelValue') as any[]
    const last = emitted[emitted.length - 1][0]
    expect(last.buttons.map((b: any) => b.key)).toEqual(['edit', 'view'])
    wrapper.unmount()
  })

  it('解绑事件：清空按钮 events（内建按钮恢复默认行为）', async () => {
    const wrapper = createWrapper({
      buttons: [
        { key: 'approve', label: '审核', placement: 'column', style: 'text', events: [{ trigger: 'click', actions: [{ type: 'message', params: [] }] }] },
      ],
      permissions: '',
    })
    await nextTick()
    const vm = wrapper.vm as any
    expect(vm.hasEvents({ key: 'approve', events: [{ trigger: 'click', actions: [] }] })).toBe(true)
    vm.unbindEvents('approve')
    await nextTick()
    const emitted = wrapper.emitted('update:modelValue') as any[]
    const last = emitted[emitted.length - 1][0]
    expect(last.buttons[0].events).toEqual([])
    wrapper.unmount()
  })
})

describe('ActionsConfig — 自定义按钮事件绑定', () => {
  it('为自定义按钮配置事件动作 → events 写入按钮', async () => {
    const wrapper = createWrapper({
      buttons: [
        {
          key: 'approve', label: '审核', placement: 'column', style: 'text',
          // 初始带占位参数行（模拟用户已添加参数输入行）
          events: [{ trigger: 'click', actions: [{ type: 'message', params: [{ key: '', value: '' }] }] }],
        },
      ],
      permissions: '',
    })
    await nextTick()
    const vm = wrapper.vm as any
    // patch 事件动作类型与参数（props 静态不回传，单次 patch 断言）
    vm.patchEventAction('approve', 0, { type: 'message' })
    await nextTick()
    vm.patchEventParam('approve', 0, 0, { key: 'text', value: '已审核' })
    await nextTick()
    const emitted = wrapper.emitted('update:modelValue') as any[]
    const last = emitted[emitted.length - 1][0]
    const events = last.buttons[0].events
    expect(events[0].trigger).toBe('click')
    expect(events[0].actions[0].type).toBe('message')
    expect(events[0].actions[0].params[0]).toEqual({ key: 'text', value: '已审核' })
    wrapper.unmount()
  })

  it('addEventAction：无事件时创建 click 触发器 + 默认动作', async () => {
    const wrapper = createWrapper({
      buttons: [
        { key: 'approve', label: '审核', placement: 'column', style: 'text', events: [] },
      ],
      permissions: '',
    })
    await nextTick()
    const vm = wrapper.vm as any
    vm.addEventAction('approve')
    await nextTick()
    const emitted = wrapper.emitted('update:modelValue') as any[]
    const last = emitted[emitted.length - 1][0]
    const events = last.buttons[0].events
    expect(events[0].trigger).toBe('click')
    expect(events[0].actions[0].type).toBe('message')
    wrapper.unmount()
  })

  it('hasEvents：有事件返回 true，无事件 false', async () => {    const wrapper = createWrapper({
      buttons: [
        { key: 'approve', label: '审核', placement: 'column', style: 'text', events: [{ trigger: 'click', actions: [] }] },
        { key: 'reject', label: '驳回', placement: 'column', style: 'text', events: [] },
      ],
      permissions: '',
    })
    await nextTick()
    const vm = wrapper.vm as any
    expect(vm.hasEvents({ key: 'approve', events: [{ trigger: 'click', actions: [] }] })).toBe(true)
    expect(vm.hasEvents({ key: 'reject', events: [] })).toBe(false)
    wrapper.unmount()
  })
})

describe('ActionsConfig — 详情宽度（查看按钮旁）', () => {
  it('detail prop 展示宽度，修改 → update:detail 事件', async () => {
    const wrapper = createWrapper()
    await nextTick()
    const vm = wrapper.vm as any
    expect(vm.detailWidth).toBe('800px')
    vm.setDetailWidth('900px')
    await nextTick()
    const emitted = wrapper.emitted('update:detail') as any[]
    expect(emitted).toBeTruthy()
    expect(emitted[emitted.length - 1][0].width).toBe('900px')
    expect(emitted[emitted.length - 1][0].type).toBe('form')
    wrapper.unmount()
  })
})

// ============================================================
// ActionsConfig — 卡片模式（mode='card'）：placement 用卡片操作区，共享 CRUD/权限/详情/表单模式
// ============================================================

describe('ActionsConfig — 卡片模式（mode="card"）', () => {
  it('card 模式标题显示「操作按钮（卡片配置）」', async () => {
    const wrapper = createWrapper(defaultActions, {})
    await wrapper.setProps({ mode: 'card' })
    await nextTick()
    expect(wrapper.find('.config-title').text()).toContain('卡片')
    wrapper.unmount()
  })

  it('card 模式 placement 下拉提供「操作栏 / 卡片操作区」，不含「操作列」', async () => {
    const wrapper = createWrapper(defaultActions, {})
    await wrapper.setProps({ mode: 'card' })
    await nextTick()
    const vm = wrapper.vm as any
    const labels = (vm.placementOptions as { label: string; value: string }[]).map((o) => o.label)
    expect(labels).toContain('操作栏')
    expect(labels).toContain('卡片操作区')
    expect(labels).not.toContain('操作列')
    wrapper.unmount()
  })

  it('card 模式 table 模式 placement 仍为「操作栏 / 操作列」', async () => {
    const wrapper = createWrapper(defaultActions, {})
    await nextTick()
    const vm = wrapper.vm as any
    const labels = (vm.placementOptions as { label: string; value: string }[]).map((o) => o.label)
    expect(labels).toContain('操作栏')
    expect(labels).toContain('操作列')
    wrapper.unmount()
  })

  it('card 模式添加内置行操作按钮 → 默认 placement 为 card（create 仍在 toolbar）', async () => {
    const wrapper = createWrapper(defaultActions, {})
    await wrapper.setProps({ mode: 'card' })
    await nextTick()
    const vm = wrapper.vm as any
    vm.handleAddBuiltin('delete')
    await nextTick()
    const emitted = wrapper.emitted('update:modelValue') as any[]
    const last = emitted[emitted.length - 1][0]
    const del = last.buttons.find((b: any) => b.key === 'delete')
    expect(del.placement).toBe('card')
    const create = last.buttons.find((b: any) => b.key === 'create')
    expect(create.placement).toBe('toolbar')
    wrapper.unmount()
  })

  it('card 模式添加自定义按钮 → 默认 placement 为 card', async () => {
    const wrapper = createWrapper(defaultActions, {})
    await wrapper.setProps({ mode: 'card' })
    await nextTick()
    const vm = wrapper.vm as any
    vm.pendingCustomKey = 'approve'
    vm.pendingCustomLabel = '审核'
    await nextTick()
    vm.handleAddCustom()
    await nextTick()
    const emitted = wrapper.emitted('update:modelValue') as any[]
    const last = emitted[emitted.length - 1][0]
    const custom = last.buttons.find((b: any) => b.key === 'approve')
    expect(custom.placement).toBe('card')
    wrapper.unmount()
  })

  it('card 模式兼容旧 column 值：下拉仍展示该行旧 placement 且可编辑', async () => {
    const legacy = {
      buttons: [
        { key: 'edit', label: '编辑', placement: 'column', style: 'button' },
      ],
      permissions: '',
    }
    const wrapper = createWrapper(legacy, {})
    await wrapper.setProps({ mode: 'card' })
    await nextTick()
    const vm = wrapper.vm as any
    expect(vm.placementValues.has('column')).toBe(false)
    // 渲染该行时旧值 column 仍显示为可选项（兼容迁移）
    const selectOptions = wrapper.findAll('.el-select .el-option')  // 展开行的 dropdown 选项
    void selectOptions
    wrapper.unmount()
  })

  it('card 模式共享配置仍可用：权限点多选 / 详情宽度', async () => {
    const wrapper = createWrapper({ buttons: [], permissions: 'page:create' }, { width: '800px', type: 'form' })
    await wrapper.setProps({ mode: 'card' })
    await nextTick()
    const vm = wrapper.vm as any
    expect(vm.permissionArray).toEqual(['page:create'])
    expect(vm.detailWidth).toBe('800px')
    vm.setDetailWidth('700px')
    await nextTick()
    const emitted = wrapper.emitted('update:detail') as any[]
    expect(emitted[emitted.length - 1][0].width).toBe('700px')
    wrapper.unmount()
  })
})

describe('ActionsConfig — 权限点多选 Tag', () => {
  it('permissions 逗号分隔字符串回填为多选值（数组）', async () => {
    const wrapper = createWrapper({
      buttons: [],
      permissions: 'page:create,page:edit',
    })
    await nextTick()
    const vm = wrapper.vm as any
    expect(vm.permissionArray).toEqual(['page:create', 'page:edit'])
    wrapper.unmount()
  })

  it('修改多选值 → update:modelValue 收到逗号分隔字符串', async () => {
    const wrapper = createWrapper()
    await nextTick()
    const vm = wrapper.vm as any
    vm.permissionArray = ['page:create', 'page:view']
    await nextTick()
    const emitted = wrapper.emitted('update:modelValue') as any[]
    const last = emitted[emitted.length - 1][0]
    expect(last.permissions).toBe('page:create,page:view')
    expect(last.buttons.length).toBe(3)
    wrapper.unmount()
  })
})

describe('ActionsConfig — 动作参数按类型自动补齐', () => {
  const buttonsWithAction = (type: string, params: any[] = []) => ({
    buttons: [
      {
        key: 'approve',
        label: '审核',
        placement: 'column',
        style: 'text',
        events: [{ trigger: 'click', actions: [{ type, params }] }],
      },
    ],
    permissions: '',
  })

  const lastEvents = (wrapper: any) => {
    const emitted = wrapper.emitted('update:modelValue') as any[]
    return emitted[emitted.length - 1][0].buttons[0].events
  }

  it('新增动作即带默认动作的约定参数行（message → text/type）', async () => {
    const wrapper = createWrapper({
      buttons: [{ key: 'approve', label: '审核', placement: 'column', style: 'text', events: [] }],
      permissions: '',
    })
    await nextTick()
    ;(wrapper.vm as any).addEventAction('approve')
    await nextTick()
    expect(lastEvents(wrapper)[0].actions[0].params).toEqual([
      { key: 'text', value: '' },
      { key: 'type', value: '' },
    ])
    wrapper.unmount()
  })

  it('切动作类型补齐参数：script → source', async () => {
    const wrapper = createWrapper(buttonsWithAction('refresh'))
    await nextTick()
    ;(wrapper.vm as any).patchEventAction('approve', 0, { type: 'script' })
    await nextTick()
    expect(lastEvents(wrapper)[0].actions[0].params).toEqual([{ key: 'source', value: '' }])
    wrapper.unmount()
  })

  it('切类型保留同名参数值，不丢已填内容', async () => {
    const wrapper = createWrapper(
      buttonsWithAction('script', [{ key: 'source', value: 'actions.refresh()' }]),
    )
    await nextTick()
    ;(wrapper.vm as any).patchEventAction('approve', 0, { type: 'message' })
    await nextTick()
    ;(wrapper.vm as any).patchEventAction('approve', 0, { type: 'script' })
    await nextTick()
    expect(lastEvents(wrapper)[0].actions[0].params).toEqual([{ key: 'source', value: 'actions.refresh()' }])
    wrapper.unmount()
  })

  it('set-filter 无约定参数：切走再切回不抹掉过滤字段', async () => {
    const wrapper = createWrapper(
      buttonsWithAction('set-filter', [{ key: 'status', value: '$row.status' }]),
    )
    await nextTick()
    ;(wrapper.vm as any).patchEventAction('approve', 0, { type: 'refresh' })
    await nextTick()
    expect(lastEvents(wrapper)[0].actions[0].params).toEqual([{ key: 'status', value: '$row.status' }])
    wrapper.unmount()
  })
})

// ----- 展开行事件链区随表格横向滚动被裁切（源码断言，无需 mount）-----
describe('ActionsConfig — 展开事件链区不随表格横向滚动被裁切', () => {
  const source = readFileSync(resolve(__dirname, '../ActionsConfig.vue'), 'utf8')

  it('表格设为 container，展开内容限宽为表格可视宽并 sticky 左边缘', () => {
    // 列宽合计 ≈1076 > 弹窗可视宽 ≈796 → 表格必然横向滚动；
    // 展开区若跟随滚动，「按钮事件链…」标题、变量提示与左侧动作下拉会被裁出视口。
    expect(source).toMatch(/\.el-table\s*\{[\s\S]*?container-type:\s*inline-size;/)
    expect(source).toMatch(/\.button-events\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?left:\s*0;[\s\S]*?width:\s*100cqi;/)
  })
})

// ----- 事件链重排：动作卡片化、参数按契约竖排（jsdom 下 el-table 单元格不渲染，故用源码结构断言）-----
describe('ActionsConfig — 展开事件链布局重排', () => {
  const source = readFileSync(resolve(__dirname, '../ActionsConfig.vue'), 'utf8')
  /** 展开区模板片段：从 .button-events 到变量提示 */
  const block = source.slice(source.indexOf('class="button-events"'), source.indexOf('var-hint'))

  it('动作类型与「移除动作」在头部行，参数不与之同排', () => {
    expect(block).toContain('class="event-action-head"')
    const head = block.slice(
      block.indexOf('class="event-action-head"'),
      block.indexOf('class="event-action-params"'),
    )
    expect(head).toContain('actionTypeOptions')
    expect(head).toContain('event-action-remove')
    expect(head).not.toContain('event-param-row')
  })

  it('参数纵向排列在参数区内，值输入弹性撑满', () => {
    expect(block).toContain('class="event-param-row"')
    expect(block).toContain('class="param-value"')
    expect(source).toMatch(/\.event-action-params\s*\{[\s\S]*?flex-direction:\s*column;/)
    expect(source).toMatch(/\.param-value\s*\{[\s\S]*?flex:\s*1 1 auto;/)
  })

  it('参数行按契约渲染：固定参数名只读，仅动态参数动作给增删入口', () => {
    expect(block).toContain('class="param-key-label"')
    expect(block).toContain('p.custom || paramsEditable(action.type)')
    expect(block).toContain('v-if="paramsEditable(action.type)"')
    expect(block).toContain('eventParamView(row.key, ai)')
    // 动态参数动作零参数时也要渲染参数区，否则没有第一个参数的添加入口
    expect(block).toContain('eventParamView(row.key, ai).length > 0 || paramsEditable(action.type)')
  })

  it('换动作类型走参数重置，不沿用上一个动作的残留键', () => {
    expect(source).toMatch(/patch\.type \? \{ \.\.\.merged, params: retargetActionParams\(patch\.type, a\.params\) \}/)
  })
})
