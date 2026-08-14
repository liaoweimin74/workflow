# Proposal: 数据引用组件 v2（data-picker 能力补齐 + 引用感知）

## Why

data-picker v1 已实现"从业务表单选取数据"的雏形，但对照业界主流低代码平台（钉钉宜搭、明道云、简道云、飞书多维表格、Airtable、NocoDB）的成熟方案，存在四类差距：

1. **定位不清**：v1 的 `_text` 冗余列承担"快照"语义，与"数据引用组件应引用而非复制"的定位冲突——业务语义应是**只存引用（id），不冗余存储底表数据**，`_text` 仅为展示缓存。
2. **过滤能力弱**：仅支持 `dependOn` 单一字段级联，业界标配是"固定值 + 字段动态值"混合过滤条件。
3. **级联行为反直觉**：依赖字段变化时强制清空已选值，而宜搭等平台的语义是"条件变化后已选择数据不受限制、不清空"。
4. **交互与风险缺失**：无"允许新增"（选择时现场创建目标记录）、无跳转查看、resolve 失败静默显示原始 id；被引用表单被删/改列时无风险提示（引用悬空无感知）。

## What Changes

1. **定位收敛**：dataPicker 两列映射不变，`_text` 定位降级为展示缓存（非业务数据）。显示优先级 = 编辑态/审批实时 resolve（失败回退 `_text`），列表/只读直接用 `_text`。CRUD 对 `_text` 的自动维护保留（尽力而为）。
2. **过滤条件升级**：`dependOn` 升级为 `filters[]`（`column` + `operator` + `valueType: static|field` + `value`），向后兼容（`dependOn` 等价于一条 field 型 filter）。
3. **级联行为修正**：条件变化后已选值默认保留（不清空），提供"清空"配置开关。
4. **允许新增**：选择弹窗提供"新增"入口，提交目标表单后自动选中新记录并执行回填。
5. **跳转查看**：只读态显示文本可点击跳转目标记录详情。
6. **悬空降级**：resolve 失败时编辑态标红提示，只读显示原始 id。
7. **引用感知（轻量三件套）**：表单管理列表显示"被 N 个表单引用"；删除被引用表单/修改被引用列前弹出影响范围警告；配置弹窗目标表单选择器增强（搜索/分组）。

**明确不做**：独立数据源管理模块；外部 API 数据源；双向关联/聚合 rollup/关联本表/子表单内引用（均留待后续阶段）。

## Capabilities

- **Modified: `data-picker`** — 本变更的全部能力均归属现有 data-picker 能力（v1 spec 在 `openspec/changes/data-picker/specs/data-picker/spec.md`，尚未同步到 main specs，本次以其为基础写 delta）：
  - 修改需求：数据引用运行时选择与级联（级联行为改为保留已选值）
  - 新增需求：过滤条件配置（filters 双类型）、允许新增、跳转查看、resolve 失败降级、`_text` 展示缓存语义
  - 新增需求：引用感知（被引用计数、删除/改列风险警告、配置弹窗增强）

## Impact

**后端（backend/）**
- `ColumnTypeMapper`：无变化（两列映射保留）
- `BizDataService` / `BizDataController`：
  - `resolveDisplayTexts` 保留（作为实时 resolve 的数据源）
  - 新增被引用计数统计（遍历各业务表单 column_config 统计 sourceFormKey）
  - `resolvePickerValues` 的 `_text` 维护保留，语义标注为"展示缓存尽力而为"
- 发布校验（form-definition / business-form-data 侧）：新增"引用列被删"的操作侧警告联动（校验逻辑已有，补前端提示入口）

**前端（frontend/src/）**
- `views/form/components/DataPicker.vue`：filters 双类型解析、级联保留已选值（可配置清空）、允许新增弹窗、跳转查看、resolve 失败标红
- `views/form/components/DataPickerConfigDialog.vue`：过滤条件编辑器（静态值/字段值）、目标表单选择器增强（搜索/分组）、新增"新增"能力开关配置
- 表单管理列表页（FormListPage / BizDataListPage）：被引用计数徽标、删除前确认警告
- `api/`：被引用计数统计接口封装

**API**
- 新增 `GET /api/v1/biz-data/referenced-count`（或挂表单定义侧）：返回各表单被 dataPicker 引用数量

**依赖与迁移**
- 无数据库结构变更（动态表，列映射规则不变）
- 已发布表单 schema 兼容：运行时同时识别 `dependOn` 与 `filters` 两种形态，不强制迁移
