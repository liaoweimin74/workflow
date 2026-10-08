# internal-datasource-router Specification

## Purpose
TBD - created by archiving change datasource-single-http-adapter. Update Purpose after archive.
## Requirements
### Requirement: internal:// URL 派发
系统 SHALL 注册 `InternalDataSourceRouter`，把 `internal://` scheme 的请求派发到本进程的 controller bean 方法（直接方法调用，绕过 socket）。派发 SHALL 仅允许 allowlist 的 sourceKey→方法映射；未注册路径 SHALL 返回 400。
租户上下文 SHALL 通过 `TenantProvider` 透传。

#### Scenario: 解析 FORM 数据源的 internal:// 地址
- **WHEN** type=FORM、formKey="product" 的数据源 query 请求到达
- **THEN** router 将 `internal:///api/v1/biz-data/product` 映射到 BizDataController.query(formKey="product")
- **AND** 返回 BizDataPageVO（records/total/page/size）

#### Scenario: 拒绝未注册的 internal:// 路径
- **WHEN** UnifiedDataSourceAdapter 收到 `internal:///api/v1/unknown/xyz`
- **THEN** router 返回 400（internal route not found）
- **AND** 不向外部发起请求

### Requirement: internal:// 响应归一
`internal://` 派发的响应 SHALL 被 `UnifiedDataSourceAdapter` 按 `parse`/`totalParse` 规则归一为 `BizDataPageVO` / `BizDataVO`，与外部 HTTP 响应处理一致。

#### Scenario: 统一 parse 抽取
- **WHEN** SYSTEM dept-tree 接口返回扁平行 JSON 数组
- **THEN** adapter 按配置的 parse 规则提取 records
- **AND** 返回统一 BizDataPageVO

