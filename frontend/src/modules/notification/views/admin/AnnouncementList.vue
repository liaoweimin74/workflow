<script setup lang="ts">
defineOptions({ name: 'MessageAnnouncementList' })

import { ref, onMounted } from 'vue'
import { SearchTable } from '@/components/business'
import { Plus, Delete, View } from '@element-plus/icons-vue'
import type { TableColumn, ActionButton, SearchField } from '@/components/business/types'
import { getAnnouncements, getAnnouncement, publishAnnouncement, recallAnnouncement } from '../../api/admin'
import { ElMessage } from 'element-plus'
import DataPicker from '@/views/form/components/DataPicker.vue'
import { dataSourceApi } from '@/api/data-source'
import MarkdownIt from 'markdown-it'

const searchFields: SearchField[] = [
  { type: 'input', label: '标题', prop: 'keyword', placeholder: '按标题搜索' },
]

const columns: TableColumn[] = [
  { prop: 'id', label: 'ID', width: 80 },
  { prop: 'title', label: '标题', minWidth: 240, showOverflowTooltip: true },
  { prop: 'recipientCount', label: '接收人数', width: 110, align: 'center' },
  { prop: 'createdAt', label: '发布时间', width: 180 },
]

const detailVisible = ref(false)
const userDataSourceId = ref('')
const detailLoading = ref(false)
const detail = ref<{ title?: string; contentType?: string; content?: { text?: string } } | null>(null)
const markdown = new MarkdownIt({ html: false, linkify: true })
const detailHtml = ref('')

onMounted(async () => {
  const response = await dataSourceApi.getEnabledDataSources()
  const source = (response.data || []).find(item => item.type === 'SYSTEM' && item.sourceKey === 'user-tree')
  userDataSourceId.value = source?.id || ''
})

async function fetchApi(params: any) {
  const res = await getAnnouncements({
    page: params.page || 1,
    size: params.size || 10,
    keyword: params.keyword || undefined,
  })
  const data = res.data as any
  return { rows: data?.rows || [], total: data?.total || 0 }
}

// ========== 发布公告对话框 ==========
const publishVisible = ref(false)
const publishing = ref(false)
const publishForm = ref({ title: '', content: '', recipientIds: '[]' })

function openPublish() {
  publishForm.value = { title: '', content: '', recipientIds: '[]' }
  publishVisible.value = true
}

async function handlePublish() {
  if (!publishForm.value.title || !publishForm.value.content) {
    ElMessage.warning('请填写标题和内容')
    return
  }
  let ids: number[] = []
  try {
    const parsed: unknown = JSON.parse(publishForm.value.recipientIds || '[]')
    ids = Array.isArray(parsed)
      ? parsed.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)
      : []
  } catch {
    ids = []
  }
  if (ids.length === 0) {
    ElMessage.warning('请填写至少一个接收用户ID（逗号分隔）')
    return
  }
  publishing.value = true
  try {
    await publishAnnouncement({
      title: publishForm.value.title,
      content: publishForm.value.content,
      recipientIds: ids,
    })
    ElMessage.success('公告已发布')
    publishVisible.value = false
    tableRef.value?.fetchList()
  } finally {
    publishing.value = false
  }
}

// ========== 查看/撤回 ==========
function handleView(row: any) {
  detailVisible.value = true
  detailLoading.value = true
  detail.value = null
  getAnnouncement(row.id).then((response) => {
    detail.value = response.data
    detailHtml.value = response.data?.contentType === 'MARKDOWN'
      ? markdown.render(response.data?.content?.text || '')
      : ''
  }).catch((error: unknown) => {
    if (error instanceof Error) {
      ElMessage.error(error.message)
      return
    }
    throw error
  }).finally(() => { detailLoading.value = false })
}

async function handleRecall(row: any) {
  await recallAnnouncement(row.id)
  ElMessage.success('公告已撤回')
  tableRef.value?.fetchList()
}

const actionButtons: ActionButton[] = [
  {
    label: '查看', icon: View, size: 'small', link: true,
    onClick: handleView,
  },
  {
    label: '删除', icon: Delete, type: 'danger', size: 'small', link: true,
    confirm: '确定撤回该公告吗？（将删除所有收件人记录）',
    onClick: handleRecall,
  },
]

const tableRef = ref()
</script>

<template>
  <div>
    <SearchTable
      ref="tableRef"
      :search-fields="searchFields"
      :columns="columns"
      :action-buttons="actionButtons"
      :fetch-api="fetchApi"
      :toolbar-buttons="[{ label: '发布公告', icon: Plus, type: 'primary', onClick: openPublish }]"
    />

    <el-dialog v-model="detailVisible" :title="detail?.title || '公告详情'" width="640px">
      <div v-loading="detailLoading" class="announcement-detail">
        <div v-if="detail?.contentType === 'MARKDOWN'" class="markdown-body" v-html="detailHtml"></div>
        <pre v-else>{{ detail?.content?.text || '--' }}</pre>
      </div>
    </el-dialog>

    <!-- 发布公告对话框 -->
    <el-dialog
      v-model="publishVisible"
      title="发布公告"
      width="560px"
      :close-on-click-modal="false"
    >
      <el-form label-width="80px">
        <el-form-item label="标题" required>
          <el-input v-model="publishForm.title" placeholder="公告标题" maxlength="255" />
        </el-form-item>
        <el-form-item label="内容" required>
          <el-input
            v-model="publishForm.content"
            type="textarea"
            :rows="6"
            placeholder="支持 Markdown 语法，例如：**加粗**、# 标题、- 列表"
          />
        </el-form-item>
        <el-form-item label="接收用户">
          <DataPicker
            v-if="userDataSourceId"
            v-model="publishForm.recipientIds"
            :global-data-source-id="userDataSourceId"
            display-field="nickname"
            :columns="['username', 'nickname', 'orgName']"
            :search-columns="['username', 'nickname']"
            placeholder="选择系统用户，可多选"
          />
          <span v-else class="data-source-loading">正在加载系统用户数据源...</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="publishVisible = false">取消</el-button>
        <el-button type="primary" :loading="publishing" @click="handlePublish">发布</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.announcement-detail {
  min-height: 120px;
}

.markdown-body {
  color: #303133;
  line-height: 1.7;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  margin: 0 0 12px;
}

.markdown-body :deep(p),
.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 8px 0;
}
</style>
