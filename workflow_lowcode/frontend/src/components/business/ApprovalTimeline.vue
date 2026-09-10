<template>
  <div class="approval-timeline">
    <el-timeline v-if="records.length > 0">
      <el-timeline-item
        v-for="(record, index) in records"
        :key="index"
        :timestamp="formatDateTime(record.endTime || record.startTime)"
        placement="top"
        :type="actionTimelineType(record.action)"
      >
        <div class="timeline-item">
          <div class="timeline-header">
            <span class="node-name">{{ record.activityName }}</span>
            <el-tag :type="actionTagType(record.action)" size="small" effect="plain">
              {{ actionLabel(record.action) }}
            </el-tag>
          </div>
          <div class="timeline-body">
            <span class="assignee">办理人：{{ record.assigneeName || record.assignee || '—' }}</span>
            <p v-if="record.comment" class="comment">{{ record.comment }}</p>
          </div>
        </div>
      </el-timeline-item>
    </el-timeline>
    <el-empty v-else description="暂无审批记录" :image-size="80" />
  </div>
</template>

<script setup lang="ts">
import type { ApprovalRecordVO } from '@/api/task'

defineProps<{
  records: ApprovalRecordVO[]
}>()

function formatDateTime(dt: string): string {
  if (!dt) return ''
  return dt.replace('T', ' ').slice(0, 19)
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    approve: '通过',
    reject: '驳回',
    transfer: '转办',
    delegate: '委派',
    addSign: '加签',
    forwardSign: '转签',
    submit: '提交',
    complete: '完成',
  }
  return map[action] ?? action
}

function actionTagType(action: string): 'success' | 'danger' | 'warning' | 'info' | 'primary' {
  const map: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'primary'> = {
    approve: 'success',
    reject: 'danger',
    transfer: 'warning',
    delegate: 'info',
    addSign: 'warning',
    forwardSign: 'warning',
    submit: 'primary',
    complete: 'success',
  }
  return map[action] ?? 'info'
}

function actionTimelineType(action: string): 'primary' | 'success' | 'danger' | 'warning' | 'info' {
  const map: Record<string, 'primary' | 'success' | 'danger' | 'warning' | 'info'> = {
    approve: 'success',
    reject: 'danger',
    transfer: 'warning',
    delegate: 'info',
    addSign: 'warning',
    forwardSign: 'warning',
    submit: 'primary',
    complete: 'success',
  }
  return map[action] ?? 'info'
}
</script>

<style scoped>
.approval-timeline {
  padding: 8px 0;
}

.timeline-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.timeline-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.node-name {
  font-weight: 600;
  font-size: 14px;
}

.timeline-body {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.assignee {
  display: block;
}

.comment {
  margin: 4px 0 0;
  padding: 4px 8px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  color: var(--el-text-color-regular);
}
</style>
