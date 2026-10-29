# Spec Delta — multi-client-rendering

## ADDED Requirements

### Requirement: 单一逻辑 schema 与语义/表现分界
页面/表单资产 SHALL 保持单一逻辑 schema（字段、动作、校验等语义信息）；桌面表现细节（列宽、栅格 span、弹窗尺寸）MUST 迁至渠道 profile/端覆盖层，且 MUST NOT 影响移动端渲染结果。存量 schema 的表现字段迁移前 SHALL 完成逐组件"语义 vs 表现"审计。

#### Scenario: 列宽不泄漏到移动端
- **WHEN** 一个 VIEW 页面配置了桌面列宽并渲染到移动端
- **THEN** 移动卡片布局不受列宽影响，仅按语义列与槽位覆盖生成

### Requirement: 按渠道模板映射
渲染器 SHALL 维护"语义类型 → 渠道组件模板"的映射表，由平台单点维护且为**双单点**：设计时预览=EP→Vant（`channelTemplates`/`fieldTemplates`，批 A 交付），交付产物=EP→uni-app Vue3 内置组件（分端出码契约表，批 E=multi-client-uniapp-codegen）；同一 schema 在不同渠道由各自模板集渲染。

#### Scenario: 表格降级卡片列表
- **WHEN** 含分页表格与顶部筛选的 VIEW 页面在移动端渲染
- **THEN** 呈现卡片列表 + 下拉刷新/滚动加载 + 搜索条/筛选抽屉，而非横向溢出表格

#### Scenario: 表单控件映射
- **WHEN** 含 select/radio/date-picker/upload 的表单在移动端渲染
- **THEN** 分别以 picker、选项直出、滚轮/日历弹层、uploader（唤相机/相册）呈现

### Requirement: 端覆盖层（布局配置级）
schema SHALL 支持按渠道存储的端覆盖层，移动端仅允许三类配置：列→卡片槽位（标题/副标题/角标/键值区/主操作）、字段显隐、排序；未配置时 MUST 使用缺省自动映射。设计器 SHALL 提供 [桌面]/[移动] 预览切换，移动预览由设计器内置 **Vant 可编辑渲染器**在 iframe 手机框内呈现——预览≠产物（产物经分端 uni-app 出码生成，两者渲染漂移属明示接受的裁定项，见架构文档 2026-10-27 §5/2026-10-26 用户复核 `80c8f8d8`）。

#### Scenario: 缺省自动映射
- **WHEN** 页面未配置任何移动覆盖层即发布到移动端
- **THEN** 首列自动作卡片标题、其余字段进键值区，页面可正常渲染操作

#### Scenario: 槽位覆盖生效
- **WHEN** 设计者在移动 Tab 将"金额"列映射为主操作槽位并保存
- **THEN** 卡片按覆盖层渲染，桌面端呈现不受该覆盖影响

### Requirement: 交互骨架归渲染器框架
弹窗→全屏页/半屏抽屉、工具栏→底部动作栏等交互骨架转换 SHALL 由渲染器框架模板处理，MUST NOT 作为可配置项进入 schema。

#### Scenario: 详情弹窗变全屏页
- **WHEN** 桌面端以弹窗展示的行详情在移动端点开
- **THEN** 移动端以全屏详情页呈现同一数据，骨架无需资产作者配置

### Requirement: 移动端运行态工作台
移动端客户端运行态 SHALL 提供工作台（B1）：顶栏（端名 + 消息角标）、数据卡片区、宫格区（对应端树"工作台功能"节点）、底部 Tab（对应端树"底部Tab区"节点，2~5 项）；Tab 页主体复用 `/page/:pageKey` 渲染管线按渠道选模板集。（verify 校准：本需求整体 **Deferred→批 E**——实现形态改为分端出码产物承载，归 multi-client-uniapp-codegen）

#### Scenario: 司机端 H5 端到端
- **WHEN** 司机经 `/m/driver` 登录进入工作台，点宫格"钱包"打开页面并切到"订单"Tab
- **THEN** 各页面按移动模板集渲染且权限判定走该端菜单与角色

### Requirement: 同源部署与端隔离存储
H5 渲染产物 SHALL 以 `/m/` 路径与管理端（`/`）、后端（`/api`）同源部署于单一 Web 服务器；`/m/*` MUST 配置 SPA history fallback；管理端预览运行设计器内置 Vant 渲染器，与 `/m/` 生产产物为两套（**预览≠产物**，漂移为裁定接受项，终效以出码产物为准）；多端 localStorage 键与登录态 MUST 按客户端命名空间隔离，同浏览器先后登录两端不串态。（verify 校准：本需求随 `/m/` 出码交付 **Deferred→批 E**）

#### Scenario: 预览为近似参考产物为准
- **WHEN** 设计器移动预览 iframe 与真实用户访问 `/m/driver`（批 E 交付后）打开同一 schema 页面
- **THEN** 预览呈现设计时近似效果供编排参考；最终效果以分端出码的 H5 产物为准，两者为不同渲染器（Vant 预览 / uni-app 产物）

#### Scenario: 端间存储不串
- **WHEN** 同一浏览器在平台端登录后又登录司机端 H5
- **THEN** 两端会话与本地缓存互不覆盖，退出其一不影响另一端的登录态
