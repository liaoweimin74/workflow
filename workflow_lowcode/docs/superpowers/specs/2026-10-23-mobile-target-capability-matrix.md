# 移动端出码目标能力矩阵（uni-app）

> 2026-10-23 · 头脑风暴 recon 产物 · 为「多端应用（出码 UniAPP 路线）」设计文档提供范围依据
>
> 数据来源：`frontend/src/views/page/codegen/contract.ts` 的 `TYPE_CONTRACTS`（24 个契约类型）
> 与 `frontend/src/views/page/components/` 运行时组件清单。组件行为细节均以契约注释里的
> 组件源码证据为准（如 `PageDataTable.vue`、`TableForm.vue:146`），本文不重复引用行号。

## 0. 目标技术栈假设

- 框架：uni-app（Vue 3），一份工程出 `mp-weixin` / `H5` / `APP`
- 组件库：uni-ui 官方组件为主（uni-list / uni-easyinput / uni-datetime-picker / uni-popup / uni-steps / uni-calendar / uni-notice-bar / uni-table …）
- 图表：qiun-data-charts（uCharts，三端通吃）
- **产物不依赖 form-create 运行时**（沿用 Web 出码的既定纪律）：字段族直接出真实模板，校验由产物自带规则执行；动作脚本在生成期已编译为普通函数（小程序禁 `new Function` 的死结在 Web 出码 P2 已解开）

## 1. 评级口径

| 级别 | 含义 |
|---|---|
| S | ≤2 人日：映射近乎 1:1，主要是模板改写 + emit 登记 |
| M | 3–8 人日：需要新形态封装、交互重画或跨组件接线 |
| L | >8 人日，或映射方案本身需要产品决策 |

工作量口径：单组件的「映射实现 + emit 出码 + 产物验证」，不含横切基建（见 §3）。

## 2. 组件矩阵

### 2.1 字段族（form-create 字段类型，移动端产物为真实模板）

| schema type | 现状（Web） | 移动端映射 | 级别 | 说明 / 风险 |
|---|---|---|---|---|
| input | el-input | uni-easyinput | S | 近 1:1 |
| textarea | el-input type=textarea | uni-easyinput type=textarea | S | 近 1:1 |
| inputNumber | el-input-number | uni-number-box | S | precision 需要 Product 封装一层（uni-number-box 无精度约束） |
| datePicker | el-date-picker（date/datetime/month…） | uni-datetime-picker | S | type 形态映射齐全 |
| select | el-select（options 走 config 常量） | 单选 picker / uni-data-select；multiple、远程搜索需自绘弹层 | M | 多选与远程搜索是成本主体 |
| group | 分组行容器（行卡片、增删、上下限） | view 块 + 行卡片 + 增删按钮 | S | 配置键走 config 常量，产物已有同口径生成 |
| subForm | 单对象嵌套表单块 | 嵌套块（v-model 前缀 `form.<容器字段>`） | S | 与 Web 产物同构 |
| tableForm | 行内编辑子表格（columns[].rule） | **卡片式子列表编辑器**（每行一张卡片、字段纵向排） | L | 移动端无行内编辑表格的成熟形态，需新组件 + 交互重设计 |
| FormulaField | 纯展示计算字段（expression `${字段}`） | 移植 formulaEval 纯函数 + 产物 form 后端 | M | 求值器是纯函数可直接移植；取值层换 uni 侧 form 数据 |
| dataPicker | 数据源选择器（级联清理、maxCount、allowCreate） | 自绘 popup 列表 + 搜索 + 级联清理 | M | 逻辑可移植，UI 重画 |
| LookupPicker | 全局数据源选择器（searchColumns/columns/returnFields + select/clear 回写） | 自绘 popup + 分页搜索 + 回写映射 | M | 回写语义（writes）已有显式契约，产物 handler 可对位 |

### 2.2 列表 / 详情族

| schema type | 现状（Web） | 移动端映射 | 级别 | 说明 / 风险 |
|---|---|---|---|---|
| page-list-cards | 卡片列表（搜索、分页、动作） | uni-card 列表 + 触底加载 + uni-search-bar + 筛选抽屉 | M | 移动端最自然的列表形态，动作链出口复用 |
| page-table | 数据表格（搜索、排序、选择、操作列、详情） | **决策点**：uni-table 简表（横向滚动、操作收进"···"弹层） vs 引导设计期直接用 cards | L | uni-table 无合并单元格/复杂表头；批量选择（TableBatchBar）在移动端=卡片多选模式 |
| page-detail | 详情视图 | label:value 堆叠列表 + 操作按钮 | M | viewDetail 容器接线与 Web 产物同构 |
| page-steps | 步骤条 | uni-steps | S | 近 1:1 |
| page-data-container | 数据容器（抽屉/弹窗，容器段自带 open/close/confirmSave） | uni-popup（全屏页或底部弹层） + 容器表单 | M | 三键（确定/取消/关闭）语义保留 |

### 2.3 仪表盘族

