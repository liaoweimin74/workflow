<script setup lang="ts">
/**
 * 字段级移动占位：EP-only 自定义字段组件（LookupPicker 等）在移动实例无等价实现时的呈现。
 * 不产输入值（validate 已在 transform 剥离，required 不会锁死整表提交）；
 * 文案=缺失登记理由，发布拦截清单同以 fieldTemplates 为口径。
 */
defineProps<{
  field?: string
  reason?: string
}>()
</script>

<template>
  <div class="m-field-placeholder">
    <div class="m-field-placeholder__name">{{ field }}</div>
    <div class="m-field-placeholder__reason">{{ reason || '该字段组件无移动等价实现' }}</div>
  </div>
</template>

<style scoped>
.m-field-placeholder {
  margin: 6px 0;
  padding: 10px 12px;
  border: 1px dashed #dcdee0;
  border-radius: 6px;
  background: #fafafa;
}
.m-field-placeholder__name {
  font-size: 13px;
  font-weight: 600;
  color: #646566;
}
.m-field-placeholder__reason {
  margin-top: 2px;
  font-size: 12px;
  color: #969799;
}
</style>
