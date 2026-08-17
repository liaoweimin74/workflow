<template>
  <div class="biz-data-page">
    <div class="page-header">
      <el-button :icon="ArrowLeft" @click="router.back()">返回</el-button>
      <span class="page-title">{{ formName || '业务数据' }}</span>
      <span class="page-subtitle">数据表：wf_biz_{{ formKey }}</span>
      <el-tag
        v-if="refInfo && refInfo.count > 0"
        type="warning"
        size="small"
        style="margin-left: 8px"
      >被 {{ refInfo.count }} 个表单引用</el-tag>
    </div>

    <SearchTable
      v-if="loaded"
      ref="tableRef"
      :search-fields="searchFields"
      :columns="columns"
      :fetch-api="fetchApi"
      :form-config="formConfig"
      :default-page-size="20"
      :page-sizes="[10, 20, 50]"
      :delete-confirm="deleteConfirm"
    >
      <!-- 子表字段列：显示 [子表名称] 链接，点击弹窗查看子表行 -->
      <template
        v-for="c in subtableCols"
        :key="c.key"
        #[`subtable-${c.key}`]="{ row }"
      >
        <el-link type="primary" @click="openSubtable(row, c)">
          [{{ c.label }}]
        </el-link>
      </template>
    </SearchTable>
    <el-card v-else v-loading="!loaded" style="min-height: 200px" />

    <!-- 子表内容弹窗：复用表单渲染机制（form-create），子表内 lookupPicker/dataPicker 等组件正常渲染 -->
    <el-dialog
      v-model="subtableDialogVisible"
      :title="subtableDialogTitle"
      width="720px"
      :close-on-click-modal="false"
    >
      <FormRenderer
        v-if="subtableRule"
        :key="subtableRule.field"
        :rule="[subtableRule]"
        :initial-values="subtableInitialValues"
        readonly
      />
      <el-empty v-else-if="subtableRows.length > 0" description="子表 schema 未加载，无法渲染" />
      <el-empty v-else description="暂无子表数据" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, h, type VNode } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import { SearchTable } from '@/components/business'
import type { SearchField, TableColumn, FormConfig } from '@/components/business/types'
import { formApi } from '@/api/form'
import { bizDataApi, type ColumnConfigItem } from '@/api/bizData'
import FormRenderer from './components/FormRenderer.vue'
import { walkRules, type RuleLike } from './formRuleWalk'
import { parseSubRows } from './subtableDisplay'
import type { Rule } from '@form-create/element-ui'

const route = useRoute()
const router = useRouter()
const tableRef = ref<InstanceType<typeof SearchTable>>()

const formKey = computed(() => route.params.formKey as string)
const formName = ref('')
const columnConfig = ref<ColumnConfigItem[]>([])
const schemaRules = ref<Rule[]>([])
const schemaOption = ref<Record<string, any>>({})
const loaded = ref(false)

/** 引用感知：本表单被 dataPicker 引用统计（{ count, referencedBy }） */
const refInfo = ref<{ count: number; referencedBy: string[] } | null>(null)

/** 业务列（可展示，排除隐藏列） */
const bizColumns = computed(() => columnConfig.value.filter(c => !c.unsupported && !c.hidden))

/** 子表字段列（subColumns 非空）：列表中以 [子表名称] 链接展示，点击弹窗查看子表行 */
const subtableCols = computed(() => bizColumns.value.filter(c => c.subColumns && c.subColumns.length > 0))

/** 可筛选列（非 JSON/TEXT、非 colorPicker，且 indexed 或短文本） */
const filterableColumns = computed(() =>
  bizColumns.value.filter(
    c => c.columnType !== 'JSON' && c.columnType !== 'TEXT'
      && c.componentType !== 'colorPicker'
      && (c.indexed || (c.length != null && c.length <= 64) || c.columnType === 'VARCHAR'),
  ),
)

