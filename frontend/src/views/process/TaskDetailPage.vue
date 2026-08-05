<template>
  <div class="task-detail-page">
    <el-page-header @back="router.back()">
      <template #content>
        <span class="header-title">任务处理 — {{ taskDetail?.processName ?? '加载中…' }}</span>
      </template>
      <template #extra>
        <el-button @click="trackingDrawer = true">
          <el-icon><View /></el-icon>
          流程跟踪
        </el-button>
      </template>
    </el-page-header>

    <div v-loading="loading" class="detail-body">
      <!-- 顶部：流程基本信息 -->
      <el-card shadow="never" style="margin-top: 16px">
        <template #header><span style="font-weight: bold">流程基本信息</span></template>
        <el-descriptions :column="3" border size="small">
          <el-descriptions-item label="流程名称">{{ taskDetail?.processName }}</el-descriptions-item>
          <el-descriptions-item label="流程编号">{{ taskDetail?.businessKey || '—' }}</el-descriptions-item>
          <el-descriptions-item label="当前节点">{{ taskDetail?.name }}</el-descriptions-item>
          <el-descriptions-item label="发起人">{{ taskDetail?.initiatorName || taskDetail?.initiator }}</el-descriptions-item>
          <el-descriptions-item label="接收时间">{{ formatDateTime(taskDetail?.createTime) }}</el-descriptions-item>
          <el-descriptions-item label="办理人">{{ taskDetail?.assignee }}</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- 中部：审批表单 -->
      <el-card shadow="never" style="margin-top: 16px">
        <template #header><span style="font-weight: bold">审批表单</span></template>
        <template v-if="taskDetail?.formKey">
          <FormRenderer
            ref="formRendererRef"
            :form-def-id="taskDetail.formKey"
            :process-instance-id="taskDetail.processInstanceId"
            :task-id="taskDetail.taskId"
          />
        </template>
        <template v-else>
          <el-descriptions :column="2" border size="small" title="流程变量">
            <el-descriptions-item
              v-for="(value, key) in taskDetail?.variables"
              :key="key"
              :label="String(key)"
            >
              {{ formatValue(value) }}
            </el-descriptions-item>
          </el-descriptions>
        </template>
      </el-card>

      <!-- 底部：审批意见 + 操作按钮 -->
      <el-card shadow="never" style="margin-top: 16px">
        <template #header><span style="font-weight: bold">审批意见</span></template>
        <el-input
          v-model="comment"
          type="textarea"
          :rows="3"
          placeholder="请输入审批意见…"
          maxlength="500"
          show-word-limit
        />
        <div class="action-bar">
          <el-button type="success" :loading="actionLoading === 'approve'" @click="handleApprove">
            通过
          </el-button>
          <el-button type="danger" :loading="actionLoading === 'reject'" @click="handleReject">
            驳回
          </el-button>
          <el-dropdown trigger="click" @command="handleMoreAction">
            <el-button>
              更多操作<el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="transfer">转办</el-dropdown-item>
                <el-dropdown-item command="delegate">委派</el-dropdown-item>
                <el-dropdown-item command="addSign">加签</el-dropdown-item>
                <el-dropdown-item command="forwardSign">转签</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-card>
    </div>

    <!-- 右侧流程跟踪 Drawer -->
    <el-drawer v-model="trackingDrawer" title="流程跟踪" size="50%">
      <div class="tracking-content">
        <el-card shadow="never" style="margin-bottom: 16px">
          <template #header><span style="font-weight: bold">流程图</span></template>
          <div class="bpmn-container">
            <BpmnViewer
              v-if="bpmnXml"
              :xml="bpmnXml"
              :highlights="highlightIds"
            />
          </div>
        </el-card>
        <el-card shadow="never">
          <template #header><span style="font-weight: bold">审批记录</span></template>
          <ApprovalTimeline :records="approvalRecords" />
        </el-card>
      </div>
    </el-drawer>

    <!-- 转办/委派/转签 对话框（单选用户） -->
    <el-dialog v-model="singleUserDialog.visible" :title="singleUserDialog.title" width="400px">
      <UserPicker v-model="singleUserDialog.userId" placeholder="选择用户" />
      <template #footer>
        <el-button @click="singleUserDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="actionLoading === singleUserDialog.action" @click="confirmSingleUser">
          确认
        </el-button>
      </template>
    </el-dialog>

    <!-- 加签 对话框（多选用户） -->
    <el-dialog v-model="addSignDialog.visible" title="加签 — 选择用户" width="400px">
      <UserPicker v-model="addSignDialog.users" multiple placeholder="选择多个用户" />
      <template #footer>
        <el-button @click="addSignDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="actionLoading === 'addSign'" @click="confirmAddSign">
          确认
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { View, ArrowDown } from '@element-plus/icons-vue'
import { taskApi } from '@/api/task'
import { processInstanceApi } from '@/api/processInstance'
import { deployedProcessApi } from '@/api/processDefinition'
import type { TaskDetailVO, ApprovalRecordVO } from '@/api/task'
import FormRenderer from '@/views/form/components/FormRenderer.vue'
import { BpmnViewer, ApprovalTimeline, UserPicker } from '@/components/business'

