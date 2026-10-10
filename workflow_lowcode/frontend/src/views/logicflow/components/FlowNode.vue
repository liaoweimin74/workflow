<template>
  <div
    class="lf-node-card"
    :class="[
      `type-${data.nodeType.toLowerCase()}`,
      { 'is-selected': selected, 'is-run-failed': status === 'FAILED', 'is-run-success': status === 'SUCCESS' },
    ]"
  >
    <!-- 类型色条 -->
    <span class="type-bar" :style="typeColorStyle" />

    <!-- 运行状态徽标（flowgram 风格：成功✓/失败✕/跳过—） -->
    <span
      v-if="status"
      class="run-badge"
      :class="`run-${String(status).toLowerCase()}`"
      :title="`运行状态：${status}`"
    >
      <el-icon v-if="status === 'SUCCESS'"><Check /></el-icon>
      <el-icon v-else-if="status === 'FAILED'"><CloseBold /></el-icon>
      <el-icon v-else><Minus /></el-icon>
    </span>

    <!-- 删除小按钮（hover 显示，连带删除关联边由父组件处理） -->
    <span
      v-if="deletable"
      class="node-delete"
      title="删除节点"
      @click.stop="emit('delete', id)"
    >
      <el-icon><Close /></el-icon>
    </span>

    <div class="node-head">
      <span class="node-icon" :style="typeColorStyle">{{ badge }}</span>
      <span class="node-name" :title="data.name">{{ data.name }}</span>
    </div>

    <div v-if="summary" class="node-summary" :title="summary">{{ summary }}</div>

    <div
      v-if="resultNames.length || data.errorAction === 'IGNORE_CONTINUE'"
      class="node-tags"
    >
      <span
        v-for="r in resultNames"
        :key="r.name"
        class="node-tag out-tag"
        :title="`输出变量：${r.name}${r.desc ? '（' + r.desc + '）' : ''}`"
      >
        ↗ {{ r.name }}
      </span>
      <span v-if="data.errorAction === 'IGNORE_CONTINUE'" class="node-tag ignore-tag" title="出错时忽略并继续">
        忽略继续
      </span>
    </div>

    <!-- 连接点：CONDITION 两个出边（真/假）上下排布标注；BATCH 侧面闭合循环连线；
         执行型节点主流出点居左 + 失败路由（error）出点居右标注；其余上入下出 -->
    <template v-if="data.nodeType === 'CONDITION'">
      <Handle id="in" type="target" :position="Position.Top" />
      <Handle id="true" type="source" :position="Position.Bottom" class="handle-branch branch-true" :style="{ left: '28%' }" />
      <Handle id="false" type="source" :position="Position.Bottom" class="handle-branch branch-false" :style="{ left: '72%' }" />
      <span class="branch-label label-true">真</span>
      <span class="branch-label label-false">假</span>
    </template>
    <template v-else-if="data.nodeType === 'BATCH'">
      <Handle id="in" type="target" :position="Position.Top" />
      <Handle id="out" type="source" :position="Position.Bottom" :style="{ left: '30%' }" />
      <!-- 失败路由出点（error 边）：失败时优先路由到该分支，替代全局 errorAction 两档 -->
      <Handle id="error" type="source" :position="Position.Bottom" class="handle-branch branch-error" :style="{ left: '74%' }" />
      <span class="branch-label label-error">败</span>
      <!-- 闭合循环连线挂在节点右侧：外凸 U 形（LoopEdge.vue），远离主流更醒目 -->
      <Handle id="loop_start" type="source" :position="Position.Right" class="handle-loop" :style="{ top: '30%' }" />
      <Handle id="loop_end" type="target" :position="Position.Right" class="handle-loop" :style="{ top: '74%' }" />
      <span class="loop-label loop-label-start">循环起点</span>
      <span class="loop-label loop-label-end">循环终点</span>
    </template>
    <template v-else>
      <Handle v-if="data.nodeType !== 'START'" id="in" type="target" :position="Position.Top" />
      <template v-if="data.nodeType !== 'END' && hasErrorBranch">
        <Handle id="out" type="source" :position="Position.Bottom" :style="{ left: '30%' }" />
        <Handle id="error" type="source" :position="Position.Bottom" class="handle-branch branch-error" :style="{ left: '74%' }" />
        <span class="branch-label label-error">败</span>
      </template>
      <Handle v-else-if="data.nodeType !== 'END'" id="out" type="source" :position="Position.Bottom" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { Check, Close, CloseBold, Minus } from '@element-plus/icons-vue'
import { NODE_COLOR_VAR, nodeMeta } from '../utils/nodeMeta'
import { sqlStatementKind, splitSqlStatements } from '../utils/sqlScript'
import { supportsErrorBranch } from '../utils/dsl'
import type { FlowNodeData } from '../utils/dsl'

