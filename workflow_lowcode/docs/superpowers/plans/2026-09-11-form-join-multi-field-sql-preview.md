# 声明式 JOIN 多字段合并 + SQL 预览 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 声明式 JOIN 按 (localField, targetFormKey, foreignField) 分组合并为一行 SQL（一个 LEFT JOIN + 多 SELECT 字段），alias 系统自动分配，前端新增 SQL 预览。

**Architecture:** 后端 `JoinSqlGenerator` 新增分组模型 `JoinGroup` + `group()`，`buildSelect`/`buildCount` 按组生成 LEFT JOIN，`BizDataSupport.buildJoinColumns` 虚拟列 ref 改用分组 alias；新增 `POST /api/v1/data-sources/join-preview` 预览端点（挂在 `BizDataSupport`，controller 注入该组件）。前端 `FormJoinConfig.vue` 删除别名列、`JoinConfigItem` 去 alias、新增「预览 SQL」按钮与展示区。

**Tech Stack:** Java 17 / Spring Boot / JUnit 5 + AssertJ；Vue 3 + Element Plus + TypeScript + Vitest。

## Global Constraints

- 项目使用 TDD（RED → GREEN → REFACTOR），先写失败测试再实现
- 后端测试命令：`mvn -pl backend test -Dtest=<类名>`（项目根目录执行）；前端：`npx vitest run <file>`
- 所有标识符（列/表/排序）来自调用方传入的 QueryColumn 映射或内置白名单，值全部参数绑定，杜绝 SQL 注入
- 存量数据兼容：`JoinConfig.alias` 字段**保留解析**（`FormQueryConfig.parseJoins` 用 `text(n,"alias")` 允许 null，无强制校验，已确认），生成 SQL 时**全部忽略**、按组重新分配
- 响应封装统一为 `R<T>`（`{ code, data, message }`）
- 本地修改直接作用 `main` 分支（本会话既有约定，无需 worktree）
- 本仓库不委派子代理，由主代理直接实现

## Verified Facts (计划假设已代码验证)

- `BizDataSupport.buildJoinColumns(BizDataContext, List<JoinConfig>)` 是 **private**（line 334），当前 ref = `j.alias() + "." + j.joinField()`（line 345）→ 改为 `g.alias()`；`resolveJoinColumnType`（line 352）保留
- `BizDataSupport` 已有 `loadContext(formKey)`（校验 formKey 合法 + 主表存在，404）与 `tenantProvider` 字段 → preview 方法放这里最合适
- `DataSourceDefinitionService` 构造只含 repository/ObjectMapper/adapters（注释明确「结构性排除动态建表」）→ **不注入 BizDataSupport**
- `DataSourceController` 现在是 `private final DataSourceDefinitionService` 单字段构造注入 → 新增 `BizDataSupport` 注入
- `DataSourceDefinitionServiceTest` 用 `join(alias, ...)` helper（line 718-724），断言 `assertEquals(params, result.getParams())` 原样保存；**无任何「alias 非法/缺失」断言** → 移除校验零回归
- `FormJoinConfig.vue`：alias 输入列在 272-276 行；`emptyJoin(index)`（31-43 行）生成 `alias: 'j{index+1}'`；`addJoin`/queryMode setter 调 `emptyJoin(0)` 与 `emptyJoin(joins.value.length)` → 删除 alias 后调用签名不变

---

