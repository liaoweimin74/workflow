<template>
  <el-dialog v-model="visible" :title="title" width="680px" :close-on-click-modal="false" :append-to-body="true" :modal="true" :z-index="3000">
    <div class="scope-tip">作用范围：{{ scope }}</div>
    <el-input v-model="draft" type="textarea" :rows="14" autocomplete="off" placeholder="background-color: #0f2747;\nborder-color: #1677ff;" />
    <div class="script-tip">请输入不带选择器的 CSS 属性声明，每行一条规则。</div>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="confirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{ modelValue: boolean; script: string; title: string; scope: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void; (e: 'confirm', value: string): void }>()
const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const draft = ref(props.script)

watch(() => props.modelValue, open => { if (open) draft.value = props.script })

function confirm() {
  emit('confirm', draft.value.trim())
  visible.value = false
}
</script>

<style scoped>
.scope-tip { margin-bottom: 10px; color: #606266; font-size: 13px; }
.script-tip { margin-top: 6px; color: #909399; font-size: 12px; }
</style>
