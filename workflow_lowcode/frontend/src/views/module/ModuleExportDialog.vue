<template>
  <el-dialog v-model="visible" title="导出模块" width="760px" :close-on-click-modal="false" @closed="reset">
    <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
      <el-form-item label="模块名称" prop="moduleName">
        <el-input v-model="form.moduleName" placeholder="如：请假管理模块" maxlength="60" />
      </el-form-item>
      <el-form-item label="模块说明">
        <el-input v-model="form.moduleDescription" type="textarea" :rows="2" maxlength="300" placeholder="模块用途说明（将写入描述文件）" />
      </el-form-item>
    </el-form>

    <el-tabs v-model="activeTab">
      <el-tab-pane v-for="group in groups" :key="group.type" :label="group.label" :name="group.type">
        <el-table
          :ref="(el: any) => setTableRef(group.type, el)"
          :data="group.items"
          max-height="220"
          size="small"
          row-key="key"
          @selection-change="(rows: ItemRow[]) => onSelectionChange(group, rows)"
        >
          <el-table-column type="selection" width="42" />
          <el-table-column prop="name" label="名称" min-width="140" />
          <el-table-column prop="key" label="标识" min-width="140" />
          <el-table-column v-if="group.type === 'DATA_SOURCE'" prop="typeName" label="类型" width="90" />
        </el-table>
        <el-empty v-if="!group.items.length" description="暂无可导出的已发布元素" :image-size="48" />
      </el-tab-pane>
    </el-tabs>

    <!-- 闭包预览 -->
    <template v-if="analyzeVisible">
      <el-divider content-position="left">依赖闭包预览</el-divider>
      <el-alert
        v-if="missing.length"
        type="error"
        :closable="false"
        show-icon
        title="以下依赖不存在或未发布，无法打包"
        :description="missing.join('、')"
      />
      <el-alert
        v-if="externalDeps.length"
        type="warning"
        :closable="false"
        show-icon
        title="以下为无法打包的外部依赖，导入后需手工处理"
        :description="externalDeps.join('；')"
      />
      <div class="closure-list">
        <el-tag
          v-for="node in closureNodes"
          :key="node.refKey"
          :type="node.autoAdded ? 'warning' : 'primary'"
          :effect="node.autoAdded ? 'plain' : 'light'"
          class="closure-tag"
        >
          {{ typeLabel(node.refKey) }}：{{ node.name }}{{ node.autoAdded ? '（依赖自动加入）' : '' }}
        </el-tag>
        <el-empty v-if="!closureNodes.length" description="请先勾选元素" :image-size="48" />
      </div>
    </template>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button :loading="analyzing" :disabled="!selectedRefs.length" @click="preview">分析依赖</el-button>
      <el-button
        type="primary"
        :loading="exporting"
        :disabled="!selectedRefs.length || !!missing.length"
        @click="doExport"
      >
        导出并下载
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { firstValidateMessage } from '@/views/form/validateError'
import { moduleApi, ELEMENT_TYPE_LABELS, type ModuleElementType, type AnalyzeNode } from '@/api/module'
import { formApi, type FormDefinitionDTO } from '@/api/form'
import { pageApi, type PageDefinitionDTO } from '@/api/page'
import { dataSourceApi, type DataSourceDTO } from '@/api/data-source'
import { logicFlowApi, type LogicFlowSummary } from '@/api/logicFlow'
import { processDesignApi, type ProcessDraft } from '@/api/processDefinition'

interface ItemRow {
  key: string
  name: string
  typeName?: string
}

interface Group {
  type: ModuleElementType
  label: string
  items: ItemRow[]
  checked: ItemRow[]
}

const visible = ref(false)
const loading = ref(false)
const analyzing = ref(false)
const exporting = ref(false)
const analyzeVisible = ref(false)
const formRef = ref<FormInstance>()
const form = reactive({ moduleName: '', moduleDescription: '' })
const rules: FormRules = {
  moduleName: [{ required: true, whitespace: true, message: '请输入模块名称', trigger: 'blur' }]
}
const activeTab = ref<ModuleElementType>('FORM')
const closureNodes = ref<AnalyzeNode[]>([])
const missing = ref<string[]>([])
/** 用户在预览后手动调整过勾选 → 导出尊重用户选择，不再后端闭包兜底 */
const userAdjusted = ref(false)
/** 各 tab 表格实例（自动勾选依赖用） */
const tableRefs = new Map<ModuleElementType, { toggleRowSelection: (row: ItemRow, selected?: boolean) => void }>()

const groups = reactive<Group[]>([
  { type: 'FORM', label: '业务表单', items: [], checked: [] },
  { type: 'PAGE', label: '页面', items: [], checked: [] },
  { type: 'DATA_SOURCE', label: '数据源', items: [], checked: [] },
  { type: 'LOGIC_FLOW', label: '逻辑流', items: [], checked: [] },
  { type: 'WORKFLOW', label: '工作流', items: [], checked: [] }
])

const selectedRefs = computed(() =>
  groups.flatMap((g) => g.checked.map((row) => ({ type: g.type, key: row.key })))
)

const externalDeps = computed(() => {
  const set = new Set<string>()
  for (const n of closureNodes.value) {
    for (const e of n.externalDeps) set.add(e)
  }
  return [...set]
})

function setTableRef(type: ModuleElementType, el: unknown): void {
  if (el) {
    tableRefs.set(type, el as { toggleRowSelection: (row: ItemRow, selected?: boolean) => void })
  } else {
    tableRefs.delete(type)
  }
}

