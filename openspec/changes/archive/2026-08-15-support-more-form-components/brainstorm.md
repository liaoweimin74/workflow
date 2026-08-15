# Brainstorm: 支持更多 form-create 组件在业务表单发布中使用

## Design Summary

form-create 设计器内置组件中，有 8 类组件（评分 rate、颜色选择器 colorPicker、树形控件 tree、树形选择 elTreeSelect、穿梭框 elTransfer、富文本框 fcEditor、手写签名 signaturePad、子表单 subForm）在业务表单（type=BUSINESS）发布时不被支持：前端列映射（ColumnConfigDialog.mapComponentToColumn）与后端列映射（ColumnTypeMapper）均无对应映射，导致发布时被标记为"不支持"、发布按钮禁用；后端 FormDefinitionService.validateBusinessSchema 亦对结构性组件直接拒绝。

本次变更目标：
1. 为上述 8 类组件补充"组件类型 → 列类型"映射，使其可发布、可建表、可 CRUD。
2. 多值组件（tree 多选 / elTreeSelect 多选 / elTransfer / checkbox / multiSelect 等）统一使用 **JSON 列**存储（含既有 checkbox/multiSelect 一并迁移，不处理老数据兼容）。
3. subForm 采用 **整体 JSON 列**存储（方案 A），并在 ColumnConfig 增加 `storageMode` 开关，为后续"子表模式（方案 B）"预留扩展点。
4. 渲染层无需改动：element-plus 全量注册 + Vue resolveComponent 大小写规范化，已能渲染 elTreeSelect/elTransfer/fcEditor/signaturePad 等 rule type。

## Alternatives Considered

### 方案 A：多值组件沿用"逗号拼接存 TEXT"
- **做法**：tree/elTreeSelect 多选、elTransfer 的值序列化为逗号分隔字符串存入 TEXT 列。
- **優點**：与既有 checkbox 实现一致，改动最小；TEXT 列可做 LIKE 筛选。
- **缺點**：值内含逗号时产生歧义、无法无损还原；不可依赖 DB 层格式校验。
- **為何未採用**：用户决策采用 JSON 存储（可无损、自带格式校验）。

### 方案 B：多值组件使用 JSON 列存储
- **做法**：所有多值组件（含既有 checkbox/multiSelect）统一映射为 JSON 列，写入前 JSON.stringify、读取后 JSON.parse。
- **優點**：无损、无歧义、MySQL JSON 列自带格式校验；DdlBuilder/BizDataQueryBuilder 已支持 JSON 类型，DDL 层零改动。
- **缺點**：JSON 列不可直接建索引 / LIKE 筛选（业务数据页对 JSON 列已降级为不可筛选，符合预期）；老数据（逗号串）需迁移或放弃。
- **為何採用**：用户明确决策"一并迁移到 JSON 存储，不用考虑兼容问题"。

### 方案 C：subForm 实现真子表（一主多从）
- **做法**：为 subForm 建子表 `wf_biz_<key>_sub_<field>` + 主表外键，行级 CRUD。
- **優點**：子表行可独立筛选/统计。
- **缺點**：需全新动态子表 DDL 与管理层，工作量量级差异；本期不需要子表级筛选。
- **為何未採用**：用户决策"先按 A（整体 JSON 列）实现，后续可配置按 A 或按 B"。

## Agreed Approach

- **映射新增**（前后端对齐）：
  | 组件 type | 列类型 | 说明 |
  |---|---|---|
  | `rate` | INT | 数值，可排序筛选 |
  | `colorPicker` | VARCHAR(16) | `#RRGGBB` |
  | `tree`（单选） | VARCHAR(255) | 单选存节点 key |
  | `tree`（多选） | JSON | 多选存 JSON 数组 |
  | `elTreeSelect`（单选） | VARCHAR(255) | |
  | `elTreeSelect`（多选） | JSON | |
  | `elTransfer` | JSON | 值必为数组 |
  | `fcEditor` | TEXT | HTML 内容 |
  | `signaturePad` | TEXT（评估 LONGTEXT） | base64 体积大，超出 TEXT 64KB 需 LONGTEXT |
  | `subForm` | JSON | 整体 JSON 列（storageMode=JSON） |
  | `checkbox` / `multiSelect`（既有） | 由 TEXT 逗号拼接 → JSON | 一并迁移 |
- **subForm storageMode 开关**：ColumnConfig 新增字段 `storageMode: 'JSON' | 'SUB_TABLE'`（默认 JSON）；发布时按模式分派 DDL 分支；SUB_TABLE 本期不实现，仅预留。
- **subForm 列不进业务数据列表列**：BizDataListPage 按 hidden 处理。
- **渲染层不改**：WORKFLOW/CRUD 表单已可渲染全部组件。

## Key Decisions

1. 多值组件（含既有 checkbox/multiSelect）统一 JSON 列存储，不处理老数据兼容。
2. subForm 先按整体 JSON 列（方案 A）实现，`storageMode` 预留 SUB_TABLE 扩展点。
3. 富文本/签名大字段：TEXT 起步，若评估超 64KB 引入 LONGTEXT（DdlBuilder 白名单需同步）。
4. subForm 等结构性组件的列不出现在业务数据列表列中。
5. 前端 ColumnConfigDialog 与后端 ColumnTypeMapper 的映射表保持逐 case 对齐（既有约束）。

## Open Questions

1. fcEditor/signaturePad 是否直接引入 LONGTEXT（避免二次发布类型变更）？——倾向直接上 LONGTEXT，减少跨类变更风险。
2. subForm 的 storageMode 在前端列映射确认对话框（ColumnConfigDialog）中是否需要可见可配？——本期建议固定 JSON，仅后端预留字段。