### Task 1: JoinSqlGenerator 分组模型与按组生成

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/form/bizdata/JoinSqlGenerator.java`
- Test: `backend/src/test/java/com/workflow/engine/form/bizdata/JoinSqlGeneratorTest.java`

**Interfaces:**
- Consumes: 现有 `JoinConfig(alias, targetFormKey, localField, foreignField, joinField, virtualKey, label, sortable, filterable)` record
- Produces: 新增 `record JoinGroup(String alias, String targetFormKey, String localField, String foreignField, List<JoinConfig> members)`；新增 `static List<JoinGroup> group(List<JoinConfig> joins)`；`buildSelect`/`buildCount` 签名不变但按组生成；`validate` 移除 alias 校验

- [ ] **Step 1: 更新现有单测断言（分组后 alias 自动分配 j1..jN）**

`JoinSqlGeneratorTest.java`：

- `CUSTOMER_JOIN`（line 20-22）alias `"c"` 保留（记录字段可任意），但**所有期望 SQL 中** `c.` → `j1.`、`LEFT JOIN wf_biz_customer c` → `LEFT JOIN wf_biz_customer j1`
- `queryColumns()`（line 171-179）虚拟列 ref：`"c.name"` → `"j1.name"`、`"u.nickname"` → `"j2.nickname"`
- `buildSelect_singleJoin_generatesLeftJoinAndVirtualColumn`（line 34-36）期望改为：
  `"SELECT m.*, j1.name AS customer_name FROM wf_biz_order m" + " LEFT JOIN wf_biz_customer j1 ON j1.id = JSON_UNQUOTE(JSON_EXTRACT(m.customer_id,'$[0]'))" + " WHERE m.tenant_id = ? ORDER BY m.created_at DESC LIMIT ? OFFSET ?"`
- `buildSelect_multiJoin_keepsOrderAndAvoidsCollision`（line 50-54）：客户 join → j1、用户 join → j2，期望含两条 LEFT JOIN
- `buildSelect_localFieldPlainColumn_joinsDirectlyWithoutJsonExtract`（line 74-77）：`c.` → `j1.`；plainColumns 中 ref `"c.name"` → `"j1.name"`
- `buildSelect_virtualColumnFilter_injectsQualifiedCondition`（line 89-93）：`c.name LIKE` → `j1.name LIKE`
- `buildSelect_virtualColumnSort_sortsByQualifiedColumn`（line 115）：`ORDER BY c.name` → `ORDER BY j1.name`
- `buildCount_noLimitMatchesSelectJoins`（line 137-140）：`LEFT JOIN wf_biz_customer c` → `j1`
- `validate_duplicateVirtualKey_rejected`（line 145-154）：保留不变（virtualKey 唯一校验仍有效）

- [ ] **Step 2: 运行单测验证失败**

Run: `mvn -pl backend test -Dtest=JoinSqlGeneratorTest`
Expected: FAIL — SQL 仍输出 `c.` 而断言期望 `j1.`

- [ ] **Step 3: 新增分组用例测试（先写后实现）**

在 `JoinSqlGeneratorTest.java` 追加：

```java
@Test
void buildSelect_sameJoinConditionMultipleFields_mergesIntoOneLeftJoin() {
    JoinSqlGenerator.JoinConfig name = new JoinSqlGenerator.JoinConfig(
            "ignored", "customer", "customer_id", "id", "name",
            "customer_name", "客户名称", true, true);
    JoinSqlGenerator.JoinConfig phone = new JoinSqlGenerator.JoinConfig(
            "ignored", "customer", "customer_id", "id", "phone",
            "customer_phone", "客户电话", true, true);
    JoinSqlGenerator.JoinConfig email = new JoinSqlGenerator.JoinConfig(
            "ignored", "customer", "customer_id", "id", "email",
            "customer_email", "客户邮箱", true, true);

    BizDataQueryBuilder.SqlAndParams sql = JoinSqlGenerator.buildSelect(
            MAIN, TENANT, List.of(name, phone, email), queryColumns(),
            Map.of(), null, null, null, null, 0, 10);

    assertThat(sql.sql()).isEqualTo(
            "SELECT m.*, j1.name AS customer_name, j1.phone AS customer_phone, j1.email AS customer_email"
                    + " FROM wf_biz_order m"
                    + " LEFT JOIN wf_biz_customer j1 ON j1.id = JSON_UNQUOTE(JSON_EXTRACT(m.customer_id,'$[0]'))"
                    + " WHERE m.tenant_id = ? ORDER BY m.created_at DESC LIMIT ? OFFSET ?");
}

