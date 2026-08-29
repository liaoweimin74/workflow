# data-source-management Specification (Delta)

## ADDED Requirements

### Requirement: FORM 数据源 metadata 字段排序能力声明

已启用的 FORM 数据源 metadata（`GET /api/v1/data-sources/{id}/metadata`）的每列 SHALL 声明 `sortable` 能力（Boolean），依据绑定表单 column_config 按列类型推导：JSON/TEXT 列、colorPicker 组件列、含子表（subColumns）的列 MUST 标记 `sortable=false`；数值（INTEGER/BIGINT/TINYINT/DECIMAL）、日期（DATE/DATETIME）、短文本/VARCHAR 列 MUST 标记 `sortable=true`。数据源查询接口收到 `sort`/`order` 参数时 SHALL 校验排序字段命中该白名单（非法返回 400）。

#### Scenario: FORM 数据源 metadata 声明可排字段
- **WHEN** 客户端请求已启用 FORM 数据源的 metadata
- **THEN** 数值/日期/短文本列的 `sortable` 为 true
- **AND** JSON/TEXT/colorPicker/子表列的 `sortable` 为 false

#### Scenario: 排序字段不在 column_config 被拒
- **WHEN** 客户端以 FORM 数据源 column_config 之外的字段作为 sort 参数发起查询
- **THEN** 返回 400 错误，提示排序字段不合法
