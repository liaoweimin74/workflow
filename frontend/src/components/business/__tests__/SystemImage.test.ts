// ----- Task 147: SystemImage 图片组件（值语义 / 配置项 / 四重上传校验 / 缩略图） -----
// bun run test -- src/components/business/__tests__/SystemImage.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createTestingPinia } from '@pinia/testing'
import ElementPlus, { ElMessage } from 'element-plus'
import SystemImage from '../SystemImage.vue'
import { imageHintText } from '../componentHints'
import { getAttachmentsByIds, uploadImages } from '@/api/attachment'

// mock api 模块：纯函数（isImageFile/formatFileSize）用真实实现，IO 函数 mock
vi.mock('@/api/attachment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/attachment')>()
  return {
    ...actual,
    uploadImages: vi.fn(),
    getAttachmentsByIds: vi.fn(async (_ids: number[]) => ({ code: 200, data: [] })),
    fetchAttachmentBlob: vi.fn(),
    fetchAttachmentThumbnail: vi.fn(async () => new Blob(['thumb-bytes'], { type: 'image/jpeg' })),
  }
})

// ElMessage 静默（失败路径断言走 onError/报错调用次数）
vi.spyOn(ElMessage, 'error').mockImplementation(() => ({}) as never)

const mockedGet = vi.mocked(getAttachmentsByIds)
const mockedUpload = vi.mocked(uploadImages)

function mountComp(value: number | number[] | null, props: Record<string, unknown> = {}) {
  return mount(SystemImage, {
    props: { modelValue: value, ...props },
    global: {
      plugins: [ElementPlus, createTestingPinia({ createSpy: vi.fn })],
    },
  })
}

function metaOf(id: number, fileName: string, width?: number, height?: number) {
  return { id, fileName, contentType: 'image/png', fileSize: 2048, createdBy: 'admin', createdAt: null, width: width ?? null, height: height ?? null }
}

// jsdom 无 URL.createObjectURL/revokeObjectURL 与真实 Image 解码 → 统一桩
let fakeImageDims = { width: 100, height: 80 }
const objectUrls: string[] = []
let realCreateObjectURL: unknown
let realRevokeObjectURL: unknown

function installBrowserStubs() {
  realCreateObjectURL = (URL as unknown as Record<string, unknown>).createObjectURL
  realRevokeObjectURL = (URL as unknown as Record<string, unknown>).revokeObjectURL
  ;(URL as unknown as Record<string, unknown>).createObjectURL = vi.fn(() => {
    const url = `blob:mock-${objectUrls.length}`
    objectUrls.push(url)
    return url
  })
  ;(URL as unknown as Record<string, unknown>).revokeObjectURL = vi.fn(() => {})

  const Img = class {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    naturalWidth = fakeImageDims.width
    naturalHeight = fakeImageDims.height
    set src(_v: string) {
      queueMicrotask(() => this.onload?.())
    }
  }
  vi.stubGlobal('Image', Img)
}

function restoreBrowserStubs() {
  ;(URL as unknown as Record<string, unknown>).createObjectURL = realCreateObjectURL
  ;(URL as unknown as Record<string, unknown>).revokeObjectURL = realRevokeObjectURL
  vi.unstubAllGlobals()
}

beforeEach(() => {
  installBrowserStubs()
  mockedGet.mockClear()
  mockedGet.mockImplementation(async () => ({ code: 200, data: [] }))
  mockedUpload.mockReset()
  fakeImageDims = { width: 100, height: 80 }
})

afterEach(() => {
  restoreBrowserStubs()
})

