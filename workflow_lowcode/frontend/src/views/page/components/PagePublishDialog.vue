<script setup lang="ts">
// A5 发布目标端对话框：端列表来自 clientOptions（不带 config 字段），缺省勾选平台端(1)，
// 停用端置灰；空选择在前端阻断——服务端 publish 对空 clientIds 缺省 portal，前端不得隐式放行。
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { clientOptions } from '@/api/client'
import type { ClientOptionVO } from '@/types/client'

const props = defineProps<{
  modelValue: boolean
  pageName?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [clientIds: number[]]
}>()

/** 与后端 SysClient.PORTAL_CLIENT_ID / PageTargetClients 缺省同口径 */
const PORTAL_CLIENT_ID = 1

const options = ref<ClientOptionVO[]>([])
const selection = ref<number[]>([PORTAL_CLIENT_ID])
const loading = ref(false)

watch(
  () => props.modelValue,
  (v) => {
    if (v) load()
  },
  { immediate: true },
)

async function load() {
  loading.value = true
  try {
    const res = await clientOptions()
    options.value = res.data ?? []
    // 每次打开重置缺省：portal(1) 勾选（与 publish 缺省语义一致）
    selection.value = options.value.some((c) => c.id === PORTAL_CLIENT_ID) ? [PORTAL_CLIENT_ID] : []
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    loading.value = false
  }
}

function onConfirm() {
  if (selection.value.length === 0) {
    ElMessage.warning('至少选择一个发布目标端')
    return
  }
  emit('confirm', [...selection.value].sort((a, b) => a - b))
  emit('update:modelValue', false)
}

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="pageName ? `发布页面「${pageName}」` : '发布页面'"
    width="460px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="publish-target-clients">
      <div class="target-label">目标端</div>
      <el-checkbox-group v-model="selection">
        <div v-for="c in options" :key="c.id" class="target-row">
          <el-checkbox :value="c.id" :disabled="c.status !== 1">
            {{ c.name }}<span v-if="c.status !== 1" class="disabled-tag">（停用）</span>
            <el-tag
              v-for="t in c.channelTypes"
              :key="t"
              size="small"
              class="channel-badge"
              style="margin-left: 6px"
            >{{ t }}</el-tag>
          </el-checkbox>
        </div>
      </el-checkbox-group>
      <el-empty v-if="!loading && options.length === 0" description="无可选客户端" :image-size="60" />
    </div>
    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="primary" @click="onConfirm">确认发布</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.target-label {
  margin-bottom: 8px;
  font-weight: 600;
}
.target-row {
  margin-bottom: 4px;
}
.disabled-tag {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
