# data-picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 data-picker（数据引用组件）：业务表单字段可视化引用其他业务表单记录，值存 id + 冗余显示文本，支持单多选、级联、回填、批量解析。

**Architecture:** 复用 v1 底表能力（BizDataService 参数化 CRUD + column_config 列映射）。`ColumnTypeMapper` 扩展 dataPicker → 两列映射（`<key>` + `<key>_text` hidden）；`BizDataService` 增 resolveDisplayTexts 与 CRUD 冗余文本维护；`BizDataController` 增 resolve API；前端基于 LookupPicker 扩展 DataPicker 运行时组件 + 设计器可视化配置弹窗。级联 = dependOn filter 传给 BizDataService.query。

**Tech Stack:** Spring Boot 3 / JdbcTemplate / MySQL 8；Vue 3 / Element Plus / form-create。

## Global Constraints

- 所有查询强制 tenant_id 过滤；动态 SQL 参数化（BizDataQueryBuilder 复用）
- data-picker 字段映射：`<key>` VARCHAR(64) + `<key>_text` VARCHAR(1024) hidden=true；禁止 `<key>_text` 参与唯一/索引
- 新增/更新时引用 id 必须存在于目标表单（同租户），否则 400
- 禁止 `as any` / `@ts-ignore` 抑制类型错误
- 测试命令：后端 `mvn test -Dtest=<TestClass>`（workdir `backend/`），前端 `npm run build`（workdir `frontend/`）
- 参考规范：本变更 `openspec/changes/data-picker/specs/` 下 3 个 delta spec；设计文档 `design.md`

---

### Task 1: 列映射两列模型

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/form/column/ColumnConfig.java`
- Modify: `backend/src/main/java/com/workflow/engine/form/column/ColumnTypeMapper.java`
- Test: `backend/src/test/java/com/workflow/engine/form/column/ColumnTypeMapperTest.java`

**Interfaces:**
- Produces: `ColumnConfig.hidden`/`setHidden(boolean)`、`ColumnConfig.pickerConfig`/`setPickerConfig(String)`；`ColumnTypeMapper.mapPickerToColumns(String key, Map<String,Object> props)` → `List<ColumnConfig>`（两列）

- [ ] **Step 1: 写失败测试**

在 `ColumnTypeMapperTest` 追加：

```java
@Test
void mapPicker_returnsTwoColumns_idAndHiddenText() {
    List<ColumnConfig> cols = ColumnTypeMapper.mapPickerToColumns("emp_id",
            Map.of("sourceFormKey", "emp_profile", "displayField", "name", "mode", "single"));
    assertThat(cols).hasSize(2);
    assertThat(cols.get(0).getKey()).isEqualTo("emp_id");
    assertThat(cols.get(0).getColumnType()).isEqualTo("VARCHAR");
    assertThat(cols.get(0).getLength()).isEqualTo(64);
    assertThat(cols.get(0).getPickerConfig()).contains("emp_profile");
    assertThat(cols.get(1).getKey()).isEqualTo("emp_id_text");
    assertThat(cols.get(1).getColumnType()).isEqualTo("VARCHAR");
    assertThat(cols.get(1).getLength()).isEqualTo(1024);
    assertThat(cols.get(1).isHidden()).isTrue();
}
```

- [ ] **Step 2: 运行验证失败**

Run: `mvn test -Dtest=ColumnTypeMapperTest`（workdir `backend/`）
Expected: 编译失败（mapPickerToColumns 不存在、ColumnConfig 无 hidden/pickerConfig）

- [ ] **Step 3: 实现**

- `ColumnConfig` 加 `private boolean hidden;` 与 `private String pickerConfig;` + getter/setter（Jackson 序列化自动包含）
- `ColumnTypeMapper.mapPickerToColumns`：返回两列——`<key>` VARCHAR(64)（pickerConfig=Jackson 序列化 sourceFormKey/displayField/mode）、`<key>_text` VARCHAR(1024) hidden=true（label 同 `<key>`，追加"（引用显示）"）

- [ ] **Step 4: 运行验证通过 + 提交**

Run: `mvn test -Dtest=ColumnTypeMapperTest`（workdir `backend/`）
Expected: PASS

```bash
git add backend/src/main/java/com/workflow/engine/form/column backend/src/test/java/com/workflow/engine/form/column
git commit -m "feat(data-picker): 列映射 dataPicker 两列模型（id + hidden 冗余文本）"
```

---

### Task 2: 引用校验与冗余文本维护

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/form/bizdata/BizDataService.java`
- Test: `backend/src/test/java/com/workflow/engine/form/bizdata/BizDataServiceTest.java`

