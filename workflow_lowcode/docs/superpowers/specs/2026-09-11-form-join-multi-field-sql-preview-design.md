# Design: 声明式 JOIN 多字段合并 + SQL 预览

## Context

现有声明式 JOIN（FORM 数据源 queryMode=config）每行配置一条关联（`JoinConfig`：localField / targetFormKey / foreignField / joinField / virtualKey / label / alias），后端 `JoinSqlGenerator` 每个 join 生成一条 `SELECT` 虚拟列 + 一条 `LEFT JOIN`。

**两个问题：**

1. **同表多个显示字段会生成重复 LEFT JOIN**。例如从订单 JOIN 客户表同时展示 name/phone/email 三个字段，需配置 3 行，且 3 行共享完全相同的连接条件（localField/customer_id、targetFormKey/customer、foreignField/id）。当前实现会生成 3 条 `LEFT JOIN wf_biz_customer` —— 同表连接 3 次，ON 条件命中多条时**结果集重复膨胀**（逻辑错误）。
2. **别名 alias 需用户手动输入**。alias 是内部 SQL 标识符（j1/j2...），用户填写无实际意义、容易填错（重复/非法字符导致保存失败）。

**目标：** 同连接条件的多行合并为一行 SQL（一个 LEFT JOIN + 多个 SELECT 字段），alias 由系统按组自动分配，并提供 SQL 预览能力。

## Goals / Non-Goals

**Goals:**
- 按 (localField, targetFormKey, foreignField) 分组：组内多个 joinField → 一条 LEFT JOIN + 多个 SELECT 虚拟列
- alias 不再由用户输入：前端移除「别名」列；后端生成 SQL 时按组自动分配 j1..jN
- 前端新增「预览 SQL」：配置完成后可查看系统生成的 SQL 文本
- 存量数据兼容：已保存的 joins 配置（带 alias）继续可用

**Non-Goals:**
- 不做 SQL→可视化反向解析
- 不改查询侧协议（metadata/queryData 同 SPI）
- 不改变无 queryMode 数据源行为
- 不做 JOIN 写操作（JOIN 仅查询语义）

## 现状（改动前）

**前端 `FormJoinConfig.vue`：** 表格含「别名」列（`row.alias` 输入框）；`JoinConfigItem` 类型含 `alias` 字段；`emptyJoin` 生成 `alias: 'j${index+1}'`。

**后端 `JoinSqlGenerator`：**

```java
buildSelect: "SELECT m.*" + 每个 join ", {alias}.{joinField} AS {virtualKey}"
             + " FROM {mainTable} m" + 每个 join " LEFT JOIN wf_biz_{targetFormKey} {alias} ON {alias}.{foreignField} = {localRef}"
```

**`BizDataSupport.buildJoinColumns`：** 虚拟列 ref = `j.alias() + "." + j.joinField()`。

**`DataSourceDefinitionService.validateConfigJoins`：** alias 必填、正则校验、唯一性校验。

## 设计

### D1: 分组模型（后端 JoinSqlGenerator）

分组键 = `(localField, targetFormKey, foreignField)`。分组结果内聚在 `JoinSqlGenerator`，避免散落：

```java
/** 分组后的 JOIN 单元：共享连接条件，携带组内字段成员 */
public record JoinGroup(String alias,              // 自动分配 j1..jN（组序）
                        String targetFormKey,
                        String localField,
                        String foreignField,
                        List<JoinConfig> members) {}  // 组内成员（joinField/virtualKey/label/能力各异）

/** 按 (localField, targetFormKey, foreignField) 分组；保序，组序即 alias 序号（j1, j2, ...） */
public static List<JoinGroup> group(List<JoinConfig> joins)
```

- 组内成员共享 `targetFormKey/localField/foreignField`；`members` 列出要 SELECT 的各字段（joinField + virtualKey + label + sortable/filterable）
- `JoinConfig.alias` 字段**保留**（存量兼容 parse），但生成 SQL 时**全部忽略**，以分组分配的 alias 为准

**`buildSelect` / `buildCount` 改为按组生成：**

```sql
-- 3 行同条件（customer_id→customer.id）的 name/phone/email 配置生成：
SELECT m.*,
  j1.name  AS customer_name,
  j1.phone AS customer_phone,
  j1.email AS customer_email
FROM wf_biz_order m
LEFT JOIN wf_biz_customer j1 ON j1.id = JSON_UNQUOTE(JSON_EXTRACT(m.customer_id,'$[0]'))
WHERE m.tenant_id = ?
```

- SELECT 段：遍历所有组的所有成员 → `{group.alias}.{joinField} AS {virtualKey}`
- LEFT JOIN 段：每组一条 → `LEFT JOIN wf_biz_{targetFormKey} {alias} ON {alias}.{foreignField} = {localRef}`
- 筛选/排序/关键词/分页/租户注入逻辑不变（`resolveRef` 基于 columns 的 ref，ref 已用分组 alias 构建）