@Test
void group_distinctConditions_assignSequentialAliasesInOrder() {
    List<JoinSqlGenerator.JoinGroup> groups = JoinSqlGenerator.group(List.of(
            new JoinSqlGenerator.JoinConfig("a1", "customer", "customer_id", "id", "name", "customer_name", "客户名称", true, true),
            new JoinSqlGenerator.JoinConfig("a1", "customer", "customer_id", "id", "phone", "customer_phone", "客户电话", true, true),
            new JoinSqlGenerator.JoinConfig("a2", "user", "owner_id", "id", "nickname", "owner_name", "负责人", true, false)));

    assertThat(groups).hasSize(2);
    assertThat(groups.get(0).alias()).isEqualTo("j1");
    assertThat(groups.get(0).members()).hasSize(2);
    assertThat(groups.get(0).members().get(0).virtualKey()).isEqualTo("customer_name");
    assertThat(groups.get(1).alias()).isEqualTo("j2");
    assertThat(groups.get(1).members()).hasSize(1);
}

@Test
void validate_aliasIgnored_doesNotRejectMissingAlias() {
    List<JoinSqlGenerator.JoinConfig> joins = List.of(
            new JoinSqlGenerator.JoinConfig(null, "customer", "customer_id", "id", "name",
                    "customer_name", "客户名称", true, true));

    JoinSqlGenerator.validate(joins, List.of("order_no", "customer_id"));
    // 不抛异常即通过（alias 可空、可重复，生成时按组分配）
}
```

- [ ] **Step 4: 运行新用例验证失败**

Run: `mvn -pl backend test -Dtest="JoinSqlGeneratorTest#buildSelect_sameJoinConditionMultipleFields_mergesIntoOneLeftJoin+group_distinctConditions_assignSequentialAliasesInOrder+validate_aliasIgnored_doesNotRejectMissingAlias"`

注意：`group` 与 `validate_aliasIgnored` 在实现前**编译失败**（`group()` 方法不存在）。若 Maven 因编译失败中止整轮，则跳过串联语法，改为先单独跑 `buildSelect_sameJoinConditionMultipleFields_mergesIntoOneLeftJoin`（该方法签名存在只会断言失败）；编译失败本身就是 RED 证据，直接进入 Step 5。

Expected: FAIL（编译失败或断言失败）

- [ ] **Step 5: 实现分组模型与按组生成**

`JoinSqlGenerator.java`：

新增 record 与静态方法（置于类内 JoinConfig 附近）：

```java
/** 分组后的 JOIN 单元：共享连接条件，携带组内字段成员（alias 由系统按组自动分配 j1..jN） */
public record JoinGroup(String alias, String targetFormKey, String localField, String foreignField,
                        List<JoinConfig> members) {}

/**
 * 按 (localField, targetFormKey, foreignField) 分组；保序，组序即 alias 序号（j1, j2, ...）。
 * JoinConfig.alias 一律忽略（存量兼容），以分组分配的 alias 为准。
 */
public static List<JoinGroup> group(List<JoinConfig> joins) {
    Map<String, JoinGroup> byKey = new LinkedHashMap<>();
    List<JoinGroup> ordered = new ArrayList<>();
    int idx = 0;
    for (JoinConfig j : joins) {
        String key = j.localField() + "|" + j.targetFormKey() + "|" + j.foreignField();
        JoinGroup g = byKey.get(key);
        if (g == null) {
            g = new JoinGroup("j" + (++idx), j.targetFormKey(), j.localField(), j.foreignField(),
                    new ArrayList<>());
            byKey.put(key, g);
            ordered.add(g);
        }
        g.members().add(j);
    }
    return ordered;
}
```

`buildSelect` 改动（SELECT 段与 LEFT JOIN 段均按组遍历）：

```java
List<JoinGroup> groups = group(joins);
StringBuilder sql = new StringBuilder("SELECT m.*");
for (JoinGroup g : groups) {
    for (JoinConfig m : g.members()) {
        sql.append(", ").append(g.alias()).append(".").append(m.joinField())
                .append(" AS ").append(m.virtualKey());
    }
}
sql.append(" FROM ").append(mainTable).append(" m");
for (JoinGroup g : groups) {
    sql.append(" LEFT JOIN wf_biz_").append(g.targetFormKey()).append(" ").append(g.alias())
            .append(" ON ").append(g.alias()).append(".").append(g.foreignField())
            .append(" = ").append(localRef(g.localField(), columns));
}
```

- `localRef(JoinConfig j, ...)` 改签名或新增 `localRef(String localField, List<QueryColumn> columns)` 重载（用组的 localField）
- `buildCount` 同理：LEFT JOIN 段按组遍历（无 SELECT 虚拟列段）
- `validate` 删除 alias 正则校验与 `aliases` Set 唯一性校验（保留 targetFormKey/localField/foreignField/joinField/virtualKey 必填、virtualKey 唯一、不冲突主表列）
- `validateTargets` 不变（仍逐 join 校验目标表存在）

- [ ] **Step 6: 运行全部 JoinSqlGeneratorTest 验证通过**

Run: `mvn -pl backend test -Dtest=JoinSqlGeneratorTest`
Expected: PASS — 全部用例（含新增 3 个）

- [ ] **Step 7: 提交**

```bash
git add backend/src/main/java/com/workflow/engine/form/bizdata/JoinSqlGenerator.java backend/src/test/java/com/workflow/engine/form/bizdata/JoinSqlGeneratorTest.java
git commit -m "feat(join): 声明式 JOIN 按连接条件分组合并为一行 SQL，alias 自动分配"
```

---

### Task 2: BizDataSupport 虚拟列 ref 改用分组 alias

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/form/bizdata/BizDataSupport.java:334-351`
- Test: `backend/src/test/java/com/workflow/example/join/FormJoinQueryIntegrationTest.java`

