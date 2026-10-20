// TDD: 角色数据权限弹窗（权限对象 × 读/写勾选）
// npx vitest run src/views/system/role/__tests__/RoleDataPermissionDialog.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import RoleDataPermissionDialog from '../RoleDataPermissionDialog.vue'

const { getRoleDataPermissions, saveRoleDataPermissions } = vi.hoisted(() => ({
  getRoleDataPermissions: vi.fn(),
  saveRoleDataPermissions: vi.fn(),
}))

vi.mock('@/api/role', () => ({ getRoleDataPermissions, saveRoleDataPermissions }))

vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus')
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

const ROLE = { id: 3, roleName: '职员', roleCode: 'ROLE_CLERK', description: null, status: 1, createdAt: '' } as any

const mounted: any[] = []

async function mountDialog() {
  getRoleDataPermissions.mockResolvedValue({
    data: [
      {
        permissionId: 1,
        permissionName: '销售本人',
        remark: '只看自己的',
        conditions: [{ column: 'created_by', op: 'eq', value: '{userId}' }],
        dataSourceIds: ['ds-1', 'ds-2'],
        read: true,
        write: false,
      },
      {
        permissionId: 2,
        permissionName: '部门共享',
        remark: null,
        conditions: [{ column: 'dept_id', op: 'in', value: ['{orgIdSubtree}'] }],
        dataSourceIds: ['ds-1'],
        read: false,
        write: true,
      },
    ],
  })
  saveRoleDataPermissions.mockResolvedValue({ data: null })

  const wrapper = mount(RoleDataPermissionDialog, {
    props: { modelValue: true, role: ROLE },
    global: { plugins: [ElementPlus] },
  })
  mounted.push(wrapper)
  await nextTick()
  await flushPromises()
  await nextTick()
  return wrapper
}

function checkbox(wrapper: any, testid: string) {
  const box = wrapper.findAllComponents({ name: 'ElCheckbox' }).find((c: any) => c.attributes('data-testid') === testid)
  expect(box, `未找到 ElCheckbox[data-testid=${testid}]`).toBeDefined()
  return box!
}

async function toggle(wrapper: any, testid: string, value: boolean) {
  checkbox(wrapper, testid).vm.$emit('update:modelValue', value)
  await nextTick()
}

describe('RoleDataPermissionDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  })

  it('打开即按角色拉取全部权限对象与勾选状态', async () => {
    const wrapper = await mountDialog()

    expect(getRoleDataPermissions).toHaveBeenCalledWith(3)
    const text = wrapper.text()
    expect(text).toContain('数据权限 — 职员（ROLE_CLERK）')
    expect(text).toContain('销售本人')
    expect(text).toContain('created_by = {userId}')
    expect(text).toContain('部门共享')
    expect(checkbox(wrapper, 'role-dp-read-1').props('modelValue')).toBe(true)
    expect(checkbox(wrapper, 'role-dp-write-1').props('modelValue')).toBe(false)
    expect(checkbox(wrapper, 'role-dp-read-2').props('modelValue')).toBe(false)
    expect(checkbox(wrapper, 'role-dp-write-2').props('modelValue')).toBe(true)
  })

  it('保存只提交勾选了读写的对象', async () => {
    const { ElMessage } = await import('element-plus')
    const wrapper = await mountDialog()

    await toggle(wrapper, 'role-dp-read-1', false)
    await toggle(wrapper, 'role-dp-read-2', true)
    await wrapper.find('[data-testid="role-dp-save"]').trigger('click')
    await flushPromises()

    expect(saveRoleDataPermissions).toHaveBeenCalledWith(3, [
      { permissionId: 2, actions: ['READ', 'WRITE'] },
    ])
    expect(ElMessage.success).toHaveBeenCalledWith('数据权限已保存')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  it('两个轴都不勾选时提交空列表（清空该角色）', async () => {
    const wrapper = await mountDialog()

    await toggle(wrapper, 'role-dp-read-1', false)
    await toggle(wrapper, 'role-dp-write-2', false)
    await wrapper.find('[data-testid="role-dp-save"]').trigger('click')
    await flushPromises()

    expect(saveRoleDataPermissions).toHaveBeenCalledWith(3, [])
  })

  it('未选择角色时不请求', async () => {
    const wrapper = mount(RoleDataPermissionDialog, {
      props: { modelValue: true, role: null },
      global: { plugins: [ElementPlus] },
    })
    mounted.push(wrapper)
    await nextTick()
    await flushPromises()

    expect(getRoleDataPermissions).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('数据权限')
  })
})
