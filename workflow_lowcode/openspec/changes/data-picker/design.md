## Context

业务表单（底表）v1 已落地：`FormDefinition.type=BUSINESS` + `column_config` 列映射 + 运行时受控 DDL 建表（`wf_biz_<formKey>`）+ 通用 CRUD（`BizDataService`，参数化 SQL/乐观锁/租户隔离）+ `BizDataHandler` 钩子 + 前端管理页（SearchTable 复用）。

PRD §3.2.1 的"数据引用组件"（从业务表/表单选取数据）与设计文档 §5.7 的 data-picker（TABLE/FORM/API 数据源、级联联动）是本变更的输入。现有雏形：`LookupPicker.vue`（已支持 returnFields 回填、单多选、fetchApi 注入）与 `ReferencePicker.vue`（通用表格选择）——但均需调用方硬编码 fetchApi/columns，普通用户无法在设计器中配置。

**本变更目标**：让业务表单字段可**可视化引用**其他业务表单记录，值存 id + 冗余显示文本，支持单多选、级联、回填。

**约束**：
- 复用 BizDataService.query 作为可选值查询（级联 filter + keyword + 分页已具备）
- 复用 LookupPicker 交互雏形
- 列映射规则扩展保持向后兼容（非 data-picker 字段不受影响）
- 仅本系统业务表单数据源（外部 API 不做）

## Goals / Non-Goals

**Goals:**
- 设计器可拖入"数据引用"组件，可视化配置数据源（目标表单/显示字段/列表列/单多选/回填映射/级联依赖）
- 运行时 DataPicker 组件：弹窗选择、搜索、分页、单选/多选、回填、级联、只读展示
- 后端：data-picker 字段列映射（两列）、CRUD 冗余文本自动维护、批量解析 API、id 存在性校验
- 级联联动：依赖字段变化 → 重置值 + 刷新选项

**Non-Goals:**
- 外部 API 数据源（后续 feature）
- 行级权限/数据范围控制（沿用 v1："能管理目标表单即能引用"）
- 被引用表单删除的级联删除（快照语义，保留冗余文本）
- 跨表单的复杂 JOIN 查询（JOOQ 引入时机另行评估）

## Decisions

### D1. 配置模型（schema 存储形态）

设计器配置弹窗产出，存入字段 rule props：

```json
{
  "type": "dataPicker",
  "field": "emp_id",
  "title": "员工",
  "props": {
    "sourceFormKey": "emp_profile",
    "displayField": "name",
    "columns": ["name", "dept", "level"],
    "mode": "single",
    "returnFields": { "dept": "emp_dept", "level": "emp_level" },
    "dependOn": { "field": "dept_field", "sourceColumn": "dept" }
  }
}
```

- `columns` 省略时默认只显 `displayField`
- `dependOn` 可选：级联依赖（当前表单字段 `field` → 目标表列 `sourceColumn`）
- `returnFields` 可选：目标表字段 → 当前表单字段 回填映射

### D2. 列映射扩展（ColumnTypeMapper）

`dataPicker` → 生成**两列**：

| 列 | 类型 | 说明 |
|---|---|---|
| `<key>` | VARCHAR(64) | 存被引用记录 id（多选逗号分隔） |
| `<key>_text` | VARCHAR(1024) | 冗余显示文本（多选逗号分隔，自动维护） |

- `DdlBuilder`/`ColumnTypeMapper` 扩展：dataPicker 映射时生成两列，`<key>_text` 标记 `hidden=true`（ColumnConfig 增加 hidden 字段）
- `hidden` 列：不进前端管理页表格默认列、不进可筛选列；但参与 CRUD（后端自动写）
- 引用字段校验：发布业务表单时，若 schema 含 dataPicker，校验目标表单存在且已发布（`sourceFormKey` 对应的 `getBusinessColumnsByKey` 可查）

### D3. 后端服务扩展

**BizDataService** 增加：
- `resolveDisplayTexts(String sourceFormKey, List<String> ids)`：内部查询 id → displayField 值映射（按 sourceFormKey 的 column_config 拼 SELECT）
- `GET /api/v1/biz-data/{formKey}/resolve?ids=a,b,c`（BizDataController 新增）：返回 `{"id": "displayText"}` 映射；用于列表/详情还原与校验

**CRUD 集成**（内建于 BizDataService.create/update，非 Handler）：
- 解析当前表单 column_config 中的 data-picker 列（需 column_config 扩展标记：`pickerConfig` 存 sourceFormKey/displayField）
- create/update 时对每个 data-picker 字段：
  1. 校验 id 存在于目标表单（`resolveDisplayTexts`，缺失/不存在 → 400 提示）
  2. 自动写入 `<key>_text` = 解析出的显示文本（多选按逗号分隔拼接，保持与 id 顺序一致）