**Interfaces:**
- Consumes: `JoinSqlGenerator.group(List<JoinConfig>)` → `List<JoinGroup>`（Task 1）
- Produces: 无新接口；`buildJoinColumns` 内部行为变化（虚拟列 ref 用 `group.alias + "." + member.joinField`）

- [ ] **Step 1: 新增集成测试用例（多字段合并 JOIN 查询）**

`FormJoinQueryIntegrationTest.java` 追加常量与用例（先读该文件确认已有 `CONFIG_PARAMS` 等常量与 helper 的实际命名，按既有模式组织；以下为结构示例）：

```java
private static final String CONFIG_PARAMS_MULTI_FIELDS = """
        {"queryMode":"config","joins":[
         {"targetFormKey":"customer","localField":"customer_id",
          "foreignField":"id","joinField":"name","virtualKey":"customer_name","label":"客户名称",
          "sortable":true,"filterable":true},
         {"targetFormKey":"customer","localField":"customer_id",
          "foreignField":"id","joinField":"phone","virtualKey":"customer_phone","label":"客户电话",
          "sortable":true,"filterable":true}]}
        """;

@Test
void configQuery_sameJoinConditionMultipleFields_returnsAllVirtualColumns() {
    BizDataPageVO page = adapter.query(formDs(ORDER_KEY, CONFIG_PARAMS_MULTI_FIELDS), pageReq(1, 20));

    assertThat(page.getTotal()).isEqualTo(3);
    Map<String, Object> newest = page.getRecords().get(0).getData();
    assertThat(newest).containsEntry("order_no", "ORD-003");
    assertThat(newest).containsEntry("customer_name", "王五");
    assertThat(newest).containsEntry("customer_phone", mapEntryContaining("138"));
}
```

（注意：该配置**不带 alias 字段**，同时验证 parseJoins 的 alias=null 兼容路径。断言细节以实际 seed 数据为准。）

- [ ] **Step 2: 运行验证失败**

Run: `mvn -pl backend test -Dtest=FormJoinQueryIntegrationTest#configQuery_sameJoinConditionMultipleFields_returnsAllVirtualColumns`
Expected: FAIL — 用例不存在（编译失败）或 SQL 未合并导致重复 JOIN

- [ ] **Step 3: 修改 buildJoinColumns**

`BizDataSupport.buildJoinColumns`（line 334-351）虚拟列段改为：

```java
for (JoinSqlGenerator.JoinGroup g : JoinSqlGenerator.group(joins)) {
    for (JoinSqlGenerator.JoinConfig m : g.members()) {
        columns.add(new JoinSqlGenerator.QueryColumn(m.virtualKey(),
                g.alias() + "." + m.joinField(),
                resolveJoinColumnType(m), m.sortable(), m.filterable()));
    }
}
```

（主表列段不变；`j.alias()` 与 `j.joinField()` 分别改为 `g.alias()` 与 `m.joinField()`。）

