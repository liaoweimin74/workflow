# data-field-masking Specification

## Purpose
TBD - created by archiving change multi-client-support. Update Purpose after archive.
## Requirements
### Requirement: 数据范围 grant 字段策略
数据范围 v3 的 grant（权限对象 × 主体）SHALL 在行范围之上增加**字段策略**：受控数据源的列 → 可见 / 脱敏（引用规则）/ 隐藏；未配置字段 MUST 跟随权限对象基线（默认可见）。实现"行可见但列收紧"。

#### Scenario: 乘客看司机字段收紧
- **WHEN** 给乘客主体对「司机信息」数据源的 grant 配置 phone→掩码、plate→部分掩码、GPS→泛化 500m
- **THEN** 乘客可见司机行记录，但三个字段按策略值返回

#### Scenario: 基线缺省
- **WHEN** 某 grant 未配置任何字段策略
- **THEN** 该主体看到的列与现状（纯行范围）完全一致

### Requirement: 内置脱敏规则集
脱敏 MUST 使用平台内置规则集（手机号、姓名、身份证号、车牌、地理泛化等）；规则集 MUST NOT 进入 sys_dict、MUST NOT 开放自定义规则配置，以防配置面成为泄漏面。

#### Scenario: 规则选择受限
- **WHEN** 配置字段脱敏策略
- **THEN** 可选规则仅为内置规则枚举，无自由表达式/模板输入口

### Requirement: 服务端序列化层生效
字段策略 SHALL 在服务端序列化层（查询结果 → 渲染 API / 数据 API / 导出 / 开放 API 出口前）统一应用；MUST NOT 依赖 SQL 列裁剪或前端脱敏。同一主体经任一出路读取同一行，脱敏结果 MUST 一致。

#### Scenario: 详情接口封堵
- **WHEN** 受限主体调用含脱敏字段的详情接口
- **THEN** 响应体中该字段已是策略值（掩码/泛化），非原值

#### Scenario: 导出同点生效
- **WHEN** 同一主体对同一数据源发起导出
- **THEN** 导出文件中该字段与详情接口返回同样的策略值

#### Scenario: 开放 API 封堵
- **WHEN** 经开放 API 查询受字段策略约束的数据
- **THEN** 序列化层同样应用策略，开放出口不构成旁路

### Requirement: 行不可见则字段不适用
字段策略 SHALL 从属于行范围判定：行被数据范围过滤不可见时，字段策略不参与结果；行可见时字段策略 MUST 再叠加列级收紧。

#### Scenario: 先过滤行再收紧列
- **WHEN** 乘客仅能看到"承运过自己订单"的司机行，且 phone 配了掩码
- **THEN** 可见行内 phone 为掩码值，不可见行不出现在任何结果集

### Requirement: 字段策略维护入口
数据权限管理页 SHALL 提供 grant 字段策略的维护界面（按受控数据源列出字段 → 三态选择 + 规则引用），配置变更 MUST 走权限码管控并留操作审计。

#### Scenario: 配置即生效
- **WHEN** 管理员保存某 grant 的字段策略
- **THEN** 后续该主体的读取立即按新策略返回，无需重启或发布

