<template>
  <div class="events-config">
    <div class="config-header">
      <span class="config-title">事件动作链（声明式）</span>
      <el-button  type="primary" plain :icon="Plus" @click="addEvent">添加事件</el-button>
    </div>

    <div v-if="props.modelValue.length === 0" class="empty-hint">
      <el-empty description="暂无事件，添加事件以配置触发器动作链" :image-size="60" />
    </div>

    <div v-for="(ev, idx) in props.modelValue" :key="idx" class="event-card">
      <div class="event-head">
        <span class="event-title">事件 {{ idx + 1 }}</span>
        <el-button  type="danger" link :icon="Delete" @click="removeEvent(idx)">删除</el-button>
      </div>
      <el-form label-width="70px"  inline>
        <el-form-item label="触发器">
          <el-select
            :model-value="ev.trigger"
            
            style="width: 140px"
            @change="(v: string) => patchEvent(idx, { trigger: v })"
          >
            <!-- 兼容旧模式保存的触发器（如表格 cell-click 迁移到卡片），保留原值可选 -->
            <el-option
              v-if="ev.trigger && filteredTriggerValues.has(ev.trigger)"
              :label="`${legacyTriggerLabel(ev.trigger)}（旧）`"
              :value="ev.trigger"
            />
            <el-option v-for="t in triggerOptions" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标">
          <el-input
            :model-value="ev.target"
            
            placeholder="事件挂接组件 id，如 table / search / 按钮 key"
            style="width: 240px"
            @input="(v: string) => patchEvent(idx, { target: v })"
          />
        </el-form-item>
      </el-form>

      <div class="actions-chain">
        <div v-for="(action, ai) in ev.actions" :key="ai" class="action-row">
          <el-select
            :model-value="action.type"
            
            style="width: 130px"
            @change="(v: string) => patchAction(idx, ai, { type: v })"
          >
            <el-option v-for="a in actionTypeOptions" :key="a.value" :label="a.label" :value="a.value" />
          </el-select>
          <div class="action-params">
            <div v-for="(row, pi) in action.params" :key="pi" class="param-row">
              <el-input
                :model-value="row.key"
                
                placeholder="参数名"
                style="width: 120px"
                @input="(v: string) => patchParamKey(idx, ai, pi, v)"
              />
              <el-input
                :model-value="row.value"
                
                placeholder="值，支持 $row.xxx / $param.xxx 变量"
                style="width: 220px"
                @input="(v: string) => patchParamValue(idx, ai, pi, v)"
              />
              <el-button  link type="danger" @click="removeParam(idx, ai, pi)">删</el-button>
            </div>
            <el-button  link type="primary" @click="addParam(idx, ai)">+ 参数</el-button>
          </div>
          <el-button  type="danger" link @click="removeAction(idx, ai)">移除动作</el-button>
        </div>
        <el-button  link type="primary" @click="addAction(idx)">+ 动作</el-button>
      </div>
      <div class="var-hint">变量提示：$row.字段（当前行）/ $param.参数（页面参数）</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Plus, Delete } from '@element-plus/icons-vue'

export interface EventActionParam {
  key: string
  value: string
}
export interface EventAction {
  type: string
  params: EventActionParam[]
}
export interface PageEventConfig {
  trigger: string
  target: string
  actions: EventAction[]
}

const props = withDefaults(defineProps<{
  modelValue: PageEventConfig[]
  /** 展示模式：card 模式过滤表格专属触发器（首版 selection/cell 能力未实现） */
  mode?: 'table' | 'card'
}>(), {
  mode: 'table',
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: PageEventConfig[]): void
}>()

/** 表格专属触发器（卡片模式过滤；首版 selection/cell 能力未实现，后续放开） */
const TABLE_ONLY_TRIGGERS = new Set(['cell-click', 'selection-change', 'current-change'])

/** 全部触发器候选（表格模式全部展示） */
const ALL_TRIGGERS = [
  { label: '行点击', value: 'row-click' },
  // ===== 表格-容器联动触发器 =====
  { label: '行编辑', value: 'row-edit' },
  { label: '行查看', value: 'row-view' },
  { label: '行新增', value: 'row-create' },
  { label: '搜索', value: 'search' },
  { label: '刷新', value: 'refresh' },
  { label: '新增成功', value: 'create-success' },
  { label: '单元格点击', value: 'cell-click' },
  { label: '行选择变化', value: 'selection-change' },
  { label: '当前行变化', value: 'current-change' },
  // ===== 表单容器触发器 =====
  { label: '弹窗打开', value: 'dialog-open' },
  { label: '弹窗关闭', value: 'dialog-close' },
  { label: '加载记录成功', value: 'load-success' },
  { label: '保存成功', value: 'save-success' },
  { label: '删除成功', value: 'delete-success' },
]

