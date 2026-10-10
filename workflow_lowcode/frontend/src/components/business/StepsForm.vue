<template>
  <div class="steps-form" :class="{ 'is-design': isDesign }">
    <!-- 步骤条：点击步骤头导航（设计态禁用点击）；steps 未配置时从 children 数量推导「第 N 步」 -->
    <el-steps
      class="steps-form__steps"
      :active="activeIndex"
      :direction="direction"
      align-center
      @click.capture="onStepsClick"
    >
      <el-step
        v-for="(s, i) in stepItems"
        :key="i"
        :title="s.title"
        :description="s.description"
      />
    </el-steps>
    <!-- 分步内容区：每个直接子组件 = 一步的 pane；v-show 显隐、全部常挂载（保证全量取值/校验） -->
    <StepsPaneArea class="steps-form__pane-area" :active="activeIndex">
      <slot />
    </StepsPaneArea>
    <div v-if="isDesign" class="steps-form__design-tip">
      分步容器：每个直接子组件为一步（推荐拖入「卡片」分组每步字段）；运行时按当前步骤显隐，字段始终挂载不影响提交校验
    </div>
  </div>
</template>

<script lang="ts">
/**
 * 分步内容区渲染器（render 函数，Task 3-g）。
 *
 * 为什么不用 template 包装：<slot /> 产出的是 VNode 数组，Vue 3 模板的 <component :is>
 * 不接受 VNode 对象，必须用 h() 显式包装。此处把默认插槽的每个直接子 VNode 包一层
 * pane div，用 display:none（v-show 语义）显隐——所有子节点始终挂载，form-create 的
 * 取值/校验/提交不受分步切换影响。
 */
import { defineComponent, h, type VNode, Fragment } from 'vue'

/**
 * 展开插槽 vnode：<slot /> 转发会在 children 外包一层 Fragment，
 * 设计态 form-create 又可能直接传数组——统一展平 Fragment 拿到真实子节点。
 * 普通脚本与 <script setup> 共享同一模块作用域，StepsForm 主体复用本函数做设计态检测。
 */
function flattenSlotChildren(nodes: VNode[] | undefined | null): VNode[] {
    const list = Array.isArray(nodes) ? nodes : []
    return list.flatMap((n) => {
        if (n && n.type === Fragment && Array.isArray(n.children)) {
            return flattenSlotChildren(n.children as VNode[])
        }
        return n ? [n] : []
    })
}

const StepsPaneArea = defineComponent({
    name: 'StepsPaneArea',
    props: {
        active: { type: Number, default: 0 },
    },
    setup(props, { slots }) {
        return () => {
            const children = flattenSlotChildren(slots.default?.())
            return h(
                'div',
                { class: 'steps-form__panes' },
                children.map((child, i) => h(
                    'div',
                    {
                        key: i,
                        class: 'steps-form__pane',
                        style: i === props.active ? undefined : { display: 'none' },
                    },
                    [child],
                )),
            )
        }
    },
})

export default { components: { StepsPaneArea } }
</script>

<script setup lang="ts">
/**
 * 分步表单容器 StepsForm（Task 3-g）——表单设计器「布局组件」分组，layout 容器。
 *
 * 【form-create children 渲染策略（研究结论落地）】
 * - 布局容器走 elCard 同款模式：vendor rule 配 drag:true / inside:false / mask:false，
 *   设计态 FcDesigner.makeRule 会把 rule.children 包进一个 DragBox（拖拽投放区）并作为
 *   本组件默认插槽内容 → 本组件渲染 <slot /> 即可承接 children。
 * - 运行态 form-create 把 rule.children 数组渲染为默认插槽内容 → StepsPaneArea 按索引
 *   把每个直接子组件包成 pane，按 active 显隐。
 *
 * 【分步语义与渲染边界（降级实现，已在报告说明）】
 * - 「每个直接子组件 = 一步」：多字段步骤请拖入卡片/栅格作为每步的分组容器（与标签页
 *   elTabs+elTabPane 的组织方式一致）；裸字段直拖 = 每个字段一步。
 * - 设计态（画布）：children 是单个 DragBox，检测为设计态后全显（不做 pane 切换、
 *   禁用步骤点击），保证拖拽编排可用。
 * - 运行态：pane 按 active 显隐（v-show 非 v-if），所有 children 始终挂载——
 *   分步只是显隐切换，提交时 form-create 全量校验不受影响。
 */
