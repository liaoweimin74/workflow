<template>
  <div class="page-designer-page">
    <!-- 顶部工具栏 -->
    <div class="designer-toolbar">
      <el-button :icon="ArrowLeft" @click="handleBack">返回</el-button>
      <el-divider direction="vertical" />
      <el-input
        v-model="pageName"
        class="page-name-input"
        placeholder="页面名称"
        style="width: 200px"
      />
      <el-input
        :model-value="pageKey"
        class="page-key-input"
        placeholder="页面标识"
        style="width: 160px; margin-left: 8px"
        disabled
      />
      <el-tag type="success" style="margin-left: 8px">自定义页面</el-tag>
      <el-tag v-if="formStatus" :type="statusTagType(formStatus)" style="margin-left: 8px">
        {{ statusLabel(formStatus) }}
      </el-tag>
      <div class="toolbar-right">
        <el-button plain @click="dsDialogVisible = true">
          数据源配置（{{ schema.dataSources.length }}）
        </el-button>
        <el-button type="primary" :icon="Check" @click="handleSave" :loading="saving">保存</el-button>
        <el-button type="success" :icon="Promotion" @click="handlePublish" :loading="publishing">
          {{ formStatus === 'PUBLISHED' ? '重新发布' : '发布' }}
        </el-button>
        <el-button :icon="View" @click="handlePreview">预览</el-button>
        <el-button :icon="Document" @click="handleShowJson">JSON 配置</el-button>
      </div>
    </div>

    <!-- 设计器主体：FcDesigner 画布 -->
    <div class="designer-body" v-loading="loading">
      <fc-designer
        ref="designerRef"
        :height="designerHeight"
        :config="designerConfig"
      />
    </div>

    <!-- 数据源/动作配置弹窗 -->
    <el-dialog v-model="dsDialogVisible" title="数据源绑定与动作总线" width="680px">
      <DataSourceConfigPanel
        ref="dsConfigPanelRef"
        :dataSources="schema.dataSources.map(ds => ({ id: ds.id, refId: ds.refId, searchFields: ds.searchFields }))"
        :enabledDataSources="enabledDataSources"
        :actions="schema.actions"
        @update:dataSources="updateDataSources"
        @update:actions="updateActions"
      />
      <template #footer>
        <el-button @click="dsDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmDsConfig">确定</el-button>
      </template>
    </el-dialog>

    <!-- 数据表格数据源配置 -->
    <DsBindingConfigDialog
      v-model="pageTableDialogVisible"
      :current-fields="[]"
      :binding-props="currentPageTableProps"
      :form-data-sources="schema.dataSources.map(ds => ({ id: ds.id, refId: ds.refId }))"
      :table-mode="true"
      @confirm="handlePageTableConfirm"
    />

    <!-- JSON 弹窗 -->
    <el-dialog v-model="previewVisible" title="页面配置 JSON" width="760px">
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
import { ArrowLeft, Check, Promotion, View, Document } from '@element-plus/icons-vue'
import FcDesigner from '@form-create/designer'
import PageDataTable from './components/PageDataTable.vue'
import PageDataTree from './components/PageDataTree.vue'
import { pageApi, type PageDefinitionDetailDTO } from '@/api/page'
import { dataSourceApi, type DataSourceDTO } from '@/api/data-source'
import DataSourceConfigPanel from '@/components/business/DataSourceConfigPanel.vue'
import DsBindingConfigDialog from '@/views/form/components/DsBindingConfigDialog.vue'

// 注册页面数据组件到 FcDesigner（表单组件已全局注册，页面可复用）
FcDesigner.component('page-table', PageDataTable)
FcDesigner.component('page-tree', PageDataTree)

const route = useRoute()
const router = useRouter()

const designerRef = ref<any>(null)
const pageId = computed(() => route.query.id as string)
const pageName = ref('')
const pageKey = ref('')
const formStatus = ref('')
const loading = ref(false)
const saving = ref(false)
const publishing = ref(false)
const previewVisible = ref(false)
const previewJson = ref('')
/** 数据源/动作配置弹窗 */
const dsDialogVisible = ref(false)
const dsConfigPanelRef = ref<InstanceType<typeof DataSourceConfigPanel> | null>(null)

