// 【必须首行】storage 沙箱兜底（Task 25 契约，Task 128 补接线）：预览面板 iframe
// 禁用 web storage 时，访问 localStorage getter 本身即抛错。本模块 side-effect
// 自安装内存兜底，必须在所有其他 import 之前执行——路由守卫/HTTP 拦截器是
// 最早读 localStorage 的运行时路径，晚了就来不及。
import '@/utils/safe-storage'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import formCreate from '@form-create/element-ui'
import FcDesigner from '@form-create/designer'
// FcDesigner vendor 源码样式（alias @form-create/designer → src/vendor）
import '@/vendor/style/index.css'
import LookupPicker from '@/components/business/LookupPicker.vue'
import DataPicker from '@/views/form/components/DataPicker.vue'
import SystemUserPicker from '@/components/business/SystemUserPicker.vue'
import SystemDeptPicker from '@/components/business/SystemDeptPicker.vue'
import FormulaField from '@/components/business/FormulaField.vue'
import FormulaExpressionEditor from '@/components/business/FormulaExpressionEditor.vue'
import PageDataTable from '@/views/page/components/PageDataTable.vue'
import DashKpi from '@/views/dashboard/components/DashKpi.vue'
import DashChart from '@/views/dashboard/components/DashChart.vue'
import DashFilter from '@/views/dashboard/components/DashFilter.vue'
import DashGoal from '@/views/dashboard/components/DashGoal.vue'
import DashLeaderboard from '@/views/dashboard/components/DashLeaderboard.vue'
import DashAlert from '@/views/dashboard/components/DashAlert.vue'
import App from './App.vue'
import router from './router'
import { patchMessageBoxDraggable } from './utils/elementPlusDraggable'
import { permission } from './directives/permission'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
// 注册按钮权限指令（v-permission）—— 此前从未注册导致权限码形同虚设，本次一并修复
app.directive('permission', permission)
// 全局配置：所有 el-dialog 默认标题栏可拖动（EP 2.14 ConfigProvider dialog 全局项；
// fullscreen 自动排除，个别对话框可用 :draggable="false" 关闭，overflow 默认视口钳制）
app.use(ElementPlus, { locale: zhCn, dialog: { draggable: true } })
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
// 基础组件（Task 144）：计算公式（跨字段表达式求值），设计器画布 + 运行时渲染双实例可见
FcDesigner.component('FormulaField', FormulaField)
// Task 145：表达式可视化编辑器（属性面板自定义 prop 组件，仅面板用；全局注册使面板 form-create 实例可解析）
FcDesigner.component('FormulaExpressionEditor', FormulaExpressionEditor)
// 数据表格：全局注册，使表单设计器（画布 + 运行时渲染）与页面设计器/渲染页都能使用
FcDesigner.component('page-table', PageDataTable)
// 仪表盘组件（Task 119）：设计器画布 + 运行时渲染双实例可见
FcDesigner.component('dash-kpi', DashKpi)
FcDesigner.component('dash-chart', DashChart)
FcDesigner.component('dash-filter', DashFilter)
FcDesigner.component('dash-goal', DashGoal)
FcDesigner.component('dash-leaderboard', DashLeaderboard)
FcDesigner.component('dash-alert', DashAlert)
app.use(formCreate)
app.use(FcDesigner)
app.mount('#app')