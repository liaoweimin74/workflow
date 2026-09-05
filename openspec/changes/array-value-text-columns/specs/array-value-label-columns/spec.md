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

### Requirement: cascader/树形值统一叶子数组

级联选择器与树形选择器（tree/elTreeSelect）SHALL 主列统一存最下级叶子 value 数组（单选 `["leaf"]`、多选 `["leaf1","leaf2"]`）。提交时单选单值、cascader `emitPath=true` 的路径数组（单选 `[l1,l2,leaf]`、多选路径数组的数组）SHALL 转换为叶子数组（路径取最后一段）。

显示列 SHALL 存带前导 `/` 的完整路径（`/省/市/leaf`；多选逗号无空格连接 `/A/x,/B/y`）。

表格列 SHALL 显示叶子 label（路径最后一段，如 `leaf`）；树形编辑框回显 SHALL 显示全路径（`/总公司/武汉分公司`）。

#### Scenario: cascader 单选叶子值
- **WHEN** 级联选择器单选选中叶子值 `leaf-a`（路径 label 为 `省级/市级/leaf-a`）
- **THEN** 主列写入 `["leaf-a"]`
- **AND** 显示列写入 `/省级/市级/leaf-a`

#### Scenario: cascader emitPath=true 提交路径数组
- **WHEN** 级联选择器（`emitPath: true`）单选提交路径数组 `["p","c","leaf"]`（label 省级/市级/叶子区）
- **THEN** 主列写入 `["leaf"]`（取路径最后一段）
- **AND** 显示列写入 `/省级/市级/叶子区`

#### Scenario: cascader 多选叶子值
- **WHEN** 级联选择器多选选中两个叶子（路径 label 分别为 `A/x`、`B/y`）
- **THEN** 主列写入 `["x","y"]`
- **AND** 显示列写入 `/A/X,/B/Y`

### Requirement: 前端提交生成显示文本

表单提交时，前端 SHALL 遍历 schema 数组值组件，用渲染时持有的选项映射（value→label）生成 `<key>_text` 显示文本并随提交携带；后端保存 SHALL 将主列与显示列一并落库。

组件选项取值位置 SHALL 为：`rule.options`（select/checkbox）、`props.data`（tree/elTreeSelect/elTransfer）、`props.options`（cascader）。树形（tree/elTreeSelect）与级联（cascader）显示文本 SHALL 为完整路径（`/` 分隔），select/checkbox/transfer 为叶子 label。

提交时 SHALL 使用渲染时已解析的选项（异步数据源已加载，经 FormRenderer 解析后 schema），而非原始 schema（其选项可能为空导致映射失败回退 value）。

#### Scenario: 多选提交生成 label
- **WHEN** 用户提交多选字段值为 `["a","b"]` 且选项映射为 `{a: 张三, b: 李四}`
- **THEN** 提交数据含 `field: ["a","b"]` 与 `field_text: "张三, 李四"`

#### Scenario: 树形提交生成全路径
- **WHEN** 用户提交树形字段单选值为 `"2"`（路径 label 为 `总公司/武汉分公司`）
- **THEN** 提交数据含 `field: ["2"]`（统一叶子数组）与 `field_text: "/总公司/武汉分公司"`（前导 `/`）

#### Scenario: 级联提交生成全路径
- **WHEN** 用户提交级联字段叶子值为 `["leaf-a"]` 且路径 label 为 `省级/市级/leaf-a`
- **THEN** 提交数据含 `field: ["leaf-a"]` 与 `field_text: "/省级/市级/leaf-a"`

### Requirement: 列表显示走显示列

业务数据列表与页面数据表格 SHALL 对数组值组件列显示 `<key>_text` 的**叶子 label**（每段路径取最后一段，逗号连接），缺失时回退主列 value。

#### Scenario: 列表显示叶子 label
- **WHEN** 数据行 `data` 含 `{ field: ["a"], field_text: "张三" }`
- **THEN** 列表该列渲染为 `张三`（而非 value `["a"]`）

#### Scenario: 树形/级联列表显示叶子
- **WHEN** 数据行 `data` 含 `{ field: ["2"], field_text: "/总公司/武汉分公司" }`
- **THEN** 列表该列渲染为 `武汉分公司`（取路径最后一段，而非全路径）

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

表单回显 SHALL 用主列 value 匹配渲染时已加载的选项（`resolveOptionRules` 或静态选项）。树形/级联**单选**主列为数组时 SHALL 解包为单值（取最后一段叶子，兼容存量路径数组），并做**类型归一化**（v-model 与树节点 value 类型一致，字符串 `'7'` → 数字 `7`），保证 el-tree-select/el-cascader 按 nodeKey 匹配成功、输入框正常回显节点名称。

树形/级联单选判定 SHALL 仅依据 `multiple`（`showCheckbox` 仅为 UI 勾选，不改变值形态）。

兜底注入 SHALL 仅适用于扁平选项组件（select/checkbox/multiSelect 等）；树形结构组件（tree/elTreeSelect/cascader）SHALL NOT 注入兜底节点（根级孤立节点会污染树结构，导致组件选中节点错乱）。

#### Scenario: 多选回显
- **WHEN** 表单打开且主列值为 `["a","b"]`
- **THEN** 多选组件选中 value 为 `a`、`b` 的选项并显示其 label

#### Scenario: 级联/树形单选回显
- **WHEN** 表单打开且级联单选主列值为 `["leaf-a"]`（或存量路径数组 `["p","c","leaf-a"]`）
- **THEN** 解包为单值 `leaf-a` 赋给单选组件

#### Scenario: 树形单选类型归一化回显
- **WHEN** 树形选择器单选主列为字符串 `'7'`，树节点 value 为数字 `7`（数据源 id）
- **THEN** v-model 归一化为数字 `7`，el-tree-select 按 nodeKey 匹配成功，输入框显示节点名称

#### Scenario: 扁平组件 options 无匹配回显兜底
- **WHEN** 表单回显且扁平选项组件（select/checkbox）options 中找不到主列 value 的匹配项，但提交数据含 `<key>_text`
- **THEN** 用 `<key>_text` 的叶子 label 注入 `{ value, label: 叶子 }` 兜底选项项，组件显示叶子 label 而非原始 value
