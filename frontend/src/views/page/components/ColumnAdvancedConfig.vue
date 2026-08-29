<template>
  <el-dialog :model-value="visible" title="高级配置" width="560px" :close-on-click-modal="false" @update:model-value="$emit('update:visible', $event)" @closed="handleClosed">
    <el-form v-if="column" label-width="110px">
      <el-divider content-position="left">动态内容</el-divider>
      <el-form-item label="内容模式">
        <el-radio-group :model-value="contentMode" @update:model-value="handleModeChange">
          <el-radio value="expression">表达式</el-radio>
          <el-radio value="template">模板</el-radio>
          <el-radio value="none">无</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item v-if="contentMode === 'expression'" label="表达式">
        <el-input
          :model-value="col?.contentValue"
          type="textarea"
          :rows="2"
          placeholder="$row.name + '(' + $row.dept + ')'"
          @input="(v: string) => patch({ contentValue: v || undefined })"
        />
      </el-form-item>
      <el-form-item v-else-if="contentMode === 'template'" label="模板">
        <el-input
          :model-value="col?.contentValue"
          type="textarea"
          :rows="2"
          placeholder="${name}(${dept})；支持多级字段 ${user.name}"
          @input="(v: string) => patch({ contentValue: v || undefined })"
        />
      </el-form-item>

      <el-divider content-position="left">列样式</el-divider>
      <el-form-item label="CSS 类名">
        <el-input
          :model-value="col?.className"
          placeholder="作用于单元格的静态 CSS 类名"
          @input="(v: string) => patch({ className: v || undefined })"
        />
      </el-form-item>
      <el-form-item label="条件样式">
        <el-input
          :model-value="col?.styleExpr"
          type="textarea"
          :rows="2"
          placeholder="如 $row.status === 'PENDING' ? 'color:red' : ''"
          @input="(v: string) => patch({ styleExpr: v || undefined })"
        />
      </el-form-item>

      <el-divider content-position="left">单元格点击事件（配置后优先于整表级点击）</el-divider>
      <el-form-item>
        <template #label>
          <span class="label-with-tip">
            点击动作
            <el-tooltip content="变量提示：$row.字段（当前行）。脚本动作请在参数中配置 source（脚本源码）。" placement="top">
              <el-icon class="tip-icon"><QuestionFilled /></el-icon>
            </el-tooltip>
          </span>
        </template>
        <div class="cellclick-editor">
          <div v-for="(action, ai) in col?.onCellClick?.actions || []" :key="ai" class="event-action-row">
            <el-select
              :model-value="action.type"
              style="width: 130px"
              @change="(v: string) => patchAction(ai, { type: v })"
            >
              <el-option v-for="a in actionTypeOptions" :key="a.value" :label="a.label" :value="a.value" />
            </el-select>
            <div v-for="(p, pi) in getActionParams(ai)" :key="pi" class="event-param-row">
              <el-input
                :model-value="p.key"
                placeholder="参数名"
                style="width: 100px"
                @input="(v: string) => patchParam(ai, pi, { key: v })"
              />
              <el-input
                :model-value="p.value"
                placeholder="值，支持 $row.字段"
                style="width: 170px"
                @input="(v: string) => patchParam(ai, pi, { value: v })"
              />
              <el-button link type="danger" @click="removeParam(ai, pi)">删</el-button>
            </div>
            <el-button link type="primary" @click="addParam(ai)">+ 参数</el-button>
            <el-button link type="danger" @click="removeAction(ai)">移除</el-button>
          </div>
          <el-button type="primary" plain size="small" @click="addAction">+ 增加动作</el-button>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" @click="handleSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { QuestionFilled } from '@element-plus/icons-vue'
import type { ColumnViewConfig } from '../ViewDesigner.vue'

const props = defineProps<{
  visible: boolean
  column: ColumnViewConfig | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'save', column: ColumnViewConfig): void
}>()

/** 编辑副本（保存时写回，避免直接改 props） */
const col = ref<ColumnViewConfig | null>(null)

/**
 * 将旧格式字段（expression/template/formatter）迁移为 contentType/contentValue。
 * 只在 col 无 contentType 时执行（避免覆盖用户正在编辑的新格式）。
 */
