<template>
  <div class="logic-flow-list-page">
    <el-card style="overflow: hidden">
      <SearchTable
        ref="tableRef"
        :search-fields="searchFields"
        :columns="columns"
        :action-buttons="actionButtons"
        :toolbar-buttons="toolbarButtons"
        :fetch-api="fetchApi"
        :default-page-size="20"
        :max-visible-buttons="5"
      >
        <template #status="{ row }">
          <el-tag :type="row.status === 'PUBLISHED' ? 'success' : 'info'" size="small">
            {{ row.status === 'PUBLISHED' ? '已发布' : '草稿' }}
          </el-tag>
        </template>
        <template #version="{ row }">
          {{ row.version > 0 ? 'v' + row.version : '—' }}
        </template>
        <template #updatedAt="{ row }">
          {{ formatDate(row.updatedAt) }}
        </template>
      </SearchTable>
    </el-card>

    <!-- 新建逻辑流 -->
    <el-dialog
      v-model="createDialogVisible"
      title="新建逻辑流"
      width="520px"
      :close-on-click-modal="false"
    >
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="90px">
        <el-form-item label="流程名称" prop="name">
          <el-input v-model="createForm.name" maxlength="128" placeholder="请输入流程名称" />
        </el-form-item>
        <el-form-item label="流程标识" prop="key">
          <el-input v-model="createForm.key" maxlength="64" placeholder="如 order_sync_flow" />
          <div class="key-tip">字母开头，可包含字母/数字/下划线/中划线，2-64 位；创建后不可修改</div>
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="createForm.description"
            type="textarea"
            :rows="3"
            maxlength="512"
            placeholder="可选，说明该逻辑流的用途"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">创建并设计</el-button>
      </template>
    </el-dialog>

    <!-- 运行测试（与设计器共用） -->
    <RunTestDialog v-model="runDialogVisible" :flow-id="runFlowId" :flow-name="runFlowName" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Delete, EditPen, Plus, VideoPlay } from '@element-plus/icons-vue'
import { SearchTable } from '@/components/business'
import type { SearchField, TableColumn, ActionButton, ToolbarButton } from '@/components/business/types'
import { logicFlowApi } from '@/api/logicFlow'
import RunTestDialog from './components/RunTestDialog.vue'

defineOptions({ name: 'LogicFlowList' })

const router = useRouter()
const tableRef = ref<InstanceType<typeof SearchTable>>()

// ========== 搜索 ==========
const searchFields = computed<SearchField[]>(() => [
  {
    type: 'input',
    label: '关键字',
    prop: 'keyword',
    placeholder: '搜索名称 / 标识',
    style: 'width: 220px',
  },
])

// ========== 列 ==========
const columns: TableColumn[] = [
  { prop: 'flowKey', label: '流程标识', width: 200 },
  { prop: 'name', label: '流程名称', minWidth: 180 },
  { prop: 'status', label: '状态', width: 100, align: 'center', slotName: 'status' },
  { prop: 'version', label: '版本', width: 90, align: 'center', slotName: 'version' },
  { prop: 'updatedAt', label: '更新时间', width: 180, slotName: 'updatedAt' },
]

// ========== 数据获取（PageResponse 兼容解析） ==========
async function fetchApi(params: any) {
  const res = await logicFlowApi.list({
    page: params.page || 1,
    size: params.size || 20,
    keyword: params.keyword || undefined,
  })
  const data: any = res.data as any
  return {
    rows: data?.content || data?.rows || [],
    total: data?.totalElements ?? data?.total ?? 0,
  }
}

// ========== 工具栏：新建 ==========
const toolbarButtons: ToolbarButton[] = [
  { label: '新建逻辑流', type: 'primary', icon: Plus, onClick: () => openCreateDialog() },
]

// ========== 新建对话框 ==========
const createDialogVisible = ref(false)
const creating = ref(false)
const createFormRef = ref<FormInstance>()
const createForm = reactive({ key: '', name: '', description: '' })

const createRules: FormRules = {
  name: [{ required: true, message: '请输入流程名称', trigger: 'blur' }],
  key: [
    { required: true, message: '请输入流程标识', trigger: 'blur' },
    {
      pattern: /^[a-zA-Z][a-zA-Z0-9_-]{1,63}$/,
      message: '字母开头，可包含字母/数字/下划线/中划线，2-64 位',
      trigger: 'blur',
    },
  ],
}

function openCreateDialog() {
  createForm.key = ''
  createForm.name = ''
  createForm.description = ''
  createDialogVisible.value = true
}

async function submitCreate() {
  try {
    await createFormRef.value?.validate()
  } catch {
    return
  }
  creating.value = true
  try {
    const res = await logicFlowApi.create({
      key: createForm.key.trim(),
      name: createForm.name.trim(),
      description: createForm.description.trim() || undefined,
    })
    ElMessage.success('创建成功，已进入设计器')
    createDialogVisible.value = false
    // 创建成功后直接跳设计器（契约：后端默认生成 开始→结束 DSL）
    router.push(`/logic-flow/design/${res.data.id}`)
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    creating.value = false
  }
}

// ========== 行操作 ==========
const actionButtons: ActionButton[] = [
  {
    label: '设计',
    icon: EditPen,
    size: 'small',
    onClick: (row: any) => {
      router.push(`/logic-flow/design/${row.id}`)
    },
  },
  {
    label: '运行测试',
    icon: VideoPlay,
    size: 'small',
    type: 'primary',
    onClick: (row: any) => {
      runFlowId.value = row.id
      runFlowName.value = row.name || ''
      runDialogVisible.value = true
    },
  },
  {
    label: '删除',
    icon: Delete,
    size: 'small',
    type: 'danger',
    onClick: async (row: any) => {
      try {
        await ElMessageBox.confirm(
          `确定要删除逻辑流「${row.name || row.flowKey}」吗？删除后不可恢复。`,
          '删除确认',
          { type: 'warning' }
        )
      } catch {
        return
      }
      try {
        await logicFlowApi.remove(row.id)
        ElMessage.success('删除成功')
        tableRef.value?.fetchList()
      } catch {
        // http 拦截器已弹出错误消息
      }
    },
  },
]

// ========== 运行测试 ==========
const runDialogVisible = ref(false)
const runFlowId = ref('')
const runFlowName = ref('')

// ========== 工具 ==========
function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<style scoped>
/* 对齐用户管理布局标准：根容器撑满 main，卡片与内部 SearchTable 逐级接管剩余高度 */
.logic-flow-list-page {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.logic-flow-list-page > :deep(.el-card) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.logic-flow-list-page > :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.key-tip {
  width: 100%;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
</style>
