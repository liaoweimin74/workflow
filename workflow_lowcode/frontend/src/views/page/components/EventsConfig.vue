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
              <el-select
                :model-value="row.key"
                filterable
                allow-create
                default-first-option
                placeholder="参数名"
                style="width: 120px"
                @change="(v: string) => patchParamKey(idx, ai, pi, v)"
              >
                <el-option v-for="k in chainParamKeyOptions(action.type)" :key="k" :label="k" :value="k" />
              </el-select>
              <ChainParamInput
                :model-value="row.value"
                :kind="chainParamKind(action.type, row.key)"
                :options="chainParamOptions(action.type, row.key)"
                placeholder="值，支持 $row.xxx / $param.xxx 变量"
                width="220px"
                @update:model-value="(v: string) => patchParamValue(idx, ai, pi, v)"
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
import {
  CHAIN_TABLE_ONLY_TRIGGERS,
  chainActionOptions,
  chainParamKeyOptions,
  chainParamKind,
  chainParamOptions,
  chainTriggerLabel,
  chainTriggerOptions,
  syncActionParams,
  type EventAction,
  type EventActionParam,
  type PageEventConfig,
} from '@/types/pageActionCatalog'
import ChainParamInput from './ChainParamInput.vue'

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

/** 动作候选（组件级动作链入口，未接线的容器动作不暴露） */
const actionTypeOptions = chainActionOptions('event')

/** 按模式过滤后的触发器候选（card 过滤表格专属） */
const triggerOptions = computed(() => chainTriggerOptions(props.mode))

/** 当前模式被过滤掉的触发器值集合（用于旧数据兼容渲染） */
const filteredTriggerValues = computed(() =>
  props.mode === 'card' ? CHAIN_TABLE_ONLY_TRIGGERS : new Set<string>(),
)

/** 触发器中文标签（旧数据兼容项展示） */
function legacyTriggerLabel(value: string): string {
  return chainTriggerLabel(value)
}

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
    actions: ev.actions.map((a, i) => {
      if (i !== ai) return a
      const merged = { ...a, ...patch }
      // 换动作即按新类型补齐约定参数，省去手打参数名（script 的 source 等）
      return patch.type ? { ...merged, params: syncActionParams(patch.type, a.params) } : merged
    }),
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