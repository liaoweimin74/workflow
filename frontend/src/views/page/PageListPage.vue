<template>
  <div class="page-list-page">
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
        <template #type="{ row }">
          <el-tag :type="row.type === 'VIEW' ? 'primary' : 'success'">
            {{ row.type === 'VIEW' ? '视图' : '页面' }}
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

    <!-- 挂接菜单弹窗：多挂接 + 已挂列表管理 -->
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
      <el-alert
        v-if="mountedMenus.length"
        type="warning"
        :closable="false"
        show-icon
        title="继续挂接将为该页面新增一条菜单"
        class="mount-alert"
      />
      <el-form label-width="90px" @submit.prevent>
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
      <template #footer>
        <el-button @click="mountDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="mounting" @click="confirmMount">挂接</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { SearchTable } from '@/components/business'
import type { SearchField, TableColumn, ActionButton, FormConfig } from '@/components/business/types'
import { pageApi, type PageDefinitionDTO, type PageMenuItem } from '@/api/page'
import { formApi, type FormDefinitionDTO } from '@/api/form'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const tableRef = ref<InstanceType<typeof SearchTable>>()

/** 已发布业务表单（创建弹窗 formKey 下拉候选） */
const publishedForms = ref<FormDefinitionDTO[]>([])

// ========== 挂接菜单（多挂接 + 列表管理） ==========
const mountDialogVisible = ref(false)
const mounting = ref(false)
const mountTarget = ref<PageDefinitionDTO | null>(null)
const mountedMenus = ref<PageMenuItem[]>([])
const mountForm = reactive<{ name: string; parentId: number | null }>({ name: '', parentId: null })

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
  mountDialogVisible.value = true
  await loadMountedMenus(row.key)
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
  mounting.value = true
  try {
    await pageApi.mountMenu(mountTarget.value.id, {
      name: mountForm.name || undefined,
      parentId: mountForm.parentId ?? null,
    })
    ElMessage.success('挂接成功')
    mountForm.name = ''
    mountForm.parentId = null
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
    label: '类型',
    prop: 'type',
    placeholder: '全部',
    options: [
      { label: '视图', value: 'VIEW' },
      { label: '页面', value: 'PAGE' },
    ],
    style: 'width: 140px',
  },
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
  { prop: 'name', label: '页面名称', minWidth: 180 },
  { prop: 'key', label: '页面标识', width: 180 },
  { prop: 'type', label: '类型', width: 90, align: 'center', slotName: 'type' },
  { prop: 'formKey', label: '绑定表单', width: 150, slotName: 'formKey' },
  { prop: 'status', label: '状态', width: 100, align: 'center', slotName: 'status' },
  { prop: 'version', label: '版本', width: 80, align: 'center' },
  { prop: 'updatedAt', label: '最近更新时间', width: 170, slotName: 'updatedAt' },
]

// ========== 数据获取 ==========
async function fetchApi(params: any) {
  const res = await pageApi.getPages({
    page: (params.page || 1) - 1,
    size: params.size || 20,
    name: params.name || undefined,
    status: params.status || undefined,
    type: params.type || undefined,
  })
  const data = res.data as any
  return {
    rows: data.content || data.rows || [],
    total: data.totalElements || data.total || 0,
  }
}

// ========== 创建页面 ==========
const formConfig = reactive<FormConfig<PageDefinitionDTO>>({
  rule: [
    {
      type: 'select',
      field: 'type',
      title: '页面类型',
      options: [
        { label: '视图', value: 'VIEW' },
        { label: '自定义页面', value: 'PAGE' },
      ],
      value: 'VIEW',
      control: [
        {
          value: 'VIEW',
          rule: [
            {
              type: 'select',
              field: 'formKey',
              title: '绑定表单',
              options: [] as { label: string; value: string; disabled?: boolean }[],
              props: { clearable: true, placeholder: '选择已发布的业务表单' },
              validate: [{ required: true, message: '请选择绑定的业务表单', trigger: 'change' }],
            },
          ],
        },
        {
          value: 'PAGE',
          rule: [
            {
              type: 'select',
              field: 'formKey',
              title: '绑定表单',
              options: [] as { label: string; value: string; disabled?: boolean }[],
              props: { clearable: true, placeholder: '自定义页面使用数据源绑定，无需绑定表单' },
            },
          ],
        },
      ],
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
      type: data.type || 'VIEW',
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
    permission: 'page:edit',
    onClick: (row: any) => {
      router.push({ path: '/page/designer', query: { id: row.id } })
    },
  },
  {
    label: '发布',
    type: 'primary',
    permission: 'page:publish',
    show: (row: any) => row.status === 'DRAFT',
    onClick: async (row: any) => {
      try {
        await ElMessageBox.confirm('确定要发布此页面吗？', '发布确认', { type: 'warning' })
      } catch {
        return
      }
      try {
        await pageApi.publishPage(row.id)
        ElMessage.success('发布成功')
        tableRef.value?.fetchList()
      } catch {
        // http 拦截器已弹出错误消息
      }
    },
  },
  {
    label: '挂接菜单',
    permission: 'page:edit',
    show: (row: any) => row.status === 'PUBLISHED',
    onClick: (row: any) => {
      openMountDialog(row as PageDefinitionDTO)
    },
  },
  {
    label: '删除',
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
    // type control 分支内的 formKey 也注入选项
    const typeRule = formConfig.rule.find((r: any) => r.field === 'type') as any
    for (const ctl of typeRule?.control || []) {
      for (const r of ctl.rule || []) {
        if (r.field === 'formKey') {
          r.options = publishedForms.value.map((f) => ({ label: f.name, value: f.key }))
        }
      }
    }
  } catch {
    // 表单加载失败不阻断列表
  }
})
</script>

<style scoped>
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
</style>