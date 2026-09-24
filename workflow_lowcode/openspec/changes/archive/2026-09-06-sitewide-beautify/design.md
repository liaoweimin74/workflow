# Design — 全站界面美化（参照音频后台仪表盘）

## Context

当前系统是一个 **Vue 3 + Element Plus 2.14 + Tailwind CSS v4 + Pinia** 的管理后台（石化工厂安全作业工作流平台），
含 65+ 视图组件（流程设计器 bpmn-js、表单设计器 form-create、数据源、业务列表页、系统管理、登录、仪表盘等）。
现有外观为默认 Element Plus + 自定义 `industrial(#1a56db 蓝)` / `safety(#f59e0b 琥珀)` 双色，
背景 `#f8f9fb`，侧边栏 `#f9fafb` 灰白，观感通用、无品牌辨识度，且已存在一份较简的 `DESIGN.md`。

用户提供参考稿「音频类后台首页仪表盘」（uishijie.com/ui/11376），要求全站美化。
经程序化像素分析（Chromium canvas 聚类），参考稿视觉特征为：

| 元素 | 色值（提取） | 特征 |
|---|---|---|
| 页面/卡片背景 | `#f1f4fe` ~ `#ffffff` | 浅蓝紫白底 |
| 侧边栏 | `#e6e9fb` / `#f5f6fb` | 浅蓝紫 |
| 主强调色 | `#5755ee` / `#5452d3` | 靛蓝（高饱和低亮度） |
| 图表/点缀青 | `#46c9d6` / `#48e0dd` | 青色 |
| 选中菜单底 | `#e9eaff` 系 | 蓝紫浅底 |
| 亮度分布 | 92.8% 落在最亮桶 | 整体浅色科技风 |

约束：全站 65+ 页面，不能逐页手写；不能破坏现有业务逻辑；暗色模式必须保持可用。

## Goals / Non-Goals

**Goals:**
- 建立参考稿风格的**全局设计令牌**：浅蓝紫底、靛蓝主色、青色点缀、柔和圆角卡片。
- 通过 **Element Plus CSS 主题变量覆盖 + Tailwind v4 `@theme` 扩展**实现全站自动换肤（零逐页改动即全站生效）。
- 重构**布局外壳**（AdminLayout 侧边栏/顶栏/页签栏、SubMenu、右键菜单）：参考稿蓝紫科技感。
- 精修**关键页面**：登录页（品牌感）、仪表盘（统计卡片/装饰图表/欢迎区）、流程中心、个人中心；
  以及代表性**列表页**（搜索卡片 + 表格统一风格，通过全局变量自动生效 + 少量通用类）。
- 暗色模式同步升级（深蓝紫底 + 青色点缀）。
- 更新 `DESIGN.md` 作为新令牌的权威来源。

**Non-Goals:**
- 不重写任何业务逻辑 / 接口 / 路由 / 状态管理。
- 不改 bpmn-js 流程设计器画布内部、form-create 设计器画布内部（仅外壳层适配）。
- 不引入新图表库（仪表盘无后端统计接口，用 CSS 装饰性图表占位，避免新依赖）。
- 不逐页手写 65 个页面（全局令牌层覆盖 + 代表页面精修）。
- 不改变现有路由结构、组件树、keep-alive 缓存机制。

## Decisions

### D1：复用 Tailwind 现有 token 名并改值（零侵入全站变色）
- 现状：`industrial`（#1a56db）仅被 3 个文件引用（AdminLayout logo/avatar、LoginPage logo/按钮、页签高亮）。
- 决策：**保留 `industrial` 名称，将其各级色值改为参考稿靛蓝系**（`--color-industrial-600: #5755ee` 等），
  全站引用自动变为新主色，无需改动任何组件引用点。
- `safety`（琥珀）保留不变——是安全作业平台的**业务语义色**（高风险提醒、重要警示）。
- 新增 `--color-accent`（青 `#46c9d6`）色系，供科技感点缀、选中态、图表使用。
- 为什么不是新增 `indigo` 命名：避免改 3 个文件的引用 + 保持 token 名称稳定（DESIGN.md 已引用）。

### D2：Element Plus 主题变量集中覆盖于 style.css（双模式）
- 在 `style.css` 覆盖 `:root`（亮色）与 `.dark`（暗色）两套 EP 变量：
  `--el-color-primary`（靛蓝）#5755ee、`--el-color-success/warning/danger` 微调、
  `--el-border-radius-base`（8px）、`--el-bg-color`、`--el-fill-color-*`、`--el-text-color-*`、
  `--el-border-color-*`（浅蓝紫灰 `#e3e8f7`）。
- 全站 el-button/el-table/el-form/el-dialog/el-card/el-menu/el-tag 等**自动**生效，无需逐组件改动。
- 页面背景 `body` 从纯 `#f8f9fb` 升级为**浅蓝紫渐变**（`linear-gradient(#f4f6fe, #eef1fc)` 等），
  营造参考稿的氛围底色；卡片用白底 + 淡蓝紫边 `#e9edfa` + 柔和 `box-shadow: 0 1px 3px rgba(87,85,238,0.06)`。

### D3：布局外壳重构（AdminLayout + SubMenu）
- 侧边栏：灰白 `#f9fafb` → 参考稿蓝紫 `#eef0fc`（亮色）/ 深蓝紫（暗色）；
  菜单高亮项：琥珀 → 靛蓝文字 + 蓝紫底圆角块（参考稿选中态 `#e9eaff` 系）；
  logo 区：改为靛蓝渐变底 + 白字（沿用 MB 字样）。
