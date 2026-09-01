<template>
  <el-drawer
    v-model="drawerVisible"
    title="通知设置"
    size="420px"
    :destroy-on-close="true"
  >
    <div v-loading="loading" class="settings-content">
      <p class="settings-tip">开启或关闭各渠道的消息接收。关闭后，该渠道的消息将不再推送给你。</p>

      <div class="channel-list">
        <div v-for="item in prefs" :key="item.channel" class="channel-item">
          <span class="channel-name">{{ item.channelName }}</span>
          <span class="channel-code">{{ item.channel }}</span>
          <el-switch
            v-model="item.subscribed"
            active-text="接收"
            inactive-text="关闭"
          />
        </div>
      </div>

      <div class="settings-footer">
        <el-button @click="drawerVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getSubscriptionPreferences, updateSubscriptionPreferences } from '../api/notification'
import type { SubscriptionPreference } from '../types'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  /** 保存成功后触发 */
  (e: 'saved'): void
}>()

const drawerVisible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const loading = ref(false)
const saving = ref(false)
const prefs = ref<SubscriptionPreference[]>([])

/** 打开抽屉时加载当前用户订阅偏好 */
watch(
  () => props.modelValue,
  async (visible) => {
    if (visible) {
      loading.value = true
      try {
        const res = await getSubscriptionPreferences()
        prefs.value = (res.data as SubscriptionPreference[]) || []
      } finally {
        loading.value = false
      }
    }
  },
)

async function handleSave() {
  saving.value = true
  try {
    const items = prefs.value.map((p) => ({ channel: p.channel, subscribed: p.subscribed }))
    await updateSubscriptionPreferences(items)
    ElMessage.success('通知设置已保存')
    emit('saved')
    drawerVisible.value = false
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.settings-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.settings-tip {
  margin: 0 0 16px;
  font-size: 13px;
  color: #909399;
  line-height: 1.6;
}
.channel-list {
  flex: 1;
}
.channel-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
}
.channel-name {
  font-size: 14px;
  color: #303133;
}
.channel-code {
  flex: 1;
  font-size: 12px;
  color: #c0c4cc;
}
.settings-footer {
  padding-top: 16px;
  text-align: right;
}
</style>
