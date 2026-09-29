// ----- TDD: ProcessCenterPage 只展示每个流程 key 的最新版本 -----
// npx vitest run src/views/process/__tests__/ProcessCenterPage.test.ts
//
// 背景：leave 连续部署 4 个版本后，流程中心把 v1~v4 全部列成 4 张可发起卡片；
// 引擎 start() 本就按 key 解析最新已部署版本，前端去重后行为与引擎一致。

import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import ProcessCenterPage from '../ProcessCenterPage.vue'

vi.mock('@/api/processDefinition', () => ({
  deployedProcessApi: {
    list: vi.fn(),
  },
}))
vi.mock('@/api/category', () => ({
  categoryApi: {
    list: vi.fn(),
  },
}))

const { deployedProcessApi } = await import('@/api/processDefinition').then((m) => m as any)
const { categoryApi } = await import('@/api/category').then((m) => m as any)

function proc(id: string, key: string, version: number, name = key) {
  return {
    id: `${key}:${version}:${id}`,
    key,
    name,
    version,
    deploymentId: id,
    resourceName: `${key}.bpmn20.xml`,
    diagramResourceName: null,
    description: null,
    category: null,
    tenantId: 'default',
    suspended: false,
    starterScope: null,
  }
}

describe('ProcessCenterPage 最新版本去重', () => {
  it('同一 key 多个版本只保留最高版本，其他流程不受影响', async () => {
    ;(categoryApi.list as any).mockResolvedValue({ data: [] })
    ;(deployedProcessApi.list as any).mockResolvedValue({
      data: {
        content: [
          proc('d1', 'leave', 1, '请假'),
          proc('d2', 'other', 3, '其他流程'),
          proc('d3', 'leave', 4, '请假'),
          proc('d4', 'leave', 2, '请假'),
        ],
        totalElements: 4,
      },
    })

    const wrapper = mount(ProcessCenterPage, {
      global: {
        plugins: [ElementPlus, createPinia()],
      },
    })
    await flushPromises()

    const text = wrapper.text()
    // 最新版本保留
    expect(text).toContain('v4')
    expect(text).toContain('其他流程')
    // 历史版本不重复出现
    expect(text).not.toContain('v1')
    expect(text).not.toContain('v2')
    // 「请假」只出现一次（卡片标题）
    expect(text.split('请假').length - 1).toBe(1)
    wrapper.unmount()
  })

  it('乱序返回时仍取最高版本', async () => {
    ;(categoryApi.list as any).mockResolvedValue({ data: [] })
    ;(deployedProcessApi.list as any).mockResolvedValue({
      data: {
        content: [proc('d9', 'a', 7, 'A'), proc('d8', 'a', 2, 'A'), proc('d7', 'a', 5, 'A')],
        totalElements: 3,
      },
    })

    const wrapper = mount(ProcessCenterPage, {
      global: {
        plugins: [ElementPlus, createPinia()],
      },
    })
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('v7')
    expect(text).not.toContain('v2')
    expect(text).not.toContain('v5')
    wrapper.unmount()
  })
})
