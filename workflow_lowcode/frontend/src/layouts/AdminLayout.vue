<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'
import { Fold, Expand, HomeFilled, Sunny, Moon, Lock, MagicStick, Check } from '@element-plus/icons-vue'
import draggable from 'vuedraggable'
import SubMenu from '@/components/SubMenu.vue'
import NotificationBell from '@/modules/notification/components/NotificationBell.vue'
import { useAiAssistantStore } from '@/stores/aiAssistantStore'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const aiStore = useAiAssistantStore()

const collapsed = ref(false)
// 暗色偏好持久化（Task 16）：优先读用户选择，从未选择时跟随系统
const isDark = ref(localStorage.getItem('theme-dark') === '1')

function applyDark() {
  document.documentElement.classList.toggle('dark', isDark.value)
}

function setDark(v: boolean) {
  isDark.value = v
  localStorage.setItem('theme-dark', v ? '1' : '0')
  applyDark()
}

// 风格主题偏好持久化（Task 17-F 双主题）：verdant 青墨 / classic 经典靓蓝
// style.css 按 html[data-theme] 换值；index.html 内联脚本首帧预置，避免闪烁
const uiTheme = ref<'verdant' | 'classic'>(
  (localStorage.getItem('portal-ui-theme') as 'classic') === 'classic' ? 'classic' : 'verdant',
)

function applyUiTheme() {
  document.documentElement.dataset.theme = uiTheme.value
  localStorage.setItem('portal-ui-theme', uiTheme.value)
}

function setUiTheme(t: 'verdant' | 'classic') {
  uiTheme.value = t
  applyUiTheme()
}

function onStorage(e: StorageEvent) {
  if (e.key === 'portal-ui-theme' && (e.newValue === 'classic' || e.newValue === 'verdant')) {
    uiTheme.value = e.newValue
    document.documentElement.dataset.theme = uiTheme.value
  }
}
/** 页签集合：path 唯一；name=路由 name（与组件 defineOptions name 一致，供 keep-alive include 匹配） */
const tags = ref<{ path: string; title: string; locked?: boolean; name?: string }[]>([])

/** keep-alive 缓存组件名集合（派生自 tags，关闭页签自动移除同名缓存；多页签共享同一组件时保留） */
const cachedViews = computed(() =>
  tags.value
    .map(t => t.name)
    .filter((n): n is string => !!n)
    .filter((n, i, arr) => arr.indexOf(n) === i),
)

/** keep-alive 缓存实例上限：超出后 LRU 驱逐最久未访问实例 */
const MAX_CACHED_VIEWS = 15

const activeMenu = computed(() => route.path)

function toggleCollapsed() {
  collapsed.value = !collapsed.value
}

function addTag(to: { path: string; meta?: { title?: string }; name?: string }) {
  // 优先使用菜单名称（菜单打开的路由标题=菜单名），回退路由 meta.title
  const menuPath = findMenuPath(authStore.menus, to.path)
  const title = (menuPath && menuPath.length > 0 ? menuPath[menuPath.length - 1].menuName : null)
    || (to.meta?.title as string)
    || to.path
  if (!tags.value.find(t => t.path === to.path)) {
    tags.value.push({ path: to.path, title, name: to.name as string | undefined })
  }
}

