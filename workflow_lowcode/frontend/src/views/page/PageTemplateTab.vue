<template>
  <div class="page-template-tab">
    <SearchTable
      ref="tableRef"
      :search-fields="searchFields"
      :columns="columns"
      :action-buttons="actionButtons"
      :fetch-api="fetchApi"
      :show-create-button="false"
      :max-visible-buttons="4"
      show-selection
      @selection-change="handleSelectionChange"
    >
      <template #toolbar-right>
        <el-button v-if="canPageManage" type="primary" @click="openCreateDialog">用模板新建页面</el-button>
        <el-button @click="handleExportSelected">批量导出</el-button>
        <el-button @click="fileInput?.click()">导入模板</el-button>
        <input ref="fileInput" type="file" accept="application/json,.json" style="display: none" @change="handleFilePicked" />
      </template>
      <template #updatedAt="{ row }">
        {{ formatDate(row.updatedAt) }}
      </template>
      <template #dsStatus="{ row }">
        <el-tag v-if="row.kind === 'skeleton'" type="warning" size="small">
          骨架 · {{ row.dsBound ?? 0 }}/{{ row.dsCount ?? 0 }} 已绑
        </el-tag>
        <el-tag v-else-if="(row.dsCount ?? 0) === 0" type="info" size="small">无数据源</el-tag>
        <el-tag v-else-if="(row.dsBound ?? 0) >= (row.dsCount ?? 0)" type="success" size="small">已绑定</el-tag>
        <el-tag v-else type="warning" size="small">{{ row.dsBound ?? 0 }}/{{ row.dsCount ?? 0 }} 已绑</el-tag>
      </template>
    </SearchTable>

    <!-- 用模板新建页面 -->
    <el-dialog v-model="createVisible" title="用模板新建页面" width="460px">
      <el-form label-width="90px" @submit.prevent>
        <el-form-item label="选择模板">
          <el-select v-model="createForm.templateId" placeholder="请选择模板" style="width: 100%">
            <el-option v-for="t in templateOptions" :key="t.id" :label="`${t.name}（${t.key}）`" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="页面名称">
          <el-input v-model="createForm.name" placeholder="默认沿用模板名称" />
        </el-form-item>
        <el-form-item label="页面标识">
          <el-input v-model="createForm.key" placeholder="小写字母开头，可含数字/下划线" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="confirmCreate">创建并进入设计器</el-button>
      </template>
    </el-dialog>

    <!-- 导入绑定确认（bundle 逐模板 × 逐数据源条目）；允许暂不绑定，实例化时再指定 -->
    <el-dialog v-model="importVisible" title="导入模板 · 数据源绑定确认" width="640px">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="同名数据源自动匹配；未命中的可手动选择，也可暂不绑定（实例化创建页面时再指定）。"
        style="margin-bottom: 12px"
      />
      <div v-for="(item, ti) in importItems" :key="ti" class="import-card">
        <div class="import-card-title">
          {{ item.name }}（{{ item.key }}）
          <el-tag v-if="item.kind === 'skeleton'" type="warning" size="small">骨架模板</el-tag>
        </div>
        <div v-if="item.entries.length === 0" class="import-empty">该模板无数据源绑定，可直接导入</div>
        <div v-for="(entry, ei) in item.entries" :key="entry.dsId" class="import-entry">
          <span class="import-entry-label">{{ entry.dsLabel || `数据源 ${ei + 1}` }}（筛选字段 {{ entry.searchFieldsCount }} 个）</span>
          <el-select
            v-model="entry.newRefId"
            :placeholder="entry.matched ? '沿用同名数据源' : '选择目标数据源或暂不绑定'"
            filterable
            clearable
            style="width: 300px"
          >
            <el-option
              v-for="ds in enabledDataSources"
              :key="ds.id"
              :label="`${ds.name}（${ds.type}）`"
              :value="ds.id"
            />
          </el-select>
          <el-tag v-if="entry.matched" type="success" size="small">同名自动匹配</el-tag>
          <el-tag v-else-if="entry.newRefId" type="info" size="small">手动选择</el-tag>
          <el-tag v-else type="warning" size="small">暂不绑定</el-tag>
        </div>
      </div>
      <template #footer>
        <el-button @click="importVisible = false">取消</el-button>
        <el-button type="primary" :loading="importing" @click="confirmImport">导入 {{ importItems.length }} 个模板</el-button>
      </template>
    </el-dialog>

    <!-- 实例化绑槽位：存在未绑定/失效数据源的模板，创建页面前必须逐槽位指定 -->
    <el-dialog v-model="bindVisible" title="实例化 · 数据源绑定" width="560px">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="模板中的以下数据源槽位未绑定（或在当前环境已失效），请为每个槽位指定目标数据源。"
        style="margin-bottom: 12px"
      />
      <div v-for="slot in bindSlots" :key="slot.dsId" class="import-entry">
        <span class="import-entry-label">{{ slot.dsLabel }}</span>
        <el-select v-model="slot.newRefId" placeholder="请选择目标数据源" filterable style="width: 300px">
          <el-option
            v-for="ds in enabledDataSources"
            :key="ds.id"
            :label="`${ds.name}（${ds.type}）`"
            :value="ds.id"
          />
        </el-select>
        <el-tag v-if="slot.newRefId" type="info" size="small">已选择</el-tag>
        <el-tag v-else type="danger" size="small">待绑定</el-tag>
      </div>
      <template #footer>
        <el-button @click="bindVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="confirmBind">绑定并创建页面</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * 页面模板管理 Tab（页面管理页内）。
 * 列表/删除/重命名 + 统一导出（单导出/批量 bundle）+ 导入（refId 同名自动匹配、未命中手选）
 * + 用模板新建页面（实例化：ID 重映射，report 提示不阻断）。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Download, EditPen } from '@element-plus/icons-vue'
