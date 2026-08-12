import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import formCreate from '@form-create/element-ui'
import FcDesigner from '@form-create/designer'
import '@form-create/designer/src/style/index.css'
import LookupPicker from '@/components/business/LookupPicker.vue'
import DataPicker from '@/views/form/components/DataPicker.vue'
import App from './App.vue'
import router from './router'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })
// 注册 LookupPicker 为 form-create 全局组件，使设计器和渲染器都能使用
formCreate.component('LookupPicker', LookupPicker)
// 注册 DataPicker（数据引用）为 form-create 全局组件
formCreate.component('dataPicker', DataPicker)
app.use(formCreate)
app.use(FcDesigner)
app.mount('#app')