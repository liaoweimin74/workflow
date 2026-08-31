<template>
  <div class="process-todo-page">
    <el-card shadow="never">
      <el-tabs v-model="activeTab">
        <!-- ==================== 待办 Tab ==================== -->
        <el-tab-pane label="待办" name="todo">
          <SearchTable
            v-if="activeTab === 'todo'"
            :search-fields="todoSearchFields"
            :columns="todoColumns"
            :action-buttons="todoActionButtons"
            :fetch-api="todoFetchApi"
            :default-page-size="20"
            :page-sizes="[10, 20, 50]"
            :action-column-width="68"
            @row-dblclick="handleProcessTask"
          >
            <!-- 催办徽标列 -->
            <template #reminded="{ row }">
              <el-badge v-if="row.reminded" is-dot type="warning">
                <el-icon><Bell /></el-icon>
              </el-badge>
            </template>
          </SearchTable>
        </el-tab-pane>

        <!-- ==================== 已办 Tab ==================== -->
        <el-tab-pane label="已办" name="done">
          <SearchTable
            v-if="activeTab === 'done'"
            :search-fields="doneSearchFields"
            :columns="doneColumns"
            :action-buttons="doneActionButtons"
            :fetch-api="doneFetchApi"
            :default-page-size="20"
            :page-sizes="[10, 20, 50]"
            :action-column-width="68"
          >
            <!-- 审批结果列 -->
            <template #approveResult="{ row }">
              <el-tag :type="approveResultTagType(row.approveResult)" size="small">
                {{ approveResultLabel(row.approveResult) }}
              </el-tag>
            </template>
          </SearchTable>
        </el-tab-pane>

        <!-- ==================== 我发起的 Tab ==================== -->
        <el-tab-pane label="我发起的" name="initiated">
          <SearchTable
            v-if="activeTab === 'initiated'"
            :search-fields="initiatedSearchFields"
            :columns="initiatedColumns"
            :action-buttons="initiatedActionButtons"
            :fetch-api="initiatedFetchApi"
            :default-page-size="20"
            :page-sizes="[10, 20, 50]"
            :action-column-width="106"
          >
            <!-- 状态列 -->
            <template #instanceStatus="{ row }">
              <el-tag :type="instanceStatusTagType(row.status)" size="small">
                {{ instanceStatusLabel(row.status) }}
              </el-tag>
            </template>
          </SearchTable>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 流程跟踪 Drawer（我发起的） -->
    <ProcessTrackDrawer
      v-model="trackDrawerVisible"
      :process-instance-id="trackInstanceId"
      :title="trackTitle"
    />
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'ProcessTodo' })

import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Bell, Edit, View } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { taskApi } from '@/api/task'
import { taskRemindApi } from '@/api/taskRemind'
import { processInstanceApi } from '@/api/processInstance'
import type { TaskTodoVO, TaskDoneVO, TaskTodoQueryParams, TaskDoneQueryParams } from '@/api/task'
import type { ProcessInstanceVO, ProcessInstanceQueryParams } from '@/api/processInstance'
import { SearchTable, ProcessTrackDrawer } from '@/components/business'
import type { SearchField, TableColumn, ActionButton, QueryParams } from '@/components/business/types'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

// ── Tab 状态（支持从 query 切换） ──
const activeTab = ref<'todo' | 'done' | 'initiated'>(
  (route.query.tab as 'todo' | 'done' | 'initiated') || 'todo'
)

// ==================== 待办 ====================

const todoSearchFields: SearchField[] = [
  { type: 'input', label: '流程名称', prop: 'processName', placeholder: '流程名称', style: 'width: 200px' },
  { type: 'input', label: '发起人', prop: 'initiator', placeholder: '发起人', style: 'width: 160px' },
  { type: 'date-range', label: '接收时间', prop: 'createTime', time: true },
]

