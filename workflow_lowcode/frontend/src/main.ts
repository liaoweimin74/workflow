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
import PageDataTable from '@/views/page/components/PageDataTable.vue'
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
// 数据表格：全局注册，使表单设计器（画布 + 运行时渲染）与页面设计器/渲染页都能使用
FcDesigner.component('page-table', PageDataTable)
app.use(formCreate)
app.use(FcDesigner)
app.mount('#app')