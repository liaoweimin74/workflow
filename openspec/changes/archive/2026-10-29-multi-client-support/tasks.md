# Tasks — 多端客户端支持（Client × Channel）

> 按依赖排序：P0（建模/端树/角色挂端/spike）→ P1（H5 端到端/脱敏/登录泛化/发布选端）→ P2（APP 壳/小程序壳/按端出制品）。
> 各组标注对应 spec capability；验收判据来自 design.md《Migration Plan》。
> **verify 校准（2026-10-29）**：对照 verify.md C1——11 笔追记（证据随附）；8 笔逐项标 **Deferred**（裁定后置，归批 E 出码 change=multi-client-uniapp-codegen 或 P2 后续）；P2 两组（9.x/10.x/11.x）为计划内整体后置。

## 1. P0 数据建模与迁移（client-channel-model）

- [x] 1.1 Flyway：建 `sys_client`（name/code/icon/status，code 唯一）+ 默认平台客户端 `portal` seed；建 `sys_client_channel`（channel_type/开通开关/参数 JSON，secret 列加密存储）
- [x] 1.2 后端：Client/ClientChannel 实体 + Mapper + CRUD API（`/api/clients`，权限码 `system:client:*`）；编码唯一冲突与停用状态接口
- [ ] 1.3 后端：渠道参数校验（小程序 appid/secret 必填）+ 回显脱敏 + 连通测试端点；客户端配置缓存与失效（校验/脱敏保留/连通测试已实现——`ClientServiceImpl` MP 必填 + secret 掩码 + `ClientController` 连通测试端点；**遗留=配置缓存与失效，Deferred**）
- [x] 1.4 前端：A1 客户端管理列表页（`/system/client`）挂开发管理目录，含"☰菜单"跳转；路由静态注册 + 菜单/权限码接线
- [x] 1.5 前端：A2 客户端设置抽屉（渠道开通/登录方式/初始授权三 Tab，"保存并生效"）
- [x] 1.6 Flyway：`sys_menu.client_id` 加列 + 全量回填 portal + 索引；回填核对查询（无空值行）入迁移测试
- [x] 1.7 Flyway：`sys_role.client_id` 加列 NOT NULL + 回填 portal + 索引；存量行为回归用例（path/权限码/授权零变化）

## 2. P0 菜单按端分树（client-scoped-menu）

- [x] 2.1 后端：菜单查询/创建/编辑/移动 API 增加 clientId 作用域（请求缺省 = portal 兼容），跨端节点不可见
- [x] 2.2 后端：端形态校验器——WEB 三层现状规则；移动端底部 Tab 2~5 个一级节点、工作台 ≤2 层；拖拽/保存落点服务端拒绝
- [x] 2.3 前端：A3 菜单管理页顶部端切换 Tab（按 client_id 重拉树）+ "去新建端"入口
- [x] 2.4 前端：A3 移动端形态的"底部Tab区/工作台功能"分区带拖拽交互（复用现有拖拽 + `PUT /api/menus/{id}/move`）
- [x] 2.5 端菜单空态：运行态空工作台/空侧边栏呈现；空菜单不放行任何页面 API 的用例（安全闸闭环 `dcefe462`：roles 按端过滤封 admin 跨端绕过 + `LoginUserServiceClientScopeTest` + PageAccessGuard 空菜单用例；空态呈现 WEB=自然空侧边栏，移动端空工作台归 B1=Deferred）

## 3. P0 角色挂端（client-scoped-role）

- [x] 3.1 后端：角色创建/编辑挂端（缺省当前端）；角色列表"所属端"列与筛选 API
- [x] 3.2 后端：认证/授权链路解析请求端上下文并校验角色所属端一致——不一致 = 该端无角色（空菜单 + 403），越权回归用例
- [x] 3.3 后端：A2"注册默认角色"仅可引用本端角色（服务端校验 + 下拉数据接口按端过滤）
- [x] 3.4 前端：角色管理页所属端列/筛选/表单；确认权限码不加端前缀、端内授权语义不变的测试集

## 4. P0 schema 审计 spike（design D11，铺 P1）

- [x] 4.1 逐组件清点存量 VIEW 配置 / form-create rule：语义字段（字段/动作/校验）vs 表现字段（列宽/栅格 span/弹窗尺寸）分类台账
- [x] 4.2 输出表现字段 → 渠道 profile 层的迁移方案（回填 design.md Open Question 4）
- [x] 4.3 定义 schema 校验器对表现字段的拦截/迁移动作清单（供 7.6 执行）
- [x] 4.4 P0 端到端验收脚本：新建端→配渠道→授本端角色→配端菜单→端内可见，全程零平台代码变更

## 5. P1 登录泛化与端身份（client-login-identity）

