# 支持更多 form-create 组件在业务表单发布中使用 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 rate/colorPicker/tree/elTreeSelect/elTransfer/fcEditor/signaturePad/subForm 8 类组件可通过业务表单发布建表并 CRUD，多值组件统一 JSON 列存储，subForm 预留 storageMode 开关。

**Architecture:** 前端 ColumnConfigDialog 与后端 ColumnTypeMapper 的"组件→列类型"映射逐 case 对齐（既有约束）；DDL 层新增 LONGTEXT 支持；BizDataService 在 create/update/toVO 处做 JSON 序列化/反序列化；ColumnConfig 新增 storageMode 字段供发布分派。

**Tech Stack:** Java 17 / Spring Boot / JdbcTemplate / Jackson；Vue 3 / TypeScript / Vitest；MySQL。

## Global Constraints

- 前后端映射表逐 case 对齐（`ColumnConfigDialog.mapComponentToColumn` 与 `ColumnTypeMapper.mapComponentToColumn` 必须一致）。
- 列类型白名单：VARCHAR/TEXT/LONGTEXT/INT/DECIMAL/DATE/DATETIME/TINYINT/JSON。
- VARCHAR 上限 255；DECIMAL 长度 1~30、scale 0~len。
- 跨类变更禁止（`categoryOf`：VARCHAR/TEXT/LONGTEXT/TINYINT/JSON→STRING，INT→INT，DECIMAL→DECIMAL，DATE/DATETIME→DATE）。
- 多值组件（checkbox/multiSelect/multiSelectPro/tree 多选/elTreeSelect 多选/elTransfer）统一 JSON 列。
- subForm 本期仅 storageMode=JSON；storageMode=SUB_TABLE 发布时 400 拒绝。
- 老数据（逗号串 TEXT）不迁移；JSON 列读取 parse 失败原样返回。
- TDD：先写失败测试 → 实现 → 测试通过 → 提交。

---

## Task 1: 后端 ColumnTypeMapper 扩展组件映射

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/form/column/ColumnTypeMapper.java`
- Test: `backend/src/test/java/com/workflow/engine/form/column/ColumnTypeMapperTest.java`

**Interfaces:**
- Consumes: 现有 `mapComponentToColumn(String componentType, Map<String,Object> props)` 返回 `ColumnConfig` 或 null。
- Produces: 扩展后的 `mapComponentToColumn`：新增 rate/colorPicker/tree/elTreeSelect/elTransfer/fcEditor/signaturePad/subForm 分支；checkbox/multiSelect/multiSelectPro 改为 JSON。

- [ ] **Step 1: 写失败测试（新增组件映射 + checkbox 改 JSON）**

在 `ColumnTypeMapperTest` 添加：

```java
@Test
void rateMapsToInt() {
    ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("rate", null);
    assertNotNull(c);
    assertEquals("INT", c.getColumnType());
}

@Test
void colorPickerMapsToVarchar16() {
    ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("colorPicker", null);
    assertNotNull(c);
    assertEquals("VARCHAR", c.getColumnType());
    assertEquals(16, c.getLength());
}

@Test
void treeSelectSingleMapsToVarchar255() {
    ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("elTreeSelect", Map.of("multiple", false));
    assertEquals("VARCHAR", c.getColumnType());
    assertEquals(255, c.getLength());
}

@Test
void treeSelectMultipleMapsToJson() {
    ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("elTreeSelect", Map.of("multiple", true));
    assertEquals("JSON", c.getColumnType());
}

@Test
void treeMultipleMapsToJson() {
    ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("tree", Map.of("showCheckbox", true));
    assertEquals("JSON", c.getColumnType());
}

@Test
void transferMapsToJson() {
    ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("elTransfer", null);
    assertEquals("JSON", c.getColumnType());
}

@Test
void editorMapsToText() {
    ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("fcEditor", null);
    assertEquals("TEXT", c.getColumnType());
}

@Test
void signaturePadMapsToLongtext() {
    ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("signaturePad", null);
    assertEquals("LONGTEXT", c.getColumnType());
}

@Test
void subFormMapsToJson() {
    ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("subForm", null);
    assertEquals("JSON", c.getColumnType());
}

