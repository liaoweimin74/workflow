// ----- TDD: ApproverPicker 组件测试 -----
// npx vitest run src/components/business/__tests__/ApproverPicker.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import ApproverPicker from '../ApproverPicker.vue'

// Mock API
vi.mock('@/api/org', () => ({
  getOrgTree: vi.fn().mockResolvedValue({ data: [] }),
}))

vi.mock('@/api/role', () => ({
  getRoleList: vi.fn().mockResolvedValue({ data: { rows: [], total: 0 } }),
}))

vi.mock('@/api/user', () => ({
  getUserList: vi.fn().mockResolvedValue({ data: { rows: [], total: 0 } }),
  getUserBatch: vi.fn().mockResolvedValue({ data: [] }),
}))

function createWrapper(props: any = {}) {
  return mount(ApproverPicker, {
    props: {
      modelValue: [],
      ...props,
    },
    global: {
      plugins: [ElementPlus],
    },
  })
}

describe('ApproverPicker — 基础渲染', () => {
  it('渲染输入框', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('input').exists()).toBe(true)
  })

  it('显示 placeholder', () => {
    const wrapper = createWrapper({ placeholder: '请选择审批人' })
    const input = wrapper.find('input')
    expect(input.attributes('placeholder')).toBe('请选择审批人')
  })

  it('disabled 时输入框不可用', () => {
    const wrapper = createWrapper({ disabled: true })
    const input = wrapper.find('input')
    expect(input.attributes('disabled')).toBeDefined()
  })
})

describe('ApproverPicker — 弹窗交互', () => {
  it('点击输入框打开弹窗', async () => {
    const wrapper = createWrapper()
    await wrapper.find('input').trigger('click')
    await nextTick()
    expect(document.body.querySelector('.el-dialog') !== null).toBeTruthy()
  })

  it('弹窗显示三栏布局', async () => {
    const wrapper = createWrapper()
    await wrapper.find('input').trigger('click')
    await nextTick()
    const dialog = document.body.querySelector('.el-dialog')
    expect(dialog).toBeTruthy()
    // 左栏 Tab：组织树 + 角色
    const tabs = dialog!.querySelectorAll('.el-tabs__item')
    expect(tabs.length).toBeGreaterThanOrEqual(2)
  })
})

describe('ApproverPicker — emit 契约', () => {
  it('确定时 emit update:modelValue (ID 数组)', async () => {
    const wrapper = createWrapper()
    const vm = wrapper.vm as any
    // 直接设置内部状态并调用 confirm
    vm.selectedUsers = [
      { id: 1, nickname: '张三', username: 'zhangsan', orgName: '技术部' },
      { id: 2, nickname: '李四', username: 'lisi', orgName: '产品部' },
    ]
    vm.handleConfirm()
    await nextTick()
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toEqual([1, 2])
  })

  it('确定时 emit change (对象数组)', async () => {
    const wrapper = createWrapper()
    const vm = wrapper.vm as any
    vm.selectedUsers = [
      { id: 1, nickname: '张三', username: 'zhangsan', orgName: '技术部' },
    ]
    vm.handleConfirm()
    await nextTick()
    const emitted = wrapper.emitted('change')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toHaveLength(1)
    expect((emitted![0][0] as any[])[0]).toMatchObject({
      id: 1,
      nickname: '张三',
    })
  })

  it('取消时不 emit', async () => {
    const wrapper = createWrapper()
    const vm = wrapper.vm as any
    vm.selectedUsers = [
      { id: 1, nickname: '张三', username: 'zhangsan', orgName: '技术部' },
    ]
    vm.handleCancel()
    await nextTick()
    expect(wrapper.emitted('update:modelValue')).toBeFalsy()
  })
})

describe('ApproverPicker — 显示文本', () => {
  it('0 人时显示空', () => {
    const wrapper = createWrapper()
    const input = wrapper.find('input')
    expect(input.element.value).toBe('')
  })

  it('1 人时显示昵称', async () => {
    const wrapper = createWrapper()
    const vm = wrapper.vm as any
    vm.selectedUsers = [
      { id: 1, nickname: '张三', username: 'zhangsan', orgName: '技术部' },
    ]
    await nextTick()
    const input = wrapper.find('input')
    expect(input.element.value).toContain('张三')
  })

  it('3 人时显示 "X、Y 等3人" 格式', async () => {
    const wrapper = createWrapper()
    const vm = wrapper.vm as any
    vm.selectedUsers = [
      { id: 1, nickname: '张三', username: 'zhangsan', orgName: '技术部' },
      { id: 2, nickname: '李四', username: 'lisi', orgName: '产品部' },
      { id: 3, nickname: '王五', username: 'wangwu', orgName: '运营部' },
    ]
    await nextTick()
    const input = wrapper.find('input')
    expect(input.element.value).toContain('张三')
    expect(input.element.value).toContain('李四')
    expect(input.element.value).toContain('3')
  })
})
