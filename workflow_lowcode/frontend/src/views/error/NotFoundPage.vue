<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()
</script>

<template>
  <el-result status="404" title="404" sub-title="页面不存在">
    <template #extra>
      <el-button type="primary" @click="router.push('/dashboard')">返回首页</el-button>
    </template>
  </el-result>
</template>