- 级联校验：若配置了 dependOn，校验依赖字段值与目标记录匹配（filter 查询）

**列映射配置扩展**：`ColumnConfig` 增加 `hidden`（boolean）与 `pickerConfig`（JSON：sourceFormKey/displayField/mode，可选）——发布时 dataPicker 字段的 column_config 由前端生成两列并标记。

### D4. 前端运行时组件 `DataPicker.vue`

基于 LookupPicker 扩展（替换设计器注册的字典选择器 LookupPicker 用法）：
- props：从 form-create rule 透传（sourceFormKey/displayField/columns/mode/returnFields/dependOn）
- 可选值查询：构造 fetchApi → `bizDataApi.list(sourceFormKey, { page, size, keyword, keywordColumn: displayField, filter: 级联依赖 })`
- 级联：`watch` 依赖字段值 → 变化时 `api.setValue(field, null)` + 清空回填字段 + 刷新选项
- 回填：选中时按 returnFields `api.setValue`（复用现有 fillReturnFields）
- 只读：显示冗余文本（rule 初始值含 `<key>_text`，或通过 resolve API 补全）

**注册**：设计器 `addComponent` 注册 dataPicker（含默认 props），替换/并存现有 LookupPicker 注册。

### D5. 设计器配置弹窗 `DataPickerConfigDialog.vue`

双击 data-picker 字段打开（或在属性面板数据源 Tab 内）：
- **目标表单**：下拉列出所有已发布 BUSINESS 表单（`formApi.getFormDefinitions({ type: 'BUSINESS', status: 'PUBLISHED' })`），选中后调 `getFormDefinitionByKey` 取 column_config 带出可引用列
- **显示字段**：select（目标表非 hidden 列）
- **列表列**：multi-select（目标表非 hidden 列）
- **单多选**：radio
- **返回字段映射**：动态行（目标表字段 → 当前表单字段输入）
- **级联依赖**：当前表单字段 select + 目标表列 select（可选）
- 产出并写回字段 rule props

### D6. 展示与边界

- 管理页表格：hidden 列不进列配置（BizDataListPage 已按 column_config 生成列，需过滤 hidden）
- 详情/只读：DataPicker 只读态显示 `<key>_text`
- 目标表单未发布/引用列被删：发布校验拦截；运行时 resolve 失败 → 显示原始 id（不红碎）
- 被引用数据删除：`_text` 保留快照

### D7. 文件清单

```
后端：
  ColumnConfig.java          + hidden、pickerConfig 字段
  ColumnTypeMapper.java      + dataPicker → 两列映射
  DdlBuilder/测试             + hidden 列不建索引（unique/indexed 忽略）
  BizDataService.java        + resolveDisplayTexts、CRUD 冗余文本维护、引用校验
  BizDataController.java     + GET /{formKey}/resolve
  测试                       + 列映射/CRUD 维护/解析 API/级联校验
前端：
  views/form/components/DataPicker.vue        （运行时选择器，基于 LookupPicker）
  views/form/components/DataPickerConfigDialog.vue
  views/form/components/ColumnConfigDialog.vue（发布列映射：dataPicker → 两列草案）
  FormDesigner.vue                            （注册 dataPicker 组件 + 配置弹窗入口）
  api/bizData.ts                              + resolve API
  BizDataListPage.vue                         （过滤 hidden 列）
```

## Risks / Trade-offs

- [多选文本含逗号导致解析歧义] → v2 接受局限，文档标注；若出现再切换分隔符（如 \u0001）
- [被引用表单改列（displayField 被删）] → 发布校验拦截；已发布数据 `_text` 快照不受影响
- [级联依赖字段本身被引用方删除] → 运行时依赖字段为空 → 级联 filter 传空 → 显示全部选项；设计器配置时提示
- [冗余文本与 id 不一致（手工改库）] → 每次 create/update 重新生成 `_text`，自愈
- [resolve 性能（大量 data-picker 字段的列表）] → 单次批量 IN 查询，一次调用返回全部映射

## Migration Plan

1. 无数据库结构变更（动态表，发布时按新列映射规则建列）
2. 已发布表单不受影响（不含 dataPicker 字段的 column_config 不变）
3. 前端组件注册、后端 resolve API 为增量能力，向后兼容

## Open Questions

- data-picker 字段在审批快照（wf_form_data JSON）中的值形态：存 id + text 两字段，或仅 id——v2 默认与底表一致（id + text），渲染直接可读
- 跨租户引用：目标表单必须同租户（租户隔离天然保证）——确认
