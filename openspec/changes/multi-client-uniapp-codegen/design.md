# Design — multi-client-uniapp-codegen

## Context

平台现状（均为已验证事实）：

- 页面设计仅支持 Web：设计器产出 form-create rule + lc 元数据 schema，`PageRendererPage` 运行期动态渲染；页面模型 `wf_page_def` 为租户级（`tenant_id + key + version`），**没有应用/端维度**。
- 出码 P2 已交付：`parse → IR → emit` 独立骨架、`@lc/runtime` 仓库内包、动作链/事件脚本编译为普通函数、12 页语料 golden、双渲染 e2e 与可出码率 Gate（94/98 节点，C 保真桶 0）。IR（D1）与脚本编译（D4）在设计时就为移动端第二目标预留。
- 后端已有微信 openid 绑定（V64）与 `WechatMiniprogramClient`，但为单 appId Spring Bean；租户隔离与行级权限（row-permission）完善。

需求：设计多种客户端前端应用（Web / 微信小程序 / H5 / APP），每种端可有多个应用（商户端、买家端仅为举例），各应用**共享租户数据**；PC 端可预览模拟移动端；「每次改动重新生成 + 重新发布」可接受（用户确认）。

硬约束：

- 微信小程序禁 `new Function`/eval——任何移动端方案不能依赖运行时解释脚本。
- 小程序主包 2MB（总量 20MB 分包）——图表库体积必须走分包或按需注册。
- 微信审核发布节奏——移动端不存在"改完即上线"。
- 沿用既有纪律：产物不依赖宿主 alias（独立可编译）、出码产物不引 form-create 运行时、不支持的动作链必须登记不许假挂点、golden 快照守产物字节。

## Goals / Non-Goals

**Goals:**

- G1 数据模型与 API：`wf_app` / `wf_app_client` / `wf_app_client_page` / `wf_app_release` 四表 + `wf_page_def` 加 `app_id`，App/Client/发布 CRUD 与查询接口。
- G2 设计器「端」维度：页面归属应用；页面携带设计类型（web/uniapp，创建时定、不可变更）；同一渲染机按类型解析组件注册表；画布设备框（Web 桌面 / 375 手机壳契约渲染）；三区能力矩阵过滤（Web 专属/共享/移动专属，双向置灰）；页面分配校验设计类型与 Client 端类型兼容。
- G3 出码第二目标：`emitUniApp(IR, TargetProfile)` + `@lc/runtime-uni` 仓库内包，产物工程独立可编译（pages.json / manifest.json / 页面 SFC / uni 侧适配层）。
- G4 预览分层：日常所见即所得由设计器契约渲染画布承担（@lc/ui-mobile，与出码同一 component-map）；产物级预览（uni-app H5 构建 iframe 手机壳 + 小程序预览二维码）降为发布前核对手段。
- G5 V1 组件面：能力矩阵 §4.2 + 三项决策（page-table 出 uni-table 简表；fcTable/tableForm 降级实现；chart 族进 V1 用 Uni ECharts）。
- G6 构建发布链路：页面发布 → AppRelease 快照 → 按 Client 构建（mp-weixin / H5）→ 产物归档 + miniprogram-ci 体验版上传。

**Non-Goals:**

- APP 打包上架、签名、热更新（V2）。
- 页面级多端变体 schema（用「独立页面 + 按 Client 分配」替代，V2 再评估）。
- 树/树表、PageIframe、Excel 导入导出的移动端（web-only）。
- 移动端动态渲染运行时（本变更明确不做运行期解释）。
- `@lc/runtime*` 发布到 npm registry（沿用仓库内 file 依赖）。
- H5/APP 推送、支付等原生能力接入。

## Decisions

### D1：渲染路线 = 出码，不做移动端动态渲染

移动端产物由 `emitUniApp` 生成真实模板与普通函数，运行期零解释。备选「小程序内动态渲染解释 schema」否决：需重写沙箱化表达式解释器（小程序禁 eval）+ 全组件库小程序版重实现，成本无界；且与 page-codegen-p2 D4 的既有判断（脚本必须生成期编译）冲突。出码将「解释器」变「编译器」，IR 与脚本编译为移动端已预埋，难度收敛为有限的组件映射表。

### D2：应用建模 = App（受众产品）→ Client（渠道实例）两层，数据边界仍在租户层

