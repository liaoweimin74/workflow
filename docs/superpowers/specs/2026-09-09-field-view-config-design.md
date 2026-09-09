# 字段视图配置（field view config）设计

> 日期：2026-09-09
> 状态：设计提案（待批准）
> 相关：数据源字段元数据（ColumnConfig）、数据管理页、页面/表单渲染器

## 1. 背景与问题

数据源字段元数据 `ColumnConfig` 目前混叠了三层职责：

| 职责 | 字段 | 完整性 |
|---|---|---|
| 物理/存储层 | key、columnType、length、scale、required、unique、indexed、hidden、storageMode、subColumns、subMode | ✅ 完整 |
| 数据能力层 | sortable、filterable、matchType | ✅ 完整（可推导/可配置） |
| 界面属性层 | componentType、pickerConfig | ⚠️ 只有类型声明，没有组件数据 |

而组件真正的「数据」（select/treeSelect 的 options、lookupPicker/dataPicker 的数据源配置、校验规则）**不在数据源元数据里**——它们锚定在**表单/页面 schema** 层：

- 表单字段控件配置 = form-create rule 的 props（options 静态数组/远程 API、lookupPicker 的 `dataSourceId`/`displayField`/`columns`/`searchColumns`/`filter`/`idField`/`returnFields`、dataPicker 的 sourceFormKey 等）
- 表单/页面级数据源绑定 = `schema.dataSources`（`{ id, refId }`，由 `activeDsBindings` 在运行时解析）
- 页面级搜索字段配置 = `SearchFieldsConfig`（`{ key, label, matchType }[]`，存页面 schema）

渲染端（PageDataTable、PageDataCards、数据管理页 DataSourceDataPage）实际是**混合模式**：`metadataColumns[i].componentType` 决定组件类型 + `formSchemaRule`（数据源 metadata 返回 formKey → 加载表单 schema）提供组件数据；`formKey` 为空时回退 `buildFormRule()` 列映射生成的简化表单。

**结论**：完整渲染被隐式绑定在 formKey 上。**无表单绑定的独立数据源**（纯 SQL 查询 / 第三方 API，不带 formKey）无法渲染 select/lookupPicker 等完整组件——这是本设计要解决的问题（该场景已确认为硬需求）。

## 2. 设计目标

1. **职责分离**：ColumnConfig 顶层只承载「物理 + 数据能力」；界面属性与组件数据独立命名空间承载
2. **无表单数据源完整渲染**：不绑定 formKey 也能渲染 select 选项、lookupPicker 数据源等完整组件
3. **现有消费方与存量数据零破坏**：metadata 接口结构不变，渲染方零改动
4. **与既有惯例一致**：界面配置归属界面层（schema/view），不把组件数据塞进数据层

## 3. 方案对比

| 方案 | 思路 | 优点 | 代价 |
|---|---|---|---|
| A. 数据源视图配置层 | 元数据瘦身，新建 `viewConfig` 实体承载界面属性+组件数据 | 职责单一；无表单数据源完整渲染；优先级显式 | 新实体/存储；UI 迁移；存量兼容 |
| B. 元数据内补全组件数据 | 承认 ColumnConfig=字段级视图模型，pickerConfig 扩展为完整组件数据 | 改动小 | 双重事实来源（与表单 schema 永久双轨）；数据源语义越来越重 |
| C. 元数据瘦身+渲染推导 | 移除全部界面属性，无表单时退化为基础控件 | 架构最纯粹 | 不满足「无表单数据源完整渲染」硬需求 |

**选定：方案 A 的轻量落地（A-lite）**——不新建实体，`params.columns[i]` 增加 `view` 子对象作为视图层命名空间，未来需要独立实体时从 `view` 整体拆出。

## 4. 详细设计

### 4.1 数据结构

```jsonc
// DataSource.params.columns[i]
{
  // —— 物理/存储层（顶层，不变）——
  "key": "dept",
  "label": "部门",
  "columnType": "VARCHAR",
  "length": 64,
  "scale": null,
  "required": false,
  "unique": false,
  "indexed": true,
  "hidden": false,
  "storageMode": "JSON",
  // subColumns / subMode（子表，不变）

  // —— 数据能力层（顶层，不变）——
  "sortable": false,
  "filterable": true,

  // —— 视图层（新增 view 子对象）——
  "view": {
    "componentType": "select",        // 组件类型（form-create rule type 语义）
    "matchType": "eq",                // 查询方式：eq | like | range，null=按类型推导
    "formProps": {                    // 组件数据（对齐 schema.rule props 形态）
      // select/radio/checkbox 静态选项
      "options": [{ "label": "研发", "value": "R&D" }],
      // 或远程选项（数据源引用，与表单级绑定同机制）
      "dataSourceId": "ds_bind_1",
      "displayField": "name",
      "columns": [{ "prop": "name", "label": "名称" }],
      "searchColumns": ["name"],
      "filter": { "logic": "AND", "conditions": [] },
      "idField": "id",
      "returnFields": { "name": "deptName" }
      // lookupPicker/dataPicker 沿用现有 LookupPickerProps 全量配置结构
    }
  }
}
```

### 4.2 渲染优先级（显式化）

```
表单 schema.rule 字段配置（有 formKey）  >  columns[i].view  >  类型推导
```

