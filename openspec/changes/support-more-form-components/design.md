# Design: 支持更多 form-create 组件在业务表单发布中使用

## Context

form-create 设计器（@form-create/designer + @form-create/element-ui）内置组件中，评分 rate、颜色选择器 colorPicker、树形控件 tree、树形选择 elTreeSelect、穿梭框 elTransfer、富文本框 fcEditor、手写签名 signaturePad、子表单 subForm 共 8 类组件在设计器中可拖拽、在工作流/CRUD 表单渲染层可正常渲染（element-plus 全量注册 + Vue resolveComponent 大小写规范化已覆盖 elTreeSelect/elTransfer/fcEditor/signaturePad 等 rule type），但在**业务表单（type=BUSINESS）发布链路**被拦截：

- 前端 `ColumnConfigDialog.vue::mapComponentToColumn()` 无对应 case → 返回 null → 标记 `unsupported` → 发布按钮禁用。
- 后端 `ColumnTypeMapper.mapComponentToColumn()` 无对应 case → 返回 null。
- 后端 `FormDefinitionService.validateBusinessSchema()` 的 `UNSUPPORTED_COMPONENTS` 对结构性组件直接 400。

业务表单发布链路：设计器拖拽 → schema（rule JSON）→ 发布时 ColumnConfigDialog 生成 column_config → 后端 ColumnTypeMapper 校验 → DynamicTableManager.ensureTable 执行 DDL 建表/变更 → BizDataService/BizDataQueryBuilder 读写。

约束（既有）：前端 ColumnConfigDialog 与后端 ColumnTypeMapper 的映射表须逐 case 对齐（文件注释明确要求）；列类型白名单 VARCHAR/TEXT/INT/DECIMAL/DATE/DATETIME/TINYINT/JSON；VARCHAR 上限 255；跨类变更（categoryOf）锁定。

## Goals / Non-Goals

**Goals:**
- 为 8 类组件补充"组件类型 → 列类型"映射，使其可通过业务表单发布、建表、CRUD。
- 多值组件（tree 多选 / elTreeSelect 多选 / elTransfer / checkbox / multiSelect）统一 JSON 列存储。
- subForm 整体 JSON 列存储（方案 A），ColumnConfig 增加 `storageMode` 开关预留子表模式（方案 B）。
- 前后端映射表逐 case 对齐，保证发布校验一致。

**Non-Goals:**
- 不实现 subForm 的子表模式（storageMode=SUB_TABLE 仅预留字段与分派分支，本期不落地建表）。
- 不做老数据（逗号拼接 TEXT）迁移——用户明确"不用考虑兼容问题"。
- 不改渲染层（WORKFLOW/CRUD 表单已可渲染全部组件）。
- 不改设计器本身（组件拖拽、属性配置已可用）。

## Decisions

### D1: 组件 → 列类型映射表（前后端逐 case 对齐）

| 组件 type | 判定条件 | 列类型 | 说明 |
|---|---|---|---|
| `rate` | — | INT | 数值 |
| `colorPicker` | — | VARCHAR(16) | `#RRGGBB` |
| `tree` | props.showCheckbox 且多选 | JSON | 数组 |
| `tree` | 单选 | VARCHAR(255) | 节点 key |
| `elTreeSelect` | props.multiple | JSON | 数组 |
| `elTreeSelect` | 单选 | VARCHAR(255) | |
| `elTransfer` | — | JSON | 数组 |
| `fcEditor` | — | TEXT | HTML |
| `signaturePad` | — | TEXT | base64 签名图（TEXT 64KB 通常足够） |
| `subForm` | — | JSON | storageMode=JSON |
| `checkbox`（既有） | — | TEXT→JSON | 迁移 |
| `multiSelect` / `multiSelectPro`（既有） | — | TEXT→JSON | 迁移 |
| `cascader`（既有） | — | VARCHAR→JSON | 值必为数组（级联路径），VARCHAR 触发 Java 序列化乱码 |

设计说明：
- 多选判定读取 rule.props（tree 看 `showCheckbox`+值形态、elTreeSelect 看 `multiple`），与既有 `datePicker` 读 `props.type` 的做法一致。
- `signaturePad` 使用 TEXT：base64 签名图通常小于 64KB；不使用 LONGTEXT，避免引入新列类型（CHARACTER_MAXIMUM_LENGTH=4294967295 超出 Java Integer 范围，findTableColumns 读取会溢出——getNullableInt 已加溢出防御，但无需主动使用该类型）。
- `cascader` 值形态是数组（级联路径），必须 JSON 列——VARCHAR 列存数组值会被 MySQL 驱动按 Java 序列化写入（`\xAC\xED` 魔数乱码）。

### D2: 多值组件 JSON 存储