/** 搜索栏（由 column_config 动态生成） */
const searchFields = computed<SearchField[]>(() =>
  filterableColumns.value.map(c => ({
    type: 'input',
    label: c.label,
    prop: c.key,
    placeholder: c.label,
    style: 'width: 180px',
  })),
)

/** 表格列（render 读 row.data[key]；data-picker 引用列优先显示冗余文本；子表字段用 slotName 渲染链接） */
const columns = computed<TableColumn[]>(() => {
  const bizCols = bizColumns.value.map((c): TableColumn => {
    // 子表字段：不显示存储 JSON 文本，使用 [子表名称] 链接（slotName 渲染）
    if (c.subColumns && c.subColumns.length > 0) {
      return {
        prop: c.key,
        label: c.label,
        minWidth: 130,
        slotName: `subtable-${c.key}`,
      }
    }
    return {
      prop: c.key,
      label: c.label,
      minWidth: c.columnType === 'TEXT' || c.columnType === 'JSON' ? 200 : 130,
      render: (row: any): VNode | string => {
        const v = row.data?.[c.key]
        // data-picker：显示冗余文本列（<key>_text，JSON 文本数组），缺省回退原值
        if (c.pickerConfig && v) {
          const text = row.data[c.key + '_text']
          if (text !== undefined && text !== null && text !== '') {
            try {
              const parsed = JSON.parse(String(text))
              if (Array.isArray(parsed)) return parsed.join(',')
            } catch {
              // 非 JSON 旧数据，按原值展示
            }
            return String(text)
          }
        }
        return renderByComponentType(c.componentType || undefined, c.columnType, v)
      },
    }
  })
  return [
    ...bizCols,
    {
      prop: 'updatedAt',
      label: '更新时间',
      width: 160,
      align: 'center',
      formatter: (row: any) => formatDate(row.updatedAt),
    },
  ]
})

/** 按组件类型定制单元格渲染（无 componentType 时按列类型兜底） */
function renderByComponentType(componentType: string | undefined, _columnType: string, v: unknown): VNode | string {
  if (v === null || v === undefined) return '—'
  switch (componentType) {
    case 'colorPicker': {
      const hex = String(v)
      return h('div', {
        style: 'display:inline-flex;align-items:center;gap:6px;',
      }, [
        h('span', {
          style: `display:inline-block;width:14px;height:14px;border-radius:3px;border:1px solid #dcdfe6;background:${hex};vertical-align:middle;`,
        }),
        hex,
      ])
    }
    case 'checkbox':
    case 'multiSelect':
    case 'multiSelectPro':
      return formatArray(v)
    case 'slider':
      return Array.isArray(v) ? v.join(' ~ ') : formatCell(v)
    default:
      return formatCell(v)
  }
}

/** JSON 数组 → 逗号拼接；非数组（旧逗号串/字符串）原样 */
function formatArray(v: unknown): string {
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v)
      if (Array.isArray(parsed)) return parsed.join(', ')
    } catch {
      // 旧逗号串或普通字符串，原样
    }
    return v
  }
  return formatCell(v)
}

/** 子表内容弹窗状态 */
const subtableDialogVisible = ref(false)
const subtableDialogTitle = ref('')
const subtableRows = ref<any[]>([])
const subtableRule = ref<Rule | null>(null)
/** 弹窗渲染的子表字段初始值：{ [字段]: 子表行数组 } */
const subtableInitialValues = computed<Record<string, any>>(() => {
  const field = subtableRule.value?.field
  return field ? { [field]: subtableRows.value } : {}
})

/** 从 schema 中查找子表字段的 rule（group/tableForm/subForm），穿透布局容器 */
function findSubtableRule(field: string): Rule | null {
  let found: Rule | null = null
  walkRules(schemaRules.value as RuleLike[], (r) => {
    if (!found && r.field === field && ['group', 'tableForm', 'subForm'].includes(r.type || '')) {
      found = r as Rule
    }
  })
  return found
}

