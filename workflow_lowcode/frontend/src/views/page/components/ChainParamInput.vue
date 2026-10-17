<template>
  <ExpressionEditor
    v-if="kind === 'script'"
    class="chain-param--script"
    :model-value="modelValue ?? ''"
    :variables="scriptVarItems"
    :custom-source="rowTemplateSource"
    mode="bare"
    lang="groovy"
    multiline
    :rows="2"
    :max-rows="6"
    placeholder="JS 脚本；上下文 row / ds / actions / params，$row.字段 会先替换成字面值"
    @update:model-value="emit('update:modelValue', $event)"
  />
  <el-select
    v-else-if="kind === 'target'"
    :model-value="modelValue ?? ''"
    :placeholder="placeholder"
    filterable
    allow-create
    default-first-option
    clearable
    :style="{ width }"
    @visible-change="refreshContext"
    @update:model-value="(v: string) => emit('update:modelValue', v ?? '')"
  >
    <el-option v-for="t in targetOptions" :key="t.value" :label="t.label" :value="t.value" />
  </el-select>
  <el-select
    v-else-if="options.length > 0"
    :model-value="modelValue ?? ''"
    :placeholder="placeholder"
    clearable
    :style="{ width }"
    @update:model-value="(v: string) => emit('update:modelValue', v ?? '')"
  >
    <el-option v-for="opt in options" :key="opt" :label="opt" :value="opt" />
  </el-select>
  <div v-else class="chain-param--free" :style="{ width }">
    <el-input
      ref="inputRef"
      :model-value="modelValue"
      :placeholder="placeholder"
      @input="(v: string) => emit('update:modelValue', v)"
    />
    <el-dropdown v-if="rowFields.length > 0" trigger="click" @visible-change="refreshContext" @command="insertRowField">
      <button class="chain-param-var-btn" type="button" title="插入 $row.字段" @mousedown.prevent @click.prevent>
        $
      </button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item v-for="f in rowFields" :key="f" :command="f">$row.{{ f }}</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElInput } from 'element-plus'
import { CompletionContext, type CompletionSource } from '@codemirror/autocomplete'
import ExpressionEditor from '@/components/expression/ExpressionEditor.vue'
import type { ChainParamKind } from '@/types/pageActionCatalog'
import type { FlowVarItem } from '@/views/logicflow/utils/flowVars'
import { getChainParamContext, type ChainContainerTarget } from './chainParamContext'

// 动作链参数值输入：控件形态由 pageActionCatalog 的 paramKinds/paramOptions 决定，避免三个面板各写一套分支。
// target 候选与行字段来自 chainParamContext（PageDesigner 注入），注册表非响应式，下拉展开时刷新。
const props = withDefaults(
  defineProps<{
    modelValue: string
    kind?: ChainParamKind
    /** 枚举候选（非空时渲染下拉） */
    options?: string[]
    placeholder?: string
    /** free 形态的输入框宽度（沿用各面板原有内联尺寸） */
    width?: string
  }>(),
  {
    kind: 'free',
    options: () => [],
    placeholder: '',
    width: '200px',
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
}>()

const inputRef = ref<InstanceType<typeof ElInput> | null>(null)
const rowFields = ref<string[]>([])
const targetOptions = ref<ChainContainerTarget[]>([])

function refreshContext() {
  const ctx = getChainParamContext()
  rowFields.value = ctx.rowFields
  targetOptions.value = ctx.containerTargets
}

refreshContext()

/** 未聚焦退化为尾部追加（jsdom / 点击按钮时输入框已失焦，selectionStart 不可靠） */
function insertRowField(field: string) {
  const text = `$row.${field}`
  const el = inputRef.value?.input as HTMLInputElement | undefined
  const value = props.modelValue ?? ''
  if (el && document.activeElement === el && typeof el.selectionStart === 'number') {
    const s = el.selectionStart
    const e = el.selectionEnd ?? s
    emit('update:modelValue', value.slice(0, s) + text + value.slice(e))
  } else {
    emit('update:modelValue', value + text)
  }
}

/** 脚本沙箱上下文补全：root 键即输即补，结构化键给出方法路径（与 PageDataTable/PageDataCards 的注入一致） */
const SCRIPT_ROOTS: { name: string; detail: string; children?: string[] }[] = [
  { name: 'row', detail: '当前行对象' },
  { name: 'params', detail: '页面路由参数' },
  { name: 'selectedRows', detail: '选中行数组' },
  {
    name: 'ds',
    detail: '数据源操作',
    children: ['ds.query', 'ds.detail', 'ds.create', 'ds.update', 'ds.remove'],
  },
  { name: 'api', detail: '页面 API', children: ['api.pageKey', 'api.dataSourceId'] },
  {
    name: 'actions',
    detail: '动作',
    children: ['actions.refresh', 'actions.openDetail', 'actions.openCreate', 'actions.openEdit', 'actions.remove'],
  },
  { name: '$', detail: '工具函数', children: ['$.message'] },
]

function scriptVariables(): FlowVarItem[] {
  return SCRIPT_ROOTS.map((r) => ({
    name: r.name,
    group: 'input' as const,
    groupLabel: '脚本上下文',
    detail: r.detail,
    children:
      r.name === 'row'
        ? rowFields.value.map((f) => ({ name: `row.${f}`, group: 'input' as const, groupLabel: '脚本上下文', detail: '行字段' }))
        : (r.children || []).map((c) => ({ name: c, group: 'input' as const, groupLabel: '脚本上下文', detail: '方法' })),
  }))
}

/** 依赖 rowFields ref：refreshContext 刷新后编辑器 watcher 会热替换补全源 */
const scriptVarItems = computed<FlowVarItem[]>(scriptVariables)

/** $row.字段 模板补全（bare 变量源不匹配 $ 前缀，单独处理） */
function makeRowTemplateSource(): CompletionSource {
  return (ctx: CompletionContext) => {
    const m = ctx.matchBefore(/\$row\.?[\w]*$/)
    if (!m || (m.from === m.to && !ctx.explicit)) return null
    return {
      from: m.from,
      options: rowFields.value.map((f) => ({ label: `$row.${f}`, type: 'variable' })),
      validFor: /^\$row\.?[\w]*$/,
    }
  }
}

const rowTemplateSource = computed<CompletionSource>(makeRowTemplateSource)
</script>

<style scoped>
/* 参数行为 flex 行：脚本形态占满剩余宽度，让代码区有可读的横向空间 */
.chain-param--script {
  flex: 1 1 100%;
  min-width: 260px;
}

.chain-param--free {
  display: inline-flex;
  align-items: center;
  min-width: 0;
}

.chain-param--free :deep(.el-input) {
  flex: 1 1 auto;
  min-width: 0;
}

.chain-param-var-btn {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  margin-left: 4px;
  padding: 0;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.chain-param-var-btn:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-5);
}
</style>
