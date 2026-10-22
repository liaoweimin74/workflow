// ----- TDD: MaterialListPage 上传/启停/删除/挂菜单（remote-materials 6.3）-----
// npx vitest run src/views/material/__tests__/MaterialListPage.test.ts

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'

vi.mock('@/api/material', async (importActual) => {
  const actual = await importActual<typeof import('@/api/material')>()
  return {
    ...actual,
    listMaterials: vi.fn(),
    getMaterialDetail: vi.fn(),
    uploadMaterial: vi.fn(),
    setMaterialStatus: vi.fn(),
    deleteMaterial: vi.fn(),
    overwriteMaterialMenu: vi.fn(),
    exportMaterials: vi.fn(),
    downloadScaffoldTemplate: vi.fn(),
    inspectMaterialPackage: vi.fn(),
    importMaterialPackage: vi.fn(),
  }
})

vi.mock('@/api/menu', () => ({
  createMenu: vi.fn(),
  getMenuTree: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})

const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

import MaterialListPage from '../MaterialListPage.vue'
import {
  deleteMaterial,
  downloadScaffoldTemplate,
  exportMaterials,
  importMaterialPackage,
  inspectMaterialPackage,
  listMaterials,
  overwriteMaterialMenu,
  setMaterialStatus,
  uploadMaterial,
} from '@/api/material'
import { createMenu, getMenuTree } from '@/api/menu'
import { useAuthStore } from '@/stores/auth'
import { ElMessage, ElMessageBox } from 'element-plus'

// jsdom 没有 URL.createObjectURL/revokeObjectURL，zip 下载要桩掉
const realCreateObjectURL = (URL as unknown as Record<string, unknown>).createObjectURL
const realRevokeObjectURL = (URL as unknown as Record<string, unknown>).revokeObjectURL
beforeEach(() => {
  ;(URL as unknown as Record<string, unknown>).createObjectURL = vi.fn(() => 'blob:material')
  ;(URL as unknown as Record<string, unknown>).revokeObjectURL = vi.fn()
})
afterAll(() => {
  ;(URL as unknown as Record<string, unknown>).createObjectURL = realCreateObjectURL
  ;(URL as unknown as Record<string, unknown>).revokeObjectURL = realRevokeObjectURL
})

const rows = [
  {
    id: 1,
    materialKey: 'demo-board',
    name: '示例物料看板',
    type: 'PAGE',
    version: 2,
    sdkVersion: '1',
    status: 1,
    fileSize: 3753,
    createdAt: '2026-10-19T09:53:31',
  },
]

/** SearchTable 桩：把 props/attrs 暴露给测试触发按钮，并记录 fetchApi */
let capturedProps: any = null
let capturedAttrs: any = null
const SearchTableStub = defineComponent({
  name: 'SearchTableStub',
  props: ['searchFields', 'columns', 'actionButtons', 'fetchApi', 'defaultPageSize', 'maxVisibleButtons', 'showSelection'],
  inheritAttrs: false,
  setup(props, { expose, slots, attrs }) {
    capturedProps = props
    capturedAttrs = attrs
    expose({ fetchList: vi.fn() })
    return () => h('div', { class: 'search-table-stub' }, slots.default ? slots.default() : [])
  },
})

function createWrapper() {
  const pinia = createPinia()
  setActivePinia(pinia)
  // 导出/导入/模板入口都受 material:manage 控制，多选列只在有权限时开启
  useAuthStore().permissions = ['material:manage']
  return mount(MaterialListPage, {
    global: {
      plugins: [ElementPlus, pinia],
      stubs: { SearchTable: SearchTableStub },
      directives: { permission: { mounted() {} } },
    },
  })
}

/** 勾选表格行（SearchTable 通过 selection-change 上抛） */
function selectRows(rows: unknown[]) {
  capturedAttrs.onSelectionChange(rows)
}

function actionByLabel(label: string) {
  return capturedProps.actionButtons.find((b: any) => b.label === label)
}

beforeEach(() => {
  vi.clearAllMocks()
  capturedProps = null
  ;(listMaterials as any).mockResolvedValue({
    code: 200,
    data: { content: rows, totalElements: 1 },
  })
})

describe('MaterialListPage', () => {
  it('fetchApi 把分页/筛选参数交给 listMaterials，并解出 rows/total', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const result = await capturedProps.fetchApi({ page: 1, size: 20, keyword: '看板', type: 'PAGE' })

    expect(listMaterials).toHaveBeenCalledWith({ page: 1, size: 20, keyword: '看板', type: 'PAGE' })
    expect(result).toEqual({ rows, total: 1 })
    expect(wrapper.exists()).toBe(true)
  })

  it('「打开」按物料标识跳到运行时路由', async () => {
    createWrapper()
    await flushPromises()

    actionByLabel('打开').onClick(rows[0])

    expect(mockPush).toHaveBeenCalledWith('/material/demo-board')
  })

  it('停用/启用按钮按当前状态取反调用接口', async () => {
    createWrapper()
    await flushPromises()
    ;(setMaterialStatus as any).mockResolvedValue({ code: 200, data: rows[0] })

    await actionByLabel('停用').onClick(rows[0])

    expect(setMaterialStatus).toHaveBeenCalledWith(1, 0)
  })

  it('删除遇「被菜单引用」业务码 409 时二次确认并带 force 重发', async () => {
    createWrapper()
    await flushPromises()
    ElMessageBox.confirm.mockResolvedValue('确认')
    ;(deleteMaterial as any)
      .mockRejectedValueOnce(Object.assign(new Error('物料被菜单引用: 物料看板(/material/demo-board)'), { code: 409 }))
      .mockResolvedValueOnce({ code: 200, data: null })

    await actionByLabel('删除').onClick(rows[0])
    await nextTick()
    await flushPromises()

    expect(deleteMaterial).toHaveBeenNthCalledWith(1, 1, false)
    expect(deleteMaterial).toHaveBeenNthCalledWith(2, 1, true)
  })

  it('未选文件点上传只提示不调接口', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    wrapper.find('[data-testid="upload-btn"]').trigger('click')
    await nextTick()
    wrapper.find('[data-testid="upload-submit"]').trigger('click')
    await flushPromises()

    expect(ElMessage.warning).toHaveBeenCalledWith('请同时选择 bundle 文件与 manifest 文件')
    expect(uploadMaterial).not.toHaveBeenCalled()
  })

  it('选好 bundle 与 manifest 后提交上传', async () => {
    const wrapper = createWrapper()
    await flushPromises()
    ;(uploadMaterial as any).mockResolvedValue({ code: 200, data: rows[0] })

    wrapper.find('[data-testid="upload-btn"]').trigger('click')
    await nextTick()

    const bundle = new File(['export default {}'], 'bundle.js', { type: 'application/javascript' })
    const manifest = new File(['{"key":"demo-board"}'], 'manifest.json', { type: 'application/json' })
    for (const [testid, file] of [['bundle-input', bundle], ['manifest-input', manifest]] as const) {
      const inputEl = wrapper.find(`[data-testid="${testid}"]`).element as HTMLInputElement
      Object.defineProperty(inputEl, 'files', { value: [file], configurable: true })
      // 页面在 change 事件里读 input.files，set 完必须触发
      inputEl.dispatchEvent(new Event('change'))
    }
    await nextTick()

    wrapper.find('[data-testid="upload-submit"]').trigger('click')
    await flushPromises()

    expect(uploadMaterial).toHaveBeenCalledWith(bundle, manifest)
    expect(ElMessage.success).toHaveBeenCalledWith('上传成功')
  })

  it('挂到菜单：按约定 component=material:<key>、path=/material/<key> 新建菜单', async () => {
    const wrapper = createWrapper()
    await flushPromises()
    ;(createMenu as any).mockResolvedValue({ code: 200, data: { id: 900 } })

    await actionByLabel('挂到菜单').onClick(rows[0])
    await nextTick()
    wrapper.find('[data-testid="mount-submit"]').trigger('click')
    await flushPromises()

    expect(createMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        menuName: '示例物料看板',
        menuType: 1,
        path: '/material/demo-board',
        component: 'material:demo-board',
      })
    )
  })

  it('覆盖已有菜单：调用覆盖接口，不新建菜单', async () => {
    const wrapper = createWrapper()
    await flushPromises()
    ;(getMenuTree as any).mockResolvedValue({
      code: 200,
      data: [
        {
          id: 7,
          parentId: 2,
          menuName: '旧看板入口',
          menuType: 1,
          path: '/page/old',
          component: 'page/PageRenderer',
          permission: 'page:read:old',
          icon: '',
          sortOrder: 1,
          status: 1,
          children: [],
        },
      ],
    })
    ;(overwriteMaterialMenu as any).mockResolvedValue({ code: 200, data: null })
    ElMessageBox.confirm.mockResolvedValue('确认')

    await actionByLabel('挂到菜单').onClick(rows[0])
    await nextTick()
    await flushPromises()

    await wrapper.findAll('input[type="radio"]')[1].setValue(true)
    await nextTick()

    const tree = wrapper.findComponent('[data-testid="overwrite-tree"]')
    tree.vm.$emit('update:modelValue', 7)
    await nextTick()
    expect(wrapper.text()).toContain('将覆盖菜单「旧看板入口」')

    await wrapper.find('[data-testid="mount-submit"]').trigger('click')
    await flushPromises()

    expect(overwriteMaterialMenu).toHaveBeenCalledWith(1, 7)
    expect(createMenu).not.toHaveBeenCalled()
  })

  it('未勾选物料时点导出不调接口', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    wrapper.find('[data-testid="export-btn"]').trigger('click')
    await flushPromises()

    expect(exportMaterials).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledWith('请先勾选要导出的物料')
  })

  it('勾选后按选中 id 导出并触发下载', async () => {
    const wrapper = createWrapper()
    await flushPromises()
    selectRows([rows[0]])
    await nextTick()
    const zip = new Blob(['zip'], { type: 'application/zip' })
    ;(exportMaterials as any).mockResolvedValue(zip)

    wrapper.find('[data-testid="export-btn"]').trigger('click')
    await flushPromises()

    expect(exportMaterials).toHaveBeenCalledWith([1])
    expect(URL.createObjectURL).toHaveBeenCalledWith(zip)
  })

  it('工程模板下载走同一个 blob 通道', async () => {
    const wrapper = createWrapper()
    await flushPromises()
    const zip = new Blob(['tpl'], { type: 'application/zip' })
    ;(downloadScaffoldTemplate as any).mockResolvedValue(zip)

    wrapper.find('[data-testid="template-btn"]').trigger('click')
    await flushPromises()

    expect(downloadScaffoldTemplate).toHaveBeenCalled()
    expect(URL.createObjectURL).toHaveBeenCalledWith(zip)
  })

  it('导入：选包后先预检，同 key 冲突默认跳过', async () => {
    const wrapper = createWrapper()
    await flushPromises()
    ;(inspectMaterialPackage as any).mockResolvedValue({
      code: 200,
      data: {
        exportedAt: '2026-10-19 15:00:00',
        hostSdkVersion: '1',
        items: [
          { key: 'demo-board', name: '示例物料看板', type: 'PAGE', sdkVersion: '1', version: 3,
            conflict: true, existingVersion: 2, importable: true, reason: null },
          { key: 'stat-card', name: '指标卡', type: 'WIDGET', sdkVersion: '1', version: 1,
            conflict: false, existingVersion: null, importable: true, reason: null },
        ],
      },
    })

    wrapper.find('[data-testid="import-btn"]').trigger('click')
    await nextTick()
    const file = new File(['zip'], 'materials.zip', { type: 'application/zip' })
    const inputEl = wrapper.find('[data-testid="package-input"]').element as HTMLInputElement
    Object.defineProperty(inputEl, 'files', { value: [file], configurable: true })
    inputEl.dispatchEvent(new Event('change'))
    await flushPromises()

    expect(inspectMaterialPackage).toHaveBeenCalledWith(file)
    expect(wrapper.text()).toContain('已存在（版本 2）')
    expect(wrapper.text()).toContain('全新物料')
  })

  it('导入：只把冲突条目的处置作为 actions 提交', async () => {
    const wrapper = createWrapper()
    await flushPromises()
    ;(inspectMaterialPackage as any).mockResolvedValue({
      code: 200,
      data: {
        exportedAt: '2026-10-19 15:00:00',
        hostSdkVersion: '1',
        items: [
          { key: 'demo-board', name: '示例物料看板', type: 'PAGE', sdkVersion: '1', version: 3,
            conflict: true, existingVersion: 2, importable: true, reason: null },
          { key: 'stat-card', name: '指标卡', type: 'WIDGET', sdkVersion: '1', version: 1,
            conflict: false, existingVersion: null, importable: true, reason: null },
          { key: 'legacy', name: '旧版物料', type: 'PAGE', sdkVersion: '9', version: 1,
            conflict: false, existingVersion: null, importable: false, reason: 'SDK 主版本不符（物料 9，宿主 1）' },
        ],
      },
    })
    ;(importMaterialPackage as any).mockResolvedValue({
      code: 200,
      data: {
        results: [
          { key: 'demo-board', name: '示例物料看板', status: 'OVERWRITTEN', version: 4, message: '已覆盖，版本 +1' },
          { key: 'stat-card', name: '指标卡', status: 'IMPORTED', version: 1, message: '导入成功' },
        ],
        messages: ['导入的物料默认启用'],
      },
    })

    wrapper.find('[data-testid="import-btn"]').trigger('click')
    await nextTick()
    const file = new File(['zip'], 'materials.zip', { type: 'application/zip' })
    const inputEl = wrapper.find('[data-testid="package-input"]').element as HTMLInputElement
    Object.defineProperty(inputEl, 'files', { value: [file], configurable: true })
    inputEl.dispatchEvent(new Event('change'))
    await flushPromises()

    // 冲突条目默认 SKIP：不改动直接导入
    wrapper.find('[data-testid="import-submit"]').trigger('click')
    await flushPromises()
    expect(importMaterialPackage).toHaveBeenCalledWith(file, [{ key: 'demo-board', strategy: 'SKIP' }])

    // 不可导条目（SDK 不符）在预检表格里给出原因，不进 actions
    expect(wrapper.text()).toContain('SDK 主版本不符')
  })
})
