<script setup lang="ts">
/**
 * 移动端页面渲染器：@form-create/vant 独立实例渲染与桌面同一份 rule（designs §5
 * 「逻辑 schema 唯一 + 按渠道模板映射」的兑现点；设计预览与 H5 运行时共用此单实现，
 * §5.2 用户复核裁定）。
 *
 * 处理链（对齐桌面宿主 PageRendererPage 的协议）：
 *   prepareMobileRule（dsRefId 注入 + 容器归一）→ rewriteFieldTypesForMobile（EP-only 字段占位）
 *   → transformRuleForMobile（未实现/无等价块占位）。块/字段实现注册见 vantRegistry。
 */
import { computed } from 'vue'

import { createMobileForm, MOBILE_IMPLEMENTED_TEMPLATES } from './vantRegistry'
import MobileDataContainer from './blocks/MobileDataContainer.vue'
import { applyChannelProfiles, type ChannelProfiles } from './channelProfiles'
import { prepareMobileRule, type MobileDataSourceBinding, type MobileRuleNode } from './mobileRulePrepare'
import { rewriteFieldTypesForMobile } from './fieldTemplates'
import { transformRuleForMobile } from './mobileRuleTransform'
import type { RuleNode } from './mobileRuleTransform'

// 容器注册归宿主（vantRegistry 不 import 容器以免循环；内嵌实例共享此组件表）
import formCreateMobile from '@form-create/vant'
formCreateMobile.component('page-data-container', MobileDataContainer)

defineOptions({ name: 'MobilePageRenderer' })

const props = withDefaults(
  defineProps<{
    /** 页面 schema 的 form-create rule 树（与桌面渲染同一份） */
    rule?: unknown[]
    /** 页面内数据源绑定（id→refId；dsRefId 注入依据） */
    dataSources?: MobileDataSourceBinding[]
    /** 生效渠道类型（覆盖层读取键：H5/APP/MP） */
    channel?: string
    /** schema 顶层端覆盖层（按渠道存；缺省块走自动映射） */
    channelProfiles?: ChannelProfiles
    /** form-create option（缺省交给实例默认值） */
    option?: Record<string, unknown>
  }>(),
  {
    rule: () => [],
    dataSources: () => [],
    channel: 'H5',
    channelProfiles: undefined,
    option: undefined,
  },
)

const FormCreateMobile = createMobileForm()

const effectiveRule = computed<RuleNode[]>(() => {
  const prepared = prepareMobileRule(props.rule as MobileRuleNode[], props.dataSources)
  const profiled = applyChannelProfiles(prepared, props.channelProfiles, props.channel)
  const withFieldPlaceholders = rewriteFieldTypesForMobile(profiled as RuleNode[])
  return transformRuleForMobile(withFieldPlaceholders, MOBILE_IMPLEMENTED_TEMPLATES)
})
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
