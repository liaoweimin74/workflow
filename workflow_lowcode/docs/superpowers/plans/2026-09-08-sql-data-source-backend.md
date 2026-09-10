# 2026-09-08: SQL 数据源后端 + source_key 泛化

实现 spec `docs/superpowers/specs/2026-09-08-sql-data-source-backend-design.md`（commit 054cceb）的后端主体与前端接入。

## Goal

1. `source_key` 成为所有数据源类型的唯一标识：必填、租户内唯一；`form_key` 全部类型可空（FORM/WORKFLOW 必填且保存时自动 = source_key）。
2. `type=SQL` 数据源完整可用：list/metadata（适配器已有分支，验证）→ get/create/update/delete 委托绑定表单，未绑定表单 → 400。
3. API 数据源 metadata 透传 formKey（接通前端按表单 schema 渲染编辑弹窗）。
4. 后端测试全绿；前端 DataSourceListPage 接入 source_key 必填 + form_key 自动逻辑。

## Architecture

```
DataSourceDefinitionService.create/update
        │  校验：type∈SUPPORTED_TYPES(含SQL)、source_key 必填+租户唯一、FORM/WORKFLOW formKey=sourceKey
        ▼
wf_data_source 表：uk_data_source_tenant_source_key(tenant_id, source_key) 唯一索引（迁移兜底）

UnifiedDataSourceAdapter（适配器 SPI）
   ├─ supports("SQL")……已有
   ├─ metadata(SQL) ……已有（formKey 非空加业务列 + declared + writable=formKey≠null）
   ├─ query(SQL) ……已有（FormQueryConfig → bizDataService.querySql）
   ├─ get/create/update/delete(SQL) ★新增：formKey 非空 → 委托 BizDataService；空 → 400
   └─ apiMetadata(SQL 无关) ★补 setFormKey(ds.getFormKey())
```

SQL 执行引擎 `SqlTemplateEngine/SqlQueryEngine/FormQueryConfig` 已存在且被 FORM 的 sql/visual 模式使用，**不新增引擎**。

## Tech Stack

- Java 17 + Spring Boot + Spring Data JPA（`DataSourceDefinitionRepository`）+ Flyway（最新 V30，新迁移 V31）
- 测试：JUnit 5 + Mockito（`@ExtendWith(MockitoExtension.class)` + `@MockitoSettings(strictness=LENIENT)`）
- 前端：Vue 3 + Element Plus + Vitest（`frontend/src/views/dataSource/`）

## Global Constraints

- 中文回复与注释。
- TDD：每个任务先写失败测试（RED）→ 最小实现（GREEN）→ 提交。
- 每个任务一个提交；提交信息中文，遵循仓库现有风格（`feat|fix|refactor: 描述`）。
- 仅修改 worktree `.worktrees/form-join-sql-engine/`。
- PowerShell 仅用于运行命令，**禁止用 Set-Content/Get-Content 改写文件内容**。
- 后端起服采用热部署：改完编译即可，不重启。
- 不引入新依赖。
- 测试账号 admin/admin123（手工验证时使用）。

---

## Task 1: Flyway V31 迁移 —— source_key 回填 + 租户内唯一索引

数据库层兜底：存量 FORM/WORKFLOW 回填 source_key=form_key；新建租户内唯一索引。

### Files

- 新建 `backend/src/main/resources/db/migration/V31__add_source_key_unique.sql`

### Interfaces

迁移 SQL（两条语句，顺序固定）：

```sql
-- 1. 存量 FORM/WORKFLOW 回填 source_key = form_key
UPDATE wf_data_source
SET source_key = form_key
WHERE type IN ('FORM', 'WORKFLOW')
  AND (source_key IS NULL OR source_key = '');

-- 2. 租户内 source_key 唯一索引（MySQL/H2 唯一索引对 NULL 不互斥，SQL/API 未填时不冲突）
CREATE UNIQUE INDEX uk_ds_tenant_source_key
ON wf_data_source (tenant_id, source_key);
```

### Steps

1. 新建 `V31__add_source_key_unique.sql`，写入上述两条 SQL（逐字，无占位符）。
2. 本地启动后端（独立 Windows 终端窗口，workdir=`backend`，命令 `mvn spring-boot:run`）验证 Flyway 迁移成功执行、日志无 `Migration V31__add_source_key_unique.sql failed`。
3. 若迁移失败（如存量重复 source_key），记录失败 SQL 与报错，暂停并回报用户，不擅自改数据。
4. 提交：`feat(datasource): V31 迁移 source_key 租户内唯一索引`。

