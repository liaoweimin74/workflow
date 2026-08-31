<template>
  <div class="template-list">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>消息模板管理</span>
          <el-button type="primary" @click="handleCreate">新建模板</el-button>
        </div>
      </template>
      <el-table :data="templates" v-loading="loading" stripe>
        <el-table-column prop="templateCode" label="模板编码" width="180" />
        <el-table-column prop="name" label="模板名称" min-width="200" />
        <el-table-column prop="channel" label="渠道" width="120">
          <template #default="{ row }">
            <el-tag size="small">{{ row.channel }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="priority" label="优先级" width="100" />
        <el-table-column prop="isSystem" label="系统模板" width="100">
          <template #default="{ row }">
            <el-tag :type="row.isSystem ? 'warning' : 'info'" size="small">
              {{ row.isSystem ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleEdit(row)">编辑</el-button>
            <el-button type="danger" link @click="handleToggle(row)">启用/停用</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="editorVisible"
      :title="editingTemplate ? '编辑模板' : '新建模板'"
      width="720px"
      destroy-on-close
    >
      <TemplateEditor
        v-if="editorVisible"
        :template-data="editingTemplate"
        @cancel="editorVisible = false"
        @saved="onSaved"
      />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getTemplates, toggleTemplate } from '../../api/admin'
import TemplateEditor from './TemplateEditor.vue'
import { ElMessage } from 'element-plus'

const templates = ref<any[]>([])
const loading = ref(false)
const editorVisible = ref(false)
const editingTemplate = ref<any | null>(null)

onMounted(() => {
  fetchTemplates()
})

async function fetchTemplates() {
  loading.value = true
  try {
    const res = await getTemplates()
    // 后端返回 R<List<MessageTemplate>>，data 直接是数组
    templates.value = (res.data as any[]) || []
  } finally {
    loading.value = false
  }
}

function handleCreate() {
  editingTemplate.value = null
  editorVisible.value = true
}

function handleEdit(row: any) {
  editingTemplate.value = row
  editorVisible.value = true
}

function onSaved() {
  editorVisible.value = false
  fetchTemplates()
}

async function handleToggle(row: any) {
  await toggleTemplate(row.id)
  ElMessage.success('操作成功')
  fetchTemplates()
}
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