import { SearchTable } from '@/components/business'
import type { SearchField, TableColumn, ActionButton } from '@/components/business/types'
import {
  pageTemplateApi,
  type PageTemplateDTO,
  type PageTemplateBundle,
} from '@/api/page-template'
import { pageApi } from '@/api/page'
import { dataSourceApi, type DataSourceDTO } from '@/api/data-source'
import { useAuthStore } from '@/stores/auth'
import { buildTemplateInstance, applyTemplateRebinds, type TemplateRebind } from './templateInstance'
import type { PageSchema } from './templateSchema'

const router = useRouter()
const authStore = useAuthStore()
const tableRef = ref<InstanceType<typeof SearchTable>>()
const fileInput = ref<HTMLInputElement>()

const canPageManage = computed(() => authStore.hasPermission('page:create'))

const selection = ref<PageTemplateDTO[]>([])
const templateOptions = ref<PageTemplateDTO[]>([])
const enabledDataSources = ref<DataSourceDTO[]>([])

const columns: TableColumn[] = [
  { prop: 'name', label: '模板名称', minWidth: 180 },
  { prop: 'key', label: '模板标识', width: 200 },
  { prop: 'dsStatus', label: '数据源', width: 130, align: 'center', slotName: 'dsStatus' },
  { prop: 'schemaVersion', label: '文件版本', width: 90, align: 'center' },
  { prop: 'createdBy', label: '创建人', width: 120 },
  { prop: 'updatedAt', label: '最近更新时间', width: 170, slotName: 'updatedAt' },
]

const searchFields: SearchField[] = [
  { type: 'input', label: '模板名称', prop: 'name', placeholder: '搜索模板名称', style: 'width: 200px' },
]

async function fetchApi(params: any) {
  const res = await pageTemplateApi.listTemplates({
    page: params.page || 1,
    size: params.size || 20,
    name: params.name || undefined,
  })
  const data = res.data as any
  templateOptions.value = (data.content || data.rows || []).slice()
  return {
    rows: data.content || data.rows || [],
    total: data.totalElements || data.total || 0,
  }
}

function handleSelectionChange(rows: any[]) {
  selection.value = rows as PageTemplateDTO[]
}

const actionButtons: ActionButton[] = [
  {
    label: '新建页面',
    icon: EditPen,
    permission: 'page:create',
    onClick: (row: any) => {
      createForm.templateId = row.id
      createForm.name = row.name
      createForm.key = ''
      createVisible.value = true
    },
  },
  {
    label: '导出',
    icon: Download,
    onClick: (row: any) => downloadBundle([row.id]),
  },
  {
    label: '重命名',
    permission: 'page:edit',
    onClick: async (row: any) => {
      let name: string
      try {
        const r = await ElMessageBox.prompt('模板名称', '重命名', { inputValue: row.name, inputValidator: (v: string) => !!v.trim() || '名称不能为空' })
        name = String(r.value).trim()
      } catch {
        return
      }
      await pageTemplateApi.updateTemplate(row.id, { name })
      ElMessage.success('已重命名')
      tableRef.value?.fetchList()
    },
  },
  {
    label: '删除',
    icon: Delete,
    type: 'danger',
    permission: 'page:delete',
    onClick: async (row: any) => {
      try {
        await ElMessageBox.confirm(`确定删除模板「${row.name}」吗？`, '删除确认', { type: 'warning' })
      } catch {
        return
      }
      await pageTemplateApi.deleteTemplate(row.id)
      ElMessage.success('删除成功')
      tableRef.value?.fetchList()
    },
  },
]

