# Design: SQL 数据源 + 可视化查询构建

## Context

当前系统有四种数据源类型：FORM（表单单表 CRUD）、SYSTEM（系统结构）、API（外部接口）、WORKFLOW（工作流）。FORM 数据源通过 `params.queryMode` 扩展了 config（声明式 JOIN）和 sql（管理员 SQL 模板）两种查询模式，但这带来了语义模糊（FORM + 裸 SQL）、配置入口别扭（发布后才能编辑 queryMode）、params 膨胀等问题。

用户需求：
1. 独立的 SQL 数据源类型，不依赖表单定义
2. 可视化查询构建（表级配置，零 SQL 知识即可使用）
3. SQL 编辑器模式（手写 SQL，完全灵活）
4. 两种模式可互相切换
5. 可选绑定主表单（合并表单列 + 可写）

**现有约束**：
- `DataSourceAdapter` SPI：统一 metadata/query/get/create/update/delete 分发
- `SqlTemplateEngine`：SQL 模板包裹 + 分页 + 参数绑定
- `JoinSqlGenerator`：config 模式 SQL 生成（可复用部分逻辑）
- 前端 `PageDataTable.vue` 通过 metadata + queryData 协议消费

## Goals / Non-Goals

**Goals:**
- 新增 `type=SQL` 数据源类型，独立于 FORM
- 支持可视化查询构建（表级配置：选表→选列→配 JOIN→配条件）
- 支持 SQL 编辑器模式（手写 SQL + 列声明）
- 可视化↔SQL 双向切换（保存时生成 SQL，手改后可视化锁定）
- 可选绑定主表单（formKey）：合并表单列 + 可写 + 生命周期绑定
- 复用现有 `SqlTemplateEngine` 执行引擎

**Non-Goals:**
- 不做图形化拖拽查询构建器（ER 图+连线，投入产出比低）
- 不做 SQL→可视化反向解析（复杂度极高，覆盖场景有限）
- 不改变 FORM/SYSTEM/API 数据源的现有行为
- 不引入新的前端依赖（纯 Element Plus 实现）

## Decisions

### D1: 新增 SQL 数据源类型

`type=SQL` 独立于 FORM，不复用 FORM 的 `params.queryMode` 扩展。

```
数据源类型：
├── FORM   → 单表 CRUD（现有行为，不变）
├── SQL    → SQL 模式查询（新建）
│   ├── 可视化模式（表级配置，系统生成 SQL）
│   ├── SQL 模式（手写 SQL）
│   └── 两者可切换（可视化→查看生成 SQL→微调）
├── SYSTEM → 系统结构（不变）
└── API    → 外部接口（不变）
```

理由：
- 语义清晰："SQL 数据源"就是做查询的，不混淆表单概念
- 配置独立：不需要先发布表单再配置查询
- 与 FORM 解耦：FORM 专注 CRUD，SQL 专注查询

### D2: params JSON 结构

```jsonc
// SQL 数据源 params
{
  "formKey": "order",                    // 可选：主表单绑定
  "queryMode": "visual",                 // "visual" | "sql"
  "visual": {                            // 可视化配置（结构化）
    "mainTable": "order",                // 主表（formKey 或物理表名）
    "mainAlias": "m",                    // 主表别名
    "joins": [{                          // JOIN 配置
      "alias": "c",
      "targetTable": "customer",
      "joinType": "LEFT",
      "on": "c.id = m.customer_id",
      "columns": ["c.name", "c.email"]
    }],
    "selectColumns": ["m.order_no", "m.total", "c.name AS customer_name"],
    "where": [{ "column": "m.total", "op": ">=", "value": 100 }],
    "orderBy": [{ "column": "m.created_at", "order": "DESC" }]
  },
  "query": "SELECT m.order_no, m.total, c.name AS customer_name FROM wf_biz_order m LEFT JOIN wf_biz_customer c ON c.id = m.customer_id WHERE m.total >= ? AND m.tenant_id = ? ORDER BY m.created_at DESC",
  "columns": [
    { "key": "order_no", "label": "订单号", "columnType": "VARCHAR", "sortable": true, "filterable": true },
    { "key": "total", "label": "总金额", "columnType": "DECIMAL", "sortable": true, "filterable": true },
    { "key": "customer_name", "label": "客户名称", "columnType": "VARCHAR", "sortable": true, "filterable": true }
  ],
  "params": ["startTime", "endTime"]
}
```

关键点：
- `visual` 和 `query` 同时保存：`visual` 是编辑器渲染数据，`query` 是执行引擎输入
- `queryMode` 区分当前模式：`visual`（可视化）或 `sql`（手写）
- `columns` 两种模式共用：声明列的 key/label/columnType/sortable/filterable
- `params` 运行时参数白名单