**验证方式**：启动日志断言迁移成功；不做自动化单元测试（Flyway 迁移由应用启动执行，存量数据仅开发库）。

---

## Task 2: Repository 新增 existsByTenantIdAndSourceKey

Service 层租户内唯一校验的数据访问方法。

### Files

- `backend/src/main/java/com/workflow/engine/datasource/repository/DataSourceDefinitionRepository.java`

### Interfaces

```java
boolean existsByTenantIdAndSourceKey(String tenantId, String sourceKey);
```

### Steps

1. 在 Repository 接口 `existsByTenantIdAndName`（L23）旁新增上述派生查询（无 @Query，Spring Data 派生）。
2. 提交：`feat(datasource): Repository 新增 existsByTenantIdAndSourceKey`。

**验证方式**：方法在 Task 3 的 Service 测试中被覆盖；本任务不单独建测试（派生查询方法名与字段一致，编译期即校验）。

---

## Task 3: Service 层 —— SUPPORTED_TYPES 加 SQL + source_key 校验 + formKey 自动

`DataSourceDefinitionService.create/update` 支持 SQL 类型；source_key 全类型必填且租户内唯一；FORM/WORKFLOW 保存时 formKey 强制 = sourceKey。

### Files

- `backend/src/main/java/com/workflow/engine/datasource/DataSourceDefinitionService.java`
- `backend/src/test/java/com/workflow/engine/datasource/DataSourceDefinitionServiceTest.java`

### Interfaces（相对现有代码的精确改动点）

1. L38-41 常量区：新增 `private static final String TYPE_SQL = "SQL";`
2. L42：`SUPPORTED_TYPES = Set.of(TYPE_FORM, TYPE_SYSTEM, TYPE_API, TYPE_WORKFLOW, TYPE_SQL);`
3. `validateRequiredFields`（L345-382）改造（此方法 create/update/enable 三处共用，是必填校验的统一入口）：
   - 方法开头新增全类型 sourceKey 必填检查（覆盖现有分支未覆盖的 FORM/WORKFLOW）：
     ```java
     if (sourceKey == null || sourceKey.isBlank()) {
         throw new BusinessException(400, "数据源必须填写 sourceKey");
     }
     ```
   - FORM/WORKFLOW：formKey 必填保持不变（与 sourceKey 的一致性由调用方 create/update 强制，见第 4/6 点，方法内不抛错）。
   - SYSTEM/API：sourceKey 必填保持（被开头全类型检查覆盖，分支内原有逻辑保留不删）。
   - SQL：新增分支 `else if (TYPE_SQL.equals(type))`，无额外必填（sourceKey 已被开头检查覆盖），保留占位供未来扩展。
4. `create`（L97-110）：实体组装时，`String effectiveFormKey = (TYPE_FORM.equals(type) || TYPE_WORKFLOW.equals(type)) ? sourceKey : formKey;` 后 `ds.setFormKey(effectiveFormKey)`。
5. `create`：在 name 唯一校验（L88-90）之后、`validateRequiredFields` 之前，新增租户内唯一性校验（必填校验已在 validateRequiredFields 统一处理，此处只查唯一性）：
   ```java
   if (dsRepository.existsByTenantIdAndSourceKey(tenantId, sourceKey)) {
       throw new BusinessException(400, "数据源标识 sourceKey 已存在: " + sourceKey);
   }
   ```
6. `update`（L120-159）：`newSourceKey` 计算后（L135），若与 `ds.getSourceKey()` 不同且非空，执行 existsByTenantIdAndSourceKey 唯一校验；若与旧值相同则跳过（自身不算冲突）。FORM/WORKFLOW 时 `newFormKey` 强制 = `newSourceKey`（覆盖传入值）。`validateRequiredFields(newType, newFormKey, newSourceKey, newParams)` 调用保持。
7. `enable`/`disable`/`getById` 不修改。

### Steps（TDD）

1. **RED**：在 `DataSourceDefinitionServiceTest.java` 新增测试组 `@Nested class SourceKeyValidationTest`，覆盖：
   - `create` 缺 sourceKey（FORM/SQL）→ BusinessException 400。
   - `create` 同租户重复 sourceKey → 400（mock `existsByTenantIdAndSourceKey` 返回 true）。
   - `create` SQL 类型成功：formKey 可空，sourceKey 必填，SUPPORTED_TYPES 接受。
   - `create` FORM 类型：formKey 自动等于 sourceKey（实参传 formKey=null 或任意值，断言实体 formKey == sourceKey）。
   - `update` 改 sourceKey 为他人已占用 → 400；改回自身旧值 → 不冲突。
   - `update` FORM 类型改 sourceKey → formKey 同步为新 sourceKey。
   - 既有测试不破坏（运行全 `DataSourceDefinitionServiceTest` 确认）。
