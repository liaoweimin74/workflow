<template>
  <div class="excel-actions">
    <el-button :icon="Download" :loading="exporting" :size="size" @click="emit('export')">导出 Excel</el-button>
    <el-tooltip
      v-if="showImport"
      :content="importTitle"
      placement="top"
      :disabled="!importDisabled"
      :show-after="200"
    >
      <span class="excel-import-wrap">
        <el-button :icon="Upload" :loading="importing" :disabled="importDisabled" :size="size" @click="emit('import')">
          导入 Excel
        </el-button>
      </span>
    </el-tooltip>
  </div>
</template>

<script setup lang="ts">
/**
 * 视图 Excel 导入导出工具栏（Task 5-b：③ Excel 导入导出前端接线）。
 *
 * 表格形态挂在 SearchTable 工具行（#default 槽，右对齐，与批量操作条同排）；
 * 图表形态独立成行（仅导出）。导入仅业务表单（formKey）绑定的视图可用，
 * 无 formKey 时置灰 + title 说明（纯数据源视图后端返回 400，提前拦截）。
 */
import { Download, Upload } from '@element-plus/icons-vue'

withDefaults(
  defineProps<{
    exporting?: boolean
    importing?: boolean
    /** 是否渲染导入按钮（图表形态仅导出） */
    showImport?: boolean
    /** 导入置灰（无 formKey） */
    importDisabled?: boolean
    /** 置灰时的悬浮说明 */
    importTitle?: string
    size?: 'small' | 'default' | 'large'
  }>(),
  { exporting: false, importing: false, showImport: false, importDisabled: false, importTitle: '', size: 'default' },
)

const emit = defineEmits<{ (e: 'export'): void; (e: 'import'): void }>()
</script>

<style scoped>
.excel-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.excel-import-wrap {
  display: inline-flex;
}
</style>