**`validate`：** 移除 alias 必填/唯一校验（alias 可空，保留存量兼容）；virtualKey 唯一校验保留。

### D2: 列映射（BizDataSupport）

`buildJoinColumns` 虚拟列 ref 改用分组 alias：

```java
for (JoinSqlGenerator.JoinGroup g : JoinSqlGenerator.group(joins)) {
    for (JoinConfig m : g.members()) {
        columns.add(new QueryColumn(m.virtualKey(), g.alias() + "." + m.joinField(),
                resolveJoinColumnType(m), m.sortable(), m.filterable()));
    }
}
```

### D3: 保存校验调整（DataSourceDefinitionService）

`validateConfigJoins`：
- 删除 alias 必填 + 正则校验（非法/重复 alias 不再报错，反正生成时忽略）
- 保留：targetFormKey/localField/foreignField/joinField/virtualKey 必填、virtualKey 唯一
- 可选增强：同组不同成员 virtualKey 不得相同（已有唯一校验覆盖）

### D4: SQL 预览接口（后端新增）

**端点：** `POST /api/v1/data-sources/join-preview`（`DataSourceController`）

**请求：**
```jsonc
{
  "formKey": "biz_order",                       // 主表单 key（决定主表名 + 主表列候选）
  "joins": [                                     // 与保存配置同构，alias 可省略
    { "targetFormKey": "biz_customer", "localField": "customer_id", "foreignField": "id",
      "joinField": "name", "virtualKey": "customer_name", "label": "客户名称",
      "sortable": true, "filterable": true }
  ]
}
```

**响应：** `R<JoinPreviewVO>`，`JoinPreviewVO(sql, params)`：
- `sql`：`joinSqlGenerator.buildSelect(...)` 生成的完整文本（无筛选/无关键词/默认排序 created_at/不分页）
- `params`：参数绑定列表（含 tenantId 占位符对应值，供展示）

**实现：** 新增 `DataSourceDefinitionService.previewJoinSql(String formKey, List<JoinConfig> joins)`：
- 校验 formKey 合法 + `BizDataSupport.loadContext(formKey)` 存在
- 构建 columns（复用 buildJoinColumns 逻辑）+ `JoinSqlGenerator.buildSelect(mainTable, tenantId, joins, columns, emptyFilter, null, null, null, null, 0, 0)`
- 异常（非法 joins / 表不存在）→ 400

### D5: 前端 UI 调整（FormJoinConfig.vue）

1. **删除「别名」列**，`JoinConfigItem` 类型移除 `alias` 字段，`emptyJoin` 不再生成 alias
2. **新增「预览 SQL」按钮 + 展示区**：
   - config 模式表格下方：「预览 SQL」按钮（disabled 时不显示；无有效行时禁用）
   - 点击 → 调预览接口 → 在展开区域展示 SQL 文本（`<pre>` + 参数列表小字说明）
   - 数据变更后按钮可再次点击刷新预览
3. 保存载荷（`DataSourceListPage.buildFormParams`）自然不再包含 alias

### D6: 预览展示交互

- 预览区域：表格下方 collapsible 展开（`el-collapse` 或 `v-if` + 复制按钮）
- SQL 文本只读展示，`params` 以注释形式展示（如 `-- params: [tenantId]`）
- 预览失败（校验错）→ 内联展示后端 400 错误消息

## 迁移路径

1. 存量 joins 配置（带 alias）：后端 parse 照常读取（`JoinConfig.alias` 保留字段），生成 SQL 时忽略 alias、按组重分配 → 行为升级为"同条件合并一条 LEFT JOIN"，结果更正确（消除重复 JOIN 膨胀）
2. 新建配置：前端不再录入 alias
3. 预览为辅助能力，不影响保存/查询链路

## Impact

- **后端：**
  - `JoinSqlGenerator` — 分组模型 `JoinGroup` / `group()`、buildSelect/buildCount 按组生成、validate 调整
  - `BizDataSupport.buildJoinColumns` — 虚拟列 ref 改分组 alias
  - `DataSourceDefinitionService` — validateConfigJoins 调整 + 新增 previewJoinSql
  - `DataSourceController` — 新增 `POST /join-preview` 端点
  - 新增 DTO：`JoinPreviewVO`
- **前端：**
  - `FormJoinConfig.vue` — 删别名列、JoinConfigItem 去 alias、预览按钮+展示区
  - `DataSourceListPage.vue` — 保存载荷自然变化（无 alias）
- **测试：**
  - `JoinSqlGeneratorTest` — 新增分组用例（同条件多字段合并、不同条件分条、保序 alias 分配）
  - `FormJoinQueryIntegrationTest` — 更新 join SQL 期望（同表重复 join 合并）
  - `DataSourceDefinitionServiceTest` — validateConfigJoins 去掉 alias 必填断言、previewJoinSql 用例
  - 前端 `FormJoinConfig` 相关测试（如有）同步更新