- [ ] **Step 4: 运行新增用例验证通过**

Run: `mvn -pl backend test -Dtest=FormJoinQueryIntegrationTest`
Expected: PASS — 全部集成用例

- [ ] **Step 5: 提交**

```bash
git add backend/src/main/java/com/workflow/engine/form/bizdata/BizDataSupport.java backend/src/test/java/com/workflow/example/join/FormJoinQueryIntegrationTest.java
git commit -m "feat(join): 虚拟列 ref 改用分组 alias，支持同条件多字段合并查询"
```

---

### Task 3: 保存校验移除 alias 必填 + 预览 SQL 接口

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/datasource/DataSourceDefinitionService.java:487-523`（validateConfigJoins 移除 alias 校验）
- Modify: `backend/src/main/java/com/workflow/engine/form/bizdata/BizDataSupport.java`（新增 `previewJoinSql`）
- Create: `backend/src/main/java/com/workflow/api/dto/JoinPreviewVO.java`
- Create: `backend/src/main/java/com/workflow/api/dto/JoinPreviewRequest.java`
- Modify: `backend/src/main/java/com/workflow/api/controller/DataSourceController.java`（注入 BizDataSupport + 新增端点）
- Test: `backend/src/test/java/com/workflow/engine/datasource/DataSourceDefinitionServiceTest.java`

**Interfaces:**
- Consumes: `BizDataSupport.loadContext(...)`、`buildJoinColumns(...)`（private，同文件直接调用）、`JoinSqlGenerator.buildSelect(...)`、`tenantProvider`（已有字段）
- Produces: `JoinPreviewVO(String sql, List<Object> params)`；`JoinPreviewRequest(String formKey, List<JoinSqlGenerator.JoinConfig> joins)`；`BizDataSupport.previewJoinSql(String formKey, List<JoinConfig> joins)` 公共方法；`POST /api/v1/data-sources/join-preview` 端点

- [ ] **Step 1: 新增 DataSourceDefinitionServiceTest 用例（alias 省略可保存）**

`DataSourceDefinitionServiceTest.java` 追加（helper `join()` 保留原样；新增无 alias 的 JSON 拼接）：

```java
private static String joinNoAlias(String target, String local, String foreign, String joinField,
                                  String virtualKey, String label, boolean sortable, boolean filterable) {
    return "{\"targetFormKey\":\"" + target + "\",\"localField\":\"" + local
            + "\",\"foreignField\":\"" + foreign + "\",\"joinField\":\"" + joinField
            + "\",\"virtualKey\":\"" + virtualKey + "\",\"label\":\"" + label
            + "\",\"sortable\":" + sortable + ",\"filterable\":" + filterable + "}";
}

@Test
void update_formConfigMode_joinsWithoutAlias_saved() {
    String params = configJoinsParams(
            joinNoAlias("biz_customer", "customer_id", "id", "name", "customer_name", "客户名称", true, true),
            joinNoAlias("biz_customer", "customer_id", "id", "phone", "customer_phone", "客户电话", true, true));
    when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "biz_customer")).thenReturn(true);

    DataSourceDefinition result = updateFormParams(params);

    assertEquals(params, result.getParams());
}
```

- [ ] **Step 2: 运行验证失败**

Run: `mvn -pl backend test -Dtest=DataSourceDefinitionServiceTest#update_formConfigMode_joinsWithoutAlias_saved`
Expected: FAIL — alias 校验抛 400「alias 非法」

- [ ] **Step 3: 移除 validateConfigJoins 的 alias 校验**

`DataSourceDefinitionService.validateConfigJoins`（line 500-503）删除：

```java
String alias = text(j, "alias");
if (alias == null || !alias.matches("[a-zA-Z_][a-zA-Z0-9_]*")) {
    throw new BusinessException(400, "joins 第 " + idx + " 项 alias 非法: " + alias);
}
```

其余校验（targetFormKey 存在 / localField / foreignField / joinField / label / virtualKey 唯一）保留。

- [ ] **Step 4: 新增 BizDataSupport.previewJoinSql**