const props = withDefaults(
  defineProps<{
    id: string
    data: FlowNodeData
    selected?: boolean
    deletable?: boolean
    /** 最近一次运行的状态（画布徽标） */
    status?: string
  }>(),
  { selected: false, deletable: true, status: '' }
)

const emit = defineEmits<{ delete: [id: string] }>()

const meta = computed(() => nodeMeta(props.data.nodeType))
const badge = computed(() => meta.value.badge)

/** 是否渲染失败路由（error）出点：全部执行型节点（引擎 onError 失败路由） */
const hasErrorBranch = computed(() => supportsErrorBranch(props.data.nodeType))

const typeColorStyle = computed(() => {
  const colorVar = NODE_COLOR_VAR[props.data.nodeType]
  return {
    color: `var(${colorVar})`,
    backgroundColor: `color-mix(in srgb, var(${colorVar}) 12%, transparent)`,
    borderColor: `color-mix(in srgb, var(${colorVar}) 45%, transparent)`,
  }
})

/** legacy 单动作摘要（body 循环体模式下不用） */
function legacyActionSummary(cfg: Record<string, unknown> | undefined): string {
  const actionConfig = cfg?.actionConfig as Record<string, unknown> | undefined
  const actionType = String(cfg?.actionType ?? '').toUpperCase()
  if (actionType === 'HTTP') return `HTTP ${String(actionConfig?.url ?? '')}`
  if (actionType === 'BEAN') {
    return `${String(actionConfig?.beanName ?? '')}#${String(actionConfig?.methodName ?? '')}`
  }
  return 'Groovy 脚本'
}

/** 输出声明行（卡片徽标展示；全执行型节点声明了变量名时非空） */
const resultNames = computed(() => {
  if (!Array.isArray(props.data.results)) return []
  return (props.data.results as { name?: string; desc?: string }[])
    .map((r) => ({ name: String(r?.name ?? '').trim(), desc: r?.desc ? String(r.desc) : '' }))
    .filter((r) => r.name)
})

