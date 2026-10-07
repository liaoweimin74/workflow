<template>
  <el-dialog
    :model-value="modelValue"
    :title="`运行测试${flowName ? '：' + flowName : ''}`"
    width="760px"
    :close-on-click-modal="false"
    append-to-body
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @open="onOpen"
  >
    <!-- 输入变量 -->
    <div class="run-section">
      <div class="section-head">
        <span class="section-title">输入变量</span>
        <el-button size="small" text type="primary" @click="addVar">添加变量</el-button>
      </div>
      <div v-if="!varRows.length" class="rows-empty">无输入变量，可直接运行</div>
      <div v-for="(row, i) in varRows" :key="i" class="var-row">
        <el-input v-model="row.key" placeholder="变量名" />
        <el-input v-model="row.value" placeholder="值（数字/对象等按 JSON 解析，其余按字符串）" />
        <el-button size="small" text type="danger" @click="removeVar(i)">
          <el-icon><Delete /></el-icon>
        </el-button>
      </div>
      <div class="section-foot">
        <el-button type="primary" :loading="running" @click="handleRun">
          {{ running ? '运行中…' : '运行' }}
        </el-button>
      </div>
    </div>

    <!-- 运行结果 -->
    <div v-if="result" class="run-result" v-loading="running">
      <div class="result-summary">
        <div class="summary-item">
          <span class="summary-label">状态</span>
          <el-tag :type="result.status === 'SUCCESS' ? 'success' : 'danger'" size="default">
            {{ result.status === 'SUCCESS' ? '成功' : '失败' }}
          </el-tag>
        </div>
        <div class="summary-item">
          <span class="summary-label">总耗时</span>
          <span class="summary-value">{{ result.durationMs }} ms</span>
        </div>
        <div v-if="result.runId" class="summary-item">
          <span class="summary-label">Run ID</span>
          <span class="summary-value mono">{{ result.runId }}</span>
        </div>
      </div>

      <el-alert
        v-if="result.errorMessage"
        :title="result.errorMessage"
        type="error"
        :closable="false"
        show-icon
        class="error-alert"
      />

      <!-- 节点轨迹 -->
      <div class="section-title traces-title">节点轨迹</div>
      <el-table :data="result.traces || []" border size="small" class="traces-table">
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="trace-expand">
              <div class="expand-block">
                <div class="expand-label">result</div>
                <pre class="json-pre">{{ pretty(row.result) }}</pre>
              </div>
              <div v-if="row.error" class="expand-block">
                <div class="expand-label">error</div>
                <pre class="json-pre error-pre">{{ row.error }}</pre>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="nodeName" label="节点" min-width="120" show-overflow-tooltip />
        <el-table-column prop="nodeId" label="ID" width="130" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="mono">{{ row.nodeId }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="type" label="类型" width="100" align="center">
          <template #default="{ row }">
            {{ nodeTypeLabel(row.type) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="traceTagType(row.status)" size="small">{{ traceLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="durationMs" label="耗时" width="90" align="right">
          <template #default="{ row }">{{ row.durationMs }} ms</template>
        </el-table-column>
        <el-table-column prop="error" label="错误" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.error" class="error-text">{{ row.error }}</span>
            <span v-else>—</span>
          </template>
        </el-table-column>
      </el-table>

      <!-- 输出变量 -->
      <div class="section-title traces-title">输出变量（outputVars）</div>
      <pre class="json-pre output-pre">{{ pretty(result.outputVars) }}</pre>
    </div>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Delete } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { logicFlowApi } from '@/api/logicFlow'
import type { RunResult } from '@/api/logicFlow'
import { nodeTypeLabel } from '../utils/nodeMeta'

const props = defineProps<{
  modelValue: boolean
  flowId: string
  flowName?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

interface VarRow {
  key: string
  value: string
}

const varRows = ref<VarRow[]>([])
const running = ref(false)
const result = ref<RunResult | null>(null)

function onOpen() {
  // 每次打开重置上次的运行结果与输入
  result.value = null
  if (!varRows.value.length) varRows.value = [{ key: '', value: '' }]
}

function addVar() {
  varRows.value.push({ key: '', value: '' })
}

function removeVar(index: number) {
  varRows.value.splice(index, 1)
}

/** 值解析：合法 JSON 用解析结果（数字/对象），否则按字符串 */
function parseValue(raw: string): unknown {
  const text = raw.trim()
  if (text === '') return ''
  try {
    return JSON.parse(text)
  } catch {
    return raw
  }
}

async function handleRun() {
  const vars: Record<string, unknown> = {}
  for (const row of varRows.value) {
    const key = row.key.trim()
    if (key) vars[key] = parseValue(row.value)
  }
  running.value = true
  result.value = null
  try {
    const res = await logicFlowApi.run(props.flowId, { vars })
    result.value = res.data
  } catch {
    // http 拦截器已弹出错误；结果区保持空
    ElMessage.warning('运行失败，请检查节点配置与后端服务')
  } finally {
    running.value = false
  }
}

function pretty(value: unknown): string {
  if (value === undefined || value === null || value === '') return '（空）'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function traceTagType(status: string): 'success' | 'danger' | 'info' {
  if (status === 'SUCCESS') return 'success'
  if (status === 'FAILED') return 'danger'
  return 'info'
}

function traceLabel(status: string): string {
  const map: Record<string, string> = { SUCCESS: '成功', FAILED: '失败', SKIPPED: '跳过' }
  return map[status] || status
}
</script>

<style scoped>
.run-section {
  margin-bottom: 8px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.traces-title {
  margin: 14px 0 8px;
}

.var-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.var-row .el-input {
  flex: 1;
  min-width: 0;
}

.var-row .el-button {
  flex-shrink: 0;
  padding: 5px;
}

.rows-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  text-align: center;
  padding: 8px 0;
  border: 1px dashed var(--el-border-color-lighter);
  border-radius: 8px;
  margin-bottom: 8px;
}

.section-foot {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}

/* ===== 结果区 ===== */
.run-result {
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 12px;
  min-height: 60px;
}

.result-summary {
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 10px 14px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--el-color-primary) 4%, transparent);
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.summary-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.summary-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.summary-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.mono {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
}

.error-alert {
  margin-bottom: 12px;
}

.error-text {
  color: var(--el-color-danger);
}

.trace-expand {
  padding: 8px 12px;
}

.expand-block {
  margin-bottom: 8px;
}

.expand-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
  letter-spacing: 0.5px;
}

.json-pre {
  margin: 0;
  padding: 10px 12px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 260px;
  overflow-y: auto;
}

.error-pre {
  color: var(--el-color-danger);
}

.output-pre {
  max-height: 220px;
}
</style>