| 场景 | 组件类型来源 | 组件数据来源 |
|---|---|---|
| 有 formKey | schema.rule（现状不变） | schema.rule props（现状不变） |
| 无 formKey，有 view | view.componentType | view.formProps |
| 无 formKey、无 view | 类型推导（现状退化，可接受） | —（基础控件） |

### 4.3 metadata 接口兼容反填

`GET /data-sources/{id}/metadata` 返回的列结构**保持不变**（顶层仍含 `componentType`/`pickerConfig`/`matchType`），但取值规则变为：

```
顶层 componentType = columns[i].view?.componentType ?? 顶层旧值 ?? null<sup>1</sup>
顶层 pickerConfig   = columns[i].view?.formProps ? JSON.stringify({ formProps: view.formProps }) : 顶层旧值 ?? null
顶层 matchType      = columns[i].view?.matchType ?? 顶层旧值 ?? null

> <sup>1</sup>「顶层旧值」指存量数据源 params.columns 顶层已有的 componentType/pickerConfig/matchType；新保存不再写入顶层（见 4.4），旧值随首次重新保存自然消失。

→ PageDataTable / PageDataCards / 数据管理页等现有消费方**零改动**。

### 4.4 保存链路

- 字段元数据 tab 编辑的界面属性（组件类型/查询方式/组件数据）**写入 `columns[i].view`**
- 顶层旧值（存量 `componentType`/`pickerConfig`/`matchType`）保留，仅作反填兜底
- 保存动作幂等：新保存只写 view，存量数据自然收敛，无需一次性迁移任务

### 4.5 UI 承载（数据管理页字段元数据 tab）

保持单 tab（心智连续，保留「查询方式」列），界面属性独立分区：

- 「查询方式」下拉：保留现状（等值/模糊/范围，按列类型裁剪）
- 「组件类型」：新增下拉（input/select/treeSelect/datePicker/lookupPicker/dataPicker…；有 formKey 时提示「表单 schema 优先」）
- 「组件数据」：新增入口按钮（select 类 → options 编辑；lookupPicker/dataPicker → 复用 `LookupPickerConfigDialog`/`DataPickerConfigDialog`，改造为可脱离表单 schema 独立使用；选项数据源复用 `UniDataSourceBinding` 绑定机制）
- 详情弹窗增加对应只读展示行

### 4.6 后端变更

- `FormQueryConfig.parseColumns`：解析 `view` 子对象（写入 ColumnConfig 的 `view` 字段）
- `UnifiedDataSourceAdapter.metadata()`：反填逻辑（view 优先 → 顶层旧值兜底，见 4.3）
- ColumnConfig 新增嵌套类型（顶层旧字段 componentType/pickerConfig/matchType 保留用于存量兜底）：

  ```java
  /** 视图层配置（界面属性 + 组件数据；null=未配置，由前端按类型推导） */
  private ViewConfig view;

  /** 字段级视图配置 */
  public static class ViewConfig {
      /** 组件类型（form-create rule 的 type 语义，如 select/lookupPicker） */
      private String componentType;
      /** 查询方式 eq/like/range；null=未配置 */
      private String matchType;
      /** 组件数据（对齐 schema.rule props 形态：options/dataSourceId/displayField/columns/searchColumns/filter/idField/returnFields 等） */
      private Map<String, Object> formProps;
  }
  ```

- SQL/API 数据源探测：view 恒为空（探测只出物理结构）；人工配置写入 view

### 4.7 边界与不作事项

- 不改表单定义 `columnConfig`（业务表单发布产出的列映射，属于表单域，保留现状）
- 不改页面 `SearchFieldsConfig`（页面域配置，继续存页面 schema）
- 不做存量数据一次性迁移（读取反填 + 保存收敛即可）
- 本文档不含实施任务拆分；实施范围与步骤以 OpenSpec 变更（/opsx-propose）为准

## 5. 测试计划

后端：
- FormQueryConfigTest：`view` 解析（componentType/matchType/formProps 全字段、空 view、缺 view）
- UnifiedDataSourceAdapterTest：metadata 反填（view 优先、顶层旧值兜底、view 为空）
- 保存往返：保存含 view 的 columns → 重新读取一致

前端：
- 字段元数据 tab：组件类型/查询方式/组件数据编辑 → 保存 → 重开往返（含 view 子对象）
- 无 formKey 数据源：搜索栏组件化（select 静态选项渲染、lookupPicker 数据源配置生效）、编辑表单组件化
- 优先级链：有 formKey 时 schema 生效优先于 view（回归现状）
- 现有回归：bizTableLayout / SearchTable / DataSourceListPage / DataSourceDataPage 全量测试保持通过

## 6. 相关文件

- 前端：`frontend/src/views/dataSource/DataSourceListPage.vue`（字段元数据 tab、serializeColumnConfig/toColumnConfigItem）、`frontend/src/utils/bizTableLayout.ts`（buildSearchFields/buildTableColumns/collectFilterConditions/filterableColumnsOf）、`frontend/src/views/form/components/UniDataSourceBinding.vue`、`LookupPickerConfigDialog.vue`、`DataPickerConfigDialog.vue`
- 后端：`backend/src/main/java/com/workflow/engine/form/column/ColumnConfig.java`、`.../form/bizdata/FormQueryConfig.java`、`.../datasource/UnifiedDataSourceAdapter.java`
- 消费方（零改动验证）：`frontend/src/views/page/components/PageDataTable.vue`、`PageDataCards.vue`、`frontend/src/views/dataSource/DataSourceDataPage.vue`、`frontend/src/components/business/SearchTable.vue`