- `App` = 面向某类用户的成品（商户端、买家端…），拥有页面、主题、角色映射；**不是数据边界**——表单、数据源、工作流、行级权限全部留在租户层共享。
- `Client` = App 的一个交付实例：端类型（WEB/MP_WEIXIN/H5/APP）+ 构建配置（appid/域名/包名）+ 导航（tabBar/菜单）+ 页面启用清单 + 发布记录。
- 同一端类型可有 N 个 Client，同一 App 可有 N 个端；页面属 App 级，经 `wf_app_client_page` 分配给各 Client。需要不同移动布局时建独立页面分配给移动 Client（V1 不做页面级变体）。
- 备选「扁平应用（App=端实例）」否决：同一业务多端会裂成互不相干的应用，页面/主题无法共享；备选「页面级多端变体」否决：设计器/版本/发布全链路复杂度最高，V1 需求可被覆盖。
- 两层保留的决策依据（2026-10-23 与用户复核）：页面按设计类型（web/uniapp）分离后，「同一 uniapp 页面池跨小程序 + H5 交付」成为 Client 层不可替代的职责（用户确认该场景会出现）；扁平「应用=端实例」会迫使 MP/H5 整池复制页面。

### D3：数据模型与迁移

```
wf_app            (id, tenant_id, name, code, theme_json, status, 审计列)          uk(tenant_id, code)
wf_app_client     (id, tenant_id, app_id, client_type, name, render_mode,
                   build_config_json, navigation_json, status, 审计列)             uk(tenant_id, app_id, client_type, name)
wf_app_client_page(id, tenant_id, client_id, page_id, sort, nav_config_json)      uk(client_id, page_id)
wf_app_release    (id, tenant_id, app_id, client_id, version, snapshot_json,
                   artifact_url, status, built_at, published_at, created_by)      uk(client_id, version)
wf_page_def       + app_id 列；唯一键改 (tenant_id, app_id, `key`, version)；
                    相关唯一性校验、列表查询、key 解析接口同步加 app 维度
```

- 迁移号在实现期取 main 最新 Flyway 版本 +1（并行开发防冲突）；每租户回填一个「默认应用」，存量页面 `app_id` 归入，保证升级零感知。
- `wf_page_def.app_id` 允许语义上的"默认"，但列上直接落真实 app id（不存 NULL），避免查询双轨。

### D4：render_mode 双轨并存，Web 不动

Client 携带 `render_mode`：WEB=RUNTIME（现有动态渲染、改完即生效，不强制走出码），MP_WEIXIN/H5/APP=CODEGEN。字段留 Client 上是刻意留口：未来 H5 也可 RUNTIME 直跑（快速移动 Web 场景），或某小程序客户要求动态化时再评估。

### D5：设计器「端」维度 = 页面设计类型 + 契约渲染，不建第二设计器

设计器本质 schema 驱动：画布 → rule+lc 元数据 → 存储。移动端设计复用同一设计器、同一渲染机、同一 schema 格式（反目标：出现第二套 schema）：

- **页面设计类型**：页面携带 `design_type`（web | uniapp），创建时确定、不可变更（设计器不提供切换入口，选错 = 新建页面；「复制为另一类型」留 V1.1 评估）。类型只决定画布与组件注册表，MUST NOT 改变 schema 结构；页面交付归属仍由 Client 启用清单决定，两者正交。
- **画布 = 契约渲染**：同一渲染机按 design_type 解析组件注册表——web→宿主 el-* 包（现状不动），uniapp→`@lc/ui-mobile`（uni-ui 契约对齐的 web 封装组件包：props/事件/插槽与 emit 产物中的 uni-ui 标签一一对应，视觉克隆 uni-ui 主题 token 并锁定其版本）。画布与出码共用同一份 component-map（单一事实源）。画布按类型给设备框（桌面 / 375×667 手机壳）。
- **三区能力矩阵（双向）**：组件 × 端支持关系分三区——Web 专属（PageIframe/Excel/树族）、双端共享（主体）、移动专属（V1 仅机制预留不落组件，V1.1 按需启用）。面板按当前页面类型过滤，不支持项置灰并提示原因。
- **分配类型校验**：页面分配给 Client 时校验 design_type 与 Client 端类型兼容（web→WEB，uniapp→MP_WEIXIN/H5/APP），不兼容 400；组件级能力由面板过滤在创建侧保证，分配侧无需逐组件校验。
- 小程序/H5/APP 在设计期零差别（同一 uniapp 注册表与画布），差异全部收敛在交付层（Client 的构建配置/凭证/清单）；出码报告按端分桶（复用现有 A/B/C 桶机制）。

### D6：出码架构 = TargetProfile 驱动的第二 emit 后端

