<template>
  <div class="query-columns-config">
    <div class="config-header">
      <span class="config-title">字段配置（显示 & 查询）</span>
      <span class="config-hint">已选查询 {{ searchFields.length }} 项 · 显示 {{ columns.length }} 项</span>
    </div>
    <el-table :data="candidates" border max-height="460">
      <el-table-column prop="key" label="字段" width="130" />
      <el-table-column prop="label" label="标题" min-width="110" />

      <!-- 查询条件 -->
      <el-table-column label="查询" width="90" align="center">
        <template #default="{ row }">
          <el-checkbox
            :model-value="isSearchChecked(row.key)"
            :disabled="!isFilterable(row.key)"
            @change="(v: any) => toggleSearch(row, !!v)"
          />
        </template>
      </el-table-column>
      <el-table-column label="匹配方式" width="130">
        <template #default="{ row }">
          <el-select
            v-if="isSearchChecked(row.key)"
            :model-value="searchMatchTypeOf(row.key)"
            style="width: 120px"
            @change="(v: any) => setSearchMatchType(row.key, v)"
          >
            <el-option
              v-for="opt in matchOptions(row)"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>

      <!-- 展示列 -->
      <el-table-column label="展示" width="80" align="center">
        <template #default="{ row }">
          <el-checkbox
            :model-value="isColumnChecked(row.key)"
            @change="(v: any) => toggleColumn(row, !!v)"
          />
        </template>
      </el-table-column>
      <el-table-column label="宽度" width="120">
        <template #default="{ row }">
          <el-input-number
            v-if="isColumnChecked(row.key)"
            :model-value="columnWidthOf(row.key)"
            :min="50"
            :max="600"
            :step="10"
            style="width: 100px"
            @change="(v: any) => setColumnProp(row.key, 'width', v)"
          />
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="对齐" width="110">
        <template #default="{ row }">
          <el-select
            v-if="isColumnChecked(row.key)"
            :model-value="columnAlignOf(row.key)"
            style="width: 90px"
            @change="(v: any) => setColumnProp(row.key, 'align', v)"
          >
            <el-option label="左对齐" value="left" />
            <el-option label="居中" value="center" />
            <el-option label="右对齐" value="right" />
          </el-select>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="排序" width="80" align="center">
        <template #default="{ row }">
          <el-switch
            v-if="isColumnChecked(row.key)"
            :model-value="columnSortableOf(row.key)"
            @change="(v: any) => setColumnProp(row.key, 'sortable', v)"
          />
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="candidates.length === 0" description="当前表单无可配置字段" :image-size="60" />
  </div>
</template>

<script setup lang="ts">
import type { ColumnConfigItem } from '@/api/bizData'
import type { SearchFieldConfig, ColumnViewConfig } from '../ViewDesigner.vue'

const props = defineProps<{
  candidates: ColumnConfigItem[]
  searchFields: SearchFieldConfig[]
  columns: ColumnViewConfig[]
  /** 可筛选列 key 集合（查询条件勾选禁用依据；缺省全部可勾选） */
  filterableKeys?: Set<string>
}>()

const emit = defineEmits<{
  (e: 'update:searchFields', v: SearchFieldConfig[]): void
  (e: 'update:columns', v: ColumnViewConfig[]): void
}>()

// ========== 查询条件 ==========
/** 字段是否可作查询条件（filterableKeys 未配置时全部允许） */
function isFilterable(key: string): boolean {
  return props.filterableKeys ? props.filterableKeys.has(key) : true
}

function isSearchChecked(key: string): boolean {
  return props.searchFields.some((f) => f.key === key)
}

function searchMatchTypeOf(key: string): string {
  return props.searchFields.find((f) => f.key === key)?.matchType || 'eq'
}

/** 该列 matchType 选项：文本 eq/like；数字/日期 eq/range */
function matchOptions(col: ColumnConfigItem): { label: string; value: string }[] {
  if (col.columnType === 'INT' || col.columnType === 'DECIMAL'
      || col.columnType === 'DATE' || col.columnType === 'DATETIME') {
    return [
      { label: '等值', value: 'eq' },
      { label: '范围', value: 'range' },
    ]
  }
  return [
    { label: '等值', value: 'eq' },
    { label: '模糊', value: 'like' },
  ]
}

function defaultMatchType(col: ColumnConfigItem): string {
  return matchOptions(col)[0].value
}

function toggleSearch(col: ColumnConfigItem, checked: boolean) {
  // 不可筛选列（filterableKeys 之外）不允许作为查询条件
  if (checked && !isFilterable(col.key)) return
  if (checked) {
    if (!isSearchChecked(col.key)) {
      emit('update:searchFields', [
        ...props.searchFields,
        { key: col.key, label: col.label, matchType: defaultMatchType(col) },
      ])
    }
  } else {
    emit('update:searchFields', props.searchFields.filter((f) => f.key !== col.key))
  }
}

function setSearchMatchType(key: string, v: string) {
  emit(
    'update:searchFields',
    props.searchFields.map((f) => (f.key === key ? { ...f, matchType: v } : f)),
  )
}

// ========== 展示列 ==========
function isColumnChecked(key: string): boolean {
  return props.columns.some((c) => c.key === key)
}

function findColumn(key: string): ColumnViewConfig | undefined {
  return props.columns.find((c) => c.key === key)
}

function columnWidthOf(key: string): number {
  return findColumn(key)?.width ?? 130
}

function columnAlignOf(key: string): string {
  return findColumn(key)?.align ?? 'left'
}

function columnSortableOf(key: string): boolean {
  return findColumn(key)?.sortable ?? false
}

function toggleColumn(col: ColumnConfigItem, checked: boolean) {
  if (checked) {
    if (!isColumnChecked(col.key)) {
      emit('update:columns', [
        ...props.columns,
        { key: col.key, label: col.label, width: 130, align: 'left', sortable: false },
      ])
    }
  } else {
    emit('update:columns', props.columns.filter((c) => c.key !== col.key))
  }
}

function setColumnProp(key: string, prop: 'width' | 'align' | 'sortable', v: any) {
  emit(
    'update:columns',
    props.columns.map((c) => (c.key === key ? { ...c, [prop]: v } : c)),
  )
}
</script>

<style scoped>
.config-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.config-title {
  font-weight: bold;
}
.config-hint {
  font-size: 14px;
  color: #909399;
}
.muted {
  color: #c0c4cc;
}
</style>
