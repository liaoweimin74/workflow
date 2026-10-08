<template>
  <div class="process-center-page">
    <!-- 搜索栏 -->
    <el-card shadow="never" style="margin-bottom: 16px">
      <div class="search-bar">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索流程名称…"
          clearable
          :prefix-icon="Search"
          style="width: 320px"
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        />
        <el-button type="primary" @click="handleSearch">搜索</el-button>
      </div>
    </el-card>

    <!-- 流程列表 -->
    <el-card v-loading="loading" shadow="never">
      <template #header>
        <span style="font-weight: bold; font-size: 14px">流程中心</span>
      </template>

      <el-empty v-if="!loading && groupedProcesses.size === 0" description="暂无可发起的流程" :image-size="120" />

      <el-collapse v-else v-model="expandedCategories">
        <el-collapse-item
          v-for="[catId, processes] in groupedProcesses"
          :key="catId"
          :name="catId"
        >
          <template #title>
            <span class="category-title">{{ categoryName(catId) }}</span>
            <el-badge :value="processes.length" type="info" style="margin-left: 8px" />
          </template>

          <div class="card-grid">
            <el-card
              v-for="proc in processes"
              :key="proc.id"
              shadow="hover"
              class="process-card"
              @click="handleStart(proc)"
            >
              <div class="card-content">
                <el-icon class="card-icon"><Document /></el-icon>
                <div class="card-info">
                  <div class="card-title">{{ proc.name }}</div>
                  <div class="card-desc">{{ proc.description || '暂无描述' }}</div>
                  <div class="card-meta">
                    <el-tag size="small" type="info">v{{ proc.version }}</el-tag>
                  </div>
                </div>
                <el-button type="primary" size="small" class="start-btn">发起</el-button>
              </div>
            </el-card>
          </div>
        </el-collapse-item>
      </el-collapse>
    </el-card>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'ProcessCenter' })

import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Search, Document } from '@element-plus/icons-vue'
import { deployedProcessApi } from '@/api/processDefinition'
import { categoryApi } from '@/api/category'
import type { DeployedProcessDefinition } from '@/api/processDefinition'
import type { Category } from '@/api/category'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const loading = ref(false)
const searchKeyword = ref('')
const processes = ref<DeployedProcessDefinition[]>([])
const categories = ref<Category[]>([])
const expandedCategories = ref<string[]>([])

/**
 * 可发起人员范围过滤（Task 76，展示层）：SPECIFIED 时未命中名单/角色/管理员的流程
 * 不展示；引擎 start() 门禁是真闸门，此处仅隐藏入口。
 */
function startableByCurrentUser(proc: DeployedProcessDefinition): boolean {
  const scope = proc.starterScope
  if (!scope || scope.mode !== 'SPECIFIED') return true
  const user = authStore.user
  if (!user) return true
  if (user.username === 'admin') return true
  if (scope.userIds.includes(String(user.id))) return true
  if (scope.roleIds.length > 0 && (user.roles ?? []).some((code) => scope.roleIds.includes(code))) {
    return true
  }
  return false
}

// ── 按 categoryId 分组（Task 112：分类按 sortOrder 排序，未分类/未知命名空间沉底）──
const groupedProcesses = computed(() => {
  const map = new Map<string, DeployedProcessDefinition[]>()
  for (const proc of processes.value) {
    if (!startableByCurrentUser(proc)) continue
    const catId = proc.category || 'uncategorized'
    if (!map.has(catId)) map.set(catId, [])
    map.get(catId)!.push(proc)
  }
  // 已知分类按 sortOrder 升序；未分类与历史命名空间（非分类 id）
  // 永远排在已知分类之后，避免 URL 形态的分组抢首位
  const orderOf = (catId: string): number => {
    const cat = categories.value.find((c) => c.id === catId)
    return cat ? cat.sortOrder : Number.MAX_SAFE_INTEGER
  }
  return new Map(
    Array.from(map.entries()).sort((a, b) => {
      const diff = orderOf(a[0]) - orderOf(b[0])
      if (diff !== 0) return diff
      // 同为未知分类时按名字稳定排序，避免闪烁
      return categoryName(a[0]).localeCompare(categoryName(b[0]), 'zh-Hans-CN')
    }),
  )
})