const route = useRoute()
const router = useRouter()
const taskId = route.params.taskId as string

const loading = ref(true)
const taskDetail = ref<TaskDetailVO | null>(null)
const comment = ref('')
const actionLoading = ref<string | null>(null)

// 流程跟踪
const trackingDrawer = ref(false)
const bpmnXml = ref('')
const highlightIds = ref<string[]>([])
const approvalRecords = ref<ApprovalRecordVO[]>([])

// 对话框
const singleUserDialog = ref({
  visible: false,
  title: '',
  action: '',
  userId: '',
})
const addSignDialog = ref({
  visible: false,
  users: [] as string[],
})

function formatDateTime(dt?: string): string {
  if (!dt) return '—'
  return dt.replace('T', ' ').slice(0, 19)
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// ── 加载任务详情 ──
async function loadDetail() {
  loading.value = true
  try {
    const res = await taskApi.getDetail(taskId)
    taskDetail.value = res.data
  } catch {
    ElMessage.error('加载任务详情失败')
  } finally {
    loading.value = false
  }
}

// ── 加载流程跟踪数据 ──
async function loadTrackingData() {
  if (!taskDetail.value) return
  const { processInstanceId, processDefinitionId } = taskDetail.value
  try {
    const [xmlRes, highlightRes, historyRes] = await Promise.all([
      deployedProcessApi.getXml(processDefinitionId),
      processInstanceApi.highlight(processInstanceId),
      processInstanceApi.history(processInstanceId),
    ])
    bpmnXml.value = xmlRes.data
    const highlight = highlightRes.data
    const completed = (highlight.completedActivityIds as string[]) ?? []
    const active = (highlight.activeActivityIds as string[]) ?? []
    highlightIds.value = [...completed, ...active]
    approvalRecords.value = historyRes.data
  } catch {
    ElMessage.warning('加载流程跟踪信息失败')
  }
}

// ── 操作处理 ──
async function handleApprove() {
  actionLoading.value = 'approve'
  try {
    await taskApi.complete(taskId, { comment: comment.value })
    ElMessage.success('审批通过')
    router.push('/process/todo')
  } catch {
    ElMessage.error('操作失败')
  } finally {
    actionLoading.value = null
  }
}

async function handleReject() {
  if (!comment.value.trim()) {
    ElMessage.warning('驳回请填写审批意见')
    return
  }
  actionLoading.value = 'reject'
  try {
    await taskApi.reject(taskId, { reason: comment.value })
    ElMessage.success('已驳回')
    router.push('/process/todo')
  } catch {
    ElMessage.error('操作失败')
  } finally {
    actionLoading.value = null
  }
}

function handleMoreAction(command: string) {
  const titles: Record<string, string> = {
    transfer: '转办 — 选择用户',
    delegate: '委派 — 选择用户',
    forwardSign: '转签 — 选择用户',
  }
  if (command === 'addSign') {
    addSignDialog.value = { visible: true, users: [] }
  } else {
    singleUserDialog.value = {
      visible: true,
      title: titles[command] ?? command,
      action: command,
      userId: '',
    }
  }
}

async function confirmSingleUser() {
  const { action, userId } = singleUserDialog.value
  if (!userId) {
    ElMessage.warning('请选择用户')
    return
  }
  actionLoading.value = action
  try {
    if (action === 'transfer') {
      await taskApi.transfer(taskId, { toUser: userId, reason: comment.value })
    } else if (action === 'delegate') {
      await taskApi.delegate(taskId, { delegateTo: userId, comment: comment.value })
    } else if (action === 'forwardSign') {
      await taskApi.forwardSign(taskId, { toUser: userId, comment: comment.value })
    }
    ElMessage.success('操作成功')
    singleUserDialog.value.visible = false
    router.push('/process/todo')
  } catch {
    ElMessage.error('操作失败')
  } finally {
    actionLoading.value = null
  }
}

async function confirmAddSign() {
  if (addSignDialog.value.users.length === 0) {
    ElMessage.warning('请至少选择一个用户')
    return
  }
  actionLoading.value = 'addSign'
  try {
    await taskApi.addSign(taskId, { users: addSignDialog.value.users, comment: comment.value })
    ElMessage.success('加签成功')
    addSignDialog.value.visible = false
    router.push('/process/todo')
  } catch {
    ElMessage.error('操作失败')
  } finally {
    actionLoading.value = null
  }
}

onMounted(async () => {
  await loadDetail()
  await loadTrackingData()
})
</script>

<style scoped>
.task-detail-page {
  padding: 16px;
}

.header-title {
  font-size: 16px;
  font-weight: bold;
}

.detail-body {
  max-width: 900px;
}

.action-bar {
  margin-top: 16px;
  display: flex;
  gap: 8px;
}

.bpmn-container {
  height: 350px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}

.tracking-content {
  padding: 0 8px;
}
</style>
