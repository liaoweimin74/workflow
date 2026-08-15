# biz-form-extra-components Specification

## Purpose
业务表单（type=BUSINESS）发布时，支持 form-create 设计器内置的评分、颜色选择器、树形控件、树形选择、穿梭框、富文本框、手写签名、子表单、滑块组件的列映射、建表与数据读写。

## Requirements
### Requirement: 扩展组件列映射

系统 SHALL 在业务表单发布列映射中支持以下组件的映射（前后端 ColumnTypeMapper 与 ColumnConfigDialog 逐 case 对齐）：

| 组件 type | 判定条件 | 列类型 |
|---|---|---|
| `rate` | 无 | INT |
| `colorPicker` | 无 | VARCHAR(16) |
| `tree` | 单选（非多选） | VARCHAR(255) |
| `tree` | 多选（showCheckbox 且值为数组） | JSON |
| `elTreeSelect` | 单选（multiple=false） | VARCHAR(255) |
| `elTreeSelect` | 多选（multiple=true） | JSON |
| `elTransfer` | 无（值必为数组） | JSON |
| `fcEditor` | 无 | TEXT |
| `signaturePad` | 无 | TEXT |
| `subForm` | storageMode=JSON | JSON |
| `slider` | range=true（双滑块，值为数组） | JSON |
| `slider` | step 为小数（单选） | DECIMAL(18, 小数位) |
| `slider` | 其他（单选整数） | INT |
| `cascader` | 无（值必为数组，级联路径） | JSON |

多选判定 SHALL 基于 rule 的 props（tree 看 showCheckbox/值形态、elTreeSelect 看 multiple、slider 看 range/step）。

#### Scenario: 评分组件发布
- **WHEN** 业务表单 schema 含 `{ type: 'rate', field: 'score' }`
- **THEN** 列映射草案生成 `{ key: 'score', columnType: 'INT' }`
- **AND** 发布后物理表包含 `score INT` 列

#### Scenario: 颜色选择器发布
- **WHEN** 业务表单 schema 含 `{ type: 'colorPicker', field: 'color' }`
- **THEN** 列映射草案生成 `{ key: 'color', columnType: 'VARCHAR', length: 16 }`

#### Scenario: 树形选择单选发布
- **WHEN** 业务表单 schema 含 `{ type: 'elTreeSelect', field: 'dept', props: { multiple: false } }`
- **THEN** 列映射草案生成 `{ key: 'dept', columnType: 'VARCHAR', length: 255 }`

#### Scenario: 树形选择多选发布
- **WHEN** 业务表单 schema 含 `{ type: 'elTreeSelect', field: 'depts', props: { multiple: true } }`
- **THEN** 列映射草案生成 `{ key: 'depts', columnType: 'JSON' }`

#### Scenario: 树形控件多选发布
- **WHEN** 业务表单 schema 含 `{ type: 'tree', field: 'tree', props: { showCheckbox: true } }`
- **THEN** 列映射草案生成 `{ key: 'tree', columnType: 'JSON' }`

#### Scenario: 穿梭框发布
- **WHEN** 业务表单 schema 含 `{ type: 'elTransfer', field: 'users' }`
- **THEN** 列映射草案生成 `{ key: 'users', columnType: 'JSON' }`

#### Scenario: 富文本框发布
- **WHEN** 业务表单 schema 含 `{ type: 'fcEditor', field: 'content' }`
- **THEN** 列映射草案生成 `{ key: 'content', columnType: 'TEXT' }`

#### Scenario: 手写签名发布
- **WHEN** 业务表单 schema 含 `{ type: 'signaturePad', field: 'sign' }`
- **THEN** 列映射草案生成 `{ key: 'sign', columnType: 'TEXT' }`
- **AND** DDL 生成 `sign TEXT` 列定义

#### Scenario: 级联选择器发布
- **WHEN** 业务表单 schema 含 `{ type: 'cascader', field: 'region' }`
- **THEN** 列映射草案生成 `{ key: 'region', columnType: 'JSON' }`
- **AND** 发布后物理表包含 `region JSON` 列

#### Scenario: 子表单发布（JSON 模式）
- **WHEN** 业务表单 schema 含 `{ type: 'subForm', field: 'items' }`
- **THEN** 列映射草案生成 `{ key: 'items', columnType: 'JSON', storageMode: 'JSON' }`
- **AND** 发布后物理表包含 `items JSON` 列

#### Scenario: 滑块单选整数发布
- **WHEN** 业务表单 schema 含 `{ type: 'slider', field: 'level', props: { min: 0, max: 10 } }`
- **THEN** 列映射草案生成 `{ key: 'level', columnType: 'INT' }`

#### Scenario: 滑块单选小数发布
- **WHEN** 业务表单 schema 含 `{ type: 'slider', field: 'ratio', props: { min: 0, max: 1, step: 0.1 } }`
- **THEN** 列映射草案生成 `{ key: 'ratio', columnType: 'DECIMAL', length: 18, scale: 1 }`

#### Scenario: 滑块双滑块发布
- **WHEN** 业务表单 schema 含 `{ type: 'slider', field: 'range', props: { range: true, min: 0, max: 100 } }`
- **THEN** 列映射草案生成 `{ key: 'range', columnType: 'JSON' }`
- **AND** 发布后物理表包含 `range JSON` 列

### Requirement: 扩展组件数据读写

系统 SHALL 支持 JSON 列（多选/子表单）的序列化写入与反序列化读取。

业务数据新增/更新时，JSON 列的值 SHALL 以 JSON 字符串写入物理表（数组/对象序列化）。

业务数据查询返回时，JSON 列的值 SHALL 反序列化为 JSON 数组/对象返回前端。

#### Scenario: 写入多选值
- **WHEN** 用户提交 elTransfer 字段值为 `["u1","u2"]`
- **THEN** 物理表 users 列写入 JSON 字符串 `["u1","u2"]`

#### Scenario: 读取多选值
- **WHEN** 查询业务数据且 users 列为 `["u1","u2"]`
- **THEN** 返回给前端的 users 字段为 JSON 数组 `["u1","u2"]`

#### Scenario: 读取旧格式容错
- **WHEN** JSON 列存有非 JSON 旧数据（如逗号串）
- **THEN** 反序列化失败时不报错，原样返回字符串值

### Requirement: 子表单列不进业务列表

子表单（subForm）列 SHALL 不出现在业务数据列表的表格列与筛选列中。

#### Scenario: 业务数据列表隐藏子表单列
- **WHEN** 业务表单 column_config 含 subForm 映射列
- **THEN** 业务数据列表页不渲染该列为表格列
- **AND** 不提供该列的筛选入口