/** 按模式过滤后的触发器候选（card 过滤表格专属） */
const triggerOptions = computed(() =>
  props.mode === 'card'
    ? ALL_TRIGGERS.filter((t) => !TABLE_ONLY_TRIGGERS.has(t.value))
    : ALL_TRIGGERS,
)

/** 当前模式被过滤掉的触发器值集合（用于旧数据兼容渲染） */
const filteredTriggerValues = computed(() =>
  props.mode === 'card' ? TABLE_ONLY_TRIGGERS : new Set<string>(),
)

/** 表格专属触发器中文标签（旧数据兼容项展示） */
function legacyTriggerLabel(value: string): string {
  return ALL_TRIGGERS.find((t) => t.value === value)?.label || value
}

const actionTypeOptions = [
  { label: '设置筛选', value: 'set-filter' },
  { label: '刷新数据', value: 'refresh' },
  { label: '打开详情', value: 'open-detail' },
  { label: '脚本', value: 'script' },
  { label: '设置排序', value: 'set-sort' },
  { label: '设置分页', value: 'set-page' },
  { label: '清空选择', value: 'clear-selection' },
  // ===== 表单容器专属动作 =====
  { label: '打开容器', value: 'open-container' },
  { label: '关闭容器', value: 'close-container' },
  { label: '加载记录', value: 'load-record' },
  { label: '保存容器', value: 'save-container' },
  { label: '新增记录', value: 'new-record' }, // 复制后创建
]

function commit(v: PageEventConfig[]) {
  emit('update:modelValue', v)
}

function addEvent() {
  commit([
    ...props.modelValue,
    { trigger: 'row-click', target: '', actions: [{ type: 'set-filter', params: [] }] },
  ])
}

function removeEvent(idx: number) {
  commit(props.modelValue.filter((_, i) => i !== idx))
}

function patchEvent(idx: number, patch: Partial<PageEventConfig>) {
  commit(props.modelValue.map((ev, i) => (i === idx ? { ...ev, ...patch } : ev)))
}

function addAction(idx: number) {
  const ev = props.modelValue[idx]
  const next: PageEventConfig = { ...ev, actions: [...ev.actions, { type: 'set-filter', params: [] }] }
  commit(props.modelValue.map((e, i) => (i === idx ? next : e)))
}

function removeAction(idx: number, ai: number) {
  const ev = props.modelValue[idx]
  const next: PageEventConfig = { ...ev, actions: ev.actions.filter((_, i) => i !== ai) }
  commit(props.modelValue.map((e, i) => (i === idx ? next : e)))
}

function patchAction(idx: number, ai: number, patch: Partial<EventAction>) {
  const ev = props.modelValue[idx]
  const next: PageEventConfig = {
    ...ev,
    actions: ev.actions.map((a, i) => (i === ai ? { ...a, ...patch } : a)),
  }
  commit(props.modelValue.map((e, i) => (i === idx ? next : e)))
}

function addParam(idx: number, ai: number) {
  const ev = props.modelValue[idx]
  const next: PageEventConfig = {
    ...ev,
    actions: ev.actions.map((a, i) =>
      i === ai ? { ...a, params: [...a.params, { key: '', value: '' }] } : a,
    ),
  }
  commit(props.modelValue.map((e, i) => (i === idx ? next : e)))
}

function removeParam(idx: number, ai: number, pi: number) {
  const ev = props.modelValue[idx]
  const next: PageEventConfig = {
    ...ev,
    actions: ev.actions.map((a, i) =>
      i === ai ? { ...a, params: a.params.filter((_, j) => j !== pi) } : a,
    ),
  }
  commit(props.modelValue.map((e, i) => (i === idx ? next : e)))
}

function patchParamKey(idx: number, ai: number, pi: number, v: string) {
  patchParam(idx, ai, pi, { key: v })
}

function patchParamValue(idx: number, ai: number, pi: number, v: string) {
  patchParam(idx, ai, pi, { value: v })
}

function patchParam(idx: number, ai: number, pi: number, patch: Partial<EventActionParam>) {
  const ev = props.modelValue[idx]
  const next: PageEventConfig = {
    ...ev,
    actions: ev.actions.map((a, i) =>
      i === ai
        ? { ...a, params: a.params.map((p, j) => (j === pi ? { ...p, ...patch } : p)) }
        : a,
    ),
  }
  commit(props.modelValue.map((e, i) => (i === idx ? next : e)))
}
</script>

<style scoped>
.config-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.config-title {
  font-weight: bold;
}
.empty-hint {
  margin-top: 8px;
}
.event-card {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 12px;
}
.event-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.event-title {
  font-weight: bold;
  font-size: 14px;
}
.actions-chain {
  margin-top: 4px;
  padding-left: 8px;
}
.action-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
}
.action-params {
  flex: 1;
}
.param-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.var-hint {
  margin-top: 8px;
  font-size: 14px;
  color: #909399;
}
</style>