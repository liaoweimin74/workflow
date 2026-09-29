<template>
  <div class="process-draft-box-page">
    <!-- 搜索栏 -->
    <el-card shadow="never" style="margin-bottom: 16px">
      <div class="search-bar">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索流程名称 / 表单名称…"
          clearable
          :prefix-icon="Search"
          style="width: 320px"
        />
        <span class="draft-count">共 {{ filteredDrafts.length }} 条草稿</span>
      </div>
    </el-card>

    <!-- 草稿列表 -->
    <el-card v-loading="loading" shadow="never">
      <template #header>
        <div class="card-header">
          <span style="font-weight: bold; font-size: 14px">草稿箱</span>
          <el-tooltip content="在发起流程时点击「保存草稿」，未提交的表单数据会保存在这里" placement="top">
            <el-icon class="help-icon"><QuestionFilled /></el-icon>
          </el-tooltip>
        </div>
      </template>

      <el-empty
        v-if="!loading && filteredDrafts.length === 0"
        :description="searchKeyword ? '没有匹配的草稿' : '暂无流程草稿'"
        :image-size="120"
      />

      <el-table v-else :data="filteredDrafts" style="width: 100%">
        <el-table-column label="流程名称" min-width="200">
          <template #default="{ row }">
            <div class="process-cell">
              <el-icon class="process-icon"><Document /></el-icon>
              <div class="process-info">
                <div class="process-name">
                  {{ row.processName || '未知流程' }}
                  <el-tag v-if="row.processVersion" size="small" type="info" style="margin-left: 4px">
                    v{{ row.processVersion }}
                  </el-tag>
                  <el-tag v-if="!row.processDefId" size="small" type="warning" style="margin-left: 4px">
                    流程已下线
                  </el-tag>
                </div>
                <div class="process-sub">{{ row.processKey || row.formDefId }}</div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="发起表单" min-width="140">
          <template #default="{ row }">
            {{ row.formName || '—' }}
          </template>
        </el-table-column>

        <el-table-column label="草稿内容" min-width="220">
          <template #default="{ row }">
            <span v-if="draftSummary(row)" class="draft-summary">{{ draftSummary(row) }}</span>
            <span v-else class="draft-empty">（空表单）</span>
          </template>
        </el-table-column>

        <el-table-column label="最后保存" width="170">
          <template #default="{ row }">
            {{ formatTime(row.updatedAt) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-tooltip
              :disabled="!!row.processDefId"
              content="该流程已下线或停用，无法继续填写"
              placement="top"
            >
              <span>
                <el-button
                  type="primary"
                  link
                  size="small"
                  :disabled="!row.processDefId"
                  @click="handleContinue(row)"
                >
                  继续填写
                </el-button>
              </span>
            </el-tooltip>
            <el-button type="danger" link size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'ProcessDraftBox' })

import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Document, QuestionFilled } from '@element-plus/icons-vue'
import { formApi } from '@/api/form'
import type { ProcessDraftBoxItem } from '@/api/form'

const router = useRouter()

const loading = ref(false)
const searchKeyword = ref('')
const drafts = ref<ProcessDraftBoxItem[]>([])

const filteredDrafts = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  if (!kw) return drafts.value
  return drafts.value.filter(
    (d) =>
      (d.processName ?? '').toLowerCase().includes(kw) ||
      (d.formName ?? '').toLowerCase().includes(kw) ||
      (d.processKey ?? '').toLowerCase().includes(kw),
  )
})

/** 草稿内容摘要：取前 3 个非空字段的「值」拼接（草稿箱预览用，不做字段名翻译） */
function draftSummary(row: ProcessDraftBoxItem): string {
  if (!row.dataJson) return ''
  let data: Record<string, unknown>
  try {
    data = JSON.parse(row.dataJson) as Record<string, unknown>
  } catch {
    return ''
  }
  const parts: string[] = []
  for (const [key, value] of Object.entries(data)) {
    if (parts.length >= 3) break
    if (value === null || value === undefined || value === '') continue
    const text = Array.isArray(value)
      ? value.filter((v) => v !== null && v !== undefined && v !== '').join('、')
      : String(value)
    if (text === '') continue
    parts.push(`${key}: ${text.length > 24 ? text.slice(0, 24) + '…' : text}`)
  }
  return parts.join('；')
}

function formatTime(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const pad = (n: number) => (n < 10 ? '0' + n : String(n))
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

// ── 加载草稿 ──
async function loadData() {
  loading.value = true
  try {
    const res = await formApi.listDrafts()
    drafts.value = res.data ?? []
  } catch {
    ElMessage.error('加载草稿列表失败')
  } finally {
    loading.value = false
  }
}

// ── 继续填写：跳到发起页（发起页会自动回填草稿） ──
function handleContinue(row: ProcessDraftBoxItem) {
  if (!row.processDefId) return
  router.push(`/process/start/${row.processDefId}`)
}

// ── 删除草稿 ──
async function handleDelete(row: ProcessDraftBoxItem) {
  const name = row.processName || row.formName || '该草稿'
  try {
    await ElMessageBox.confirm(`确定删除「${name}」的草稿吗？删除后不可恢复。`, '删除草稿', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return // 用户取消
  }
  try {
    await formApi.deleteDraft(row.id)
    ElMessage.success('草稿已删除')
    await loadData()
  } catch {
    // 拦截器已 toast 具体错误（如草稿不存在或无权删除）
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.process-draft-box-page {
  /* 对齐流程中心布局标准：高度撑满 main，列表卡片接管剩余高度 */
  height: 100%;
  display: flex;
  flex-direction: column;
}

.process-draft-box-page > :deep(.el-card) {
  flex-shrink: 0;
}
.process-draft-box-page > :deep(.el-card:last-child) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.process-draft-box-page > :deep(.el-card:last-child > .el-card__body) {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.search-bar {
  display: flex;
  gap: 12px;
  align-items: center;
}

.draft-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.help-icon {
  color: var(--el-text-color-secondary);
  cursor: help;
}

.process-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.process-icon {
  font-size: 24px;
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.process-info {
  min-width: 0;
}

.process-name {
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
}

.process-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.draft-summary {
  font-size: 12px;
  color: var(--el-text-color-regular);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.draft-empty {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
