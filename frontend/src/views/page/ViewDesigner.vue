<template>
  <div class="view-designer-page">
    <!-- 顶部工具栏 -->
    <div class="designer-toolbar">
      <el-button :icon="ArrowLeft" @click="handleBack">返回</el-button>
      <el-divider direction="vertical" />
      <el-input
        v-model="pageName"
        class="page-name-input"
        placeholder="页面名称"
        size="small"
        style="width: 200px"
      />
      <el-input
        :model-value="pageKey"
        class="page-key-input"
        placeholder="页面标识"
        size="small"
        style="width: 160px; margin-left: 8px"
        disabled
      />
      <el-tag v-if="pageType" :type="pageType === 'VIEW' ? 'primary' : 'success'" size="small" style="margin-left: 8px">
        {{ pageType === 'VIEW' ? '视图' : '页面' }}
      </el-tag>
      <el-select
        v-model="formKey"
        placeholder="选择绑定表单"
        size="small"
        style="width: 220px; margin-left: 8px"
        @change="handleBindFormChange"
      >
        <el-option v-for="f in publishedForms" :key="f.key" :label="f.name" :value="f.key" />
      </el-select>
      <el-tag v-if="formStatus" :type="statusTagType(formStatus)" size="small" style="margin-left: 8px">
        {{ statusLabel(formStatus) }}
      </el-tag>
      <div class="toolbar-right">
        <el-button type="primary" :icon="Check" @click="handleSave" :loading="saving">保存</el-button>
        <el-button
          type="success"
          :icon="Promotion"
          @click="handlePublish"
          :loading="publishing"
          :disabled="!bindFormLoaded"
        >
          {{ formStatus === 'PUBLISHED' ? '重新发布' : '发布' }}
        </el-button>
        <el-button :icon="View" @click="handlePreview">预览</el-button>
      </div>
    </div>

    <!-- 设计器主体：清单勾选式配置区 -->
    <div class="designer-body" v-loading="loading">
      <el-tabs v-model="activeTab" class="config-tabs">
        <el-tab-pane label="查询条件" name="search">
          <SearchFieldsConfig :candidates="filterableColumns" v-model="schema.searchFields" />
        </el-tab-pane>
        <el-tab-pane label="展示列" name="columns">
          <ColumnsConfig :candidates="viewColumns" v-model="schema.columns" />
        </el-tab-pane>
        <el-tab-pane label="操作" name="actions">
          <ActionsConfig v-model="schema.actions" />
        </el-tab-pane>
        <el-tab-pane label="详情" name="detail">
          <DetailConfig v-model="schema.detail" />
        </el-tab-pane>
        <el-tab-pane label="事件" name="events">
          <EventsConfig v-model="schema.events" />
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 预览弹窗：展示当前 schema JSON -->
    <el-dialog v-model="previewVisible" title="视图配置 JSON" width="760px">
      <pre class="preview-json">{{ previewJson }}</pre>
      <template #footer>
        <el-button @click="previewVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Check, Promotion, View } from '@element-plus/icons-vue'
import { pageApi, type PageDefinitionDetailDTO } from '@/api/page'
import { formApi, type FormDefinitionDTO } from '@/api/form'
import type { ColumnConfigItem } from '@/api/bizData'
import SearchFieldsConfig from './components/SearchFieldsConfig.vue'
import ColumnsConfig from './components/ColumnsConfig.vue'
import ActionsConfig from './components/ActionsConfig.vue'
import DetailConfig from './components/DetailConfig.vue'
import EventsConfig from './components/EventsConfig.vue'

// ========== Schema 类型 ==========
export interface SearchFieldConfig {
  key: string
  label: string
  matchType: string
}
export interface ColumnViewConfig {
  key: string
  label: string
  width?: number
  align?: string
  sortable?: boolean
}
export interface ViewActionsConfig {
  create: boolean
  edit: boolean
  delete: boolean
  view: boolean
  permissions: string
}
export interface ViewDetailConfig {
  enabled: boolean
  width: string
  type: string
}
export interface ViewSchema {
  searchFields: SearchFieldConfig[]
  columns: ColumnViewConfig[]
  actions: ViewActionsConfig
  detail: ViewDetailConfig
  events: any[]
}

const route = useRoute()
const router = useRouter()

const pageId = computed(() => route.query.id as string)
const pageName = ref('')
const pageKey = ref('')
const pageType = ref('')
const formKey = ref<string | null>(null)
const formStatus = ref('')

const loading = ref(false)
const saving = ref(false)
const publishing = ref(false)
const activeTab = ref('search')
/** 预览弹窗：当前视图配置 JSON */
const previewVisible = ref(false)
const previewJson = ref('')

/** 已发布业务表单（绑定表单下拉） */
const publishedForms = ref<FormDefinitionDTO[]>([])
/** 绑定表单的列映射（候选字段来源） */
const selectedColumns = ref<ColumnConfigItem[]>([])
/** 绑定表单是否已加载候选（发布按钮依赖） */
const bindFormLoaded = ref(false)