- [x] 5.1 Flyway：`sys_user_openid` 加 client 维度（唯一键改 openid+client）、新表 `sys_user_device`（Java 线 J3·V75，探针库实测跨端隔离）
- [x] 5.2 后端：登录方式配置模型（端×渠道→方式集合）；登录 API 校验方式开通，未开通拒绝（Java 线 J3：config.loginMethods + assertMethodEnabled）
- [ ] 5.3 后端：token 签发携带 client/channel 声明；解析链（过滤器/菜单/守卫/数据范围主体）按声明建端上下文；历史 token 缺省 portal 的兼容与收紧开关（Java 线 J4 已完成：双 claim 签发/读取缺省 portal·WEB、过滤器端上下文、菜单树/权限集合/PageAccessGuard 按端；**遗留=数据范围主体端化（裁定⑧延后）与收紧开关，Deferred**）
- [x] 5.4 后端：绑定码流程通用化（V64 抽取）：管理端生成→端内首登输入→openid/设备绑定；静默登录按 (client, openid)（Java 线 J3：issue/consume/clientLogin 静默；设备注册落 sys_user_device 本体链=9.4）
- [x] 5.5 前端：A4 用户详情"端身份"Tab（openid/设备/登录记录列表，解绑/吊销/生成绑定码，`system:user:*` 管控）（Java 线 J5a+J5b：形态=行操作抽屉（UserPage 无详情容器，仿 A2 先例）；V76 四按钮权限码；**登录记录数据源不在 J 系列=H5 登录记录表 P2 记账**）

## 6. P1 数据范围字段策略（data-field-masking）

- [x] 6.1 Flyway + 后端：grant 字段策略（列→可见/脱敏[规则引用]/隐藏），缺省跟权限对象基线；策略维护 API + 权限码 + 审计（`a518f696`：V78 基线/覆写双列 + FieldPolicyService 维护链 + 权限码；**遗留=操作审计落点，随批 E 小补**）
- [x] 6.2 后端：内置脱敏规则集（手机号/姓名/身份证/车牌/地理泛化 500m），封闭枚举不可自定义；规则单测（MaskRule 封闭枚举 + MaskRuleTest）
- [x] 6.3 后端：序列化层统一应用点——渲染/数据/导出/开放 API 出口前生效；行过滤与列收紧叠加语义用例（DataSourceDefinitionService 查询/详情/更新、BizDataScopeGuard 页/行、BizDataSupport resolve 文本封口；叠加用例在 FieldPolicyServiceTest/BizDataScopeGuardTest）
- [ ] 6.4 前端：数据权限管理页 grant 字段策略维护 UI（受控数据源字段列表三态 + 规则下拉）（后端 API/DTO 全通，FE 维护 UI 未建——**Deferred**）
- [x] 6.5 泄漏路径回归测试：详情/导出/开放 API 三出口同主体同策略值一致（BizDataControllerTest + PageDataExcelControllerTest + DataSourceDefinitionServiceTest 三出口断言）

## 7. P1 多端渲染（multi-client-rendering）

- [ ] 7.1 工程：uni-app Vue3 移动渲染器项目初始化（uni 内置组件模板集 + schema 解释器核心 + `dev:h5` 构建）（**Deferred→批 E**：架构裁定改为分端 uni-app **出码**工程，归 multi-client-uniapp-codegen）
- [x] 7.2 渲染器：语义类型→渠道模板映射表（EP/uni 两列）单点维护模块；缺项（无移动等价）显式登记（预览口径已交付批 A：`channelTemplates.ts` 块级 + `fieldTemplates.ts` 字段级双单点 + 完备性用例显式登记缺项；EP/uni **出码**列归批 E 契约表——verify 校准见 spec 注记）
- [x] 7.3 后端+设计器：端覆盖层模型（按渠道存：列→卡片槽位/字段显隐/排序），缺省自动映射算法 + 用例（批 C1：schema 内 `channelProfiles` 按渠道存 + 设计器移动卡片配置面板 `MobileCardProfileDialog` + `mobileRuleTransform` 缺省自动映射 + cardSlots 用例；存储形态=schema 内嵌，非独立后端模型）
- [x] 7.4 前端：设计器 [桌面]/[移动] 预览切换——移动预览 iframe 加载 `/m/` 产物 + postMessage schema 同步（批 C2 交付：iframe 手机框 + `mobilePreviewBridge` postMessage 同步；**预览=Vant 渲染器非 `/m/` 产物**——裁定 `80c8f8d8`，形态修正见 spec 注记）
- [ ] 7.5 渲染器：B1 移动端运行态工作台（顶栏端名+消息角标 / 数据卡片区 / 宫格 / 底部 Tab），页面主体复用 `/page/:pageKey` 管线（**Deferred→批 E 后**）
- [ ] 7.6 迁移执行：按 4.2 清单把表现字段迁渠道 profile；schema 校验器拦截新写入表现字段（E-0 已闭环策略表与迁移清单——`channelSchemaPolicy.ts` 三表 + 台账 §6；**新写入拦截接线执行 Deferred→批 E**）
- [ ] 7.7 部署：`/m/` 静态站点接入单服务器 + nginx history fallback；uni H5 路由 base=`/m/`；localStorage 端命名空间 + 登录态端上下文隔离用例（**Deferred→批 E**）