`BizDataSupport.java` 追加（放在 buildJoinColumns 附近；private `buildJoinColumns` 同文件可直接调用）：

```java
/**
 * config 模式 SQL 预览：生成主表 + JOIN 虚拟列完整 SELECT（无筛选/无关键词/默认排序/不分页）。
 * 校验 formKey 合法且主表存在（loadContext）；目标表单存在性由保存校验负责，预览不重复校验。
 */
public JoinPreviewVO previewJoinSql(String formKey, List<JoinSqlGenerator.JoinConfig> joins) {
    BizDataContext ctx = loadContext(formKey);
    String tenantId = tenantProvider.getTenantId();
    List<JoinSqlGenerator.QueryColumn> columns = buildJoinColumns(ctx, joins);
    BizDataQueryBuilder.SqlAndParams select = JoinSqlGenerator.buildSelect(
            ctx.tableName(), tenantId, joins, columns, Map.of(),
            null, null, null, null, 0, 0);
    return new JoinPreviewVO(select.sql(), select.params());
}
```

需新增 import：`com.workflow.api.dto.JoinPreviewVO`、`com.workflow.engine.form.bizdata.BizDataQueryBuilder`（若未 import）。

- [ ] **Step 5: 新建 JoinPreviewVO / JoinPreviewRequest DTO**

`backend/src/main/java/com/workflow/api/dto/JoinPreviewVO.java`：

```java
package com.workflow.api.dto;

import java.util.List;

/** config 模式 JOIN SQL 预览结果 */
public record JoinPreviewVO(String sql, List<Object> params) {}
```

`backend/src/main/java/com/workflow/api/dto/JoinPreviewRequest.java`：

```java
package com.workflow.api.dto;

import com.workflow.engine.form.bizdata.JoinSqlGenerator.JoinConfig;
import java.util.List;

/** JOIN SQL 预览请求：主表单 key + 关联声明列表（alias 字段可省略，Jackson record 反序列化缺失字段为 null） */
public record JoinPreviewRequest(String formKey, List<JoinConfig> joins) {}
```

- [ ] **Step 6: DataSourceController 注入 BizDataSupport + 新增端点**

`DataSourceController.java`：

- 字段与构造改为两依赖：
  ```java
  private final DataSourceDefinitionService dataSourceService;
  private final BizDataSupport bizDataSupport;

  public DataSourceController(DataSourceDefinitionService dataSourceService, BizDataSupport bizDataSupport) {
      this.dataSourceService = dataSourceService;
      this.bizDataSupport = bizDataSupport;
  }
  ```
- 新增 import：`com.workflow.api.dto.JoinPreviewRequest`、`com.workflow.api.dto.JoinPreviewVO`、`com.workflow.engine.form.bizdata.BizDataSupport`
- 追加端点（放在 `/data` 端点之前；`/join-preview` 是静态段与 `/{id}` 无冲突，Spring 精确匹配优先）：

```java
/**
 * config 模式 JOIN SQL 预览：formKey + joins → 生成的 SELECT SQL（不落库不执行）。
 * 供前端设计器配置 JOIN 后即时预览。
 */
@PostMapping("/join-preview")
public R<JoinPreviewVO> previewJoin(@RequestBody JoinPreviewRequest req) {
    return R.ok(bizDataSupport.previewJoinSql(req.formKey(), req.joins()));
}
```

- [ ] **Step 7: 后端编译 + 全量相关测试**

Run: `mvn -pl backend compile` 然后 `mvn -pl backend test -Dtest=JoinSqlGeneratorTest,FormJoinQueryIntegrationTest,DataSourceDefinitionServiceTest,FormQueryConfigTest`
Expected: 编译通过，测试全绿

- [ ] **Step 8: 提交**

```bash
git add backend/src/main/java/com/workflow/api/dto/JoinPreviewVO.java backend/src/main/java/com/workflow/api/dto/JoinPreviewRequest.java backend/src/main/java/com/workflow/api/controller/DataSourceController.java backend/src/main/java/com/workflow/engine/datasource/DataSourceDefinitionService.java backend/src/main/java/com/workflow/engine/form/bizdata/BizDataSupport.java backend/src/test/java/com/workflow/engine/datasource/DataSourceDefinitionServiceTest.java
git commit -m "feat(join): 保存校验放开 alias，新增 JOIN SQL 预览接口"
```