const schema = reactive<ViewSchema>({
  searchFields: [],
  columns: [],
  actions: { create: false, edit: false, delete: false, view: false, permissions: '' },
  detail: { enabled: false, width: '800px', type: 'form' },
  events: [],
})

/** 可展示列（非隐藏） */
const viewColumns = computed(() => selectedColumns.value.filter((c) => !c.hidden))

/** 可筛选列（非 JSON/TEXT、非 colorPicker、非隐藏，且 indexed 或短文本）——对齐 BizDataListPage.filterableColumns */
const filterableColumns = computed(() =>
  viewColumns.value.filter(
    (c) =>
      c.columnType !== 'JSON' &&
      c.columnType !== 'TEXT' &&
      c.componentType !== 'colorPicker' &&
      (c.indexed || (c.length != null && c.length <= 64) || c.columnType === 'VARCHAR'),
  ),
)

onMounted(async () => {
  if (!pageId.value) {
    ElMessage.error('缺少页面 ID')
    router.push('/page')
    return
  }
  loading.value = true
  try {
    const [formsRes, pageRes] = await Promise.all([
      formApi.getFormDefinitions({ type: 'BUSINESS', status: 'PUBLISHED', size: 100 }),
      pageApi.getPage(pageId.value),
    ])
    const forms = ((formsRes.data as any).content || []) as FormDefinitionDTO[]
    publishedForms.value = forms

    const def = pageRes.data as PageDefinitionDetailDTO
    pageName.value = def.name
    pageKey.value = def.key
    pageType.value = def.type || 'VIEW'
    formKey.value = def.formKey || null
    formStatus.value = def.status || 'DRAFT'
    if (def.schema) {
      try {
        Object.assign(schema, JSON.parse(def.schema))
      } catch {
        // schema 解析失败，使用默认空配置
      }
    }
    if (formKey.value) {
      await loadBindColumns(formKey.value)
    }
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    loading.value = false
  }
})

async function loadBindColumns(key: string) {
  bindFormLoaded.value = false
  try {
    const res = await formApi.getFormDefinitionByKey(key)
    const cc = res.data.columnConfig
    selectedColumns.value = cc ? JSON.parse(cc) : []
  } catch {
    selectedColumns.value = []
  } finally {
    bindFormLoaded.value = true
  }
}

function handleBindFormChange(key: string) {
  void loadBindColumns(key)
}

async function handleSave() {
  if (!pageName.value) {
    ElMessage.warning('请填写页面名称')
    return
  }
  if (!formKey.value) {
    ElMessage.warning('请选择绑定表单')
    return
  }
  saving.value = true
  try {
    const res = await pageApi.updatePage(pageId.value, {
      name: pageName.value,
      key: pageKey.value,
      type: pageType.value || 'VIEW',
      formKey: formKey.value,
      schema: JSON.stringify({ ...schema }),
    })
    ElMessage.success('保存成功')
    formStatus.value = ((res.data as any)?.status as string) || formStatus.value
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    saving.value = false
  }
}

async function handlePublish() {
  if (!bindFormLoaded.value) return
  const isRepublish = formStatus.value === 'PUBLISHED'
  const confirmText = isRepublish
    ? '确定要重新发布此页面吗？将覆盖线上渲染配置。'
    : '确定要发布此页面吗？发布后不可修改。'
  try {
    await ElMessageBox.confirm(confirmText, isRepublish ? '确认重新发布' : '确认发布', {
      type: 'warning',
    })
  } catch {
    return
  }
  publishing.value = true
  try {
    const res = await pageApi.publishPage(pageId.value)
    ElMessage.success('发布成功')
    formStatus.value = ((res.data as any)?.status as string) || 'PUBLISHED'
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    publishing.value = false
  }
}

/** 预览：展示当前视图配置 JSON（简单实现） */
function handlePreview() {
  previewJson.value = JSON.stringify({ ...schema }, null, 2)
  previewVisible.value = true
}

function handleBack() {
  const returnTo = route.query.returnTo as string
  if (returnTo) {
    router.push(returnTo)
  } else {
    router.push('/page')
  }
}

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
</script>

<style scoped>
.view-designer-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.designer-toolbar {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
  gap: 8px;
  height: 50px;
  flex-shrink: 0;
}

.page-name-input :deep(.el-input__wrapper) {
  font-weight: bold;
}

.page-key-input :deep(.el-input__wrapper) {
  font-size: 13px;
}

.toolbar-right {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.designer-body {
  flex: 1;
  overflow: hidden;
  background: #fff;
}

.config-tabs {
  padding: 0 16px;
  height: 100%;
}

.config-tabs :deep(.el-tabs__content) {
  overflow-y: auto;
  height: calc(100% - 55px);
}

.preview-json {
  max-height: 60vh;
  overflow: auto;
  background: #f5f7fa;
  padding: 12px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.6;
  margin: 0;
}
</style>