/** 节点副标题：类型 + 配置摘要 */
const summary = computed(() => {
  const cfg = props.data.config as Record<string, unknown> | undefined
  switch (props.data.nodeType) {
    case 'HTTP': {
      const method = String(cfg?.method ?? 'GET').toUpperCase()
      const url = String(cfg?.url ?? '')
      return url ? `${method} ${url}` : '未配置 URL'
    }
    case 'BEAN': {
      const bean = String(cfg?.beanName ?? '')
      const method = String(cfg?.methodName ?? '')
      return bean || method ? `${bean || '?'}#${method || '?'}` : '未配置 Bean'
    }
    case 'SCRIPT': {
      const results = resultNames.value
      return results.length ? `Groovy 脚本 · ${results.length} 个输出` : 'Groovy 脚本'
    }
    case 'CONDITION': {
      const variable = String(cfg?.variable ?? '')
      const op = String(cfg?.operator ?? '')
      const value = cfg?.value
      const showValue = op !== 'EMPTY' && op !== 'NOT_EMPTY' && value !== undefined && value !== ''
      return [variable, op, showValue ? String(value) : ''].filter(Boolean).join(' ') || '未配置条件'
    }
    case 'START':
      return '流程起点'
    case 'END':
      return '流程终点'
    case 'BATCH': {
      const collection = String(cfg?.collection ?? '')
      const body = Array.isArray(cfg?.body) ? (cfg?.body as unknown[]) : []
      const bodyLabel = body.length
        ? `${body.length} 步循环体`
        : cfg?.actionType
          ? `遍历执行 ${legacyActionSummary(cfg)}`
          : '未配置循环体'
      return collection ? `${collection} · ${bodyLabel}` : `未配置集合 · ${bodyLabel}`
    }
    case 'SUBFLOW': {
      const flowId = String(cfg?.flowId ?? '')
      return flowId ? `调用流 ${flowId.slice(0, 12)}…` : '未选择目标流程'
    }
    case 'DATA_UPDATE': {
      const updates = Array.isArray(cfg?.updates) ? (cfg?.updates as unknown[]) : []
      if (updates.length === 1) {
        // 单条目 = 单表更新（引擎输出与存量单表一致）
        const u = updates[0] as { table?: unknown; setOps?: unknown[] } | null
        const uTable = String(u?.table ?? '')
        if (uTable) {
          const uFields = Array.isArray(u?.setOps) ? u!.setOps.length : 0
          return `更新 ${uTable} · ${uFields} 字段`
        }
      }
      if (updates.length > 1) {
        const fields = updates.reduce((sum: number, u) => {
          const ops = (u as { setOps?: unknown[] } | null)?.setOps
          return sum + (Array.isArray(ops) ? ops.length : 0)
        }, 0)
        return `多表更新 ${updates.length} 张表 · ${fields} 字段`
      }
      const table = String(cfg?.table ?? '')
      const setOps = Array.isArray(cfg?.setOps) ? (cfg?.setOps as unknown[]) : []
      return table ? `更新 ${table} · ${setOps.length} 字段` : '未配置目标表'
    }
    case 'SQL_SCRIPT': {
      const sqlText = String(cfg?.sql ?? '')
      if (!sqlText.trim()) return '未配置 SQL'
      try {
        const parts = splitSqlStatements(sqlText)
        const kinds = parts.map((p) => {
          try { return sqlStatementKind(p) } catch { return null }
        })
        const query = kinds.filter((k) => k === 'QUERY').length
        const write = kinds.filter((k) => k === 'INSERT').length
        const dml = kinds.filter((k) => k === 'DML').length
        const bits = [
          dml ? `${dml} 更新` : '',
          write ? `${write} 写入` : '',
          query ? `${query} 查询` : '',
        ].filter(Boolean).join(' · ')
        return `${parts.length} 条 SQL${bits ? ` · ${bits}` : ''}`
      } catch {
        return 'SQL 解析待修正'
      }
    }
    case 'DATA_QUERY': {
      const formKey = String(cfg?.formKey ?? '')
      const filters = Array.isArray(cfg?.filter) ? (cfg?.filter as unknown[]) : []
      const bits = [filters.length ? `${filters.length} 筛选` : '', cfg?.keyword ? '含关键字' : '']
        .filter(Boolean).join(' · ')
      return formKey ? `查询 ${formKey}${bits ? ` · ${bits}` : ''}` : '未配置表单'
    }
    case 'DATA_INSERT': {
      const formKey = String(cfg?.formKey ?? '')
      const data = Array.isArray(cfg?.data) ? (cfg?.data as unknown[]) : []
      return formKey ? `新增至 ${formKey} · ${data.length} 字段` : '未配置表单'
    }
    case 'DATA_DELETE': {
      const formKey = String(cfg?.formKey ?? '')
      const id = String(cfg?.id ?? '').trim()
      const filters = Array.isArray(cfg?.filter) ? (cfg?.filter as unknown[]) : []
      const mode = id ? '按 ID' : filters.length ? `按条件 ${filters.length} 项` : '未配置条件'
      return formKey ? `删除 ${formKey} · ${mode}` : '未配置表单'
    }
    case 'NOTIFY': {
      const tpl = String(cfg?.templateCode ?? '')
      const recipients = Array.isArray(cfg?.recipientIds) ? (cfg?.recipientIds as unknown[]) : []
      return tpl ? `模板 ${tpl} · ${recipients.length} 接收人` : '未配置模板'
    }
    case 'DELAY': {
      const ms = Number(cfg?.durationMs ?? 0)
      return ms > 0 ? `等待 ${ms >= 1000 ? `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s` : `${ms}ms`}` : '未配置时长'
    }
    case 'TRANSFORM': {
      const tpl = String(cfg?.template ?? '').trim()
      if (!tpl) return '未配置模板'
      return `映射模板 · ${tpl.length} 字符`
    }
    case 'AGGREGATE': {
      const collection = String(cfg?.collection ?? '')
      const ops = Array.isArray(cfg?.ops) ? (cfg?.ops as unknown[]) : []
      const groupBy = String(cfg?.groupBy ?? '').trim()
      if (!collection) return '未配置集合'
      const bits = [ops.join('/'), groupBy ? `按 ${groupBy} 分组` : ''].filter(Boolean).join(' · ')
      return `${collection}${bits ? ` · ${bits}` : ''}`
    }
    case 'LLM': {
      const prompt = String(cfg?.prompt ?? '').trim()
      return prompt ? `AI 调用 · ${prompt.slice(0, 18)}${prompt.length > 18 ? '…' : ''}` : '未配置提示词'
    }
    default:
      return ''
  }
})
</script>

<style scoped>
.lf-node-card {
  position: relative;
  min-width: 136px;
  max-width: 180px;
  padding: 6px 10px 7px 12px;
  background: var(--el-bg-color);
  border: 1.5px solid var(--el-border-color-light);
  border-radius: 7px;
  box-shadow: 0 1px 3px rgba(31, 36, 55, 0.06);
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
  font-size: 12px;
}

.lf-node-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(31, 36, 55, 0.12);
}

/* 选中高亮：主色描边（vue-flow 侧 .selected .lf-node-card 规则兜底双保险） */
.lf-node-card.is-selected {
  border-color: var(--el-color-primary);
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--el-color-primary) 28%, transparent),
    0 6px 18px rgba(0, 0, 0, 0.1);
}

