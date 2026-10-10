<template>
  <div class="relation-card">
    <el-card
      class="relation-card__body"
      :class="{ 'is-clickable': clickable && hasValue, 'is-empty': !hasValue }"
      :shadow="clickable && hasValue ? 'hover' : 'never'"
      @click="handleClick"
    >
      <div class="relation-card__header">
        <el-icon class="relation-card__icon"><Connection /></el-icon>
        <span class="relation-card__title">{{ title || '关联记录' }}</span>
        <el-icon v-if="clickable && hasValue" class="relation-card__arrow"><ArrowRight /></el-icon>
      </div>
      <!-- 值摘要：字符串直显 / 对象取 display 字段 / 空值占位 -->
      <div v-if="hasValue" class="relation-card__value" :title="summaryText">
        {{ summaryText }}
      </div>
      <div v-else class="relation-card__placeholder">
        <el-icon><InfoFilled /></el-icon>
        <span>未选择关联记录</span>
      </div>
      <div v-if="description" class="relation-card__desc">{{ description }}</div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
/**
 * 关联记录卡片 RelationCard（Task 3-g）——表单设计器「基础组件」分组，只读展示。
 *
 * 【值形态（对齐 LookupPicker）】
 * LookupPicker 的 modelValue = 显示文本字符串（新语义，field 绑定显示文本字段）或整行对象（旧兼容），
 * 记录 id 通过 idField 独立写入其它隐藏字段。本组件消费同形态值做只读卡片展示：
 * - string / number → 直接展示
 * - object → 按 displayField 深层取值（BizDataVO 内层 row.data[key] 优先，回退 row[key]，
 *   复用 lookupFetch.readCellValue 与 LookupPicker 同源）；未配置 displayField 时依次回退
 *   name/title/label/id 常用键；仍取不到则 JSON 序列化兜底
 * - null / undefined / '' → 「未选择关联记录」占位
 *
 * 【交互】clickable（默认 true）时：整卡 hover 阴影 + 点击 emit('open-detail', modelValue)，
 * 由宿主（联动规则 / 运行时渲染器）决定详情打开方式，组件自身不内置弹窗。
 */
import { computed } from 'vue'
import { ArrowRight, Connection, InfoFilled } from '@element-plus/icons-vue'
import { readCellValue } from './lookupFetch'

const props = withDefaults(defineProps<{
  /** 关联记录值：显示文本字符串 / 整行对象 / 空值（对齐 LookupPicker 值形态） */
  modelValue?: any
  /** 卡片标题行文案（form-create 字段 label 在卡片外，此为卡内标题） */
  title?: string
  /** 说明文字（值摘要下方的次级说明） */
  description?: string
  /** 对象值取显示字段（深层取值，未配置回退 name/title/label/id） */
  displayField?: string
  /** 是否可点击查看详情（hover 阴影 + open-detail 事件） */
  clickable?: boolean
}>(), {
  modelValue: null,
  title: '',
  description: '',
  displayField: '',
  clickable: true,
})

const emit = defineEmits<{
  /** 点击卡片请求打开详情（仅 clickable 且有值时触发，携带原始值） */
  'open-detail': [value: any]
}>()

/** 是否有值（空串 / null / undefined 视为未选择） */
const hasValue = computed(() => {
  const v = props.modelValue
  return v !== null && v !== undefined && v !== ''
})

/** 对象值取显示字段：displayField 深层取值优先，未配置/取不到依次回退常用键 */
function pickObjectDisplay(obj: Record<string, any>): string {
  const keys = props.displayField ? [props.displayField, 'name', 'title', 'label', 'id'] : ['name', 'title', 'label', 'id']
  for (const key of keys) {
    const v = readCellValue(obj, key)
    if (v !== undefined && v !== null && v !== '') return String(v)
  }
  try {
    return JSON.stringify(obj)
  } catch {
    return String(obj)
  }
}

/** 值摘要文本：字符串/数值直显，对象取 display 字段 */
const summaryText = computed(() => {
  const v = props.modelValue
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'object') return pickObjectDisplay(v)
  return String(v)
})

function handleClick() {
  if (!props.clickable || !hasValue.value) return
  emit('open-detail', props.modelValue)
}

defineOptions({ name: 'RelationCard' })
defineExpose({ summaryText, hasValue })
</script>

<style scoped>
.relation-card {
  width: 100%;
}

.relation-card__body {
  width: 100%;
}

.relation-card__body.is-clickable {
  cursor: pointer;
  transition: box-shadow var(--el-transition-duration), transform var(--el-transition-duration);
}

.relation-card__body.is-clickable:hover {
  transform: translateY(-1px);
}

.relation-card__body.is-empty {
  --el-card-bg-color: var(--el-fill-color-lighter);
}

.relation-card__header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.relation-card__icon {
  color: var(--el-color-primary);
}

.relation-card__arrow {
  margin-left: auto;
  color: var(--el-text-color-placeholder);
}

.relation-card__title {
  font-size: 14px;
  line-height: 1.6;
}

.relation-card__value {
  margin-top: 6px;
  font-size: 16px;
  color: var(--el-text-color-regular);
  word-break: break-all;
}

.relation-card__placeholder {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 13px;
  color: var(--el-text-color-placeholder);
}

.relation-card__desc {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
</style>