/** 菜单重击当前页签：携带递增 query 强制导航，触发组件 watch route.query 重新加载（keep-alive 下组件不重挂载） */
function handleMenuSelect(index: string) {
  if (index === route.path) {
    router.push({ path: index, query: { ...route.query, _t: Date.now() } })
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

// ====== 页签右键菜单 ======
const contextMenu = ref({ visible: false, x: 0, y: 0, targetPath: '' })

function onTagContextMenu(event: MouseEvent, tag: { path: string }) {
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    targetPath: tag.path
  }
}

function closeContextMenu() {
  contextMenu.value.visible = false
}

function closeCurrent(path: string) {
  const tag = tags.value.find(t => t.path === path)
  if (!tag || tag.locked || path === '/dashboard') return
  removeTag(path)
  closeContextMenu()
}

function closeLeft(path: string) {
  const idx = tags.value.findIndex(t => t.path === path)
  if (idx <= 0) { closeContextMenu(); return }
  tags.value = tags.value.filter((t, i) => i >= idx || t.locked || t.path === '/dashboard')
  closeContextMenu()
}

function closeRight(path: string) {
  const idx = tags.value.findIndex(t => t.path === path)
  if (idx === -1) { closeContextMenu(); return }
  tags.value = tags.value.filter((t, i) => i <= idx || t.locked || t.path === '/dashboard')
  closeContextMenu()
}

function closeAll() {
  tags.value = tags.value.filter(t => t.locked || t.path === '/dashboard')
  if (!tags.value.find(t => t.path === route.path)) {
    router.push('/dashboard')
  }
  closeContextMenu()
}

function toggleLock(path: string) {
  const tag = tags.value.find(t => t.path === path)
  if (tag) {
    tag.locked = !tag.locked
  }
  closeContextMenu()
}

// 拖拽结束后确保首页在最左
function onDragEnd() {
  const dashIdx = tags.value.findIndex(t => t.path === '/dashboard')
  if (dashIdx > 0) {
    const [dash] = tags.value.splice(dashIdx, 1)
    tags.value.unshift(dash)
  }
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

// 从菜单树递归查找路径，返回从根到目标的节点链
// 优先匹配叶子菜单（menuType=1 有 component），避免父目录与子菜单 path 相同（如 /form）时误命中父级
function findMenuPath(menus: any[], targetPath: string): any[] | null {
  for (const m of menus) {
    // 仅叶子菜单（非目录）参与 path 精确匹配
    if ((m.menuType === undefined || m.menuType !== 0) && m.path === targetPath) {
      return [m]
    }
    if (m.children && m.children.length > 0) {
      const sub = findMenuPath(m.children, targetPath)
      if (sub) return [m, ...sub]
    }
  }
  return null
}

const breadcrumbs = computed(() => {
  // 优先从菜单树匹配
  const menuPath = findMenuPath(authStore.menus, route.path)
  if (menuPath && menuPath.length > 0) {
    return menuPath.map(m => ({ path: m.path, title: m.menuName }))
  }
  // 回退到 route.matched
  const matched = route.matched.filter(r => r.meta?.title)
  return matched.map(r => ({ path: r.path, title: r.meta?.title as string }))
})

onMounted(() => {
  document.addEventListener('click', closeContextMenu)
  // 恢复暗色偏好；从未选择过且系统为深色时跟随系统
  if (localStorage.getItem('theme-dark') === null && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    isDark.value = true
  }
  applyDark()
  // 风格主题：同步 html[data-theme]（防闪兜底）+ 监听多标签页同步
  applyUiTheme()
  window.addEventListener('storage', onStorage)
})

onUnmounted(() => {
  document.removeEventListener('click', closeContextMenu)
  window.removeEventListener('storage', onStorage)
})
</script>

<template>
  <div class="flex flex-col h-screen min-w-[1024px] max-w-[1920px] mx-auto bg-transparent dark:bg-transparent">
    <!-- ====== 顶部标题栏（整行，玻璃感） ====== -->
    <header class="h-14 flex items-center justify-between px-4 border-b border-[#e6e9e4] bg-white/85 dark:bg-[#181d1b]/85 dark:border-[#2b332e] backdrop-blur-md shrink-0 z-20">
      <!-- 左侧：折叠按钮 + Logo + 面包屑 -->
      <div class="flex items-center gap-4">
        <button
          @click="toggleCollapsed"
          class="w-8 h-8 flex items-center justify-center rounded-md text-gray-500 hover:text-gray-700 hover:bg-[#f0f2ee] dark:hover:bg-[#2b332e] transition-colors shrink-0"
        >
          <el-icon :size="18"><Fold v-if="!collapsed" /><Expand v-else /></el-icon>
        </button>
        <div class="flex items-center gap-2 shrink-0">
          <div class="w-8 h-8 rounded-[10px] bg-gradient-to-br from-(--brand) to-(--brand-bright) flex items-center justify-center shadow-[0_2px_8px_rgb(var(--brand-rgb)/0.35)]">
            <span class="text-white text-sm font-bold tracking-tight">MB</span>
          </div>
          <span class="text-base font-semibold tracking-tight text-gray-800 dark:text-gray-100">工作流管理系统</span>
        </div>
        <div class="w-px h-5 bg-gray-200 dark:bg-[#333d37]" />
        <el-breadcrumb separator="/">
          <el-breadcrumb-item v-for="(b, i) in breadcrumbs" :key="b.path">
            <span class="text-gray-500 text-sm flex items-center gap-1">
              <el-icon v-if="i === 0" :size="14"><HomeFilled /></el-icon>
              {{ b.title }}
            </span>
          </el-breadcrumb-item>
        </el-breadcrumb>
      </div>

      <!-- 右侧：AI 助手开关 + 消息通知 + 外观切换 + 用户区 -->
      <div class="flex items-center gap-3">
        <!-- AI 助手开关（远程线独有）：激活色随风格变量 -->
        <button
          @click="aiStore.toggle()"
          :title="aiStore.visible ? '隐藏 AI 助手' : '显示 AI 助手'"
          class="w-8 h-8 flex items-center justify-center rounded-md transition-colors"
          :class="aiStore.visible
            ? 'text-[var(--brand)] hover:bg-[rgb(var(--brand-soft-rgb)/0.1)]'
            : 'text-gray-500 hover:text-gray-700 hover:bg-[#f0f2ee] dark:hover:bg-[#2b332e]'"
        >
          <el-icon :size="18"><MagicStick /></el-icon>
        </button>
        <NotificationBell />
        <!-- 外观切换（单入口下拉，Task 18-P）：界面风格（青墨/经典）× 明暗模式（暗色/亮色） -->
        <el-popover trigger="click" placement="bottom-end" :width="196" popper-class="ui-style-popper">
          <template #reference>
            <button
              class="w-8 h-8 flex items-center justify-center rounded-md text-gray-500 hover:text-gray-700 hover:bg-[#f0f2ee] dark:hover:bg-[#2b332e] transition-colors"
              :title="`外观：${uiTheme === 'verdant' ? '青墨' : '经典'} · ${isDark ? '暗色' : '亮色'}`"
              aria-label="切换界面风格与明暗模式"
            >
              <el-icon :size="18"><MagicStick /></el-icon>
              <span
                class="w-1.5 h-1.5 rounded-full ml-0.5 shrink-0"
                :style="{ background: uiTheme === 'verdant' ? '#2dd4bf' : '#5755ee' }"
              />
            </button>
          </template>
          <div class="-mx-1">
            <p class="text-[11px] font-medium text-gray-400 dark:text-gray-500 mb-1 tracking-wide px-2">界面风格</p>
            <button
              v-for="t in (['verdant', 'classic'] as const)"
              :key="t"
              class="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors text-left"
              :class="uiTheme === t
                ? 'bg-[rgb(var(--brand-soft-rgb)/0.12)] text-[var(--brand)] font-medium'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#262e29]'"
              @click="setUiTheme(t)"
            >
              <span
                class="w-2 h-2 rounded-full shrink-0"
                :style="{ background: t === 'verdant' ? '#2dd4bf' : '#5755ee' }"
              />
              {{ t === 'verdant' ? '青墨 · 翡翠青' : '经典 · 靛蓝' }}
              <el-icon v-if="uiTheme === t" :size="14" class="ml-auto"><Check /></el-icon>
            </button>
            <el-divider style="margin: 6px 0" />
            <p class="text-[11px] font-medium text-gray-400 dark:text-gray-500 mb-1 tracking-wide px-2">明暗模式</p>
            <button
              v-for="m in ([true, false] as const)"
              :key="m ? 'dark' : 'light'"
              class="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors text-left"
              :class="isDark === m
                ? 'bg-[rgb(var(--brand-soft-rgb)/0.12)] text-[var(--brand)] font-medium'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#262e29]'"
              @click="setDark(m)"
            >
              <el-icon :size="14"><Moon v-if="m" /><Sunny v-else /></el-icon>
              {{ m ? '暗色模式' : '亮色模式' }}
              <el-icon v-if="isDark === m" :size="14" class="ml-auto"><Check /></el-icon>
            </button>
          </div>
        </el-popover>
        <el-dropdown trigger="click">
        <div class="flex items-center gap-2 cursor-pointer select-none">
          <el-avatar :size="28" icon="UserFilled" class="!bg-industrial-100 !text-industrial-600" />
          <span class="text-sm text-gray-700 dark:text-gray-200">{{ authStore.user?.nickname || authStore.user?.username || '用户' }}</span>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="router.push('/profile')">个人中心</el-dropdown-item>
            <el-dropdown-item divided @click="handleLogout">退出登录</el-dropdown-item>
          </el-dropdown-menu>
        </template>
        </el-dropdown>
      </div>
    </header>

    <!-- ====== 下方：菜单 + 内容 ====== -->
    <div class="flex flex-1 min-h-0">
      <!-- 左侧菜单：深墨松绿（明暗两态统一，形成纵向对比层次） -->
      <aside
        :class="collapsed ? 'w-16' : 'w-56'"
        class="sidebar-ink flex flex-col bg-(--ink) border-r border-(--ink-border) transition-all duration-300 shrink-0"
      >
        <div class="flex-1 overflow-y-auto overflow-x-hidden py-3">
          <el-menu
            :collapse="collapsed"
            :default-active="activeMenu"
            router
            background-color="transparent"
            text-color="#a7b5ad"
            active-text-color="var(--brand-glow)"
            style="border-right: none"
            @select="handleMenuSelect"
          >
            <!-- 首页（固定） -->
            <el-menu-item index="/dashboard" :class="collapsed ? '!my-0.5 !rounded-lg' : '!my-0.5 !mx-2 !rounded-lg'">
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
        <!-- 页签栏（胶囊式页签） -->
        <div class="min-h-11 flex items-center gap-1.5 px-3 py-1.5 border-b border-[#e6e9e4] bg-white/60 dark:bg-[#181d1b]/70 dark:border-[#2b332e] backdrop-blur-sm overflow-x-auto shrink-0">
          <draggable
            v-model="tags"
            item-key="path"
            :animation="200"
            :filter="'.no-drag'"
            @end="onDragEnd"
            class="flex items-center gap-1.5"
          >
            <template #item="{ element: tag }">
              <div
                :class="[
                  'h-7 flex items-center gap-1.5 px-3 rounded-full cursor-pointer shrink-0 transition-all text-[13px] select-none border',
                  tag.path === '/dashboard' ? 'no-drag' : '',
                  route.path === tag.path
                    ? 'bg-(--brand-tint) dark:bg-[rgb(var(--brand-soft-rgb)/0.14)] text-(--brand) dark:text-(--brand-glow) border-(--el-color-primary-light-8) dark:border-[rgb(var(--brand-soft-rgb)/0.25)] font-medium shadow-[0_1px_2px_rgb(var(--brand-rgb)/0.08)]'
                    : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-700 dark:hover:text-gray-200 hover:bg-[#f0f2ee] dark:hover:bg-[#252d28]'
                ]"
                @click="router.push(tag.path)"
                @contextmenu.prevent="onTagContextMenu($event, tag)"
              >
                <span
                  :class="[
                    'w-1.5 h-1.5 rounded-full shrink-0 transition-colors',
                    route.path === tag.path ? 'bg-(--brand-mid) dark:bg-(--brand-soft)' : 'bg-gray-300 dark:bg-[#3b463f]'
                  ]"
                />
                <span class="truncate max-w-[120px]">{{ tag.title }}</span>
                <!-- 锁定状态：显示锁图标 -->
                <el-icon v-if="tag.locked" :size="12" class="text-gray-400 shrink-0"><Lock /></el-icon>
                <!-- 未锁定且非首页：显示关闭按钮 -->
                <button
                  v-else-if="tag.path !== '/dashboard'"
                  @click.stop="removeTag(tag.path)"
                  class="w-4 h-4 flex items-center justify-center rounded-full text-gray-300 hover:text-gray-600 hover:bg-[#dcd6d0]/40 dark:hover:bg-[#333d37] shrink-0 transition-colors"
                >
                  <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            </template>
          </draggable>
        </div>

        <!-- 右键菜单 -->
        <div
          v-if="contextMenu.visible"
          class="fixed z-50 min-w-[140px] bg-white dark:bg-[#1f2522] rounded-md shadow-lg border border-[#e6e9e4] dark:border-[#2b332e] py-1 text-sm"
          :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
          @click.stop
        >
          <div
            :class="[
              'px-4 py-2 cursor-pointer hover:bg-[#f0f2ee] dark:hover:bg-[#2b332e]',
              (tags.find(t => t.path === contextMenu.targetPath)?.locked || contextMenu.targetPath === '/dashboard')
                ? 'text-gray-300 cursor-not-allowed hover:bg-transparent'
                : 'text-gray-700 dark:text-gray-200'
            ]"
            @click="closeCurrent(contextMenu.targetPath)"
          >
            关闭本页
          </div>
          <div
            class="px-4 py-2 cursor-pointer hover:bg-[#f0f2ee] dark:hover:bg-[#2b332e] text-gray-700 dark:text-gray-200"
            @click="closeLeft(contextMenu.targetPath)"
          >
            关闭左侧
          </div>
          <div
            class="px-4 py-2 cursor-pointer hover:bg-[#f0f2ee] dark:hover:bg-[#2b332e] text-gray-700 dark:text-gray-200"
            @click="closeRight(contextMenu.targetPath)"
          >
            关闭右侧
          </div>
          <div
            class="px-4 py-2 cursor-pointer hover:bg-[#f0f2ee] dark:hover:bg-[#2b332e] text-gray-700 dark:text-gray-200"
            @click="closeAll()"
          >
            关闭所有
          </div>
          <div
            v-if="contextMenu.targetPath !== '/dashboard'"
            class="px-4 py-2 cursor-pointer hover:bg-[#f0f2ee] dark:hover:bg-[#2b332e] text-gray-700 dark:text-gray-200 border-t border-[#e6e9e4] dark:border-[#2b332e]"
            @click="toggleLock(contextMenu.targetPath)"
          >
            {{ tags.find(t => t.path === contextMenu.targetPath)?.locked ? '解锁本页' : '锁定本页' }}
          </div>
        </div>

        <!-- 主内容（keep-alive 缓存页签组件实例：切换页签保留状态；max 限制内存，LRU 驱逐） -->
        <main class="flex-1 overflow-auto p-4 bg-transparent dark:bg-transparent">
          <router-view v-slot="{ Component }">
            <keep-alive :include="cachedViews" :max="MAX_CACHED_VIEWS">
              <component :is="Component" :key="route.path" />
            </keep-alive>
          </router-view>
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 折叠态下覆盖 SubMenu.vue 硬编码的 paddingLeft，使图标居中 */
:deep(.el-menu--collapse .el-menu-item) {
  padding-left: 0 !important;
  padding-right: 0 !important;
  margin: 0 auto !important;
  width: 100% !important;
  justify-content: center !important;
}
:deep(.el-menu--collapse .el-sub-menu__title) {
  padding-left: 0 !important;
  padding-right: 0 !important;
  margin: 0 auto !important;
  width: 100% !important;
  justify-content: center !important;
}
/* 折叠态下图标容器居中 */
:deep(.el-menu--collapse .el-menu-item .el-icon) {
  margin-right: 0 !important;
}
:deep(.el-menu--collapse .el-sub-menu__title .el-icon) {
  margin-right: 0 !important;
}
</style>