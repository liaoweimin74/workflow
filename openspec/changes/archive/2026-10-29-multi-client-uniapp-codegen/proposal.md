# Proposal — multi-client-uniapp-codegen

## Why

平台目前只能设计 Web 端页面：`wf_page_def` 按租户扁平存放（无应用/端维度），动态渲染与出码（P2）均只面向 Web/Element Plus。业务需要同一平台产出微信小程序、H5、APP 多端应用，且每种端可有多个应用（商户端、买家端仅为举例），各应用共享租户数据。微信小程序禁 eval 使移动端只能走出码路线，而现有 IR/emit 骨架与脚本编译机制已为第二目标预留，此时扩展成本最低。

## What Changes

**应用与客户端建模**
- From: 页面按租户扁平存放（tenant_id + key + version），无应用概念
- To: 新增 App（受众产品）/ Client（渠道构建实例）两层；页面归属 App、按 Client 分配启用；页面唯一键加 app 维度；存量页面迁移进每租户「默认应用」
- Reason: 支撑「每种客户端多个应用」与「同一应用多端」并存，且数据边界保持在租户层共享
- Impact: 非破坏升级，存量用户零感知；后端表结构 + API + 设计器上下文

**页面设计器端维度**
- From: 单一 Web 画布，组件面板全量可用；页面无类型概念
- To: 页面携带设计类型（web | uniapp，创建时确定、不可变更）；同一渲染机按类型解析组件注册表（web→宿主 el-* 包，uniapp→@lc/ui-mobile uni-ui 契约对齐包）+ 设备框画布（桌面 / 375 手机壳）+ 三区能力矩阵过滤（Web 专属/双端共享/移动专属）；页面分配校验设计类型与 Client 端类型兼容
- Reason: 移动端页面必须在同一设计器、同一 schema 格式下设计且所见即所得（反目标：第二套设计器/schema）；小程序/H5/APP 是交付层概念，设计期收敛为「移动」一种画布
- Impact: 设计器 UI 与保存/发布链路改造；新增 @lc/ui-mobile 组件包；schema 格式不变

**移动端出码**
- From: 出码仅 web 单目标（Element Plus 产物）
- To: 新增 uniapp 目标：`emitUniApp(IR, TargetProfile)` + `@lc/runtime-uni` 仓库内包；page-table 出 uni-table 简表、fcTable 纵向堆叠降级、tableForm 卡片式子列表编辑器、图表族接 Uni ECharts（经用户逐项拍板）
- Reason: 小程序禁 `new Function`，出码是唯一可行路线；动作脚本已在生成期编译为普通函数，天然兼容
- Impact: codegen 模块扩展（第二 emit 后端）+ 新增移动侧运行时包；Web 目标产物字节不变（golden 守住）

**预览与发布**
- From: 无移动端预览能力；发布只有页面级 status/published_version
- To: 设计器契约渲染画布所见即所得（@lc/ui-mobile，免构建）+ 产物级预览（uni-app H5 iframe / 小程序预览二维码，发布前核对）；页面发布 → AppRelease 快照 → 按 Client 构建（mp-weixin / H5）→ 产物归档 + miniprogram-ci 体验版上传
- Reason: 补齐「设计→预览→交付」移动端闭环，匹配「每次改动重新生成+重新发布」的既定模型
- Impact: 设计器预览入口、构建链路（uni build）、后端发布接口

## Capabilities

### New Capabilities

- `app-client-model`: 应用（App）/ 客户端实例（Client）/ 页面分配 / 发布快照的数据模型与 API，含 `wf_page_def` 应用维度扩展与存量迁移
- `uniapp-codegen-target`: uni-app 出码目标——TargetProfile、组件映射、产物工程（pages.json/manifest/页面 SFC）与 `@lc/runtime-uni`
- `mobile-preview`: 产物级预览——uni-app H5 iframe 与小程序预览二维码（发布前核对）；日常所见即所得由设计器契约渲染画布承担（归 custom-page-designer）
- `app-release-pipeline`: 按 Client 的构建发布链路——AppRelease 快照、uni 构建、产物归档、体验版上传

### Modified Capabilities

- `custom-page-designer`: 页面归属应用（key 唯一性加 app 维度）；设计器增加页面设计类型（web/uniapp，创建时定不可改）——契约渲染画布、设备框、三区能力过滤；页面保存/发布携带应用上下文

## Impact

- **后端**：新迁移（4 张表 + `wf_page_def` 加列 + 默认应用回填）；App/Client/Release API；`WechatMiniprogramClient` 从单 appId Bean 改为按 Client 配置多实例
- **前端**：设计器（PageDesigner / PageList / PageRendererPage 的应用与端上下文）；codegen 模块新增 emit 后端与 per-target 报告；新增 `@lc/runtime-uni` 包
- **构建链路**：uni-app 工程生成、`uni build`（mp-weixin / H5）、miniprogram-ci 依赖
- **不受影响**：Web 动态渲染主链路、现有出码 web 目标产物、租户隔离与行级权限体系
