# client-targeted-publishing Specification

## Purpose
TBD - created by archiving change multi-client-support. Update Purpose after archive.
## Requirements
### Requirement: 发布选择目标端
页面/表单发布对话框（A5）SHALL 提供"目标端"多选（列表显示各端及其已开通渠道），仅已启用客户端可选；发布 MUST 将结果写入资产-端关系（实现形态：`wf_page_def.target_clients` 升序 CSV 列，NULL=存量缺省仅 portal，逻辑外键不建关系表——见 V77 注记与 design.md Decision-Update），同一资产可发布到多端且仅一份 schema。

#### Scenario: 发布到两端
- **WHEN** 「订单列表」v4 发布时勾选平台端与司机端
- **THEN** `target_clients` 同时包含两端 id，两端各按其形态渲染同一份 schema 资产

#### Scenario: 停用端不可选
- **WHEN** 某客户端处于停用状态
- **THEN** 发布对话框中该端禁用，不能作为新发布目标

### Requirement: (client, page) 双重闸访问校验
`PageAccessGuard` SHALL 升级为按 (client, page) 粒度校验：请求端不在该页面发布范围内 MUST 拒绝（403）；端菜单树（A3）挂接候选 MUST 仅列出"已发布到该端"的资产——发布范围 × 挂接两道闸缺一不可。

#### Scenario: 未发布即不可达
- **WHEN** 页面已挂接司机端菜单树但发布范围未勾选司机端，司机请求该页面数据
- **THEN** PageAccessGuard 按 (driver, pageKey) 拒绝访问

#### Scenario: 挂接候选受发布范围约束
- **WHEN** 建造者在司机端树中挑选要挂接的页面资产
- **THEN** 候选列表仅含已发布到司机端的页面

### Requirement: 无移动等价时拦截发布
资产 schema 含无移动端等价的组件（如富文本编辑、复杂透视表）且目标端为移动端时，发布 MUST 拦截并明确标记"该端不支持"，MUST NOT 静默降级成残缺渲染。

#### Scenario: 富文本页发布到移动端被拦
- **WHEN** 含富文本编辑组件的表单页尝试发布到司机端（H5/APP/小程序）
- **THEN** 对话框提示不支持组件清单并阻止勾选该端；去掉组件后可正常发布

### Requirement: 按渠道出制品
发布管线 SHALL 按目标端已开通渠道产出制品：H5 直发（`/m/` 产物即时生效）；小程序编译出包并引导上传审核（运行时壳版本随发布管线管理）；APP 生成/关联壳制品与版本信息（配合最低版本/强制更新策略）。渠道未开通 MUST NOT 产生对应制品。

#### Scenario: 一次发布三渠道各出物
- **WHEN** 资产发布到司机端（已开通 H5+APP+小程序）
- **THEN** H5 立即可访问，小程序生成待审核包任务，APP 端按版本策略热更/提示升级

### Requirement: 端能力提示与降级标记
发布对话框 SHALL 对移动端目标提示渲染降级方式（如"桌面表格将按卡片列表渲染"），降级由渠道模板映射决定并在此透明展示，MUST NOT 要求作者复制资产适配。

#### Scenario: 降级提示
- **WHEN** 含桌面表格的页面勾选司机端发布
- **THEN** 对话框显示移动模板降级说明（卡片列表 + 槽位映射），作者确认后发布

