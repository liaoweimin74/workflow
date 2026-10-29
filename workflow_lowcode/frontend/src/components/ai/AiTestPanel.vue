<template>
  <div class="ai-test-panel">
    <!-- 顶部操作条 -->
    <div class="atp-toolbar">
      <el-button size="small" :type="recording ? 'danger' : 'primary'" :disabled="replaying" @click="toggleRecord">
        {{ recording ? '■ 停止录制' : '● 录制用例' }}
      </el-button>
      <el-tooltip
        content="让 AI 基于当前页面的组件清单（查询条件/表格列/表单字段/按钮）自动设计一组测试用例并保存，可在本页签回放"
        placement="bottom"
      >
        <el-button size="small" :loading="generating" :disabled="replaying || recording" @click="onGenerate">
          {{ generating ? '生成中…' : 'AI 生成用例' }}
        </el-button>
      </el-tooltip>
      <div class="atp-toolbar-spacer" />
      <el-button size="small" text :disabled="replaying" @click="importCases">导入</el-button>
      <el-button size="small" text :disabled="!cases.length" @click="exportCases">导出</el-button>
      <el-button size="small" text type="danger" :disabled="!cases.length || replaying" @click="clearAll">清空</el-button>
    </div>
    <div v-if="recording" class="atp-recording-tip">
      <el-icon class="is-loading"><Loading /></el-icon>
      正在录制「{{ recorder.recordingName() }}」——AI 对话操作与页面手动点击/输入均会自动记入用例
    </div>
    <div v-else-if="generating" class="atp-generating-tip">
      <el-icon class="is-loading"><Loading /></el-icon>
      AI 正在基于当前页面组件清单设计测试用例，完成后自动出现在列表…
    </div>

    <!-- 来源筛选 -->
    <div v-if="cases.length" class="atp-filter">
      <button
        v-for="f in FILTERS"
        :key="f.key"
        class="atp-filter-chip"
        :class="{ active: sourceFilter === f.key }"
        @click="sourceFilter = f.key"
      >
        {{ f.label }}<span v-if="f.key !== 'all'" class="atp-filter-count">{{ countBySource(f.key) }}</span>
      </button>
    </div>

    <!-- 用例列表 -->
    <div class="atp-list">
      <el-empty
        v-if="!cases.length"
        description="暂无用例：手动录制、AI 生成或导入 JSON"
        :image-size="60"
      />
      <el-empty v-else-if="!filteredCases.length" description="该来源下暂无用例" :image-size="60" />
      <div v-for="c in filteredCases" :key="c.id" class="atp-case" :class="{ current: currentCaseId === c.id }">
        <div class="atp-case-main" @click="viewDetail(c)">
          <div class="atp-case-name" :title="c.name">
            {{ c.name }}
            <el-tag v-if="c.source === 'manual'" size="small" type="warning" class="atp-tag">手动</el-tag>
            <el-tag v-else-if="c.source === 'mixed'" size="small" type="success" class="atp-tag">混合</el-tag>
            <el-tag v-else size="small" type="info" class="atp-tag">AI</el-tag>
            <el-tag v-if="c.narrative" size="small" type="primary" class="atp-tag">中文</el-tag>
          </div>
          <div class="atp-case-meta">
            {{ c.actions.length }} 步 · {{ shortRoute(c.pageRoute) }} · {{ shortTime(c.createdAt) }}
          </div>
        </div>
        <div class="atp-case-actions">
          <el-button size="small" type="primary" text :disabled="replaying" @click="replay(c)">回放</el-button>
          <el-button size="small" text :disabled="replaying" @click="viewDetail(c)">详情</el-button>
          <el-dropdown trigger="click" @command="(cmd: string) => onCaseMenu(cmd, c)">
            <el-button size="small" text :disabled="replaying">⋯</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="narrate">{{ c.narrative ? '重新转写中文' : 'AI 转中文用例' }}</el-dropdown-item>
                <el-dropdown-item command="rename">重命名</el-dropdown-item>
                <el-dropdown-item command="export">导出本条</el-dropdown-item>
                <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </div>

    <!-- 用例详情（动作序列明细 + 中文用例） -->
    <el-dialog v-model="detailVisible" :title="detailCase?.name ?? '用例详情'" width="460px" append-to-body>
      <div v-if="detailCase" class="atp-detail-body">
        <!-- 元信息 -->
        <div class="atp-detail-meta">
          <div class="atp-meta-row">
            <span class="atp-meta-label">来源</span>
            <span>{{ sourceLabel(detailCase.source) }}</span>
            <span class="atp-meta-label">步骤</span>
            <span>{{ detailCase.actions.length }}</span>
          </div>
          <div class="atp-meta-row">
            <span class="atp-meta-label">页面</span>
            <span class="atp-meta-route" :title="detailCase.pageRoute">{{ detailCase.pageRoute || '—' }}</span>
          </div>
          <div class="atp-meta-row">
            <span class="atp-meta-label">创建</span>
            <span>{{ formatTime(detailCase.createdAt) }}</span>
          </div>
        </div>

        <!-- 中文用例（若已转写） -->
        <template v-if="detailCase.narrative">
          <div class="atp-section-title">中文用例</div>
          <div class="atp-nar-summary">{{ detailCase.narrative.summary }}</div>
          <ol class="atp-nar-steps atp-nar-steps-inset">
            <li v-for="(s, i) in detailCase.narrative.steps" :key="i" class="atp-nar-step">
              <div class="atp-nar-text">{{ s.text }}</div>
              <div v-if="s.expect" class="atp-nar-expect">预期：{{ s.expect }}</div>
            </li>
          </ol>
        </template>

        <!-- 动作序列明细 -->
        <div class="atp-section-title">动作序列（可回放的精确指令）</div>
        <div class="atp-action-list">
          <div v-for="(a, i) in detailCase.actions" :key="i" class="atp-action-row">
            <span class="atp-action-idx">{{ i + 1 }}</span>
            <div class="atp-action-body">
              <div class="atp-action-head">
                <code class="atp-action-op">{{ opLabel(a.op) }}</code>
                <span v-if="a.target" class="atp-action-target">{{ a.target }}</span>
                <span v-if="a.field" class="atp-action-target">{{ a.field }}</span>
              </div>
              <div v-if="a.value !== undefined && a.value !== ''" class="atp-action-line">
                值：<code class="atp-action-value">{{ stringifyValue(a.value) }}</code>
              </div>
              <div v-if="a.params && Object.keys(a.params).length" class="atp-action-line">
                参数：<code class="atp-action-value">{{ stringifyValue(a.params) }}</code>
              </div>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <div v-if="detailCase" class="atp-detail-footer">
          <el-button size="small" text @click="copyCaseText(detailCase)">复制文本</el-button>
          <el-button size="small" :disabled="replaying" @click="narrateFromDetail">AI 转中文</el-button>
          <el-button size="small" type="primary" :disabled="replaying" @click="replayFromDetail">回放</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 回放报告 -->
    <el-dialog v-model="reportVisible" :title="`回放报告：${report?.caseName ?? ''}`" width="360px" append-to-body>
      <template v-if="report">
        <div class="atp-report-summary" :class="{ pass: report.allPassed }">
          {{ report.allPassed ? '✅ 全部通过' : '❌ 存在失败' }} ·
          通过 {{ report.passed }} / 失败 {{ report.failed }} · {{ report.durationMs }}ms
        </div>
        <div class="atp-report-steps">
          <div v-for="s in report.steps" :key="s.index" class="atp-report-step" :class="{ fail: !s.ok }">
            <span class="atp-step-ok">{{ s.ok ? '✓' : '✗' }}</span>
            <span class="atp-step-op">{{ s.op }}{{ s.target ? `(${s.target})` : '' }}</span>
            <span v-if="s.error" class="atp-step-err" :title="s.error">{{ s.error }}</span>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import { executeAiActions } from '@/utils/aiPageExecutor'
