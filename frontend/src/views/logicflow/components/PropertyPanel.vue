<template>
  <div class="property-panel" :class="{ collapsed }" @submit.prevent>
    <!-- 折叠态：竖条 -->
    <div v-if="collapsed" class="collapse-bar" title="展开属性面板" @click="collapsed = false">
      <span class="bar-text">属性</span>
      <el-icon class="bar-icon"><Setting /></el-icon>
    </div>

    <!-- 展开态 -->
    <template v-else>
      <div class="panel-header">
        <div class="panel-heading">
          <el-icon class="heading-icon"><Setting /></el-icon>
          <span>属性配置</span>
        </div>
        <div class="panel-tags">
          <el-tag v-if="node" size="small" effect="plain" class="node-type-tag">
            {{ nodeTypeLabel }}
          </el-tag>
          <el-icon v-if="node" class="header-action" title="删除该节点" @click="emit('remove', node.id)">
            <Delete />
          </el-icon>
          <el-icon class="collapse-toggle" title="折叠面板" @click="collapsed = true"><Fold /></el-icon>
        </div>
      </div>

      <!-- 节点 ID（只读，点击复制） -->
      <div v-if="node" class="panel-meta">
        <span class="meta-label">ID</span>
        <span class="meta-value" :title="node.id">{{ node.id }}</span>
        <el-icon class="meta-copy" title="复制节点 ID" @click="copyNodeId"><CopyDocument /></el-icon>
      </div>

      <div class="panel-body">
        <el-empty v-if="!node" description="选中画布节点编辑属性" :image-size="80" />

        <el-form v-else label-position="top" size="default" class="panel-form">
          <!-- ===== 公共：名称 ===== -->
          <el-form-item label="节点名称">
            <el-input v-model="node.data.name" maxlength="64" placeholder="请输入节点名称" />
          </el-form-item>

          <!-- ===== HTTP ===== -->
          <template v-if="node.data.nodeType === 'HTTP'">
            <el-form-item label="请求 URL" required>
              <el-input v-model="httpCfg.url" placeholder="https://host/api/path" clearable />
            </el-form-item>
            <el-form-item label="请求方法">
              <el-select v-model="httpCfg.method" style="width: 100%">
                <el-option v-for="m in HTTP_METHODS" :key="m" :label="m" :value="m" />
              </el-select>
            </el-form-item>

            <div class="rows-block">
              <div class="rows-head">
                <span>请求头 Headers</span>
                <el-button size="small" text type="primary" @click="addHeader">添加</el-button>
              </div>
              <div v-if="!headerRows.length" class="rows-empty">暂无请求头</div>
              <div v-for="(row, i) in headerRows" :key="i" class="kv-row">
                <el-input v-model="row.key" size="small" placeholder="名称" @input="syncHeaders" />
                <el-input v-model="row.value" size="small" placeholder="值" @input="syncHeaders" />
                <el-button size="small" text type="danger" @click="removeHeader(i)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
            </div>

            <div class="rows-block">
              <div class="rows-head">
                <span>Query 参数</span>
                <el-button size="small" text type="primary" @click="addParam('queryParams')">添加</el-button>
              </div>
              <div v-if="!httpCfg.queryParams.length" class="rows-empty">暂无参数</div>
              <div v-for="(row, i) in httpCfg.queryParams" :key="i" class="kv-row">
                <el-input v-model="row.source" size="small" placeholder="变量名" />
                <el-input v-model="row.target" size="small" placeholder="参数名" />
                <el-button size="small" text type="danger" @click="removeParam('queryParams', i)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
            </div>

            <div class="rows-block">
              <div class="rows-head">
                <span>Body 参数</span>
                <el-button size="small" text type="primary" @click="addParam('bodyParams')">添加</el-button>
              </div>
              <div v-if="!httpCfg.bodyParams.length" class="rows-empty">暂无参数</div>
              <div v-for="(row, i) in httpCfg.bodyParams" :key="i" class="kv-row">
                <el-input v-model="row.source" size="small" placeholder="变量名" />
                <el-input v-model="row.target" size="small" placeholder="参数名" />
                <el-button size="small" text type="danger" @click="removeParam('bodyParams', i)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
            </div>

            <div class="num-grid">
              <el-form-item label="连接超时(ms)">
                <el-input-number v-model="httpCfg.connTimeoutMs" :min="0" :step="500" controls-position="right" style="width: 100%" />
              </el-form-item>
              <el-form-item label="读取超时(ms)">
                <el-input-number v-model="httpCfg.readTimeoutMs" :min="0" :step="500" controls-position="right" style="width: 100%" />
              </el-form-item>
              <el-form-item label="重试次数">
                <el-input-number v-model="httpCfg.retryCount" :min="0" :max="10" controls-position="right" style="width: 100%" />
              </el-form-item>
            </div>
          </template>

          <!-- ===== BEAN ===== -->
          <template v-else-if="node.data.nodeType === 'BEAN'">
            <el-form-item label="Bean 名称" required>
              <!-- Bean 清单加载失败降级为输入框 -->
              <el-select
                v-if="!beanLoadFailed"
                v-model="beanCfg.beanName"
                filterable
                allow-create
                default-first-option
                placeholder="选择或输入 Bean 名称"
                style="width: 100%"
                @change="onBeanChanged"
              >
                <el-option v-for="name in beanNames" :key="name" :label="name" :value="name" />
              </el-select>
              <el-input v-else v-model="beanCfg.beanName" placeholder="请输入 Bean 名称" />
            </el-form-item>
            <el-form-item label="方法名" required>
              <el-select
                v-if="!beanLoadFailed && beanMethods.length"
                v-model="beanCfg.methodName"
                filterable
                allow-create
                default-first-option
                placeholder="选择方法"
                style="width: 100%"
              >
                <el-option v-for="m in beanMethods" :key="m.value" :label="m.label" :value="m.value" />
              </el-select>
              <el-input v-else v-model="beanCfg.methodName" placeholder="请输入方法名" />
            </el-form-item>

            <div class="rows-block">
              <div class="rows-head">
                <span>方法参数</span>
                <el-button size="small" text type="primary" @click="addParam('params')">添加</el-button>
              </div>
              <div v-if="!beanCfg.params.length" class="rows-empty">暂无参数</div>
              <div v-for="(row, i) in beanCfg.params" :key="i" class="kv-row">
                <el-input v-model="row.source" size="small" placeholder="变量名" />
                <el-input v-model="row.target" size="small" placeholder="参数名" />
                <el-button size="small" text type="danger" @click="removeParam('params', i)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
            </div>

            <el-alert
              v-if="beanLoadFailed"
              title="Bean 清单加载失败，已降级为手动输入"
              type="info"
              :closable="false"
              show-icon
              class="panel-alert"
            />
          </template>

          <!-- ===== SCRIPT ===== -->
          <template v-else-if="node.data.nodeType === 'SCRIPT'">
            <el-alert
              title="脚本将在服务端执行，注意安全"
              type="warning"
              :closable="false"
              show-icon
              class="panel-alert"
            />
            <el-form-item label="脚本语言">
              <el-input model-value="groovy" readonly />
            </el-form-item>
            <el-form-item label="脚本内容" required>
              <el-input
                v-model="scriptCfg.source"
                type="textarea"
                :rows="10"
                class="script-source"
                placeholder="return 'hello ' + vars.name"
              />
            </el-form-item>
          </template>

          <!-- ===== CONDITION ===== -->
          <template v-else-if="node.data.nodeType === 'CONDITION'">
            <el-form-item label="判断变量" required>
              <el-input v-model="conditionCfg.variable" placeholder="变量名，如 risk" />
            </el-form-item>
            <el-form-item label="运算符">
              <el-select v-model="conditionCfg.operator" style="width: 100%">
                <el-option v-for="op in OPERATORS" :key="op.value" :label="op.label" :value="op.value" />
              </el-select>
            </el-form-item>
            <el-form-item v-if="!isEmptyOperator" label="比较值">
              <el-input v-model="conditionCfg.value" placeholder="字面量或 {{var}}" />
            </el-form-item>
          </template>

          <!-- ===== 公共：结果变量 / 异常策略（START/END/CONDITION 无） ===== -->
          <template v-if="hasExecutionMeta">
            <el-form-item label="结果写入变量（resultVar）">
              <el-input v-model="node.data.resultVar" placeholder="如 riskResult，留空不保存" clearable />
            </el-form-item>
            <el-form-item label="异常处理">
              <el-select v-model="node.data.errorAction" style="width: 100%">
                <el-option label="失败中断（FAIL_FLOW）" value="FAIL_FLOW" />
                <el-option label="忽略继续（IGNORE_CONTINUE）" value="IGNORE_CONTINUE" />
              </el-select>
            </el-form-item>
          </template>
        </el-form>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { CopyDocument, Delete, Fold, Setting } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { logicFlowApi } from '@/api/logicFlow'