const todoColumns: TableColumn[] = [
  { prop: 'processName', label: '流程名称', minWidth: 160, showOverflowTooltip: true },
  { prop: 'businessKey', label: '编号', width: 140, showOverflowTooltip: true },
  { prop: 'initiatorName', label: '发起人', width: 100 },
  { prop: 'currentNodeName', label: '当前节点', width: 120, showOverflowTooltip: true },
  { prop: 'createTime', label: '接收时间', width: 170, formatter: (_r: any, _c: any, v: string) => formatDateTime(v) },
  { label: '催办', width: 60, align: 'center', slotName: 'reminded' },
]

const todoActionButtons: ActionButton[] = [
  { label: '处理', icon: Edit, onClick: handleProcessTask },
]

async function todoFetchApi(params: QueryParams): Promise<{ rows: TaskTodoVO[]; total: number }> {
  const p: TaskTodoQueryParams = {
    assignee: String(authStore.user?.id ?? ''),
    page: (params.page || 1) - 1,
    size: params.size || 20,
  }
  if (params.processName) p.processName = params.processName
  if (params.initiator) p.initiator = params.initiator
  if (Array.isArray(params.createTime)) {
    p.createTimeStart = params.createTime[0]
    p.createTimeEnd = params.createTime[1]
  }
  const res = await taskApi.listTodo(p)
  return { rows: res.data.content, total: res.data.totalElements }
}

function handleProcessTask(row: TaskTodoVO) {
  router.push(`/process/todo/${row.taskId}`)
}

// ==================== 已办 ====================

const doneSearchFields: SearchField[] = [
  { type: 'input', label: '流程名称', prop: 'processName', placeholder: '流程名称', style: 'width: 200px' },
  { type: 'input', label: '发起人', prop: 'initiator', placeholder: '发起人', style: 'width: 160px' },
  {
    type: 'select',
    label: '审批结果',
    prop: 'approveResult',
    placeholder: '审批结果',
    style: 'width: 140px',
    options: [
      { label: '通过', value: 'approve' },
      { label: '驳回', value: 'reject' },
      { label: '转办', value: 'transfer' },
      { label: '委派', value: 'delegate' },
    ],
  },
  { type: 'date-range', label: '处理时间', prop: 'endTime', time: true },
]

const doneColumns: TableColumn[] = [
  { prop: 'processName', label: '流程名称', minWidth: 160, showOverflowTooltip: true },
  { prop: 'businessKey', label: '编号', width: 140, showOverflowTooltip: true },
  { prop: 'initiatorName', label: '发起人', width: 100 },
  { prop: 'currentNodeName', label: '办理节点', width: 120, showOverflowTooltip: true },
  { prop: 'currentNode', label: '当前节点', width: 120, showOverflowTooltip: true, formatter: (_r: any, _c: any, v: string) => v || '—' },
  { prop: 'endTime', label: '处理时间', width: 170, formatter: (_r: any, _c: any, v: string) => formatDateTime(v) },
  { prop: 'approveResult', label: '审批结果', width: 100, align: 'center', slotName: 'approveResult' },
]

const doneActionButtons: ActionButton[] = [
  { label: '查看', icon: View, onClick: handleViewDone },
]

async function doneFetchApi(params: QueryParams): Promise<{ rows: TaskDoneVO[]; total: number }> {
  const p: TaskDoneQueryParams = {
    userId: String(authStore.user?.id ?? ''),
    page: (params.page || 1) - 1,
    size: params.size || 20,
  }
  if (params.processName) p.processName = params.processName
  if (params.initiator) p.initiator = params.initiator
  if (params.approveResult) p.approveResult = params.approveResult
  if (Array.isArray(params.endTime)) {
    p.endTimeStart = params.endTime[0]
    p.endTimeEnd = params.endTime[1]
  }
  const res = await taskApi.listHistoric(p)
  return { rows: res.data.content, total: res.data.totalElements }
}

function handleViewDone(row: TaskDoneVO) {
  router.push(`/process/todo/done/${row.taskId}`)
}

// ==================== 我发起的 ====================

const initiatedSearchFields: SearchField[] = [
  { type: 'input', label: '流程名称', prop: 'processName', placeholder: '流程名称', style: 'width: 200px' },
  {
    type: 'select',
    label: '状态',
    prop: 'status',
    placeholder: '状态',
    style: 'width: 140px',
    options: [
      { label: '进行中', value: 'running' },
      { label: '已挂起', value: 'suspended' },
      { label: '已结束', value: 'completed' },
    ],
  },
  { type: 'date-range', label: '发起时间', prop: 'startTime', time: true },
]

