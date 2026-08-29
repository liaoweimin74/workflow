<template>
  <div class="actions-config">
    <div class="config-header">
      <span class="config-title">操作按钮（表格配置）</span>
    </div>

    <!-- 添加按钮 -->
    <div class="add-row">
      <el-select
        v-model="pendingBuiltin"
        placeholder="添加内置按钮"
        
        style="width: 160px"
        @change="handleAddBuiltin"
      >
        <el-option v-for="b in missingBuiltins" :key="b.key" :label="b.label" :value="b.key" />
      </el-select>
      <el-input
        v-model="pendingCustomKey"
        placeholder="自定义按钮标识（如 approve）"
        
        style="width: 160px"
      />
      <el-input
        v-model="pendingCustomLabel"
        placeholder="自定义按钮名称（如 审核）"
        
        style="width: 140px"
      />
      <el-button  type="primary" plain :icon="Plus" @click="handleAddCustom">
        添加自定义按钮
      </el-button>
    </div>

    <!-- 按钮表格（整行可拖拽排序） -->
    <div ref="tableWrapperRef">
    <el-table :data="modelValue.buttons" border  row-key="key" max-height="420">
      <!-- 自定义按钮：展开行编辑事件链 -->
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="button-events">
            <div class="events-title">
              按钮事件链（点击时优先执行；内建按钮无事件则执行默认行为）
              <el-button  link type="danger" style="float: right" @click="unbindEvents(row.key)">解绑事件</el-button>
            </div>
            <div v-for="(action, ai) in getButtonActions(row.key)" :key="ai" class="event-action-row">
              <el-select
                :model-value="action.type"
                
                style="width: 130px"
                @change="(v: string) => patchEventAction(row.key, ai, { type: v })"
              >
                <el-option v-for="a in actionTypeOptions" :key="a.value" :label="a.label" :value="a.value" />
              </el-select>
              <div v-for="(p, pi) in getActionParamsForKey(row.key, ai)" :key="pi" class="event-param-row">
                <el-input
                  :model-value="p.key"
                  
                  placeholder="参数名"
                  style="width: 110px"
                  @input="(v: string) => patchEventParam(row.key, ai, pi, { key: v })"
                />
                <el-input
                  :model-value="p.value"
                  
                  placeholder="值，支持 $row.xxx / $param.xxx"
                  style="width: 200px"
                  @input="(v: string) => patchEventParam(row.key, ai, pi, { value: v })"
                />
                <el-button  link type="danger" @click="removeEventParam(row.key, ai, pi)">删</el-button>
              </div>
              <el-button  link type="primary" @click="addEventParam(row.key, ai)">+ 参数</el-button>
              <el-button  type="danger" link @click="removeEventAction(row.key, ai)">移除动作</el-button>
            </div>
            <el-button  link type="primary" @click="addEventAction(row.key)">+ 动作</el-button>
            <div class="var-hint">变量提示：$row.字段（当前行）/ $param.参数（页面参数）</div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="标识" width="120">
        <template #default="{ row }">
          <el-tag  type="info">{{ row.key }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="名称" min-width="120">
        <template #default="{ row }">
          <el-input
            :model-value="row.label"
            
            @input="(v: string) => updateButton(row.key, { label: v })"
          />
        </template>
      </el-table-column>
      <el-table-column label="位置" width="123">
        <template #default="{ row }">
          <el-select
            :model-value="row.placement"
            
            style="width: 93px"
            @change="(v: any) => updateButton(row.key, { placement: v })"
          >
            <el-option label="操作栏" value="toolbar" />
            <el-option label="操作列" value="column" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="形态" width="109">
        <template #default="{ row }">
          <el-select
            :model-value="row.style"
            
            style="width: 79px"
            @change="(v: any) => updateButton(row.key, { style: v })"
          >
            <el-option label="按钮" value="button" />
            <el-option label="图标" value="icon" />
            <el-option label="文字" value="text" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="图标" width="126">
        <template #default="{ row }">
          <el-select
            :model-value="row.icon || defaultIconOf(row.key)"
            
            style="width: 96px"
            clearable
            @change="(v: any) => updateButton(row.key, { icon: v || '' })"
          >
            <template #prefix>
              <el-icon v-if="row.icon">
                <component :is="iconComponentOf(row.icon)" />
              </el-icon>
              <el-icon v-else>
                <component :is="iconComponentOf(defaultIconOf(row.key))" />
              </el-icon>
            </template>
            <el-option v-for="opt in iconOptions" :key="opt.value" :label="opt.label" :value="opt.value">
              <span class="icon-option">
                <el-icon><component :is="opt.component" /></el-icon>
                <span>{{ opt.label }}</span>
              </span>
            </el-option>
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="条件显示" width="260">
        <template #default="{ row }">
          <el-input
            :model-value="row.visible || ''"
            
            placeholder="如 $row.status === 'PENDING'"
            clearable
            @input="(v: string) => updateButton(row.key, { visible: v || undefined })"
          />
        </template>
      </el-table-column>
      <el-table-column label="事件" width="90" align="center">
        <template #default="{ row }">
          <el-tag  :type="hasEvents(row) ? 'success' : 'info'">
            {{ hasEvents(row) ? '已绑定' : '未绑定' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="80" align="center">
        <template #default="{ row }">
          <el-button  type="danger" link :icon="Delete" @click="removeButton(row.key)">
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    </div>

    <el-empty v-if="modelValue.buttons.length === 0" description="暂无操作按钮，从上方添加" :image-size="60" />

    <!-- 其他设置：列宽度 / 弹窗宽度 / 权限点（说明文字以 ? 图标悬浮显示） -->
    <el-divider content-position="left">其他设置</el-divider>
    <el-form label-width="90px"  style="max-width: 520px">
      <el-form-item>
        <template #label>
          <span class="label-with-tip">
            列宽度
            <el-tooltip content="操作列宽度（px），留空/0 按按钮数量自动计算" placement="top">
              <el-icon class="tip-icon"><QuestionFilled /></el-icon>
            </el-tooltip>
          </span>
        </template>
        <el-input-number
          :model-value="actionColumnWidthValue"

          :min="0"
          :max="400"
          :step="10"
          style="width: 160px"
          @change="setActionColumnWidth"
        />
      </el-form-item>
      <el-form-item>
        <template #label>
          <span class="label-with-tip">
            表单方式
            <el-tooltip content="表单容器的展示方式：弹窗/抽屉/内嵌" placement="top">
              <el-icon class="tip-icon"><QuestionFilled /></el-icon>
            </el-tooltip>
          </span>
        </template>
        <div class="form-config-row">
          <el-select
            :model-value="detailFormMode"
            placeholder="请选择"
            style="width: 150px"
            @change="setDetailFormMode"
          >
            <el-option label="弹窗" value="popup" />
            <el-option label="抽屉" value="drawer" />
            <el-option label="内嵌" value="inline" />
          </el-select>
          <div class="form-config-col">
            <span class="label-with-tip">
              弹窗宽度
              <el-tooltip content='启用"查看"按钮后，点击行即可弹出详情' placement="top">
                <el-icon class="tip-icon"><QuestionFilled /></el-icon>
              </el-tooltip>
            </span>
            <el-input
              :model-value="detailWidth"

              placeholder="如 800px"
              style="width: 140px"
              @input="setDetailWidth"
            />
          </div>
          <div class="form-config-col">
            <span class="label-with-tip">
              弹窗高度
              <el-tooltip content="表单容器内容区高度（如 600px），超出滚动" placement="top">
                <el-icon class="tip-icon"><QuestionFilled /></el-icon>
              </el-tooltip>
            </span>
            <el-input
              :model-value="detailHeight"

              placeholder="如 600px"
              style="width: 140px"
              @input="setDetailHeight"
            />
          </div>
        </div>
      </el-form-item>
      <el-form-item>
        <template #label>
          <span class="label-with-tip">
            权限点
            <el-tooltip content="多选权限点（如 page:create / page:edit），用于按钮级权限控制" placement="top">
              <el-icon class="tip-icon"><QuestionFilled /></el-icon>
            </el-tooltip>
          </span>
        </template>
        <el-select
          :model-value="permissionArray"
          multiple
          filterable
          allow-create
          default-first-option
          placeholder="选择或输入权限点（可多选）"
          style="width: 320px"
          @update:model-value="setPermissionArray"
        >
          <el-option v-for="p in presetPermissions" :key="p" :label="p" :value="p" />
        </el-select>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import {
  Plus, Edit, Delete, View, Search, Refresh, Upload, Download, Document,
  Printer, Setting, Check, Close, Star, Collection, Message, Bell, User, Lock, Unlock,
  QuestionFilled,
} from '@element-plus/icons-vue'
import Sortable from 'sortablejs'
import type { ViewActionsConfig, ViewActionButton, ViewDetailConfig } from '../ViewDesigner.vue'

const props = defineProps<{
  modelValue: ViewActionsConfig
  /** 详情配置（由"查看"按钮启用，此处仅配置宽度） */
  detail?: ViewDetailConfig
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: ViewActionsConfig): void
  (e: 'update:detail', v: ViewDetailConfig): void
}>()

/** 内置按钮定义（固定行为，不可删除） */
const BUILTIN_BUTTONS: { key: string; label: string }[] = [
  { key: 'create', label: '新增' },
  { key: 'edit', label: '编辑' },
  { key: 'delete', label: '删除' },
  { key: 'view', label: '查看' },
]

/** 可选图标（Element Plus 图标组件） */
const iconOptions = [
  { label: '新增', value: 'Plus', component: Plus },
  { label: '编辑', value: 'Edit', component: Edit },
  { label: '删除', value: 'Delete', component: Delete },
  { label: '查看', value: 'View', component: View },
  { label: '搜索', value: 'Search', component: Search },
  { label: '刷新', value: 'Refresh', component: Refresh },
  { label: '上传', value: 'Upload', component: Upload },
  { label: '下载', value: 'Download', component: Download },
  { label: '导出', value: 'Document', component: Document },
  { label: '打印', value: 'Printer', component: Printer },
  { label: '设置', value: 'Setting', component: Setting },
  { label: '勾选', value: 'Check', component: Check },
  { label: '关闭', value: 'Close', component: Close },
  { label: '星标', value: 'Star', component: Star },
  { label: '收藏', value: 'Collection', component: Collection },
  { label: '消息', value: 'Message', component: Message },
  { label: '通知', value: 'Bell', component: Bell },
  { label: '用户', value: 'User', component: User },
  { label: '锁定', value: 'Lock', component: Lock },
  { label: '解锁', value: 'Unlock', component: Unlock },
]

/** 按图标名取组件 */
function iconComponentOf(name: string): any {
  return iconOptions.find((o) => o.value === name)?.component
}

/** 内置按钮默认图标名 */
const BUILTIN_ICONS: Record<string, string> = { create: 'Plus', edit: 'Edit', delete: 'Delete', view: 'View' }

function defaultIconOf(key: string): string {
  return BUILTIN_ICONS[key] || 'Plus'
}

/** 解绑事件：清空按钮 events（内建按钮恢复默认行为） */
function unbindEvents(key: string) {
  const btn = props.modelValue.buttons.find((b) => b.key === key)
  if (!btn) return
  setButtonEvents(key, [])
}

/** 动作类型选项（对齐 EventsConfig） */
const actionTypeOptions = [
  { label: '设置筛选', value: 'set-filter' },
  { label: '刷新数据', value: 'refresh' },
  { label: '打开详情', value: 'open-detail' },
  { label: '打开链接', value: 'open-link' },
  { label: '消息提示', value: 'message' },
  { label: '脚本', value: 'script' },
  // ===== 表格-容器联动动作 =====
  { label: '打开容器', value: 'open-container' },
  { label: '关闭容器', value: 'close-container' },
  { label: '加载记录', value: 'load-record' },
  { label: '保存容器', value: 'save-container' },
]

const presetPermissions = [
  'page:create',
  'page:edit',
  'page:delete',
  'page:view',
  'page:publish',
  'data-source:manage',
]

// ========== 添加按钮 ==========
const pendingBuiltin = ref('')
const pendingCustomKey = ref('')
const pendingCustomLabel = ref('')

/** 尚未添加的内置按钮（下拉候选） */
const missingBuiltins = computed(() =>
  BUILTIN_BUTTONS.filter((b) => !props.modelValue.buttons.some((x) => x.key === b.key)),
)

function handleAddBuiltin(key: string) {
  const def = BUILTIN_BUTTONS.find((b) => b.key === key)
  if (!def) return
  // 内置按钮默认：create 在操作栏，行操作在操作列
  const placement = key === 'create' ? 'toolbar' : 'column'
  commit({ ...props.modelValue, buttons: [...props.modelValue.buttons, { key, label: def.label, placement, style: 'button' }] })
  pendingBuiltin.value = ''
}

function handleAddCustom() {
  const key = pendingCustomKey.value.trim()
  const label = pendingCustomLabel.value.trim() || key
  if (!key) return
  if (props.modelValue.buttons.some((b) => b.key === key)) return
  commit({
    ...props.modelValue,
    buttons: [
      ...props.modelValue.buttons,
      { key, label, placement: 'column', style: 'text', events: [] },
    ],
  })
  pendingCustomKey.value = ''
  pendingCustomLabel.value = ''
}

// ========== 按钮编辑（按 key 定位） ==========
function updateButton(key: string, patch: Partial<ViewActionButton>) {
  const buttons = props.modelValue.buttons.map((b) => (b.key === key ? { ...b, ...patch } : b))
  commit({ ...props.modelValue, buttons })
}

function removeButton(key: string) {
  const buttons = props.modelValue.buttons.filter((b) => b.key !== key)
  commit({ ...props.modelValue, buttons })
}

function hasEvents(btn: ViewActionButton): boolean {
  return !!(btn.events && btn.events.length > 0)
}

// ========== 自定义按钮事件链（按 key 定位） ==========
/** 从响应式 modelValue 直接读取按钮的事件动作列表（避免 el-table row 副本不刷新） */

/** 从响应式 modelValue 直接读取按钮的事件动作列表（避免 el-table row 副本不刷新） */
function getButtonActions(key: string): any[] {
  const btn = props.modelValue.buttons.find((b) => b.key === key)
  return btn?.events?.[0]?.actions || []
}

/** 从响应式 modelValue 读取动作参数列表 */
function getActionParamsForKey(key: string, ai: number): any[] {
  return getButtonActions(key)[ai]?.params || []
}

function setButtonEvents(key: string, events: any[]) {
  const buttons = props.modelValue.buttons.map((b) => (b.key === key ? { ...b, events } : b))
  commit({ ...props.modelValue, buttons })
}

function addEventAction(key: string) {
  const btn = props.modelValue.buttons.find((b) => b.key === key)
  if (!btn) return
  const events = [...(btn.events || [])]
  if (events.length === 0) {
    events.push({ trigger: 'click', actions: [{ type: 'message', params: [] }] })
  } else {
    events[0] = { ...events[0], actions: [...(events[0].actions || []), { type: 'message', params: [] }] }
  }
  setButtonEvents(key, events)
}

function removeEventAction(key: string, ai: number) {
  const btn = props.modelValue.buttons.find((b) => b.key === key)
  if (!btn || !btn.events || btn.events.length === 0) return
  const ev = btn.events[0]
  if (!ev || !ev.actions) return
  const events = [{ ...ev, actions: ev.actions.filter((_: any, i: number) => i !== ai) }]
  setButtonEvents(key, events)
}

function patchEventAction(key: string, ai: number, patch: Record<string, any>) {
  const btn = props.modelValue.buttons.find((b) => b.key === key)
  if (!btn || !btn.events || btn.events.length === 0) return
  const ev = btn.events[0]
  if (!ev || !ev.actions) return
  const events = [{ ...ev, actions: ev.actions.map((a: any, i: number) => (i === ai ? { ...a, ...patch } : a)) }]
  setButtonEvents(key, events)
}

function addEventParam(key: string, ai: number) {
  const btn = props.modelValue.buttons.find((b) => b.key === key)
  if (!btn || !btn.events || btn.events.length === 0) {
    // 无事件 → 先创建事件再添加参数
    setButtonEvents(key, [{ trigger: 'click', actions: [{ type: 'message', params: [{ key: '', value: '' }] }] }])
    return
  }
  const ev = btn.events[0]
  if (!ev || !ev.actions) return
  const events = [{
    ...ev,
    actions: ev.actions.map((a: any, i: number) =>
      i === ai ? { ...a, params: [...(a.params || []), { key: '', value: '' }] } : a,
    ),
  }]
  setButtonEvents(key, events)
}

function removeEventParam(key: string, ai: number, pi: number) {
  const btn = props.modelValue.buttons.find((b) => b.key === key)
  if (!btn || !btn.events || btn.events.length === 0) return
  const ev = btn.events[0]
  if (!ev || !ev.actions) return
  const events = [{
    ...ev,
    actions: ev.actions.map((a: any, i: number) =>
      i === ai ? { ...a, params: (a.params || []).filter((_: any, j: number) => j !== pi) } : a,
    ),
  }]
  setButtonEvents(key, events)
}

function patchEventParam(key: string, ai: number, pi: number, patch: Record<string, string>) {
  const btn = props.modelValue.buttons.find((b) => b.key === key)
  if (!btn || !btn.events || btn.events.length === 0) return
  const ev = btn.events[0]
  if (!ev || !ev.actions) return
  const events = [{
    ...ev,
    actions: ev.actions.map((a: any, i: number) =>
      i === ai
        ? { ...a, params: (a.params || []).map((p: any, j: number) => (j === pi ? { ...p, ...patch } : p)) }
        : a,
    ),
  }]
  setButtonEvents(key, events)
}

// ========== 操作列宽度 ==========
const actionColumnWidthValue = computed(() => props.modelValue.actionColumnWidth || 0)

function setActionColumnWidth(v: number | undefined) {
  commit({ ...props.modelValue, actionColumnWidth: v && v > 0 ? v : undefined })
}

// ========== 详情宽度 ==========
const detailWidth = computed(() => props.detail?.width || '800px')

/** 合并 detail 配置（保留必填字段 type/width；detail 可能为 undefined） */
function patchDetail(patch: Partial<ViewDetailConfig>): ViewDetailConfig {
  return {
    ...props.detail,
    type: props.detail?.type || 'form',
    width: props.detail?.width || '800px',
    ...patch,
  }
}

function setDetailWidth(v: string) {
  emit('update:detail', patchDetail({ width: v }))
}

// ========== 详情高度 ==========
const detailHeight = computed(() => props.detail?.height || '')

function setDetailHeight(v: string) {
  emit('update:detail', patchDetail({ height: v || undefined }))
}

// ========== 表单方式 ==========
const detailFormMode = computed<'popup' | 'drawer' | 'inline' | undefined>({
  get: () => props.detail?.formMode,
  set: (v) => {
    if (!props.detail) return
    emit('update:detail', patchDetail({ formMode: v }))
  }
})

function setDetailFormMode(v: 'popup' | 'drawer' | 'inline' | undefined) {
  detailFormMode.value = v
}

// ========== 权限点 ==========
const permissionArray = computed<string[]>({
  get: () => (props.modelValue.permissions || '').split(',').map((s) => s.trim()).filter(Boolean),
  set: (arr: string[]) => {
    commit({ ...props.modelValue, permissions: arr.join(',') })
  },
})

function setPermissionArray(arr: string[]) {
  permissionArray.value = arr
}

function commit(v: ViewActionsConfig) {
  emit('update:modelValue', v)
}

// ========== 按钮表格拖拽排序 ==========
const tableWrapperRef = ref<HTMLElement>()
let buttonSortable: Sortable | null = null

/** 初始化按钮表格行拖拽（sortablejs 绑定 el-table tbody；整行可拖，展开行不参与） */
function initButtonSortable() {
  nextTick(() => {
    if (buttonSortable) {
      buttonSortable.destroy()
      buttonSortable = null
    }
    const tbody = tableWrapperRef.value?.querySelector('.el-table__body-wrapper tbody')
    if (!tbody) return
    buttonSortable = Sortable.create(tbody as HTMLElement, {
      animation: 150,
      filter: '.el-table__expanded-row',
      onEnd: (evt: any) => {
        const oldIndex = evt.oldIndex
        const newIndex = evt.newIndex
        if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return
        const buttons = [...props.modelValue.buttons]
        const [moved] = buttons.splice(oldIndex, 1)
        buttons.splice(newIndex, 0, moved)
        commit({ ...props.modelValue, buttons })
      },
    })
  })
}

onMounted(initButtonSortable)
// 按钮数量变化（增删）后重新绑定
watch(() => props.modelValue.buttons.length, initButtonSortable)
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
.add-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.button-events {
  padding: 8px 12px;
  background: #f5f7fa;
  border-radius: 4px;
}
.events-title {
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 8px;
  color: #606266;
}
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
.var-hint {
  margin-top: 6px;
  font-size: 14px;
  color: #909399;
}
/* label 文字 + 问号提示图标：flex 垂直居中；align-self:center 在 el-form-item__label（默认 align-items:flex-start）内垂直居中，与右侧控件对齐 */
.label-with-tip {
  display: inline-flex;
  align-items: center;
  align-self: center;
  line-height: 1;
}
.label-with-tip .tip-icon {
  margin-left: 4px;
  color: #909399;
  cursor: help;
}
/* 表单方式 + 弹窗宽度：同一行并排 */
.form-config-row {
  display: flex;
  align-items: center;
  gap: 20px;
}
.form-config-col {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.muted {
  color: #c0c4cc;
  font-size: 14px;
}
.icon-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