import type { BackendBeanInfo } from '@/api/logicFlow'
import { nodeTypeLabel as typeLabel } from '../utils/nodeMeta'
import { defaultConfig, type FlowNode, type HttpNodeConfig } from '../utils/dsl'

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
const OPERATORS = [
  { label: '等于（EQ）', value: 'EQ' },
  { label: '不等于（NE）', value: 'NE' },
  { label: '大于（GT）', value: 'GT' },
  { label: '小于（LT）', value: 'LT' },
  { label: '大于等于（GTE）', value: 'GTE' },
  { label: '小于等于（LTE）', value: 'LTE' },
  { label: '为空（EMPTY）', value: 'EMPTY' },
  { label: '不为空（NOT_EMPTY）', value: 'NOT_EMPTY' },
] as const

const props = defineProps<{ node?: FlowNode | null; collapsed?: boolean }>()
const emit = defineEmits<{ 'update:collapsed': [value: boolean]; remove: [id: string] }>()

const collapsed = computed({
  get: () => props.collapsed ?? false,
  set: (val) => emit('update:collapsed', val),
})

const node = computed(() => props.node ?? null)
const nodeTypeLabel = computed(() => (node.value ? typeLabel(node.value.data.nodeType) : ''))
const hasExecutionMeta = computed(
  () => !!node.value && ['HTTP', 'BEAN', 'SCRIPT'].includes(node.value.data.nodeType)
)

