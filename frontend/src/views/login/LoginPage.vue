<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const loginForm = ref({
  username: '',
  password: ''
})
const loading = ref(false)
const rememberMe = ref(false)

// 页面加载时预填已记住的用户名
const savedUsername = localStorage.getItem('remembered_username')
if (savedUsername) {
  loginForm.value.username = savedUsername
  rememberMe.value = true
}

// 取消勾选时立即清除
watch(rememberMe, (val) => {
  if (!val) {
    localStorage.removeItem('remembered_username')
  }
})

async function handleLogin() {
  if (!loginForm.value.username || !loginForm.value.password) return
  loading.value = true
  try {
    await authStore.login(loginForm.value)
    await authStore.fetchMenus()
    if (rememberMe.value) {
      localStorage.setItem('remembered_username', loginForm.value.username)
    } else {
      localStorage.removeItem('remembered_username')
    }
    router.push('/')
  } catch {
    // error handled by interceptor
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-[#eef1fc] via-[#dcdcfb] to-[#c6edf4] dark:from-[#12162b] dark:via-[#1b2040] dark:to-[#2a3054]">
    <div class="absolute -top-20 -right-20 w-96 h-96 rounded-full bg-accent-400/20 dark:bg-accent-500/10 blur-3xl pointer-events-none"></div>
    <div class="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-[#5755ee]/15 dark:bg-[#7c7ff0]/10 blur-3xl pointer-events-none"></div>
    <div class="relative w-[400px] bg-white dark:bg-[#1b2040] rounded-[20px] border border-[#e9edfa] dark:border-[#2a3054] shadow-[0_8px_30px_rgba(87,85,238,0.08)] dark:shadow-black/30 p-10">
      <!-- Logo 区 -->
      <div class="text-center mb-8">
        <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#5755ee] to-[#46c9d6] flex items-center justify-center mx-auto mb-4 shadow-md">
          <span class="text-white text-xl font-bold">MB</span>
        </div>
        <h1 class="text-xl font-semibold text-gray-800 dark:text-gray-100">工作流管理系统</h1>
        <p class="text-sm text-gray-400 dark:text-gray-500 mt-1">石化工厂 · 安全作业管理平台</p>
      </div>

      <!-- 表单 -->
      <el-form :model="loginForm" @keyup.enter="handleLogin" label-position="top">
        <el-form-item label="用户名">
          <el-input
            v-model="loginForm.username"
            placeholder="请输入用户名"
            size="large"
            class="!rounded-lg"
          />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="loginForm.password"
            type="password"
            placeholder="请输入密码"
            size="large"
            show-password
            class="!rounded-lg"
          />
        </el-form-item>
        <div class="flex items-center mb-4">
          <el-checkbox v-model="rememberMe">记住用户名</el-checkbox>
        </div>
        <el-form-item class="!mb-0">
          <el-button
            type="primary"
            size="large"
            :loading="loading"
            class="w-full !rounded-lg !h-11 !text-base !bg-gradient-to-r !from-[#5755ee] !to-[#46c9d6] !border-transparent hover:!from-[#6361f0] hover:!to-[#5ad4df]"
            @click="handleLogin"
          >
            登 录
          </el-button>
        </el-form-item>
      </el-form>

      <!-- 底部提示 -->
      <p class="text-center text-xs text-gray-300 dark:text-gray-600 mt-6">
        安全第一 · 规范作业
      </p>
    </div>
  </div>
</template>