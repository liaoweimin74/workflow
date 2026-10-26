// 【必须首行】storage 沙箱兜底（Task 25 契约，Task 128 补接线）：预览面板 iframe
// 禁用 web storage 时，访问 localStorage getter 本身即抛错。本模块 side-effect
// 自安装内存兜底，必须在所有其他 import 之前执行——路由守卫/HTTP 拦截器是
// 最早读 localStorage 的运行时路径，晚了就来不及。
import '@/utils/safe-storage'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus, { ElCard } from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import formCreate from '@form-create/element-ui'
import FcDesigner from '@form-create/designer'
import Vant from 'vant'
import 'vant/lib/index.css'
// FcDesigner vendor 源码样式（alias @form-create/designer → src/vendor）
import '@/vendor/style/index.css'
import LookupPicker from '@/components/business/LookupPicker.vue'
import DataPicker from '@/views/form/components/DataPicker.vue'
import SystemUserPicker from '@/components/business/SystemUserPicker.vue'
import SystemDeptPicker from '@/components/business/SystemDeptPicker.vue'
import SystemAttachment from '@/components/business/SystemAttachment.vue'
import SystemImage from '@/components/business/SystemImage.vue'
import FormulaField from '@/components/business/FormulaField.vue'
import FormulaExpressionEditor from '@/components/business/FormulaExpressionEditor.vue'
// 业务扩展组件（Task 3-a/3-c/3-g）：地址/字典下拉/自动编号/关联卡片/定位/分步表单/抽屉容器
import AreaPicker from '@/components/business/AreaPicker.vue'
import DictSelect from '@/components/business/DictSelect.vue'
import AutoNumber from '@/components/business/AutoNumber.vue'
import RelationCard from '@/components/business/RelationCard.vue'
import LocationPicker from '@/components/business/LocationPicker.vue'
import StepsForm from '@/components/business/StepsForm.vue'
import DrawerContainer from '@/components/business/DrawerContainer.vue'
// 属性面板通用 JSON 数组编辑器（form-create 控件，无 vendor rule 组件的 items 配置用）
import JsonItemsEditor from '@/components/business/JsonItemsEditor.vue'
// 属性面板动态下拉（RelationCard 专用）：源表单=已发布业务表单列表，
// 字段下拉=源表单 columnConfig/schema 字段列表（仅面板用，同 FormulaExpressionEditor）
import RelationFieldSelect from '@/components/business/RelationFieldSelect.vue'
import PageDataTable from '@/views/page/components/PageDataTable.vue'
import DashKpi from '@/views/dashboard/components/DashKpi.vue'
import DashChart from '@/views/dashboard/components/DashChart.vue'
import DashFilter from '@/views/dashboard/components/DashFilter.vue'
import DashGoal from '@/views/dashboard/components/DashGoal.vue'
import DashLeaderboard from '@/views/dashboard/components/DashLeaderboard.vue'
import DashAlert from '@/views/dashboard/components/DashAlert.vue'
// 待办清单：不走数据源，数据为当前登录用户的任务
import DashTodo from '@/views/dashboard/components/DashTodo.vue'
import DashNotice from '@/views/dashboard/components/DashNotice.vue'
// 环比指标卡（Task 3-h）：DashKpi 同族，双实例注册
import DashKpiTrend from '@/views/dashboard/components/DashKpiTrend.vue'
import App from './App.vue'
import router from './router'
import { patchMessageBoxDraggable } from './utils/elementPlusDraggable'
import { permission } from './directives/permission'
import './style.css'
// 仪表盘高度档「撑满」：把栅格列高度传到卡片根（:has 反选祖先，必须全局生效）
import '@/views/dashboard/components/dash-fill-height.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
// 注册按钮权限指令（v-permission）—— 此前从未注册导致权限码形同虚设，本次一并修复
app.directive('permission', permission)
// 全局配置：所有 el-dialog 默认标题栏可拖动（EP 2.14 ConfigProvider dialog 全局项；
// fullscreen 自动排除，个别对话框可用 :draggable="false" 关闭，overflow 默认视口钳制）
app.use(ElementPlus, { locale: zhCn, dialog: { draggable: true } })
// Vant 装进主应用：@form-create/vant 内置组件按 app 注册表解析 van-*（移动渲染器依赖）
app.use(Vant)
// ElMessageBox（confirm/alert/prompt）无全局 draggable 配置入口，工厂方法包装默认注入
patchMessageBoxDraggable()
// 注册 LookupPicker/DataPicker 为 form-create 全局组件（表单渲染 + 设计器拖拽预览双实例），
// 使设计器和渲染器都能使用。必须用 FcDesigner.component：内部同时注册
// designerForm（设计器画布 DragForm）与 formCreate（ViewForm/运行时渲染），
// 只用 formCreate.component 会导致设计器画布（designerForm 实例）找不到组件而只渲染 label。
FcDesigner.component('LookupPicker', LookupPicker)
FcDesigner.component('dataPicker', DataPicker)
// 系统组件（Task 143）：用户/部门选择器，设计器画布 + 运行时渲染双实例可见
FcDesigner.component('SystemUserPicker', SystemUserPicker)
FcDesigner.component('SystemDeptPicker', SystemDeptPicker)
// 系统组件（Task 146）：附件（多文件上传/大小限制/预览/下载），设计器画布 + 运行时渲染双实例可见
FcDesigner.component('SystemAttachment', SystemAttachment)
// 系统组件（Task 147）：图片（尺寸/大小/数量限制、多选、缩略图、预览/下载），设计器画布 + 运行时渲染双实例可见
FcDesigner.component('SystemImage', SystemImage)
// 基础组件（Task 144）：计算公式（跨字段表达式求值），设计器画布 + 运行时渲染双实例可见
FcDesigner.component('FormulaField', FormulaField)
// Task 145：表达式可视化编辑器（属性面板自定义 prop 组件，仅面板用；全局注册使面板 form-create 实例可解析）
FcDesigner.component('FormulaExpressionEditor', FormulaExpressionEditor)
// 业务扩展组件（Task 3-a/3-c/3-g）：注册名与 vendor rule 物料的 name/type 严格一致
FcDesigner.component('areaPicker', AreaPicker)
FcDesigner.component('dictSelect', DictSelect)
FcDesigner.component('AutoNumber', AutoNumber)
FcDesigner.component('RelationCard', RelationCard)
FcDesigner.component('LocationPicker', LocationPicker)
FcDesigner.component('StepsForm', StepsForm)
FcDesigner.component('DrawerContainer', DrawerContainer)
// 卡片容器 elCard：form-create element 版未内置 el-card 映射（历史物料未注册、运行态直通
// 渲染导致 StepsForm 等父容器 children 被拍平）——显式注册 element-plus ElCard 修复；
// designer 与运行时是双实例（见上方注释），两处都要注册
FcDesigner.component('elCard', ElCard)
formCreate.component('elCard', ElCard)
// 属性面板 JSON 数组编辑器（form-create 控件，无 vendor rule 组件的 items 配置用）
FcDesigner.component('JsonItemsEditor', JsonItemsEditor)
// 属性面板动态下拉（RelationCard 源表单/字段选择，仅面板用；全局注册使面板 form-create 实例可解析）
FcDesigner.component('RelationFieldSelect', RelationFieldSelect)
// 数据表格：全局注册，使表单设计器（画布 + 运行时渲染）与页面设计器/渲染页都能使用
FcDesigner.component('page-table', PageDataTable)
// 仪表盘组件（Task 119）：设计器画布 + 运行时渲染双实例可见
FcDesigner.component('dash-kpi', DashKpi)
FcDesigner.component('dash-chart', DashChart)
FcDesigner.component('dash-filter', DashFilter)
FcDesigner.component('dash-goal', DashGoal)
FcDesigner.component('dash-leaderboard', DashLeaderboard)
FcDesigner.component('dash-alert', DashAlert)
FcDesigner.component('dash-todo', DashTodo)
// 公告栏（无数据源，取用户端消息接口的公告）
FcDesigner.component('dash-notice', DashNotice)
// 环比指标卡（Task 3-h）：DashKpi 同族
FcDesigner.component('dash-kpi-trend', DashKpiTrend)
app.use(formCreate)
app.use(FcDesigner)
app.mount('#app')