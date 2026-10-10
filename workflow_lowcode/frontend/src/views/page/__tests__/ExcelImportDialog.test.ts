// ----- TDD: ExcelImportDialog 交互（Task 5-b） -----
// 覆盖：选择文件（el-upload input change → raw 捕获）→ 确认导入（FormData 上传调用）→
// 展示统计（成功/失败/跳过）+ 失败明细表（行号+原因）→ emit success（父组件刷新链路）；
// 以及：未选文件禁用、非 .xlsx 拒绝、上传失败 toast R 消息、关闭后状态重置。
// npx vitest run src/views/page/__tests__/ExcelImportDialog.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'

// mock element-plus：保留安装器与其余导出，仅将 ElMessage 替换为可观测 vi.fn()
// ElMessage 既有函数形态又有 .success/.error/.warning 方法 → 模拟同构对象（全部可观测）
// vi.hoisted：vi.mock 工厂被提升到文件顶部，模拟对象必须同层提升（TDZ）
const ElMessageMock = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
)

vi.mock('element-plus', async (importOriginal) => {
  const actual: any = await importOriginal()
  return { ...actual, ElMessage: ElMessageMock }
})

// 仅 mock 上传动作（URL/FormData 纯逻辑已在 excelTransfer.test.ts 覆盖）
vi.mock('../components/excelTransfer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../components/excelTransfer')>()
  return { ...actual, importPageDataFromExcel: vi.fn() }
})

import ExcelImportDialog from '../components/ExcelImportDialog.vue'
import { importPageDataFromExcel } from '../components/excelTransfer'

const uploadMock = importPageDataFromExcel as ReturnType<typeof vi.fn>

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const RESULT_OK = {
  total: 3,
  success: 2,
  failed: 1,
  skipped: 1,
  errors: [
    { row: 4, message: '字段 年龄 须为整数: 3.5' },
    { row: 7, message: 'Duplicate entry ...' },
  ],
}

// el-dialog 行为桩：slot 内容随 modelValue 显隐（footer 命名槽同样渲染，供交互断言）
const ElDialogStub = {
  name: 'ElDialog',
  props: { modelValue: { type: Boolean, default: false } },
  emits: ['update:modelValue'],
  template:
    '<div class="dialog-stub"><template v-if="modelValue"><slot /><slot name="footer" /></template></div>',
}

function xlsxFile(name = '名单.xlsx') {
  return new File(['xlsx-bytes'], name, { type: XLSX_TYPE })
}

function createWrapper(props: any = {}) {
  return mount(ExcelImportDialog, {
    props: { modelValue: true, pageKey: 'emp_view', ...props },
    global: {
      plugins: [ElementPlus],
      stubs: { 'el-dialog': ElDialogStub },
    },
  })
}

/** 模拟用户选择文件：向 el-upload 内部 input[type=file] 注入 files 并派发 change */
async function chooseFile(wrapper: ReturnType<typeof mount>, file: File) {
  const input = wrapper.find('input[type="file"]')
  expect(input.exists()).toBe(true)
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await nextTick()
  await flushPromises()
}