- 列类型映射为 `JSON`（MySQL JSON 列），DDL 层已支持，零改动。
- 写入序列化：BizDataService.create/update 入口，对 JSON 列的数组/对象值 `JSON.stringify`（复用 dataPicker 的 `resolvePickerValues` 附加字段思路，新增统一的"JSON 列值序列化"步骤）。
- 读取反序列化：`toVO()` 对 JSON 列 `JSON.parse`，业务数据页展示。
- 业务数据页筛选：JSON/TEXT 列已被 `BizDataListPage` 降级为不可筛选（`columnType !== 'JSON' && columnType !== 'TEXT'`），符合预期，无需改。

### D3: subForm 整体 JSON 列 + storageMode 开关

- `ColumnConfig` 新增字段 `storageMode: String`（`JSON` | `SUB_TABLE`，默认 `JSON`，`@JsonIgnoreProperties(ignoreUnknown=true)` 已允许向后兼容）。
- 发布时 `FormDefinitionService.publish()` 按 `storageMode` 分派：
  - `JSON`（本期）：走现有 ensureTable 主表逻辑，subForm 字段映射为 JSON 列。
  - `SUB_TABLE`（预留）：抛出"暂未实现"或留空分支，不建子表。
- 前端 ColumnConfigDialog：subForm 行生成 JSON 列映射，本期不暴露 storageMode 选择（固定 JSON），仅后端字段预留。
- subForm 列在 BizDataListPage 中按 hidden 处理，不进列表列。

### D4: 发布校验调整

- `FormDefinitionService.UNSUPPORTED_COMPONENTS`：从 `subTable/SubTable/nestedForm/NestedForm/dataTable` 中移除 subForm（若其 rule type 为 subForm）；保留纯展示型组件（divider/groupContainer 等）与 dataTable 的拒绝逻辑。
- `ColumnTypeMapper.UNSUPPORTED_COMPONENTS`：同样移除已支持项（注意与前端 UNSUPPORTED_TYPES 对齐；前端 UNSUPPORTED_TYPES 含 subTable/SubTable/nestedForm/NestedForm/dataTable/divider/groupContainer）。

### D5: categoryOf 跨类变更

- 现有分类：VARCHAR/TEXT/TINYINT/JSON → STRING；INT → INT；DECIMAL → DECIMAL；DATE/DATETIME → DATE。
- 新增映射均落在既有分类内（rate=INT→INT；colorPicker=VARCAHR→STRING；JSON 多选→STRING；fcEditor/signaturePad=TEXT→STRING；subForm=JSON→STRING），**无需修改 categoryOf**。

## Risks / Trade-offs

- [checkbox/multiSelect 从 TEXT 逗号拼接迁到 JSON 列] → 老数据不兼容，读取旧值为逗号串、新值为 JSON 数组 → 用户明确接受不兼容；`toVO()` 对 JSON 列加容错（parse 失败时原样返回），避免旧数据崩溃。
- [signaturePad 使用 TEXT] → base64 签名图超过 64KB 会截断 → 签名图通常远小于 64KB，风险可接受；若未来出现大图需求再评估 LONGTEXT（届时需处理 CHARACTER_MAXIMUM_LENGTH 溢出，已防御）。
- [subForm 值格式复杂（对象数组）] → 若内部含子字段校验/联动，JSON 整列存储无法做列级校验 → 本期仅存储展示，子字段校验由前端 form-create 渲染时执行；后续 SUB_TABLE 模式再补齐后端行级校验。
- [前后端映射表漂移] → 两处独立实现 → 在 ColumnTypeMapperTest 与 ColumnConfigDialog 测试中各建同一张"组件→列类型"期望表，发布测试断言前后端一致。
- [JSON 列不可建索引/筛选] → 业务数据页对 JSON 列已降级不可筛选 → 符合"多值不做筛选"的产品预期，记录为已知限制。

## Migration Plan

1. 后端：ColumnTypeMapper 增映射 + FormDefinitionService 校验调整 + ColumnConfig.storageMode + getNullableInt 溢出防御 → 单测（ColumnTypeMapperTest/DdlBuilderTest/DynamicTableManagerTest/FormDefinitionPublishBusinessTest）。
2. 前端：ColumnConfigDialog 增映射 + BizDataListPage 展示适配 + BizDataService 序列化/反序列化 → 组件测试。
3. 手工验证：拖入 8 类组件 → 发布 → 业务数据页 CRUD 往返。
4. 回滚：变更集中在映射与校验，未发布的新表单不受影响；已发布表单不受影响（本次不改已有列类型）。

## Open Questions

1. subForm 内部是否需要后端子字段校验？（本期不做，SUB_TABLE 模式时再评估）
