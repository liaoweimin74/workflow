# backend-logic-http Specification

## ADDED Requirements

### Requirement: 外部 API HTTP 调用

系统 SHALL 支持「调用外部 API」类型后端逻辑，在运行时通过 HTTP 请求调用外部系统接口。系统 SHALL 使用 Spring `RestClient` 发起请求，支持 GET / POST / PUT / DELETE 四种方法。逻辑配置 SHALL 包含：请求 URL、请求方法、请求头、查询参数、请求体字段与流程变量的映射、连接超时、读取超时、重试次数。

#### Scenario: 执行 POST 请求

- **WHEN** 一条 HTTP 逻辑配置为 POST 方法并指定了 URL 与请求体映射
- **THEN** 运行时系统向目标 URL 发起 POST 请求
- **AND** 请求体包含按映射填充的流程变量值

#### Scenario: 执行 GET 请求

- **WHEN** 一条 HTTP 逻辑配置为 GET 方法并指定了查询参数映射
- **THEN** 运行时系统发起 GET 请求
- **AND** query string 包含映射的流程变量值

### Requirement: 鉴权请求头与变量占位符

HTTP 逻辑的请求头 SHALL 由设计器逐逻辑独立配置（headers 键值对）。请求头的值 SHALL 支持 `{{ varName }}` 占位符语法，运行时用相应的流程变量值替换。

#### Scenario: 配置鉴权头

- **WHEN** 用户在逻辑 headers 中配置 `Authorization` 值为 `Bearer {{token}}`
- **AND** 当前流程变量中存在 `token`
- **THEN** 运行时发送请求时请求头 Authorization 使用替换后的 token 值

#### Scenario: 占位符无对应变量

- **WHEN** 请求头中的 `{{ varName }}` 占位符在流程变量中不存在
- **THEN** 系统将占位符替换为空字符串，并按异常策略处理

### Requirement: 超时与重试

HTTP 逻辑 SHALL 支持配置连接超时（默认 3000ms）、读取超时（默认 5000ms）与重试次数（默认 0）。重试 SHALL 在网络错误时按固定等待间隔重试。

#### Scenario: 配置超时

- **WHEN** 用户在逻辑中设置了连接超时 2000ms、读取超时 4000ms
- **THEN** 运行时 HTTP 客户端采用上述超时配置发起请求

#### Scenario: 失败重试

- **WHEN** 一条 HTTP 请求失败且配置了重试次数为 2
- **THEN** 系统按固定间隔重试至多 2 次
- **AND** 超过重试次数后按异常处理策略处理

### Requirement: 请求参数引用流程变量

HTTP 逻辑的请求参数 SHALL 支持引用流程变量，包含三种映射形式：查询参数（queryParams）、请求体字段（bodyParams）、请求头（headers）。每种形式 SHALL 通过流程变量到目标字段的映射配置实现。

#### Scenario: 请求体字段映射

- **WHEN** 用户配置 bodyParams 将流程变量 `applyMoney` 映射为请求体字段 `amount`
- **THEN** 运行时请求体 JSON 中包含 `amount` 字段并取流程变量 `applyMoney` 的值

#### Scenario: 查询参数映射

- **WHEN** 用户配置 queryParams 将流程变量 `status` 映射为查询参数 `status`
- **THEN** 运行时请求 URL 的 query string 包含 `status` 参数并取自流程变量值