const initiatedColumns: TableColumn[] = [
  { prop: 'processDefinitionName', label: '流程名称', minWidth: 160, showOverflowTooltip: true },
  { prop: 'name', label: '标题', minWidth: 160, showOverflowTooltip: true },
  { prop: 'currentNode', label: '当前节点', width: 120, showOverflowTooltip: true, formatter: (_r: any, _c: any, v: string) => v || '—' },
  { prop: 'startTime', label: '发起时间', width: 170, formatter: (_r: any, _c: any, v: string) => formatDateTime(v) },
  { prop: 'status', label: '状态', width: 100, align: 'center', slotName: 'instanceStatus' },
]

const initiatedActionButtons: ActionButton[] = [
  { label: '跟踪', icon: View, onClick: handleTrack },
  {
    label: '催办',
    icon: Bell,
    type: 'warning',
    show: (row: ProcessInstanceVO) => row.status === 'running',
    onClick: handleInitiatedRemind,
  },
]

async function initiatedFetchApi(params: QueryParams): Promise<{ rows: ProcessInstanceVO[]; total: number }> {
  const p: ProcessInstanceQueryParams = {
    initiator: String(authStore.user?.id ?? ''),
    page: (params.page || 1) - 1,
    size: params.size || 20,
  }
  if (params.processName) p.processName = params.processName
  if (params.status) p.status = params.status
  // 时间范围：后端 ProcessInstanceQueryParams 未支持，保持现状不传
  const res = await processInstanceApi.listHistory(p)
  return { rows: res.data.content, total: res.data.totalElements }
}

async function handleInitiatedRemind(row: ProcessInstanceVO) {
  try {
    await taskRemindApi.remindByInstance(row.id)
    ElMessage.success('催办通知已发送')
  } catch (err: any) {
    const msg = err?.response?.data?.msg ?? err?.message ?? ''
    if (msg.includes('24') || msg.includes('频率') || msg.includes('frequency')) {
      ElMessage.warning('催办频率限制：24小时内已催办过，请稍后再试')
    } else {
      ElMessage.error('催办失败')
    }
  }
}

// ── 我发起的：流程跟踪抽屉 ──
const trackDrawerVisible = ref(false)
const trackInstanceId = ref('')
const trackTitle = ref('流程跟踪')

function handleTrack(row: ProcessInstanceVO) {
  trackInstanceId.value = row.id
  trackTitle.value = `流程跟踪 — ${row.processDefinitionName ?? ''}`
  trackDrawerVisible.value = true
}

// ── 工具函数 ──
function formatDateTime(dt: string): string {
  if (!dt) return ''
  return dt.replace('T', ' ').slice(0, 19)
}

function approveResultLabel(result: string): string {
  const map: Record<string, string> = {
    submit: '提交',
    approve: '通过',
    complete: '通过',
    reject: '驳回',
    refuse: '拒绝',
    transfer: '转办',
    delegate: '委派',
  }
  return map[result] ?? result
}

function approveResultTagType(result: string): 'success' | 'danger' | 'warning' | 'info' {
  const map: Record<string, 'success' | 'danger' | 'warning' | 'info'> = {
    submit: 'info',
    approve: 'success',
    complete: 'success',
    reject: 'danger',
    refuse: 'danger',
    transfer: 'warning',
    delegate: 'info',
  }
  return map[result] ?? 'info'
}

function instanceStatusLabel(status: string): string {
  const map: Record<string, string> = {
    running: '进行中',
    suspended: '已挂起',
    completed: '已结束',
  }
  return map[status] ?? status
}

function instanceStatusTagType(status: string): 'primary' | 'warning' | 'info' {
  const map: Record<string, 'primary' | 'warning' | 'info'> = {
    running: 'primary',
    suspended: 'warning',
    completed: 'info',
  }
  return map[status] ?? 'info'
}
</script>

<style scoped>
.process-todo-page {
  padding: 16px;
}
</style>
