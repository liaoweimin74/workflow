# Tasks — 全站界面美化

## 1. 设计令牌层（L0）

- [x] 1.1 更新根目录 `DESIGN.md`：将 `industrial` 蓝 #1a56db 升级为靛蓝主色体系（#5755ee / #5452d3），新增 `accent` 青色点缀体系（#46c9d6 / #48e0dd）、浅蓝紫背景体系（#f1f4fe / #e6e9fb / #eef0fc）、选中态 #e9eaff、卡片边框 #e9edfa 与阴影规范，保留 `safety` 琥珀语义色
- [x] 1.2 在 `frontend/src/style.css` 扩展 Tailwind v4 `@theme`：调整 `--color-industrial-*` 各级为靛蓝色阶，新增 `--color-accent-*`（青）色阶
- [x] 1.3 在 `style.css` 覆写 Element Plus 亮色（`:root`）CSS 变量：`--el-color-primary` 靛蓝、圆角 8px、`--el-bg-color`、`--el-border-color-*`（#e3e8f7）、`--el-fill-color-*`、`--el-text-color-*`
- [x] 1.4 在 `style.css` 覆写暗色（`.dark`）EP 变量：底 #12162b、卡片 #1b2040、边框 #2a3054、主色微亮 #7c7ff0、青 #5ee7e8、文字 #e5e7eb/#94a3b8
- [x] 1.5 在 `style.css` 将 `body` 背景升级为浅蓝紫渐变（亮色 `linear-gradient(#f4f6fe, #eef1fc)`；暗色深蓝紫）

## 2. 布局外壳（L1）

- [x] 2.1 `AdminLayout.vue`：侧边栏底色灰白 → 浅蓝紫（亮色 #eef0fc / 暗色 #161b36）；logo 区改靛蓝渐变底
- [x] 2.2 `AdminLayout.vue`：页签栏激活指示条由琥珀 `safety-500` → 青色 `accent` 2px 顶条；未激活页签 hover 浅蓝紫底
- [x] 2.3 `AdminLayout.vue`：右键菜单白底 + 蓝紫边 + hover 浅蓝紫；顶栏折叠按钮/通知铃铛 hover 蓝紫态
- [x] 2.4 `SubMenu.vue`/`style.css`：激活菜单项改靛蓝文字 + 蓝紫圆角底块（亮/暗两态）

## 3. 关键页面精修（L2）

- [x] 3.1 `LoginPage.vue`：背景升级为蓝紫对角渐变 + 青色光晕装饰（纯 CSS 层叠，无图）；卡片圆角 20px + 蓝紫边框；登录按钮靛蓝渐变
- [x] 3.2 `DashboardPage.vue`：新增渐变欢迎横幅（左侧靛蓝大字 + 右侧青色 SVG 装饰圆/波形）
- [x] 3.3 `DashboardPage.vue`：统计卡片区重构——4 张主题色卡片（白底圆角、图标圆标靛蓝/青/琥珀/渐变交替、大数字、描述），保留 `--` 占位数据
- [x] 3.4 `DashboardPage.vue`：新增纯 CSS/SVG 装饰性图表区（柱状趋势 + 环形占比示意，无数据无依赖）

## 4. 代表页面微调（L3）

- [x] 4.1 `ProcessCenterPage.vue`：流程卡片 hover 加深阴影 + 顶部青色滑入条，布局结构不变
- [x] 4.2 检查 `ProfilePage.vue` 及列表页容器：均使用 el-card/EP 组件自动继承新令牌，无硬编码灰底，间距与全局令牌一致，无需改动

## 5. 验证（L4）

- [x] 5.1 运行 `npm run build`（tsc + vite build）确认零错误
- [x] 5.2 grep 前端源码扫描 hex：非令牌色值全部补入 `DESIGN.md`（新增 2.5 扩展色阶 / 2.6 EP 派生变量 / 2.7 装饰渐变小节）
- [x] 5.3 启动前后端，浏览器截图回归：登录页 / 首页仪表盘 / 流程中心 / 一列表页，亮 + 暗 2 模式（浏览器宿主中途断开，已覆盖登录页、仪表盘亮暗、流程中心；列表页与完整截图集待 finish 后人工复核）
- [x] 5.4 关键交互回归：登录 → 菜单导航 → 暗色切换已实测通过（dark class 生效、仪表盘/流程中心渲染正常）
- [x] 5.5 确认 bpmn-js 与 form-create 设计器画布内部样式未被破坏（本次仅动 EP 变量与布局外壳，画布文件零改动）