/** 勾选变化：识别用户移除"被选中元素依赖的元素"并警告；标记 userAdjusted */
function onSelectionChange(group: Group, rows: ItemRow[]): void {
  if (analyzeVisible.value) {
    const before = new Set(group.checked.map((r) => r.key))
    const after = new Set(rows.map((r) => r.key))
    const removed = [...before].filter((k) => !after.has(k))
    if (removed.length) {
      // 被移除元素若被仍选中的元素依赖 → 缺口警告
      const selectedSet = new Set(
        groups.flatMap((g) => (g.type === group.type ? rows : g.checked).map((r) => `${g.type}:${r.key}`))
      )
      for (const node of closureNodes.value) {
        if (removed.some((k) => node.refKey === `${group.type}:${k}`)) continue
        for (const dep of node.dependsOn) {
          if (removed.some((k) => dep === `${group.type}:${k}`) && selectedSet.has(node.refKey)) {
            ElMessage.warning(
              `「${node.name}」依赖已移除的 ${typeLabel(dep)}，导出后目标环境将出现依赖缺口，导入预检会提示`
            )
            break
          }
        }
      }
    }
    userAdjusted.value = true
  }
  group.checked = rows
}

function typeLabel(refKey: string): string {
  const t = refKey.split(':')[0] as ModuleElementType
  return ELEMENT_TYPE_LABELS[t] ?? t
}

function open(): void {
  visible.value = true
  loadAll()
}

defineExpose({ open })

function reset(): void {
  form.moduleName = ''
  form.moduleDescription = ''
  formRef.value?.clearValidate()
  analyzeVisible.value = false
  closureNodes.value = []
  missing.value = []
  userAdjusted.value = false
  groups.forEach((g) => (g.checked = []))
}

/** 各列表端点分页结构不统一（Spring Page=content / PageResult=rows / 直接数组），统一取行 */
function rowsOf<T>(payload: unknown): T[] {
  const d = payload as { content?: T[]; records?: T[]; rows?: T[] }
  return d?.content ?? d?.records ?? d?.rows ?? (Array.isArray(payload) ? (payload as T[]) : [])
}

async function loadAll(): Promise<void> {
  loading.value = true
  try {
    const [forms, pages, ds, lfs, drafts] = await Promise.all([
      formApi.getFormDefinitions({ page: 1, size: 500, type: 'BUSINESS', status: 'PUBLISHED' }),
      pageApi.getPages({ page: 1, size: 500, status: 'PUBLISHED' }),
      dataSourceApi.getDataSources({ page: 1, size: 500 }),
      logicFlowApi.list({ page: 1, size: 500 }),
      processDesignApi.listDrafts({ page: 1, size: 500 } as never)
    ])
    groups[0].items = rowsOf<FormDefinitionDTO & { key?: string; name?: string }>(forms.data)
      .map((f) => ({ key: String(f.key ?? ''), name: String(f.name ?? '') }))
    groups[1].items = rowsOf<PageDefinitionDTO & { key?: string; name?: string }>(pages.data)
      .map((p) => ({ key: String(p.key ?? ''), name: String(p.name ?? '') }))
    groups[2].items = rowsOf<DataSourceDTO>(ds.data)
      .filter((d) => d.type === 'FORM' || d.type === 'WORKFLOW')
      .map((d) => ({
        key: String(d.formKey ?? d.id),
        name: String(d.name ?? ''),
        typeName: d.type
      }))
    groups[3].items = rowsOf<LogicFlowSummary>(lfs.data)
      .filter((l) => l.status === 'PUBLISHED')
      .map((l) => ({ key: String(l.flowKey ?? ''), name: String(l.name ?? '') }))
    groups[4].items = rowsOf<ProcessDraft>(drafts.data)
      .map((d) => ({ key: String(d.key ?? ''), name: String(d.name ?? '') }))
  } finally {
    loading.value = false
  }
}

async function preview(): Promise<void> {
  analyzing.value = true
  try {
    const res = await moduleApi.analyze(selectedRefs.value)
    if (res.code !== 0 && res.code !== 200) {
      ElMessage.error(res.msg || '依赖分析失败')
      return
    }
    closureNodes.value = res.data?.nodes ?? []
    missing.value = res.data?.missing ?? []
    // 自动勾选闭包补选的依赖项（UI 勾选态与实际导出内容保持一致；用户可再取消）
    autoCheckClosure()
    userAdjusted.value = false
    analyzeVisible.value = true
  } finally {
    analyzing.value = false
  }
}

/** 把闭包自动补选的依赖（autoAdded）回写为各 tab 表格的勾选状态 */
function autoCheckClosure(): void {
  for (const node of closureNodes.value) {
    if (!node.autoAdded) continue
    const [type, ...rest] = node.refKey.split(':')
    const key = rest.join(':')
    const table = tableRefs.get(type as ModuleElementType)
    const row = groups.find((g) => g.type === type)?.items.find((i) => i.key === key)
    if (table && row) {
      table.toggleRowSelection(row, true)
    }
  }
}

async function doExport(): Promise<void> {
  const valid = await formRef.value?.validate().catch((error: unknown) => {
    ElMessage.warning(firstValidateMessage(error) || '请检查必填项')
    return false
  })
  if (!valid) return
  const name = form.moduleName.trim()
  exporting.value = true
  try {
    const blob = await moduleApi.exportModule(
      name,
      form.moduleDescription,
      selectedRefs.value,
      !userAdjusted.value
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `module-${name}.zip`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('模块导出成功')
    visible.value = false
  } finally {
    exporting.value = false
  }
}
</script>

<style scoped>
.closure-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 140px;
  overflow: auto;
  padding: 4px 0;
}
.closure-tag {
  max-width: 100%;
}
</style>
