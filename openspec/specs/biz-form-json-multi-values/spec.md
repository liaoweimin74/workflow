# biz-form-json-multi-values Specification

## Purpose
TBD - created by archiving change support-more-form-components. Update Purpose after archive.
## Requirements
### Requirement: 多值组件 JSON 列映射

系统 SHALL 将以下多值组件映射为 JSON 列类型：

| 组件 type | 列类型 |
|---|---|
| `checkbox` | JSON |
| `multiSelect` | JSON |
| `multiSelectPro` | JSON |
| `tree`（多选） | JSON |
| `elTreeSelect`（多选） | JSON |
| `elTransfer` | JSON |

原有 checkbox/multiSelect 映射为 TEXT（逗号拼接）的规则 SHALL 移除。

#### Scenario: checkbox 映射为 JSON 列
- **WHEN** 业务表单 schema 含 `{ type: 'checkbox', field: 'tags' }`
- **THEN** 列映射草案生成 `{ key: 'tags', columnType: 'JSON' }`

#### Scenario: multiSelect 映射为 JSON 列
- **WHEN** 业务表单 schema 含 `{ type: 'multiSelect', field: 'multi' }`
- **THEN** 列映射草案生成 `{ key: 'multi', columnType: 'JSON' }`

### Requirement: JSON 值序列化写入

业务数据新增/更新时，多值 JSON 列的值 SHALL 序列化为 JSON 字符串写入物理表。

值 SHALL 为数组；非数组值（如旧逗号串）SHALL 按原值写入（容错，不做迁移转换）。

#### Scenario: checkbox 值写入
- **WHEN** 用户提交 checkbox 字段值为 `["a","b"]`
- **THEN** 物理表 tags 列写入 JSON 字符串 `["a","b"]`

#### Scenario: 旧逗号串值写入容错
- **WHEN** 提交的 checkbox 字段值为 `"a,b"`（旧格式字符串）
- **THEN** 物理表 tags 列按原字符串 `"a,b"` 写入

### Requirement: JSON 值反序列化读取

业务数据查询返回时，多值 JSON 列的值 SHALL 反序列化为 JSON 数组返回前端。

反序列化失败（非 JSON 数据）时 SHALL 原样返回字符串，不抛错。

#### Scenario: checkbox 值读取
- **WHEN** 查询业务数据且 tags 列为 `["a","b"]`
- **THEN** 返回前端的 tags 字段为数组 `["a","b"]`

#### Scenario: 非 JSON 数据读取容错
- **WHEN** tags 列存有 `a,b`（非 JSON 旧数据）
- **THEN** 返回前端的 tags 字段原样为字符串 `a,b`
- **AND** 不抛异常

