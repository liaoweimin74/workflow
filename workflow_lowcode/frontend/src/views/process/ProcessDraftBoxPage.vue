<template>
  <!--
    草稿箱（Task 94 重构）：对齐全站列表页范式，改用业务组件 SearchTable 承载
    搜索栏 / 表格 / 分页 / 操作列，页面自身只负责：
    ① fetchApi 适配（后端全量返回 → 客户端关键字过滤 + 分页切片）
    ② 列渲染（render 函数输出流程名/版本标签/摘要）
    ③ 行操作（继续填写 / 删除）
  -->
  <SearchTable
    ref="tableRef"
    :search-fields="searchFields"
    :columns="columns"
    :action-buttons="actionButtons"
    :fetch-api="fetchApi"
    :default-page-size="10"
    :page-sizes="[10, 20, 50]"
  >
    <!-- 工具栏左侧：功能说明 -->
    <span class="pdb-hint">
      <el-icon class="pdb-hint-icon"><QuestionFilled /></el-icon>
      <span>发起流程时点击「保存草稿」，未提交的表单数据会保存在这里</span>
    </span>
  </SearchTable>
</template>

<script setup lang="ts">
defineOptions({ name: 'ProcessDraftBox' })

import { ref, h } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, ElIcon, ElTag } from 'element-plus'
import { Document, QuestionFilled } from '@element-plus/icons-vue'
import { SearchTable } from '@/components/business'
import type { SearchField, TableColumn, ActionButton, QueryParams } from '@/components/business/types'
import { formApi } from '@/api/form'
import type { ProcessDraftBoxItem } from '@/api/form'

const router = useRouter()

const tableRef = ref<InstanceType<typeof SearchTable> | null>(null)

// ── 搜索字段：关键字走客户端过滤（草稿为本人全量小数据集，无后端分页接口） ──
const searchFields: SearchField[] = [
  {
    type: 'input',
    label: '关键字',
    prop: 'keyword',
    placeholder: '搜索流程名称 / 表单名称…',
    style: 'width: 260px',
  },
]

// ── fetchApi 适配：listDrafts 全量返回 → 过滤 → 分页切片 ──
async function fetchApi(
  params: QueryParams,
): Promise<{ rows: ProcessDraftBoxItem[]; total: number }> {
  let all: ProcessDraftBoxItem[] = []
  try {
    const res = await formApi.listDrafts()
    all = res.data ?? []
  } catch {
    ElMessage.error('加载草稿列表失败')
    return { rows: [], total: 0 }
  }

  const kw = String(params.keyword ?? '').trim().toLowerCase()
  const filtered = kw
    ? all.filter((d) =>
        [d.processName, d.formName, d.processKey].some((v) =>
          (v ?? '').toLowerCase().includes(kw),
        ),
      )
    : all

  const page = Number(params.page) || 1
  const size = Number(params.size) || 10
  const start = (page - 1) * size
  return { rows: filtered.slice(start, start + size), total: filtered.length }
}

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

// ── 列定义 ──
const columns: TableColumn[] = [
  {
    label: '流程名称',
    minWidth: 220,
    render: (row: ProcessDraftBoxItem) =>
      h('div', { class: 'pdb-process-cell' }, [
        h(ElIcon, { class: 'pdb-process-icon', size: 22 }, () => h(Document)),
        h('div', { class: 'pdb-process-info' }, [
          h('div', { class: 'pdb-process-name' }, [
            h('span', row.processName || '未知流程'),
            row.processVersion
              ? h(
                  ElTag,
                  { size: 'small', type: 'info', style: 'margin-left: 6px' },
                  () => `v${row.processVersion}`,
                )
              : null,
            !row.processDefId
              ? h(
                  ElTag,
                  { size: 'small', type: 'warning', style: 'margin-left: 6px' },
                  () => '流程已下线',
                )
              : null,
          ]),
          h('div', { class: 'pdb-process-sub' }, row.processKey || row.formDefId),
        ]),
      ]),
  },
  {
    prop: 'formName',
    label: '发起表单',
    minWidth: 140,
    formatter: (row: ProcessDraftBoxItem) => row.formName || '—',
  },
  {
    label: '草稿内容',
    minWidth: 240,
    showOverflowTooltip: true,
    render: (row: ProcessDraftBoxItem) => draftSummary(row) || '（空表单）',
  },
  {
    prop: 'updatedAt',
    label: '最后保存',
    width: 170,
    formatter: (row: ProcessDraftBoxItem) => formatTime(row.updatedAt),
  },
]

// ── 行操作 ──
const actionButtons: ActionButton[] = [
  {
    label: '继续填写',
    type: 'primary',
    // 已下线/停用/解绑的流程（processDefId=null）不可继续填写，仅保留删除
    show: (row: ProcessDraftBoxItem) => !!row.processDefId,
    onClick: (row: ProcessDraftBoxItem) => {
      if (!row.processDefId) return
      router.push(`/process/start/${row.processDefId}`)
    },
  },
  {
    label: '删除',
    type: 'danger',
    onClick: (row: ProcessDraftBoxItem) => handleDelete(row),
  },
]

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
    tableRef.value?.fetchList()
  } catch {
    // 拦截器已 toast 具体错误（如草稿不存在或无权删除）
  }
}
</script>

<style>
/* render 函数输出的单元格在 SearchTable 内部渲染，作用域样式不可达，用 pdb- 前缀防污染 */
.pdb-process-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pdb-process-icon {
  color: var(--el-color-primary);
  flex-shrink: 0;
}
.pdb-process-info {
  min-width: 0;
}
.pdb-process-name {
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
}
.pdb-process-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pdb-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.pdb-hint .pdb-hint-icon {
  color: var(--el-text-color-secondary);
}
</style>
