# Brainstorm — multi-client-uniapp-codegen

## Design Summary

<!-- Validated design from brainstorming session (2026-10-23 会话) -->

平台要支持多客户端前端应用设计（Web / 微信小程序 / H5 / APP），每种端类型可有多个应用（商户端、买家端仅为举例，模型不写死端数量），且各应用**共享同一租户数据**。经能力矩阵盘点（见 `workflow_lowcode/docs/superpowers/specs/2026-10-23-mobile-target-capability-matrix.md`，已入 main）与逐项决策，确定方案：

- **路线**：出码（UniAPP），不做移动端动态渲染。每次改动重新生成 + 重新发布的模型已被用户接受。
- **建模**：业务应用（App）→ 客户端实例（Client）两层；数据边界保持在租户层，App 只是受众产品边界。
- **设计器**：不另建移动端设计器，给现有设计器加「端」维度（设备框画布、能力矩阵过滤组件面板、双层预览）。
- **出码**：沿用已验证的 `parse → IR → emit` 骨架，新增 `emitUniApp` 第二后端 + TargetProfile；脚本已在生成期编译为普通函数（D4 纪律），天然规避小程序禁 `new Function` 的死结。
- **V1 范围**：能力矩阵 §4.2 + 三项产品决策修订（page-table 出 uni-table 简表、fcTable/tableForm 接受降级实现、图表进 V1 用 Uni ECharts），粗估 6–8 人周（1 人，不含 APP 打包上架）。

## Alternatives Considered

<!--
依 openspec/config.yaml 的 brainstorm rule：須涵蓋 2-3 個替代方案並說明取捨。
-->

### 方案 A：移动端动态渲染（运行时解释 schema）

- **做法**：在小程序/uni-app 宿主内实现一个运行时渲染器，解释 form-create 规则 + lc 元数据，逐组件动态渲染。
- **优点**：改完即生效，无重新发布；与 Web 宿主同构，schema 单一真相最直接。
- **缺点**：微信小程序禁 `new Function`/eval，需重写一个沙箱化表达式/脚本解释器；`el-*`/page-* 全家桶（含 fcTable 几何、dash 族、LookupPicker）需用小程序组件全部重实现；性能受 setData 约束；成本随组件与脚本表面积无界增长。
- **为何未采用**：与「出码规避脚本沙箱」的既有判断一致（page-codegen-p2 design D4 原文否决理由即「小程序禁 new Function」）；出码把解释器变编译器，而 IR 当初就是为第二目标设计的（D1）。

### 方案 B：扁平应用建模（App = 端实例）

- **做法**：`Application{clientType} → 页面`，商户端 Web / 商户端小程序 / 商户端 APP 各建一个应用。
- **优点**：模型最简，一张表 + app_id 即可，设计器改造最小。
- **缺点**：同一业务的多端变成互不相干的应用，页面、主题、导航无法共享；后续打通需要数据迁移。
- **为何未采用**：用户确认商户端/买家端数据共享，App 不应是数据边界；且「每种客户端多个应用」与「同一应用多端」两个真实需求同时存在，扁平模型只能满足其一。

### 方案 C：页面级多端变体（同一页面存多份端 schema）

- **做法**：`wf_page_def` 增加 variant 维度，同一逻辑页面为每个端存一份 schema。
- **优点**：每端布局完全可控，预览即所写。
- **缺点**：设计器、版本、发布、回读全链路都要感知 variant，复杂度最高；V1 需求可用「独立页面 + 按 Client 分配」覆盖。
- **为何未采用**：V1 明确不做（留作 V2 演进方向），避免 schema 爆炸。

### 附：设计器形态（另建移动设计器 vs 现有设计器加端维度）

- **另建**：选择面板、属性面板、动作链、保存/发布全链路双份维护，且 schema 需第二格式——反目标。
- **加端维度（采用）**：画布按端切设备框、组件面板按 TargetProfile 能力矩阵过滤、出码报告按端分桶。

### 附：移动端图表引擎（uCharts vs Uni ECharts）

- **uCharts**：包体小、低端机 canvas 性能好，但 Web 端已是 ECharts 5，需重写 option 翻译层。
- **Uni ECharts（lime-echart，采用）**：关键事实是 Web 图表 schema 存的是**语义层配置** `{type, dimension, measures:[{key,agg}]}`（page-chart 的 `config` prop），`buildChartDataset`/`buildPieDataset` 是纯函数——聚合与 option 构造可直接复用，只换渲染壳；echarts 按需注册已有先例（`useEcharts.ts`），包体走小程序分包。