/** 点击 [子表名称] 链接：解析子表行数据，用 form-create 渲染子表字段 rule */
function openSubtable(row: any, col: ColumnConfigItem) {
  const rows = parseSubRows(row.data?.[col.key])
  subtableRows.value = rows
  subtableRule.value = findSubtableRule(col.key)
  subtableDialogTitle.value = `${col.label}（${rows.length} 条）`
  subtableDialogVisible.value = true
}

/**
 * fetchApi 适配层：SearchTable 平铺查询参数 → biz-data 的 filter JSON
 */
async function fetchApi(params: any) {
  const filter: Record<string, unknown> = {}
  for (const col of filterableColumns.value) {
    const v = params[col.key]
    if (v !== undefined && v !== null && v !== '') {
      filter[col.key] = v
    }
  }
  const res = await bizDataApi.list(formKey.value, {
    page: (params.page || 1) - 1,
    size: params.size || 20,
    filter,
  })
  return { rows: res.data.records || [], total: res.data.total || 0 }
}

/**
 * formConfig：新增/编辑弹窗直接复用表单 schema（form-create rule），
 * 行对象通过 updateApi 第三参获取（version 用于乐观锁）。
 * 泛型用 Record<string, any>：弹窗初始值/表单数据是业务字段平铺对象。
 */
const formConfig = computed<FormConfig<Record<string, any>>>(() => ({
  rule: schemaRules.value,
  option: schemaOption.value,
  dialogWidth: '640px',
  dialogTitle: { create: '新增数据', edit: '编辑数据' },
  createPermission: 'form:edit',
  editPermission: 'form:edit',
  deletePermission: 'form:list',
  getApi: async (id) => {
    const res = await bizDataApi.detail(formKey.value, String(id))
    return res.data.data
  },
  createApi: (data) => bizDataApi.create(formKey.value, data),
  updateApi: (id, data, row) => bizDataApi.update(formKey.value, String(id), data, row?.version ?? 1),
  deleteApi: (id) => bizDataApi.remove(formKey.value, String(id)),
}))

/** 删除确认文案：本表单被引用时提示影响范围（悬空降级后显示原始 id/标红） */
function deleteConfirm(): string {
  if (refInfo.value && refInfo.value.count > 0) {
    return `本表单被 ${refInfo.value.count} 个表单引用，删除记录可能导致相关表单引用悬空。确定删除吗？`
  }
  return '确定删除该记录吗？'
}

onMounted(async () => {
  await loadFormMeta()
  try {
    const res = await bizDataApi.referencedCount()
    refInfo.value = res.data?.[formKey.value] || null
  } catch {
    // 统计失败不阻断
  }
  // 跳转查看（DataPicker viewLink）：?detail=<id> 自动打开记录详情
  const detailId = route.query.detail as string | undefined
  if (detailId) {
    await nextTick()
    tableRef.value?.openEdit?.({ id: detailId })
  }
})

/** 加载表单定义（name / columnConfig / schema） */
async function loadFormMeta() {
  try {
    const res = await formApi.getFormDefinitionByKey(formKey.value)
    const def = res.data
    formName.value = def.name
    if (def.columnConfig) {
      columnConfig.value = JSON.parse(def.columnConfig)
    }
    if (def.schema && def.schema !== '[]') {
      const parsed = JSON.parse(def.schema)
      schemaRules.value = Array.isArray(parsed) ? parsed : (parsed.rule || [])
      schemaOption.value = !Array.isArray(parsed) && parsed.option ? parsed.option : {}
    }
    loaded.value = true
  } catch {
    ElMessage.error('业务表单不存在或未发布')
  }
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<style scoped>
.biz-data-page {
  padding: 16px;
  height: calc(100vh - 60px);
  display: flex;
  flex-direction: column;
}
.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-shrink: 0;
}
.page-title {
  font-size: 16px;
  font-weight: bold;
}
.page-subtitle {
  font-size: 12px;
  color: #909399;
}
</style>
