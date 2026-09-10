## Why

业务表单（底表）v1 已支持独立 CRUD，但表单之间无法引用数据——PRD §3.2.1 规划的"数据引用组件"仍是空缺。现有 LookupPicker/ReferencePicker 需要调用方硬编码 fetchApi/columns，普通用户在设计器中无法配置。结果：一个表单（如请假申请）无法从另一个表单（如员工档案）选择记录并自动带入部门/职位等字段，跨表单数据联动完全靠手工维护。实现 data-picker 后，表单间引用可视化配置、选中即回填、列表详情零联查展示，补齐"表单引用表单"的核心闭环，并为后续流程沉淀、跨表单统计奠定数据关联基础。

## What Changes

1. **设计器可视化配置**：组件面板新增"数据引用"组件，双击打开配置弹窗——选目标业务表单、显示字段、弹窗列表列、单多选、返回字段映射、级联依赖；产出 rule props 存入 schema。
2. **列映射两列模型**：dataPicker 字段发布时生成两列——`<key>`（VARCHAR 存 id）与 `<key>_text`（VARCHAR 存冗余显示文本，隐藏列）；ColumnConfig 增加 hidden/pickerConfig 标记。
3. **后端引用解析**：`BizDataService` 增加 `resolveDisplayTexts`（id→显示文本批量解析）与 `GET /api/v1/biz-data/{formKey}/resolve`；create/update 自动校验引用 id 存在性并维护 `<key>_text`；发布校验目标表单存在且引用列未删。
4. **运行时 DataPicker 组件**：基于 LookupPicker 扩展——配置驱动 fetchApi（复用 BizDataService.query）、级联 watch 依赖字段、returnFields 回填、只读显示冗余文本。
5. **管理页适配**：hidden 列不进表格/筛选列（BizDataListPage 过滤）。

## Capabilities

### New Capabilities

- `data-picker`: 业务表单字段可视化引用其他业务表单记录——设计器配置、运行时选择、id+冗余文本存储、级联联动、返回字段回填、批量解析展示。

### Modified Capabilities

- `business-form-data`: 列映射支持 dataPicker 两列模型（hidden 列），CRUD 自动维护冗余文本并校验引用 id，新增 resolve 解析 API。
- `form-designer`: 组件面板新增"数据引用"组件，属性配置支持可视化数据源配置弹窗。

## Impact

**后端：**
- `ColumnConfig` — 新增 `hidden`、`pickerConfig` 字段
- `ColumnTypeMapper` — dataPicker → 两列映射（`<key>` + `<key>_text` 隐藏列）
- `BizDataService` — 新增 `resolveDisplayTexts`；create/update 增加引用校验与冗余文本维护
- `BizDataController` — 新增 `GET /api/v1/biz-data/{formKey}/resolve`
- `FormDefinitionService.publish` — 发布校验：dataPicker 目标表单存在且已发布、引用列未删除
- 测试 — 列映射两列、CRUD 冗余文本、解析 API、引用校验、发布校验

**前端：**
- `DataPicker.vue` — 运行时选择器（新）
- `DataPickerConfigDialog.vue` — 可视化配置弹窗（新）
- `FormDesigner.vue` — 注册 dataPicker 组件、配置入口
- `ColumnConfigDialog.vue` — dataPicker 发布列映射两列草案
- `api/bizData.ts` — resolve API 封装
- `BizDataListPage.vue` — 过滤 hidden 列

**数据库：** 无结构变更（动态表发布时按新规则建列）；已发布表单不受影响。

**API：** 新增 `GET /api/v1/biz-data/{formKey}/resolve`；CRUD 接口行为增强（校验引用 + 冗余文本），向后兼容。