## 8. P1 发布目标端与访问闸（client-targeted-publishing）

- [x] 8.1 Flyway + 后端：`page_client_target` 启用；发布 API 写目标端（仅启用端可选）（`7ba1df62`：V77 `wf_page_def.target_clients` CSV + publish(clientIds) 端校验 + PageDefinitionServiceTargetClientsTest；**存储形态=CSV 列非关系表**——实现决策见 V77 注释与 spec 注记）
- [x] 8.2 后端：`PageAccessGuard` 升级 (client, page) 粒度——先兼容无端声明请求按 portal，7.3/5.3 上线后收紧；403 用例矩阵（guard 发布端闸 publishedToClient + portal 缺省兼容 + PageAccessGuardTest 403 矩阵）
- [x] 8.3 前端：A5 发布对话框目标端多选（含渠道徽标）+ 移动降级提示 + 无等价组件拦截勾选（`21c53bc9`+批 C3：PagePublishDialog 端多选 + 停用端置灰 + 两级拦截清单（块级阻断/字段级降级提示）；渠道徽标展示小遗留）
- [ ] 8.4 前端：A3 端树挂接候选仅列"已发布到该端"资产（发布范围×挂接双闸联动用例）（服务端闸已封，FE 候选未按端过滤——**Deferred**）
- [ ] 8.5 P1 端到端验收：司机端类应用（登录→Tab→表单/列表→审批）H5 全程可用；乘客跨端读司机数据受字段策略约束（依赖批 E 移动运行态——**Deferred**）

## 9. P2 APP 原生壳（app-native-shell）〔Deferred：P2 计划内后置，本变更未交付〕

- [ ] 9.1 工程：原生壳 WebView 容器（加载 `/m/` 产物、登录态/端上下文传递、离线兜底页）
- [ ] 9.2 壳：JSBridge 能力集——推送注册/点击跳转、定位上报、相机/相册、支付；schema 语义动作→桥调用协议 + 端渠道开通校验
- [ ] 9.3 壳：版本策略——启动比对 A2 最低版本/强制更新/下载地址，低版本阻断引导升级（渠道参数 minVersion/forceUpdate/downloadUrl 字段已在 sys_client_channel.config 预留）
- [ ] 9.4 后端：设备注册绑定 `sys_user_device`；推送按 (client, 未吊销设备) 投递；吊销停推链路用例（设备表与吊销 API 本体已由 J3/J5 建，推送投递链归 P2）

## 10. P2 小程序运行时壳（miniprogram-runtime-shell）〔Deferred：P2 计划内后置，本变更未交付〕

- [ ] 10.1 工程：uni-app Vue3 小程序运行时壳（固定 Tab 容器 + 通用页容器 + 按端拉 schema 用 uni 内置组件渲染），改页面免出包用例
- [ ] 10.2 构建：clientKey/appid 注入的一壳多端出包流程（司机端/乘客端独立提审产物）
- [ ] 10.3 登录：小程序 openid 静默登录 + 未绑定引导输入绑定码（复用 5.4 通用流程）（底座 J3 通用链已交付：静默按 (client, openid) + 绑定码；壳侧接入归 P2）
- [ ] 10.4 合规：审核约束验证——schema 无可执行代码、渲染限内置模板集、不支持组件发布拦截在 Web 侧生效（Web 侧拦截清单已由批 C3 建，壳侧验证归 P2）

## 11. P2 发布管线与收尾〔Deferred：P2 计划内后置，本变更未交付〕

- [ ] 11.1 后端：发布管线按渠道出制品——H5 直发即时生效 / 小程序出包任务与审核状态跟踪 / APP 壳版本清单；渠道未开通不出制品
- [ ] 11.2 三渠道端到端回归：同资产三端表现一致（schema 单一事实源）+ P2 交付判据验收（三渠道各自出包/发布）
- [ ] 11.3 文档：`docs/features.md`、`docs/architecture/`、`docs/QUICKSTART.md` 补多端章节；已知问题登记（learnings×2 + 架构文档 + 分拣台账已在 `a88e10cb`/`a3a330a0` 覆盖，features/QUICKSTART 随批 E 后统一补）
