# BizData 扩展能力 + example 示例模块 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 BizDataService 补齐覆盖声明与流程状态守卫两类扩展能力，并交付 emp_profile / leave_bill 两个示例（含全链路集成测试）。

**Architecture:** 三层拼图——① `BizDataHandler` 增加强类型覆盖声明 + 拆出 `BizDataSupport` 复用面（`BizDataService` 门面化，覆盖检测→守卫→装饰→通用委托单向路由，无循环依赖）；② `FormProcessGuard` 接口（bizdata 包，不依赖 flowable）+ `FlowableFormProcessGuard` 实现（engine.process，按 businessKey=行id 反查流程实例），`FormDefinition.processKey` 列（V30 迁移）作绑定；③ `com.workflow.example` Modulith 包模块：emp（覆盖 query 复杂计算 + 语义操作）与 leave（真实 BPMN 全链路 + 守卫联动）。

**Tech Stack:** Java 21、Spring Boot 4.0.7、Spring Modulith 2.0.0、Flowable 8.0.0、Flyway、JUnit 5 + Mockito、H2（测试）、Maven（单模块 workflow-platform，工作目录 `backend/`）。

## Global Constraints

- 所有规范性行为遵循本变更 `specs/` 下 4 个 spec（bizdata-handler-extension / form-process-guard / biz-extension-examples / business-form-data delta）。
- 覆盖方法签名不含 formKey；重复覆盖声明 → 启动 `IllegalStateException`；覆盖接管时装饰钩子不自动执行。
- `FormProcessGuard` 接口层不得引用 flowable 类型；实现放 `engine.process`。
- `BizDataService` 对外 API（端点/请求/响应结构）不变；构造器签名保持兼容，仅追加 `List<FormProcessGuard> guards` 参数。
- V30 迁移只加列不删列；迁移命名 `V<N>__<desc>.sql`。
- TDD：每个功能先写失败测试（RED）→ 最小实现（GREEN）→ 重构；禁止 `as any`/`@ts-ignore` 类压制（Java 侧禁 unchecked 压制异常，禁空 catch）。
- example 模块是 Spring Modulith package 模块（非 Maven 子模块），依赖方向 example → engine.common/api.dto，不反向。
- 测试命令统一在 `backend/` 目录执行：`mvn test -q`（单测）或 `mvn test -q -Dtest=<ClassName>`（指定类）。

---