describe('SystemImage — 空态与 placeholder', () => {
  it('非禁用空值：显示上传卡片，不显示空态文字，不请求元数据', async () => {
    const w = mountComp(null)
    await flushPromises()
    expect(mockedGet).not.toHaveBeenCalled()
    expect(w.find('.si-upload').exists()).toBe(true)
    expect(w.find('.si-empty').exists()).toBe(false)
  })

  it('禁用且空值：显示空态 placeholder 文案（函数遮蔽回归）', async () => {
    const w = mountComp(null, { disabled: true })
    await flushPromises()
    const text = w.find('.si-empty').text()
    expect(text).toBe('暂无图片')
    expect(text).not.toContain('function')
    expect(text).not.toContain('missingMeta')
  })

  it('空态显示自定义 placeholder 文案', async () => {
    const w = mountComp(null, { disabled: true, placeholder: '请上传现场照片' })
    await flushPromises()
    expect(w.find('.si-empty').text()).toBe('请上传现场照片')
  })
})

describe('SystemImage — 值语义与回显', () => {
  it('limit=1（单图）：emitIds 输出 number', async () => {
    const w = mountComp(null, { limit: 1 })
    await flushPromises()
    ;(w.vm as unknown as { emitIds: (ids: number[]) => void }).emitIds([7])
    await flushPromises()
    const emitted = w.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted![emitted!.length - 1][0]).toBe(7)
  })

  it('limit=5（多图）：emitIds 输出 number[]', async () => {
    const w = mountComp(null, { limit: 5 })
    await flushPromises()
    ;(w.vm as unknown as { emitIds: (ids: number[]) => void }).emitIds([7, 8])
    await flushPromises()
    const emitted = w.emitted('update:modelValue')
    expect(emitted![emitted!.length - 1][0]).toEqual([7, 8])
  })

  it('limit=0（多图不限）：emitIds 输出 number[]', async () => {
    const w = mountComp(null, { limit: 0 })
    await flushPromises()
    ;(w.vm as unknown as { emitIds: (ids: number[]) => void }).emitIds([1, 2, 3])
    await flushPromises()
    const emitted = w.emitted('update:modelValue')
    expect(emitted![emitted!.length - 1][0]).toEqual([1, 2, 3])
  })

  it('单图值（number）：按 id 拉元数据并渲染缩略卡片，信息条仅尺寸不显示文件名', async () => {
    mockedGet.mockImplementation(async (ids: number[]) => ({
      code: 200,
      data: ids.map((id) => metaOf(id, `img-${id}.png`, 640, 480)),
    }))
    const w = mountComp(1)
    await flushPromises()
    await flushPromises()
    expect(mockedGet).toHaveBeenCalledTimes(1)
    expect(w.findAll('.si-item').length).toBe(1)
    // Task 148 反馈 3：不显示文件名（无配置项），信息条仅 尺寸·大小
    expect(w.find('.si-info-name').exists()).toBe(false)
    expect(w.find('.si-info').text()).not.toContain('img-1.png')
    expect(w.find('.si-info-meta').text()).toContain('640×480')
  })

  it('多图值（number[]）：按值顺序渲染缩略卡片并加载缩略图 blob', async () => {
    mockedGet.mockImplementation(async (ids: number[]) => ({
      code: 200,
      data: ids.map((id) => metaOf(id, `p${id}.png`, 100 * id, 200)),
    }))
    const w = mountComp([3, 1], { limit: 5 })
    await flushPromises()
    await flushPromises()
    const metas = w.findAll('.si-info-meta').map((n) => n.text())
    expect(metas).toEqual(['300×200 · 2.0 KB', '100×200 · 2.0 KB'])
    expect(w.findAll('img.si-thumb-img').length).toBe(2)
  })

  it('失效 id：渲染占位卡片并标注「失效」，可经右上角角标 X 删除', async () => {
    const w = mountComp(99)
    await flushPromises()
    await flushPromises()
    expect(w.find('.si-item.is-missing').exists()).toBe(true)
    expect(w.find('.si-missing-badge').text()).toBe('失效')
    // 占位卡片同样提供右上角删除角标（disabled=false）
    expect(w.find('.si-del-badge[aria-label="删除"]').exists()).toBe(true)
    await w.find('.si-del-badge[aria-label="删除"]').trigger('click')
    await flushPromises()
    const emitted = w.emitted('update:modelValue')
    expect(emitted![emitted!.length - 1][0]).toEqual([])
  })

  it('骑角定位：删除角标为 .si-item 直接子元素，圆心与缩略图右上角重合（Task 150）', async () => {
    const w = mountComp(99)
    await flushPromises()
    await flushPromises()
    const badge = w.find('.si-del-badge[aria-label="删除"]')
    expect(badge.exists()).toBe(true)
    // 须挂在 .si-item 下：.si-thumb overflow:hidden 会裁剪外露半圆
    expect(badge.element.parentElement?.classList.contains('si-item')).toBe(true)
    expect(w.find('.si-thumb .si-del-badge').exists()).toBe(false)
  })

  it('canAddMore：limit=1 已有值时隐藏上传卡片', async () => {
    const w = mountComp(5, { limit: 1 })
    await flushPromises()
    expect(w.find('.si-upload').exists()).toBe(false)
  })
})