### D3: formKey 绑定机制

SQL 数据源可选绑定主表单（`formKey`），影响三个层面：

**查询输入（表名映射）**：
- 有 formKey：表名下拉显示已发布表单名称，实际 SQL 用 `wf_biz_<formKey>`
- 无 formKey：表名直接输入物理表名

**查询输出（列合并）**：
- 有 formKey：`formDefService.getBusinessColumnsByKey(formKey)` + SQL 声明列，合并去重（表单列优先）
- 无 formKey：仅 SQL 声明列

**写操作**：
- 有 formKey + writable：CRUD 映射到主表 `wf_biz_<formKey>`，虚拟列只读
- 无 formKey：writable=false，全只读

**生命周期**：
- 有 formKey：表单发布自动生成/更新 SQL 数据源，表单改列时 metadata 自动跟随
- 无 formKey：独立管理，不受表单生命周期影响

### D4: 可视化↔SQL 双向切换 + 手改锁定

**保存策略**：
- 可视化配置修改 → `VisualSqlGenerator` 生成 SQL → 同时保存 `visual` + `query`
- SQL 模式手写 → 直接保存 `query`，`visual` 标记为 stale

**手改锁定（策略 A）**：
- 用户在 SQL 模式手改 SQL 后，`visual` 配置标记为"过期"
- 可视化 tab 灰显，显示提示："SQL 已手动修改，可视化配置已锁定"
- 提供「重置为可视化」按钮：丢弃手写 SQL，用 `visual` 重新生成

理由：
- 反向解析（SQL→结构化配置）投入产出比极低
- 只读锁定语义最清晰，满足 99% 场景
- 大多数用户要么用可视化，要么手写 SQL，不反复切换

### D5: SQL 生成时机

SQL 在**保存时生成**，不是查询时实时生成。

```
前端保存 → VisualSqlGenerator.generate(visual) → 生成 SQL
        → SqlTemplateValidator.validate(sql, columns, params) → 校验
        → 保存到 wf_data_source.params（含 visual + query + columns + params）
```

查询时统一走 `querySql()`，不区分 visual/sql。

理由：
- 保存时生成可校验 SQL 合法性
- 查询时不需要额外计算开销
- 生成的 SQL 可被管理员查看和微调

## Architecture

### 后端新增组件

| 组件 | 职责 | 位置 |
|---|---|---|
| `VisualQueryRequest` | 可视化配置 DTO | `api/dto/` |
| `VisualSqlGenerator` | 可视化配置→SQL 生成 | `engine/datasource/` |
| `SqlBuilderController` | 预览 SQL 接口 | `api/controller/` |

### 前端新增组件

| 组件 | 职责 | 位置 |
|---|---|---|
| `VisualQueryBuilder.vue` | 可视化查询构建器 | `views/dataSource/components/` |
| `SqlEditor.vue` | SQL 文本编辑器（只读预览 + 手写） | `views/dataSource/components/` |
| `FieldMappingPreview.vue` | 字段映射预览（列合并展示） | `views/dataSource/components/` |

### 数据流

```
前端可视化配置 / SQL 文本
        ↓
  后端 VisualSqlGenerator（可视化→SQL）或 直接使用 SQL 文本
        ↓
  FormQueryConfig.parse(params) → isVisualMode / isSqlMode
        ↓
  SqlTemplateEngine.wrap(sql, ...) → 子查询包裹 + 分页
        ↓
  SqlQueryEngine.execPage() → BizDataPageVO
```

## UI Design

### SQL 数据源对话框布局

```
┌─────────────────────────────────────────────────────────┐
│ 新建/编辑 SQL 数据源                                      │
├─────────────────────────────────────────────────────────┤
│ 名称：[订单查询数据源          ]                          │
│ 主表单：[订单 ▼]（可选）  ← 有值时显示字段映射入口        │
├─────────────────────────────────────────────────────────┤
│ [可视化配置]  [SQL 模式]  ← tab 切换                     │
├─────────────────────────────────────────────────────────┤
│  （tab 内容根据选中模式展示）                              │
├─────────────────────────────────────────────────────────┤
│ 字段元数据（只读展示）                                    │
│ 数据预览                                                │
└─────────────────────────────────────────────────────────┘
```

### 可视化配置 Tab

