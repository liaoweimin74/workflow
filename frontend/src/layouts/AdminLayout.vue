<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'
import { Fold, Expand } from '@element-plus/icons-vue'
import SubMenu from '@/components/SubMenu.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const collapsed = ref(false)
const tags = ref<{ path: string; title: string }[]>([])

const activeMenu = computed(() => route.path)

function toggleCollapsed() {
  collapsed.value = !collapsed.value
}

function addTag(to: { path: string; meta?: { title?: string } }) {
  const title = (to.meta?.title as string) || to.path
  if (!tags.value.find(t => t.path === to.path)) {
    tags.value.push({ path: to.path, title })
  }
}

function removeTag(path: string) {
  const idx = tags.value.findIndex(t => t.path === path)
  if (idx === -1) return
  tags.value.splice(idx, 1)
  if (route.path === path && tags.value.length > 0) {
    router.push(tags.value[Math.min(idx, tags.value.length - 1)].path)
  }
}

function closeOtherTags(path: string) {
  tags.value = tags.value.filter(t => t.path === path)
}

function closeAllTags() {
  tags.value = []
  router.push('/dashboard')
}

watch(() => route.path, () => {
  if (route.name) addTag(route)
}, { immediate: true })

async function handleLogout() {
  await authStore.logout()
  ElMessage.success('退出成功')
  router.push('/login')
}

function visibleMenus(menuList: any[]): any[] {
  return menuList
    .filter((m: any) => m.menuType !== 2 && m.visible !== 0 && m.status !== 0)
    .map((item: any) => ({ ...item, children: item.children ? visibleMenus(item.children) : [] }))
    .filter((item: any) => item.menuType === 1 || item.children.length > 0)
}

// 过滤掉 /dashboard 避免重复（后端菜单可能包含首页）
function filteredMenus(menuList: any[]) {
  return visibleMenus(menuList).filter(m => m.path !== '/dashboard')
}

const breadcrumbs = computed(() => {
  const matched = route.matched.filter(r => r.meta?.title)
  return matched.map(r => ({ path: r.path, title: r.meta?.title as string }))
})

const currentTag = computed(() => {
  const matched = route.matched.filter(r => r.meta?.title)
  if (matched.length > 0) {
    return (matched[matched.length - 1].meta?.title as string) || ''
  }
  return ''
})
</script>

<template>
  <div class="flex flex-col h-screen min-w-[1024px] max-w-[1920px] mx-auto bg-white">
    <!-- ====== 顶部标题栏（整行） ====== -->
    <header class="h-14 flex items-center justify-between px-4 border-b border-gray-200 bg-white shrink-0">
      <!-- 左侧：折叠按钮 + Logo + 面包屑 -->
      <div class="flex items-center gap-4">
        <button
          @click="toggleCollapsed"
          class="w-8 h-8 flex items-center justify-center rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
        >
          <el-icon :size="18"><Fold v-if="!collapsed" /><Expand v-else /></el-icon>
        </button>
        <div class="flex items-center gap-2 shrink-0">
          <div class="w-8 h-8 rounded-lg bg-industrial-600 flex items-center justify-center">
            <span class="text-white text-sm font-bold">MB</span>
          </div>
          <span class="text-base font-semibold text-gray-800">工作流管理系统</span>
        </div>
        <div class="w-px h-5 bg-gray-200" />
        <el-breadcrumb separator="/">
          <el-breadcrumb-item v-for="b in breadcrumbs" :key="b.path" :to="b.path">
            <span class="text-gray-500 text-xs">{{ b.title }}</span>
          </el-breadcrumb-item>
        </el-breadcrumb>
      </div>

      <!-- 右侧：用户区 -->
      <el-dropdown trigger="click">
        <div class="flex items-center gap-2 cursor-pointer select-none">
          <el-avatar :size="28" icon="UserFilled" class="!bg-industrial-100 !text-industrial-600" />
          <span class="text-sm text-gray-700">{{ authStore.user?.nickname || authStore.user?.username || '用户' }}</span>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="router.push('/profile')">个人中心</el-dropdown-item>
            <el-dropdown-item divided @click="handleLogout">退出登录</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </header>

    <!-- ====== 下方：菜单 + 内容 ====== -->
    <div class="flex flex-1 min-h-0">
      <!-- 左侧菜单 -->
      <aside
        :class="collapsed ? 'w-16' : 'w-56'"
        class="flex flex-col bg-gray-50 border-r border-gray-200 transition-all duration-300 shrink-0"
      >
        <div class="flex-1 overflow-y-auto overflow-x-hidden py-2">
          <el-menu
            :collapse="collapsed"
            :default-active="activeMenu"
            router
            background-color="transparent"
            text-color="#4b5563"
            active-text-color="#f59e0b"
            style="border-right: none"
          >
            <!-- 首页（固定） -->
            <el-menu-item index="/dashboard" class="!my-0.5 !mx-2 !rounded-lg">
              <el-icon><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1"/></svg></el-icon>
              <template #title>
                <span>首页</span>
              </template>
            </el-menu-item>
            <!-- 动态菜单（已过滤首页） -->
            <SubMenu :menuList="filteredMenus(authStore.menus)" />
          </el-menu>
        </div>

      </aside>

      <!-- 右侧内容区 -->
      <div class="flex-1 flex flex-col min-w-0">
        <!-- 页签栏 -->
        <div class="h-10 flex items-center gap-0 px-3 border-b border-gray-200 bg-gray-50 overflow-x-auto shrink-0">
          <div
            v-for="tag in tags"
            :key="tag.path"
            :class="[
              'h-full flex items-center gap-1.5 px-3 border-r border-gray-200 cursor-pointer shrink-0 transition-colors text-sm select-none',
              route.path === tag.path
                ? 'bg-white text-industrial-600 border-t-2 border-t-safety-500 -mt-px'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            ]"
            @click="router.push(tag.path)"
          >
            <span class="truncate max-w-[120px]">{{ tag.title }}</span>
            <button
              v-if="tag.path !== '/dashboard'"
              @click.stop="removeTag(tag.path)"
              class="w-4 h-4 flex items-center justify-center rounded text-gray-300 hover:text-gray-500 hover:bg-gray-200 shrink-0"
            >
              <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <el-dropdown v-if="tags.length > 1" trigger="click" class="ml-auto shrink-0">
            <button class="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
              </svg>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="closeOtherTags(route.path)">关闭其他</el-dropdown-item>
                <el-dropdown-item @click="closeAllTags">关闭全部</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>

        <!-- 主内容 -->
        <main class="flex-1 overflow-auto p-4 bg-gray-50">
          <router-view />
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 折叠态下覆盖 SubMenu.vue 硬编码的 paddingLeft，使图标居中 */
.el-menu--collapse .el-menu-item {
  padding-left: 0 !important;
  padding-right: 0 !important;
  justify-content: center !important;
}
.el-menu--collapse .el-sub-menu__title {
  padding-left: 0 !important;
  padding-right: 0 !important;
  justify-content: center !important;
}
</style>