/** 兜底补齐 config（历史 DSL 缺字段时按类型默认值补全） */
function ensureConfig<T>(): T {
  const n = node.value!
  if (!n.data.config || typeof n.data.config !== 'object') {
    n.data.config = defaultConfig(n.data.nodeType)
  }
  return n.data.config as T
}

const httpCfg = computed(() => ensureConfig<HttpNodeConfig>())
const beanCfg = computed(() => ensureConfig<{ beanName: string; methodName: string; params: { source: string; target: string }[] }>())
const scriptCfg = computed(() => ensureConfig<{ language: string; source: string }>())
const conditionCfg = computed(() => ensureConfig<{ variable: string; operator: string; value?: string }>())

const isEmptyOperator = computed(
  () => conditionCfg.value.operator === 'EMPTY' || conditionCfg.value.operator === 'NOT_EMPTY'
)

// ===== Headers：Record<string,string> ↔ 键值对动态行 =====
interface KvRow {
  key: string
  value: string
}
const headerRows = ref<KvRow[]>([])

function loadHeaderRows() {
  if (!node.value || node.value.data.nodeType !== 'HTTP') {
    headerRows.value = []
    return
  }
  const headers = httpCfg.value?.headers || {}
  headerRows.value = Object.entries(headers).map(([key, value]) => ({ key, value: String(value ?? '') }))
}

function syncHeaders() {
  const map: Record<string, string> = {}
  for (const row of headerRows.value) {
    const key = row.key.trim()
    if (key) map[key] = row.value
  }
  httpCfg.value.headers = map
}

function addHeader() {
  headerRows.value.push({ key: '', value: '' })
}

function removeHeader(index: number) {
  headerRows.value.splice(index, 1)
  syncHeaders()
}

// ===== 参数对动态行（queryParams/bodyParams/params：config 内直接增删） =====
type ParamListKey = 'queryParams' | 'bodyParams' | 'params'

function paramList(key: ParamListKey): { source: string; target: string }[] {
  if (key === 'params') return beanCfg.value.params
  return httpCfg.value[key]
}

function addParam(key: ParamListKey) {
  paramList(key).push({ source: '', target: '' })
}

function removeParam(key: ParamListKey, index: number) {
  paramList(key).splice(index, 1)
}

// ===== BEAN 清单：onMounted 拉取，失败降级输入框 =====
const beans = ref<BackendBeanInfo[]>([])
const beanLoadFailed = ref(false)

onMounted(async () => {
  try {
    const res = await logicFlowApi.listBeans()
    beans.value = res.data || []
  } catch {
    // http 拦截器已提示；降级为输入框
    beanLoadFailed.value = true
  }
})

const beanNames = computed(() => [...new Set(beans.value.map((b) => b.beanName))])

const beanMethods = computed(() =>
  beans.value
    .filter((b) => b.beanName === beanCfg.value.beanName)
    .map((b) => ({
      label: b.displayName ? `${b.methodName}（${b.displayName}）` : b.methodName,
      value: b.methodName,
    }))
)

