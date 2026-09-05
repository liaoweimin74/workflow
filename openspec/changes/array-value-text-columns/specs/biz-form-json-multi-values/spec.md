# biz-form-json-multi-values Delta Specification

## MODIFIED Requirements

### Requirement: 数组组件 JSON 列映射

系统 SHALL 将以下数组值组件映射为 JSON 列类型，并生成 `<key>_text` 显示冗余列（见 array-value-label-columns 能力）：

| 组件 type | 列类型 |
|---|---|
| `checkbox` | JSON + `<key>_text` |
| `multiSelect` / `multiSelectPro` | JSON + `<key>_text` |
| `tree`（单选与多选） | JSON + `<key>_text` |
| `elTreeSelect`（单选与多选） | JSON + `<key>_text` |
| `elTransfer` | JSON + `<key>_text` |
| `cascader`（单选与多选） | JSON + `<key>_text` |
| `select`（multiple=true） | JSON + `<key>_text` |

与上一版本相比：映射范围由"多值组件"扩展为"数组值组件"（select 多选、cascader、elTreeSelect 单选、tree 单选也统一 JSON 数组）；每列生成额外 `<key>_text` 显示冗余列（hidden，VARCHAR(255)）；elTreeSelect 单选不再映射为 VARCHAR。

原有 checkbox/multiSelect 映射为 TEXT（逗号拼接）的规则 SHALL 不再适用。

#### Scenario: checkbox 映射为双列
- **WHEN** 业务表单 schema 含 `{ type: 'checkbox', field: 'tags' }`
- **THEN** 列映射草案生成 `{ key: 'tags', columnType: 'JSON' }`
- **AND** 生成 `{ key: 'tags_text', columnType: 'VARCHAR', length: 255, hidden: true }`

#### Scenario: elTreeSelect 单选映射为双列
- **WHEN** 业务表单 schema 含 `{ type: 'elTreeSelect', field: 'org', props: { multiple: false } }`
- **THEN** 列映射草案生成 `{ key: 'org', columnType: 'JSON' }`（不再为 VARCHAR）
- **AND** 生成 `{ key: 'org_text', columnType: 'VARCHAR', length: 255, hidden: true }`

#### Scenario: cascader 映射为双列
- **WHEN** 业务表单 schema 含 `{ type: 'cascader', field: 'region' }`
- **THEN** 列映射草案生成 `{ key: 'region', columnType: 'JSON' }`
- **AND** 生成 `{ key: 'region_text', columnType: 'VARCHAR', length: 255, hidden: true }`

#### Scenario: select 单选仍 VARCHAR
- **WHEN** 业务表单 schema 含 `{ type: 'select', field: 'grade', props: { multiple: false } }`
- **THEN** 列映射草案生成 `{ key: 'grade', columnType: 'VARCHAR', length: 255 }`
- **AND** 不生成 `<key>_text` 列

### Requirement: JSON 值序列化写入

业务数据新增/更新时，数组值组件 JSON 列的值 SHALL 序列化为 JSON 字符串写入物理表；前端提交的 `<key>_text` 显示文本 SHALL 一并写入对应 VARCHAR 列。

值 SHALL 为数组；非数组值（如旧逗号串）SHALL 按原值写入（容错，不做迁移转换）。

#### Scenario: checkbox 值写入
- **WHEN** 用户提交 checkbox 字段值为 `["a","b"]` 且显示文本为 `a, b`
- **THEN** 物理表 tags 列写入 JSON 字符串 `["a","b"]`
- **AND** tags_text 列写入 `a, b`

#### Scenario: 旧逗号串值写入容错
- **WHEN** 提交的 checkbox 字段值为 `"a,b"`（旧格式字符串）
- **THEN** 物理表 tags 列按原字符串 `"a,b"` 写入

### Requirement: JSON 值反序列化读取

业务数据查询返回时，数组值组件 JSON 列的值 SHALL 反序列化为 JSON 数组返回前端；`<key>_text` 列 SHALL 原样返回。

反序列化失败（非 JSON 数据）时 SHALL 原样返回字符串，不抛错。

#### Scenario: checkbox 值读取
- **WHEN** 查询业务数据且 tags 列为 `["a","b"]`
- **THEN** 返回前端的 tags 字段为数组 `["a","b"]`
- **AND** 返回前端的 tags_text 字段为显示文本 `a, b`

#### Scenario: 非 JSON 数据读取容错
- **WHEN** tags 列存有 `a,b`（非 JSON 旧数据）
- **THEN** 返回前端的 tags 字段原样为字符串 `a,b`
- **AND** 不抛异常
