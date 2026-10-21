import { createRouter, createWebHistory } from 'vue-router'
import type { RouteComponent, RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

/**
 * 【真机探测脚手架，非产品路由】出码 spike 用来把产物直接挂到浏览器上量真机表现的
 * （详见 codegen/__tests__/runtime-probe.test.ts）。只登记到 dev：生产构建里连那条
 * 懒 import 一起不进包。探测产物是生成物不进 git（.gitignore codegen/probe/），
 * 要用时跑 PROBE_PAGE=<页名> npx vitest run runtime-probe.test.ts 落盘，glob 有文件才挂路由。
 */
const probePages = import.meta.glob<RouteComponent>('@/views/page/codegen/probe/*.vue')
const probeEntry = Object.keys(probePages).sort()[0]
const codegenProbeRoutes: RouteRecordRaw[] =
  import.meta.env.DEV && probeEntry
    ? [
        {
          path: 'codegen-probe',
          name: 'CodegenProbe',
          component: probePages[probeEntry]!,
          meta: { title: '出码产物探测' },
        },
      ]
    : []

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/LoginPage.vue'),
    meta: { title: '登录', public: true }
  },
  {
    // 帮助文档：独立全屏页（工具栏帮助图标新标签打开），固定入口不进 sys_menu
    // meta.public：白名单路由，未登录直接可见（页面只读 public 下的静态 Markdown，不打业务接口）
    path: '/help',
    name: 'HelpCenter',
    component: () => import('@/views/help/HelpCenterPage.vue'),
    meta: { title: '帮助文档', fullScreen: true, public: true }
  },
  {
    path: '/designer',
    name: 'ProcessDesigner',
    component: () => import('@/views/designer/ProcessDesigner.vue'),
    meta: { title: '流程设计器', fullScreen: true }
  },
  {
    path: '/form/designer',
    name: 'FormDesigner',
    component: () => import('@/views/form/FormDesigner.vue'),
    meta: { title: '表单设计器', fullScreen: true }
  },
  {
    path: '/page/designer',
    name: 'PageDesigner',
    component: () => import('@/views/page/PageDesigner.vue'),
    meta: { title: '页面设计器', fullScreen: true }
  },
  {
    // 逻辑流设计器：全屏顶层路由（与 /designer 平级），从列表页 /logic-flow 进入
    path: '/logic-flow/design/:id',
    name: 'LogicFlowDesigner',
    component: () => import('@/views/logicflow/LogicFlowDesigner.vue'),
    meta: { title: '逻辑流设计器', fullScreen: true }
  },
  {
    path: '/',
    component: () => import('@/layouts/AdminLayout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/DashboardRouterPage.vue'),
        meta: { title: '首页' }
      },
      {
        path: 'system/user',
        name: 'UserManagement',
        component: () => import('@/views/system/user/UserPage.vue'),
        meta: { title: '用户管理' }
      },
      {
        path: 'system/role',
        name: 'RoleManagement',
        component: () => import('@/views/system/role/RolePage.vue'),
        meta: { title: '角色管理' }
      },
      {
        path: 'system/menu',
        name: 'MenuManagement',
        component: () => import('@/views/system/menu/MenuPage.vue'),
        meta: { title: '菜单管理' }
      },
      {
        path: 'system/org',
        name: 'OrgManagement',
        component: () => import('@/views/system/org/OrgPage.vue'),
        meta: { title: '组织机构管理' }
      },
      {
        path: 'system/post',
        name: 'PostManagement',
        component: () => import('@/views/system/post/PostPage.vue'),
        meta: { title: '岗位管理' }
      },
      {
        // Task 142：成员组管理去业务表单化——专用数据表 + 字典式专用页（无自动规则）
        path: 'system/member-group',
        name: 'MemberGroupManagement',
        component: () => import('@/views/system/member-group/MemberGroupPage.vue'),
        meta: { title: '成员组管理' }
      },
      {
        path: 'system/dict',
        name: 'DictManagement',
        component: () => import('@/views/system/dict/DictPage.vue'),
        meta: { title: '数据字典管理' }
      },
      {
        // 大模型动态配置（系统管理 → 模型配置）：OpenAI 兼容端点/API Key/模型，
        // 保存即生效；外部部署无需改环境变量
        path: 'system/ai-config',
        name: 'AiConfigManagement',
        component: () => import('@/views/system/ai-config/AiConfigPage.vue'),
        meta: { title: '模型配置' }
      },
      {
        // 数据权限（系统管理 → 数据权限）：权限对象（条件 + 关联数据源）
        // 与覆盖度盘点（缺口/豁免留痕）同页双 Tab；授权入口在角色管理 → 数据权限
        path: 'system/row-permission',
        name: 'RowPermissionManagement',
        component: () => import('@/views/system/row-permission/RowPermissionPage.vue'),
        meta: { title: '数据权限' }
      },
      {
        // AI 测试工具（录制 / 回放 / 用例管理）：面向测试人员，不进菜单（直达 URL
        // /aitest/cases）；录制为全局状态，可跨页面开始与保存
        path: 'aitest/cases',
        name: 'AiTestCases',
        component: () => import('@/views/aitest/AiTestCasesPage.vue'),
        meta: { title: 'AI 测试工具' }
      },
      {
        path: 'profile',
        name: 'Profile',
        component: () => import('@/views/profile/ProfilePage.vue'),
        meta: { title: '个人中心' }
      },
      {
        path: 'process/definition',
        name: 'ProcessDefinition',
        component: () => import('@/views/process/ProcessListPage.vue'),
        meta: { title: '流程定义' }
      },
      {
        path: 'process/center',
        name: 'ProcessCenter',
        component: () => import('@/views/process/ProcessCenterPage.vue'),
        meta: { title: '流程中心' }
      },
      {
        path: 'process/todo',
        name: 'ProcessTodo',
        component: () => import('@/views/process/ProcessTodoPage.vue'),
        meta: { title: '待办处理' }
      },
      {
        path: 'process/drafts',
        name: 'ProcessDraftBox',
        component: () => import('@/views/process/ProcessDraftBoxPage.vue'),
        meta: { title: '草稿箱' }
      },
      {
        path: 'process/todo/done/:taskId',
        name: 'TaskDoneDetail',
        component: () => import('@/views/process/TaskDoneDetailPage.vue'),
        meta: { title: '已办详情' }
      },
      {
        path: 'process/todo/:taskId',
        name: 'TaskDetail',
        component: () => import('@/views/process/TaskDetailPage.vue'),
        meta: { title: '任务处理' }
      },
      {
        path: 'process/instance/:instanceId',
        name: 'ProcessInstanceTrack',
        component: () => import('@/views/process/ProcessInstanceTrackPage.vue'),
        meta: { title: '流程跟踪' }
      },
      {
        path: 'process/start/:processDefinitionId',
        name: 'ProcessStart',
        component: () => import('@/views/process/ProcessStartPage.vue'),
        meta: { title: '发起流程' }
      },
      {
        path: 'form',
        name: 'FormList',
        component: () => import('@/views/form/FormListPage.vue'),
        meta: { title: '表单管理' }
      },
      {
        path: 'biz-data/:formKey',
        name: 'BizDataList',
        component: () => import('@/views/form/BizDataListPage.vue'),
        meta: { title: '业务数据管理' }
      },
      {
        path: 'page',
        name: 'PageList',
        component: () => import('@/views/page/PageListPage.vue'),
        meta: { title: '页面管理' }
      },
      {
        path: 'page/:pageKey',
        name: 'PageRenderer',
        component: () => import('@/views/page/PageRenderer.vue'),
        meta: { title: '页面' }
      },
      ...codegenProbeRoutes,
      {
        // 远程物料管理页（remote-materials 6.3）：V57 预置菜单「物料管理」指向此路由
        path: 'material',
        name: 'MaterialList',
        component: () => import('@/views/material/MaterialListPage.vue'),
        meta: { title: '物料管理' }
      },
      {
        // 远程物料页面（change: remote-materials）：菜单 component=material:<key>，
        // 运行时 import() 加载物料 bundle 渲染（与 PageRenderer 同挂载方式）
        path: 'material/:materialKey',
        name: 'MaterialRenderer',
        component: () => import('@/views/material/MaterialRenderer.vue'),
        meta: { title: '物料页面' }
      },
      {
        path: 'data-source/list',
        name: 'DataSourceList',
        component: () => import('@/views/dataSource/DataSourceListPage.vue'),
        meta: { title: '数据源管理' }
      },
      {
        path: 'data-source/:id/data',
        name: 'DataSourceData',
        component: () => import('@/views/dataSource/DataSourceDataPage.vue'),
        meta: { title: '数据源数据管理' }
      },
      {
        // 逻辑编排：列表页（设计器走顶层全屏路由 /logic-flow/design/:id）
        path: 'logic-flow',
        name: 'LogicFlowList',
        component: () => import('@/views/logicflow/LogicFlowListPage.vue'),
        meta: { title: '逻辑编排' }
      },
      {
        // 模块管理：导出/导入模块包
        path: 'module',
        name: 'ModuleManagement',
        component: () => import('@/views/module/ModuleListPage.vue'),
        meta: { title: '模块管理' }
      },
      {
        path: '404',
        name: 'NotFound',
        component: () => import('@/views/error/NotFoundPage.vue'),
        meta: { title: '404' }
      },
      {
        path: 'messages',
        name: 'MessageCenter',
        component: () => import('@/modules/notification/views/MessageCenter.vue'),
        meta: { title: '消息中心' }
      },
      {
        path: 'messages/templates',
        name: 'MessageTemplateList',
        component: () => import('@/modules/notification/views/admin/TemplateList.vue'),
        meta: { title: '模板管理' }
      },
      {
        path: 'messages/channels',
        name: 'MessageChannelConfig',
        component: () => import('@/modules/notification/views/admin/ChannelConfig.vue'),
        meta: { title: '渠道配置' }
      },
      {
        path: 'messages/subscriptions',
        name: 'MessageSubscriptionRules',
        component: () => import('@/modules/notification/views/admin/SubscriptionRules.vue'),
        meta: { title: '订阅规则' }
      },
      {
        path: 'messages/deliveries',
        name: 'MessageDeliveryLog',
        component: () => import('@/modules/notification/views/admin/DeliveryLog.vue'),
        meta: { title: '发送记录' }
      },
      {
        path: 'messages/announcements',
        name: 'MessageAnnouncementList',
        component: () => import('@/modules/notification/views/admin/AnnouncementList.vue'),
        meta: { title: '公告管理' }
      },
      {
        path: 'messages/events',
        name: 'MessageEventDefinitionList',
        component: () => import('@/modules/notification/views/admin/EventDefinitionList.vue'),
        meta: { title: '事件管理' }
      },
      {
        path: '/:pathMatch(.*)*',
        redirect: '/404'
      }
    ]
  }
]

const router = createRouter({
  // base 必须显式取 vite base（/lowcode/）：createWebHistory() 无参时 base 为 ''，
  // 应用内跳转产出 /login、/form/designer 等缺前缀 URL，刷新即 404，
  // AI 话术生成的站内链接（如 /form/designer?id=xxx）也无法直达。
  // 传 BASE_URL 后 vue-router 自动在路径前补 /lowcode，与 vite 静态资源前缀一致。
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

router.beforeEach(async (to, _from, next) => {
  // 白名单（meta.public）：免登录直达，也不因拉取用户信息失败被踢回登录页
  if (to.meta.public) {
    next()
    return
  }
  const token = localStorage.getItem('access_token')
  if (!token) {
    next({ name: 'Login' })
    return
  }
  const authStore = useAuthStore()
  if (!authStore.user) {
    try {
      await authStore.fetchUserInfo()
      await authStore.fetchMenus()
    } catch {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      next({ name: 'Login' })
      return
    }
  }
  next()
})

export default router
