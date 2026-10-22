<script setup lang="ts">
defineOptions({ name: 'MenuManagement' })

import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { SearchTable } from '@/components/business'
import { FolderAdd, Rank } from '@element-plus/icons-vue'
import type { SearchField, TableColumn, ActionButton, FormConfig } from '@/components/business/types'
import type { Rule } from '@form-create/element-ui'
import { getMenuTree, createMenu, updateMenu, deleteMenu, moveMenu } from '@/api/menu'
import { pageApi, type PageDefinitionDTO } from '@/api/page'
import type { MenuTree } from '@/types/menu'
import { useAuthStore } from '@/stores/auth'
import {
  MENU_TYPE_BUTTON,
  MENU_TYPE_DIR,
  MENU_TYPE_MENU,
  defaultChildType,
  findNode,
  normalizeParentId,
  placementError,
  resolveDrop,
} from './menuDrop'
import { useMenuTreeDrag } from './useMenuTreeDrag'

const searchTableRef = ref()
const list = ref<MenuTree[]>([])
const authStore = useAuthStore()
/** 无更新权限时不给把手，避免拖出一次注定 403 的请求 */
const canDrag = computed(() => authStore.hasPermission('system:menu:update'))
/** 弹窗态：编辑时「上级菜单」只做展示（层级由拖动调整） */
const dialogMode = ref<'create' | 'edit'>('create')

const menuTypeMap: Record<number, string> = { 0: '目录', 1: '菜单', 2: '按钮' }
const menuTypeOptions = [
  { label: '目录', value: 0 }, { label: '菜单', value: 1 }, { label: '按钮', value: 2 },
]

// ---------- 搜索字段（空，树形不搜索） ----------
const searchFields: SearchField[] = []

// ---------- 表格列 ----------
const columns: TableColumn[] = [
  { prop: 'menuName', label: '菜单名称', minWidth: 180, slotName: 'menuName' },
  { label: '图标', width: 80, slotName: 'icon' },
  { label: '类型', width: 80, align: 'center', slotName: 'menuType' },
  { prop: 'path', label: '路由', width: 160 },
  { prop: 'component', label: '组件路径', width: 200 },
  { prop: 'permission', label: '权限标识', width: 180 },
  { prop: 'sortOrder', label: '排序', width: 70, align: 'center' },
]

// ---------- fetchApi（树形无分页） ----------
async function fetchApi(_params: any) {
  const res = await getMenuTree()
  list.value = res.data
  // tbody 可能因表格重建而更换节点，每次取数后重新绑定把手
  initRowDrag()
  return { rows: res.data, total: res.data.length }
}

// ---------- 行拖动：层级 + 排序 ----------
const { init: initRowDrag } = useMenuTreeDrag({
  getTbody: () => searchTableRef.value?.$el?.querySelector('.el-table__body-wrapper tbody'),
  judge: (dragId, hoverId, band) => resolveDrop(list.value, dragId, hoverId, band),
  onDrop: async (dragId, target) => {
    try {
      await moveMenu(dragId, target)
      ElMessage.success('层级/排序已更新')
    } finally {
      // 服务端会重排相关兄弟节点的排序号，无论如何都以服务端为准重取
      await searchTableRef.value?.fetchList()
    }
  },
  onRejected: (message) => ElMessage.warning(message),
  disabled: () => !canDrag.value,
})

/** 已发布页面列表（关联页面下拉候选） */
const publishedPages = ref<PageDefinitionDTO[]>([])

// ---------- 加载已发布页面 ----------
async function loadPublishedPages() {
  try {
    const res = await pageApi.getPages({ status: 'PUBLISHED', size: 100 })
    const data = res.data as any
    publishedPages.value = data.content || data.rows || []
  } catch {
    publishedPages.value = []
  }
}

// ---------- 加载已发布页面（延迟到首次打开表单） ----------
let _pagesLoaded = false
async function ensurePublishedPages() {
  dialogMode.value = 'create'
  if (_pagesLoaded) return
  _pagesLoaded = true
  await loadPublishedPages()
}

// ---------- 新增子菜单（子类型由父类型决定：目录→菜单，菜单→按钮） ----------
function handleAddChild(parent: MenuTree) {
  const menuType = defaultChildType(parent.menuType)
  if (menuType === null) return
  // 不预填 sortOrder：留空由后端追加到同级末尾，避免新项挤到列表最前
  searchTableRef.value?.openFormDialog({ parentId: parent.id, menuType, status: 1 })
}

