<script setup lang="ts">
// A5 发布目标端对话框：端列表来自 clientOptions（不带 config 字段），缺省勾选平台端(1)，
// 停用端置灰；空选择在前端阻断——服务端 publish 对空 clientIds 缺省 portal，前端不得隐式放行。
// 批C C3：选中含移动渠道(H5/APP/MP)的目标端时，按 §8.3 两级清单拦截——
// 块级（无移动等价）阻断发布；字段级（EP-only 占位降级）提示不阻塞（批 B 裁定）。
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { clientOptions } from '@/api/client'
import type { ClientOptionVO } from '@/types/client'
import { collectMobilePublishIssues, hasMobileChannel } from '@/render/mobile/mobilePublishGate'

const props = defineProps<{
  modelValue: boolean
  pageName?: string
  /** 当前页面 rule（宿主有画布/定义时才传；缺省不做移动拦截检查=与 A5 原状一致） */
  rule?: unknown[]
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

/** 选中目标端里存在的移动渠道（勾选端 ∩ 渠道含 H5/APP/MP） */
const mobileTargets = computed(() =>
  options.value.filter((c) => selection.value.includes(c.id) && hasMobileChannel(c.channelTypes)),
)

/** 两级清单：只在存在移动目标端时计算（无移动端=清单不可见也不触发） */
const mobileIssues = computed(() => {
  if (mobileTargets.value.length === 0 || !props.rule) return null
  return collectMobilePublishIssues(props.rule)
})

function onConfirm() {
  if (selection.value.length === 0) {
    ElMessage.warning('至少选择一个发布目标端')
    return
  }
  // §5.1「无移动等价 → 标记并拦截」：块级缺失禁发到移动渠道（字段级不阻塞）
  if (mobileIssues.value && mobileIssues.value.blocks.length > 0) {
    ElMessage.warning(`该页面含移动端不支持的组件（${mobileIssues.value.blocks.map((b) => b.block).join('、')}），请移除后再发布到移动端`)
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

    <!-- 移动渠道发布拦截清单（§8.3 两级：块级该端不支持=阻断；字段级占位降级=提示） -->
    <div v-if="mobileIssues && (mobileIssues.blocks.length > 0 || mobileIssues.fields.length > 0)" class="publish-mobile-gate">
      <div v-for="b in mobileIssues.blocks" :key="b.block" class="gate-row gate-block">
        <el-tag type="danger" size="small">该端不支持</el-tag>
        <span class="gate-name">{{ b.block }}</span>
        <span class="gate-reason">{{ b.reason }}</span>
      </div>
      <div v-for="f in mobileIssues.fields" :key="f.type" class="gate-row gate-field">
        <el-tag type="warning" size="small">移动降级</el-tag>
        <span class="gate-name">{{ f.type }}</span>
        <span class="gate-reason">{{ f.reason }}</span>
      </div>
      <div class="gate-note">
        目标端（{{ mobileTargets.map((c) => c.name).join('、') }}）含移动渠道；块级缺失项须移除后方可发布，
        降级字段将在移动端以占位提示呈现。
      </div>
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
.publish-mobile-gate {
  margin-top: 10px;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  background: var(--el-fill-color-lighter);
  font-size: 12px;
}
.gate-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.gate-name {
  font-weight: 600;
}
.gate-reason {
  color: var(--el-text-color-secondary);
}
.gate-note {
  margin-top: 6px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
</style>
