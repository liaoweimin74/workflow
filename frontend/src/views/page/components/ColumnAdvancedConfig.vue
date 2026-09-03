<template>
  <el-dialog :model-value="visible" :title="mode === 'card' ? '字段高级配置' : '高级配置'" width="620px" :close-on-click-modal="false" @update:model-value="$emit('update:visible', $event)" @closed="handleClosed">
    <el-tabs v-if="column" :model-value="activeTab">
      <!-- 基础设置：原表格高级配置（动态内容/列样式/单元格点击事件） -->
      <el-tab-pane label="基础设置" name="base">
        <el-form label-width="110px">
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
      </el-tab-pane>

      <!-- 卡片配置：仅卡片模式显示（原卡片高级配置） -->
      <el-tab-pane v-if="mode === 'card'" label="卡片配置" name="card">
        <el-form class="card-column-advanced-config" label-width="0px" label-position="top">
          <div class="cfg-row">
            <div class="cfg-field cfg-field-full">
              <span class="cfg-label">角色</span>
              <el-select :model-value="col?.role" clearable @change="(v: string) => patch({ role: v || undefined })">
                <el-option label="普通字段" value="field" />
                <el-option label="标题" value="title" />
                <el-option label="副标题" value="subtitle" />
                <el-option label="标签" value="tag" />
                <el-option label="指标" value="metric" />
              </el-select>
            </div>
          </div>
          <div class="cfg-row">
            <div class="cfg-field cfg-field-half">
              <span class="cfg-label">值类型</span>
              <el-input :model-value="col?.valueType" placeholder="如 currency / number / date" @input="(v: string) => patch({ valueType: v || undefined })" />
            </div>
            <div class="cfg-field cfg-field-half">
              <span class="cfg-label">对齐</span>
              <el-select :model-value="col?.align" @change="(v: string) => patch({ align: v })">
                <el-option label="左对齐" value="left" /><el-option label="居中" value="center" /><el-option label="右对齐" value="right" />
              </el-select>
            </div>
          </div>
          <div class="cfg-row">
            <div class="cfg-field cfg-field-quarter">
              <span class="cfg-label">字体</span>
              <el-select :model-value="col?.fontFamily" clearable @change="(v: string) => patch({ fontFamily: v || undefined })">
                <el-option label="系统默认" value="system-ui" />
                <el-option label="微软雅黑" value="Microsoft YaHei" />
                <el-option label="等线" value="DengXian" />
                <el-option label="宋体" value="SimSun" />
              </el-select>
            </div>
            <div class="cfg-field cfg-field-quarter">
              <span class="cfg-label">字号</span>
              <el-input-number :model-value="col?.fontSize" :min="10" :max="48" @change="(v: number | undefined) => patch({ fontSize: v })" />
            </div>
            <div class="cfg-field cfg-field-quarter">
              <span class="cfg-label">字重</span>
              <el-select :model-value="String(col?.fontWeight || '')" clearable @change="(v: string) => patch({ fontWeight: v ? Number(v) : undefined })"><el-option label="常规" value="400" /><el-option label="中等" value="500" /><el-option label="加粗" value="700" /></el-select>
            </div>
            <div class="cfg-field cfg-field-quarter">
              <span class="cfg-label">颜色</span>
              <el-input :model-value="col?.fontColor" placeholder="如 #303133" @input="(v: string) => patch({ fontColor: v || undefined })" />
            </div>
          </div>
          <div class="cfg-row">
            <div class="cfg-field cfg-field-half">
              <span class="cfg-label">显示标签</span>
              <el-switch :model-value="col?.showLabel !== false" @change="(v: boolean) => patch({ showLabel: v })" />
            </div>
            <div class="cfg-field cfg-field-half">
              <span class="cfg-label">标签位置</span>
              <el-select :model-value="col?.labelPosition || 'left'" @change="(v: string) => patch({ labelPosition: v as 'left' | 'right' | 'top' })">
                <el-option label="左对齐" value="left" /><el-option label="右对齐" value="right" /><el-option label="顶部" value="top" />
              </el-select>
            </div>
          </div>
          <div class="cfg-row">
            <div class="cfg-field cfg-field-full">
              <span class="cfg-label">样式语法</span>
              <el-input :model-value="col?.style" type="textarea" :rows="3" placeholder="color: #409eff; font-weight: 700;" @input="(v: string) => patch({ style: v || undefined })" />
            </div>
          </div>
        </el-form>
      </el-tab-pane>
    </el-tabs>

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

/** 合并后的列高级配置：基础设置（原表格配置）+ 卡片配置（仅卡片模式） */
export type MergedColumnConfig = ColumnViewConfig & {
  role?: string
  valueType?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: string | number
  fontColor?: string
  showLabel?: boolean
  labelPosition?: 'left' | 'right' | 'top'
  style?: string
}

const props = defineProps<{
  visible: boolean
  column: MergedColumnConfig | null
  /** 模式：table 只显示「基础设置」；card 显示「基础设置」+「卡片配置」双页签 */
  mode?: 'table' | 'card'
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'save', column: MergedColumnConfig): void
}>()

/** 当前激活页签（表格时固定基础设置） */
const activeTab = computed(() => (props.mode === 'card' ? 'card' : 'base'))

/** 编辑副本（保存时写回，避免直接改 props） */
const col = ref<MergedColumnConfig | null>(null)

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

function patch(p: Partial<MergedColumnConfig>) {
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
/* 卡片配置页签布局（迁自 CardColumnAdvancedConfig.vue） */
.card-column-advanced-config .cfg-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.card-column-advanced-config .cfg-row + .cfg-row {
  margin-top: 16px;
}
.card-column-advanced-config .cfg-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.card-column-advanced-config .cfg-field-full {
  flex: 1 1 100%;
}
.card-column-advanced-config .cfg-field-half {
  flex: 1 1 0;
}
.card-column-advanced-config .cfg-field-quarter {
  flex: 1 1 0;
}
.card-column-advanced-config .cfg-field-quarter .el-input-number {
  width: 100%;
}
.card-column-advanced-config .cfg-label {
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
  line-height: 1.4;
}
.card-column-advanced-config .el-select,
.card-column-advanced-config .el-input,
.card-column-advanced-config .el-textarea,
.card-column-advanced-config .el-input-number {
  width: 100%;
}
</style>