```
┌─ 主表 ──────────────────────────────────────────────────┐
│ 表：[订单 ▼]     别名：[m]（自动生成）                   │
├─ 关联表 ────────────────────────────────────────────────┤
│ ┌─ JOIN #1 ───────────────────────────────────────────┐ │
│ │ 表：[客户 ▼]  别名：[c]  类型：[LEFT JOIN ▼]        │ │
│ │ ON：[c.id] = [m.customer_id]                        │ │
│ │ 显示列：[✓] name  [✓] email  [ ] phone             │ │
│ │ 筛选：[name] [LIKE ▼] [请输入...]                  │ │
│ │ 排序：[name] [ASC ▼]                               │ │
│ └─────────────────────────────────────────────────────┘ │
│ [+ 添加关联表]                                          │
├─ 筛选条件 ──────────────────────────────────────────────┤
│ [total ▼]  [>= ▼]  [100]                              │
├─ 排序 ──────────────────────────────────────────────────┤
│ [created_at ▼]  [DESC ▼]                               │
├─ 运行时参数 ────────────────────────────────────────────┤
│ [startTime] [endTime]                                   │
├─ SQL 预览（只读）───────────────────────────────────────│
│ SELECT m.order_no, m.total, c.name AS customer_name     │
│ FROM wf_biz_order m                                     │
│ LEFT JOIN wf_biz_customer c ON c.id = m.customer_id     │
│ WHERE m.total >= ? AND m.tenant_id = ?                  │
└─────────────────────────────────────────────────────────┘
```

### SQL 模式 Tab

```
┌─ SQL 模式 ──────────────────────────────────────────────┐
│ SQL 模板：                                              │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ SELECT m.order_no, m.total,                         │ │
│ │        c.name AS customer_name                      │ │
│ │ FROM wf_biz_order m                                 │ │
│ │ LEFT JOIN wf_biz_customer c                         │ │
│ │   ON c.id = m.customer_id                           │ │
│ │ WHERE m.tenant_id = :tenantId                       │ │
│ └─────────────────────────────────────────────────────┘ │
│ columns 声明：                                          │
│ [key: order_no] [label: 订单号] [VARCHAR]              │
│ [key: customer_name] [label: 客户名称] [VARCHAR]       │
│ [+ 添加列]                                              │
│ 运行时参数：[startTime] [endTime]                       │
│ [从 SQL 解析列] ← 自动提取 SELECT 输出列                │
└─────────────────────────────────────────────────────────┘
```

### 字段映射预览（formKey 有值时）

```
┌─ 字段映射 ──────────────────────────────────────────────┐
│ 主表单：订单（3 列）                                     │
│ SQL 声明列：2 列                                         │
│ 合并后：4 列（1 列去重）                                 │
├────────────────────────────────────────────────────────┤
│ 来源     │ key            │ label      │ 类型   │ 可写 │
│──────────┼────────────────┼────────────┼────────┼──────│
│ 表单     │ customer_id    │ 客户ID     │ VARCHAR│ ✓   │
│ 表单     │ order_no       │ 订单号     │ VARCHAR│ ✓   │
│ 表单     │ total          │ 总金额     │ DECIMAL│ ✓   │
│ SQL 声明 │ customer_name  │ 客户名称   │ VARCHAR│ ✗   │
└────────────────────────────────────────────────────────┘
```

## Testing

### 单元测试

| 组件 | 测试重点 | 预估用例 |
|---|---|---|
| `VisualSqlGenerator` | SELECT/FROM/JOIN/WHERE/ORDER BY 生成 | 8-10 |
| `VisualSqlGenerator` | 表名映射（formKey→物理表名） | 3-4 |
| `FormQueryConfig` | queryMode=visual 解析 | 3-4 |
| `SqlTemplateValidator` | visual 生成的 SQL 校验 | 2-3 |
| `UnifiedDataSourceAdapterTest` | SQL 类型 visual/sql 分流 | 4-5 |

### 集成测试

- `sqlVisualMode_queryReturnsJoinedRows`：可视化配置→查询→关联数据
- `sqlVisualMode_filterAndSort`：筛选+排序端到端
- `sqlVisualMode_formKeyBinding`：主表单绑定→CRUD 可写
- `sqlVisualMode_noFormKeyReadonly`：无主表单→只读

### 前端测试

- `VisualQueryBuilder.vue`：表选择→列选择→条件配置→SQL 预览
- `DataSourceListPage.vue`：SQL 数据源保存→visual+query 双存→重新加载

## Migration

### 向后兼容

- 现有 FORM 数据源的 `params.queryMode` 扩展保留（config/sql 模式继续工作）
- 新增 `type=SQL` 不影响现有数据源
- 无 `type=SQL` 的数据源记录时，系统正常运行

### 数据迁移

无需迁移。SQL 数据源是新增类型，现有数据不受影响。