### Task 1: BizDataHandler 覆盖声明（能力层）

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/form/bizdata/BizDataHandler.java`
- Modify: `backend/src/main/java/com/workflow/engine/form/bizdata/BizDataService.java`
- Test: `backend/src/test/java/com/workflow/engine/form/bizdata/BizDataHandlerTest.java`

**Interfaces:**
- Consumes: 现有 `BizDataHandler`（`getFormKey()`、4 个装饰钩子 default 方法、`BizDataVO`）。
- Produces: 覆盖声明 `overridesCreate/Update/Delete/Query(): boolean`（default false）与强类型方法 `create(Map)/update(String,Map,Integer)/delete(String)/query(BizDataQueryRequest): BizDataVO|BizDataPageVO`（default 抛 `UnsupportedOperationException`）；`BizDataService` 持有 `Map<String,BizDataHandler> coveringIndex`（按 formKey+操作）。

- [ ] **Step 1: 新增覆盖接管的失败测试**

在 `BizDataHandlerTest`（先读现有文件，仿既有测试风格，`Mockito` mock `TableManager/FormDefService/TenantProvider/ObjectMapper/JdbcTemplate`，构造 `BizDataService`）追加：

```java
@Test
void handlerOverridingQuery_TakesOverQuery() {
    BizDataHandler overriding = mock(BizDataHandler.class);
    when(overriding.getFormKey()).thenReturn("emp_profile");
    when(overriding.overridesQuery()).thenReturn(true);
    BizDataPageVO expected = new BizDataPageVO(List.of(), 0L);
    when(overriding.query(any())).thenReturn(expected);
    // 构造 BizDataService（含 handlers=List.of(overriding) 与 guards=List.of()）
    BizDataPageVO result = service.query("emp_profile", new BizDataQueryRequest());
    assertSame(expected, result);
    verify(overriding).query(any());
}
```

- [ ] **Step 2: 运行验证失败**

Run: `mvn test -q -Dtest=BizDataHandlerTest` — Expected: FAIL（编译错：接口无 `overridesQuery`/`query` 方法）。

- [ ] **Step 3: 扩展 BizDataHandler 接口**

在 `BizDataHandler.java` 追加 8 个 default 方法（签名见 Interfaces 段）；覆盖方法 default 抛 `new UnsupportedOperationException("handler overrides but does not implement: " + getFormKey())`。

- [ ] **Step 4: BizDataService 构建覆盖索引 + 交接路由**

改造 `BizDataService`：
1. 构造后构建 `coveringIndex`：`Map<String, BizDataHandler>`，key 为 `formKey + "." + op`（op ∈ create/update/delete/query）；同一 (formKey,op) 已存在时抛 `IllegalStateException("duplicate override declaration: " + formKey)`。
2. `query(formKey, req)`：命中 coveringIndex 的 handler 直接 `return handler.query(req)`（不执行通用实现与 query 装饰）。
3. 注意：`loadContext` 等现有私有逻辑与表名解析保持原有实现（Task 2 才拆分）。

- [ ] **Step 5: 运行测试验证通过**

Run: `mvn test -q -Dtest=BizDataHandlerTest` — Expected: PASS（新旧用例全部绿）。

- [ ] **Step 6: 补冲突检测失败测试 + 实现**

新增用例：两个 mock handler 同 formKey 均 `overridesQuery()==true` → 构造 `BizDataService` 时抛 `IllegalStateException`；补充"仅覆盖 query 时 update 仍走通用"用例（verify 通用删除/更新路径未被短路）。运行 `mvn test -q -Dtest=BizDataHandlerTest` 至全绿。

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/workflow/engine/form/bizdata backend/src/test/java/com/workflow/engine/form/bizdata
git commit -m "feat(bizdata): handler override declarations for CRUD takeover"
```

---

### Task 2: BizDataSupport 复用面 + BizDataService 门面化

**Files:**
- Create: `backend/src/main/java/com/workflow/engine/form/bizdata/BizDataSupport.java`
- Modify: `backend/src/main/java/com/workflow/engine/form/bizdata/BizDataService.java`
- Modify: `backend/src/test/java/com/workflow/engine/form/bizdata/BizDataHandlerTest.java`

**Interfaces:**
- Consumes: Task 1 的覆盖索引与交接路由。
- Produces: `BizDataSupport` 公开方法——`loadContext(String formKey): BizDataContext`、`findById(String tableName, String tenantId, BizDataContext ctx, String id): BizDataVO`、`validateRequired(List<ColumnConfig>, Map<String,Object>)`、`resolvePickerValues(BizDataContext, Map<String,Object>): Map<String,Object>`、`createGeneric/updateGeneric/deleteGeneric/queryGeneric(...)`（签名与现有私有实现一致，仅去 private）；`BizDataContext` 提升为 public record。

- [ ] **Step 1: 抽取 BizDataSupport（先移后编译）**

从 `BizDataService` 剪切通用实现到新类 `BizDataSupport`（@Component，构造注入现有依赖：JdbcTemplate/TableManager/FormDefService/TenantProvider/ObjectMapper）。`BizDataContext` 提为 public record（同包或 `api.dto`，取与 BizDataService 原定义一致的位置）。`BizDataService` 构造器签名保持兼容：内部 `new BizDataSupport(原始依赖...)` 并持有；再增 `List<FormProcessGuard> guards` 参数（守卫接线 Task 4 用，此步先传空列表即可编译）。

- [ ] **Step 2: 四个入口改走委托**

`create/update/delete/query` 通用路径改为调用 `support.createGeneric/...`；保持对外行为不变。运行 `mvn test -q -Dtest=BizDataHandlerTest` 确认既有测试仍绿（此时 Test 构造签名需加 `List.of()` guards 实参）。

