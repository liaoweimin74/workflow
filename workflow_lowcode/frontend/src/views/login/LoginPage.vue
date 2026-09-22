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
  <div class="min-h-screen flex items-stretch relative overflow-hidden bg-[#f6f7f5] dark:bg-[#111514]">
    <!-- 背景装饰：青玉渐变光斑 + 细网格 -->
    <div class="absolute -top-32 -right-24 w-[480px] h-[480px] rounded-full bg-[rgb(var(--brand-soft-rgb)/0.18)] dark:bg-[rgb(var(--brand-soft-rgb)/0.08)] blur-3xl pointer-events-none"></div>
    <div class="absolute -bottom-40 -left-28 w-[520px] h-[520px] rounded-full bg-[rgb(var(--brand-bright-rgb)/0.14)] dark:bg-[rgb(var(--brand-bright-rgb)/0.06)] blur-3xl pointer-events-none"></div>
    <div
      class="absolute inset-0 pointer-events-none opacity-[0.5] dark:opacity-[0.08]"
      style="background-image: linear-gradient(rgb(var(--brand-rgb)/0.05) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--brand-rgb)/0.05) 1px, transparent 1px); background-size: 36px 36px;"
    ></div>

    <!-- 左侧品牌面板（lg 及以上显示） -->
    <div class="hidden lg:flex w-[46%] xl:w-[44%] relative flex-col justify-between p-12 bg-(--ink) overflow-hidden">
      <!-- 墨绿面板上的青光装饰 -->
      <div class="absolute -top-24 -left-20 w-[420px] h-[420px] rounded-full bg-[rgb(var(--brand-rgb)/0.4)] blur-3xl pointer-events-none"></div>
      <div class="absolute bottom-[-140px] right-[-80px] w-[380px] h-[380px] rounded-full bg-[rgb(var(--brand-bright-rgb)/0.2)] blur-3xl pointer-events-none"></div>
      <div
        class="absolute inset-0 pointer-events-none opacity-60"
        style="background-image: linear-gradient(rgb(var(--brand-glow-rgb)/0.05) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--brand-glow-rgb)/0.05) 1px, transparent 1px); background-size: 40px 40px;"
      ></div>

      <div class="relative flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-(--brand) to-(--brand-bright) flex items-center justify-center shadow-[0_4px_16px_rgb(var(--brand-rgb)/0.5)]">
          <span class="text-white text-base font-bold tracking-tight">MB</span>
        </div>
        <div>
          <p class="text-[15px] font-semibold text-white tracking-tight">工作流管理系统</p>
          <p class="text-xs text-[#8fa096] mt-0.5">Workflow · Low-Code Platform</p>
        </div>
      </div>

      <div class="relative max-w-md">
        <h1 class="text-3xl xl:text-4xl font-bold text-white leading-snug tracking-tight">
          让流程运转<br />
          <span class="bg-gradient-to-r from-(--brand-glow) to-(--color-accent-300) bg-clip-text text-transparent">如呼吸般自然</span>
        </h1>
        <p class="mt-5 text-sm leading-6 text-[#a7b5ad]">
          可视化流程设计 · 零代码表单搭建 · 页面与数据源一站式编排，
          为石化工厂安全作业提供端到端的数字化底座。
        </p>
        <div class="mt-8 space-y-3.5">
          <div v-for="feat in [
            { t: 'BPMN 可视化建模', d: '拖拽设计审批流，网关 / 会签 / 子流程' },
            { t: '零代码表单引擎', d: '字段级权限，复制即可派生新表单' },
            { t: '双引擎热切换', d: 'Node.js 高性能引擎，数据完整迁移' },
          ]" :key="feat.t" class="flex items-start gap-3">
            <span class="mt-1 w-4 h-4 rounded-full bg-[rgb(var(--brand-mid-rgb)/0.3)] border border-[rgb(var(--brand-soft-rgb)/0.5)] flex items-center justify-center shrink-0">
              <svg class="w-2.5 h-2.5 text-(--brand-glow)" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
            </span>
            <div>
              <p class="text-sm font-medium text-[#e6ebe8]">{{ feat.t }}</p>
              <p class="text-xs text-[#7d8d84] mt-0.5">{{ feat.d }}</p>
            </div>
          </div>
        </div>
      </div>

      <p class="relative text-xs text-[#5f6d66]">安全第一 · 规范作业</p>
    </div>

    <!-- 右侧登录表单区 -->
    <div class="flex-1 flex items-center justify-center p-6 relative">
      <div class="w-full max-w-[400px]">
        <!-- 移动端 Logo -->
        <div class="lg:hidden text-center mb-8">
          <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-(--brand) to-(--brand-bright) flex items-center justify-center mx-auto mb-4 shadow-[0_4px_16px_rgb(var(--brand-rgb)/0.35)]">
            <span class="text-white text-xl font-bold">MB</span>
          </div>
          <h1 class="text-xl font-semibold tracking-tight text-gray-800 dark:text-gray-100">工作流管理系统</h1>
          <p class="text-sm text-gray-400 dark:text-gray-500 mt-1">石化工厂 · 安全作业管理平台</p>
        </div>

        <div class="bg-white/90 dark:bg-[#181d1b]/95 rounded-3xl border border-[#e9ece7] dark:border-[#2b332e] shadow-[0_2px_6px_rgba(18,46,39,0.04),0_16px_48px_rgba(18,46,39,0.1)] dark:shadow-black/30 p-9 backdrop-blur">
          <div class="hidden lg:block mb-8">
            <h2 class="text-xl font-semibold tracking-tight text-gray-800 dark:text-gray-100">欢迎回来 👋</h2>
            <p class="text-sm text-gray-400 dark:text-gray-500 mt-1.5">请使用平台账号登录，开始今天的工作</p>
          </div>

          <el-form :model="loginForm" @keyup.enter="handleLogin" label-position="top">
            <el-form-item label="用户名">
              <el-input
                v-model="loginForm.username"
                placeholder="请输入用户名"
                size="large"
                class="!rounded-xl"
              />
            </el-form-item>
            <el-form-item label="密码">
              <el-input
                v-model="loginForm.password"
                type="password"
                placeholder="请输入密码"
                size="large"
                show-password
                class="!rounded-xl"
              />
            </el-form-item>
            <div class="flex items-center mb-5">
              <el-checkbox v-model="rememberMe">记住用户名</el-checkbox>
            </div>
            <el-form-item class="!mb-0">
              <el-button
                type="primary"
                size="large"
                :loading="loading"
                class="w-full !rounded-xl !h-11 !text-base !bg-gradient-to-r !from-(--brand) !to-(--brand-mid) !border-transparent shadow-[0_4px_14px_rgb(var(--brand-rgb)/0.35)] hover:!from-(--brand-deeper) hover:!to-(--brand-mid-hover) hover:!shadow-[0_6px_20px_rgb(var(--brand-rgb)/0.45)] active:!translate-y-0 transition-all"
                @click="handleLogin"
              >
                登 录
              </el-button>
            </el-form-item>
          </el-form>

          <div class="flex items-center gap-3 my-6">
            <div class="flex-1 h-px bg-[#eef1ed] dark:bg-[#2b332e]" />
            <span class="text-xs text-gray-300 dark:text-gray-600">安全登录</span>
            <div class="flex-1 h-px bg-[#eef1ed] dark:bg-[#2b332e]" />
          </div>

          <p class="text-center text-xs text-gray-400 dark:text-gray-500 leading-5">
            登录即代表同意平台使用规范<br />
            <span class="text-gray-300 dark:text-gray-600">遇到问题请联系系统管理员</span>
          </p>
        </div>

        <p class="text-center text-xs text-gray-300 dark:text-gray-600 mt-6">
          © 2026 工作流管理系统 · MB Platform
        </p>
      </div>
    </div>
  </div>
</template>
