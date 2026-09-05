# array-value-label-columns Specification

## Purpose

业务表单中数组值组件（select/tree/elTreeSelect/transfer/cascader）统一"叶子 value（JSON 主列）+ 显示文本（`<key>_text` 冗余列）"双列存储，解决列类型随单选/多选配置漂移、列表显示原始 value、按 label 查询不可用的问题。

## ADDED Requirements

### Requirement: 数组组件双列映射

业务表单列映射 SHALL 为数组值组件生成两列：主列 `<key>`（JSON，叶子 value 数组）与显示列 `<key>_text`（VARCHAR(255)，显示文本）。

数组值组件集合 SHALL 包括：`checkbox`、`multiSelect`、`multiSelectPro`、`elTransfer`、`tree`（多选与单选）、`elTreeSelect`（多选与单选）、`cascader`（单选与多选）、`select`（单选与多选）。

显示列 SHALL 标记为隐藏列（不参与列表列生成），主列 SHALL 为可显示列。

#### Scenario: checkbox 生成双列
- **WHEN** 业务表单 schema 含 `{ type: 'checkbox', field: 'tags' }`
- **THEN** 列映射草案生成 `{ key: 'tags', columnType: 'JSON' }` 与 `{ key: 'tags_text', columnType: 'VARCHAR', length: 255, hidden: true }`

#### Scenario: select 多选生成双列
- **WHEN** 业务表单 schema 含 `{ type: 'select', field: 'dept', props: { multiple: true } }`
- **THEN** 列映射草案生成 `{ key: 'dept', columnType: 'JSON' }` 与 `{ key: 'dept_text', columnType: 'VARCHAR', length: 255, hidden: true }`

#### Scenario: select 单选生成双列
- **WHEN** 业务表单 schema 含 `{ type: 'select', field: 'grade', props: { multiple: false } }`
- **THEN** 列映射草案生成 `{ key: 'grade', columnType: 'JSON' }` 与 `{ key: 'grade_text', columnType: 'VARCHAR', length: 255, hidden: true }`

#### Scenario: elTreeSelect 单选生成双列
- **WHEN** 业务表单 schema 含 `{ type: 'elTreeSelect', field: 'org', props: { multiple: false } }`
- **THEN** 列映射草案生成 `{ key: 'org', columnType: 'JSON' }` 与 `{ key: 'org_text', columnType: 'VARCHAR', length: 255, hidden: true }`

### Requirement: cascader 值只存叶子

级联选择器 SHALL 默认 `emitPath: false`，主列值只存最下级叶子 value 数组；显示列存全路径文本（`/` 分隔，多选叶子间 `, `）。

#### Scenario: cascader 单选叶子值
- **WHEN** 级联选择器单选选中叶子值 `leaf-a`（路径 label 为 `省级/市级/leaf-a`）
- **THEN** 主列写入 `["leaf-a"]`
- **AND** 显示列写入 `省级/市级/leaf-a`

#### Scenario: cascader 多选叶子值
- **WHEN** 级联选择器多选选中两个叶子（路径 label 分别为 `A/x`、`B/y`）
- **THEN** 主列写入 `["x","y"]`
- **AND** 显示列写入 `A/x, B/y`

### Requirement: 前端提交生成显示文本

表单提交时，前端 SHALL 遍历 schema 数组值组件，用渲染时持有的选项映射（value→label）生成 `<key>_text` 显示文本并随提交携带；后端保存 SHALL 将主列与显示列一并落库。

组件选项取值位置 SHALL 为：`rule.options`（select/checkbox）、`props.data`（tree/elTreeSelect/elTransfer）、`props.options`（cascader）。树形（tree/elTreeSelect）与级联（cascader）显示文本 SHALL 为完整路径（`/` 分隔），select/checkbox/transfer 为叶子 label。

提交时 SHALL 使用渲染时已解析的选项（异步数据源已加载，经 FormRenderer 解析后 schema），而非原始 schema（其选项可能为空导致映射失败回退 value）。