- [ ] **Step 3: 复用面可见性测试**

追加用例：覆盖 create 的 handler 实体内直接调用 `support.createGeneric(...)` 断言数据落库（先写失败测试 → 暴露 support 签名 → 补实现 → 转绿，TDD 循环一次）。

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java backend/src/test/java
git commit -m "refactor(bizdata): split BizDataSupport reusable surface, gate BizDataService as facade"
```

---

### Task 3: FormProcessGuard 接口 + V30 迁移 + FlowableFormProcessGuard

**Files:**
- Create: `backend/src/main/java/com/workflow/engine/form/bizdata/FormProcessGuard.java`
- Create: `backend/src/main/java/com/workflow/engine/process/FlowableFormProcessGuard.java`
- Create: `backend/src/main/resources/db/migration/V30__add_form_def_process_key.sql`
- Modify: `backend/src/main/java/com/workflow/engine/form/`（FormDefinition 实体/DTO，按项目现有字段映射风格）
- Test: `backend/src/test/java/com/workflow/engine/form/bizdata/FlowableFormProcessGuardTest.java`（新建）

**Interfaces:**
- Consumes: `FormDefinitionService`（按 formKey 取表单定义，含 processKey）、flowable `RuntimeService`/`HistoryService`。
- Produces: `FormProcessGuard` 接口（三方法见 Task 3 Step 1）；`FlowableFormProcessGuard`（`@Service`，`appliesTo` 依 processKey 非空；`checkBeforeUpdate` 运行中实例命中抛 `BusinessException`(409)；`checkBeforeDelete` 任意实例命中抛 409）。

- [ ] **Step 1: 定义守卫接口（先测试先导）**

`FormProcessGuard.java` 接口（包 `com.workflow.engine.form.bizdata`，仅反编译断言）：接口源文件不含 flowable import——此约束用测试守卫：新建 `FlowableFormProcessGuardTest` mock `RuntimeService`/`HistoryService`/`FormDefinitionService`：

```java
@Test
void checkBeforeUpdate_runningInstance_rejects409() {
    // runningQuery 命中 1 个实例 → 预期抛 BusinessException（code=409 语义）
}
@Test
void checkBeforeUpdate_noInstance_allows() { /* 不抛 */ }
@Test
void checkBeforeDelete_finishedInstance_rejects409() { /* 历史查询命中 → 抛 */ }
@Test
void checkBeforeDelete_noInstance_allows() { /* 不抛 */ }
@Test
void appliesTo_boundFormKey_true() { /* processKey 非空 → true */ }
```

- [ ] **Step 2: 运行验证失败**

Run: `mvn test -q -Dtest=FlowableFormProcessGuardTest` — Expected: FAIL（类不存在）。

- [ ] **Step 3: 实现接口 + Flowable 实现**

按 Interfaces 段签名实现（Flowable query 用法：`runtimeService.createProcessInstanceQuery().processInstanceTenantId(tenantId).processInstanceBusinessKey(id).active().exists()`；历史：`historyService.createHistoricProcessInstanceQuery().processInstanceTenantId(tenantId).processInstanceBusinessKey(id).exists()`。tenantId 从 `TenantProvider` 取）。

- [ ] **Step 4: V30 迁移 + FormDefinition 字段**

`V30__add_form_def_process_key.sql`：`ALTER TABLE wf_form_def ADD COLUMN process_key VARCHAR(64) NULL;`（先读 V19/V23 迁移确认表名与列风格）。`FormDefinition` 实体/DTO 加 `processKey` 字段（按现有列映射风格），发布/编辑链路透传。

- [ ] **Step 5: 运行测试验证通过 + Commit**

Run: `mvn test -q -Dtest=FlowableFormProcessGuardTest,FormDefinitionTest`（如有）— 全绿后：

```bash
git add backend/src/main/java backend/src/main/resources backend/src/test/java
git commit -m "feat(form): process state guard interface + flowable impl + process_key binding (V30)"
```

---

### Task 4: BizDataService 守卫接线

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/form/bizdata/BizDataService.java`
- Modify: `backend/src/test/java/com/workflow/engine/form/bizdata/BizDataHandlerTest.java`