---

### Task 4: 前端删除别名列 + 类型去 alias + 预览 SQL UI

**Files:**
- Modify: `frontend/src/views/dataSource/components/FormJoinConfig.vue`
- Modify: `frontend/src/api/data-source.ts`
- Test: `frontend/src/views/dataSource/components/__tests__/FormJoinConfig.test.ts`（新建）

**Interfaces:**
- Consumes: `dataSourceApi.previewJoinSql(formKey, joins)`（新增）；`props.mainFormKey`、`props.disabled`、`local.joins`（现有）
- Produces: `JoinConfigItem` 移除 `alias` 字段；`emptyJoin()` 不再生成 alias；模板删除「别名」列（现 272-276 行）；「预览 SQL」按钮 + 只读展示区

- [ ] **Step 1: 新增前端测试**

`frontend/src/views/dataSource/components/__tests__/FormJoinConfig.test.ts`（新建；mock 风格参考同目录 `SqlEditor.test.ts` / `VisualQueryBuilder.test.ts`）：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import FormJoinConfig from '../FormJoinConfig.vue'
import type { FormJoinConfigValue } from '../FormJoinConfig.vue'

const modelValue = (): FormJoinConfigValue => ({
  queryMode: 'config',
  joins: [
    { targetFormKey: 'biz_customer', localField: 'customer_id', foreignField: 'id',
      joinField: 'name', virtualKey: 'customer_name', label: '客户名称', sortable: true, filterable: true },
  ],
})

const targets = [{ key: 'biz_customer', name: '客户' }]

describe('FormJoinConfig 多字段 JOIN + SQL 预览', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('行内不包含 alias 字段（类型去掉 alias）', () => {
    const cfg = modelValue()
    expect(cfg.joins![0]).not.toHaveProperty('alias')
  })

  it('点击预览 SQL 调用接口并展示返回 SQL', async () => {
    const api = await import('@/api/data-source')
    vi.spyOn(api.dataSourceApi, 'previewJoinSql').mockResolvedValue({
      code: 0, message: 'ok',
      data: { sql: 'SELECT m.*, j1.name AS customer_name FROM wf_biz_order m LEFT JOIN wf_biz_customer j1 ...', params: ['t1'] },
    })
    const wrapper = mount(FormJoinConfig, {
      props: { modelValue: modelValue(), mainFormKey: 'biz_order', targetFormOptions: targets },
    })
    await wrapper.find('button.preview-sql-btn').trigger('click')
    expect(api.dataSourceApi.previewJoinSql).toHaveBeenCalledWith('biz_order', expect.any(Array))
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('customer_name')
  })
})
```

（若 `FormJoinConfig` 挂载时调用 `formApi.getFormDefinitionByKey`，需按现有测试 `vi.mock('@/api/form')` 模式 mock。）

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run frontend/src/views/dataSource/components/__tests__/FormJoinConfig.test.ts`
Expected: FAIL — 测试文件不存在 / previewJoinSql 未定义

- [ ] **Step 3: data-source.ts 新增预览 API**

`frontend/src/api/data-source.ts` 追加（`R` 已在顶部 import）：

```ts
/** JOIN 预览响应（对齐后端 JoinPreviewVO） */
export interface JoinPreviewVO {
  sql: string
  params: unknown[]
}

export const dataSourceApi = {
  // ...现有成员...

  /** config 模式 JOIN SQL 预览（不落库不执行；joins 无需 alias） */
  previewJoinSql(formKey: string, joins: Record<string, unknown>[]): Promise<R<JoinPreviewVO>> {
    return http.post('/v1/data-sources/join-preview', { formKey, joins })
  },
}
```

- [ ] **Step 4: FormJoinConfig.vue 删除别名列 + 类型去 alias**

- `JoinConfigItem` interface（line 10-20）删除 `alias: string`
- `emptyJoin`（line 31-43）删除 `alias: \`j${index + 1}\`` 行（index 参数保留，避免改调用签名）
- 模板删除「别名」列（line 272-276 `<el-table-column label="别名" width="80">...</el-table-column>`）

