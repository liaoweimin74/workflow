<template>
  <div class="location-picker">
    <div class="location-picker__inputs">
      <div class="location-picker__field">
        <span class="location-picker__label">纬度</span>
        <el-input-number
          class="location-picker__number"
          :model-value="lat"
          :disabled="disabled"
          :min="-90"
          :max="90"
          :precision="6"
          :step="0.000001"
          :controls="false"
          placeholder="-90 ~ 90"
          @update:model-value="onLatInput"
        />
      </div>
      <div class="location-picker__field">
        <span class="location-picker__label">经度</span>
        <el-input-number
          class="location-picker__number"
          :model-value="lng"
          :disabled="disabled"
          :min="-180"
          :max="180"
          :precision="6"
          :step="0.000001"
          :controls="false"
          placeholder="-180 ~ 180"
          @update:model-value="onLngInput"
        />
      </div>
      <el-button
        v-if="clearable"
        class="location-picker__clear"
        :disabled="disabled || !hasValue"
        @click="handleClear"
      >
        清空
      </el-button>
    </div>
    <!-- 粘贴解析：'39.9042,116.4074'（支持中英文逗号/空格分隔）自动拆分回填 -->
    <el-input
      v-model="pasteText"
      class="location-picker__paste"
      :disabled="disabled"
      placeholder="粘贴「纬度,经度」快速填入，如 39.9042,116.4074"
      clearable
      @input="onPasteInput"
    >
      <template #prefix>
        <el-icon><Location /></el-icon>
      </template>
    </el-input>
    <!-- 当前值格式化预览 -->
    <div class="location-picker__preview" :class="{ 'is-empty': !hasValue }">
      {{ hasValue ? `当前坐标：${formattedValue}` : '未设置坐标' }}
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 定位 LocationPicker（Task 3-g，降级版）——表单设计器「基础组件」分组。
 *
 * 【降级说明】不依赖任何外部地图 SDK（无拾点/逆地理编码），提供经纬度数值录入 +
 * 粘贴解析 + 格式化预览；地图选点版本由后续任务接入 SDK 后升级。
 *
 * 【值契约】modelValue = string：'纬度,经度'（各保留至多 6 位小数，去尾零）或 ''（空）。
 * - 纬度范围 [-90, 90]、经度范围 [-180, 180]，el-input-number min/max + 发射前 clamp 双保险
 * - emit('update:modelValue', value) + emit('change', value)，form-create change 事件可用
 * - 粘贴解析支持英文/中文逗号及空白分隔；非法输入不破坏当前值
 */
import { computed, ref, watch } from 'vue'
import { Location } from '@element-plus/icons-vue'

const props = withDefaults(defineProps<{
  /** 坐标值：'lat,lng' 字符串（至多 6 位小数）或 ''（未设置） */
  modelValue?: string
  /** 禁用 */
  disabled?: boolean
  /** 是否显示清空按钮 */
  clearable?: boolean
}>(), {
  modelValue: '',
  disabled: false,
  clearable: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'change': [value: string]
}>()

const lat = ref<number | null>(null)
const lng = ref<number | null>(null)
const pasteText = ref('')

/** '39.9042,116.4074' → [39.9042, 116.4074]；支持中英文逗号/空白分隔，非法返回 null */
function parseCoordText(text: string): [number, number] | null {
  const parts = String(text || '').trim().split(/[,，;\s;]+/).filter(Boolean)
  if (parts.length !== 2) return null
  const a = Number(parts[0])
  const b = Number(parts[1])
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  if (a < -90 || a > 90 || b < -180 || b > 180) return null
  return [a, b]
}

/** 解析 modelValue → lat/lng（非法/空值 → null，不抛错） */
watch(
  () => props.modelValue,
  (val) => {
    const parsed = parseCoordText(val || '')
    lat.value = parsed ? parsed[0] : null
    lng.value = parsed ? parsed[1] : null
  },
  { immediate: true },
)

const hasValue = computed(() => lat.value !== null && lng.value !== null)

/** 数值 → 至多 6 位小数字符串（去尾零：39.9 → '39.9'） */
function trimCoord(n: number): string {
  return String(parseFloat(Number(n).toFixed(6)))
}

/** 发射前 clamp（越界钳制到合法区间） */
function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}

/** 值规范化并发射：双向都有值才拼 'lat,lng'，否则空串 */
function commit() {
  const value = (lat.value !== null && lng.value !== null)
    ? `${trimCoord(lat.value)},${trimCoord(lng.value)}`
    : ''
  if (value === (props.modelValue || '')) return
  emit('update:modelValue', value)
  emit('change', value)
}

function onLatInput(v: number | null) {
  onNumberChange('lat', v)
}

function onLngInput(v: number | null) {
  onNumberChange('lng', v)
}

function onNumberChange(which: 'lat' | 'lng', v: number | null) {
  if (v === null || !Number.isFinite(v)) {
    if (which === 'lat') lat.value = null
    else lng.value = null
  } else if (which === 'lat') {
    lat.value = clamp(v, -90, 90)
  } else {
    lng.value = clamp(v, -180, 180)
  }
  commit()
}

function onPasteInput(text: string) {
  const parsed = parseCoordText(text)
  if (!parsed) return // 非法输入忽略，不破坏当前值
  lat.value = parsed[0]
  lng.value = parsed[1]
  pasteText.value = ''
  commit()
}

function handleClear() {
  lat.value = null
  lng.value = null
  pasteText.value = ''
  commit()
}

/** 格式化预览：'39.9042, 116.4074' */
const formattedValue = computed(() =>
  hasValue.value ? `${trimCoord(lat.value as number)}, ${trimCoord(lng.value as number)}` : '',
)

defineOptions({ name: 'LocationPicker' })
defineExpose({ parseCoordText, formattedValue })
</script>

<style scoped>
.location-picker {
  width: 100%;
}

.location-picker__inputs {
  display: flex;
  align-items: center;
  gap: 8px;
}

.location-picker__field {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.location-picker__label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.location-picker__number {
  flex: 1;
  min-width: 0;
}

.location-picker__paste {
  margin-top: 8px;
}

.location-picker__preview {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
  color: var(--el-color-primary);
}

.location-picker__preview.is-empty {
  color: var(--el-text-color-placeholder);
}
</style>