@Test
void checkboxMapsToJson() {
    ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("checkbox", null);
    assertEquals("JSON", c.getColumnType());
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `mvn test -pl backend -Dtest=ColumnTypeMapperTest -DfailIfNoTests=false`（worktree 内）
Expected: 新增用例 FAIL（mapComponentToColumn 尚无这些分支）

- [ ] **Step 3: 实现映射扩展**

在 `ColumnTypeMapper.mapComponentToColumn` 的 switch 中：
- `"rate" -> applyInt(c);`（新增 `applyInt`：columnType=INT）
- `"colorPicker" -> applyString(c, 16);`
- `"tree" -> applyTree(c, props);` `"elTreeSelect" -> applyTree(c, props);`（共用）
- `"elTransfer" -> applyJson(c);`
- `"fcEditor" -> applyText(c);`
- `"signaturePad" -> applyLongtext(c);`（新增 `applyLongtext`：columnType=LONGTEXT）
- `"subForm" -> applyJson(c);`
- `"checkbox", "multiSelect", "multiSelectPro"` case 从 `applyString(c, 1024)` 改为 `applyJson(c)`

新增辅助方法：

```java
private static void applyTree(ColumnConfig c, Map<String, Object> props) {
    boolean multi = props != null && (Boolean.TRUE.equals(props.get("multiple"))
            || Boolean.TRUE.equals(props.get("showCheckbox")));
    if (multi) {
        applyJson(c);
    } else {
        applyString(c, 255);
    }
}

private static void applyInt(ColumnConfig c) {
    c.setColumnType("INT");
}

private static void applyLongtext(ColumnConfig c) {
    c.setColumnType("LONGTEXT");
}
```

`ALLOWED_TYPES` 增加 `"LONGTEXT"`。

- [ ] **Step 4: 运行测试确认通过**

Run: `mvn test -pl backend -Dtest=ColumnTypeMapperTest -DfailIfNoTests=false`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add backend/src/main/java/com/workflow/engine/form/column/ColumnTypeMapper.java backend/src/test/java/com/workflow/engine/form/column/ColumnTypeMapperTest.java
git commit -m "feat: ColumnTypeMapper 支持 rate/colorPicker/tree/elTreeSelect/elTransfer/fcEditor/signaturePad/subForm 映射，checkbox 改 JSON"
```

---

## Task 2: 后端 DDL 层 LONGTEXT 支持

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/form/column/DdlBuilder.java`
- Modify: `backend/src/main/java/com/workflow/engine/form/column/DynamicTableManager.java`
- Test: `backend/src/test/java/com/workflow/engine/form/column/DdlBuilderTest.java`、`backend/src/test/java/com/workflow/engine/form/column/DynamicTableManagerTest.java`

**Interfaces:**
- Consumes: Task 1 产出 LONGTEXT 列类型。
- Produces: `DdlBuilder.columnDefinition` 输出 `LONGTEXT`；`DynamicTableManager.normalizeType` 保留 LONGTEXT。

- [ ] **Step 1: 写失败测试**

`DdlBuilderTest`：

```java
@Test
void longtextColumnDefinition() {
    ColumnConfig c = new ColumnConfig();
    c.setKey("sign");
    c.setColumnType("LONGTEXT");
    List<String> stmts = DdlBuilder.buildCreateTable("f1", List.of(c));
    assertTrue(stmts.contains("    sign LONGTEXT,"));
}

@Test
void longtextTypeChangeIsNotCrossCategory() {
    // LONGTEXT 与 TEXT 同类（STRING），允许变更
    assertFalse(ColumnTypeMapper.isCrossTypeChange("TEXT", "LONGTEXT"));
}
```

`DynamicTableManagerTest`（或 normalizeType 相关测试）：

```java
@Test
void normalizeKeepsLongtext() {
    // 通过 ensureTable 建含 LONGTEXT 列的表，findTableColumns 返回 columnType=LONGTEXT
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `mvn test -pl backend -Dtest=DdlBuilderTest -DfailIfNoTests=false`
Expected: FAIL（columnDefinition 无 LONGTEXT 分支）

- [ ] **Step 3: 实现**

`DdlBuilder.columnDefinition` switch 增加：
```java
case "LONGTEXT" -> "LONGTEXT";
```
`DdlBuilder.sameDefinition`/`isNarrowing` 对 LONGTEXT 与 TEXT 视为同类无长度（TEXT 分支已涵盖；确认 LONGTEXT 不落入 VARCHAR 长度逻辑即可——当前实现只对 VARCHAR/TINYINT/DECIMAL 做长度比较，LONGTEXT 走 `return true`/`return false` 默认分支，无需改）。
`DynamicTableManager.normalizeType`：当前 `case "text", "longtext", "mediumtext", "tinytext" -> "TEXT"` 改为仅 `case "text" -> "TEXT"`，新增 `case "longtext" -> "LONGTEXT"`（否则已建 LONGTEXT 列会被归一化为 TEXT，二次发布触发 MODIFY 缩列判断异常）。

- [ ] **Step 4: 运行测试确认通过**

Run: `mvn test -pl backend -Dtest=DdlBuilderTest,DynamicTableManagerTest -DfailIfNoTests=false`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/src/main/java/com/workflow/engine/form/column/DdlBuilder.java backend/src/main/java/com/workflow/engine/form/column/DynamicTableManager.java backend/src/test/java/com/workflow/engine/form/column/
git commit -m "feat: DDL 层支持 LONGTEXT 列类型"
```

---

## Task 3: ColumnConfig.storageMode 与发布校验调整

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/form/column/ColumnConfig.java`
- Modify: `backend/src/main/java/com/workflow/engine/form/FormDefinitionService.java`
- Test: `backend/src/test/java/com/workflow/engine/form/FormDefinitionPublishBusinessTest.java`

**Interfaces:**
- Consumes: Task 1 映射、Task 2 LONGTEXT。
- Produces: `ColumnConfig.storageMode`（getter/setter）；`FormDefinitionService.publish` 对 SUB_TABLE 拒绝；`UNSUPPORTED_COMPONENTS` 调整。

- [ ] **Step 1: 写失败测试**

`FormDefinitionPublishBusinessTest` 新增：

```java
@Test
void publishSubFormJsonModeCreatesJsonColumn() {
    // schema 含 { type:'subForm', field:'items' }，column_config 含 { key:'items', columnType:'JSON', storageMode:'JSON' }
    // 发布成功，物理表含 items JSON 列
}

@Test
void publishSubTableModeRejected() {
    // column_config 含 { key:'items', columnType:'JSON', storageMode:'SUB_TABLE' }
    // 发布 400，提示子表模式暂未实现
}

@Test
void publishDividerStillRejected() {
    // schema 含 divider/groupContainer/dataTable → 400
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `mvn test -pl backend -Dtest=FormDefinitionPublishBusinessTest -DfailIfNoTests=false`
Expected: 新用例 FAIL

- [ ] **Step 3: 实现**

`ColumnConfig.java` 增加：
```java
/** 存储模式：JSON（整体 JSON 列）| SUB_TABLE（子表，预留未实现） */
private String storageMode = "JSON";
// getter/setter
```

`FormDefinitionService.java`：
- `UNSUPPORTED_COMPONENTS` 改为 `Set.of("divider", "groupContainer", "dataTable")`（subForm 移出；保留展示型/dataTable）。
- `parseColumnConfig` 校验后增加：
```java
for (ColumnConfig c : columns) {
    if ("SUB_TABLE".equals(c.getStorageMode())) {
        throw new BusinessException(400, "子表存储模式暂未实现: " + c.getKey());
    }
}
```
- `validateBusinessSchema` 中 `UNSUPPORTED_COMPONENTS` 引用同步更新。

- [ ] **Step 4: 运行测试确认通过**

Run: `mvn test -pl backend -Dtest=FormDefinitionPublishBusinessTest -DfailIfNoTests=false`
Expected: PASS（既有用例需同步适配：原 subTable 校验用例若引用已移除类型需更新断言）

- [ ] **Step 5: 提交**

```bash
git add backend/src/main/java/com/workflow/engine/form/column/ColumnConfig.java backend/src/main/java/com/workflow/engine/form/FormDefinitionService.java backend/src/test/java/com/workflow/engine/form/FormDefinitionPublishBusinessTest.java
git commit -m "feat: ColumnConfig 增加 storageMode，发布拒绝 SUB_TABLE，调整 UNSUPPORTED_COMPONENTS"
```

---

## Task 4: BizDataService JSON 序列化/反序列化

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/form/bizdata/BizDataService.java`
- Test: `backend/src/test/java/com/workflow/engine/form/bizdata/BizDataServiceTest.java`

**Interfaces:**
- Consumes: `ctx.columns` 的 columnType（JSON/LONGTEXT）。
- Produces: create/update 前对 JSON 列 `JSON.stringify`；toVO 对 JSON 列 parse（失败原样）。

- [ ] **Step 1: 写失败测试**

`BizDataServiceTest` 新增：

```java
@Test
void createSerializesJsonColumns() {
    // 表含 tags JSON 列，提交 data { tags: ["a","b"] }
    // 物理表存储 "[\"a\",\"b\"]" 字符串；查询返回数组
}

@Test
void readLegacyNonJsonValueReturnsAsIs() {
    // tags 列存 "a,b"（非 JSON），查询返回字符串 "a,b" 不抛错
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `mvn test -pl backend -Dtest=BizDataServiceTest -DfailIfNoTests=false`
Expected: 新用例 FAIL

- [ ] **Step 3: 实现**

在 `BizDataService` 增加辅助方法并在 create/update 使用：

```java
/** 对 JSON 列值序列化；非数组/对象（如旧字符串）原样保留 */
private Map<String, Object> serializeJsonColumns(BizDataContext ctx, Map<String, Object> data) {
    Map<String, Object> out = new LinkedHashMap<>(data);
    for (ColumnConfig c : ctx.columns) {
        if (!"JSON".equals(c.getColumnType())) continue;
        Object v = out.get(c.getKey());
        if (v == null) continue;
        if (v instanceof String) continue; // 旧格式容错
        try {
            out.put(c.getKey(), objectMapper.writeValueAsString(v));
        } catch (JsonProcessingException e) {
            throw new BusinessException(400, "字段 " + c.getKey() + " 无法序列化为 JSON: " + e.getOriginalMessage());
        }
    }
    return out;
}

/** 对 JSON 列值反序列化；parse 失败原样返回 */
@SuppressWarnings("unchecked")
private Object deserializeJsonValue(Object v) {
    if (v == null || !(v instanceof String s)) return v;
    try {
        return objectMapper.readValue(s, Object.class);
    } catch (JsonProcessingException e) {
        return v;
    }
}
```

- create/update：`Map<String, Object> merged = ...; merged.putAll(resolvePickerValues(ctx, data));` 改为 `Map<String, Object> merged = serializeJsonColumns(ctx, new LinkedHashMap<>(data)); merged.putAll(resolvePickerValues(ctx, merged));`
- toVO：`Object v = row.get(c.getKey()); if (v != null) data.put(c.getKey(), "JSON".equals(c.getColumnType()) ? deserializeJsonValue(v) : v);`

- [ ] **Step 4: 运行测试确认通过**

Run: `mvn test -pl backend -Dtest=BizDataServiceTest -DfailIfNoTests=false`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/src/main/java/com/workflow/engine/form/bizdata/BizDataService.java backend/src/test/java/com/workflow/engine/form/bizdata/BizDataServiceTest.java
git commit -m "feat: BizDataService JSON 列序列化写入与反序列化读取"
```

---

## Task 5: 前端 ColumnConfigDialog 映射扩展

**Files:**
- Modify: `frontend/src/views/form/components/ColumnConfigDialog.vue`
- Test: `frontend/src/views/form/components/__tests__/`（如有对应测试则扩展）

**Interfaces:**
- Consumes: 后端 ColumnTypeMapper 映射表（Task 1）。
- Produces: `mapComponentToColumn` 与后端逐 case 对齐；`UNSUPPORTED_TYPES` 更新；subForm 列 hidden。

- [ ] **Step 1: 写失败测试（若已有测试文件则扩展；否则用现有测试基建）**

在 `frontend/src/views/form/components/__tests__/ColumnConfigDialog.test.ts`（如不存在则新建）添加映射断言：

```typescript
describe('mapComponentToColumn', () => {
  it('rate → INT', () => {
    // 通过挂载组件 + schema 生成草案断言
  })
  // colorPicker/tree/elTreeSelect/elTransfer/fcEditor/signaturePad/subForm/checkbox 用例同 Task 1 表
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- --run src/views/form/components/__tests__/ColumnConfigDialog.test.ts`（在 `frontend/`）
Expected: 新用例 FAIL

- [ ] **Step 3: 实现**

`ColumnConfigDialog.vue` 的 `mapComponentToColumn` switch 增加（与后端完全对齐）：
```typescript
case 'rate':
  return { columnType: 'INT', length: null, scale: null }
case 'colorPicker':
  return { columnType: 'VARCHAR', length: 16, scale: null }
case 'tree':
case 'elTreeSelect': {
  const multi = propsMap?.multiple || propsMap?.showCheckbox
  return multi
    ? { columnType: 'JSON', length: null, scale: null }
    : { columnType: 'VARCHAR', length: 255, scale: null }
}
case 'elTransfer':
  return { columnType: 'JSON', length: null, scale: null }
case 'fcEditor':
  return { columnType: 'TEXT', length: null, scale: null }
case 'signaturePad':
  return { columnType: 'LONGTEXT', length: null, scale: null }
case 'subForm':
  return { columnType: 'JSON', length: null, scale: null }
```

- checkbox/multiSelect/multiSelectPro case 改为 `return { columnType: 'JSON', length: null, scale: null }`
- `UNSUPPORTED_TYPES` 改为 `['divider', 'groupContainer', 'dataTable']`
- subForm 生成的列加 `hidden: true`（不进列表），在 collectFields 的 subForm 分支处理（若 subForm 未单列分支则走 mapComponentToColumn 后追加 hidden）
- `allowedTypes` 增加 `'LONGTEXT'`；`showLength` 中 LONGTEXT 与 TEXT 一致不显示长度

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test -- --run src/views/form/components/__tests__/ColumnConfigDialog.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/form/components/ColumnConfigDialog.vue frontend/src/views/form/components/__tests__/
git commit -m "feat: ColumnConfigDialog 映射扩展与 JSON/LONGTEXT 列支持"
```

---

## Task 6: 前端 BizDataListPage 展示适配

**Files:**
- Modify: `frontend/src/views/form/BizDataListPage.vue`

**Interfaces:**
- Consumes: Task 5 产出（subForm 列 hidden、JSON 列 columnType）。
- Produces: 子表单列不进列表/筛选；JSON 数组展示。

- [ ] **Step 1: 检查现状并写用例（如无测试则逻辑验证）**

`BizDataListPage.vue` 现有 `bizColumns = columnConfig.filter(c => !c.unsupported && !c.hidden)` 已天然排除 hidden 的 subForm 列。确认 subForm 列从 ColumnConfigDialog 生成时带 `hidden: true` 即可。JSON 列已走 formatter（`typeof v === 'object' ? JSON.stringify(v)`）。

- [ ] **Step 2: 适配 subForm 列 hidden**

确认 ColumnConfigDialog collectFields 中 subForm 输出 `{ ..., hidden: true }`；若列映射对话框需展示 subForm 行则保留展示但标记隐藏。

- [ ] **Step 3: 运行前端测试**

Run: `npm run test`（frontend/）
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add frontend/src/views/form/components/ColumnConfigDialog.vue frontend/src/views/form/BizDataListPage.vue
git commit -m "feat: 子表单列不进业务数据列表"
```

---

## Task 7: 集成验证

**Files:**
- 无（验证任务）

- [ ] **Step 1: 后端全量测试**

Run: `mvn test`（backend/）
Expected: 全部 PASS

- [ ] **Step 2: 前端全量测试**

Run: `npm run test`（frontend/）
Expected: 全部 PASS

- [ ] **Step 3: 手工验证 8 类组件发布链路**

1. 启动前后端（独立终端窗口）
2. 设计器新建 BUSINESS 表单，拖入 rate/colorPicker/tree/elTreeSelect/elTransfer/fcEditor/signaturePad/subForm 各一个
3. 保存 → 发布 → 列映射确认对话框展示全部字段（subForm 标记隐藏）
4. 发布成功，业务数据页新增记录：填评分/颜色/多选/富文本/签名/子表 → 保存 → 列表可见 → 详情回显

- [ ] **Step 4: 验证 checkbox JSON 迁移**

新建含 checkbox 的 BUSINESS 表单 → 发布 → 填多选 → 保存 → 查询返回数组

- [ ] **Step 5: 提交（如有遗留变更）**

```bash
git add -A && git commit -m "test: 集成验证通过" || echo "no changes"
```