/**
 * 只保留每个流程 key 的**最高版本**（同一流程部署多次后历史版本不重复展示，
 * 发起入口永远指向最新定义）。引擎 start() 本就按 key 解析最新已部署版本，
 * 前端去重后行为与引擎一致；客户端去重兼容双引擎（Java 侧无 latestOnly 参数）。
 */
function latestVersionsOnly(list: DeployedProcessDefinition[]): DeployedProcessDefinition[] {
  const latestByKey = new Map<string, DeployedProcessDefinition>()
  for (const proc of list) {
    const existing = latestByKey.get(proc.key)
    if (existing === undefined || proc.version > existing.version) {
      latestByKey.set(proc.key, proc)
    }
  }
  // 保持原有顺序（按首个出现的 key 位置），稳定且不打乱分组展示
  return list.filter((proc) => latestByKey.get(proc.key) === proc)
}

/**
 * Task 112：分组标题。分类 id 命中 categories → 显示分类名；
 * 未命中（'uncategorized' 或历史定义的 BPMN 命名空间如 http://flowable.org/bpmn）
 * → 统一归入「未分类」，不再把 URL 原样当分组标题展示。
 */
function categoryName(catId: string): string {
  if (catId === 'uncategorized') return '未分类'
  const cat = categories.value.find(c => c.id === catId)
  return cat?.name ?? '未分类'
}

// ── 加载数据 ──
async function loadData() {
  loading.value = true
  try {
    const [catRes, procRes] = await Promise.all([
      categoryApi.list(),
      deployedProcessApi.list({ status: 'active', size: 999 }),
    ])
    categories.value = catRes.data
    processes.value = latestVersionsOnly(procRes.data.content)
    // 默认展开所有分类
    expandedCategories.value = Array.from(groupedProcesses.value.keys())
  } catch {
    ElMessage.error('加载流程列表失败')
  } finally {
    loading.value = false
  }
}

// ── 搜索 ──
async function handleSearch() {
  loading.value = true
  try {
    const params: Record<string, unknown> = { status: 'active', size: 999 }
    if (searchKeyword.value.trim()) {
      params.name = searchKeyword.value.trim()
    }
    const res = await deployedProcessApi.list(params as Parameters<typeof deployedProcessApi.list>[0])
    processes.value = latestVersionsOnly(res.data.content)
    // 搜索时展开所有分类
    expandedCategories.value = Array.from(groupedProcesses.value.keys())
  } catch {
    ElMessage.error('搜索失败')
  } finally {
    loading.value = false
  }
}

// ── 发起流程 ──
function handleStart(proc: DeployedProcessDefinition) {
  router.push(`/process/start/${proc.id}`)
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.process-center-page {
  /* 对齐用户管理布局标准：高度撑满 main，底部留白由 main 的 p-4 唯一决定
     （原自带 16px padding 会叠加成 32px 且导致内容溢出滚动） */
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 搜索卡片固定高度，列表卡片接管剩余高度；空态/少量内容时底边也对齐标准位置 */
.process-center-page > :deep(.el-card) {
  flex-shrink: 0;
}
.process-center-page > :deep(.el-card:last-child) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.process-center-page > :deep(.el-card:last-child > .el-card__body) {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.search-bar {
  display: flex;
  gap: 8px;
  align-items: center;
}

.category-title {
  font-weight: 600;
  font-size: 14px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
  padding: 4px 0;
}

.process-card {
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: box-shadow 0.2s, border-color 0.2s, transform 0.2s;
}

/* 顶部青色条 hover 滑入 */
.process-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, #5755ee, #46c9d6);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.25s ease;
  z-index: 1;
}

.process-card:hover::before {
  transform: scaleX(1);
}

.process-card:hover {
  box-shadow: 0 4px 16px rgba(87, 85, 238, 0.12);
  border-color: #46c9d6;
  transform: translateY(-1px);
}

.card-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.card-icon {
  font-size: 32px;
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.card-info {
  flex: 1;
  min-width: 0;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 2px 0;
}

.card-meta {
  margin-top: 2px;
}

.start-btn {
  flex-shrink: 0;
}
</style>