**Interfaces:**
- Consumes: `ColumnConfig.pickerConfig`（JSON：sourceFormKey/displayField）
- Produces: `BizDataService.resolveDisplayTexts(String sourceFormKey, List<String> ids, String displayField)` → `Map<String,String>`

- [ ] **Step 1: 写失败测试**

在 `BizDataServiceTest` 追加（列含 picker 配置时）：

```java
@Test
void create_withPickerField_resolvesAndMaintainsText() {
    // column_config 含 emp_id（pickerConfig: emp_profile/name）与 emp_id_text 隐藏列
    // mock resolve 查询：queryForList 返回目标表行 {"id":"t1","name":"张三"}
    BizDataVO vo = bizDataService.create("biz_leave", Map.of("emp_id", "t1"));
    // verify jdbcTemplate.update 的 SQL/参数包含 emp_id_text 写入"张三"
}

@Test
void create_withPickerMissingId_rejected400() {
    // resolve 查询返回空 → 400
}
```

- [ ] **Step 2: 运行验证失败**

Run: `mvn test -Dtest=BizDataServiceTest`（workdir `backend/`）
Expected: 失败（resolveDisplayTexts 不存在）

- [ ] **Step 3: 实现**

- `resolveDisplayTexts(sourceFormKey, ids, displayField)`：`SELECT id, <displayField> FROM wf_biz_<sourceFormKey> WHERE tenant_id=? AND id IN (...)`（参数化，IN 动态占位符），返回 LinkedHashMap
- `resolvePickerValues(ctx, data)`：遍历 `ctx.columns` 中 `pickerConfig != null` 的列——解析 pickerConfig（ObjectMapper）取 sourceFormKey/displayField；id 值按逗号拆分去重 → `resolveDisplayTexts`；任一 id 缺失 → 抛 `BusinessException(400, "引用的数据不存在: <key>=<id>")`；把 `<key>_text` 加入 data（保持 id 顺序拼接，逗号分隔）
- `create()`：在 `buildInsert` 前调用 `resolvePickerValues(ctx, data)`；`update()` 同样（data 中已含 `<key>_text` 则覆盖重算）

- [ ] **Step 4: 运行验证通过 + 提交**

Run: `mvn test -Dtest=BizDataServiceTest`（workdir `backend/`）
Expected: PASS

```bash
git add backend/src/main/java/com/workflow/engine/form/bizdata/BizDataService.java backend/src/test/java/com/workflow/engine/form/bizdata/BizDataServiceTest.java
git commit -m "feat(data-picker): CRUD 引用校验与冗余文本自动维护"
```

---

### Task 3: 解析 API

**Files:**
- Modify: `backend/src/main/java/com/workflow/api/controller/BizDataController.java`
- Modify: `backend/src/main/java/com/workflow/api/dto/BizDataQueryRequest.java`（如需）或直接参数
- Test: `backend/src/test/java/com/workflow/engine/form/bizdata/BizDataServiceTest.java`（resolve 相关）

**Interfaces:**
- Produces: `GET /api/v1/biz-data/{formKey}/resolve?ids=a,b&displayField=name` → `Map<String,String>`

- [ ] **Step 1: 写失败测试**

```java
@Test
void resolveDisplayTexts_batchReturnsMap() {
    when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
        .thenReturn(List.of(Map.of("id","a","name","张三"), Map.of("id","b","name","李四")));
    Map<String,String> map = bizDataService.resolveDisplayTexts("emp_profile", List.of("a","b"), "name");
    assertThat(map).containsEntry("a","张三").containsEntry("b","李四");
}

@Test
void resolveDisplayTexts_missingIds_omitted() {
    // queryForList 只返回 a → 结果仅 a
}
```

- [ ] **Step 2: 运行验证失败 → Step 3: 实现（若 Task 2 已实现 resolveDisplayTexts 则直接转绿）**

Run: `mvn test -Dtest=BizDataServiceTest`（workdir `backend/`）

`BizDataController` 新增：

```java
@GetMapping("/{formKey}/resolve")
public R<Map<String, String>> resolve(@PathVariable String formKey,
        @RequestParam List<String> ids,
        @RequestParam(required = false) String displayField) {
    return R.ok(bizDataService.resolveByFormKey(formKey, ids, displayField));
}
```

`BizDataService` 加 `resolveByFormKey(formKey, ids, displayField)`：displayField 缺省取 column_config 第一个非 hidden 列；调 resolveDisplayTexts。

- [ ] **Step 4: 运行验证通过 + 提交**

```bash
git add backend/src/main/java/com/workflow/api/controller/BizDataController.java backend/src/main/java/com/workflow/engine/form/bizdata/BizDataService.java backend/src/test/java/com/workflow/engine/form/bizdata/BizDataServiceTest.java
git commit -m "feat(data-picker): 批量解析接口 GET /{formKey}/resolve"
```