**Interfaces:**
- Consumes: Task 2 构造器 `List<FormProcessGuard> guards`、Task 3 守卫契约。
- Produces: `BizDataService.update/delete` 在覆盖检测之后、委托之前执行：`guards.stream().filter(g->g.appliesTo(formKey)).forEach(g->g.checkBeforeUpdate/Delete(formKey,id))`。

- [ ] **Step 1: 写守卫接线失败测试**

`BizDataHandlerTest` 追加：mock guard，`appliesTo("locked_form") → true`；`service.update("locked_form", id, data, version)` → `verify(guard).checkBeforeUpdate(...)` 被调用；`appliesTo` 返回 false 的 guard 不被调用。

- [ ] **Step 2: 运行验证失败 + 实现接线**

Run: `mvn test -q -Dtest=BizDataHandlerTest` FAIL → 实现接线 → PASS。注意：覆盖接管路径（Task 1）不自动跑守卫（spec 规定覆盖实现自行负责），只在通用委托路径接线。

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java backend/src/test/java
git commit -m "feat(bizdata): wire process guards into update/delete facade"
```

---

### Task 5: example — emp 业务表单子域

**Files:**
- Create: `backend/src/main/java/com/workflow/example/emp/EmpProfileHandler.java`
- Create: `backend/src/main/java/com/workflow/example/emp/EmpProfileBizService.java`
- Create: `backend/src/main/java/com/workflow/example/emp/EmpProfileController.java`
- Test: `backend/src/test/java/com/workflow/example/emp/EmpProfileHandlerTest.java`

**Interfaces:**
- Consumes: `BizDataSupport`（覆盖实现注入复用面）、`BizDataHandler`（@Component 注册）、通用 CRUD 实体 `XxxBizService` 模式（参照现有 `BizDataController` 的响应封装）。
- Produces: `EmpProfileHandler`（formKey=`emp_profile`，`overridesQuery` 实现计算 `在职天数`（入职日期→今天）+ 按当前用户部门过滤，返回 `BizDataPageVO`；beforeCreate 手机号正则 `^1\d{10}$` 非法抛 400；beforeDelete 在职禁删抛 409）；`EmpProfileBizService.adjustSalary(String id, BigDecimal amount)`、`resign(String id, String reason)`；Controller `POST /api/v1/example/emp/adjust-salary`、`POST /api/v1/example/emp/resign`。

- [ ] **Step 1: 写失败测试**

`EmpProfileHandlerTest`（Mockito，仿 Task 1 测试风格）：覆盖查询返回在职天数且按部门过滤；新建非法手机号抛业务异常 400；删除在职员工抛 409。

- [ ] **Step 2: 运行验证失败并实现 Handler**

`mvn test -q -Dtest=EmpProfileHandlerTest` FAIL → 实现 `EmpProfileHandler`（注入 `BizDataSupport`，query 中调 `support.queryGeneric(...)` 或 `loadContext/findById` 组合——依现有 queryGeneric 返回结构，逐行补 `在职天数` 字段、按当前登录用户 dept 过滤；当前用户从项目现有安全上下文取——grep `SecurityContextHolder` 或 `currentUser` 确认）→ PASS。

- [ ] **Step 3: 实现 BizService + Controller**

`EmpProfileBizService`（`@Service`，注入 `BizDataService`/`BizDataSupport`）与 `EmpProfileController`（`@RestController`，REST 风格对齐 `BizDataController`——先读它确认请求/响应封装约定）。

- [ ] **Step 4: 运行完整测试 + Commit**

`mvn test -q` 全绿后：

```bash
git add backend/src/main/java/com/workflow/example backend/src/test/java/com/workflow/example
git commit -m "feat(example): emp_profile domain with overridden query + semantic ops"
```

---

### Task 6: example — leave 工作流表单子域

**Files:**
- Create: `backend/src/main/java/com/workflow/example/leave/LeaveBillHandler.java`
- Create: `backend/src/main/java/com/workflow/example/leave/LeaveBillBizService.java`
- Create: `backend/src/main/java/com/workflow/example/leave/LeaveBillController.java`
- Create: `backend/src/main/resources/example/leave-bill.bpmn20.xml`
- Test: `backend/src/test/java/com/workflow/example/leave/LeaveBillWorkflowIntegrationTest.java`

**Interfaces:**
- Consumes: `BizDataService`、`ProcessInstanceService.startProcess(processKey, businessKey, variables)`、`WorkflowTaskService`（完成任务）、`RejectService`（驳回）、`TenantProvider`。
- Produces: `LeaveBillHandler`（formKey=`leave_bill`；beforeCreate 天数>5 必填理由；afterCreate 置 `status=草稿`）；`LeaveBillBizService.submit(id)`（`startProcess("leave-bill", id, vars)` + `status=待审批`）、`approve(taskId)`（完成任务 + `status=已批准`）、`reject(taskId, reason)`（驳回 + `status=已驳回`）；Controller `POST /api/v1/example/leave/submit|approve|reject`。

- [ ] **Step 1: 编写静态 BPMN**

`leave-bill.bpmn20.xml`：流程 key=`leave-bill`；流程变量 `businessKey`（SUBMIT 节点任务变量 `submitterId`）；节点=提交（startEvent+userTask 提交人自动完成或直接 start）→ userTask 部门经理审批（assignee 取变量或固定值，注释标注示例简化）→ endEvent。参考 `backend/src/test/resources` 或设计器产物确认 flowable 8 的 bpmn 头（`xmlns:flowable` 命名空间）。

- [ ] **Step 2: 写全链路集成测试（先失败）**

`LeaveBillWorkflowIntegrationTest`（@SpringBootTest 或切片，H2，`RepositoryService.createDeployment().addString("leave-bill.bpmn20.xml", bpmnXml).name("leave-bill").deploy()`）用例链：
1. 创建 leave_bill 行（草稿）→ PUT 更新成功、DELETE 成功；
2. `submit(id)` → 流程实例存在（businessKey=id）、status=待审批；
3. 运行中 PUT → 409；DELETE → 409；
4. `approve(taskId)`（构造：查 task 或 mock 完成）→ status=已批准、流程结束；
5. 结束后 PUT → 成功；DELETE → 409。
先只写断言结构 + 空实现，运行确认 FAIL（无法编译/无实现）。

- [ ] **Step 3: 实现 Handler + BizService + Controller**

按 Interfaces 签名实现；`leave_bill` 表的 formKey 需在测试库存在（`wf_biz_leave_bill` —— 复用现有 `BizDataHandlerTest` 的表约定，见其建表脚本或测试前置，缺失时在测试 `@BeforeEach` 建表，参照 BizDataHandlerTest 做法）。

- [ ] **Step 4: 运行测试至全绿 + Commit**

Run: `mvn test -q -Dtest=LeaveBillWorkflowIntegrationTest` → 全绿；再 `mvn test -q` 全量。

```bash
git add backend/src/main/java/com/workflow/example backend/src/main/resources/example backend/src/test/java/com/workflow/example
git commit -m "feat(example): leave_bill full workflow (bpmn + submit/approve/reject + guard integration)"
```

---

### Task 7: 整体验证

- [ ] **Step 1: 全量测试** — `mvn test -q`（backend 目录）Expected: BUILD SUCCESS。
- [ ] **Step 2: 规范自查** — 无 unchecked 压制异常、无空 catch；包结构/命名与项目风格一致；变更文件 `lsp_diagnostics` 无 error。
- [ ] **Step 3: 对齐 specs** — 对照 `specs/` 4 个文件逐条核对场景已被测试覆盖；缺则补测。
- [ ] **Step 4: Commit（如有遗留）**

```bash
git add -A
git commit -m "chore: final verification for bizdata-extension-examples"
```