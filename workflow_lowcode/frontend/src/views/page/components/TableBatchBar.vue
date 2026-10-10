<template>
  <!-- 批量操作条（Task ⑤）：选中行后浮出在表格顶部（SearchTable 默认插槽内）；
       批量删除走与单行删除同款确认/删除链路（由父级执行）；
       批量动作挂载点：父级通过 selectedRows/expose 暴露选中集合，后续动作可在此扩展 -->
  <div class="table-batch-bar">
    <span class="batch-count">
      已选 <b>{{ count }}</b> 项
    </span>
    <el-button
      v-if="deletable"
      type="danger"
      size="small"
      :icon="Delete"
      :loading="deleting"
      @click="$emit('batch-delete')"
    >
      批量删除
    </el-button>
    <el-button size="small" @click="$emit('clear')">清空选择</el-button>
  </div>
</template>

<script setup lang="ts">
import { Delete } from '@element-plus/icons-vue'

withDefaults(defineProps<{
  /** 已选行数 */
  count: number
  /** 是否显示批量删除（未配置删除能力时仅显示清空选择） */
  deletable?: boolean
  /** 删除请求进行中 */
  deleting?: boolean
}>(), {
  deletable: true,
  deleting: false,
})

defineEmits<{
  (e: 'batch-delete'): void
  (e: 'clear'): void
}>()
</script>

<style scoped>
.table-batch-bar {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border: 1px solid var(--el-color-danger-light-7, #fde2e2);
  background: var(--el-color-danger-light-9, #fef0f0);
  border-radius: 4px;
  /* 浮出动效：选中后从上方淡入下滑 */
  animation: batch-bar-in 0.2s ease-out;
}
.batch-count {
  font-size: 13px;
  color: #606266;
  white-space: nowrap;
}
.batch-count b {
  color: var(--el-color-danger);
}
@keyframes batch-bar-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