import { aiManualRecorder } from '@/utils/aiManualRecorder'
import { aiTestRecorder, type AiTestCase, type AiTestReport } from '@/utils/aiTestRecorder'
import { narrateTestCase } from '@/api/ai'
import { useAiAssistantStore } from '@/stores/aiAssistantStore'

defineProps<{ generating?: boolean }>()

const emit = defineEmits<{ (e: 'generate'): void }>()

const route = useRoute()
const router = useRouter()
const store = useAiAssistantStore()
const recorder = aiTestRecorder

const cases = ref<AiTestCase[]>([])
const recording = ref(false)
const replaying = ref(false)
const reportVisible = ref(false)
const report = ref<AiTestReport | null>(null)
const currentCaseId = ref('')
const narrating = ref(false)
const sourceFilter = ref<'all' | 'ai' | 'manual' | 'mixed'>('all')
const detailVisible = ref(false)
const detailCase = ref<AiTestCase | null>(null)

const FILTERS: { key: 'all' | 'ai' | 'manual' | 'mixed'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'manual', label: '手动' },
  { key: 'ai', label: 'AI' },
  { key: 'mixed', label: '混合' },
]

const filteredCases = computed(() =>
  sourceFilter.value === 'all' ? cases.value : cases.value.filter((c) => (c.source ?? 'ai') === sourceFilter.value),
)

