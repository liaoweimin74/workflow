# Spec Delta — client-channel-model

## ADDED Requirements

### Requirement: 客户端数据建模
系统 SHALL 提供 `sys_client` 实体（名称/编码/图标/状态），客户端集合为开放数据而非代码枚举：新增一个客户端 MUST 仅通过配置完成，不改平台代码。客户端编码 MUST 全局唯一。

#### Scenario: 新建客户端零代码
- **WHEN** 建造者在管理端新建"司机端"（编码 driver）并保存
- **THEN** 该端立即作为普通 Client 实例可用（配渠道、挂菜单、发布资产），无需任何部署或代码变更

#### Scenario: 编码重复拒绝
- **WHEN** 创建编码已存在的客户端
- **THEN** 系统拒绝并提示编码冲突

### Requirement: 渠道开通与参数
客户端 SHALL 关联 0~N 个渠道（`sys_client_channel`，类型 WEB/H5/APP/小程序），每个渠道 MUST 有开通开关与渠道参数集（小程序 appid/secret、APP 最低版本/强制更新/下载地址等）；secret 类参数存储与回显 MUST 脱敏。

#### Scenario: 开通多渠道
- **WHEN** 为司机端勾选 H5、APP、小程序三个渠道并填入各自参数
- **THEN** 渠道记录持久化，A1 列表"已开通渠道"列显示三个渠道标识

#### Scenario: 必填参数校验
- **WHEN** 勾选小程序渠道但未填 appid/secret 即保存
- **THEN** 系统阻止保存并提示必填，提供连通测试入口验证凭据有效性

### Requirement: 客户端管理界面归入开发管理
管理端 SHALL 提供客户端管理列表（A1，`/system/client`，权限码 `system:client:list`）与客户端设置抽屉（A2，Tab 分区：渠道开通/登录方式/初始授权，权限码 `system:client:update`）；菜单节点 MUST 挂在"开发管理"目录下，沿用 V66 归位口径。

#### Scenario: 建造者闭环操作
- **WHEN** 建造者在开发管理内新建端 → 配渠道 → 点"☰菜单"跳转菜单管理并自动定位该端
- **THEN** 建端到挂菜单的闭环不离开开发管理目录

#### Scenario: 无权限不可见
- **WHEN** 未被授予 `system:client:list` 的用户登录平台端
- **THEN** 开发管理下不出现"客户端管理"菜单项

### Requirement: 默认平台客户端与零特殊路径
迁移 SHALL 创建默认平台客户端（编码 portal）并作为众多 Client 中的普通实例；平台管理端行为 MUST 不因"平台端"身份存在任何特殊代码路径。

#### Scenario: 升级后行为不变
- **WHEN** 升级迁移完成后平台建造者照常登录
- **THEN** 侧边栏、页面渲染、权限判定与升级前逐项一致

### Requirement: 客户端停用
客户端状态置为停用后，该端的登录入口与运行态访问 SHALL 全部被拒绝（既有 token 按端停用策略失效），管理端配置数据 MUST 保留可恢复启用。

#### Scenario: 停用司机端
- **WHEN** 管理员停用司机端后，司机经 H5 入口访问
- **THEN** 该端所有 API 返回端已停用错误，平台端与其他端不受影响
