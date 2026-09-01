<script setup lang="ts">
defineOptions({ name: 'MessageAnnouncementList' })

import { ref } from 'vue'
import { SearchTable } from '@/components/business'
import { Plus, Delete } from '@element-plus/icons-vue'
import type { TableColumn, ActionButton, SearchField } from '@/components/business/types'
import { getAnnouncements, publishAnnouncement, recallAnnouncement } from '../../api/admin'
import { ElMessage } from 'element-plus'

const searchFields: SearchField[] = [
  { type: 'input', label: '标题', prop: 'keyword', placeholder: '按标题搜索' },
]

const columns: TableColumn[] = [
  { prop: 'id', label: 'ID', width: 80 },
  { prop: 'title', label: '标题', minWidth: 240, showOverflowTooltip: true },
  { prop: 'recipientCount', label: '接收人数', width: 110, align: 'center' },
  { prop: 'createdAt', label: '发布时间', width: 180 },
]

async function fetchApi(params: any) {
  const res = await getAnnouncements({
    page: (params.page || 1) - 1,
    size: params.size || 10,
    keyword: params.keyword || undefined,
  })
  const data = res.data as any
  return { rows: data?.rows || [], total: data?.total || 0 }
}

// ========== 发布公告对话框 ==========
const publishVisible = ref(false)
const publishing = ref(false)
const publishForm = ref({ title: '', content: '', recipientIds: '' })

function openPublish() {
  publishForm.value = { title: '', content: '', recipientIds: '' }
  publishVisible.value = true
}

async function handlePublish() {
  if (!publishForm.value.title || !publishForm.value.content) {
    ElMessage.warning('请填写标题和内容')
    return
  }
  // recipientIds: 逗号分隔的用户ID（留空则发给当前用户）
  const ids = publishForm.value.recipientIds
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
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

// ========== 撤回 ==========
async function handleRecall(row: any) {
  await recallAnnouncement(row.id)
  ElMessage.success('公告已撤回')
  tableRef.value?.fetchList()
}

const actionButtons: ActionButton[] = [
  {
    label: '撤回', icon: Delete, type: 'danger', size: 'small', link: true,
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
            placeholder="支持 Markdown 语法"
          />
        </el-form-item>
        <el-form-item label="接收用户">
          <el-input
            v-model="publishForm.recipientIds"
            placeholder="用户ID，逗号分隔，如 1,2,3"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="publishVisible = false">取消</el-button>
        <el-button type="primary" :loading="publishing" @click="handlePublish">发布</el-button>
      </template>
    </el-dialog>
  </div>
</template>