let unsubscribe: (() => void) | null = null
onMounted(() => {
  refresh()
  // 任意来源（AI 生成/导入/删除/录制保存）变更用例库后自动刷新列表
  unsubscribe = recorder.subscribe(refresh)
})
onUnmounted(() => unsubscribe?.())

function refresh(): void {
  cases.value = recorder.list()
  recording.value = recorder.isRecording()
}

function countBySource(key: 'all' | 'ai' | 'manual' | 'mixed'): number {
  if (key === 'all') return cases.value.length
  return cases.value.filter((c) => (c.source ?? 'ai') === key).length
}

function sourceLabel(source?: AiTestCase['source']): string {
  return source === 'manual' ? '手动操作' : source === 'mixed' ? 'AI + 手动混合' : 'AI 操作'
}

function opLabel(op: string): string {
  const map: Record<string, string> = {
    'set-query': '设置查询条件',
    search: '执行查询',
    reset: '重置条件',
    'set-value': '表单赋值',
    'set-filter': '组件筛选',
    click: '点击',
    fill: '输入',
    'open-create': '打开新增',
    'open-edit': '打开编辑',
    'open-container': '打开容器',
    'close-container': '关闭容器',
    submit: '提交表单',
    validate: '校验表单',
    'delete-rows': '删除选中行',
    refresh: '刷新',
    sort: '排序',
    navigate: '跳转页面',
    'get-state': '读取状态',
    'read-table': '读取表格',
    expect: '断言',
    'check-menu': '勾选菜单',
    'submit-menu': '保存菜单',
    'save-record': '保存记录',
    'save-container': '保存容器',
  }
  return map[op] ?? op
}

function stringifyValue(value: unknown): string {
  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value)
    return text && text.length > 80 ? `${text.slice(0, 80)}…` : text ?? ''
  } catch {
    return String(value)
  }
}

