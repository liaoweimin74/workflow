# Brainstorm: BizData 扩展能力 + example 示例模块

## Design Summary

**目标**：解决"业务表单统一 Service 如何承载场景特定需求"的架构问题，落地三项能力并给出两个示例。

**现状**：`BizDataService`（`wf_biz_<formKey>` 动态表）已提供通用 CRUD + `BizDataHandler` SPI 钩子（`beforeCreate/afterCreate/beforeUpdate/beforeDelete`，按 formKey 注册）。但存在三个缺口：
1. **语义化业务操作**（提交/审核/转办等）无承载位置——`BizDataService` 只有标准 CRUD。
2. **复杂 CRUD**（如 list 复杂计算）无法覆盖通用实现——before/after 钩子只能"装饰"，不能"替换"。
3. **工作流表单的 CRUD 约束**（已发起→禁改、流转中→禁删）无统一拦截——引擎与 `wf_biz` 表尚未联动。

**方案**（三层拼图）：

- **① 普通/复杂业务表单**：`BizDataHandler` 增加**覆盖声明**（`overridesQuery/Create/Update/Delete` + 对应强类型方法，签名去掉 formKey），通用路径单点交接、零分支；重复覆盖声明启动失败（fail-fast）。`BizDataService` 拆出 `*Generic` 委托点 + public 复用面（`loadContext/findById/resolvePickerValues/validateRequired`）。
- **② 引擎状态守卫**：新接口 `FormProcessGuard`（定义在 `engine.form.bizdata`，不依赖 flowable），实现 `FlowableFormProcessGuard`（`engine.process`）。绑定配置 = `FormDefinition` 新增可选 `processKey` 列（flyway 迁移）；关联方式复用 `startProcess(businessKey=业务行id)`。语义：运行中禁改禁删、已结束可改不可删、无实例（草稿）自由。`BizDataService.update/delete` 入口遍历守卫检查。
- **③ example 模块**（`com.workflow.example`，Spring Modulith package 模块）：
  - `emp/`（业务表单 `emp_profile`）：`EmpProfileHandler` 覆盖 `query`（在职天数计算 + 当前用户部门过滤，契约不变返回分页表单行）+ 装饰钩子（手机号校验、在职禁删）；`EmpProfileBizService`+Controller 演示语义操作（调薪/离职）。
  - `leave/`（工作流表单 `leave_bill`）：`LeaveBillHandler` 钩子校验（天数/理由联动）+ `status` 业务列；`LeaveBillBizService` 语义操作 `submit`（`startProcess` + `status=submitted`）、`approve/reject`（走 `WorkflowTaskService`/`RejectService` + 状态写回）；静态 `leave-bill.bpmn20.xml`（提交→经理审批→结束）；全链路集成测试演示"草稿可改→提交→运行中禁改禁删→审批→结束可改"。

**测试策略**：能力层单测（mock 覆盖机制、守卫）；example 单测 + `LeaveBillWorkflowIntegrationTest`（H2 + Flowable + `RepositoryService` 部署 BPMN）。

## Alternatives Considered

### 方案 A：统一动作分发器（字符串路由）
- **做法**：`BizDataHandler` 增加 `handleAction(String action, Map params)`，`BizDataService` 增加 `execute(formKey, id, action, params)`，Controller 暴露 `POST /.../{formKey}/{id}/actions/{action}`。
- **优点**：完全复用现有 handler 注册机制；新增场景 = 新增 handler 方法。
- **缺点**：动作是字符串，失去类型安全；参数仍是无结构 `Map`；返回值异构被迫 Object；Swagger 退化为万能接口；action 分支随表单堆积。
- **为何未采用**：把强类型方法拍平成字符串 RPC，契约不可发现，可测试性差。

### 方案 B：每个业务场景独立 Service + Controller（服务外移）
- **做法**：`XxxBizService` 组合 `BizDataService`，语义化方法 + 独立 Controller。
- **优点**：方法语义明确、参数强类型、可独立单测；审核类可对接流程引擎。
- **缺点**：极端情况（复杂场景全外移）端点分散；若做成"handler 与 service 两套并存"会增加认知负担。
- **为何未完全采用**：作为"语义操作"的正确承载形态被吸收进 Agreed Approach（example 的 BizService 即此形态），但复杂 CRUD 的覆盖仍留在 handler 机制内，避免两套扩展体系。

### 方案 C：状态机化（CRUD 约束建模为状态迁移）
- **做法**：表单加 `status` 字段，业务操作 = 显式状态迁移（draft→pending→approved），迁移规则表驱动或 handler 驱动。
- **优点**：非法流转被模型直接拒绝，审计清晰。
- **缺点**："审核"涉及人/流程/多步流转，状态机只解决一半；对多数场景过度设计；工作流表单的状态迁移天然归流程引擎管。
- **为何未采用**：状态机能力被流程引擎（Flowable）替代——工作流表单的状态写回由引擎任务驱动，业务层只维护 status 列快照。

### 方案 D（讨论过未入列）：类继承覆盖（extends BizDataService）
- **做法**：`LeaveBillService extends BizDataService`，override CRUD 方法。
- **优点**：Java 原生多态；`super` 调用直观。
- **缺点**：粒度错配（通用=管所有 formKey，场景=管一个 formKey，每个覆盖方法要写 formKey 守卫）；is-a 语义虚；Spring 容器同类型多 bean 冲突；脆弱基类。
- **为何未采用**：改用**接口缺省方法继承 + 组合委托**——`BizDataHandler` 已是指针，补"覆盖声明"即闭环，无类继承的四个硬伤。

## Agreed Approach

**接口继承 + 组合委托**（方案 A 的反面、B 的语义操作部分 + D 的继承便利以接口缺省方法形式保留）：

1. `BizDataHandler` 增加强类型覆盖声明（装饰钩子保留，覆盖接管时装饰不再自动执行）。
2. `FormProcessGuard` 接口 + `FlowableFormProcessGuard` 实现，bizdata 与 flowable 解耦。
3. 绑定配置：`FormDefinition.processKey` 可选列（flyway 迁移）。
4. `com.workflow.example` Modulith 模块，emp/leave 两个子域；leave 全链路（真实 BPMN + 引擎语义操作 + 守卫拦截）。

## Key Decisions

1. **覆盖签名去掉 formKey**：handler 绑定即专属，避免守卫逻辑重复（覆盖接口天然按 formKey 隔离）。
2. **重复覆盖声明 = 启动失败**：fail-fast，杜绝"多个 handler 各说各话"。
3. **覆盖接管时装饰钩子不再自动执行**：覆盖方全权负责，保证单一可预测执行路径。
4. **`status` 是业务列**（表单定义里配置），由语义操作维护；不改 `BizDataService` 系统列模型（流程关联用 businessKey 反查，零表结构侵入 wf_biz）。
5. **`FormDefinition` 加 `processKey` 绑定列**（flyway 迁移一列）作为守卫判定来源，表单设计器发布时可选关联流程。
6. **守卫语义**：运行中禁改禁删；已结束可改不可删；无实例（草稿）自由。
7. **example 用 Spring Modulith package 模块**（非 Maven 子模块），契合项目模块化单体架构，零构建改动。
8. **全链路示例动静态结合**：静态 BPMN 文件 + 测试内 `RepositoryService` 动态部署（与现有设计器动态部署机制一致）。

## Open Questions

- 无（三个待拍板边界点均已由用户确认：status 业务列、processKey 绑定列、守卫默认语义）。