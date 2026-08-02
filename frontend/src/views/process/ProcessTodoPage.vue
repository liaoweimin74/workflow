<template>
  <div class="process-todo-page">
    <el-card>
      <template #header>
        <span>待办处理</span>
      </template>
      <el-empty description="待办任务列表（待实现）" :image-size="120" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.process-todo-page {
  padding: 16px;
}
</style>
