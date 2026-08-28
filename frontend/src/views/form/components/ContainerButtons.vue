<template>
  <div class="container-buttons">
    <el-button v-if="container.buttons.showNew" class="btn-new" @click="emit('action', 'new')">新增</el-button>
    <el-button v-if="container.buttons.showCopy" class="btn-copy" @click="emit('action', 'copy')">复制</el-button>
    <el-button v-if="container.buttons.showDelete" class="btn-delete" type="danger" @click="emit('action', 'delete')">删除</el-button>
    <el-button
      v-for="btn in container.buttons.custom"
      :key="btn.key"
      :type="(btn as any).type || ''"
      :class="`btn-custom-${(btn as any).key}`"
      @click="emit('custom', btn as any)"
    >{{ (btn as any).label }}</el-button>
    <el-button v-if="container.buttons.showCancel" class="btn-cancel" @click="emit('action', 'cancel')">取消</el-button>
    <el-button v-if="container.buttons.showConfirm" class="btn-confirm" type="primary" @click="emit('action', 'confirm')">确定</el-button>
  </div>
</template>

<script setup lang="ts">
import type { LinkageContainer } from '@/views/form/composables/useLinkageContainer'

/**
 * 共享数据容器按钮区（表单设计器与页面设计器的 dialog / inline 容器复用）。
 * 触发容器行为：new/copy/delete/cancel/confirm（默认按钮）与 custom（自定义按钮）。
 * footer 区是否渲染由调用方用 hasContainerButtons() 判断，不在此组件内。
 */
defineProps<{ container: LinkageContainer }>()
const emit = defineEmits<{
  (e: 'action', action: 'new' | 'cancel' | 'confirm' | 'delete' | 'copy'): void
  (e: 'custom', btn: { key: string; label: string; type?: string }): void
}>()
</script>
