# Design: BizData 扩展能力 + example 示例模块

## Context

**当前状态**：`BizDataService` 是统一的业务表单数据服务，面向 `wf_biz_<formKey>` 动态表提供标准 CRUD（`create/query/getById/update/delete` + 子表行 CRUD），并已实现 `BizDataHandler` SPI 钩子（`beforeCreate/afterCreate/beforeUpdate/beforeDelete`，按 formKey 注册、Spring 自动注入、`handlerIndex` 按 key 索引）。

**两条独立数据链路（关键约束）**：
1. **`wf_biz_<formKey>` 动态表**（`BizDataService`）——业务数据管理链路，本文档的扩展对象。
2. **`wf_form_data` 实体表**（`FormDataService`）——流程表单链路（发起草稿/当前数据/审批快照，`isSnapshot` 区分），`FormDataMerger`/`VariableMappingWriter` 在该链路上做表单↔流程变量映射。

**约束**：
- Spring Modulith 模块化单体：模块 = package 边界，`engine.form.bizdata` 不得依赖 flowable（引擎依赖集中在 `engine.process`/`engine.task`）。
- Flowable 8；流程定义由设计器动态部署（无静态 BPMN 惯例，示例将引入 resources 静态文件 + 测试内 `RepositoryService` 部署两种方式）。
- Flyway 迁移命名 `V<N>__<desc>.sql`，当前最新 V29。
- 现有 `BizDataHandler` 构造器注入 `List<BizDataHandler> handlers`，测试 `BizDataHandlerTest` 直接 `new BizDataService(...)`。
- 流程-业务关联已存在机制：`ProcessInstanceService.startProcess(processKey, businessKey, variables)`（businessKey 可承载业务行 id）。

**Stakeholders**：业务表单开发者（handler 作者）、流程集成方、平台核心（bizdata/process 模块）。

## Goals / Non-Goals

**Goals:**
1. 为 `BizDataHandler` 增加**强类型覆盖声明**（`overridesQuery/Create/Update/Delete`），支持复杂 CRUD 完整接管通用实现；通用路径单点交接、零场景分支。
2. 提供**引擎状态守卫** `FormProcessGuard`：工作流表单 CRUD 统一拦截（运行中禁改禁删、已结束可改不可删、草稿自由），bizdata 与 flowable 解耦。
3. `BizDataService` 拆出**复用面**（表元数据/行读写/通用实现委托点），供覆盖 handler 与示例模块复用，且**无循环依赖**。
4. 新建 `com.workflow.example` Modulith 模块，交付两个示例：`emp_profile` 业务表单（覆盖 query 演示复杂计算）+ `leave_bill` 工作流表单（全链路：真实 BPMN + 语义操作 + 守卫拦截）。
5. 完整测试：能力层单测 + example 单测 + leave 全链路集成测试（H2 + Flowable）。

**Non-Goals:**
- 不改 `BizDataService` 的系统列模型（不引入 status/process_instance_id 系统列；`status` 作为业务列由语义操作维护）。
- 不动 `wf_form_data` 链路（`FormDataService`/`FormDataMerger`/`VariableMappingWriter` 原样保留）。
- 不做事件驱动解耦（不用 Spring ApplicationEvent / Flowable 全局监听器写回状态；状态写回由语义操作显式完成，示例保持透明可控）。
- 不加 Maven 多模块构建（example 是 package 模块，非聚合 pom）。
- 不实现"部分覆盖/半接管"（覆盖即全权接管，装饰链不自动执行）。

## Decisions

### D1. `BizDataHandler` 覆盖声明（强类型，签名去 formKey）

```java
public interface BizDataHandler {
    String getFormKey();

    // —— 装饰钩子（所有 handler 链式执行，不变）——
    default void beforeCreate(Map<String,Object> data) {}
    default void afterCreate(BizDataVO vo) {}
    default void beforeUpdate(Map<String,Object> data, BizDataVO existing) {}
    default void beforeDelete(BizDataVO existing) {}

    // —— 覆盖声明（binding 即专属：签名不含 formKey）——
    default boolean overridesCreate() { return false; }
    default BizDataVO create(Map<String,Object> data) { throw new UnsupportedOperationException(); }
    default boolean overridesUpdate() { return false; }
    default BizDataVO update(String id, Map<String,Object> data, Integer version) { throw new UnsupportedOperationException(); }
    default boolean overridesDelete() { return false; }
    default void delete(String id) { throw new UnsupportedOperationException(); }
    default boolean overridesQuery() { return false; }
    default BizDataPageVO query(BizDataQueryRequest req) { throw new UnsupportedOperationException(); }
}
```

**规则**：
- **重复覆盖声明 = 启动失败**：`buildHandlerIndex` 阶段收集覆盖声明（`overridesXxx()==true` 的 handler），同一 formKey 存在 2+ 个覆盖声明 → `IllegalStateException`（fail-fast）。
- **覆盖接管时装饰钩子不自动执行**：覆盖实现全权负责；如需复用通用逻辑，调用 `BizDataSupport` 的委托点。
- 覆盖方法自己的事务由实现方标注 `@Transactional`（走 Spring bean 代理）。