#### Scenario: 多选提交生成 label
- **WHEN** 用户提交多选字段值为 `["a","b"]` 且选项映射为 `{a: 张三, b: 李四}`
- **THEN** 提交数据含 `field: ["a","b"]` 与 `field_text: "张三, 李四"`

#### Scenario: 树形提交生成全路径
- **WHEN** 用户提交树形字段值为 `["2"]` 且路径 label 为 `总公司/武汉分公司`
- **THEN** 提交数据含 `field: ["2"]` 与 `field_text: "总公司/武汉分公司"`

#### Scenario: 级联提交生成全路径
- **WHEN** 用户提交级联字段叶子值为 `["leaf-a"]` 且路径 label 为 `省级/市级/leaf-a`
- **THEN** 提交数据含 `field: ["leaf-a"]` 与 `field_text: "省级/市级/leaf-a"`

### Requirement: 列表显示走显示列

业务数据列表与页面数据表格 SHALL 对数组值组件列显示 `<key>_text` 值，缺失时回退主列 value。

#### Scenario: 列表显示 label
- **WHEN** 数据行 `data` 含 `{ field: ["a"], field_text: "张三" }`
- **THEN** 列表该列渲染为 `张三`（而非 value `["a"]`）

#### Scenario: 显示列缺失回退
- **WHEN** 数据行 `data` 含 `{ field: ["a"] }` 且无 `field_text`
- **THEN** 列表该列渲染主列值（数组逗号拼接）

### Requirement: 模糊查询走显示列

业务数据列表搜索 SHALL 对数组值组件使用 `<key>_text` 列做 LIKE 模糊匹配（单选多选统一）；`<key>_text` 列 SHALL 可进可筛选列集合。

#### Scenario: 按 label 模糊搜索
- **WHEN** 用户在搜索框输入 `杭州`
- **THEN** 对数组值组件列执行 `<key>_text LIKE '%杭州%'`，命中含"杭州"文本的记录

### Requirement: 精确查询走主列 JSON

结构化筛选 SHALL 对数组值组件主列使用 MySQL JSON 函数：`eq` → `JSON_CONTAINS(col, ?)`（value 参数序列化为 JSON 片段），单选可用 `col->>'$[0]' = ?`；`in` → `JSON_OVERLAPS(col, ?)`。

#### Scenario: 多选精确筛选
- **WHEN** 用户筛选"包含选项 b"（主列存 `["a","b"]`）
- **THEN** 查询条件为 `JSON_CONTAINS(col, '"b"')`，命中该记录

#### Scenario: 单选精确筛选
- **WHEN** 用户筛选单选字段等于 `x`（主列存 `["x"]`）
- **THEN** 查询条件为 `col->>'$[0]' = 'x'` 或 `JSON_CONTAINS(col, '"x"')`，命中该记录

### Requirement: 表单回显走主列值

表单回显 SHALL 保持现状：主列 value 数组匹配渲染时已加载的选项（`resolveOptionRules` 或静态选项），显示文本由组件自身渲染，不读显示列。

#### Scenario: 多选回显
- **WHEN** 表单打开且主列值为 `["a","b"]`
- **THEN** 多选组件选中 value 为 `a`、`b` 的选项并显示其 label

#### Scenario: 级联回显
- **WHEN** 表单打开且主列值为 `["leaf-a"]`
- **THEN** 级联组件通过已加载的选项树定位叶子 `leaf-a` 并回显其路径

#### Scenario: options 无匹配回显兜底
- **WHEN** 表单回显且数组组件 options（`rule.options` / `props.data` / `props.options`）中找不到主列 value 的匹配项（异步数据源未就绪、类型不匹配、静态缺失），但提交数据含 `<key>_text`
- **THEN** 用 `<key>_text` 注入 `{ value, label: <key>_text }` 兜底选项项，组件显示显示文本而非原始 value
