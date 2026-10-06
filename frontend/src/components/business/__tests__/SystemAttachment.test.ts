// ----- Task 146 / 146b: SystemAttachment 组件值语义与配置化测试 -----
// bun run test -- src/components/business/__tests__/SystemAttachment.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import ElementPlus from 'element-plus'
import SystemAttachment from '../SystemAttachment.vue'
import { attachmentHintText } from '../componentHints'
import { getAttachmentsByIds } from '@/api/attachment'

// mock api 模块（组件 import 的是同名模块函数）
vi.mock('@/api/attachment', () => ({
  uploadAttachments: vi.fn(),
  getAttachmentsByIds: vi.fn(async (_ids: number[]) => ({ code: 200, data: [] })),
  fetchAttachmentBlob: vi.fn(),
  deleteAttachment: vi.fn(async () => ({ code: 200, data: null })),
  formatFileSize: (n: number | null | undefined) => (n == null ? '—' : `${n} B`),
  previewKindOf: vi.fn(() => 'unknown'),
}))

const mockedGet = vi.mocked(getAttachmentsByIds)

function mountComp(value: number | number[] | null, props: Record<string, unknown> = {}) {
  return mount(SystemAttachment, {
    props: { modelValue: value, ...props },
    global: {
      plugins: [ElementPlus, createTestingPinia({ createSpy: vi.fn })],
    },
  })
}

function metaOf(id: number, fileName: string) {
  return { id, fileName, contentType: 'text/plain', fileSize: 12, createdBy: 'admin', createdAt: null }
}

beforeEach(() => {
  mockedGet.mockClear()
  mockedGet.mockImplementation(async (_ids: number[]) => ({ code: 200, data: [] }))
})

describe('SystemAttachment — 空态与 placeholder（函数遮蔽 bug 回归）', () => {
  it('空值：不请求元数据，显示空态', async () => {
    const w = mountComp(null)
    await flushPromises()
    expect(mockedGet).not.toHaveBeenCalled()
    expect(w.find('.sa-empty').exists()).toBe(true)
  })

  it('空态显示 placeholder 文案而非函数源码（script setup 顶层绑定遮蔽 prop 回归）', async () => {
    const w = mountComp(null)
    await flushPromises()
    const text = w.find('.sa-empty').text()
    expect(text).toBe('暂无附件')
    expect(text).not.toContain('function')
    expect(text).not.toContain('missingMeta')
    expect(text).not.toContain('placeholder')
  })

  it('空态显示自定义 placeholder 文案', async () => {
    const w = mountComp(null, { placeholder: '请上传合同扫描件' })
    await flushPromises()
    expect(w.find('.sa-empty').text()).toBe('请上传合同扫描件')
  })
})

describe('SystemAttachment — 值语义与回显', () => {
  it('单文件值（number）：按 id 拉取元数据并渲染文件行', async () => {
    mockedGet.mockImplementation(async (ids: number[]) => ({
      code: 200,
      data: ids.map((id) => metaOf(id, `file-${id}.txt`)),
    }))
    const w = mountComp(1)
    await flushPromises()
    expect(mockedGet).toHaveBeenCalledTimes(1)
    expect(w.find('.sa-file').exists()).toBe(true)
    expect(w.find('.sa-file-name').text()).toBe('file-1.txt')
  })

  it('多文件值（number[]）：一次合并请求缺失 id，按值顺序渲染', async () => {
    mockedGet.mockImplementation(async (ids: number[]) => ({
      code: 200,
      data: ids.map((id) => metaOf(id, `f${id}.pdf`)),
    }))
    const w = mountComp([3, 1], { limit: 5 })
    await flushPromises()
    const names = w.findAll('.sa-file-name').map((n) => n.text())
    expect(names).toEqual(['f3.pdf', 'f1.pdf'])
  })

  it('limit=1（单文件）：emitIds 输出 number', async () => {
    const w = mountComp(null, { limit: 1 })
    await flushPromises()
    ;(w.vm as unknown as { emitIds: (ids: number[]) => void }).emitIds([7])
    await flushPromises()
    const emitted = w.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted![emitted!.length - 1][0]).toBe(7)
  })

  it('limit=5（多文件）：emitIds 输出 number[]', async () => {
    const w = mountComp(null, { limit: 5 })
    await flushPromises()
    ;(w.vm as unknown as { emitIds: (ids: number[]) => void }).emitIds([7, 8])
    await flushPromises()
    const emitted = w.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted![emitted!.length - 1][0]).toEqual([7, 8])
  })

  it('limit=0（多文件不限）：emitIds 输出 number[]', async () => {
    const w = mountComp(null, { limit: 0 })
    await flushPromises()
    ;(w.vm as unknown as { emitIds: (ids: number[]) => void }).emitIds([1, 2, 3])
    await flushPromises()
    const emitted = w.emitted('update:modelValue')
    expect(emitted![emitted!.length - 1][0]).toEqual([1, 2, 3])
  })
})

