<template>
  <div class="task-execution-timeline">
    <div v-if="nodes.length > 0" class="exec-timeline">
      <div v-for="(node, index) in nodes" :key="index" class="exec-item">
        <span class="exec-dot" :class="dotClass(node)"></span>

        <!-- 结束事件：轻量收尾 -->
        <div v-if="node.type === 'endEvent'" class="exec-endcap">
          {{ node.activityName || '流程结束' }}
          <span v-if="node.endTime" class="exec-time">{{ formatDateTime(node.endTime) }}</span>
        </div>

        <!-- 普通节点卡片 -->
        <div
          v-else
          class="exec-card"
          :class="{ 'is-active': node.status === 'active', 'is-predicted': node.status === 'predicted' }"
        >
          <div class="exec-head">
            <span class="exec-name">{{ node.activityName || '—' }}</span>
            <el-tag
              v-if="node.type !== 'startEvent'"
              :type="statusTagType(node.status)"
              size="small"
              effect="light"
              round
            >
              {{ statusLabel(node.status) }}
            </el-tag>
            <el-tag v-if="multiModeLabel(node.multiMode)" type="warning" size="small" effect="plain" round>
              {{ multiModeLabel(node.multiMode) }}
            </el-tag>
            <el-icon v-if="node.hasBranch" class="branch-icon" title="此处有分支"><Connection /></el-icon>
            <span v-if="node.endTime" class="exec-time">{{ formatDateTime(node.endTime) }}</span>
          </div>

          <div v-if="hasPersonRow(node)" class="exec-person">
            <!-- 候选人（未认领） -->
            <template v-if="node.candidateNames">
              <span v-for="(c, ci) in candidateList(node.candidateNames)" :key="ci" class="exec-avatar">
                {{ avatarChar(c) }}
              </span>
              <span class="exec-pname">{{ node.candidateNames }}</span>
              <span class="exec-psub">候选人</span>
            </template>

            <!-- 进行中 -->
            <template v-else-if="node.status === 'active' && node.assigneeName">
              <span class="exec-avatar">{{ avatarChar(node.assigneeName) }}</span>
              <span class="exec-pname">{{ node.assigneeName }}</span>
              <span class="exec-psub">当前办理人</span>
            </template>

            <!-- 预测节点 -->
            <template v-else-if="node.status === 'predicted'">
              <span class="exec-avatar is-ghost">?</span>
              <span class="exec-psub">办理人：{{ node.assigneeName || '待定' }}</span>
            </template>

            <!-- 已完成 -->
            <template v-else>
              <span class="exec-avatar">{{ avatarChar(node.assigneeName) }}</span>
              <span class="exec-pname">{{ node.assigneeName || '—' }}</span>
              <el-tag v-if="node.action" :type="actionTagType(node.action)" size="small" effect="light" round>
                {{ actionLabel(node.action) }}
              </el-tag>
              <template v-if="node.action === 'transfer' || node.action === 'delegate'">
                <el-icon class="target-arrow"><Right /></el-icon>
                <span class="exec-avatar">{{ avatarChar(node.targetUserName) }}</span>
                <span class="exec-pname">{{ node.targetUserName || '—' }}</span>
              </template>
            </template>
          </div>

          <div v-if="node.comment" class="exec-comment">{{ node.comment }}</div>
        </div>
      </div>
    </div>
    <el-empty v-else description="暂无执行记录" :image-size="80" />
  </div>
</template>

<script setup lang="ts">
import type { ExecutionNodeVO } from '@/api/processInstance'
import { Connection, Right } from '@element-plus/icons-vue'

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

function dotClass(node: ExecutionNodeVO): string {
  if (node.status === 'active') return 'is-active'
  if (node.status === 'predicted') return 'is-ghost'
  return 'is-done'
}

function hasPersonRow(node: ExecutionNodeVO): boolean {
  return Boolean(node.candidateNames || node.assigneeName || node.status === 'predicted')
}

/** 拆分候选人串（后端以 、,， 等分隔） */
function candidateList(names: string): string[] {
  return names
    .split(/[、,，;；/]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function avatarChar(name: string | null): string {
  const n = (name || '').trim()
  return n ? n.charAt(0) : '—'
}
</script>

<style scoped>
.task-execution-timeline {
  padding: 8px 0;
}

.exec-timeline {
  position: relative;
  margin-left: var(--spacer-8, 8px);
  padding-left: 28px;
}

.exec-timeline::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 10px;
  bottom: 18px;
  width: 2px;
  background: var(--el-border-color-lighter);
  border-radius: 2px;
}

.exec-item {
  position: relative;
  padding-bottom: 12px;
}

.exec-item:last-child {
  padding-bottom: 0;
}

.exec-dot {
  position: absolute;
  left: -28px;
  top: 15px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--el-color-success);
  border: 2px solid var(--el-bg-color);
  box-sizing: content-box;
  z-index: 1;
}

.exec-dot.is-active {
  background: var(--el-color-primary);
}

@media (prefers-reduced-motion: no-preference) {
  .exec-dot.is-active {
    animation: exec-pulse 1.8s ease-out infinite;
  }
}

@keyframes exec-pulse {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--el-color-primary) 35%, transparent);
  }
  70% {
    box-shadow: 0 0 0 6px color-mix(in srgb, var(--el-color-primary) 0%, transparent);
  }
  100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--el-color-primary) 0%, transparent);
  }
}

.exec-dot.is-ghost {
  background: var(--el-bg-color);
  border: 2px dashed var(--el-text-color-placeholder);
}

.exec-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
  padding: 10px 14px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.exec-card:hover {
  box-shadow: var(--el-box-shadow-light);
}

.exec-card.is-active {
  border-color: var(--el-color-primary);
}

.exec-card.is-predicted {
  border-style: dashed;
}

.exec-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.exec-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.exec-time {
  margin-left: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.exec-person {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.exec-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.exec-avatar.is-ghost {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-placeholder);
}

.exec-pname {
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.exec-psub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.exec-comment {
  margin-top: 8px;
  padding: 6px 12px;
  background: var(--el-fill-color-light);
  border-left: 3px solid var(--el-color-primary);
  border-radius: 4px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}

.exec-endcap {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.exec-endcap .exec-time {
  margin-left: 0;
}

.branch-icon {
  color: var(--el-color-warning);
  flex-shrink: 0;
}

.target-arrow {
  color: var(--el-text-color-placeholder);
  font-size: 13px;
}
</style>
