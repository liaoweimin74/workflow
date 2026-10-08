<template>
  <div class="task-execution-timeline">
    <el-timeline v-if="nodes.length > 0">
      <el-timeline-item
        v-for="(node, index) in nodes"
        :key="index"
        :timestamp="node.endTime ? formatDateTime(node.endTime) : ''"
        placement="top"
        :type="statusTimelineType(node.status)"
        :hollow="node.status === 'predicted'"
      >
        <div class="timeline-item" :class="{ 'is-predicted': node.status === 'predicted' }">
          <div class="timeline-header">
            <el-icon class="node-type-icon" :class="nodeTypeIconClass(node.type)">
              <component :is="nodeTypeIcon(node.type)" />
            </el-icon>
            <span class="node-name">{{ node.activityName || '—' }}</span>
            <el-tag
              v-if="node.type !== 'endEvent' && node.type !== 'startEvent'"
              :type="statusTagType(node.status)"
              size="small"
              effect="plain"
            >
              {{ statusLabel(node.status) }}
            </el-tag>
            <el-icon v-if="node.hasBranch" class="branch-icon" title="此处有分支">
              <Connection />
            </el-icon>
          </div>
          <div class="timeline-body" v-if="node.type !== 'endEvent' && node.type !== 'startEvent'">
            <div v-if="multiModeLabel(node.multiMode)" class="multi-mode-row">
              <el-tag size="small" type="warning" effect="plain">{{ multiModeLabel(node.multiMode) }}</el-tag>
            </div>
            <span class="assignee" v-if="node.candidateNames">
              候选人：{{ node.candidateNames }}
            </span>
            <span class="assignee" v-else-if="node.status === 'active' && node.assigneeName">
              当前办理人：{{ node.assigneeName }}
            </span>
            <span class="assignee" v-else>
              办理人：{{ node.assigneeName || '—' }}
              <el-tag v-if="node.action === 'transfer' || node.action === 'delegate'"
                :type="actionTagType(node.action)" size="small" effect="plain">{{ actionLabel(node.action) }}</el-tag>
              <template v-if="node.action === 'transfer' || node.action === 'delegate'">
                {{ node.targetUserName || '—' }}
              </template>
              <el-tag v-else-if="node.action"
                :type="actionTagType(node.action)" size="small" effect="plain">{{ actionLabel(node.action) }}</el-tag>
            </span>
            <p v-if="node.comment" class="comment">{{ node.comment }}</p>
          </div>
        </div>
      </el-timeline-item>
    </el-timeline>
    <el-empty v-else description="暂无执行记录" :image-size="80" />
  </div>
</template>

<script setup lang="ts">
import type { ExecutionNodeVO } from '@/api/processInstance'
import { Connection, Avatar, Flag, CircleClose, Switch } from '@element-plus/icons-vue'

defineProps<{
  nodes: ExecutionNodeVO[]
}>()

function formatDateTime(dt: string | null): string {
  if (!dt) return '—'
  return dt.replace('T', ' ').slice(0, 19)
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    completed: '已完成',
    active: '进行中',
    predicted: '待执行',
  }
  return map[status] ?? status
}

function statusTagType(status: string): 'success' | 'primary' | 'info' {
  const map: Record<string, 'success' | 'primary' | 'info'> = {
    completed: 'success',
    active: 'primary',
    predicted: 'info',
  }
  return map[status] ?? 'info'
}

function statusTimelineType(status: string): 'primary' | 'success' | 'info' {
  const map: Record<string, 'primary' | 'success' | 'info'> = {
    completed: 'success',
    active: 'primary',
    predicted: 'info',
  }
  return map[status] ?? 'info'
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    approve: '通过',
    reject: '驳回',
    refuse: '拒绝',
    transfer: '已转',
    delegate: '已委派',
    addSign: '加签',
    add_sign: '加签',
    forwardSign: '转签',
    forward_sign: '转签',
    submit: '提交',
    complete: '完成',
  }
  return map[action] ?? action
}

function multiModeLabel(mode: string | null): string | null {
  if (!mode) return null
  const map: Record<string, string> = {
    sequential: '多人顺序审批',
    parallel: '多人并行审批',
  }
  return map[mode] ?? null
}

function actionTagType(action: string): 'success' | 'danger' | 'warning' | 'info' {
  const map: Record<string, 'success' | 'danger' | 'warning' | 'info'> = {
    approve: 'success',
    complete: 'success',
    submit: 'success',
    reject: 'danger',
    refuse: 'danger',
    transfer: 'warning',
    delegate: 'warning',
    addSign: 'info',
    add_sign: 'info',
    forwardSign: 'info',
    forward_sign: 'info',
  }
  return map[action] ?? 'info'
}

function nodeTypeIcon(type: string) {
  const map: Record<string, unknown> = {
    userTask: Avatar,
    startEvent: Flag,
    endEvent: CircleClose,
    serviceTask: Switch,
  }
  return map[type] ?? Flag
}

function nodeTypeIconClass(type: string): string {
  return `node-icon-${type || 'default'}`
}
</script>

<style scoped>
.task-execution-timeline {
  padding: 8px 0;
}

.timeline-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.timeline-item.is-predicted {
  opacity: 0.6;
}

.timeline-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.node-name {
  font-weight: 600;
  font-size: 14px;
}

.node-type-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.node-icon-userTask {
  color: var(--el-color-primary);
}

.node-icon-startEvent {
  color: var(--el-color-success);
}

.node-icon-endEvent {
  color: var(--el-color-info);
}

.node-icon-serviceTask {
  color: var(--el-color-warning);
}

.timeline-body {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.multi-mode-row {
  margin-bottom: 4px;
}

.assignee {
  display: block;
}

.assignee .el-tag {
  margin: 0 4px;
}

.comment {
  margin: 4px 0 0;
  padding: 4px 8px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  color: var(--el-text-color-regular);
}

.branch-icon {
  color: var(--el-color-warning);
  vertical-align: middle;
}

.target-user {
  font-size: 13px;
  color: var(--el-color-warning);
  font-weight: 500;
}

.action-row {
  display: block;
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.target-arrow {
  color: var(--el-text-color-placeholder);
  font-size: 13px;
}
</style>