describe('SystemAttachment — 配置项（Task 146b）', () => {
  it('disabled：隐藏上传区与删除按钮，保留预览/下载', async () => {
    mockedGet.mockImplementation(async (ids: number[]) => ({
      code: 200,
      data: ids.map((id) => metaOf(id, `f${id}.txt`)),
    }))
    const w = mountComp(5, { disabled: true })
    await flushPromises()
    expect(w.find('.sa-upload').exists()).toBe(false)
    const actionText = w.find('.sa-file-actions').text()
    expect(actionText).toContain('预览')
    expect(actionText).toContain('下载')
    expect(actionText).not.toContain('删除')
  })

  it('previewable=false：不显示预览按钮，文件名不可点击预览', async () => {
    mockedGet.mockImplementation(async (ids: number[]) => ({
      code: 200,
      data: ids.map((id) => metaOf(id, `f${id}.txt`)),
    }))
    const w = mountComp(5, { previewable: false })
    await flushPromises()
    const actionText = w.find('.sa-file-actions').text()
    expect(actionText).not.toContain('预览')
    expect(actionText).toContain('下载')
    expect(w.find('.sa-file-name').classes()).not.toContain('is-clickable')
  })

  it('showFileName=false：不显示文件名，行 title 保留提示', async () => {
    mockedGet.mockImplementation(async (ids: number[]) => ({
      code: 200,
      data: ids.map((id) => metaOf(id, `f${id}.txt`)),
    }))
    const w = mountComp(5, { showFileName: false })
    await flushPromises()
    expect(w.find('.sa-file-name').exists()).toBe(false)
    expect(w.find('.sa-file').attributes('title')).toBe('f5.txt')
  })

  it('multiSelect=false（多文件模式）：文件选择框不允许一次多选', async () => {
    const w = mountComp(null, { limit: 5, multiSelect: false })
    await flushPromises()
    expect(w.find('input[type="file"]').attributes('multiple')).toBeUndefined()
  })

  it('multiSelect=true（默认，多文件模式）：文件选择框允许一次多选', async () => {
    const w = mountComp(null, { limit: 5 })
    await flushPromises()
    expect(w.find('input[type="file"]').attributes('multiple')).toBeDefined()
  })

  it('单文件模式（limit=1）：即使 multiSelect=true 也不允许一次多选', async () => {
    const w = mountComp(null, { limit: 1, multiSelect: true })
    await flushPromises()
    expect(w.find('input[type="file"]').attributes('multiple')).toBeUndefined()
  })

  it('draggable=true：渲染拖拽上传区域而非按钮', async () => {
    const w = mountComp(null, { draggable: true })
    await flushPromises()
    expect(w.find('.el-upload-dragger').exists()).toBe(true)
    expect(w.find('.sa-dragger').exists()).toBe(true)
    expect(w.find('.sa-upload .el-button').exists()).toBe(false)
  })

  it('draggable=false（默认）：渲染上传按钮', async () => {
    const w = mountComp(null)
    await flushPromises()
    expect(w.find('.sa-dragger').exists()).toBe(false)
    expect(w.find('.sa-upload .el-button').exists()).toBe(true)
  })

  it('组件内不再内联渲染说明文字（改由规则 info 在 label 后 ？ 悬浮，Task 148 反馈 2）', async () => {
    const w = mountComp(null, { accept: ['image/*', '.pdf'], limit: 3 })
    await flushPromises()
    expect(w.find('.sa-tip').exists()).toBe(false)
    expect(w.text()).not.toContain('单个不超过 10MB')
    expect(w.text()).not.toContain('image/*,.pdf')
  })

  it('attachmentHintText：accept 数组归一化为逗号分隔（设计器 info 派生源）', () => {
    expect(attachmentHintText({ accept: ['image/*', '.pdf'] })).toContain('image/*,.pdf')
    expect(attachmentHintText({ accept: '.doc,.docx' })).toContain('.doc,.docx')
  })

  it('attachmentHintText：多文件且 limit>0 显示数量上限与多选；limit=1 不提', () => {
    const multi = attachmentHintText({ limit: 3, multiSelect: true })
    expect(multi).toContain('最多 3 个')
    expect(multi).toContain('可一次多选')
    const single = attachmentHintText({ limit: 1, multiSelect: true })
    expect(single).not.toContain('最多')
    expect(single).not.toContain('可一次多选')
  })
})