**为何签名去 formKey**：handler 绑定即专属（`handlerIndex` 已按 formKey 隔离），调用时无需再传；否则每个覆盖方法都要写 formKey 守卫，把注册表的职责推回方法内部。

### D2. `BizDataService` 拆为门面 + `BizDataSupport`（解循环依赖）

**循环依赖问题**：覆盖 handler 需要复用通用 CRUD（等价"super"），若注入整个 `BizDataService`，而 `BizDataService` 构造器又接收 `List<BizDataHandler>` → 循环依赖。

**解法**：把通用实现与复用面提取为独立组件 `BizDataSupport`：

```
engine.form.bizdata 包（重构后）
├── BizDataHandler          # 接口（D1）
├── BizDataService          # 门面：对外 CRUD 入口（覆盖检测→装饰链→守卫→委托 Support）
├── BizDataSupport          # @Component：通用 CRUD 实现 + 表元数据/行读写复用面
├── FormProcessGuard        # 接口（D4）
├── BizDataContext          # 复用面值类型（record，public）
├── BizDataQueryBuilder     # 不变
└── BizDataVO / BizDataPageVO / ...   # 不变（api.dto）
```

**`BizDataSupport` 公开复用面**：
- `BizDataContext loadContext(String formKey)`（现值 type 提升 public）
- `BizDataVO findById(String tableName, String tenantId, BizDataContext ctx, String id)`
- `Map<String,Object> resolvePickerValues(BizDataContext ctx, Map<String,Object> merged)`
- `void validateRequired(List<ColumnConfig> columns, Map<String,Object> data)`
- 通用实现委托点：`createGeneric(...)`/`updateGeneric(...)`/`deleteGeneric(...)`/`queryGeneric(...)`（支持覆盖实现"复用一部分"）

**`BizDataService` 门面（对外 API 不变）**，四入口统一形态：

```java
public BizDataPageVO query(String formKey, BizDataQueryRequest req) {
    BizDataHandler main = coveringHandler(formKey, BizDataHandler::overridesQuery); // 无覆盖→null
    if (main != null) return main.query(req);          // ← 单点交接
    return support.queryGeneric(formKey, req);          // ← 通用路径零分支
}
// create: 覆盖检测(none→createGeneric)；update/delete 同构，且 update/delete 额外先跑守卫（D4）
```

**现有测试影响**：`BizDataHandlerTest` 直接 `new BizDataService(jdbcTemplate, tableManager, formDefService, tenantProvider, objectMapper, handlers)` 的构造方式需迁移为 `new BizDataService(support, handlers, guards)`（或继续传原始依赖，由门面内部组装 `BizDataSupport`——保持构造签名兼容更优，见 D2a）。

**D2a（构造兼容）**：`BizDataService` 保留现有构造器签名（接受原始依赖 + 新增 `List<FormProcessGuard> guards`），内部实例化 `BizDataSupport` 并持有。文件改动集中在门面方法；现有 8 处调用点（Controller/测试）无需改签名，仅构造器参数追加 guards。

### D3. 语义化业务操作：`XxxBizService` + Controller（example 层）

工作流/复杂表单的**语义操作**（提交/审核/调薪/离职）不塞进 handler 覆盖，而是 example 模块内的 `BizService`（组合 `BizDataSupport`/引擎服务），Controller 暴露语义 REST。handler 覆盖只承载"契约不变的复杂 CRUD"（如复杂 list）；语义操作是"新契约"（新方法/新端点）。

### D4. 引擎状态守卫 `FormProcessGuard`

```java
// engine.form.bizdata 包（不依赖 flowable）
public interface FormProcessGuard {
    /** 该 formKey 是否受流程状态约束（绑定配置判定） */
    boolean appliesTo(String formKey);
    /** 更新前检查：运行中的流程实例 → 抛 BusinessException 拒绝 */
    void checkBeforeUpdate(String formKey, String id);
    /** 删除前检查：存在流程实例（含已结束）→ 抛 BusinessException 拒绝 */
    void checkBeforeDelete(String formKey, String id);
}

// engine.process 包（实现，依赖 flowable）
@Service
public class FlowableFormProcessGuard implements FormProcessGuard {
    // appliesTo: formDef.processKey 非空
    // checkBeforeUpdate: runtimeService.createProcessInstanceQuery()
    //     .processInstanceTenantId(tenant).processInstanceBusinessKey(id).active().exists()
    //     → true 抛 409 "流程流转中，禁止修改"
    // checkBeforeDelete: .active() 或历史表存在实例 → 抛 409 "已发起流程，禁止删除"
}
```

**绑定配置**：`FormDefinition` 新增可选 `processKey` 列（`wf_form_def.process_key`，V30 迁移）。`appliesTo` 据此判定——formDef 通过 `formKey` 反查（`FormDefinitionService.getBusinessColumnsByKey` 同源）。

**流程关联**：复用 `startProcess(processKey, businessKey=业务行id, variables)`，零 wf_biz 表结构侵入；守卫以行 id 反向查询运行中实例。