function formatTime(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function shortTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function shortRoute(path: string): string {
  if (!path) return ''
  return path.length > 24 ? `${path.slice(0, 24)}…` : path
}

/** 录制开关：停止时保存用例；手动操作捕获与录制会话同开同关 */
function toggleRecord(): void {
  if (recorder.isRecording()) {
    aiManualRecorder.stop()
    const saved = recorder.stop()
    if (saved) {
      ElMessage.success(`用例已保存：${saved.name}（${saved.actions.length} 步 · ${sourceLabel(saved.source)}）`)
    } else {
      ElMessage.info('未捕获到动作，用例未保存')
    }
  } else {
    recorder.start(`用例 ${new Date().toLocaleTimeString()}`, route.path)
    aiManualRecorder.start()
    ElMessage.success('开始录制——AI 对话操作或直接手动操作页面均可')
    // 让位：用户要去页面上手动操作，浮窗自动收起（球上有录制进度可见）
    store.requestCollapse()
  }
  refresh()
}

function onGenerate(): void {
  emit('generate')
}

/** 查看用例详情：元信息 + 中文用例 + 动作序列明细 */
function viewDetail(c: AiTestCase): void {
  detailCase.value = c
  detailVisible.value = true
}

/** 回放：先导航到录制页面（留足加载时间），再顺序执行 + 断言；回放期间暂停手动捕获 */
async function replay(testCase: AiTestCase): Promise<void> {
  replaying.value = true
  currentCaseId.value = testCase.id
  aiManualRecorder.pause()
  try {
    if (testCase.pageRoute && route.path !== testCase.pageRoute) {
      await router.push(testCase.pageRoute)
      // 等待页面加载 + 执行器注册（L1 清单在数据加载后才上报）
      await new Promise((r) => window.setTimeout(r, 1500))
    }
    report.value = await recorder.replay(testCase, (actions) =>
      executeAiActions(actions, {
        replay: true,
        autoConfirm: store.autoConfirm,
        confirm: (message) =>
          ElMessageBox.confirm(message, '回放操作确认', { confirmButtonText: '执行', cancelButtonText: '跳过', type: 'warning' })
            .then(() => true)
            .catch(() => false),
      }),
    )
    detailVisible.value = false
    reportVisible.value = true
    refresh()
  } finally {
    aiManualRecorder.resume()
    replaying.value = false
  }
}

function replayFromDetail(): void {
  if (detailCase.value) void replay(detailCase.value)
}

async function narrateFromDetail(): Promise<void> {
  if (detailCase.value) await narrate(detailCase.value)
}

async function onCaseMenu(cmd: string, c: AiTestCase): Promise<void> {
  if (cmd === 'delete') {
    const ok = await ElMessageBox.confirm(`确定删除用例「${c.name}」？该操作不可恢复。`, '删除用例', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    }).then(() => true).catch(() => false)
    if (ok) {
      recorder.remove(c.id)
      ElMessage.success('用例已删除')
    }
  } else if (cmd === 'rename') {
    const { value } = await ElMessageBox.prompt('用例名称', '重命名', { inputValue: c.name })
    if (value) {
      recorder.rename(c.id, value)
      ElMessage.success('已重命名')
    }
  } else if (cmd === 'export') {
    download(JSON.stringify({ version: 1, cases: [c] }, null, 2), `ai-case-${c.name}.json`)
  } else if (cmd === 'narrate') {
    await narrate(c)
  }
}

/** 清空全部用例（带确认） */
async function clearAll(): Promise<void> {
  const ok = await ElMessageBox.confirm(`确定清空全部 ${cases.value.length} 条用例？该操作不可恢复，建议先导出备份。`, '清空用例', {
    confirmButtonText: '清空',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(() => true).catch(() => false)
  if (ok) {
    recorder.clearAll()
    ElMessage.success('已清空全部用例')
  }
}

/** LLM 转写中文用例（动作序列 → 标题/摘要/步骤/预期） */
async function narrate(c: AiTestCase): Promise<void> {
  if (!c.actions.length) {
    ElMessage.warning('用例没有动作，无法转写')
    return
  }
  narrating.value = true
  try {
    const result = await narrateTestCase(c.pageRoute, c.name, c.actions)
    recorder.saveNarrative(c.id, result)
    ElMessage.success(`已生成中文用例：${result.title || c.name}`)
    if (detailCase.value?.id === c.id) detailCase.value = recorder.get(c.id) ?? detailCase.value
    else detailVisible.value = false
  } catch (e) {
    ElMessage.error((e as Error)?.message || '转写失败')
  } finally {
    narrating.value = false
  }
}

/** 复制用例可读文本（中文用例 + 动作序列） */
function copyCaseText(c: AiTestCase): void {
  const lines = [`【${c.name}】`, `页面：${c.pageRoute} · 来源：${sourceLabel(c.source)}`, '']
  if (c.narrative) {
    lines.push('— 中文用例 —', c.narrative.summary, '')
    c.narrative.steps.forEach((s, i) => {
      lines.push(`${i + 1}. ${s.text}`)
      if (s.expect) lines.push(`   预期：${s.expect}`)
    })
    lines.push('')
  }
  lines.push('— 动作序列 —')
  c.actions.forEach((a, i) => {
    const bits = [opLabel(a.op)]
    if (a.target) bits.push(a.target)
    if (a.field) bits.push(a.field)
    if (a.value !== undefined && a.value !== '') bits.push(`= ${stringifyValue(a.value)}`)
    lines.push(`${i + 1}. ${bits.join(' · ')}`)
  })
  void navigator.clipboard?.writeText(lines.join('\n'))
  ElMessage.success('已复制到剪贴板')
}

function exportCases(): void {
  if (!cases.value.length) return
  download(recorder.exportAll(), `ai-test-cases-${Date.now()}.json`)
}

async function importCases(): Promise<void> {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,application/json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const count = recorder.importAll(await file.text())
      ElMessage.success(`导入 ${count} 条用例`)
    } catch (e) {
      ElMessage.error((e as Error)?.message || '导入失败')
    }
  }
  input.click()
}