describe('SystemImage — 配置项', () => {
  it('multiSelect=false（多图模式）：文件选择框不允许一次多选', async () => {
    const w = mountComp(null, { limit: 5, multiSelect: false })
    await flushPromises()
    expect(w.find('input[type="file"]').attributes('multiple')).toBeUndefined()
  })

  it('multiSelect=true（默认，多图模式）：允许一次多选', async () => {
    const w = mountComp(null, { limit: 5 })
    await flushPromises()
    expect(w.find('input[type="file"]').attributes('multiple')).toBeDefined()
  })

  it('单图模式（limit=1）：即使 multiSelect=true 也不允许一次多选', async () => {
    const w = mountComp(null, { limit: 1, multiSelect: true })
    await flushPromises()
    expect(w.find('input[type="file"]').attributes('multiple')).toBeUndefined()
  })

  it('previewable=false：悬浮遮罩无预览按钮（仍保留下载）；删除走右上角角标', async () => {
    mockedGet.mockImplementation(async (ids: number[]) => ({
      code: 200,
      data: ids.map((id) => metaOf(id, `p${id}.png`)),
    }))
    const w = mountComp(5, { previewable: false })
    await flushPromises()
    const maskText = w.find('.si-mask').text()
    expect(maskText).not.toContain('预览')
    expect(maskText).not.toContain('下载')
    // aria-label 精确断言：预览按钮不存在，下载存在；删除已迁出遮罩（角标）
    expect(w.find('.si-mask-btn[aria-label="预览"]').exists()).toBe(false)
    expect(w.find('.si-mask-btn[aria-label="下载"]').exists()).toBe(true)
    expect(w.find('.si-mask-btn[aria-label="删除"]').exists()).toBe(false)
    expect(w.find('.si-del-badge[aria-label="删除"]').exists()).toBe(true)
  })

  it('删除改为缩略图右上角角标 X：遮罩仅预览/下载两钮，点击角标移除该图（Task 149 反馈）', async () => {
    mockedGet.mockImplementation(async (ids: number[]) => ({
      code: 200,
      data: ids.map((id) => metaOf(id, `p${id}.png`, 800, 600)),
    }))
    const w = mountComp([1, 2], { limit: 5 })
    await flushPromises()
    await flushPromises()
    // 遮罩内不再有删除按钮（三图标挤压变形根因），每张缩略图仅 预览/下载 两钮（2×2=4）
    expect(w.find('.si-mask-btn[aria-label="删除"]').exists()).toBe(false)
    expect(w.findAll('.si-mask-btn').length).toBe(4)
    // 每张缩略图右上角一枚删除角标
    const badges = w.findAll('.si-del-badge[aria-label="删除"]')
    expect(badges.length).toBe(2)
    // 点击第一张角标 → 值仅余 [2]
    await badges[0].trigger('click')
    await flushPromises()
    const emitted = w.emitted('update:modelValue')
    expect(emitted![emitted!.length - 1][0]).toEqual([2])
  })

  it('downloadable=false：遮罩与预览弹窗均无下载入口', async () => {
    mockedGet.mockImplementation(async (ids: number[]) => ({
      code: 200,
      data: ids.map((id) => metaOf(id, `p${id}.png`)),
    }))
    const w = mountComp(5, { downloadable: false })
    await flushPromises()
    expect(w.find('.si-mask-btn[aria-label="下载"]').exists()).toBe(false)
    expect(w.find('.si-mask-btn[aria-label="预览"]').exists()).toBe(true)
  })

  it('disabled：隐藏上传卡片与删除角标，保留预览/下载', async () => {
    mockedGet.mockImplementation(async (ids: number[]) => ({
      code: 200,
      data: ids.map((id) => metaOf(id, `p${id}.png`)),
    }))
    const w = mountComp(5, { disabled: true })
    await flushPromises()
    expect(w.find('.si-upload').exists()).toBe(false)
    expect(w.find('.si-del-badge[aria-label="删除"]').exists()).toBe(false)
    expect(w.find('.si-mask-btn[aria-label="预览"]').exists()).toBe(true)
    expect(w.find('.si-mask-btn[aria-label="下载"]').exists()).toBe(true)
  })

  it('不显示文件名且不再提供配置项（Task 148 反馈 3）', async () => {
    mockedGet.mockImplementation(async (ids: number[]) => ({
      code: 200,
      data: ids.map((id) => metaOf(id, `p${id}.png`, 800, 600)),
    }))
    const w = mountComp(5)
    await flushPromises()
    expect(w.find('.si-info-name').exists()).toBe(false)
    expect(w.find('.si-info').text()).not.toContain('p5.png')
    // hover title 也不再带文件名，仅尺寸·大小
    expect(w.find('.si-item').attributes('title')).toBe('800×600 · 2.0 KB')
  })

  it('组件内不再内联渲染说明文字（改由规则 info 在 label 后 ？ 悬浮，Task 148 反馈 2）', async () => {
    const w = mountComp(null, { limit: 3, maxSizeMB: 8 })
    await flushPromises()
    expect(w.find('.si-tip').exists()).toBe(false)
    expect(w.text()).not.toContain('单张不超过 8MB')
  })

  it('imageHintText：大小上限 + 数量上限 + 多选 + 格式（设计器 info 派生源）', () => {
    const tip = imageHintText({ limit: 3, maxSizeMB: 8, multiSelect: true })
    expect(tip).toContain('单张不超过 8MB')
    expect(tip).toContain('最多 3 张')
    expect(tip).toContain('可一次多选')
    expect(tip).toContain('JPG/PNG')
  })

  it('imageHintText：配置尺寸限制后显示宽高范围', () => {
    const tip = imageHintText({ minWidth: 200, maxWidth: 1000, minHeight: 300, maxHeight: 2000 })
    expect(tip).toContain('宽 200~1000px')
    expect(tip).toContain('高 300~2000px')
  })

  it('imageHintText：仅最小宽度时显示 ≥ 形态；单图模式不提数量与多选', () => {
    expect(imageHintText({ minWidth: 100 })).toContain('宽 ≥100px')
    const single = imageHintText({ limit: 1 })
    expect(single).not.toContain('最多')
    expect(single).not.toContain('可一次多选')
  })

  it('thumbnailSize 边长夹取到 64~640', async () => {
    const w1 = mountComp(null, { thumbnailSize: 10 })
    await flushPromises()
    expect((w1.vm as unknown as { thumbPx: number }).thumbPx).toBe(64)
    const w2 = mountComp(null, { thumbnailSize: 9999 })
    await flushPromises()
    expect((w2.vm as unknown as { thumbPx: number }).thumbPx).toBe(640)
  })
})