function confirmDsConfig() {
  dsConfigPanelRef.value?.confirm()
  dsDialogVisible.value = false
}
const dsTab = ref('ds')

/** FcDesigner 配置：隐藏表单专用面板，保留组件/属性 */
const designerConfig = {
  fieldReadonly: false,
  disabledFormConfig: ['formCreateFormName'],
}

const designerHeight = '100%'

/** 页面 schema：dataSources 与 actions（rule 由 FcDesigner 管理） */
const schema = reactive<{
  dataSources: { id: string; refId: string; searchFields?: string[] }[]
  actions: any[]
}>({
  dataSources: [],
  actions: [],
})

/** 已启用全局数据源 */
const enabledDataSources = ref<DataSourceDTO[]>([])

// ===== 页面数据表格数据源配置 =====
const pageTableDialogVisible = ref(false)
const currentPageTableProps = computed(() => {
  const active = designerRef.value?.activeRule as any
  return active?.props || {}
})
function openPageTableDsConfig() {
  pageTableDialogVisible.value = true
}
function handlePageTableConfirm(newProps: Record<string, any>) {
  const active = designerRef.value?.activeRule as any
  if (active?.props) Object.assign(active.props, newProps)
  ElMessage.success('数据表格数据源配置已保存')
}

/** 注册页面组件到 FcDesigner 面板，并通过 setComponentRuleConfig 在属性面板注入"数据源"按钮（动态读取页面绑定层） */
function registerPageComponents() {
  // 属性面板注入：数据源按钮 + 表格配置（选项来自页面绑定层 schema.dataSources）
  const dataSourceProps = () => [
    {
      type: 'button',
      field: 'dsConfigTrigger',
      title: '数据源',
      children: ['配置数据源'],
      native: true,
      style: { width: '100%', borderColor: '#2E73FF', color: '#2E73FF' },
      props: { size: 'small' },
      on: { click: () => openPageTableDsConfig() },
    },
  ]

  designerRef.value?.addComponent({
    label: '数据表格',
    name: 'page-table',
    icon: 'icon-grid',
    menu: 'main',
    rule: () => ({
      type: 'page-table',
      field: 'table' + Date.now(),
      title: '数据表格',
      props: {
        dataSourceId: '',
        border: true,
        stripe: true,
        columns: [],
        sortable: false,
        filterable: false,
        pagination: true,
        selectionMode: 'none',
        actionColumnWidth: 0,
      },
    }),
  })
  // 属性面板"属性配置"区注入数据源下拉 + 表格配置（选中画布中该组件时动态求值）
  designerRef.value?.setComponentRuleConfig('page-table', dataSourceProps, true)

  designerRef.value?.addComponent({
    label: '树形数据',
    name: 'page-tree',
    icon: 'icon-tree',
    menu: 'main',
    rule: () => ({
      type: 'page-tree',
      field: 'tree' + Date.now(),
      title: '树形数据',
      props: {
        dataSourceId: '',
        'node-key': 'id',
        props: { label: 'name', children: 'children' },
        highlightCurrent: true,
        defaultExpandAll: true,
      },
    }),
  })
  designerRef.value?.setComponentRuleConfig('page-tree', dataSourceProps, true)

  // formContainer（数据表单容器）：属性面板数据源下拉使用页面级 schema.dataSources
  designerRef.value?.setComponentRuleConfig(
    'formContainer',
    () => [
      {
        type: 'select',
        field: 'dataSourceId',
        title: '数据源',
        value: '',
        options: schema.dataSources.map((ds) => ({ value: ds.id, label: ds.id })),
        props: {
          clearable: true,
          filterable: true,
          placeholder: '选择页面内数据源',
        },
      },
      {
        type: 'json',
        field: 'recordLocator',
        title: '记录定位',
        value: { type: 'current-record' },
      },
    ],
    false,
  )
}