// ---------- 操作按钮 ----------
const actionButtons: ActionButton[] = [
  { label: '新增子菜单', icon: FolderAdd, size: 'small', link: true, show: (row: MenuTree) => row.menuType !== MENU_TYPE_BUTTON, onClick: (row: MenuTree) => handleAddChild(row) },
]

/** 上级菜单的展示名（编辑弹窗只读回显用） */
function parentLabel(node: MenuTree): string {
  const parentId = normalizeParentId(node.parentId)
  if (parentId === null) return '（根级）'
  return findNode(list.value, parentId)?.menuName ?? '（未知）'
}

/** 按当前菜单类型决定该字段是否必填（隐藏的字段类型直接跳过校验） */
function requiredForMenuType(types: number[], message: string) {
  return [{
    validator(this: any, _rule: unknown, value: unknown, callback: (error?: Error) => void) {
      const menuType = Number(this?.api?.getValue?.('menuType'))
      if (!types.includes(menuType)) return callback()
      if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
        return callback(new Error(message))
      }
      callback()
    },
    trigger: 'blur',
  }]
}

/** 上级菜单层级校验：与后端一致，提前指出该类型能挂在哪里 */
function validateParentPlacement(this: any, _rule: unknown, value: unknown, callback: (error?: Error) => void) {
  const menuType = Number(this?.api?.getValue?.('menuType'))
  const parentId = normalizeParentId(value as number | null | undefined)
  const parentType = parentId === null ? null : findNode(list.value, parentId)?.menuType ?? null
  const error = placementError(menuType, parentType)
  if (!error) return callback()
  const hint = menuType === MENU_TYPE_DIR
    ? '，请选择目录作为上级菜单或留空'
    : menuType === MENU_TYPE_MENU
      ? '，请选择目录作为上级菜单'
      : '，请选择菜单作为上级菜单'
  callback(new Error(error + hint))
}

// ---------- 表单配置（form-create rule） ----------
const formConfig = computed<FormConfig<MenuTree>>(() => {
  // 编辑态：后端 update 不改 parentId，层级由拖动负责，故此处只展示不可改
  const parentRule: Rule = dialogMode.value === 'edit'
    ? {
        type: 'input', field: 'parentName', title: '上级菜单',
        props: { disabled: true },
        info: '调整层级或排序请在列表中拖动该行',
      }
    : {
        type: 'treeSelect', field: 'parentId', title: '上级菜单',
        props: { data: list.value, props: { label: 'menuName', value: 'id', children: 'children' } },
        validate: [{ validator: validateParentPlacement, trigger: 'change' }],
      }

  const rule: Rule[] = [
    parentRule,
    {
      type: 'select', field: 'menuType', title: '菜单类型', options: menuTypeOptions,
      // 顶层「新增」默认建目录：菜单必须挂在目录下，根级建菜单必被后端拒绝
      value: 0,
      validate: [{ required: true, message: '请选择菜单类型', trigger: 'change' }],
      update: (val: number, _rule: any, fApi: any, arg?: { origin?: string }) => {
        const isDir = val === 0
        const isMenu = val === 1
        const isButton = val === 2
        // updateRule 只改规则不刷新视图：切换类型时必须走 hidden() 才会重新渲染字段
        const setHidden = (field: string, hidden: boolean) => {
          if (fApi.hiddenStatus?.(field) === hidden) return
          if (arg?.origin === 'init') fApi.updateRule(field, { hidden })
          else fApi.hidden(hidden, field)
        }
        setHidden('path', isButton)
        setHidden('icon', isButton)
        setHidden('status', isButton)
        setHidden('component', !isMenu)
        setHidden('permission', isDir)
        setHidden('linkedPage', !isMenu)
      },
    },
    {
      type: 'input', field: 'menuName', title: '菜单名称',
      validate: [{ required: true, whitespace: true, message: '请输入菜单名称', trigger: 'blur' }],
    },
    {
      // 关联已发布页面/视图：选中后自动回填 path/component/permission
      type: 'select', field: 'linkedPage', title: '关联页面',
      options: publishedPages.value.map((p) => ({ label: `${p.name}（${p.key}）`, value: p.key })),
      props: { clearable: true, filterable: true, placeholder: '选择已发布的页面/视图（可选）' },
      validate: [],
      on: {
        change: (val: string | undefined, _f: any, fApi: any) => {
          const page = publishedPages.value.find((p) => p.key === val)
          if (!page) {
            fApi.setValue('path', undefined)
            fApi.setValue('component', undefined)
            fApi.setValue('permission', undefined)
            return
          }
          fApi.setValue('path', `/page/${page.key}`)
          fApi.setValue('component', 'page/PageRenderer')
          fApi.setValue('permission', `page:read:${page.key}`)
        },
      },
    },
    {
      type: 'input', field: 'path', title: '路由路径',
      validate: requiredForMenuType([MENU_TYPE_DIR, MENU_TYPE_MENU], '请输入路由路径'),
    },
    {
      type: 'input', field: 'icon', title: '图标',
      props: { placeholder: 'Element Plus 图标名' },
    },
    {
      type: 'radio', field: 'status', title: '可见',
      options: [{ label: '显示', value: 1 }, { label: '隐藏', value: 0 }],
    },
    {
      type: 'input', field: 'component', title: '组件路径',
      props: {
        placeholder: 'views/system/user/UserPage 或 material:<物料key>',
      },
      // 远程物料页面（remote-materials）：component 填 material:<key>、path 填 /material/<key>
      info: '远程物料页面：组件路径填 material:<物料key>，路由路径填 /material/<物料key>',
      validate: requiredForMenuType([MENU_TYPE_MENU], '请输入组件路径'),
    },
    {
      type: 'input', field: 'permission', title: '权限标识',
      props: { placeholder: 'system:user:add' },
      validate: requiredForMenuType([MENU_TYPE_BUTTON], '请输入权限标识'),
    },
    {
      type: 'inputNumber', field: 'sortOrder', title: '排序',
    },
  ]

  return {
    rule,
    createApi: (data) => createMenu(stripClientOnly(data)),
    updateApi: (id, data) => updateMenu(id as number, stripClientOnly(data, true)),
    deleteApi: async (id) => { await deleteMenu(id as number) },
    getApi: async (id) => {
      dialogMode.value = 'edit'
      const node = findNode(list.value, Number(id))
      return node ? { ...node, parentName: parentLabel(node) } : node
    },
    createPermission: 'system:menu:create',
    editPermission: 'system:menu:update',
    deletePermission: 'system:menu:delete',
    onFormOpen: ensurePublishedPages,
  } as FormConfig<MenuTree>
})

