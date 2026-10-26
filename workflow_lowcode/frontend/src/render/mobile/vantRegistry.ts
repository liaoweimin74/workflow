/**
 * @form-create/vant 移动实例的组件注册单点（渲染器宿主/数据容器内嵌实例共用口径）。
 *
 * 桌面侧注册面=PageRendererPage.formCreate.component（element 实例）+ main.ts（EP 全局），
 * 移动侧在这里；两边独立实例互不影响——同一份 rule，模板层分端（designs §5）。
 * page-data-container 的注册归宿主 MobilePageRenderer（容器 import 本模块不成环）。
 */
import formCreateMobile from '@form-create/vant'

import MobileCardList from './blocks/MobileCardList.vue'
import MobileDetail from './blocks/MobileDetail.vue'
import MobileDataForm from './blocks/MobileDataForm.vue'
import MobileBlockPlaceholder from './blocks/MobileBlockPlaceholder.vue'
import MobileFieldPlaceholder from './blocks/MobileFieldPlaceholder.vue'

// 模块级注册（幂等，PageRendererPage 同规）：块语义 → 移动实现
formCreateMobile.component('page-table', MobileCardList)
formCreateMobile.component('page-list-cards', MobileCardList)
formCreateMobile.component('page-form', MobileDataForm)
formCreateMobile.component('page-detail', MobileDetail)
formCreateMobile.component('mobile-block-placeholder', MobileBlockPlaceholder)
formCreateMobile.component('mobile-field-placeholder', MobileFieldPlaceholder)

/** 渲染器已实现的模板键（transformRuleForMobile 的 implemented 入参，随批次扩充） */
export const MOBILE_IMPLEMENTED_TEMPLATES: readonly string[] = ['card-list', 'form', 'detail', 'container']

/** 独立 FormCreate 组件工厂（宿主主树与容器内嵌各一个实例，避免 v-model 串扰） */
export function createMobileForm() {
  return formCreateMobile.$form()
}
