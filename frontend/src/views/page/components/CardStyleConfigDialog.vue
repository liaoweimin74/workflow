<template>
  <el-dialog v-model="visible" title="卡片样式脚本" width="720px" :close-on-click-modal="false" destroy-on-close>
    <el-form label-width="110px" size="default">
      <el-divider content-position="left">基础颜色</el-divider>
      <el-form-item label="背景色">
        <el-input v-model="form.backgroundColor" placeholder="如 #ffffff" @input="(v: string) => patch('backgroundColor', v || undefined)" />
      </el-form-item>
      <el-form-item label="边框色">
        <el-input v-model="form.borderColor" placeholder="如 #e4e7ed" @input="(v: string) => patch('borderColor', v || undefined)" />
      </el-form-item>
      <el-form-item label="悬停阴影色">
        <el-input v-model="form.hoverShadowColor" placeholder="如 rgba(0,0,0,0.10)" @input="(v: string) => patch('hoverShadowColor', v || undefined)" />
      </el-form-item>

      <el-divider content-position="left">尺寸</el-divider>
      <el-form-item label="圆角">
        <el-input-number v-model.number="form.borderRadius" :min="0" :max="48" @change="(v: number | undefined) => patch('borderRadius', v)" />
      </el-form-item>
      <el-form-item label="内边距">
        <el-input-number v-model.number="form.padding" :min="0" :max="80" @change="(v: number | undefined) => patch('padding', v)" />
      </el-form-item>
      <el-form-item label="卡片间距">
        <el-input-number v-model.number="form.gap" :min="0" :max="80" @change="(v: number | undefined) => patch('gap', v)" />
      </el-form-item>

      <el-divider content-position="left">标题字体</el-divider>
      <el-form-item label="标题字号">
        <el-input-number v-model.number="form.titleFontSize" :min="10" :max="48" @change="(v: number | undefined) => patch('titleFontSize', v)" />
      </el-form-item>
      <el-form-item label="标题字重">
        <el-select v-model="form.titleFontWeight" clearable @change="(v: string | number | undefined) => patch('titleFontWeight', v || undefined)">
          <el-option label="常规" :value="400" /><el-option label="中等" :value="500" /><el-option label="加粗" :value="700" />
        </el-select>
      </el-form-item>
      <el-form-item label="标题颜色">
        <el-input v-model="form.titleColor" placeholder="如 #303133" @input="(v: string) => patch('titleColor', v || undefined)" />
      </el-form-item>

      <el-divider content-position="left">字段字体</el-divider>
      <el-form-item label="字段字号">
        <el-input-number v-model.number="form.fieldFontSize" :min="10" :max="48" @change="(v: number | undefined) => patch('fieldFontSize', v)" />
      </el-form-item>
      <el-form-item label="标签颜色">
        <el-input v-model="form.fieldLabelColor" placeholder="如 #909399" @input="(v: string) => patch('fieldLabelColor', v || undefined)" />
      </el-form-item>
      <el-form-item label="值颜色">
        <el-input v-model="form.fieldValueColor" placeholder="如 #303133" @input="(v: string) => patch('fieldValueColor', v || undefined)" />
      </el-form-item>

      <el-divider content-position="left">字段区域</el-divider>
      <el-form-item label="布局">
        <el-radio-group v-model="fields.layout" @update:model-value="patchFields('layout', $event)">
          <el-radio value="grid">栅格</el-radio>
          <el-radio value="list">列表</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item v-if="fields.layout === 'grid'" label="列数">
        <el-input-number v-model.number="fields.columns" :min="1" :max="6" @change="(v: number | undefined) => patchFields('columns', v)" />
      </el-form-item>
      <el-form-item label="字段间距">
        <el-input-number v-model.number="fields.gap" :min="0" :max="40" @change="(v: number | undefined) => patchFields('gap', v)" />
      </el-form-item>
      <el-form-item label="标签位置">
        <el-select v-model="fields.labelPosition" clearable @change="(v: string | undefined) => patchFields('labelPosition', v || undefined)">
          <el-option label="左" value="left" /><el-option label="右" value="right" /><el-option label="上" value="top" />
        </el-select>
      </el-form-item>
      <el-form-item label="标签宽度">
        <el-input-number v-model.number="fields.labelWidth" :min="0" :max="200" @change="(v: number | undefined) => patchFields('labelWidth', v)" />
      </el-form-item>
      <el-form-item label="显示标签">
        <el-switch v-model="fields.showLabel" @change="(v: boolean) => patchFields('showLabel', v)" />
      </el-form-item>

      <el-divider content-position="left">区域布局</el-divider>
      <el-form-item label="头部图标">
        <el-input v-model="headerIcon" placeholder="图标名，如 Star / 留空不显示" @input="syncHeaderIcon" />
      </el-form-item>
      <el-form-item label="操作区位置">
        <el-select v-model="regionsActionsPosition" clearable @change="(v: string | undefined) => patchActions('position', v || undefined)">
          <el-option label="顶部" value="top" /><el-option label="底部" value="bottom" /><el-option label="右侧" value="right" />
        </el-select>
      </el-form-item>

      <el-divider content-position="left">CSS 逃生舱（作用于每张卡片）</el-divider>
      <el-form-item label="CSS 文本">
        <el-input
          :model-value="form.css"
          type="textarea"
          :rows="3"
          placeholder='如 border: 2px dashed red; opacity: 0.9'
          @input="(v: string) => patch('css', v || undefined)"
        />
      </el-form-item>

      <el-divider content-position="left">条件样式（根据行数据切换整卡外观）</el-divider>
      <div style="width: 100%">
        <div v-for="(rule, i) in form.dynamic || []" :key="i" class="dynamic-row">
          <el-input
            :model-value="rule.when"
            placeholder="条件，如 $row.status === '异常'"
            style="flex: 1"
            @input="(v: string) => patchDynamic(i, { when: v })"
          />
          <el-input
            :model-value="rule.style ? Object.entries(rule.style).map(([k, val]) => `${k}:${val}`).join('; ') : ''"
            placeholder="命中样式，如 background:#ffeaea;color:#f56c6c"
            style="flex: 1"
            @input="(v: string) => patchDynamicStyle(i, v)"
          />
          <el-button link type="danger" @click="removeDynamic(i)">删</el-button>
        </div>
        <el-button type="primary" plain size="small" @click="addDynamic">+ 条件样式</el-button>
      </div>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="handleConfirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { CardStyle } from '@/components/business/ListCards.types'
