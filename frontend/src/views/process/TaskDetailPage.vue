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
          <el-descriptions-item label="版本">v{{ taskDetail?.processVersion ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="流程编号">{{ taskDetail?.businessKey || '—' }}</el-descriptions-item>
          <el-descriptions-item label="当前节点">{{ taskDetail?.name }}</el-descriptions-item>
          <el-descriptions-item label="发起人">{{ taskDetail?.initiatorName || taskDetail?.initiator }}</el-descriptions-item>
          <el-descriptions-item label="接收时间">{{ formatDateTime(taskDetail?.createTime) }}</el-descriptions-item>
          <el-descriptions-item label="办理人">{{ taskDetail?.assigneeName || taskDetail?.assignee }}</el-descriptions-item>
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
            :field-permissions="taskDetail.fieldPermissions"
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
          <!-- 发起节点：保存草稿/提交；审批节点：暂存/通过/驳回/拒绝/更多操作 -->
          <el-button
            :loading="actionLoading === 'save'"
            @click="handleSaveDraft"
          >
            {{ taskDetail?.isInitiatorTask ? '保存草稿' : '暂存' }}
          </el-button>
<template v-if="!taskDetail?.isInitiatorTask">
            <el-button type="success" :loading="actionLoading === 'approve'" @click="handleApprove">
              通过
            </el-button>
            <el-button
              v-if="operations?.allowReject"
              type="danger"
              :loading="actionLoading === 'reject'"
              @click="handleReject"
            >
              驳回
            </el-button>
            <el-button v-if="operations?.allowReject" type="danger" plain :loading="actionLoading === 'refuse'" @click="handleRefuse">
              拒绝
            </el-button>
            <el-dropdown v-if="hasMoreOperations" trigger="click" @command="handleMoreAction">
              <el-button>
                更多操作<el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-if="operations?.allowTransfer" command="transfer">转办</el-dropdown-item>
                  <el-dropdown-item v-if="operations?.allowDelegate" command="delegate">委派</el-dropdown-item>
                  <el-dropdown-item v-if="operations?.allowAddSign" command="addSign">加签</el-dropdown-item>
                  <el-dropdown-item v-if="operations?.allowForwardSign" command="forwardSign">转签</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </div>
      </el-card>
    </div>

    <!-- 右侧流程跟踪 Drawer -->
    <ProcessTrackDrawer
      v-model="trackingDrawer"
      :process-instance-id="taskDetail?.processInstanceId ?? ''"
      :process-definition-id="taskDetail?.processDefinitionId"
    />

    <!-- 转办/委派/转签 选人（单选） — 仅通过 ref 调用 openDialog -->
    <ApproverPicker
      ref="singlePickerRef"
      v-model="singleUserDialog.userId"
      :multiple="false"
      hide-trigger
      placeholder="选择用户"
      @change="onSingleUserSelected"
    />

    <!-- 加签 选人（多选） — 仅通过 ref 调用 openDialog -->
    <ApproverPicker
      ref="addSignPickerRef"
      v-model="addSignDialog.users"
      multiple
      hide-trigger
      placeholder="选择多个用户"
      @change="onAddSignUsersSelected"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { View, ArrowDown } from '@element-plus/icons-vue'
import { taskApi } from '@/api/task'
import { processInstanceApi } from '@/api/processInstance'
import { deployedProcessApi } from '@/api/processDefinition'
import type { TaskDetailVO, ApprovalRecordVO, OperationsConfig } from '@/api/task'
import FormRenderer from '@/views/form/components/FormRenderer.vue'
import { ApproverPicker, ProcessTrackDrawer } from '@/components/business'

const route = useRoute()
const router = useRouter()
const taskId = route.params.taskId as string

const loading = ref(true)
const taskDetail = ref<TaskDetailVO | null>(null)
const comment = ref('')
const actionLoading = ref<string | null>(null)
const formRendererRef = ref<InstanceType<typeof FormRenderer>>()

/** 节点操作权限配置，未配置时后端返回全默认值对象 */
const operations = computed<OperationsConfig | undefined>(() => taskDetail.value?.operations)

/** 是否存在"更多操作"下拉里的任一可用操作 */
const hasMoreOperations = computed(
  () => !!operations.value && (operations.value.allowTransfer || operations.value.allowDelegate || operations.value.allowAddSign || operations.value.allowForwardSign),
)

// 流程跟踪
const trackingDrawer = ref(false)

// 对话框
const singlePickerRef = ref<InstanceType<typeof ApproverPicker>>()
const addSignPickerRef = ref<InstanceType<typeof ApproverPicker>>()

const singleUserDialog = ref({
  action: '',
  userId: [] as number[],
})
const addSignDialog = ref({
  users: [] as number[],
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

// ── 操作处理 ──

/**
 * 保存草稿/暂存：仅保存当前表单数据，不完成任务。
 * 发起节点显示"保存草稿"，审批节点显示"暂存"，实现一致。
 */
async function handleSaveDraft() {
  actionLoading.value = 'save'
  try {
    if (!formRendererRef.value) {
      ElMessage.warning('当前节点无表单，无需保存')
      return
    }
    const ok = await formRendererRef.value.submit()
    if (!ok) {
      ElMessage.warning('保存失败，请重试')
      return
    }
    ElMessage.success(taskDetail.value?.isInitiatorTask ? '草稿已保存' : '已暂存')
  } catch {
    ElMessage.error('操作失败')
  } finally {
    actionLoading.value = null
  }
}

async function handleApprove() {
  actionLoading.value = 'approve'
  try {
    // 先保存当前表单数据 + 冻结快照，确保下一个节点能读到
    if (formRendererRef.value) {
      const ok = await formRendererRef.value.submit()
      if (!ok) {
        ElMessage.warning('表单保存失败，请重试')
        return
      }
      await formRendererRef.value.saveSnapshot()
    }
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
    // 先保存当前表单数据 + 冻结快照
    if (formRendererRef.value) {
      await formRendererRef.value.submit()
      await formRendererRef.value.saveSnapshot()
    }
    await taskApi.reject(taskId, { reason: comment.value })
    ElMessage.success('已驳回')
    router.push('/process/todo')
  } catch {
    ElMessage.error('操作失败')
  } finally {
    actionLoading.value = null
  }
}

async function handleRefuse() {
  if (!comment.value.trim()) {
    ElMessage.warning('拒绝请填写审批意见')
    return
  }
  actionLoading.value = 'refuse'
  try {
    // 先保存快照
    if (formRendererRef.value) {
      await formRendererRef.value.saveSnapshot()
    }
    await taskApi.refuse(taskId, { reason: comment.value })
    ElMessage.success('已拒绝，流程已终止')
    router.push('/process/todo')
  } catch {
    ElMessage.error('操作失败')
  } finally {
    actionLoading.value = null
  }
}

function handleMoreAction(command: string) {
  if (command === 'addSign') {
    addSignDialog.value = { users: [] }
    addSignPickerRef.value?.openDialog()
  } else {
    singleUserDialog.value = { action: command, userId: [] }
    singlePickerRef.value?.openDialog()
  }
}

async function onSingleUserSelected(users: { id: number; nickname: string }[]) {
  if (users.length === 0) return
  const userIdStr = String(users[0].id)
  const action = singleUserDialog.value.action
  actionLoading.value = action
  try {
    if (action === 'transfer') {
      await taskApi.transfer(taskId, { toUser: userIdStr, reason: comment.value })
    } else if (action === 'delegate') {
      await taskApi.delegate(taskId, { delegateTo: userIdStr, comment: comment.value })
    } else if (action === 'forwardSign') {
      await taskApi.forwardSign(taskId, { toUser: userIdStr, comment: comment.value })
    }
    ElMessage.success('操作成功')
    router.push('/process/todo')
  } catch {
    ElMessage.error('操作失败')
  } finally {
    actionLoading.value = null
  }
}

async function onAddSignUsersSelected(users: { id: number; nickname: string }[]) {
  if (users.length === 0) return
  actionLoading.value = 'addSign'
  try {
    const userIds = users.map(u => String(u.id))
    await taskApi.addSign(taskId, { users: userIds, comment: comment.value })
    ElMessage.success('加签成功')
    router.push('/process/todo')
  } catch {
    ElMessage.error('操作失败')
  } finally {
    actionLoading.value = null
  }
}

onMounted(async () => {
  await loadDetail()
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
</style>
