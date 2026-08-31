<template>
  <div class="subscription-rules">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>订阅规则管理</span>
          <el-button type="primary" @click="handleCreate">新建规则</el-button>
        </div>
      </template>
      <el-table :data="rules" v-loading="loading" stripe>
        <el-table-column prop="eventCode" label="事件代码" width="180" />
        <el-table-column prop="channel" label="渠道" width="140">
          <template #default="{ row }">
            <el-tag size="small">{{ row.channel }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="priority" label="优先级" width="100" />
        <el-table-column prop="enable" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.enable ? 'success' : 'info'" size="small">
              {{ row.enable ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="condition" label="条件" min-width="200" show-overflow-tooltip />
        <el-table-column prop="createdBy" label="创建人" width="120" />
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleEdit(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新建/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="editingRule ? '编辑规则' : '新建规则'" width="500px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="事件代码">
          <el-input v-model="form.eventCode" placeholder="如 TASK_CREATED, URGENT_REMIND" />
        </el-form-item>
        <el-form-item label="渠道">
          <el-select v-model="form.channel">
            <el-option label="站内信" value="IN_APP" />
            <el-option label="短信" value="SMS" />
            <el-option label="企业微信" value="WECHAT_WORK" />
            <el-option label="小程序" value="WECHAT_MINIPROGRAM" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-select v-model="form.priority">
            <el-option label="低" value="LOW" />
            <el-option label="普通" value="NORMAL" />
            <el-option label="高" value="HIGH" />
            <el-option label="紧急" value="URGENT" />
          </el-select>
        </el-form-item>
        <el-form-item label="条件表达式">
          <el-input v-model="form.condition" type="textarea" :rows="3" placeholder="如 user.role == 'ADMIN'" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enable" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { getSubscriptionRules, createSubscriptionRule } from '../../api/admin'
import { ElMessage } from 'element-plus'

const rules = ref<any[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const editingRule = ref<any>(null)

const form = reactive({
  eventCode: '',
  channel: 'IN_APP',
  priority: 'NORMAL',
  condition: '',
  enable: true,
})

onMounted(() => { fetchRules() })

async function fetchRules() {
  loading.value = true
  try {
    const res = await getSubscriptionRules()
    rules.value = (res.data as any)?.rows || []
  } finally {
    loading.value = false
  }
}

function handleCreate() {
  editingRule.value = null
  form.eventCode = ''
  form.channel = 'IN_APP'
  form.priority = 'NORMAL'
  form.condition = ''
  form.enable = true
  dialogVisible.value = true
}

function handleEdit(row: any) {
  editingRule.value = row
  Object.assign(form, row)
  dialogVisible.value = true
}

async function handleSave() {
  await createSubscriptionRule(form)
  ElMessage.success('保存成功')
  dialogVisible.value = false
  fetchRules()
}
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