| schema type | 现状（Web） | 移动端映射 | 级别 | 说明 / 风险 |
|---|---|---|---|---|
| dash-kpi | KPI 卡 | 自绘统计卡 | S | — |
| dash-notice | 公告栏（数据来自消息接口，无数据源键） | uni-notice-bar / swiper | S | 数据接口直接复用 |
| dash-todo | 待办列表 | 复用卡片列表 | S | — |
| dash-filter | 筛选器（自身不取数，广播 setFilter） | 筛选栏（搜索框+下拉筛选） | M | **Web 产物同样登记不出跨组件联动**（广播是渲染器层的活）；移动端先做「筛选回调本页列表」的显式接线 |
| dash-chart / page-chart | 图表 | qiun-data-charts | M | 图表类型子集（line/bar/pie 起步）；配置面板键位对齐需逐图核对 |

### 2.4 布局与无契约组件

| 组件 | 现状 | 移动端结论 | 级别 |
|---|---|---|---|
| fcTable | 布局表格（row/col/layout 几何，出静态 table） | **决策点**：纵向堆叠降级，或自绘 grid（放弃合并单元格语义） | L |
| PageIframe | iframe 嵌入 | **web-only**（小程序 web-view 受业务域名与主体限制；uni 模板无 iframe） | 排除 |
| PageDataTree / PageTreeTable | 树 / 树表（**无出码契约**） | V1 排除；移动端形态（折叠列表/级联）需单独重设计 | V2 |
| PageTimeline | 时间线（**无出码契约**） | 先补 Web 契约，再映射 uni-steps 竖排 | S–M（含补契约） |
| PageCalendar | 日历（**无出码契约**） | 先补 Web 契约，再映射 uni-calendar | S–M（含补契约） |
| Excel 导入/导出（ExcelActions/ExcelImportDialog） | Web 专属 | **web-only**，移动端无意义 | 排除 |
| TableBatchBar / TableHeaderFilter | 表格内部件（随 page-table） | 批量=卡片多选模式；表头筛选=筛选抽屉 | 随 page-table |

## 3. 横切基建（与组件数无关的固定成本）

| 项 | 内容 | 级别 |
|---|---|---|
| HTTP 适配层 | uni.request 封装、token 拦截、`X-Tenant-Id` 注入（现有 api 模块按 Web 宿主写的） | M |
| 认证 | 小程序：wx.login → 后端换 token（**后端已有 V64 openid 绑定**；但 `WechatMiniprogramClient` 是单 appId Bean，需按 Client 配置多实例化）；H5/APP：token 直连 | M |
| 动作出口适配 | ACTION_OPS 14 项按端出适配层：open-link→uni.navigateTo、message→uni.showToast、list-ref 族→ref 调用、container 族→产物容器段函数；脚本已是普通函数（D4），上下文白名单语义不变 | M |
| 工程骨架 | pages.json / manifest.json / tabBar / 分包按 Client 构建配置生成 | M |
| 样式 | px→rpx 换算、安全区、Element Plus 类名不迁移（产物本就是自绘 class） | M |
| 验证 | 双渲染 e2e 延伸到 H5 产物（复用 Playwright 双渲染骨架）；小程序真机校验走人工 + 预览二维码 | M |

## 4. 结论

### 4.1 可映射率

24 个契约类型中：**S 8 个、M 11 个、L 3 个（page-table / tableForm / fcTable）、web-only 2 类能力（iframe、Excel）**。
另有 3 个运行时组件无契约（timeline/calendar/tree 族），移动端之前需先补 Web 契约。

### 4.2 V1 建议范围（跑通「列表 → 详情 → 填表提交」审批闭环）

- **进 V1**：字段族 S 项（input/textarea/inputNumber/datePicker/group/subForm）+ select(M) + FormulaField(M) + page-list-cards(M) + page-detail(M) + page-steps(S) + page-data-container(M) + dash-kpi/notice/todo(S) + 横切基建全套
- **V1.5**（按需插队）：dataPicker / LookupPicker / dash-chart / page-chart / PageTimeline / PageCalendar
- **V1 排除**：page-table（引导设计期用 cards）、fcTable、tableForm、tree/tree-table、iframe、Excel

### 4.3 总量粗估

V1 ≈ **4–6 人周**（1 人；基建 1–1.5 周、字段族+容器 1–1.5 周、列表/详情 1 周、pages.json+构建+体验版上传链路 0.5–1 周、联调缓冲 0.5–1 周）。不含 APP 打包上架。

### 4.4 需要产品决策的三个点

1. **page-table 的移动形态**：出 uni-table 简表，还是移动端设计期直接引导用卡片列表（page-table 不出移动码）？
2. **fcTable / tableForm 的降级策略**：V1 是否直接在移动端禁用这两类（置灰+提示），还是接受「fcTable 降级纵向堆叠、tableForm 出卡片编辑器」的实现成本？
3. **图表是否进 V1**：dashboard 场景常见 vs qiun-data-charts 接入与逐图核对成本（约 +0.5–1 人周）。