function findButton(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').find((b) => b.text().includes(text))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ExcelImportDialog — 选择文件 → 确认 → 上传 → 统计 → 刷新回调', () => {
  it('未选文件：开始导入按钮禁用，不发起上传', async () => {
    const wrapper = createWrapper()
    const btn = findButton(wrapper, '开始导入')
    expect(btn).toBeTruthy()
    expect(btn!.attributes('disabled')).toBeDefined()
    btn!.trigger('click')
    await flushPromises()
    expect(uploadMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('选择非 .xlsx 文件：提示并拒绝捕获', async () => {
    const wrapper = createWrapper()
    await chooseFile(wrapper, new File(['csv'], 'data.csv', { type: 'text/csv' }))
    expect(ElMessageMock.error).toHaveBeenCalledWith('仅支持 .xlsx 格式')
    const btn = findButton(wrapper, '开始导入')
    expect(btn!.attributes('disabled')).toBeDefined()
    expect(uploadMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('选择 .xlsx → 确认导入：调用上传（URL/file 参数正确）→ 展示统计 → emit success', async () => {
    uploadMock.mockResolvedValue(RESULT_OK)
    const wrapper = createWrapper()
    const file = xlsxFile()
    await chooseFile(wrapper, file)

    const btn = findButton(wrapper, '开始导入')
    expect(btn!.attributes('disabled')).toBeUndefined()
    await btn!.trigger('click')
    await flushPromises()

    expect(uploadMock).toHaveBeenCalledTimes(1)
    expect(uploadMock.mock.calls[0][0]).toBe('/api/v1/pages/emp_view/data/import')
    expect(uploadMock.mock.calls[0][1]).toBe(file)
    expect(uploadMock.mock.calls[0][2]).toBeUndefined() // mapping 缺省不传

    // 统计展示：成功 N 条 / 失败 M 条 / 读取总数 / 跳过空行
    const text = wrapper.text()
    expect(text).toContain('共读取 3 行数据')
    expect(text).toContain('成功 2 条')
    expect(text).toContain('失败 1 条')
    expect(text).toContain('跳过空行 1 条')
    expect(text).toContain('导入完成（部分失败）')

    // 失败明细（可滚动 el-table）：行号 + 原因
    const errText = wrapper.find('.excel-import-errors').text()
    expect(errText).toContain('4')
    expect(errText).toContain('字段 年龄 须为整数: 3.5')
    expect(errText).toContain('Duplicate entry ...')

    // 刷新回调：success 事件带导入结果（父组件 PageDataTable 据此 refresh）
    const emitted = wrapper.emitted('success')
    expect(emitted).toHaveLength(1)
    expect(emitted![0][0]).toEqual(RESULT_OK)
    wrapper.unmount()
  })

  it('全部成功：标题「导入成功」，无失败明细区块', async () => {
    uploadMock.mockResolvedValue({ total: 2, success: 2, failed: 0, skipped: 0, errors: [] })
    const wrapper = createWrapper()
    await chooseFile(wrapper, xlsxFile())
    await findButton(wrapper, '开始导入')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('导入成功')
    expect(wrapper.find('.excel-import-errors').exists()).toBe(false)
    expect(wrapper.emitted('success')).toHaveLength(1)
    wrapper.unmount()
  })

  it('全失败（success=0）：展示统计但不触发刷新回调', async () => {
    uploadMock.mockResolvedValue({ total: 2, success: 0, failed: 2, skipped: 0, errors: [{ row: 2, message: '必填缺失' }] })
    const wrapper = createWrapper()
    await chooseFile(wrapper, xlsxFile())
    await findButton(wrapper, '开始导入')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('成功 0 条')
    expect(wrapper.emitted('success')).toBeUndefined()
    wrapper.unmount()
  })

  it('上传失败（R code≠200 归一为 Error）：toast 业务消息，不 emit success，回到可选文件状态', async () => {
    uploadMock.mockRejectedValue(new Error('数据行超过单次导入上限 5000 行'))
    const wrapper = createWrapper()
    await chooseFile(wrapper, xlsxFile())
    await findButton(wrapper, '开始导入')!.trigger('click')
    await flushPromises()
    expect(ElMessageMock.error).toHaveBeenCalledWith('数据行超过单次导入上限 5000 行')
    expect(wrapper.emitted('success')).toBeUndefined()
    expect(wrapper.text()).toContain('导入说明') // 仍停留选文件步骤
    wrapper.unmount()
  })

  it('modelValue 置 false → 关闭；再次打开重置回选文件步骤（状态清空）', async () => {
    uploadMock.mockResolvedValue(RESULT_OK)
    const wrapper = createWrapper()
    await chooseFile(wrapper, xlsxFile())
    await findButton(wrapper, '开始导入')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('共读取 3 行数据')

    await findButton(wrapper, '关闭')!.trigger('click')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([false])
    wrapper.unmount()
  })
})
