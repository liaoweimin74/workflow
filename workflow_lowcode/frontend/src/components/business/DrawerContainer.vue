<template>
  <div class="drawer-container">
    <el-button
      class="drawer-container__button"
      :type="buttonType"
      :plain="plain"
      @click="openDrawer"
    >
      {{ buttonText }}
    </el-button>
    <!-- 打开走 openDrawer（emit open）；关闭走 el-drawer 内部 close 机制 → update:modelValue → emit close -->
<!-- v-model 改为 :model-value + 统一 onVisibleChange 处理，避免双监听器合并歧义 -->

    <!-- 设计态：children 是单个 DragBox（拖拽投放区），平铺展示便于编排，不渲染抽屉 -->
    <template v-if="isDesign">
      <div class="drawer-container__design-area">
        <div class="drawer-container__design-label">抽屉内容（设计态预览，运行时收进抽屉）</div>
        <div class="drawer-container__design-body">
          <slot />
        </div>
      </div>
    </template>

    <!-- 运行态：children 渲染进抽屉内容区（el-drawer 首次打开才挂载，关闭后保留不销毁） -->
    <el-drawer
      v-else
      class="drawer-container__drawer"
      :model-value="visible"
      :title="title"
      :size="size"
      :destroy-on-close="false"
      @update:model-value="onVisibleChange"
    >
      <div class="drawer-container__body">
        <slot />
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
/**
 * 抽屉容器 DrawerContainer（Task 3-g）——表单设计器「布局组件」分组，layout 容器。
 *
 * 【form-create children 渲染策略】与 StepsForm 同款：vendor rule 配 drag:true /
 * inside:false / mask:false（elCard 模式），设计态 children = 单个 DragBox（默认插槽），
 * 运行态 children 数组渲染进默认插槽。运行态 children 渲染在 el-drawer 内容区。
 *
 * 【设计态/运行态行为（降级实现，已在报告说明）】
 * - 设计态（画布，检测到单个 DragBox 子节点）：按钮 + 平铺内容预览区（不渲染抽屉），
 *   保证可直接向内容区拖入/编排组件。
 * - 运行态：点击按钮打开 el-drawer，children 渲染在抽屉 body 内。
 * - 渲染边界：el-drawer 内容首次打开才挂载（useDialog rendered 懒渲染）、关闭后保留
 *   （destroy-on-close=false）。因此从未打开过抽屉时，抽屉内字段不参与本次提交的
 *   渲染期校验（字段未挂载）；打开过一次后关闭，字段保持挂载、正常取值/校验。
 */
import { computed, ref, useSlots } from 'vue'

const props = withDefaults(defineProps<{
  /** 按钮文案 */
  buttonText?: string
  /** 按钮类型 */
  buttonType?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  /** 按钮是否朴素样式（默认 true） */
  plain?: boolean
  /** 抽屉标题 */
  title?: string
  /** 抽屉尺寸（宽度，百分比或像素） */
  size?: string | number
}>(), {
  buttonText: '展开详情',
  buttonType: 'primary',
  plain: true,
  title: '详情',
  size: '50%',
})

const emit = defineEmits<{
  /** 抽屉打开 */
  'open': []
  /** 抽屉关闭 */
  'close': []
}>()

const visible = ref(false)

const slots = useSlots()

/**
 * 设计态检测：画布内 children 被 FcDesigner 包成单个 DragBox（name/__name 为 'DragBox'）。
 */
const isDesign = computed(() => {
  const children = slots.default?.() || []
  if (children.length !== 1) return false
  const type: any = children[0]?.type
  return !!type && (type.name === 'DragBox' || type.__name === 'DragBox')
})

function openDrawer() {
  visible.value = true
  emit('open')
}

/**
 * 抽屉内部关闭请求（X 按钮/遮罩/Esc）统一从 update:modelValue 进来：
 * 不依赖 el-drawer 的 @close（过渡结束后才发，jsdom/快速提交场景不可靠），同步确定性。
 */
function onVisibleChange(v: boolean) {
  visible.value = v
  if (!v) emit('close')
}

defineOptions({ name: 'DrawerContainer' })
defineExpose({ openDrawer, closeDrawer: () => { visible.value = false } })
</script>

<style scoped>
.drawer-container {
  width: 100%;
}

.drawer-container__design-area {
  margin-top: 8px;
  border: 1px dashed var(--el-border-color);
  border-radius: 4px;
  padding: 8px;
  background: var(--el-fill-color-lighter);
}

.drawer-container__design-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}

.drawer-container__body {
  padding: 0 4px;
}
</style>
