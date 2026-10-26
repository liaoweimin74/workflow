<script setup lang="ts">
/**
 * 移动渲染块占位：区分「该端不支持」（设计裁决，附理由）与「暂未支持」（实现分批补齐）。
 * 文案是给配置者看的端差异提示，不是错误态；容器占位保留默认插槽让子规则继续渲染。
 */
defineProps<{
  block?: string
  kind?: 'pending' | 'unsupported'
  reason?: string
}>()
</script>

<template>
  <div class="m-block-placeholder">
    <div class="m-block-placeholder__title">
      {{ kind === 'unsupported' ? '该端不支持' : '移动端暂未支持' }}
      <span v-if="block" class="m-block-placeholder__block">{{ block }}</span>
    </div>
    <div v-if="kind === 'unsupported' && reason" class="m-block-placeholder__reason">{{ reason }}</div>
    <slot />
  </div>
</template>

<style scoped>
.m-block-placeholder {
  margin: 8px 12px;
  padding: 14px;
  border: 1px dashed #dcdee0;
  border-radius: 8px;
  background: #fafafa;
  color: #969799;
}
.m-block-placeholder__title {
  font-size: 14px;
  font-weight: 600;
}
.m-block-placeholder__block {
  margin-left: 4px;
  font-size: 12px;
  font-weight: 400;
  color: #c8c9cc;
}
.m-block-placeholder__reason {
  margin-top: 4px;
  font-size: 12px;
}
</style>
