<template>
  <div class="biz-data-page">
    <div class="page-header">
      <el-button :icon="ArrowLeft" @click="router.back()">返回</el-button>
      <span class="page-title">{{ formName || '业务数据' }}</span>
      <span class="page-subtitle">数据表：wf_biz_{{ formKey }}</span>
      <div class="header-right">
        <el-button type="primary" :icon="Plus" :disabled="!loaded" @click="openCreate">
          新增
        </el-button>
      </div>
    </div>

    <el-card v-loading="loading">
      <!-- 筛选区 -->
      <div v-if="filterableColumns.length > 0" class="filter-bar">
        <el-input
          v-for="col in filterableColumns"
          :key="'f_' + col.key"
          :model-value="filters[col.key]"
          :placeholder="col.label"
          clearable
          style="width: 180px"
          @update:model-value="(v: any) => onFilterChange(col.key, v)"
          @clear="applyQuery"
          @keyup.enter="applyQuery"
        />
        <el-button type="primary" size="small" @click="applyQuery">查询</el-button>
        <el-button size="small" @click="resetQuery">重置</el-button>
      </div>

      <!-- 数据表格 -->
      <el-table :data="rows" border stripe size="small" v-loading="loading" style="width: 100%">
        <el-table-column type="index" label="#" width="50" align="center" />
        <el-table-column
          v-for="col in columns"
          :key="col.key"
          :label="col.label"
          :min-width="col.columnType === 'TEXT' || col.columnType === 'JSON' ? 200 : 130"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            {{ formatCell(row.data[col.key]) }}
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="160" align="center">
          <template #default="{ row }">{{ formatDate(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140" align="center" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无数据" :image-size="60" />
        </template>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-bar">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="size"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="loadData"
          @size-change="onSizeChange"
        />
      </div>
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="editDialogVisible"
      :title="editingRow ? '编辑数据' : '新增数据'"
      width="640px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <FormRenderer
        v-if="schemaRules.length > 0"
        ref="rendererRef"
        :rule="schemaRules"
        :initial-values="editingRow?.data"
      />
      <el-alert v-else type="warning" :closable="false" title="表单 schema 为空，无法编辑" />
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Plus } from '@element-plus/icons-vue'
import { formApi } from '@/api/form'
import { bizDataApi, type ColumnConfigItem, type BizDataVO } from '@/api/bizData'
import FormRenderer from '@/views/form/components/FormRenderer.vue'
import type { Rule } from '@form-create/element-ui'

const route = useRoute()
const router = useRouter()

const formKey = computed(() => route.params.formKey as string)
const formName = ref('')
const columnConfig = ref<ColumnConfigItem[]>([])
const schemaRules = ref<Rule[]>([])
const loaded = ref(false)
const loading = ref(false)
const saving = ref(false)

const rows = ref<BizDataVO[]>([])
const total = ref(0)
const page = ref(1)
const size = ref(20)
const filters = ref<Record<string, string>>({})

const editDialogVisible = ref(false)
const editingRow = ref<BizDataVO | null>(null)
const rendererRef = ref<InstanceType<typeof FormRenderer>>()

/** 表格列（业务列） */
const columns = computed(() => columnConfig.value.filter(c => !c.unsupported))

/** 可筛选列（非 JSON/TEXT，且 indexed 或短文本） */
const filterableColumns = computed(() =>
  columnConfig.value.filter(
    c =>
      !c.unsupported &&
      c.columnType !== 'JSON' &&
      c.columnType !== 'TEXT' &&
      (c.indexed || (c.length != null && c.length <= 64) || c.columnType === 'VARCHAR'),
  ),
)

onMounted(async () => {
  await loadFormMeta()
  if (loaded.value) {
    await loadData()
  }
})

/** 加载表单定义（name / columnConfig / schema） */
async function loadFormMeta() {
  loading.value = true
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
    }
    loaded.value = true
  } catch {
    ElMessage.error('业务表单不存在或未发布')
  } finally {
    loading.value = false
  }
}

async function loadData() {
  if (!loaded.value) return
  loading.value = true
  try {
    const filter: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(filters.value)) {
      if (v) filter[k] = v
    }
    const res = await bizDataApi.list(formKey.value, {
      page: page.value - 1,
      size: size.value,
      filter,
    })
    rows.value = res.data.records || []
    total.value = res.data.total || 0
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    loading.value = false
  }
}

function onFilterChange(key: string, v: any) {
  filters.value[key] = v || ''
}

function applyQuery() {
  page.value = 1
  loadData()
}

function resetQuery() {
  filters.value = {}
  page.value = 1
  loadData()
}

function onSizeChange() {
  page.value = 1
  loadData()
}

function openCreate() {
  editingRow.value = null
  editDialogVisible.value = true
}

function openEdit(row: BizDataVO) {
  editingRow.value = row
  editDialogVisible.value = true
}

async function handleSave() {
  const renderer = rendererRef.value
  if (!renderer) return
  const data = renderer.getFormData() as Record<string, unknown>
  saving.value = true
  try {
    if (editingRow.value) {
      await bizDataApi.update(formKey.value, editingRow.value.id, data, editingRow.value.version)
      ElMessage.success('更新成功')
    } else {
      await bizDataApi.create(formKey.value, data)
      ElMessage.success('新增成功')
    }
    editDialogVisible.value = false
    await loadData()
  } catch (e: any) {
    if (e?.response?.status === 409) {
      ElMessage.warning('数据已被他人修改，请关闭后重新打开编辑')
    }
    // 其他错误 http 拦截器已提示
  } finally {
    saving.value = false
  }
}

async function handleDelete(row: BizDataVO) {
  try {
    await ElMessageBox.confirm('确定要删除这条数据吗？删除后不可恢复。', '确认删除', { type: 'warning' })
  } catch {
    return
  }
  try {
    await bizDataApi.remove(formKey.value, row.id)
    ElMessage.success('删除成功')
    await loadData()
  } catch {
    // http 拦截器已弹出错误消息
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
}
.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.page-title {
  font-size: 16px;
  font-weight: bold;
}
.page-subtitle {
  font-size: 12px;
  color: #909399;
}
.header-right {
  margin-left: auto;
}
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
  align-items: center;
}
.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
</style>