- `parse → IR` 完全复用；新增 `emitUniApp(IR, profile)`；`componentMap` 同时作为设计器契约渲染画布（@lc/ui-mobile）与 emit 的组件解析依据（单一事实源，D5）。
- `TargetProfile = { platform: 'web'|'uniapp', componentMap, styleRules, apiAdapter, routerAdapter, capabilities }`：组件映射（el-*/page-* → uni-ui 对位）、px→rpx 换算（375 画布基准）、API 适配（uni.request + token + 租户头）、路由适配（uni.navigateTo）。
- 产物工程文件集：`pages.json`（按 Client 页面启用清单与导航生成）、`manifest.json`（appid/名称等 build_config）、`App.vue`、`pages/<key>.vue`、`@lc/runtime-uni`（仓库内 file 依赖包，产物独立可编译，沿用 P2 D3 纪律）。
- 脚本零新成本：动作链/事件脚本在生成期已是普通函数（P2 D4），产物上下文（form/row/page/message/http）在 uni 侧提供同名适配；白名单越界标识符照旧登记 unsupported。

### D7：组件映射（能力矩阵三决策落地）

| schema 类型 | 移动端映射 | 级别 |
|---|---|---|
| page-table | **uni-table 简表**：横向滚动、操作收「···」弹层、批量=selection 列（决策 1） | L |
| fcTable | **纵向堆叠降级**：放弃合并单元格语义，slot 单元按行堆叠（决策 2） | M |
| tableForm | **卡片式子列表编辑器**：每行一张卡片、字段纵向排（新形态组件，决策 2） | L |
| 字段族 S 项 | input/textarea→uni-easyinput、inputNumber→uni-number-box（precision 封装）、datePicker→uni-datetime-picker、group/subForm→块容器 | S |
| select | 单选 picker/uni-data-select；multiple 与远程搜索自绘弹层 | M |
| FormulaField | 复用 formulaEval 纯函数 + 产物 form 后端 | M |
| dataPicker/LookupPicker | 自绘 popup（搜索/分页/级联清理/回写映射） | M |
| page-list-cards | uni-card + 触底加载 + uni-search-bar + 筛选抽屉 | M |
| page-detail / page-steps / page-data-container | 堆叠详情 / uni-steps / uni-popup 弹层容器 | S–M |
| dash-kpi/notice/todo | 自绘统计卡 / uni-notice-bar / 复用卡片列表 | S |
| dash-chart / page-chart | **lime-echart（Uni ECharts）**：复用 `buildChartDataset`/`buildPieDataset` 语义聚合与 option 构造（Web 端 schema 存的是 `{type, dimension, measures}` 语义层，引擎无关）；echarts 按需注册沿用 `useEcharts.ts` 清单；图表页强制 subpackage（决策 3） | M |

### D8：动作出口按端适配

`ACTION_OPS` 14 项逐项适配：`open-link→uni.navigateTo`、`message→uni.showToast`、list-ref 族→ref 调用、container 族→产物容器段函数、`export/delete` 按端语义核对（export 移动端登记 unsupported）。生成期展开 `$row`/`$param` 的既有机制不变；表外 op 一律不接线（登记），沿用「不许假挂点」纪律。

### D9：预览分层（画布即契约渲染，产物预览降为发布前核对）

- **日常所见即所得 = 设计器画布**：@lc/ui-mobile 契约渲染（D5），免构建、交互与 Web 画布一致（真 DOM 拖拽/选中）。保真口径：结构/API 100%（同一 component-map）、皮肤 ~95%（克隆 uni-ui token + 版本锁定）、rpx 换算同源；小程序原生层（canvas 2d/键盘/胶囊）任何网页画布不可及，以真机二维码兜底。
- **产物级预览（发布前核对）**：`emitUniApp` → uni-app H5 构建 → iframe 手机壳加载（复用 codegen-lab「宿主 vs 产物」双渲染骨架）；小程序目标出预览二维码引导进微信开发者工具。构建按需触发（预览按钮），不常驻 watch。
- 备选「iframe 挂 uni dev server + HMR 实时产物画布」否决：postMessage 桥接拖拽/选中与 dev server 生命周期管理成本高且交互割裂；契约渲染以同源映射达到等效保真且交互不打折扣。

### D10：构建发布链路

页面发布 → 创建 `AppRelease`（快照固定各页 `published_version`，页面后续发新版不影响已建 Release）→ 按 Client 构建产物 → 归档（后端静态目录，V1 不引对象存储）→ `miniprogram-ci` 上传体验版并回传二维码；H5 产物给静态目录/zip。V1 构建触发为接口同步调用（构建耗时秒级~分钟级），异步 job 化留 V2。