function migrateLegacy(c: ColumnViewConfig): ColumnViewConfig {
  if (c.contentType) return c
  if (c.expression) return { ...c, contentType: 'expression', contentValue: c.expression }
  if (c.template) return { ...c, contentType: 'template', contentValue: c.template }
  // formatter 已废弃，映射为 expression（用户可改写为 JS 表达式）
  if (c.formatter) return { ...c, contentType: 'expression', contentValue: c.formatter }
  return c
}

watch(
  () => props.column,
  (c) => {
    col.value = c ? migrateLegacy({ ...c, onCellClick: c.onCellClick ? { actions: (c.onCellClick.actions || []).map((a: any) => ({ ...a, params: [...(a.params || [])] })) } : undefined }) : null
  },
  { immediate: true },
)

/** 内容模式：根据 col 的 contentType 字段推导当前选中项 */
const contentMode = computed(() => {
  if (!col.value) return 'none'
  return col.value.contentType || 'none'
})

/** 切换内容模式：清空旧字段，写入新的 contentType（contentValue 由输入框写入） */
function handleModeChange(mode: string) {
  if (!col.value) return
  if (mode === 'none') {
    patch({ contentType: undefined, contentValue: undefined })
  } else {
    patch({ contentType: mode as 'expression' | 'template', contentValue: col.value.contentValue || undefined })
  }
}

/** 动作类型选项（对齐 ActionsConfig） */
const actionTypeOptions = [
  { label: '设置筛选', value: 'set-filter' },
  { label: '刷新数据', value: 'refresh' },
  { label: '打开详情', value: 'open-detail' },
  { label: '打开链接', value: 'open-link' },
  { label: '消息提示', value: 'message' },
  { label: '打开新建', value: 'open-create' },
  { label: '编辑', value: 'edit' },
  { label: '删除', value: 'delete' },
  { label: '设置分页', value: 'set-page' },
  { label: '设置排序', value: 'set-sort' },
  { label: '清空选择', value: 'clear-selection' },
  { label: '导出数据', value: 'export' },
  { label: '脚本', value: 'script' },
]

function patch(p: Partial<ColumnViewConfig>) {
  if (!col.value) return
  col.value = { ...col.value, ...p }
}

/** 当前动作列表 */
function actions(): any[] {
  if (!col.value?.onCellClick) return []
  return col.value.onCellClick.actions
}

function patchActions(actions: any[]) {
  if (!col.value) return
  col.value = { ...col.value, onCellClick: { actions } }
}

function getActionParams(ai: number): any[] {
  return actions()[ai]?.params || []
}

function addAction() {
  const list = [...actions(), { type: 'message', params: [] }]
  patchActions(list)
}

function removeAction(ai: number) {
  if (!col.value) return
  patchActions(actions().filter((_: any, i: number) => i !== ai))
  if (actions().length === 0) {
    patch({ onCellClick: undefined })
  }
}

function patchAction(ai: number, p: Record<string, any>) {
  patchActions(actions().map((a: any, i: number) => (i === ai ? { ...a, ...p } : a)))
}

function addParam(ai: number) {
  patchActions(actions().map((a: any, i: number) =>
    i === ai ? { ...a, params: [...(a.params || []), { key: '', value: '' }] } : a,
  ))
}

function removeParam(ai: number, pi: number) {
  patchActions(actions().map((a: any, i: number) =>
    i === ai ? { ...a, params: (a.params || []).filter((_: any, j: number) => j !== pi) } : a,
  ))
}

function patchParam(ai: number, pi: number, p: Record<string, string>) {
  patchActions(actions().map((a: any, i: number) =>
    i === ai ? { ...a, params: (a.params || []).map((x: any, j: number) => (j === pi ? { ...x, ...p } : x)) } : a,
  ))
}

function handleSave() {
  if (!col.value) return
  // 保存时清理旧字段（已迁移到 contentType/contentValue）
  const { expression, template, formatter, ...rest } = col.value as any
  emit('save', rest)
  emit('update:visible', false)
}

function handleClosed() {
  col.value = null
}
</script>

<style scoped>
.event-action-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.event-param-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.label-with-tip {
  display: inline-flex;
  align-items: center;
  align-self: center;
  line-height: 1;
}
.tip-icon {
  margin-left: 4px;
  color: #909399;
  cursor: help;
}
.cellclick-editor {
  width: 100%;
}
</style>