2. 运行该测试文件确认新增用例失败（RED）。
3. **GREEN**：按 Interfaces 改动 Service。补 TYPE_SQL 常量、SUPPORTED_TYPES、两处唯一校验、formKey 自动逻辑。
4. 重跑测试文件全绿；`mvn -f backend/pom.xml test -Dtest=DataSourceDefinitionServiceTest` 通过（workdir=仓库根）。
5. 提交：`feat(datasource): 支持 SQL 类型 + source_key 必填/租户唯一 + FORM 自动 formKey`。

**验证方式**：上述测试全绿；编译通过。

---

## Task 4: Adapter —— SQL 分支 get/create/update/delete 委托表单 + apiMetadata 透传 formKey

`UnifiedDataSourceAdapter` 补齐 SQL 数据源的写路径与只读单条查询；API metadata 透传 formKey。

### Files

- `backend/src/main/java/com/workflow/engine/datasource/UnifiedDataSourceAdapter.java`
- `backend/src/test/java/com/workflow/engine/datasource/UnifiedDataSourceAdapterTest.java`

### Interfaces（精确改动点）

1. `get`（L193-204）switch 加分支：
   ```java
   case "SQL" -> {
       String fk = requireFormKey(ds, "get");
       yield bizDataService.getById(fk, id);
   }
   ```
2. `create`（L207-217）加：
   ```java
   case "SQL" -> {
       String fk = requireFormKey(ds, "create");
       yield bizDataService.create(fk, data).getId();
   }
   ```
3. `update`（L220-230）加：
   ```java
   case "SQL" -> {
       String fk = requireFormKey(ds, "update");
       bizDataService.update(fk, id, data, version);
   }
   ```
4. `delete`（L233-248）加：
   ```java
   case "SQL" -> {
       String fk = requireFormKey(ds, "delete");
       bizDataService.delete(fk, id);
   }
   ```
5. 新增私有工具（放在 API helpers 前的 FORM helpers 区）：
   ```java
   /** SQL 数据源行级操作须绑定表单；未绑定 → 400。 */
   private String requireFormKey(DataSourceDefinition ds, String op) {
       if (ds.getFormKey() == null || ds.getFormKey().isBlank()) {
           throw new BusinessException(400, "SQL 数据源未绑定表单，不支持" + op + "操作: " + ds.getName());
       }
       return ds.getFormKey();
   }
   ```
6. `apiMetadata`（L365-375）：构造返回前补 `m.setFormKey(ds.getFormKey())`（改为先建对象再 set，保持列/writable 不变）。`metadata` 的 `case "API"`（L122-125）拷贝后**一并**透传 formKey：
   ```java
   case "API" -> {
       DataSourceMetadata m = apiMetadata(ds);
       DataSourceMetadata copy = new DataSourceMetadata(copyWithSortableFalse(m.getColumns()), m.isWritable());
       copy.setFormKey(m.getFormKey());
       yield copy;
   }
   ```

### Steps（TDD）

1. **RED**：在 `UnifiedDataSourceAdapterTest.java` 新增 `@Nested class SqlDataSourceCrudTest`（复用既有 8 参构造器 setUp 与 `ds(type, key)` helper 风格）：
   - `ds("SQL", null)`（formKey 空）+ get/create/update/delete → 均 BusinessException 400。
   - `ds("SQL", "wf_biz_x")` + get → 断言 `bizDataService.getById("wf_biz_x", id)` 被调用并返回。
   - create → `bizDataService.create(eq("wf_biz_x"), anyMap())` 返回值 `.getId()` 透传。
   - update → `bizDataService.update(eq("wf_biz_x"), eq(id), anyMap(), any())` 被调用。
   - delete → `bizDataService.delete(eq("wf_biz_x"), eq(id))` 被调用。
   - API metadata：`ds("API", ...)` 且 formKey 非空 → `metadata()` 返回的 formKey 等于 ds.formKey。