import { computed, useSlots } from 'vue'

const props = withDefaults(defineProps<{
  /** 步骤定义（可选）：数组按索引对应 pane，缺省项回退「第 N 步」；不传时按 children 数量推导 */
  steps?: Array<{ title?: string; description?: string }>
  /** 当前步骤索引（v-model:active） */
  active?: number
  /** 步骤条方向 */
  direction?: 'horizontal' | 'vertical'
}>(), {
  steps: () => [],
  active: 0,
  direction: 'horizontal',
})

const emit = defineEmits<{
  /** 当前步骤变化（v-model:active） */
  'update:active': [index: number]
  /** 步骤切换事件（携康新索引） */
  'change': [index: number]
}>()

const slots = useSlots()

/** 默认插槽子节点数量（运行态=真实 children 数；设计态=1 个 DragBox） */
const childCount = computed(() => flattenSlotChildren(slots.default?.()).length)

/**
 * 设计态检测：画布内 children 被 FcDesigner 包成单个 DragBox（name 为 'DragBox'，
 * SFC 兼容 __name 推断名）。设计态全显 + 禁用步骤点击。
 */
const isDesign = computed(() => {
  const children = flattenSlotChildren(slots.default?.())
  if (children.length !== 1) return false
  const type: any = children[0]?.type
  return !!type && (type.name === 'DragBox' || type.__name === 'DragBox')
})

/** 步骤数 = max(steps 配置数, children 数)（子组件多于配置时补齐，保证 pane 可达） */
const stepCount = computed(() => Math.max(props.steps.length, childCount.value, 1))

/** 步骤项：steps 配置优先，缺省项与超额部分回退「第 N 步」 */
const stepItems = computed(() => {
  const items: Array<{ title: string; description: string }> = []
  for (let i = 0; i < stepCount.value; i++) {
    const s = props.steps[i]
    items.push({
      title: (s && s.title) || `第 ${i + 1} 步`,
      description: (s && s.description) || '',
    })
  }
  return items
})

/** 当前步骤索引（钳制到 [0, stepCount-1]） */
const activeIndex = computed(() => {
  const max = stepCount.value - 1
  return Math.min(Math.max(Math.floor(props.active) || 0, 0), Math.max(max, 0))
})

/** 步骤条点击导航（capture 捕获 el-step 内部点击；设计态禁用） */
function onStepsClick(e: MouseEvent) {
  if (isDesign.value) return
  const target = e.target as HTMLElement | null
  const stepEl = target?.closest?.('.el-step') as HTMLElement | null
  if (!stepEl || !stepEl.parentElement) return
  const index = Array.prototype.indexOf.call(stepEl.parentElement.children, stepEl)
  setActive(index)
}

/** 切换步骤：越界忽略，变化才 emit（update:active + change） */
function setActive(index: number) {
  if (index < 0 || index > stepCount.value - 1 || index === activeIndex.value) return
  emit('update:active', index)
  emit('change', index)
}

defineOptions({ name: 'StepsForm' })
defineExpose({ setActive, next: () => setActive(activeIndex.value + 1), prev: () => setActive(activeIndex.value - 1) })
</script>

<style scoped>
.steps-form {
  width: 100%;
}

.steps-form__steps {
  margin-bottom: 16px;
}

.steps-form:not(.is-design) .steps-form__steps :deep(.el-step) {
  cursor: pointer;
}

.steps-form__design-tip {
  margin-top: 8px;
  padding: 6px 10px;
  border: 1px dashed var(--el-border-color);
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-lighter);
}
</style>
