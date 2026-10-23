<template>
  <div :class="['device-frame', designType === 'uniapp' ? 'device-frame--phone' : 'device-frame--desktop']">
    <div v-if="designType === 'uniapp'" class="device-frame__statusbar">
      <span>9:41</span>
      <span class="device-frame__notch" />
    </div>
    <div class="device-frame__screen" :style="screenVars">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { UNI_CSS_VARS } from '@lc/ui-mobile'

/**
 * 画布设备框（Task 2.2）：web=桌面宽度自适应；uniapp=375×667 手机壳。
 * uniapp 壳内挂 --ds-* 令牌（theme.ts 克隆的 uni-ui token），画布内容与皮肤层统一取色。
 */
const props = defineProps<{ designType: 'web' | 'uniapp' }>()

const screenVars = computed(() => (props.designType === 'uniapp' ? UNI_CSS_VARS : {}))
</script>

<style scoped>
.device-frame--desktop {
  width: 100%;
}

.device-frame--phone {
  width: 375px;
  height: 667px;
  margin: 0 auto;
  border-radius: 24px;
  border: 1px solid var(--ds-border, #e5e5e5);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--ds-bg, #f8f8f8);
}

.device-frame__statusbar {
  height: 22px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  font-size: 12px;
  color: var(--ds-text-main, #303133);
  background: var(--ds-bg, #f8f8f8);
}

.device-frame__notch {
  width: 80px;
  height: 6px;
  border-radius: 3px;
  background: var(--ds-border, #e5e5e5);
}

.device-frame__screen {
  flex: 1;
  overflow: auto;
}
</style>