/* 类型色条 */
.type-bar {
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: currentColor;
  opacity: 0.9;
}

/* 运行状态徽标 */
.run-badge {
  position: absolute;
  top: -7px;
  left: -7px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  color: #fff;
  font-size: 10px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  z-index: 6;
}

.run-badge.run-success {
  background: var(--el-color-success);
}

.run-badge.run-failed {
  background: var(--el-color-danger);
}

.run-badge.run-skipped {
  background: var(--el-color-info);
}

/* 运行结果描边 */
.lf-node-card.is-run-success {
  border-color: var(--el-color-success);
}

.lf-node-card.is-run-failed {
  border-color: var(--el-color-danger);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--el-color-danger) 22%, transparent);
}

/* 中性类型（START/END）色条弱化 */
.type-start .type-bar,
.type-end .type-bar {
  opacity: 0.55;
}

.node-delete {
  position: absolute;
  top: -8px;
  right: -8px;
  display: none;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--el-color-danger);
  color: #fff;
  font-size: 11px;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  z-index: 5;
}

.lf-node-card:hover .node-delete {
  display: flex;
}

.node-delete:hover {
  transform: scale(1.1);
}

.node-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.node-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 19px;
  height: 19px;
  flex-shrink: 0;
  border-radius: 5px;
  border: 1px solid transparent;
  font-size: 10px;
  font-weight: 700;
}

.node-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-summary {
  margin-top: 3px;
  font-size: 10px;
  color: var(--el-text-color-secondary);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.node-tag {
  display: inline-flex;
  align-items: center;
  padding: 0 5px;
  height: 14px;
  border-radius: 4px;
  font-size: 9px;
  line-height: 1;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.var-tag {
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--el-color-primary) 25%, transparent);
}

/* 多输出徽标：绿色系，↗ 前缀示意「展开写出」 */
.out-tag {
  color: var(--el-color-success);
  background: color-mix(in srgb, var(--el-color-success) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--el-color-success) 25%, transparent);
}

.ignore-tag {
  color: var(--el-color-warning);
  background: color-mix(in srgb, var(--el-color-warning) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--el-color-warning) 25%, transparent);
}

/* CONDITION 真/假分支标注 */
.handle-branch {
  cursor: crosshair;
}

/* BATCH 循环连接点（右侧，紫罗兰实心醒目）。
 * 提权：.vue-flow__handle 主题规则与 .handle-loop 同特异性且后注入会覆盖，
 * 借 .lf-node-card 提到 (0,3,0) 稳赢 */
.lf-node-card .handle-loop {
  width: 10px;
  height: 10px;
  cursor: crosshair;
  background: color-mix(in srgb, var(--lf-batch) 55%, var(--el-bg-color));
  border: 1.5px solid var(--lf-batch);
}

/* 循环标签：节点右侧（连接点同侧），上下错开避让 U 形水平段，实底保可读 */
.loop-label {
  position: absolute;
  left: 100%;
  margin-left: 8px;
  font-size: 9px;
  line-height: 1;
  padding: 1px 5px;
  border-radius: 4px;
  pointer-events: none;
  white-space: nowrap;
  color: var(--lf-batch);
  background: color-mix(in srgb, var(--lf-batch) 10%, var(--el-bg-color));
  border: 1px solid color-mix(in srgb, var(--lf-batch) 28%, transparent);
  box-shadow: 0 0 0 2px var(--el-bg-color);
}

.loop-label-start {
  top: 30%;
  transform: translateY(calc(-50% - 13px));
}

.loop-label-end {
  top: 74%;
  transform: translateY(calc(-50% + 13px));
}

.branch-label {
  position: absolute;
  bottom: -17px;
  transform: translateX(-50%);
  font-size: 10px;
  line-height: 1;
  padding: 1px 5px;
  border-radius: 4px;
  pointer-events: none;
}

.label-true {
  left: 28%;
  color: var(--el-color-success);
  background: color-mix(in srgb, var(--el-color-success) 10%, transparent);
}

.label-false {
  left: 72%;
  color: var(--el-color-danger);
  background: color-mix(in srgb, var(--el-color-danger) 8%, transparent);
}

/* 失败路由（error）出点：红色实心醒目，与 CONDITION 假分支同色系但形状区分 */
.lf-node-card .branch-error {
  width: 10px;
  height: 10px;
  cursor: crosshair;
  background: color-mix(in srgb, var(--el-color-danger) 55%, var(--el-bg-color));
  border: 1.5px solid var(--el-color-danger);
}

.label-error {
  left: 74%;
  color: var(--el-color-danger);
  background: color-mix(in srgb, var(--el-color-danger) 10%, transparent);
  font-weight: 600;
}
</style>
