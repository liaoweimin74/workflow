<template>
  <div class="page-list-page">
    <el-tabs v-model="activeTab" class="page-list-tabs">
      <el-tab-pane label="页面" name="pages">
        <el-card style="overflow: hidden">
          <SearchTable
            ref="tableRef"
            :search-fields="searchFields"
            :columns="columns"
            :action-buttons="actionButtons"
            :fetch-api="fetchApi"
            :form-config="formConfig"
            :default-page-size="20"
            :max-visible-buttons="4"
          >
            <template #name="{ row }">
              <span>{{ row.name }}</span>
              <el-tag
                v-if="row.key === homePageKey && row.status === 'PUBLISHED'"
                size="small"
                type="success"
                class="home-tag"
              >
                首页
              </el-tag>
            </template>
            <template #status="{ row }">
              <el-tag :type="statusTagType(row.status)">
                {{ statusLabel(row.status) }}
              </el-tag>
            </template>
            <template #formKey="{ row }">
              <span>{{ row.formKey || '—' }}</span>
            </template>
            <template #updatedAt="{ row }">
              {{ formatDate(row.updatedAt) }}
            </template>
          </SearchTable>
        </el-card>
      </el-tab-pane>
      <el-tab-pane label="模板" name="templates" lazy>
        <el-card style="overflow: hidden">
          <PageTemplateTab />
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <!-- 挂接菜单弹窗：新增 / 覆盖已有菜单 + 已挂列表管理 -->
    <el-dialog v-model="mountDialogVisible" :title="`挂接到系统菜单 - ${mountTarget?.name || ''}`" width="560px">
      <!-- 已挂列表（可解除） -->
      <div v-if="mountedMenus.length" class="mounted-menus">
        <div class="mounted-menus-title">该页面已在 {{ mountedMenus.length }} 个菜单中：</div>
        <el-tag
          v-for="m in mountedMenus"
          :key="m.menuId"
          closable
          class="mounted-menu-tag"
          @close="handleUnmount(m)"
        >
          {{ m.menuName }}
        </el-tag>
      </div>
      <el-radio-group v-model="mountMode" class="mount-mode">
        <el-radio value="create">新增菜单</el-radio>
        <el-radio value="overwrite">覆盖已有菜单</el-radio>
      </el-radio-group>
      <el-alert
        v-if="mountMode === 'create' && mountedMenus.length"
        type="warning"
        :closable="false"
        show-icon
        title="继续挂接将为该页面新增一条菜单"
        class="mount-alert"
      />
      <el-form v-if="mountMode === 'create'" label-width="90px" @submit.prevent>
        <el-form-item label="菜单名称">
          <el-input v-model="mountForm.name" placeholder="默认使用页面名称" />
        </el-form-item>
        <el-form-item label="所属目录">
          <el-tree-select
            v-model="mountForm.parentId"
            :data="menuCategories"
            :props="{ label: 'menuName', children: 'children', value: 'id' }"
            check-strictly
            clearable
            placeholder="不选则挂到根目录"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <el-form v-else label-width="90px" @submit.prevent>
        <el-form-item label="目标菜单">
          <el-tree-select
            v-model="overwriteMenuId"
            :data="overwriteCandidates"
            :props="{ label: 'menuName', children: 'children', value: 'id', disabled: 'disabled' }"
            check-strictly
            filterable
            clearable
            placeholder="选择要覆盖指向的已有菜单"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <el-alert
        v-if="mountMode === 'overwrite' && selectedOverwriteMenu"
        type="warning"
        :closable="false"
        show-icon
        class="mount-alert"
        :title="`将覆盖菜单「${selectedOverwriteMenu.menuName}」`"
        :description="`覆盖后该入口将指向当前页面（原指向 ${selectedOverwriteMenu.path || '空'}）；菜单名称、目录、排序与角色授权保持不变。`"
      />
      <template #footer>
        <el-button @click="mountDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="mounting" @click="confirmMount">
          {{ mountMode === 'overwrite' ? '覆盖' : '挂接' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- A5 发布目标端对话框（确认结果携带 clientIds 下发发布） -->
    <PagePublishDialog
      v-model="publishDialogVisible"
      :page-name="publishTargetName"
      :rule="publishTargetRule"
      @confirm="handlePublishConfirm"
    />
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'PageList' })

