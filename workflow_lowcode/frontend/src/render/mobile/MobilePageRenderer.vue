<script setup lang="ts">
/**
 * 移动端页面渲染器骨架：@form-create/vant 独立实例渲染与桌面同一份 rule（designs §5
 * 「逻辑 schema 唯一 + 按渠道模板映射」的兑现点；设计预览与 H5 运行时共用此单实现，
 * §5.2 用户复核裁定）。
 *
 * 注册面：块语义 → 移动组件按渠道各注册各的——桌面实例（@form-create/element-ui）与本
 * vant 实例互不影响；实现分批补齐，未落地/无等价的块由 transformRuleForMobile 换成占位。
 */
import { computed } from 'vue'
import formCreateMobile from '@form-create/vant'

import MobileCardList from './blocks/MobileCardList.vue'
import MobileBlockPlaceholder from './blocks/MobileBlockPlaceholder.vue'
import { transformRuleForMobile } from './mobileRuleTransform'

defineOptions({ name: 'MobilePageRenderer' })

const props = withDefaults(
  defineProps<{
    /** 页面 schema 的 form-create rule 树（与桌面渲染同一份） */
    rule?: unknown[]
    /** form-create option（缺省交给实例默认值） */
    option?: Record<string, unknown>
  }>(),
  {
    rule: () => [],
    option: undefined,
  },
)

/** 模板键→实现 注册表：本批落地 card-list，后续批次在这里补 form/detail/chart/... */
const IMPLEMENTED_TEMPLATES: readonly string[] = ['card-list']

// 模块级注册（幂等，PageRendererPage 同规）
formCreateMobile.component('page-table', MobileCardList)
formCreateMobile.component('page-list-cards', MobileCardList)
formCreateMobile.component('mobile-block-placeholder', MobileBlockPlaceholder)

const FormCreateMobile = formCreateMobile.$form()

const effectiveRule = computed(() => transformRuleForMobile(props.rule as Parameters<typeof transformRuleForMobile>[0], IMPLEMENTED_TEMPLATES))
</script>

<template>
  <div class="mobile-page-renderer">
    <component :is="FormCreateMobile" v-if="effectiveRule.length" :rule="effectiveRule" :option="option" />
    <div v-else class="mobile-page-renderer__empty">页面内容为空</div>
  </div>
</template>

<style scoped>
.mobile-page-renderer {
  min-height: 200px;
  background: #f7f8fa;
}
.mobile-page-renderer__empty {
  padding: 80px 0;
  text-align: center;
  color: #969799;
  font-size: 14px;
}
</style>