// ==================== 导出 ====================

async function downloadBundle(ids: string[]) {
  try {
    const res = await pageTemplateApi.exportBundle(ids.length ? ids : undefined)
    const bundle = res.data as PageTemplateBundle
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `page-templates-${Date.now().toString(36)}.json`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success(`已导出 ${bundle.templates.length} 个模板`)
  } catch {
    // http 拦截器已弹出错误消息
  }
}

function handleExportSelected() {
  if (!selection.value.length) {
    ElMessage.warning('请先勾选要导出的模板')
    return
  }
  void downloadBundle(selection.value.map((t) => t.id))
}

// ==================== 导入（绑定确认） ====================

interface ImportEntry {
  dsId: string
  dsLabel: string
  oldRefId: string
  searchFieldsCount: number
  newRefId: string
  matched: boolean
}

interface ImportItem {
  key: string
  name: string
  kind: string | undefined
  schema: PageSchema
  entries: ImportEntry[]
}

const importVisible = ref(false)
const importing = ref(false)
const importItems = ref<ImportItem[]>([])

function availableRefIds(): Set<string> {
  return new Set(enabledDataSources.value.map((d) => d.id))
}

async function handleFilePicked(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    ElMessage.error('文件不是合法 JSON')
    return
  }
  const bundle = parsed as Partial<PageTemplateBundle>
  if (bundle?.kind !== 'page-template-bundle') {
    ElMessage.error('不是页面模板文件（kind 应为 page-template-bundle）')
    return
  }
  if (bundle.schemaVersion !== 1) {
    ElMessage.error(`不支持的模板文件版本: ${bundle.schemaVersion}`)
    return
  }
  if (!Array.isArray(bundle.templates) || bundle.templates.length === 0) {
    ElMessage.error('模板文件不含任何模板')
    return
  }
  const avail = availableRefIds()
  importItems.value = bundle.templates.map((t) => {
    const schema = t.schema as unknown as PageSchema
    return {
      key: t.key,
      name: t.name,
      kind: t.kind,
      schema,
      entries: (schema.dataSources || []).map((ds) => ({
        dsId: ds.id,
        dsLabel: ds.label || ds.id,
        oldRefId: ds.refId,
        searchFieldsCount: ds.searchFields?.length ?? 0,
        newRefId: ds.refId && avail.has(ds.refId) ? ds.refId : '',
        matched: !!ds.refId && avail.has(ds.refId),
      })),
    }
  })
  importVisible.value = true
}

async function confirmImport() {
  const avail = availableRefIds()
  const bundle: PageTemplateBundle = {
    kind: 'page-template-bundle',
    schemaVersion: 1,
    templates: importItems.value.map((item) => {
      const rebinds: Record<string, TemplateRebind> = {}
      for (const entry of item.entries) {
        // 已选择且与原 refId 不同 → 改绑（筛选字段白名单清空）；未选择 → 暂不绑定，原样入库
        if (entry.newRefId && entry.newRefId !== entry.oldRefId) {
          rebinds[entry.dsId] = { refId: entry.newRefId }
        }
      }
      const rebound = applyTemplateRebinds(item.schema, rebinds, avail)
      return {
        key: item.key,
        name: item.name,
        kind: item.kind,
        schema: rebound.schema as unknown as Record<string, unknown>,
      }
    }),
  }
  importing.value = true
  try {
    const res = await pageTemplateApi.importBundle(bundle)
    ElMessage.success(`导入完成：新建 ${res.data.created} 个，覆盖 ${res.data.updated} 个`)
    importVisible.value = false
    tableRef.value?.fetchList()
  } catch {
    // http 拦截器已弹出错误消息（含后端 refId 校验拒绝）
  } finally {
    importing.value = false
  }
}

// ==================== 用模板新建页面（实例化） ====================

const createVisible = ref(false)
const creating = ref(false)
const createForm = reactive({ templateId: '', name: '', key: '' })