import type { ConditionalStyle } from '@/utils/fieldStyle'

const props = defineProps<{
  modelValue: boolean
  /** 当前卡片样式（用于编辑回显） */
  cardStyle?: CardStyle
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'confirm', style: CardStyle): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const form = reactive<CardStyle>({})
const fields = reactive<NonNullable<CardStyle['fields']>>({})
const regionsActionsPosition = ref<'top' | 'bottom' | 'right' | undefined>(undefined)
const headerIcon = ref<string | undefined>(undefined)

/** 从 props.cardStyle 初始化内部表单（打开弹窗时同步） */
function initForm() {
  const src: CardStyle = props.cardStyle || {}
  Object.keys(form).forEach((k) => delete (form as any)[k])
  Object.assign(form, src)
  // fields 子对象
  Object.keys(fields).forEach((k) => delete (fields as any)[k])
  Object.assign(fields, src.fields || {})
  // regions 快捷访问
  const icon = src.regions?.header?.icon
  headerIcon.value = typeof icon === 'object' ? icon.name : (icon as string | undefined)
  regionsActionsPosition.value = src.regions?.actions?.position
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) initForm()
  },
)
// 初次挂载即处于打开状态（modelValue 初始为 true）时同步初始化
initForm()

/** 顶层属性补丁（值为 undefined 时删除该 key） */
function patch(key: keyof CardStyle, value: any) {
  if (value === undefined || value === null || value === '') {
    delete (form as any)[key]
  } else {
    (form as any)[key] = value
  }
}

/** fields 子对象补丁 */
function patchFields(key: keyof typeof fields, value: any) {
  if (value === undefined || value === null || value === '') {
    delete (fields as any)[key]
  } else {
    ;(fields as any)[key] = value
  }
  if (Object.keys(fields).length > 0) {
    form.fields = { ...fields }
  } else {
    delete form.fields
  }
}

/** regions.actions 补丁 */
function patchActions(key: string, value: any) {
  form.regions = form.regions || {}
  form.regions.actions = form.regions.actions || {}
  if (value === undefined || value === null || value === '') {
    delete (form.regions.actions as any)[key]
  } else {
    ;(form.regions.actions as any)[key] = value
  }
}

function syncHeaderIcon() {
  form.regions = form.regions || {}
  if (headerIcon.value) {
    form.regions.header = { ...(form.regions.header || {}), show: true, icon: headerIcon.value }
  } else {
    delete form.regions.header
  }
}

/** 动态条件样式 */
function addDynamic() {
  form.dynamic = form.dynamic || []
  form.dynamic.push({ when: '' })
}
function removeDynamic(i: number) {
  const arr = form.dynamic || []
  arr.splice(i, 1)
  if (arr.length === 0) delete form.dynamic
}
function patchDynamic(i: number, patchData: Partial<ConditionalStyle>) {
  const arr = form.dynamic || []
  arr[i] = { ...arr[i], ...patchData }
}
function patchDynamicStyle(i: number, cssText: string) {
  const style: Record<string, string> = {}
  for (const entry of cssText.split(';')) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    const idx = trimmed.indexOf(':')
    if (idx <= 0) continue
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim()
    if (key && value) style[key] = value
  }
  // 空样式串 → 删除 style 键
  const next = { ...(form.dynamic![i]) }
  if (Object.keys(style).length > 0) next.style = style
  else delete next.style
  form.dynamic![i] = next
}

function handleConfirm() {
  const out: CardStyle = { ...form }

  // 字段区域：始终以当前 fields 状态为准
  if (Object.keys(fields).length > 0) {
    out.fields = { ...fields }
  }

  // 区域布局：头部图标 / 操作区位置
  if (headerIcon.value) {
    out.regions = out.regions || {}
    out.regions.header = { ...(out.regions.header || {}), show: true, icon: headerIcon.value }
  }
  if (regionsActionsPosition.value) {
    out.regions = out.regions || {}
    out.regions.actions = { ...(out.regions.actions || {}), position: regionsActionsPosition.value }
  }

  emit('confirm', out)
  visible.value = false
}
</script>

<style scoped>
.dynamic-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
  width: 100%;
}
</style>
