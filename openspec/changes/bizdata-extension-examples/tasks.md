# Tasks: BizData 扩展能力 + example 示例模块

## 1. 能力层：BizDataHandler 覆盖声明

- [x] 1.1 扩展 BizDataHandler 接口：新增覆盖声明方法（overridesCreate/overridesUpdate/overridesDelete/overridesQuery，default false）及强类型方法 create/update/delete/query（签名不含 formKey，default 抛 UnsupportedOperationException），编写覆盖机制单元测试（Mockito）
- [x] 1.2 改造 BizDataService 的 handler 索引构建：收集覆盖声明，同一 formKey 同一操作存在 2+ 覆盖声明时抛 IllegalStateException（fail-fast），编写启动冲突检测测试
- [x] 1.3 覆盖交接路由：BizDataService 四个 CRUD 入口在覆盖声明为 true 时直接调用 handler 强类型方法并返回其结果（装饰钩子不再自动执行），编写交接行为测试

## 2. 能力层：BizDataSupport 复用面 + 门面化

- [ ] 2.1 提取 BizDataSupport 组件：现 BizDataService 中 loadContext/findById/validateRequired/resolvePickerValues 提升为 public 复用面，另提供 createGeneric/updateGeneric/deleteGeneric/queryGeneric 委托点
- [ ] 2.2 BizDataService 门面化重构：保留构造器签名兼容（原始依赖 + 新增 List<FormProcessGuard> guards 参数），内部持有 BizDataSupport，四个入口按"覆盖检测→守卫（update/delete）→装饰链→通用委托"路由
- [ ] 2.3 迁移现有 BizDataHandlerTest 构造调用适配新构造签名，确认既有钩子行为测试全部通过

## 3. 能力层：引擎状态守卫 FormProcessGuard

- [ ] 3.1 在 engine.form.bizdata 包定义 FormProcessGuard 接口（appliesTo/checkBeforeUpdate/checkBeforeDelete），不依赖流程引擎类型
- [ ] 3.2 数据库迁移 V30：wf_form_def 表新增 process_key 列（可空，VARCHAR），编写迁移文件并验证可回滚
- [ ] 3.3 FormDefinition 实体/相关 DTO 增加 processKey 字段映射（含表单发布/编辑链路透传）
- [ ] 3.4 实现 FlowableFormProcessGuard（engine.process 包）：appliesTo 依 formDef.processKey 非空判定；checkBeforeUpdate 查 running 实例（tenant+businessKey=行id）命中抛异常；checkBeforeDelete 查任意实例（running 或历史）命中抛异常；编写 Mockito 单测（mock RuntimeService/HistoryService）
- [ ] 3.5 BizDataService update/delete 门面接线守卫：遍历 List<FormProcessGuard> 中 appliesTo(formKey) 的实现执行检查，编写接线测试

## 4. example 模块：emp 业务表单子域

- [ ] 4.1 新建 com.workflow.example.emp 包：EmpProfileHandler（overridesQuery 实现在职天数计算 + 当前用户部门过滤并保持分页契约；beforeCreate 手机号校验；beforeDelete 在职禁删）
- [ ] 4.2 EmpProfileBizService + EmpProfileController：调整薪资 adjustSalary、离职 resign 两个语义操作及 REST 端点（POST /api/v1/example/emp/adjust-salary、/resign）
- [ ] 4.3 编写 EmpProfileHandlerTest：覆盖 query 计算/过滤逻辑、手机号校验 400、在职删除 409（Mockito）

## 5. example 模块：leave 工作流表单子域

- [ ] 5.1 新建 com.workflow.example.leave 包：LeaveBillHandler（beforeCreate 天数>5 必填理由；afterCreate 置 status=草稿）
- [ ] 5.2 编写 leave-bill.bpmn20.xml（提交→部门经理审批→结束）放入 backend/src/main/resources/example/
- [ ] 5.3 LeaveBillBizService + LeaveBillController：submit（startProcess businessKey=行id + status=待审批）、approve（完成任务 + status=已批准）、reject（驳回 + status=已驳回）及 REST 端点
- [ ] 5.4 编写 LeaveBillWorkflowIntegrationTest（H2 + Flowable，RepositoryService 动态部署 BPMN）：草稿可改可删 → submit 发起 → 运行中 update/delete 被守卫 409 → approve → 流程结束 → 可改不可删

## 6. 整体验证

- [ ] 6.1 运行后端完整测试套件（mvn test），确认新旧测试全部通过
- [ ] 6.2 后端整体编译 + 启动上下文验证（修改后编译通过，热部署无冲突）
- [ ] 6.3 自查变更文件符合项目规范（无类型压制、命名/包结构一致、无 AI slop）