import { ref, computed, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { EditPen, Promotion, Menu, Delete, HomeFilled } from '@element-plus/icons-vue'
import { SearchTable } from '@/components/business'
import type { SearchField, TableColumn, ActionButton, FormConfig } from '@/components/business/types'
import { pageApi, type PageDefinitionDTO, type PageMenuItem } from '@/api/page'
import { getMenuTree } from '@/api/menu'
import type { MenuTree } from '@/types/menu'
import { formApi, type FormDefinitionDTO } from '@/api/form'
import { useAuthStore } from '@/stores/auth'
import PageTemplateTab from './PageTemplateTab.vue'
import PagePublishDialog from './components/PagePublishDialog.vue'

const router = useRouter()
const authStore = useAuthStore()
const tableRef = ref<InstanceType<typeof SearchTable>>()

/** 页面 / 模板 两个 Tab */
const activeTab = ref<'pages' | 'templates'>('pages')

/** 已发布业务表单（创建弹窗 formKey 下拉候选） */
const publishedForms = ref<FormDefinitionDTO[]>([])

/** 当前租户的首页页面 key（后端未配置或配置失效时返回 dashboard） */
const homePageKey = ref('dashboard')

// A5 发布目标端对话框：列表页发布先选端再下发
const publishDialogVisible = ref(false)
const publishTargetId = ref('')
const publishTargetName = ref('')
// 批C C3：发布拦截清单需要当前 rule——异步拉定义回填（拉到前=不拦截，与原行为一致）
const publishTargetRule = ref<unknown[] | undefined>(undefined)

async function handlePublishConfirm(clientIds: number[]) {
  try {
    await pageApi.publishPage(publishTargetId.value, clientIds)
    ElMessage.success('发布成功')
    tableRef.value?.fetchList()
  } catch {
    // http 拦截器已弹出错误消息
  }
}

async function loadHomePageKey() {
  try {
    const res = await pageApi.getHomePage()
    if (res.data) homePageKey.value = res.data
  } catch {
    // 读取失败时保留默认 dashboard，不阻断列表
  }
}

// ========== 挂接菜单（多挂接 + 列表管理） ==========
const mountDialogVisible = ref(false)
const mounting = ref(false)
const mountTarget = ref<PageDefinitionDTO | null>(null)
const mountedMenus = ref<PageMenuItem[]>([])
const mountForm = reactive<{ name: string; parentId: number | null }>({ name: '', parentId: null })
const mountMode = ref<'create' | 'overwrite'>('create')
const overwriteMenuId = ref<number | null>(null)
const overwriteMenuTree = ref<MenuTree[]>([])

/** 覆盖候选：全量菜单树，按钮与内置首页不可作目标；已指向当前页面的菜单置灰 */
const overwriteCandidates = computed(() =>
  buildOverwriteTree(overwriteMenuTree.value, `/page/${mountTarget.value?.key || ''}`),
)
const selectedOverwriteMenu = computed(() => findMenuById(overwriteMenuTree.value, overwriteMenuId.value))

// 首页固定渲染在侧栏（/dashboard），覆盖它会出现两个「首页」
function buildOverwriteTree(menus: MenuTree[], currentPath: string): any[] {
  return menus
    .filter((m) => m.menuType !== 2)
    .map((m) => ({
      ...m,
      disabled: m.menuType !== 1 || m.path === currentPath || m.menuName === '首页',
      children: buildOverwriteTree(m.children || [], currentPath),
    }))
}

function findMenuById(menus: MenuTree[], id: number | null): MenuTree | null {
  if (id == null) return null
  for (const menu of menus) {
    if (menu.id === id) return menu
    const hit = findMenuById(menu.children || [], id)
    if (hit) return hit
  }
  return null
}

async function loadOverwriteMenus() {
  try {
    const res = await getMenuTree()
    overwriteMenuTree.value = res.data || []
  } catch {
    overwriteMenuTree.value = []
  }
}

/** 所属目录候选：authStore.menus 中 menuType===0 的目录节点（递归） */
const menuCategories = computed(() => filterMenuDirs(authStore.menus as any[]))

function filterMenuDirs(menus: any[]): any[] {
  return (menus || [])
    .filter((m: any) => m.menuType === 0)
    .map((m: any) => ({
      ...m,
      children: m.children ? filterMenuDirs(m.children) : [],
    }))
}

/** 打开挂接弹窗：记录目标页面 + 加载已挂列表 */
async function openMountDialog(row: PageDefinitionDTO) {
  mountTarget.value = row
  mountForm.name = ''
  mountForm.parentId = null
  mountMode.value = 'create'
  overwriteMenuId.value = null
  mountDialogVisible.value = true
  await Promise.all([loadMountedMenus(row.key), loadOverwriteMenus()])
}

async function loadMountedMenus(pageKey: string) {
  try {
    const res = await pageApi.getMenusByKey(pageKey)
    mountedMenus.value = res.data?.items || []
  } catch {
    mountedMenus.value = []
  }
}

async function confirmMount() {
  if (!mountTarget.value) return
  if (mountMode.value === 'overwrite' && overwriteMenuId.value == null) {
    ElMessage.warning('请选择要覆盖的菜单')
    return
  }
  if (mountMode.value === 'overwrite') {
    const target = selectedOverwriteMenu.value
    try {
      await ElMessageBox.confirm(
        `确定把菜单「${target?.menuName}」的入口改为当前页面吗？原指向 ${target?.path || '空'} 将被替换。`,
        '覆盖确认',
        { type: 'warning' },
      )
    } catch {
      return
    }
  }
  mounting.value = true
  try {
    if (mountMode.value === 'overwrite') {
      await pageApi.overwriteMenu(mountTarget.value.id, overwriteMenuId.value!)
      ElMessage.success('已覆盖菜单入口')
      overwriteMenuId.value = null
    } else {
      await pageApi.mountMenu(mountTarget.value.id, {
        name: mountForm.name || undefined,
        parentId: mountForm.parentId ?? null,
      })
      ElMessage.success('挂接成功')
      mountForm.name = ''
      mountForm.parentId = null
    }
    await loadMountedMenus(mountTarget.value.key)
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    mounting.value = false
  }
}

async function handleUnmount(menu: PageMenuItem) {
  try {
    await ElMessageBox.confirm(`确定解除菜单「${menu.menuName}」吗？`, '解除挂接', {
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await pageApi.unmountMenu(menu.menuId)
    ElMessage.success('已解除')
    if (mountTarget.value) {
      await loadMountedMenus(mountTarget.value.key)
    }
  } catch {
    // http 拦截器已弹出错误消息
  }
}

// ========== 搜索 ==========
const searchFields = computed<SearchField[]>(() => [
  { type: 'input', label: '页面名称', prop: 'name', placeholder: '搜索页面名称', style: 'width: 200px' },
  {
    type: 'select',
    label: '状态',
    prop: 'status',
    placeholder: '全部',
    options: [
      { label: '草稿', value: 'DRAFT' },
      { label: '已发布', value: 'PUBLISHED' },
      { label: '已归档', value: 'ARCHIVED' },
    ],
    style: 'width: 140px',
  },
])

// ========== 列 ==========
const columns: TableColumn[] = [
  { prop: 'name', label: '页面名称', minWidth: 180, slotName: 'name' },
  { prop: 'key', label: '页面标识', width: 180 },
  { prop: 'formKey', label: '绑定表单', width: 150, slotName: 'formKey' },
  { prop: 'status', label: '状态', width: 100, align: 'center', slotName: 'status' },
  { prop: 'version', label: '版本', width: 80, align: 'center' },
  { prop: 'updatedAt', label: '最近更新时间', width: 170, slotName: 'updatedAt' },
]

// ========== 数据获取 ==========
async function fetchApi(params: any) {
  const res = await pageApi.getPages({
    page: params.page || 1,
    size: params.size || 20,
    name: params.name || undefined,
    status: params.status || undefined,
  })
  const data = res.data as any
  return {
    rows: data.content || data.rows || [],
    total: data.totalElements || data.total || 0,
  }
}

// ========== 创建页面 ==========
// 需求变更（2024-Q4）：新建不再选择页面类型，统一为自定义页面（type=PAGE）；
// 绑定表单改为可选 —— 自定义页面用数据源绑定，也可按需绑定已发布表单
const formConfig = reactive<FormConfig<PageDefinitionDTO>>({
  rule: [
    {
      type: 'select',
      field: 'formKey',
      title: '绑定表单（可选）',
      options: [] as { label: string; value: string; disabled?: boolean }[],
      props: { clearable: true, placeholder: '自定义页面用数据源绑定，可不绑定表单' },
    },
    { type: 'input', field: 'name', title: '页面名称', validate: [{ required: true, message: '请输入页面名称', trigger: 'blur' }] },
    {
      type: 'input',
      field: 'key',
      title: '页面标识',
      validate: [
        { required: true, message: '请输入页面标识', trigger: 'blur' },
        { pattern: /^[a-z][a-z0-9_]*$/, message: '只能包含小写字母、数字、下划线，且以字母开头', trigger: 'blur' },
      ],
    },
  ],
  dialogTitle: { create: '新建页面' },
  createPermission: 'page:create',
  createApi: async (data: any) => {
    const res = await pageApi.createPage({
      name: data.name,
      key: data.key,
      type: 'PAGE',
      formKey: data.formKey || null,
    })
    router.push({ path: '/page/designer', query: { id: res.data.id } })
    return res
  },
})

// ========== 操作按钮 ==========
const actionButtons: ActionButton[] = [
  {
    label: '设计',
    icon: EditPen,
    permission: 'page:edit',
    onClick: (row: any) => {
      router.push({ path: '/page/designer', query: { id: row.id } })
    },
  },
  {
    label: '发布',
    icon: Promotion,
    type: 'primary',
    permission: 'page:publish',
    show: (row: any) => row.status === 'DRAFT',
    onClick: (row: any) => {
      // A5：发布先经目标端对话框选端，再随请求下发
      publishTargetId.value = row.id
      publishTargetName.value = row.name
      publishTargetRule.value = undefined
      publishDialogVisible.value = true
      // C3：拉当前定义解析 rule 供移动拦截清单（失败=保持不拦截，不阻塞发布流程）
      pageApi.getPage(row.id).then((res) => {
        try {
          publishTargetRule.value = JSON.parse((res.data as any)?.schema || '{}')?.rule
        } catch {
          publishTargetRule.value = undefined
        }
      }).catch(() => {})
    },
  },
  {
    label: '挂接菜单',
    icon: Menu,
    permission: 'page:edit',
    show: (row: any) => row.status === 'PUBLISHED',
    onClick: (row: any) => {
      openMountDialog(row as PageDefinitionDTO)
    },
  },
  {
    label: '设为首页',
    icon: HomeFilled,
    permission: 'page:publish',
    show: (row: any) =>
      row.status === 'PUBLISHED' && row.type === 'PAGE' && row.key !== homePageKey.value,
    onClick: async (row: any) => {
      try {
        await ElMessageBox.confirm(
          `确定将页面「${row.name}」设为系统首页吗？登录后将优先展示该页面，无访问权限的用户回退默认首页。`,
          '设为首页',
          { type: 'warning' },
        )
      } catch {
        return
      }
      try {
        await pageApi.setHomePage(row.id)
        homePageKey.value = row.key
        ElMessage.success('已设为首页')
      } catch {
        // http 拦截器已提示
      }
    },
  },
  {
    label: '删除',
    icon: Delete,
    type: 'danger',
    permission: 'page:delete',
    show: (row: any) => row.status === 'DRAFT',
    onClick: async (row: any) => {
      try {
        await ElMessageBox.confirm('确定要删除此页面吗？', '删除确认', { type: 'warning' })
      } catch {
        return
      }
      try {
        await pageApi.deletePage(row.id)
        ElMessage.success('删除成功')
        tableRef.value?.fetchList()
      } catch {
        // http 拦截器已弹出错误消息（如仅草稿可删）
      }
    },
  },
]

// ========== 工具函数 ==========
function statusTagType(status: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    DRAFT: 'warning',
    PUBLISHED: 'success',
    ARCHIVED: 'info',
  }
  return map[status] || ''
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    DRAFT: '草稿',
    PUBLISHED: '已发布',
    ARCHIVED: '已归档',
  }
  return map[status] || status
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ========== 初始化：加载已发布业务表单（formKey 下拉候选） ==========
onMounted(async () => {
  try {
    const res = await formApi.getFormDefinitions({ type: 'BUSINESS', status: 'PUBLISHED', size: 100 })
    const data = res.data as any
    publishedForms.value = data.content || data.rows || []
    const formKeyRule = formConfig.rule.find((r: any) => r.field === 'formKey') as any
    if (formKeyRule) {
      formKeyRule.options = publishedForms.value.map((f) => ({ label: f.name, value: f.key }))
    }
  } catch {
    // 表单加载失败不阻断列表
  }
  await loadHomePageKey()
})
</script>

<style scoped>
/* 对齐用户管理布局标准：根容器撑满 main，tabs 接管剩余高度，卡片与内部 SearchTable 逐级填满 */
.page-list-page {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.page-list-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.page-list-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.page-list-tabs :deep(.el-tab-pane) {
  height: 100%;
}
/* 只命中 tab pane 的直接子卡片，避免波及 SearchTable 内部的 .search-card 等嵌套 el-card */
.page-list-tabs :deep(.el-tab-pane > .el-card) {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.page-list-tabs :deep(.el-tab-pane > .el-card > .el-card__body) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.mount-mode {
  margin-bottom: 14px;
}
.mounted-menus {
  margin-bottom: 12px;
}
.mounted-menus-title {
  font-size: 13px;
  color: #909399;
  margin-bottom: 6px;
}
.mounted-menu-tag {
  margin-right: 6px;
  margin-bottom: 6px;
}
.mount-alert {
  margin-bottom: 12px;
}
.home-tag {
  margin-left: 6px;
}
</style>
