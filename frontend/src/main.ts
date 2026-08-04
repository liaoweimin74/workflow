import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import {
  createProvider,
  LocalService,
  createModules,
  type NodeEnv
} from '@vtj/web'
import '@vtj/web/src/index.scss'
import App from './App.vue'
import router from './router'
import { permission } from './directives/permission'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(ElementPlus, { locale: zhCn })
app.directive('permission', permission)

// 实例化低代码服务（LocalService 仅适用于开发环境）
const service = new LocalService()

// 创建 VTJ 提供者实例
const { provider, onReady } = createProvider({
  nodeEnv: process.env.NODE_ENV as NodeEnv,
  modules: createModules(),
  service,
  router
})

// 初始化完成后挂载应用
onReady(async () => {
  app.use(router)
  app.use(provider)
  app.mount('#app')
})
