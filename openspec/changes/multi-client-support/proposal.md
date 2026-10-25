# Proposal — 多端客户端支持（Client × Channel）

## Why

平台现状是单端假设：全局一棵菜单树、运行态只有 PC Web 管理端、页面 schema 由 Element Plus 桌面组件渲染。而业务系统（网约车等）需要"一套业务模型、多客户端、多渠道"交付——平台端/司机端/乘客端只是举例，端集合开放。按现架构，每新增一个端都要改平台代码，多端只能靠特例（V64 小程序）逐个打补丁。本变更把客户端与渠道固化为数据模型，菜单/角色/脱敏加端维度，建立桌面 EP / 移动 uni 双渲染器与按渠道发布管线，使"新增端 = 配置 + 发布动作"成为平台一等内容。

## What Changes

- **新增** `sys_client` / `sys_client_channel` 数据模型与客户端管理页（A1 列表 / A2 设置抽屉：渠道开通、登录方式、初始授权），归入开发管理（V66 口径）
- **修改** 菜单可见性：从"全局一棵 `sys_menu` 树"到"每端一棵树（`client_id` 作用域），存量 100% 回填默认平台客户端"；菜单管理页（A3）加端作用域 Tab；形态按渠道约束——WEB 三层树现状，移动端 = 底部 Tab(2~5) + 工作台宫格
- **修改** 角色边界：从"角色全端通用"到"每角色恰好挂一端（`sys_role.client_id`）"，登录链路校验请求端与角色所属端一致；跨端人员每端各授
- **新增** 字段级数据范围：数据范围 grant 在行之上增加字段策略（可见/脱敏[内置规则]/隐藏），服务端序列化层生效，封堵详情/导出/开放 API
- **修改** 发布动作：从"页面发布即可见"到"发布勾选目标端（A5）+ `PageAccessGuard` 按 (client, page) 校验"；无移动等价组件拦截发布
- **新增** 登录泛化：V64 openid 绑定抽为通用端身份（`sys_user_openid`/`sys_user_device` 端维度），token 携带 client/channel 上下文；用户详情加端身份 Tab（A4）
- **新增** 多端渲染：单一逻辑 schema + 渠道模板映射 + 端覆盖层（列→卡片槽位/字段显隐/排序）；移动渲染器 = uni-app Vue3 内置组件；设计器加 [桌面]/[移动] 预览切换；P0 先做存量 schema 语义/表现审计 spike
- **新增** 按渠道交付：H5 直发（同源 `/m/` 部署）、APP 原生壳 + JSBridge（推送/定位/相机/支付）、小程序运行时壳（uni-app Vue3 schema 解释器）；发布管线按端出制品
- **不变**：前端路由静态注册、存量 path/权限码/授权、出码线（CodegenLab 独立用途）、消息通知通道 `ChannelType`

## Capabilities

### New Capabilities

- `client-channel-model`: 客户端与渠道的数据建模及管理界面（sys_client / sys_client_channel、A1/A2、开发管理归位）〔P0〕
- `client-scoped-menu`: 菜单按端分树与形态约束（client_id 作用域、A3 端 Tab、WEB 三层 / 移动端 Tab+宫格、存量回填）〔P0〕
- `client-scoped-role`: 角色挂端强隔离与授权联动（sys_role.client_id、端一致校验、角色页所属端、注册默认角色限本端）〔P0〕
- `data-field-masking`: 数据范围字段策略与内置脱敏规则（可见/脱敏/隐藏，服务端序列化层生效）〔P1〕
- `client-login-identity`: 多端登录方式泛化与端身份绑定（V64 通用化、token 端上下文、A4、绑定码）〔P1〕
- `multi-client-rendering`: 单一 schema 的按端渲染（语义/覆盖层/骨架三层分界、EP+uni 双渲染器、B1 移动端工作台、/m/ 同源部署与预览）〔P1〕
- `client-targeted-publishing`: 资产发布的目标端选择与 (client, page) 访问闸（A5、page_client_target、无等价组件拦截）〔P1〕
- `app-native-shell`: APP 原生壳与 JSBridge 集成（WebView 复用 H5 渲染器、推送/定位/相机/支付、版本与强制更新）〔P2〕
- `miniprogram-runtime-shell`: 小程序运行时壳（uni-app Vue3 schema 解释器、Tab 容器 + 通用页容器、审核出包约束）〔P2〕

### Modified Capabilities

（无——`openspec/specs/` 当前为空，无既有 spec 能力；本变更新确立的行为基线全部按新能力建档）

## Impact

- **后端**：新建 sys_client / sys_client_channel / page_client_target 及 Flyway 迁移（含 sys_menu.client_id、sys_role.client_id 加列回填）；auth 过滤器链（端上下文解析与校验）、PageAccessGuard、数据范围 grant 字段策略 + 序列化脱敏点、openid/device 泛化、发布接口（目标端）
- **前端（管理端）**：开发管理新页 A1/A2；A3/A4/A5 现有页增强；设计器 [桌面]/[移动] 预览与覆盖层编辑；组件映射表两列（EP/uni）
- **新增运行时**：uni-app Vue3 工程（移动渲染器 + H5 产物 `/m/` + 小程序壳共用）；APP 原生壳工程（P2）
- **部署**：单服务器同源 `/` + `/m/` + `/api`，nginx SPA fallback、localStorage 端命名空间
- **不受影响**：router 静态注册、既有 path/权限码/角色授权数据、出码线、消息渠道
