# Proposal — 全站界面美化（参照音频后台仪表盘）

## Why

当前后台为默认 Element Plus 外观（工业蓝 `#1a56db` + 灰白底），全站无品牌辨识度，
与用户期望的「蓝紫 + 青科技感」后台风格差距明显。用户在参考稿（uishijie.com/ui/11376）
基础上要求全站美化，且已确认采用「全局主题层 + 关键页面精修」的专业路径。
一次主题重构即可永久提升全站观感，成本集中于样式层，不触碰业务逻辑。

## What Changes

**Design Token 体系（DESIGN.md + style.css）**
- From: `industrial` 蓝 #1a56db + 灰白 #f8f9fb 底的通用 Element Plus 外观
- To: 靛蓝主色 #5755ee + 青色点缀 #46c9d6 + 浅蓝紫渐变底 + 柔和圆角卡片的科技感主题
- Reason: 对齐参考稿程序化提取的配色语言（背景 #f1f4fe、侧边栏 #e6e9fb、选中 #e9eaff 系）
- Impact: non-breaking；全站 Element Plus 组件（按钮/表格/表单/菜单/对话框）自动换肤

**布局外壳（AdminLayout + SubMenu）**
- From: 灰白侧边栏、琥珀页签高亮条
- To: 蓝紫侧边栏、靛蓝菜单高亮圆角块、青色页签指示条、渐变 logo
- Reason: 参考稿侧边栏与选中态为蓝紫浅底风格
- Impact: non-breaking；仅 class 层改动

**关键页面精修（Login + Dashboard + ProcessCenter）**
- From: 占位式仪表盘（4 个 `--` 卡片）、普通登录页
- To: 渐变欢迎横幅 + 装饰性 SVG 图表 + 主题色统计卡片；品牌感登录页
- Reason: 首页与登录页是品牌第一印象，参考稿核心为仪表盘布局
- Impact: non-breaking；仪表盘无后端统计接口，装饰图表不引入图表库

**暗色模式升级**
- From: 现有 `.dark` 灰黑调（gray-900 系）
- To: 深蓝紫调（#12162b 底 / #1b2040 卡片 / 靛蓝主色微亮 #7c7ff0 / 青点缀 #5ee7e8）
- Reason: 暗色模式必须保持可用且与亮色新主题语义一致
- Impact: non-breaking；沿用既有 `.dark` 体系

**范围边界**
- 不改任何业务逻辑（script / 接口 / 路由 / 状态）；不改 bpmn-js / form-create 画布内部；
  不逐页手写 65+ 视图（全局令牌覆盖 + 代表页面精修）。

## Capabilities

### New Capabilities
- `ui-visual-theme`: 全站视觉主题体系——设计令牌（靛蓝主色/青点缀/浅蓝紫底）、
  Element Plus 变量覆盖、布局外壳风格、关键页面精修、暗色模式适配的验收规范。

### Modified Capabilities
- （无）—— 本次为纯新增外观能力，不改任何既有 capability 的需求行为。

## Impact

- **代码**：`DESIGN.md`（更新令牌）、`frontend/src/style.css`（EP 变量 + Tailwind @theme 扩色）、
  `layouts/AdminLayout.vue`、`components/SubMenu.vue`、`views/login/LoginPage.vue`、
  `views/dashboard/DashboardPage.vue`、`views/process/ProcessCenterPage.vue`（class 层微调）。
- **依赖**：零新增（仪表盘装饰图表用内联 SVG/CSS）。
- **系统**：亮/暗双模式全站外观；BPMN/表单设计器画布内部不受影响。
- **风险**：EP 全局覆盖面广 → 用浏览器截图回归 8-10 个代表页面；`industrial` token 改值仅 3 处引用且语义正确。