function download(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.ai-test-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.atp-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 14px 4px;
  flex-wrap: wrap;
}
.atp-toolbar-spacer {
  flex: 1;
}
.atp-recording-tip,
.atp-generating-tip {
  margin: 4px 14px 0;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  line-height: 1.5;
}
.atp-recording-tip {
  background: color-mix(in srgb, var(--el-color-danger) 10%, transparent);
  color: var(--el-color-danger);
}
.atp-generating-tip {
  background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
  color: var(--el-color-primary);
}
.atp-filter {
  display: flex;
  gap: 6px;
  padding: 8px 14px 0;
  flex-wrap: wrap;
}
.atp-filter-chip {
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color-overlay);
  color: var(--el-text-color-regular);
  border-radius: 999px;
  font-size: 11px;
  padding: 2px 10px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s ease;
}
.atp-filter-chip:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.atp-filter-chip.active {
  background: var(--el-color-primary);
  border-color: var(--el-color-primary);
  color: #fff;
}
.atp-filter-count {
  font-size: 10px;
  opacity: 0.75;
}
.atp-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.atp-case {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color-overlay);
  transition: border-color 0.15s ease;
}
.atp-case:hover,
.atp-case.current {
  border-color: var(--el-color-primary);
}
.atp-case-main {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}
.atp-case-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.atp-tag {
  margin-left: 4px;
  transform: scale(0.85);
}
.atp-case-meta {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.atp-case-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
/* 详情弹窗 */
.atp-detail-body {
  max-height: 60vh;
  overflow-y: auto;
}
.atp-detail-meta {
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}
.atp-meta-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  color: var(--el-text-color-regular);
}
.atp-meta-label {
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}
.atp-meta-label:not(:first-child) {
  margin-left: 12px;
}
.atp-meta-route {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.atp-section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin: 10px 0 6px;
}
.atp-nar-summary {
  font-size: 13px;
  color: var(--el-text-color-regular);
  padding: 8px 12px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--el-color-primary) 8%, transparent);
  line-height: 1.6;
}
.atp-nar-steps {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.atp-nar-steps-inset {
  max-height: 220px;
  overflow-y: auto;
  margin-top: 8px;
}
.atp-nar-text {
  font-size: 13px;
  color: var(--el-text-color-primary);
  line-height: 1.6;
}
.atp-nar-expect {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.atp-action-list {
  max-height: 260px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.atp-action-row {
  display: flex;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--el-fill-color-lighter);
}
.atp-action-idx {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--el-color-primary);
  color: #fff;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 1px;
}
.atp-action-body {
  flex: 1;
  min-width: 0;
}
.atp-action-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
}
.atp-action-op {
  font-size: 12px;
  color: var(--el-color-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.atp-action-target {
  font-size: 12px;
  color: var(--el-text-color-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  word-break: break-all;
}
.atp-action-line {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
  word-break: break-all;
}
.atp-action-value {
  color: var(--el-text-color-regular);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.atp-detail-footer {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}
/* 回放报告 */
.atp-report-summary {
  padding: 8px 12px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--el-color-danger) 10%, transparent);
  color: var(--el-color-danger);
  font-size: 13px;
  margin-bottom: 10px;
}
.atp-report-summary.pass {
  background: color-mix(in srgb, var(--el-color-success) 10%, transparent);
  color: var(--el-color-success);
}
.atp-report-steps {
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.atp-report-step {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--el-color-success) 7%, transparent);
}
.atp-report-step.fail {
  background: color-mix(in srgb, var(--el-color-danger) 9%, transparent);
}
.atp-step-ok {
  font-weight: 700;
}
.atp-report-step.fail .atp-step-ok {
  color: var(--el-color-danger);
}
.atp-step-op {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.atp-step-err {
  color: var(--el-color-danger);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}
</style>
