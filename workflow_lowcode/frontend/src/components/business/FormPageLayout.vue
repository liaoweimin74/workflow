<script setup lang="ts">
/**
 * FormPageLayout — 统一表单页面外壳组件
 *
 * 为 FormRenderer 页面和自定义表单页面提供一致的布局结构：
 * - header: 标题（左）+ 工具栏（右）
 * - body: 主体内容
 * - footer: 底部按钮区（右对齐）
 */
defineProps<{
  /** 页面标题，不传则不渲染 header 区域 */
  title?: string
}>()
</script>

<template>
  <div class="form-page-layout">
    <!-- Header: title 左 + toolbar 右 -->
    <div
      v-if="title || $slots.toolbar"
      class="form-page-layout__header"
    >
      <span v-if="title" class="form-page-layout__title">{{ title }}</span>
      <div v-if="$slots.toolbar" class="form-page-layout__toolbar">
        <slot name="toolbar" />
      </div>
    </div>

    <!-- Body: 主体内容 -->
    <div class="form-page-layout__body">
      <slot />
    </div>

    <!-- Footer: 底部按钮区，右对齐 -->
    <div v-if="$slots.footer" class="form-page-layout__footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<style scoped>
.form-page-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
}

.form-page-layout__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.form-page-layout__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  line-height: 24px;
}

.form-page-layout__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-page-layout__body {
  flex: 1;
  min-height: 0;
}

.form-page-layout__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
  margin-top: 16px;
}
</style>