describe('SystemImage — 上传四重校验（大小/类型/数量/尺寸）', () => {
  function fileOf(name: string, type: string, sizeBytes: number) {
    return new File([new Uint8Array(sizeBytes)], name, { type })
  }
  function uploadOptions(file: File) {
    return { file, onError: vi.fn(), onSuccess: vi.fn() }
  }

  it('超过 maxSizeMB：onError 且不调上传接口', async () => {
    const w = mountComp(null, { maxSizeMB: 1 })
    await flushPromises()
    const opts = uploadOptions(fileOf('big.png', 'image/png', 2 * 1024 * 1024))
    await (w.vm as unknown as { doUpload: (o: unknown) => Promise<void> }).doUpload(opts)
    await flushPromises()
    expect(opts.onError).toHaveBeenCalled()
    expect(mockedUpload).not.toHaveBeenCalled()
    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledWith(expect.stringContaining('超过单图上限 1MB'))
  })

  it('非图片类型：onError 且不调上传接口', async () => {
    const w = mountComp(null)
    await flushPromises()
    const opts = uploadOptions(fileOf('evil.exe', 'application/x-msdownload', 100))
    await (w.vm as unknown as { doUpload: (o: unknown) => Promise<void> }).doUpload(opts)
    await flushPromises()
    expect(opts.onError).toHaveBeenCalled()
    expect(mockedUpload).not.toHaveBeenCalled()
    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledWith(expect.stringContaining('不是支持的图片类型'))
  })

  it('数量上限：limit=2 已满再传 → onError', async () => {
    const w = mountComp([1, 2], { limit: 2 })
    await flushPromises()
    const opts = uploadOptions(fileOf('c.png', 'image/png', 100))
    await (w.vm as unknown as { doUpload: (o: unknown) => Promise<void> }).doUpload(opts)
    await flushPromises()
    expect(opts.onError).toHaveBeenCalled()
    expect(mockedUpload).not.toHaveBeenCalled()
    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledWith(expect.stringContaining('最多上传 2 张'))
  })

  it('一次多选连派文件：数量限制在异步校验期间同样生效（Task 148 反馈 1 回归）', async () => {
    // 旧 bug：占位计数在 await 尺寸解码之后才自增，同步连派的全部文件
    // 都在回填前通过数量校验 → limit=2 也能传 5 张
    mockedUpload.mockImplementationOnce(async () => ({ code: 200, data: [metaOf(11, 'a.png', 100, 80)] }) as never)
    mockedUpload.mockImplementationOnce(async () => ({ code: 200, data: [metaOf(12, 'b.png', 100, 80)] }) as never)
    const w = mountComp(null, { limit: 2 })
    await flushPromises()
    const vm = w.vm as unknown as { doUpload: (o: unknown) => Promise<void> }
    const o1 = uploadOptions(fileOf('a.png', 'image/png', 100))
    const o2 = uploadOptions(fileOf('b.png', 'image/png', 100))
    const o3 = uploadOptions(fileOf('c.png', 'image/png', 100))
    // 同步连派 3 个（不 await，模拟 el-upload multiple 一次选中多文件）
    const p1 = vm.doUpload(o1)
    const p2 = vm.doUpload(o2)
    const p3 = vm.doUpload(o3)
    await Promise.all([p1, p2, p3])
    await flushPromises()
    expect(mockedUpload).toHaveBeenCalledTimes(2) // 第 3 个被拒，不调上传
    expect(o1.onSuccess).toHaveBeenCalled()
    expect(o2.onSuccess).toHaveBeenCalled()
    expect(o3.onError).toHaveBeenCalled()
    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledWith(expect.stringContaining('最多上传 2 张'))
    const emitted = w.emitted('update:modelValue')
    expect(emitted![emitted!.length - 1][0]).toEqual([11, 12])
  })

  it('一次多选占位期间：上传卡片立即隐藏；服务端失败释放后恢复（canAddMore 计入 pending）', async () => {
    // 两文件都通过同步校验进入异步占位；一个服务端成功、一个服务端失败
    mockedUpload.mockImplementationOnce(async () => ({ code: 200, data: [metaOf(11, 'a.png', 100, 80)] }) as never)
    mockedUpload.mockRejectedValueOnce(new Error('boom'))
    const w = mountComp(null, { limit: 2 })
    await flushPromises()
    const vm = w.vm as unknown as { doUpload: (o: unknown) => Promise<void> }
    const p1 = vm.doUpload(uploadOptions(fileOf('a.png', 'image/png', 100)))
    const p2 = vm.doUpload(uploadOptions(fileOf('b.png', 'image/png', 100)))
    await nextTick() // 占位 2/2：响应式刷新后上传卡片隐藏
    expect(w.find('.si-upload').exists()).toBe(false)
    await Promise.all([p1, p2])
    await flushPromises()
    // 成功 1 张 + 失败 1 张释放占位 → 剩余额度恢复上传卡片
    expect(w.find('.si-upload').exists()).toBe(true)
    const emitted = w.emitted('update:modelValue')
    expect(emitted![emitted!.length - 1][0]).toEqual([11])
  })

  it('尺寸超 maxWidth：本地解码校验拒绝，不调上传接口', async () => {
    fakeImageDims = { width: 1200, height: 800 }
    const w = mountComp(null, { maxWidth: 1000 })
    await flushPromises()
    const opts = uploadOptions(fileOf('wide.png', 'image/png', 100))
    await (w.vm as unknown as { doUpload: (o: unknown) => Promise<void> }).doUpload(opts)
    await flushPromises()
    expect(opts.onError).toHaveBeenCalled()
    expect(mockedUpload).not.toHaveBeenCalled()
    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledWith(expect.stringContaining('宽度 1200px 超过最大限制 1000px'))
  })

  it('尺寸低于 minWidth：拒绝并提示最小要求', async () => {
    fakeImageDims = { width: 50, height: 50 }
    const w = mountComp(null, { minWidth: 100, minHeight: 200 })
    await flushPromises()
    const opts = uploadOptions(fileOf('small.png', 'image/png', 100))
    await (w.vm as unknown as { doUpload: (o: unknown) => Promise<void> }).doUpload(opts)
    await flushPromises()
    expect(opts.onError).toHaveBeenCalled()
    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledWith(expect.stringContaining('宽度 50px 低于最小要求 100px'))
  })

  it('尺寸合法 + 上传成功：调 uploadImages 并 emit 新 id（多图追加）', async () => {
    fakeImageDims = { width: 640, height: 480 }
    mockedUpload.mockResolvedValue({ code: 200, data: [metaOf(11, 'ok.png', 640, 480)] } as never)
    const w = mountComp([1], { limit: 5 })
    await flushPromises()
    const opts = uploadOptions(fileOf('ok.png', 'image/png', 100))
    await (w.vm as unknown as { doUpload: (o: unknown) => Promise<void> }).doUpload(opts)
    await flushPromises()
    expect(opts.onSuccess).toHaveBeenCalled()
    expect(mockedUpload).toHaveBeenCalledTimes(1)
    const emitted = w.emitted('update:modelValue')
    expect(emitted![emitted!.length - 1][0]).toEqual([1, 11])
  })

  it('单图模式上传成功：emit 单个 number（覆盖旧值）', async () => {
    fakeImageDims = { width: 640, height: 480 }
    mockedUpload.mockResolvedValue({ code: 200, data: [metaOf(21, 'one.png', 640, 480)] } as never)
    const w = mountComp(null, { limit: 1 })
    await flushPromises()
    const opts = uploadOptions(fileOf('one.png', 'image/png', 100))
    await (w.vm as unknown as { doUpload: (o: unknown) => Promise<void> }).doUpload(opts)
    await flushPromises()
    const emitted = w.emitted('update:modelValue')
    expect(emitted![emitted!.length - 1][0]).toBe(21)
  })

  it('上传接口返回空列表：报错且不 emit', async () => {
    mockedUpload.mockResolvedValue({ code: 200, data: [] } as never)
    const w = mountComp(null)
    await flushPromises()
    const opts = uploadOptions(fileOf('x.png', 'image/png', 100))
    await (w.vm as unknown as { doUpload: (o: unknown) => Promise<void> }).doUpload(opts)
    await flushPromises()
    expect(opts.onError).toHaveBeenCalled()
    expect(w.emitted('update:modelValue')).toBeFalsy()
  })
})