2. 运行确认新增用例失败（RED）。
3. **GREEN**：按 Interfaces 修改适配器。
4. 重跑 `UnifiedDataSourceAdapterTest` 全绿；`mvn -f backend/pom.xml test -Dtest=UnifiedDataSourceAdapterTest` 通过（workdir=仓库根）。
5. 提交：`feat(datasource): SQL 数据源行级操作委托绑定表单 + API metadata 透传 formKey`。

**验证方式**：上述测试全绿。

---

## Task 5: 前端 —— source_key 必填 + form_key 逻辑（前置：核实 DataSourceListPage.vue 当前状态）

前端数据源表单接入新的 source_key/form_key 语义。

### 前置检查（必须执行，可能阻断）

DataSourceListPage.vue 曾被观察到疑似被外部回退（el-dialog 早期版本、无 SQL 配置区；用户否认手动操作）。**实施本任务前先 Read 该文件确认当前内容**：
- 若含 `inline-form-overlay`、`el-tabs`（SQL/接口配置/字段元数据/数据预览）与 SQL 配置区 → 继续本任务。
- 若为早期 el-dialog 版本、无 SQL 配置区 → **暂停并回报用户**（不静默重建，避免与用户本地状态冲突）。

### Files

- `frontend/src/views/dataSource/DataSourceListPage.vue`
- `frontend/src/views/dataSource/__tests__/DataSourceListPage.test.ts`

### Interfaces（基于 spec 的前端语义）

1. source_key 输入框：所有类型必填（已有校验若按类型分支，改为全类型统一必填；错误提示「数据源标识不能为空」）。
2. FORM/WORKFLOW 类型：form_key 输入框禁用并自动显示 = source_key 值（保存 payload 仍送 form_key=source_key）。
3. SQL/API 类型：form_key 保留可选输入框（不强制）。
4. 保存/新建提交逻辑：FORM/WORKFLOW 时 payload.form_key = payload.source_key 兜底。

### Steps（TDD）

1. **RED**：在 `DataSourceListPage.test.ts` 新增/调整用例：
   - 空 source_key 提交 → 断言校验错误提示出现、未调保存。
   - FORM 类型：source_key 输入后 form_key 输入框值自动等于 source_key 且 disabled。
   - SQL 类型：source_key 必填、form_key 可空提交成功（mock 保存接口断言 payload）。
2. 运行 `npx vitest run frontend/src/views/dataSource` 确认新增用例失败（RED）。
3. **GREEN**：按 Interfaces 修改 DataSourceListPage.vue（模板加 disabled/自动赋值/校验规则，脚本加 payload 兜底）。
4. dataSource 目录全量测试通过（现基线 79/79）；`npx vue-tsc --noEmit` 无新增错误。
5. 提交：`feat(dataSource): source_key 全类型必填 + FORM form_key 自动同步`。

**验证方式**：dataSource 目录 vitest 全绿；vue-tsc 无新增错误（保留 pre-existing `isViewMode` TS6133）。

---

## Task 6: 全量回归

收尾验证与提交状态确认。

### Files

- 无（仅运行命令）

### Steps

1. 后端：`mvn -f backend/pom.xml test` 全量通过（含 Task 1 迁移启动验证、Task 3/4 新增测试）。
2. 前端：`npx vitest run` 全量通过（基线 1006）；`npx vue-tsc --noEmit` 仅 pre-existing 错误。
3. 手工冒烟（可选，用户测试为主）：admin/admin123 登录，新建 SQL 数据源（绑表单 → list/get 可用；不绑表单 → 行级操作 400），FORM 数据源检查 form_key 自动 = source_key。
4. 确认全部提交已落盘、worktree 工作区干净（`git status` 无遗漏）。
5. 汇报总结：改动清单、测试结果、遗留风险（DataSourceListPage.vue 回退疑云、迁移依赖开发库存量数据）。

**验证方式**：两端全量测试全绿；worktree `git status` 干净。

---

## 风险与回滚

- **迁移唯一索引**：若开发库存量有重复 source_key（非空）→ 迁移失败，需先人工去重后再跑；已列入 Task 1 步骤 3 的暂停回报策略。
- **DataSourceListPage.vue 状态不明**：Task 5 前置检查阻断，不与用户本地状态冲突。
- **adapter 已有 SQL 分支来源不明**（外部修改，非本会话所写）：Task 4 不重写已有 metadata/query 分支，仅补齐缺失分支；验证阶段确认行为符合 spec。
- 回滚：各任务独立提交，可逐个 `git revert <commit>`；迁移回滚需人工 `DROP INDEX uk_ds_tenant_source_key`。