**接线**：`BizDataService` 构造注入 `List<FormProcessGuard> guards`，`update`/`delete` 门面在覆盖检测后、委托前遍历：`guards.stream().filter(g -> g.appliesTo(formKey)).forEach(g -> g.checkBeforeXxx(formKey, id))`（守卫检查在覆盖接管之外也保留——覆盖实现的语义操作内部同样应调用）。

### D5. example 模块结构（`com.workflow.example`，Modulith 包模块）

```
com.workflow.example
├── emp/
│   ├── EmpProfileHandler            # formKey=emp_profile
│   │     overridesQuery → 复杂计算：在职天数 + 当前用户部门过滤（返回结构=分页表单行，契约不变）
│   │     beforeCreate → 手机号格式校验；beforeDelete → 在职禁删
│   ├── EmpProfileBizService         # 语义操作：adjustSalary(id, amount) / resign(id, reason)
│   └── EmpProfileController         # POST /api/v1/example/emp/adjust-salary 等（继承通用 CRUD，仅加语义端点）
└── leave/
    ├── LeaveBillHandler             # formKey=leave_bill
    │     beforeCreate → 天数>5 必须填理由；afterCreate → 初始 status=草稿
    ├── LeaveBillBizService          # submit(id) → startProcess(businessKey=id, variables) + status=待审批
    │                                 # approve(taskId) / reject(taskId, reason) → WorkflowTaskService/RejectService + 状态写回
    ├── LeaveBillController          # POST /api/v1/example/leave/submit 等
    └── resources/leave-bill.bpmn20.xml   # 提交(发起人自动完成)→部门经理审批→结束
```

**依赖方向**：`example → engine.form.bizdata / engine.process / engine.task / api.dto / common.exception`（Modulith 允许的纵向应用层依赖，不违反模块边界）。

**BPMN**：静态 `leave-bill.bpmn20.xml` 放 `backend/src/main/resources/example/`（同名目录 resources 跟随模块），集成测试用 `RepositoryService.createDeployment().addString(...)` 动态部署（与设计器部署机制一致）。

### D6. 测试策略

| 层级 | 测试 | 方式 |
|---|---|---|
| 能力层 | 覆盖机制：只覆盖 query、其他走通用；重复覆盖启动失败；覆盖时装饰不自动执行 | Mockito 单测（仿 `BizDataHandlerTest` 风格） |
| 能力层 | `FlowableFormProcessGuard`：运行中拦截更新/删除、结束可改不可删、无实例放行 | Mockito mock `RuntimeService`/`HistoryService` |
| 能力层 | `BizDataService` 门面：守卫接线（appliesTo 过滤） | Mockito |
| example | `EmpProfileHandlerTest`：覆盖 query 计算逻辑、钩子校验 | Mockito |
| example | `LeaveBillWorkflowIntegrationTest`（全链路）：部署 BPMN → 草稿可改 → submit 发起 → 运行中 update/delete 被守卫拦截 → approve → 流程结束 → 可改不可删 | H2 + Flowable（@SpringBootTest 或流程引擎切片） |

## Risks / Trade-offs

- **[覆盖使通用端点语义变轻]** 覆盖后该 formKey 的通用 CRUD 端点仍存在，但行为由 handler 决定 → 覆盖声明是显式契约，实现类文档注释声明；非覆盖端点行为与通用实现保持一致。
- **[BizDataService 重构波及面]** 门面化改动影响现有构造调用 → D2a 保持构造签名兼容，仅追加 guards 参数；现有 `BizDataHandlerTest` 迁移成本小。
- **[循环依赖]** handler 复用通用实现若注入整个 BizDataService 会成环 → 复用力进 `BizDataSupport` 独立组件，依赖方向单向。
- **[守卫查询性能]** 每次 update/delete 一次 runtime 查询 → 单行操作频率低可接受；后续可改 process_instance_id 系统列索引化（NON-Goal，留作演进）。
- **[静态 BPMN 与设计器部署双轨]** 示例引入静态 bpmn 文件，与"设计器动态部署"惯例不同 → 示例定位为演示，明确注释；测试内动态部署保证与生产机制一致。
- **[status 业务列的一致性]** status 由语义操作维护，若绕过语义操作直接改行会失一致 → 由守卫兜底大部分（发起后可禁改），示例文档标注约定。

## Migration Plan

1. **能力层落地**（engine.form.bizdata/process）：D1 接口扩展 → D2 BizDataSupport/门面拆分 → D4 守卫接口+实现 → V30 迁移（`wf_form_def` 加 `process_key`）。
2. **example 模块**：新建 `com.workflow.example` 包，emp 先（无引擎依赖）→ leave 后（BPMN + 语义操作 + 守卫联动）。
3. **验证**：能力层单测 → example 单测 → leave 全链路集成测试 → 后端整体编译 + `pom` 测试通过。
4. **回滚**：迁移 V30 可逆（`ALTER TABLE ... DROP COLUMN`）；能力层为纯增量（接口 default 方法 + 门面），不破坏旧 handler；example 为独立包，删除即还原。

## Open Questions

- 无（brainstorm 阶段三个分歧点已确认：status 业务列 / processKey 绑定列 / 守卫默认语义）。