onMounted(async () => {
  // 注册页面数据组件到 FcDesigner 拖拽面板（数据源配置入口在表单配置页签底部）
  registerPageComponents()

  if (!pageId.value) {
    ElMessage.error('缺少页面 ID')
    router.push('/page')
    return
  }
  loading.value = true
  try {
    const [dsRes, pageRes] = await Promise.all([
      dataSourceApi.getEnabledDataSources(),
      pageApi.getPage(pageId.value),
    ])
    enabledDataSources.value = (dsRes.data || []).filter((d) => d.type === 'FORM' || d.type === 'API' || d.type === 'SYSTEM')

    const def = pageRes.data as PageDefinitionDetailDTO
    pageName.value = def.name
    pageKey.value = def.key
    formStatus.value = def.status || 'DRAFT'
    if (def.schema) {
      try {
        const parsed = JSON.parse(def.schema)
        schema.dataSources = parsed.dataSources || []
        schema.actions = parsed.actions || []
        // 设置 FcDesigner rule（等待设计器就绪后 setRule）
        if (designerRef.value) {
          designerRef.value.setRule(parsed.rule || [])
          designerRef.value.setOption(parsed.option || {})
        }
      } catch {
        // 解析失败用默认
      }
    }
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    loading.value = false
  }
})

function addDataSource() {
  schema.dataSources.push({ id: `ds_${Date.now().toString(36)}`, refId: '' })
}

function updateDataSources(newDataSources: { id: string; refId: string; searchFields?: string[] }[]) {
  schema.dataSources.splice(0, schema.dataSources.length, ...newDataSources)
}

function updateActions(newActions: any[]) {
  schema.actions.splice(0, schema.actions.length, ...newActions)
}

async function handleSave() {
  if (!pageName.value) {
    ElMessage.warning('请填写页面名称')
    return
  }
  saving.value = true
  try {
    await pageApi.updatePage(pageId.value, {
      name: pageName.value,
      key: pageKey.value,
      type: 'PAGE',
      formKey: null,
      schema: JSON.stringify({
        rule: designerRef.value?.getRule() || [],
        option: designerRef.value?.getOption() || {},
        dataSources: schema.dataSources,
        actions: schema.actions,
      }),
    })
    ElMessage.success('保存成功')
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    saving.value = false
  }
}

async function handlePublish() {
  const isRepublish = formStatus.value === 'PUBLISHED'
  try {
    await ElMessageBox.confirm(
      isRepublish ? '确定要重新发布此页面吗？' : '确定要发布此页面吗？',
      isRepublish ? '确认重新发布' : '确认发布',
      { type: 'warning' },
    )
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

function handlePreview() {
  if (!pageKey.value) {
    ElMessage.warning('页面标识为空，无法预览')
    return
  }
  window.open(`/page/${pageKey.value}?preview=true`, '_blank')
}

function handleShowJson() {
  previewJson.value = JSON.stringify(
    {
      rule: designerRef.value?.getRule() || [],
      option: designerRef.value?.getOption() || {},
      dataSources: schema.dataSources,
      actions: schema.actions,
    },
    null,
    2,
  )
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

function statusTagType(status: string): '' | 'success' | 'warning' | 'info' {
  const map: Record<string, '' | 'success' | 'warning' | 'info'> = {
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
.page-designer-page {
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
.toolbar-right {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
.designer-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}
.designer-body :deep(.el-container._fc-designer) {
  flex: 1 !important;
  min-width: 0;
}
.ds-row {
  display: flex;
  gap: 4px;
  margin-bottom: 6px;
  align-items: center;
}
.action-card {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 6px;
  margin-bottom: 8px;
}
.step-row {
  margin-left: 8px;
}
.form-tip {
  font-size: 14px;
  color: #909399;
  margin-top: 4px;
}
/* 表单配置页签底部：数据源与动作配置入口 */
.form-extra-section {
  border-top: 1px dashed #e8e8e8;
  margin-top: 8px;
  padding-top: 8px;
}
.form-extra-header {
  font-size: 14px;
  color: #606266;
  font-weight: 500;
  margin-bottom: 4px;
}
/* 对齐 LookupPicker"点击配置数据源"按钮样式：全宽 + 蓝色描边 */
.ds-config-btn {
  width: 100%;
  border-color: #2E73FF;
  color: #2E73FF;
  font-weight: 400;
  margin-top: 4px;
}
.ds-config-btn:hover {
  border-color: #2E73FF;
  color: #fff;
  background-color: #2E73FF;
}
.preview-json {
  max-height: 60vh;
  overflow: auto;
  background: #f5f7fa;
  padding: 12px;
  border-radius: 4px;
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
}
</style>