/** 提交时剔除前端辅助字段（后端 DTO 无这些字段）；编辑态连 parentId 一起去掉 */
function stripClientOnly(data: any, dropParentId = false): any {
  const { linkedPage, parentName, parentId, ...rest } = data || {}
  if (!dropParentId && parentId !== undefined) rest.parentId = parentId
  return rest
}
</script>

<template>
  <SearchTable
    ref="searchTableRef"
    :search-fields="searchFields"
    :columns="columns"
    :action-buttons="actionButtons"
    :fetch-api="fetchApi"
    :form-config="formConfig"
    :tree-props="{ rowKey: 'id', children: 'children', defaultExpandAll: true }"
    :show-search="false"
  >
    <template #menuName="{ row }">
      <el-icon
        v-if="canDrag"
        class="menu-drag-handle"
        :data-menu-id="row.id"
        title="拖动调整层级和排序"
      ><Rank /></el-icon>
      <span>{{ row.menuName }}</span>
    </template>
    <template #icon="{ row }">
      <el-icon><component :is="row.icon || 'Menu'" /></el-icon>
    </template>
    <template #menuType="{ row }">
      <el-tag :type="row.menuType === 0 ? '' : row.menuType === 1 ? 'success' : 'warning'" size="small">
        {{ menuTypeMap[row.menuType] }}
      </el-tag>
    </template>
  </SearchTable>
</template>

<style scoped>
.menu-drag-handle {
  cursor: grab;
  margin-right: 6px;
  vertical-align: -2px;
  color: var(--el-text-color-secondary);
}
.menu-drag-handle:active {
  cursor: grabbing;
}

/* 拖动落点提示：上/下边缘=同级插入线，行中间=成为该行的子节点，红色=该落点违反层级规则 */
:deep(.el-table__body tr.menu-drop-into > td.el-table__cell) {
  background-color: var(--el-color-primary-light-9) !important;
}
:deep(.el-table__body tr.menu-drop-before > td.el-table__cell) {
  box-shadow: inset 0 2px 0 var(--el-color-primary);
}
:deep(.el-table__body tr.menu-drop-after > td.el-table__cell) {
  box-shadow: inset 0 -2px 0 var(--el-color-primary);
}
:deep(.el-table__body tr.menu-drop-invalid > td.el-table__cell) {
  background-color: var(--el-color-danger-light-9) !important;
}
</style>
