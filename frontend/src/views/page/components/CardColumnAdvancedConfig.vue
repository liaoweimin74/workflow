<template>
  <el-dialog
    :model-value="visible"
    title="卡片字段高级配置"
    width="560px"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-form v-if="column" class="card-column-advanced-config" label-width="110px">
      <el-form-item label="角色">
        <el-select :model-value="col?.role" clearable @change="(v: string) => patch({ role: v || undefined })">
          <el-option label="普通字段" value="field" />
          <el-option label="标题" value="title" />
          <el-option label="副标题" value="subtitle" />
          <el-option label="标签" value="tag" />
          <el-option label="指标" value="metric" />
        </el-select>
      </el-form-item>
      <el-form-item label="值类型"><el-input :model-value="col?.valueType" placeholder="如 currency / number / date" @input="(v: string) => patch({ valueType: v || undefined })" /></el-form-item>
      <el-form-item label="对齐">
        <el-select :model-value="col?.align" @change="(v: string) => patch({ align: v })">
          <el-option label="左对齐" value="left" /><el-option label="居中" value="center" /><el-option label="右对齐" value="right" />
        </el-select>
      </el-form-item>
      <el-form-item label="字体">
        <el-select :model-value="col?.fontFamily" clearable @change="(v: string) => patch({ fontFamily: v || undefined })">
          <el-option label="系统默认" value="system-ui" />
          <el-option label="微软雅黑" value="Microsoft YaHei" />
          <el-option label="等线" value="DengXian" />
          <el-option label="宋体" value="SimSun" />
        </el-select>
      </el-form-item>
      <el-form-item label="字号"><el-input-number :model-value="col?.fontSize" :min="10" :max="48" @change="(v: number | undefined) => patch({ fontSize: v })" /></el-form-item>
      <el-form-item label="字重"><el-select :model-value="String(col?.fontWeight || '')" clearable @change="(v: string) => patch({ fontWeight: v ? Number(v) : undefined })"><el-option label="常规" value="400" /><el-option label="中等" value="500" /><el-option label="加粗" value="700" /></el-select></el-form-item>
      <el-form-item label="颜色"><el-input :model-value="col?.fontColor" placeholder="#303133" @input="(v: string) => patch({ fontColor: v || undefined })" /></el-form-item>
      <el-form-item label="显示标签"><el-switch :model-value="col?.showLabel !== false" @change="(v: boolean) => patch({ showLabel: v })" /></el-form-item>
      <el-form-item label="标签位置">
        <el-select :model-value="col?.labelPosition || 'left'" @change="(v: string) => patch({ labelPosition: v })">
          <el-option label="左对齐" value="left" /><el-option label="右对齐" value="right" /><el-option label="顶部" value="top" />
        </el-select>
      </el-form-item>
      <el-form-item label="样式语法">
        <el-input :model-value="col?.style" type="textarea" :rows="4" placeholder="color: #409eff; font-weight: 700;" @input="(v: string) => patch({ style: v || undefined })" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" @click="handleSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ColumnViewConfig } from '../ViewDesigner.vue'

type CardColumnConfig = ColumnViewConfig & {
  role?: string; valueType?: string; align?: 'left' | 'center' | 'right'
  fontFamily?: string; fontSize?: number; fontWeight?: string | number; fontColor?: string
  showLabel?: boolean; labelPosition?: 'left' | 'right' | 'top'; style?: string
}

const props = defineProps<{ visible: boolean; column: CardColumnConfig | null }>()
const emit = defineEmits<{ (e: 'update:visible', value: boolean): void; (e: 'save', column: CardColumnConfig): void }>()
const col = ref<CardColumnConfig | null>(null)

watch(() => props.column, (value) => { col.value = value ? { ...value } : null }, { immediate: true })
function patch(value: Partial<CardColumnConfig>) { if (col.value) col.value = { ...col.value, ...value } }
function handleSave() { if (col.value) { emit('save', { ...col.value }); emit('update:visible', false) } }
</script>