## Agreed Approach

<!-- The chosen approach and rationale — 引用上方其中一個方案並說明為何勝出 -->

**出码 UniAPP + App/Client 两层建模 + 现有设计器加端维度**：

1. 渲染路线取「出码」（对方案 A 的否决如上）——难度从「无界的运行时重写」收敛为「有限的组件映射表 + 复用既有 IR/emit/双渲染验证骨架」。
2. 建模取「App/Client 两层」（对方案 B 的否决如上）——App=受众产品（商户端/买家端，各拥有页面/主题/角色映射），Client=渠道构建（端类型 + 构建配置 + 导航 + 页面启用清单 + 发布记录）；数据边界仍在租户层，表单/数据源/工作流/行级权限全部共享。
3. 移动端产物完全不依赖 form-create 运行时（沿用 Web 出码纪律）：字段族出真实模板 + 产物自带校验；动作链编译为普通函数；fcTable 出静态结构。

## Key Decisions

<!-- Decisions made during brainstorming -->

| # | 决策 | 内容 |
|---|---|---|
| K1 | 渲染路线 | 出码 UniAPP；重新生成+重新发布可接受（用户确认） |
| K2 | 应用建模 | App=受众产品、Client=渠道实例；同端可多 Client、同 App 可多端；数据边界=租户层 |
| K3 | 数据模型 | 新增 `wf_app` / `wf_app_client` / `wf_app_client_page` / `wf_app_release`；`wf_page_def` 加 `app_id`，唯一键改 `(tenant_id, app_id, key, version)`；存量页面迁移进每租户「默认应用」 |
| K4 | 渲染模式 | Client 带 `render_mode`：WEB=RUNTIME（现有动态渲染不动），MP_WEIXIN/H5/APP=CODEGEN |
| K5 | 设计器 | 加「端」维度：App 切换 + 端 Tab、375 设备框画布、TargetProfile 能力矩阵过滤面板；不做第二设计器 |
| K6 | 预览 | 双层：布局级即时预览（宿主组件模拟 375，V1 只承诺布局）；产物级预览（uni-app H5 构建 iframe + 手机壳；小程序出二维码进微信开发者工具）——复用 codegen-lab 双渲染思路 |
| K7 | 出码架构 | `parse → IR` 不变；新增 `emitUniApp(IR, TargetProfile)`；TargetProfile 持组件映射（uni-ui）、px→rpx、API/路由适配；移动侧运行时落 `@lc/runtime-uni` 仓库内 file 依赖包 |
| K8 | page-table 移动形态 | 出 uni-table 简表（横向滚动，操作收「···」弹层），不做卡片降级（用户决策 1） |
| K9 | fcTable / tableForm | 接受降级实现：fcTable→纵向堆叠（放弃合并单元格语义）；tableForm→卡片式子列表编辑器（新形态组件）（用户决策 2） |
| K10 | 图表 | 进 V1；引擎用 Uni ECharts（lime-echart），复用语义层聚合逻辑；uCharts 留作低端机性能 fallback；echarts 走小程序分包（用户决策 3） |
| K11 | 发布链路 | 页面发布 → `AppRelease` 快照（固定各页 published_version）→ 按 Client 构建（`uni build -p mp-weixin / h5`）→ 产物归档 + 发布记录；小程序上传用 miniprogram-ci 回传体验版二维码；V1 不含 APP 打包上架 |
| K12 | V1 组件范围 | 能力矩阵 §4.2 基础上，按 K8/K9/K10 扩入 page-table、fcTable、tableForm、chart 族；仍排除：tree/tree-table、iframe、Excel（web-only） |

## Open Questions

<!-- Any remaining questions to resolve -->

1. uni-table 版本选型与固定列/横向滚动在小程序真机的表现实测。
2. lime-echart 按需注册与分包落点（图表页进 subpackage 的切分规则）。
3. rpx 换算基准约定：设计器 375 画布 ↔ 小程序 750 设计稿的映射规则。
4. wx.login 会话与现有 token 体系衔接：`WechatMiniprogramClient` 从单 appId Bean 改为按 Client 配置多实例的具体方式。
5. 布局级即时预览的实现边界：宿主组件模拟下哪些视觉差异可接受、哪些必须走产物预览。
6. 触底分页与现有 `pageSize/pageSizes` 语义的映射（uni 侧 load-more 与 Web 分页条的口径差异）。
