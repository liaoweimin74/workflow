<template>
  <el-popover
    ref="popRef"
    trigger="click"
    :width="240"
    placement="bottom-end"
    :teleported="true"
    popper-class="rv-popper"
  >
    <template #reference>
      <button class="rv-trigger" type="button" title="插入变量" aria-label="插入变量">{ }</button>
    </template>

    <div class="rv-list">
      <button
        v-for="item in items"
        :key="item.name"
        class="rv-item"
        type="button"
        :data-testid="`rv-var-${item.name}`"
        @click="pick(item)"
      >
        <span class="rv-name">{{ item.token }}</span>
        <span class="rv-detail">{{ item.detail }}</span>
      </button>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { VARIABLE_OPTIONS } from './conditionModel'

defineOptions({ name: 'VarInsertPopover' })

const emit = defineEmits<{ pick: [token: string] }>()

const popRef = ref<{ hide?: () => void } | null>(null)

const items = computed(() =>
  VARIABLE_OPTIONS.map((item) => ({ ...item, token: `{${item.name}}` }))
)

function pick(item: { token: string }) {
  emit('pick', item.token)
  popRef.value?.hide?.()
}
</script>

<style scoped>
.rv-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  height: 20px;
  min-width: 24px;
  padding: 0 4px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  background: var(--el-fill-color-blank);
  color: var(--el-color-primary);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.rv-trigger:hover {
  border-color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
}
</style>

<!-- 弹层挂 body（teleported），需全局样式 -->
<style>
.rv-popper {
  padding: 6px !important;
}

.rv-popper .rv-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 220px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.rv-popper .rv-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  width: 100%;
  padding: 5px 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}

.rv-popper .rv-item:hover {
  background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
}

.rv-popper .rv-name {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.rv-popper .rv-detail {
  font-size: 11px;
  line-height: 1.4;
  color: var(--el-text-color-secondary);
}
</style>