function onBeanChanged() {
  // 切换 Bean 后，若方法名不属于该 Bean 则清空，避免悬挂非法组合
  const ok = beanMethods.value.some((m) => m.value === beanCfg.value.methodName)
  if (!ok) beanCfg.value.methodName = ''
}

// ===== 选中节点切换：重建 Headers 行（其余字段直接绑 config，无需重建） =====
watch(
  () => node.value?.id,
  () => loadHeaderRows(),
  { immediate: true }
)

async function copyNodeId() {
  const id = node.value?.id
  if (!id) return
  try {
    await navigator.clipboard.writeText(id)
    ElMessage.success(`已复制节点 ID：${id}`)
  } catch {
    ElMessage.warning('复制失败，请手动选择复制')
  }
}
</script>

<style scoped>
/* 悬浮卡片：与左侧调色板对称 */
.property-panel {
  position: absolute;
  top: 12px;
  right: 12px;
  bottom: 12px;
  z-index: 20;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  box-shadow:
    0 6px 24px rgba(31, 36, 55, 0.14),
    0 1px 4px rgba(31, 36, 55, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.2s ease;
}

.property-panel:not(.collapsed) {
  width: 288px;
}

.property-panel.collapsed {
  width: 32px;
}

/* ===== 折叠态 ===== */
.collapse-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 100%;
  cursor: pointer;
  gap: 6px;
  color: var(--el-text-color-regular);
  background: var(--el-bg-color-page);
  transition: background 0.2s, color 0.2s;
}

.collapse-bar:hover {
  background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
  color: var(--el-color-primary);
}

.bar-icon {
  font-size: 18px;
}

.bar-text {
  font-size: 12px;
  writing-mode: vertical-rl;
  letter-spacing: 2px;
  color: var(--el-text-color-secondary);
}

/* ===== 头部 ===== */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--el-border-color-light);
  flex-shrink: 0;
}

.panel-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.heading-icon {
  color: var(--el-color-primary);
  font-size: 16px;
}

.panel-tags {
  display: flex;
  align-items: center;
  gap: 8px;
}

.node-type-tag {
  font-weight: 600;
}

.header-action {
  cursor: pointer;
  color: var(--el-text-color-secondary);
  font-size: 15px;
  transition: color 0.2s;
}

.header-action:hover {
  color: var(--el-color-danger);
}

.collapse-toggle {
  cursor: pointer;
  color: var(--el-text-color-secondary);
  font-size: 16px;
  transition: color 0.2s;
}

.collapse-toggle:hover {
  color: var(--el-color-primary);
}

/* ===== 节点 ID 行 ===== */
.panel-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  background: color-mix(in srgb, var(--el-color-primary) 4%, transparent);
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

.meta-label {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: var(--el-text-color-secondary);
}

.meta-value {
  flex: 1;
  min-width: 0;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: all;
}

.meta-copy {
  flex-shrink: 0;
  cursor: pointer;
  font-size: 14px;
  color: var(--el-text-color-secondary);
  transition: color 0.2s;
}

.meta-copy:hover {
  color: var(--el-color-primary);
}

/* ===== 主体：超高滚动 ===== */
.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
  background: var(--el-bg-color-page);
}

.panel-form {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  padding: 12px 12px 4px;
  box-shadow: 0 1px 3px rgba(31, 36, 55, 0.04);
}

/* ===== 动态行块 ===== */
.rows-block {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 8px 8px 4px;
  margin-bottom: 14px;
  background: color-mix(in srgb, var(--el-bg-color-page) 55%, transparent);
}

.rows-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-regular);
  margin-bottom: 6px;
}

.rows-empty {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  text-align: center;
  padding: 4px 0 8px;
}

.kv-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.kv-row .el-input {
  flex: 1;
  min-width: 0;
}

.kv-row .el-button {
  flex-shrink: 0;
  padding: 4px;
}

.num-grid :deep(.el-form-item) {
  margin-bottom: 14px;
}

/* 脚本编辑：等宽字体 */
.script-source :deep(textarea) {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  line-height: 1.6;
}

.panel-alert {
  margin-bottom: 14px;
}

.panel-form :deep(.el-form-item__label) {
  font-size: 12px;
  color: var(--el-text-color-regular);
  margin-bottom: 4px;
}

.panel-form :deep(.el-form-item) {
  margin-bottom: 14px;
}
</style>
