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
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
    <div class="w-[400px] bg-white rounded-2xl shadow-lg shadow-gray-200/50 p-10">
      <!-- Logo 区 -->
      <div class="text-center mb-8">
        <div class="w-14 h-14 rounded-2xl bg-industrial-600 flex items-center justify-center mx-auto mb-4">
          <span class="text-white text-xl font-bold">MB</span>
        </div>
        <h1 class="text-xl font-semibold text-gray-800">工作流管理系统</h1>
        <p class="text-sm text-gray-400 mt-1">石化工厂 · 安全作业管理平台</p>
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
            class="w-full !rounded-lg !bg-industrial-600 !border-industrial-600 hover:!bg-industrial-700 !h-11 !text-base"
            @click="handleLogin"
          >
            登 录
          </el-button>
        </el-form-item>
      </el-form>

      <!-- 底部提示 -->
      <p class="text-center text-xs text-gray-300 mt-6">
        安全第一 · 规范作业
      </p>
    </div>
  </div>
</template>