---

### Task 4: 发布校验

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/form/FormDefinitionService.java`
- Test: `backend/src/test/java/com/workflow/engine/form/FormDefinitionPublishBusinessTest.java`

**Interfaces:**
- Consumes: `ColumnTypeMapper.mapPickerToColumns`、`FormDefinitionService.getBusinessColumnsByKey`

- [ ] **Step 1: 写失败测试**

```java
@Test
void publish_withPicker_targetFormNotPublished_rejected() {
    // schema 含 dataPicker(sourceFormKey=emp_profile)，getBusinessColumnsByKey(emp_profile) 抛 404
    assertThatThrownBy(() -> service.publish("f1")).isInstanceOf(BusinessException.class)
        .hasMessageContaining("目标表单");
}

@Test
void publish_withPicker_displayFieldDeleted_rejected() {
    // 目标表单存在但 column_config 无 displayField → 400 提示引用列不存在
}

@Test
void publish_withPicker_validConfig_passes() {
    // 目标表单存在且含 displayField → publish 成功
}
```

- [ ] **Step 2: 运行验证失败 → Step 3: 实现**

`publish()` 的 BUSINESS 分支中，在 `validateBusinessSchema` 后新增 `validatePickerReferences(schema, tenantId)`：遍历 schema rule 找 type=dataPicker 字段——解析 props（sourceFormKey/displayField/columns/dependOn.sourceColumn）→ `getBusinessColumnsByKey(sourceFormKey)`（404 转 400"目标表单不存在或未发布: x"）→ 校验各引用列存在（缺失 → 400 "引用列已不存在: x"）。

- [ ] **Step 4: 运行验证通过 + 提交**

```bash
git add backend/src/main/java/com/workflow/engine/form/FormDefinitionService.java backend/src/test/java/com/workflow/engine/form/FormDefinitionPublishBusinessTest.java
git commit -m "feat(data-picker): 发布校验 dataPicker 目标表单与引用列"
```

---

### Task 5: 运行时 DataPicker 组件

**Files:**
- Create: `frontend/src/views/form/components/DataPicker.vue`
- Modify: `frontend/src/api/bizData.ts`（resolve 封装）
- Test: `frontend/src/views/form/components/__tests__/DataPicker.test.ts`

**Interfaces:**
- Produces: `DataPicker` 组件（props: modelValue/sourceFormKey/displayField/columns/mode/returnFields/dependOn/disabled/readonly/placeholder）；`bizDataApi.resolve(formKey, ids, displayField?)`

- [ ] **Step 1: 实现 `bizDataApi.resolve`**

```ts
resolve(formKey: string, ids: string[], displayField?: string): Promise<R<Record<string, string>>> {
  return http.get(`/v1/biz-data/${formKey}/resolve`, { params: { ids: ids.join(','), displayField } })
}
```

- [ ] **Step 2: 实现 `DataPicker.vue`（基于 LookupPicker 结构）**

- 模板/交互复用 LookupPicker（输入框 + 弹窗 + 表格 + 分页 + 搜索）
- `fetchApi`：`(params) => bizDataApi.list(sourceFormKey, { page, size, keyword, keywordColumn: displayField, filter: 级联filter })`——级联 filter 由 dependOn 构造：`{ [dependOn.sourceColumn]: 依赖字段值 }`
- 级联：`watch(() => formCreateInject?.api 或外部传入的 dependOnValue)`——简化：props 增 `dependOnValue?: unknown`，父组件（form-create）传入依赖字段值；变化时清空 modelValue + 清空回填 + 下次打开弹窗自动用新 filter
- 回填：复用 fillReturnFields/clearReturnFields（formCreateInject.api.setValue）
- 只读/详情：`props.readonly` 或父组件传 `displayText`（冗余文本）时直接显示文本禁用交互
- 多选值格式：modelValue 为逗号分隔字符串（与后端存储一致）；组件内 split/join

- [ ] **Step 3: 写组件单测（Vitest，参照 LookupPicker.test.ts 的 mock 方式）**

覆盖：单选选中 emit 值、多选确认拼接、回填调用、级联依赖变化清空值、清除联动清空回填。

- [ ] **Step 4: 运行前端单测 + build**

Run: `npm run build`（workdir `frontend/`）；`npx vitest run src/views/form/components/__tests__/DataPicker.test.ts`（若项目已配 vitest，参照现有测试运行方式）
Expected: PASS

```bash
git add frontend/src/views/form/components/DataPicker.vue frontend/src/api/bizData.ts frontend/src/views/form/components/__tests__/DataPicker.test.ts
git commit -m "feat(data-picker): 运行时 DataPicker 组件（选择/回填/级联/只读）"
```

---

### Task 6: 设计器集成与配置弹窗

**Files:**
- Modify: `frontend/src/views/form/FormDesigner.vue`
- Create: `frontend/src/views/form/components/DataPickerConfigDialog.vue`
- Modify: `frontend/src/views/form/components/ColumnConfigDialog.vue`

**Interfaces:**
- Produces: `DataPickerConfigDialog`（props: modelValue/schema（当前表单字段列表）/targetForms；emit confirm(props)）

- [ ] **Step 1: 注册组件**

`FormDesigner.vue` onMounted 中 `addComponent` 注册 dataPicker（label '数据引用'，rule.type='dataPicker'，默认 props）；双击处理：fc-designer 的组件配置——若属性面板方式困难，在注册 rule 的 `props` 中约定 `openConfig` 标记，选中时打开配置弹窗（简化：工具栏"数据引用配置"按钮作用于当前选中字段，或按 fc-designer 组件 on 事件机制接入）。

- [ ] **Step 2: 实现 `DataPickerConfigDialog.vue`**

- props：`modelValue`（弹窗显隐）、`targetForms`（已发布业务表单列表，由父组件加载）、`currentFields`（当前表单字段 list）
- 表单：目标表单 select → 选中后父组件传入目标列（column_config 非 hidden）；显示字段 select；列表列 multi-select；模式 radio；返回字段映射动态行（目标字段 select + 当前字段 input）；级联（当前字段 select + 目标列 select，可清空）
- emit('confirm', props) → 父组件写入 rule.props

- [ ] **Step 3: 接入入口**

`FormDesigner.vue`：选中 dataPicker 字段时打开 DataPickerConfigDialog；确认后写回 `designerRef.setRule` 更新字段 props。

- [ ] **Step 4: ColumnConfigDialog 两列草案**

`ColumnConfigDialog.vue` 的 `collectFields`/`mapComponentToColumn`：type=dataPicker 时生成两行（`<key>` + `<key>_text` hidden 锁定，hidden 行禁用列类型/长度/唯一/索引编辑并标注"引用显示列"）。

- [ ] **Step 5: build 验证 + 提交**

Run: `npm run build`（workdir `frontend/`）
Expected: 构建成功

```bash
git add frontend/src/views/form
git commit -m "feat(form-designer): dataPicker 组件注册与可视化配置弹窗"
```

---

### Task 7: 管理页适配与端到端验证

**Files:**
- Modify: `frontend/src/views/form/BizDataListPage.vue`
- 无新增

- [ ] **Step 1: 过滤 hidden 列**

`BizDataListPage.vue` 的 `bizColumns`/`filterableColumns` 增加 `!c.hidden` 过滤（column_config 已含 hidden 标记）。

- [ ] **Step 2: 后端全量测试**

Run: `mvn test`（workdir `backend/`）
Expected: 全部 PASS（含既有 293 + 新增）

- [ ] **Step 3: 前端 build**

Run: `npm run build`（workdir `frontend/`）
Expected: 构建成功

- [ ] **Step 4: 端到端冒烟（本地起前后端，独立终端窗口）**

1. 创建目标业务表单 emp_profile（含 name/dept/level）并发布
2. 创建引用表单 leave_bill（含 dept_field + dataPicker emp_id 依赖 dept_field）→ 配置 dataPicker → 发布（列映射显示两列，`_text` 隐藏）
3. 管理页新增：级联选择（先选部门 → 员工列表过滤）→ 选中回填 → 保存后列表显示文本、`_text` 列不显示
4. 引用不存在的 id 被 400 拒绝

- [ ] **Step 5: 提交收尾**

```bash
git add -A
git commit -m "chore(data-picker): 管理页 hidden 列适配与端到端验证"
```

---

## Self-Review 记录

- **Spec 覆盖**：data-picker 3 个 Requirement（配置/运行时级联/发布校验）→ Task 6/5/4；business-form-data 2 个 ADDED（引用维护/解析 API）→ Task 1/2/3；form-designer（组件+两列草案）→ Task 6。无遗漏。
- **占位符扫描**：无 TBD/TODO；所有步骤含具体文件与代码。
- **类型一致性**：`ColumnConfig.hidden/pickerConfig`（Task 1 定义，Task 2/4/7 消费）；`resolveDisplayTexts(sourceFormKey, ids, displayField)`（Task 2 产出，Task 3 resolveByFormKey 包装）；`DataPicker` props（Task 5 定义，Task 6 配置弹窗产出，Task 7 冒烟验证）签名一致。
