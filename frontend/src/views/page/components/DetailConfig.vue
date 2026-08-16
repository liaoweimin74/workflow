<template>
  <div class="detail-config">
    <div class="config-header">
      <span class="config-title">详情弹窗</span>
    </div>
    <el-form label-width="90px" size="small" style="max-width: 520px">
      <el-form-item label="启用详情">
        <el-switch :model-value="props.modelValue.enabled" @change="(v: any) => set('enabled', !!v)" />
      </el-form-item>
      <el-form-item v-if="props.modelValue.enabled" label="弹窗宽度">
        <el-input
          :model-value="props.modelValue.width"
          placeholder="如 800px"
          style="width: 200px"
          @input="(v: string) => set('width', v)"
        />
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import type { ViewDetailConfig } from '../ViewDesigner.vue'

const props = defineProps<{
  modelValue: ViewDetailConfig
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: ViewDetailConfig): void
}>()

function set(key: keyof ViewDetailConfig, v: any) {
  emit('update:modelValue', { ...props.modelValue, [key]: v })
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
</style>