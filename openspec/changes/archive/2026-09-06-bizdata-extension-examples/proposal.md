# Proposal: BizData 扩展能力 + example 示例模块

## Why

统一的业务表单服务（BizDataService）目前只有标准 CRUD 与 before/after 装饰钩子，无法承载三类场景需求：语义化业务操作（提交/审核）、复杂 CRUD 的整体替换（如 list 复杂计算）、以及工作流表单的状态约束（已发起→禁改、流转中→禁删）。这三类需求当前没有平台级承载，业务方要么复制通用实现、要么绕过守卫直接改数据，导致规则散落且不一致。本变更补齐扩展能力（覆盖声明 + 引擎状态守卫），并以 example 模块交付两个开箱即用的参考实现，让后续业务表单有标准范式可循。

## What Changes

**BizDataHandler 覆盖声明**
- From: 仅 4 个装饰钩子（beforeCreate/afterCreate/beforeUpdate/beforeDelete），复杂 CRUD 无法替换通用实现
- To: 增加强类型覆盖声明（overridesQuery/Create/Update/Delete + 对应方法，签名不含 formKey），通用路径单点交接；重复覆盖声明启动失败；覆盖时装饰钩子不自动执行
- Reason: 装饰只能加戏、不能替换；覆盖需全权接管保证单一可预测执行路径
- Impact: 非破坏性（接口 default 方法），现有 handler 照常工作

**BizDataService 门面化 + BizDataSupport 复用面**
- From: 单一类承载全部 CRUD + 表元数据解析，handler 无法复用其内部能力（循环依赖风险）
- To: 通用实现与复用面提取为 BizDataSupport 独立组件（loadContext/findById/validateRequired/resolvePickerValues/*Generic 委托点），BizDataService 变门面（覆盖检测→守卫→装饰→委托），构造签名保持兼容（追加 guards 参数）
- Reason: 覆盖 handler 需要等价"super"的复用能力且不能与门面成环
- Impact: 内部重构，对外 API 不变；现有测试需适配构造参数

**引擎状态守卫 FormProcessGuard**
- From: BizDataService 不感知流程，已发起/流转中记录可随意改删
- To: 接口定义在 bizdata（不依赖 flowable），实现 FlowableFormProcessGuard（engine.process）；绑定配置 = FormDefinition 新增 processKey 列（V30 迁移）；语义=运行中禁改禁删、已结束可改不可删、草稿自由；update/delete 门面统一拦截
- Reason: 工作流表单约束是横切关注点，应统一拦截而非各表单手写
- Impact: 新能力；已接入流程的表单自动生效

**example 模块**
- From: 无参考实现
- To: com.workflow.example Modulith 包：emp_profile（覆盖 query 复杂计算 + 钩子校验 + 语义操作调薪/离职）+ leave_bill（真实 BPMN 全链路：提交→审批→守卫拦截→状态写回）
- Reason: 示例即范式，展示三类扩展能力的正确用法
- Impact: 纯新增

## Capabilities

### New Capabilities
- `bizdata-handler-extension`: BizDataHandler 覆盖声明机制 + BizDataSupport 复用面 + BizDataService 门面交接语义
- `form-process-guard`: 引擎状态守卫的绑定配置（processKey）、拦截语义（运行中/已结束/草稿）与接口契约
- `biz-extension-examples`: example 模块中 emp_profile 与 leave_bill 两个示例的验收行为

### Modified Capabilities
- `business-form-data`: 通用 CRUD 端点行为变化——create/update/delete/query 可被 handler 覆盖接管；update/delete 受流程守卫拦截

## Impact

- **代码**：`engine.form.bizdata`（BizDataHandler/BizDataService/BizDataSupport 新增与重构）、`engine.process`（FlowableFormProcessGuard）、`engine.form`（FormDefinition 实体 + 迁移 V30）、`com.workflow.example`（新增包）
- **API**：对外 CRUD 端点不变；新增 example 语义端点（/api/v1/example/emp/...、/api/v1/example/leave/...）
- **数据库**：Flyway V30（wf_form_def 加 process_key 列）
- **依赖**：无新增外部依赖（flowable/H2 已存在）
- **测试**：能力层单测、FlowableFormProcessGuard 单测、example 单测 + LeaveBillWorkflowIntegrationTest 全链路集成测试