async function openCreateDialog() {
  if (!templateOptions.value.length) {
    await tableRef.value?.fetchList()
  }
  if (!templateOptions.value.length) {
    ElMessage.warning('暂无模板，请先导入或从页面另存')
    return
  }
  createForm.templateId = templateOptions.value[0].id
  createForm.name = templateOptions.value[0].name
  createForm.key = ''
  createVisible.value = true
}

async function confirmCreate() {
  if (!createForm.key.trim() || !/^[a-z][a-z0-9_]*$/.test(createForm.key.trim())) {
    ElMessage.warning('页面标识必填：小写字母开头，可含数字/下划线')
    return
  }
  creating.value = true
  try {
    const detail = await pageTemplateApi.getTemplate(createForm.templateId)
    const parsed = JSON.parse(detail.data.schema || '{}') as PageSchema
    const avail = availableRefIds()
    // 实例化收紧：refId 为空（骨架槽位）或当前环境不存在的条目 → 必须先绑槽位
    const pending = (parsed.dataSources || [])
      .filter((ds) => !ds.refId || !avail.has(ds.refId))
      .map((ds) => ({
        dsId: ds.id,
        dsLabel: ds.label || (ds.refId ? `${ds.id}（原绑定 ${ds.refId}，已失效）` : ds.id),
        oldRefId: ds.refId,
        newRefId: '',
      }))
    if (pending.length) {
      pendingSchema = parsed
      pendingName = createForm.name.trim() || detail.data.name
      bindSlots.value = pending
      createVisible.value = false
      bindVisible.value = true
      return
    }
    await performCreate(parsed, {})
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    creating.value = false
  }
}

/** 绑槽位弹窗共享的待实例化数据（bindVisible 打开期间有效） */
let pendingSchema: PageSchema | null = null
let pendingName = ''

interface BindSlot {
  dsId: string
  dsLabel: string
  oldRefId: string
  newRefId: string
}

const bindVisible = ref(false)
const bindSlots = ref<BindSlot[]>([])

async function confirmBind() {
  for (const slot of bindSlots.value) {
    if (!slot.newRefId) {
      ElMessage.warning(`槽位「${slot.dsLabel}」尚未绑定数据源`)
      return
    }
  }
  const rebinds: Record<string, TemplateRebind> = {}
  for (const slot of bindSlots.value) {
    rebinds[slot.dsId] = { refId: slot.newRefId } // 改绑 → 筛选字段白名单清空，实例化后重配
  }
  const parsed = pendingSchema
  pendingSchema = null
  bindVisible.value = false
  creating.value = true
  try {
    await performCreate(parsed!, rebinds)
  } finally {
    creating.value = false
  }
}

async function performCreate(parsed: PageSchema, rebinds: Record<string, TemplateRebind>) {
  try {
    const instance = buildTemplateInstance(parsed, rebinds)
    const errors = instance.report.filter((r) => r.level === 'error')
    if (errors.length) {
      try {
        await ElMessageBox.confirm(
          `模板存在 ${errors.length} 个引用问题：\n${errors.map((r) => r.message).join('\n')}\n仍要创建吗？`,
          '实例化报告',
          { type: 'warning' },
        )
      } catch {
        return
      }
    }
    const created = await pageApi.createPage({
      name: createForm.name.trim() || pendingName,
      key: createForm.key.trim(),
      type: 'PAGE',
      schema: JSON.stringify(instance.schema),
    })
    if (instance.warnings.length) {
      ElMessage.warning(instance.warnings.join('；'))
    }
    router.push({ path: '/page/designer', query: { id: created.data.id } })
  } catch {
    // http 拦截器已弹出错误消息
  }
}

// ==================== 工具 ====================

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

onMounted(async () => {
  try {
    const res = await dataSourceApi.getEnabledDataSources()
    enabledDataSources.value = (res.data || []).filter((d) => d.type === 'FORM' || d.type === 'API' || d.type === 'SYSTEM')
  } catch {
    enabledDataSources.value = []
  }
})
</script>

<style scoped>
.page-template-tab {
  height: 100%;
}
.import-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 10px;
}
.import-card-title {
  font-weight: 600;
  margin-bottom: 8px;
}
.import-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.import-entry-label {
  width: 200px;
  color: #606266;
  font-size: 13px;
}
.import-entry-missing :deep(.el-select__wrapper) {
  box-shadow: 0 0 0 1px var(--el-color-danger) inset;
}
.import-empty {
  color: #909399;
  font-size: 13px;
}
</style>
