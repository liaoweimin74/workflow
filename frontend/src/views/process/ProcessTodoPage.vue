<template>
  <div class="process-todo-page">
    <el-card shadow="never">
      <el-tabs v-model="activeTab" @tab-change="handleTabChange">
        <!-- ==================== 待办 Tab ==================== -->
        <el-tab-pane label="待办" name="todo">
          <div class="filter-bar">
            <el-input
              v-model="todoFilter.processName"
              placeholder="流程名称"
              clearable
              style="width: 200px"
              @keyup.enter="loadTodo"
            />
            <el-input
              v-model="todoFilter.initiator"
              placeholder="发起人"
              clearable
              style="width: 160px"
              @keyup.enter="loadTodo"
            />
            <el-date-picker
              v-model="todoFilter.dateRange"
              type="datetimerange"
              range-separator="至"
              start-placeholder="接收开始"
              end-placeholder="接收结束"
              value-format="YYYY-MM-DD HH:mm:ss"
              style="width: 380px"
            />
            <el-button type="primary" @click="loadTodo">查询</el-button>
            <el-button @click="resetTodoFilter">重置</el-button>
          </div>

          <el-table
            v-loading="todoLoading"
            :data="todoData"
            stripe
            border
            style="width: 100%"
            @row-dblclick="handleProcessTask"
          >
            <el-table-column prop="processName" label="流程名称" min-width="160" show-overflow-tooltip />
            <el-table-column prop="businessKey" label="编号" width="140" show-overflow-tooltip />
            <el-table-column prop="initiatorName" label="发起人" width="100" />
            <el-table-column prop="currentNodeName" label="当前节点" width="120" show-overflow-tooltip />
            <el-table-column prop="createTime" label="接收时间" width="170">
              <template #default="{ row }">
                <span :class="{ 'font-bold': !row.reminded }">{{ formatDateTime(row.createTime) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="催办" width="60" align="center">
              <template #default="{ row }">
                <el-badge v-if="row.reminded" is-dot type="warning">
                  <el-icon><Bell /></el-icon>
                </el-badge>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="140" fixed="right" align="center">
              <template #default="{ row }">
                <el-button type="primary" link @click="handleProcessTask(row)">处理</el-button>
                <el-button type="warning" link @click="handleRemind(row)">催办</el-button>
              </template>
            </el-table-column>
          </el-table>

          <el-pagination
            v-model:current-page="todoPage"
            v-model:page-size="todoSize"
            :total="todoTotal"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            style="margin-top: 12px; justify-content: flex-end"
            @size-change="loadTodo"
            @current-change="loadTodo"
          />
        </el-tab-pane>

        <!-- ==================== 已办 Tab ==================== -->
        <el-tab-pane label="已办" name="done">
          <div class="filter-bar">
            <el-input
              v-model="doneFilter.processName"
              placeholder="流程名称"
              clearable
              style="width: 200px"
              @keyup.enter="loadDone"
            />
            <el-input
              v-model="doneFilter.initiator"
              placeholder="发起人"
              clearable
              style="width: 160px"
              @keyup.enter="loadDone"
            />
            <el-select
              v-model="doneFilter.approveResult"
              placeholder="审批结果"
              clearable
              style="width: 140px"
            >
              <el-option label="通过" value="approve" />
              <el-option label="驳回" value="reject" />
              <el-option label="转办" value="transfer" />
              <el-option label="委派" value="delegate" />
            </el-select>
            <el-date-picker
              v-model="doneFilter.dateRange"
              type="datetimerange"
              range-separator="至"
              start-placeholder="处理开始"
              end-placeholder="处理结束"
              value-format="YYYY-MM-DD HH:mm:ss"
              style="width: 380px"
            />
            <el-button type="primary" @click="loadDone">查询</el-button>
            <el-button @click="resetDoneFilter">重置</el-button>
          </div>

          <el-table
            v-loading="doneLoading"
            :data="doneData"
            stripe
            border
            style="width: 100%"
          >
            <el-table-column prop="processName" label="流程名称" min-width="160" show-overflow-tooltip />
            <el-table-column prop="businessKey" label="编号" width="140" show-overflow-tooltip />
            <el-table-column prop="initiatorName" label="发起人" width="100" />
            <el-table-column prop="currentNodeName" label="处理节点" width="120" show-overflow-tooltip />
            <el-table-column prop="endTime" label="处理时间" width="170">
              <template #default="{ row }">{{ formatDateTime(row.endTime) }}</template>
            </el-table-column>
            <el-table-column prop="approveResult" label="审批结果" width="100" align="center">
              <template #default="{ row }">
                <el-tag :type="approveResultTagType(row.approveResult)" size="small">
                  {{ approveResultLabel(row.approveResult) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right" align="center">
              <template #default="{ row }">
                <el-button type="primary" link @click="handleViewDone(row)">查看</el-button>
              </template>
            </el-table-column>
          </el-table>

          <el-pagination
            v-model:current-page="donePage"
            v-model:page-size="doneSize"
            :total="doneTotal"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            style="margin-top: 12px; justify-content: flex-end"
            @size-change="loadDone"
            @current-change="loadDone"
          />
        </el-tab-pane>

        <!-- ==================== 我发起的 Tab ==================== -->
        <el-tab-pane label="我发起的" name="initiated">
          <div class="filter-bar">
            <el-input
              v-model="initiatedFilter.processName"
              placeholder="流程名称"
              clearable
              style="width: 200px"
              @keyup.enter="loadInitiated"
            />
            <el-select
              v-model="initiatedFilter.status"
              placeholder="状态"
              clearable
              style="width: 140px"
            >
              <el-option label="进行中" value="running" />
              <el-option label="已挂起" value="suspended" />
              <el-option label="已结束" value="completed" />
            </el-select>
            <el-date-picker
              v-model="initiatedFilter.dateRange"
              type="datetimerange"
              range-separator="至"
              start-placeholder="发起开始"
              end-placeholder="发起结束"
              value-format="YYYY-MM-DD HH:mm:ss"
              style="width: 380px"
            />
            <el-button type="primary" @click="loadInitiated">查询</el-button>
            <el-button @click="resetInitiatedFilter">重置</el-button>
          </div>

          <el-table
            v-loading="initiatedLoading"
            :data="initiatedData"
            stripe
            border
            style="width: 100%"
          >
            <el-table-column prop="processDefinitionName" label="流程名称" min-width="160" show-overflow-tooltip />
            <el-table-column prop="id" label="实例编号" width="180" show-overflow-tooltip />
            <el-table-column prop="currentNode" label="当前节点" width="120" show-overflow-tooltip />
            <el-table-column prop="status" label="状态" width="100" align="center">
              <template #default="{ row }">
                <el-tag :type="instanceStatusTagType(row.status)" size="small">
                  {{ instanceStatusLabel(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right" align="center">
              <template #default="{ row }">
                <el-button type="primary" link @click="handleTrack(row)">跟踪</el-button>
              </template>
            </el-table-column>
          </el-table>

          <el-pagination
            v-model:current-page="initiatedPage"
            v-model:page-size="initiatedSize"
            :total="initiatedTotal"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            style="margin-top: 12px; justify-content: flex-end"
            @size-change="loadInitiated"
            @current-change="loadInitiated"
          />
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Bell } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { taskApi } from '@/api/task'
import { taskRemindApi } from '@/api/taskRemind'
import { processInstanceApi } from '@/api/processInstance'
import type { TaskTodoVO, TaskDoneVO, TaskTodoQueryParams, TaskDoneQueryParams } from '@/api/task'
import type { ProcessInstanceVO, ProcessInstanceQueryParams } from '@/api/processInstance'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

// ── Tab 状态（支持从 query 切换） ──
const activeTab = ref<'todo' | 'done' | 'initiated'>(
  (route.query.tab as 'todo' | 'done' | 'initiated') || 'todo'
)

// ── 待办 ──
const todoLoading = ref(false)
const todoData = ref<TaskTodoVO[]>([])
const todoPage = ref(1)
const todoSize = ref(20)
const todoTotal = ref(0)
const todoFilter = reactive({
  processName: '',
  initiator: '',
  dateRange: null as [string, string] | null,
})
const todoLoaded = ref(false)

async function loadTodo() {
  todoLoading.value = true
  try {
    const params: TaskTodoQueryParams = {
      assignee: String(authStore.user?.id ?? ''),
      page: todoPage.value - 1,
      size: todoSize.value,
    }
    if (todoFilter.processName) params.processName = todoFilter.processName
    if (todoFilter.initiator) params.initiator = todoFilter.initiator
    if (todoFilter.dateRange) {
      params.createTimeStart = todoFilter.dateRange[0]
      params.createTimeEnd = todoFilter.dateRange[1]
    }
    const res = await taskApi.listTodo(params)
    todoData.value = res.data.content
    todoTotal.value = res.data.totalElements
    todoLoaded.value = true
  } catch (e) {
    ElMessage.error('加载待办列表失败')
  } finally {
    todoLoading.value = false
  }
}

function resetTodoFilter() {
  todoFilter.processName = ''
  todoFilter.initiator = ''
  todoFilter.dateRange = null
  todoPage.value = 1
  loadTodo()
}

async function handleRemind(row: TaskTodoVO) {
  try {
    await taskRemindApi.remind(row.taskId)
    ElMessage.success('催办成功')
    loadTodo()
  } catch {
    ElMessage.error('催办失败，可能距离上次催办不足 24 小时')
  }
}

function handleProcessTask(row: TaskTodoVO) {
  router.push(`/process/todo/${row.taskId}`)
}

// ── 已办 ──
const doneLoading = ref(false)
const doneData = ref<TaskDoneVO[]>([])
const donePage = ref(1)
const doneSize = ref(20)
const doneTotal = ref(0)
const doneFilter = reactive({
  processName: '',
  initiator: '',
  approveResult: '',
  dateRange: null as [string, string] | null,
})
const doneLoaded = ref(false)

async function loadDone() {
  doneLoading.value = true
  try {
    const params: TaskDoneQueryParams = {
      userId: String(authStore.user?.id ?? ''),
      page: donePage.value - 1,
      size: doneSize.value,
    }
    if (doneFilter.processName) params.processName = doneFilter.processName
    if (doneFilter.initiator) params.initiator = doneFilter.initiator
    if (doneFilter.approveResult) params.approveResult = doneFilter.approveResult
    if (doneFilter.dateRange) {
      params.endTimeStart = doneFilter.dateRange[0]
      params.endTimeEnd = doneFilter.dateRange[1]
    }
    const res = await taskApi.listHistoric(params)
    doneData.value = res.data.content
    doneTotal.value = res.data.totalElements
    doneLoaded.value = true
  } catch {
    ElMessage.error('加载已办列表失败')
  } finally {
    doneLoading.value = false
  }
}

function resetDoneFilter() {
  doneFilter.processName = ''
  doneFilter.initiator = ''
  doneFilter.approveResult = ''
  doneFilter.dateRange = null
  donePage.value = 1
  loadDone()
}

function handleViewDone(row: TaskDoneVO) {
  router.push(`/process/todo/done/${row.taskId}`)
}

// ── 我发起的 ──
const initiatedLoading = ref(false)
const initiatedData = ref<ProcessInstanceVO[]>([])
const initiatedPage = ref(1)
const initiatedSize = ref(20)
const initiatedTotal = ref(0)
const initiatedFilter = reactive({
  processName: '',
  status: '',
  dateRange: null as [string, string] | null,
})
const initiatedLoaded = ref(false)

async function loadInitiated() {
  initiatedLoading.value = true
  try {
    const params: ProcessInstanceQueryParams = {
      initiator: String(authStore.user?.id ?? ''),
      page: initiatedPage.value - 1,
      size: initiatedSize.value,
    }
    if (initiatedFilter.processName) params.processName = initiatedFilter.processName
    if (initiatedFilter.status) params.status = initiatedFilter.status
    const res = await processInstanceApi.list(params)
    initiatedData.value = res.data.content
    initiatedTotal.value = res.data.totalElements
    initiatedLoaded.value = true
  } catch {
    ElMessage.error('加载发起列表失败')
  } finally {
    initiatedLoading.value = false
  }
}

function resetInitiatedFilter() {
  initiatedFilter.processName = ''
  initiatedFilter.status = ''
  initiatedFilter.dateRange = null
  initiatedPage.value = 1
  loadInitiated()
}

function handleTrack(row: ProcessInstanceVO) {
  router.push(`/process/instance/${row.id}`)
}

// ── Tab 切换懒加载 ──
function handleTabChange(name: string | number) {
  const tab = name as 'todo' | 'done' | 'initiated'
  if (tab === 'done' && !doneLoaded.value) loadDone()
  else if (tab === 'initiated' && !initiatedLoaded.value) loadInitiated()
}

// ── 工具函数 ──
function formatDateTime(dt: string): string {
  if (!dt) return ''
  return dt.replace('T', ' ').slice(0, 19)
}

function approveResultLabel(result: string): string {
  const map: Record<string, string> = {
    approve: '通过',
    reject: '驳回',
    transfer: '转办',
    delegate: '委派',
  }
  return map[result] ?? result
}

function approveResultTagType(result: string): 'success' | 'danger' | 'warning' | 'info' {
  const map: Record<string, 'success' | 'danger' | 'warning' | 'info'> = {
    approve: 'success',
    reject: 'danger',
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

// ── 初始化 ──
onMounted(() => {
  loadTodo()
})
</script>

<style scoped>
.process-todo-page {
  padding: 16px;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
  align-items: center;
}

.font-bold {
  font-weight: bold;
}
</style>