### D11：验证策略（沿用并延伸既有 Gate）

- 语料体检 per-target：`generatePage(report)` 扩展为按 target 分桶，可出码率低于基线即失败（持续 Gate）。
- 双渲染 e2e 延伸：宿主动态渲染 vs **uni-app H5 产物**（Playwright，同一活库同一时刻读数）；小程序真机走人工校验清单（登录/列表/详情/提交/二维码）。
- golden 快照继续守产物字节；`@lc/runtime-uni` 独立编译测试（对应 P2 的 runtime-package-build Gate）。

## Risks / Trade-offs

- [uni-table 能力不足（固定列/复杂表头/横向滚动真机表现未知）] → 实现首日先做 1 天 spike 实测；不足则收窄为「精简列 + 操作弹层」，语料 A/B 只对验证过的形态负责 → **【Task 6.1 spike 已回填】** uni-ui@1.5.12 源码核查（uni-shell 锁定版本）：横向滚动 ✓（`.uni-table-scroll{overflow-x:auto}` + uni-tr 动态汇总 th 宽算 minWidth，H5 真 `<table>` / 非 H5 view 堆叠双端可行）；**固定列 ✗**（uni-th/uni-tr 无 fixed 实现，仅注释残留）→ 触发预案：page-table 收窄为「精简列 + 操作收 ··· 弹层」，不出固定列；selection 多选 ✓（type="selection" + toggleRowSelection/clearSelection/toggleAllSelection 方法面 + selection-change 事件，6.2 批量列与 clear-selection 链 op 有对位）。mp-weixin 真机触感归 10.3 人工清单。
- [echarts 体积撑爆主包] → 图表页强制 subpackage + 按需注册；仍超则对 dash-kpi 类简单图形降级 uCharts（语义层在，引擎可换）
- [「Web 能配、移动不支持」的隐形坑] → 双 Gate：设计器能力矩阵硬过滤 + 出码报告 per-target 分桶，不支持项必须显式登记而非静默丢弃
- [并行开发期间 Flyway 版本号冲突] → 迁移号取合并时 main 最新 +1；rebase 按 AGENTS.md lockfile 规则处理
- [lime-echart 在 mp-weixin canvas 2d 的兼容性未知] → 列入首日 spike；fallback uCharts
- [@lc/ui-mobile 皮肤克隆与真实 uni-ui 漂移] → 锁定 uni-ui 版本、主题 token 单一来源；产物级预览 + 真机二维码作发布前核对
- [页面设计类型选错返工] → 创建入口按进入上下文给默认值；「复制为另一类型」留 V1.1 评估
- [V1 体量 6–8 人周] → 里程碑分批：M1 数据模型+设计器端维度（可演示）；M2 字段族+列表/详情出码闭环（H5 产物可跑）；M3 图表+uni-table/降级件+发布链路
- [AppRelease 快照与持续发布的语义混淆] → 快照只引用 published_version；「重新发布」= 新建 Release，不做原地变更

## Migration Plan

1. 后端迁移（单迁移文件）：建 4 表 + `wf_page_def` 加列 + 存量「默认应用」回填；迁移号取合并时最新 +1。
2. 前端设计器：App/Client 上下文与端维度改造（存量页面自动归入默认应用，UI 零感知升级）。
3. 出码与构建：`emitUniApp`/`@lc/runtime-uni`/构建链路为纯增量，不触碰 Web 动态渲染主链路。
4. 回滚策略：新表独立、出码模块增量，回滚 = 关闭多端入口（菜单/路由），Web 主链路无感知；`app_id` 列保留不删。

## Open Questions

1. uni-table 版本选型与固定列/横向滚动真机表现（首日 spike 定）。→ **已定（Task 6.1）**：锁定 uni-shell 的 uni-ui@1.5.12；横向滚动可行、固定列无实现（收窄为精简列 + 操作弹层）；真机触感归 10.3。
2. lime-echart 按需注册与分包落点（图表页 subpackage 切分规则）。
3. rpx 换算基准：设计器 375 画布 ↔ 小程序 750 设计稿的映射细则。
4. `WechatMiniprogramClient` 从单 appId Bean 改按 Client 配置多实例的方式（配置表驱动 vs Bean 工厂）。
5. @lc/ui-mobile 组件清单与 uni-ui 版本锁定（按 component-map uniapp 侧范围在实现期定）。
6. 触底分页与 `pageSize/pageSizes` 语义映射（load-more vs 分页条口径）。