- [ ] **Step 5: FormJoinConfig.vue 新增预览按钮 + 展示区**

script 内新增：

```ts
import { View } from '@element-plus/icons-vue'
import { dataSourceApi } from '@/api/data-source'

const previewSql = ref('')
const previewVisible = ref(false)
const previewing = ref(false)

const hasValidJoins = computed(() =>
  local.joins.some((j) => j.targetFormKey && j.virtualKey))

async function doPreview() {
  if (!props.mainFormKey || !hasValidJoins.value) return
  previewing.value = true
  previewVisible.value = true
  try {
    const res = await dataSourceApi.previewJoinSql(props.mainFormKey, local.joins)
    previewSql.value = res.data.sql
  } catch {
    previewSql.value = '' // 拦截器已弹错误；清空旧 SQL 防止误导
  } finally {
    previewing.value = false
  }
}
```

模板：「新增关联」按钮（line 338-348）旁新增「预览 SQL」按钮（class 用 `preview-sql-btn`，与测试定位一致），下方加展示区：

```html
<el-button
  v-if="!disabled"
  class="preview-sql-btn"
  size="small"
  :icon="View"
  :loading="previewing"
  :disabled="!hasValidJoins"
  style="margin-top: 8px; margin-left: 8px"
  @click="doPreview"
>
  预览 SQL
</el-button>

<div v-if="previewVisible" class="sql-preview">
  <div class="sql-preview-head">
    <span>生成 SQL（问号为参数占位，按序对应 params）</span>
    <el-button text size="small" @click="previewVisible = false">收起</el-button>
  </div>
  <pre class="sql-preview-body">{{ previewSql || '预览失败' }}</pre>
</div>
```

style 追加 `.sql-preview` 块（浅底色、等宽字体、可滚动、最大高度 200px、内边距 8px）。

- [ ] **Step 6: 运行前端测试 + 类型检查**

Run: `npx vitest run frontend/src/views/dataSource/components/__tests__/FormJoinConfig.test.ts`
Expected: PASS

Run: `npx vue-tsc --noEmit`
Expected: 仅 4 个预存错误（与本任务无关，先确认基线一致）

- [ ] **Step 7: 提交**

```bash
git add frontend/src/api/data-source.ts frontend/src/views/dataSource/components/FormJoinConfig.vue frontend/src/views/dataSource/components/__tests__/FormJoinConfig.test.ts
git commit -m "feat(join): 前端删除别名录入，新增 JOIN SQL 预览"
```

---

### Task 5: 前端数据源页适配 + 全量回归

**Files:**
- Verify: `frontend/src/views/dataSource/DataSourceListPage.vue:1451-1470`（buildFormParams）
- Test: `frontend/src/views/dataSource/__tests__/DataSourceListPage.test.ts`（仅确认无 alias 断言，必要时微调）

**Interfaces:**
- Consumes: `JoinConfigItem` 无 alias（Task 4）
- Produces: 保存载荷自然不含 alias；FORM 保存流程回归验证

- [ ] **Step 1: 检查 buildFormParams 已有过滤逻辑**

`buildFormParams` 中 `params.joins = formJoin.value.joins.filter((j) => j.targetFormKey && j.virtualKey)` — 该过滤保留。`JoinConfigItem` 去 alias 后序列化自然不含 alias 字段。检查 `DataSourceListPage.test.ts` 是否有断言包含 `alias` 键的 `toHaveBeenCalledWith`——若有，删除该字段断言。

- [ ] **Step 2: 跑前端数据源页测试确认无回归**

Run: `npx vitest run frontend/src/views/dataSource`
Expected: PASS

- [ ] **Step 3: 后端全量测试 + 前端全量测试**

Run: `mvn -pl backend test`
Expected: PASS（全量）

Run: `npx vitest run`
Expected: PASS（全量）

- [ ] **Step 4: 最终提交（如 Step 1 有更新）**

```bash
git add frontend/src/views/dataSource/DataSourceListPage.vue frontend/src/views/dataSource/__tests__/DataSourceListPage.test.ts
git commit -m "chore(join): 数据源保存载荷适配无 alias 配置"
```

---