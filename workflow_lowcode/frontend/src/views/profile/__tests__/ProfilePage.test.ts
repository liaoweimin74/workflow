// 修改密码：必填与两次一致都要在前端指出具体字段，不能把请求打到后端再报错
// npx vitest run src/views/profile/__tests__/ProfilePage.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import ProfilePage from '../ProfilePage.vue'

const { http } = vi.hoisted(() => ({ http: { put: vi.fn() } }))

vi.mock('@/utils/http', () => ({ default: http }))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { username: 'admin', nickname: '管理员', email: '', phone: '' } }),
}))
vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus')
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

const mounted: any[] = []

async function mountPage() {
  const wrapper = mount(ProfilePage, { global: { plugins: [ElementPlus] }, attachTo: document.body })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

function fill(wrapper: any, values: [string, string, string]) {
  const inputs = wrapper.findAllComponents({ name: 'ElInput' })
  return Promise.all(values.map((value, index) => inputs[index].setValue(value)))
}

/** 字段下方的红字由 element-plus 防抖 100ms 才落地，等一个真实定时器再读 */
async function inlineErrors(): Promise<string[]> {
  await new Promise((resolve) => setTimeout(resolve, 150))
  return Array.from(document.querySelectorAll('.el-form-item__error')).map((node) => node.textContent?.trim() ?? '')
}

async function clickSubmit(wrapper: any) {
  const button = wrapper
    .findAllComponents({ name: 'ElButton' })
    .find((item: any) => item.text().includes('修改密码'))
  await button!.trigger('click')
  await flushPromises()
}

describe('ProfilePage 修改密码', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    http.put.mockResolvedValue({ code: 0 })
  })

  afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount())
    document.body.innerHTML = ''
  })

  it('三项全空：逐字段标红且不发请求', async () => {
    const wrapper = await mountPage()
    await clickSubmit(wrapper)

    expect(http.put).not.toHaveBeenCalled()
    const errors = await inlineErrors()
    expect(errors).toContain('请输入旧密码')
    expect(errors).toContain('请输入新密码')
    expect(errors).toContain('请再次输入新密码')
  })

  it('两次密码不一致：标在确认密码字段', async () => {
    const wrapper = await mountPage()
    await fill(wrapper, ['old123', 'new123', 'new1234'])
    await clickSubmit(wrapper)

    expect(http.put).not.toHaveBeenCalled()
    expect(await inlineErrors()).toContain('两次输入的密码不一致')
  })

  it('新密码过短：标在新密码字段', async () => {
    const wrapper = await mountPage()
    await fill(wrapper, ['old123', '123', '123'])
    await clickSubmit(wrapper)

    expect(http.put).not.toHaveBeenCalled()
    expect(await inlineErrors()).toContain('新密码长度需在 6-64 位之间')
  })

  it('三项合法才提交，载荷只带旧/新密码', async () => {
    const wrapper = await mountPage()
    await fill(wrapper, ['old123', 'new123', 'new123'])
    await clickSubmit(wrapper)

    expect(http.put).toHaveBeenCalledWith('/auth/password', { oldPassword: 'old123', newPassword: 'new123' })
    expect(await inlineErrors()).toEqual([])
  })
})