- 顶栏：白底 + 细分隔线，折叠按钮 hover 蓝紫；通知铃铛/暗色切换图标 hover 态统一。
- 页签栏：激活页签改为靛蓝文字 + 顶部 2px 青 `#46c9d6` 指示条（替换现有 `safety-500` 琥珀条）；
  未激活页签维持灰字，hover 浅蓝紫底。
- 右键菜单：白底 + 蓝紫边 + hover 浅蓝紫。

### D4：关键页面精修
- **LoginPage**：背景升级为蓝紫对角渐变 + 青色光晕装饰（无图、纯 CSS 渐变层叠）；
  卡片圆角增大（20px）+ 蓝紫边 + 靛蓝渐变登录按钮；沿用"安全第一 · 规范作业"文案。
- **DashboardPage**：
  - 欢迎横幅 → 浅蓝紫渐变底 + 左侧靛蓝大字 + 右侧青色装饰圆/波形（纯 CSS SVG，无图）；
  - 统计卡片 → 白底卡片 + 左上角图标圆标（青/靛蓝交替）+ 大数字 + 涨跌/描述小字；
    四个卡片用 4 个主题色块（靛蓝/青/琥珀/紫色）区分维度；
  - 新增图表占位区（纯 CSS/SVG 装饰柱状图 + 环形图示意，无真实数据、无图表库）。
  - 保持现有 `--` 占位数据（无统计接口，不造假数据）。
- **ProcessCenterPage**：搜索卡片与列表卡片圆角/阴影由全局变量自动升级；
  流程卡片 hover 阴影加深 + 顶部青条/图标色微调（小改 class）。
- **ProfilePage** / 列表页（User/Role/Menu/Dict 等）：由全局 EP 变量自动生效；
  仅统一页面容器 padding 与卡片间距（如有偏差）。

### D5：仪表盘装饰性图表不引入新依赖
- 后端无 dashboard 统计接口，`DashboardPage` 目前是 `--` 占位。
- 决策：用**内联 SVG + CSS** 绘制静态装饰性图表（柱状趋势/环形占比），
  视觉上丰富界面，但不宣称真实数据、不增加依赖、不改接口。
- YAGNI：不为装饰引入 echarts/chart.js。

### D6：暗色模式
- 沿用现有 `.dark` 体系；升级为深蓝紫调：
  body `#12162b`（深蓝紫）、卡片 `#1b2040`、边框 `#2a3054`、
  主色不变（靛蓝在暗色下微亮 `#7c7ff0` 保证对比度）、青色点缀 `#5ee7e8`、
  文字 `#e5e7eb` / `#94a3b8`。侧边栏 `#161b36`。

### D7：DESIGN.md 为主令牌权威
- 更新根目录 `DESIGN.md`（工作流管理后台设计系统）：补全新色板（靛蓝/青/浅蓝紫）、
  圆角体系、光晕/渐变装饰规范、卡片语言、状态色。实现中所有新 hex 必须来自 DESIGN.md。

## Risks / Trade-offs

- **[EP 全局覆盖影响全站组件外观] → Mitigation**：这是期望行为（全站统一），但需回归浏览器截图
  抽查 8-10 个代表页面（亮/暗），确认无对比度或布局回归；特别检查 form-create 渲染的表单控件与 bpmn 属性面板。
- **[`industrial` token 改值影响既有引用] → Mitigation**：引用仅 3 处且均为"主色"语义，改值即符合意图；
  grep 确认无其他硬编码 `#1a56db`。
- **[样式的魔法值残留] → Mitigation**：实现末尾 grep hex（`#[0-9a-f]{3,6}`），非令牌外 hex 必须补入 DESIGN.md。
- **[暗色模式EP变量覆盖遗漏] → Mitigation**：逐类验证 EP 组件（menu/table/dialog/dropdown/card）暗色渲染截图。
- **[装饰图表被误解为真实数据] → Mitigation**：装饰图表仅作视觉节奏，占位值用 `--`，不标注具体数值。
- **[大范围改动回归风险] → Mitigation**：只动 `style.css` / `DESIGN.md` / 布局与关键页面模板（class 层），
  不改 `<script>` 逻辑；构建（`tsc && vite build`）+ Playwright 关键流（登录→首页→菜单导航）回归。

## Migration Plan

1. **L0 令牌层**：更新 `DESIGN.md`；改 `style.css`（Tailwind `@theme` 扩 `industrial` 靛蓝 + `accent` 青 +
   body 渐变 + EP 亮/暗变量覆盖）。
2. **L1 布局外壳**：`AdminLayout.vue`（侧边栏/顶栏/页签栏/右键菜单）+ `SubMenu.vue` 高亮态。
3. **L2 关键页面**：`LoginPage.vue`、`DashboardPage.vue`。
4. **L3 代表页面**：`ProcessCenterPage.vue`、`ProfilePage.vue` 微调。
5. **L4 暗色适配**：确认 `.dark` 全套变量与页面深色表现一致。
6. **验证**：`npm run build`；启动前后端；Playwright/浏览器截图回归（亮/暗 × 登录/首页/列表/流程中心）；
   grep hex 合规检查。
7. **回滚**：本次改动集中在 style.css + 布局 + 少量页面模板，回滚 = revert 相关 commit 即可。

## Open Questions

- 仪表盘统计卡片是否希望接入**真实后端统计接口**（需后端配合新增 API）？
  —— 默认：不加接口，先做视觉层；若用户后续要求接入数据，再单独开变更。
- 流程设计器（bpmn-js 画布 / 属性面板）与表单设计器（form-create 画布）是否要求本次一并深层换肤？
  —— 默认：保持画布内部不变（防破坏），仅外壳与 EP 表层生效；
  若用户希望深层换肤，作为后续独立变更评估（风险高）。