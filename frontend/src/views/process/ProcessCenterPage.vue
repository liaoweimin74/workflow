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

const router = useRouter()

const loading = ref(false)
const searchKeyword = ref('')
const processes = ref<DeployedProcessDefinition[]>([])
const categories = ref<Category[]>([])
const expandedCategories = ref<string[]>([])

// ── 按 categoryId 分组 ──
const groupedProcesses = computed(() => {
  const map = new Map<string, DeployedProcessDefinition[]>()
  for (const proc of processes.value) {
    const catId = proc.category || 'uncategorized'
    if (!map.has(catId)) map.set(catId, [])
    map.get(catId)!.push(proc)
  }
  return map
})

function categoryName(catId: string): string {
  if (catId === 'uncategorized') return '未分类'
  const cat = categories.value.find(c => c.id === catId)
  return cat?.name ?? catId
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
    processes.value = procRes.data.content
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
    processes.value = res.data.content
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
  padding: 16px;
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
  transition: box-shadow 0.2s;
}

.process-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
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
