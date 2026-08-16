<template>
  <div class="actions-config">
    <div class="config-header">
      <span class="config-title">行操作（开关 + 权限点）</span>
    </div>
    <el-form label-width="90px" size="small" style="max-width: 520px">
      <el-form-item label="新增">
        <el-switch :model-value="modelValue.create" @change="(v: any) => set('create', !!v)" />
      </el-form-item>
      <el-form-item label="编辑">
        <el-switch :model-value="modelValue.edit" @change="(v: any) => set('edit', !!v)" />
      </el-form-item>
      <el-form-item label="删除">
        <el-switch :model-value="modelValue.delete" @change="(v: any) => set('delete', !!v)" />
      </el-form-item>
      <el-form-item label="查看">
        <el-switch :model-value="modelValue.view" @change="(v: any) => set('view', !!v)" />
      </el-form-item>
      <el-form-item label="权限点">
        <el-input
          :model-value="modelValue.permissions"
          placeholder="多个权限点用逗号分隔，如 page:create,page:edit"
          style="width: 320px"
          @input="(v: string) => set('permissions', v)"
        />
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import type { ViewActionsConfig } from '../ViewDesigner.vue'

const props = defineProps<{
  modelValue: ViewActionsConfig
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: ViewActionsConfig): void
}>()

function set(key: keyof ViewActionsConfig, v: any) {
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