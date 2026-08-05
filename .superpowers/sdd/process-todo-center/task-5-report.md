# Task 5 Report: 后端 — 流程实例列表筛选扩展

## Status: DONE_WITH_CONCERNS

## Changes

### Modified Files
1. **`ProcessInstanceService.java`** — 添加 `HistoryService` 依赖（为 `status=completed` 预留）；新增 `listProcessInstances(Pageable, String initiator, String status, String processName)` 重载方法，支持：
   - `initiator`: 通过 `query.variableValueEquals("initiator", initiator)` 筛选
   - `status`: `"running"` → `.active()`，`"suspended"` → `.suspended()`
   - `processName`: 通过 `query.processDefinitionNameLike(processName)` 模糊匹配
   - 保留无参重载 `listProcessInstances(Pageable)` 向后兼容，委托到新方法传 null

2. **`ProcessInstanceController.java`** — `list()` 方法增加 3 个可选 `@RequestParam`：`initiator`、`status`、`processName`；`toMap()` 方法增加 `currentNode`（来自 `instance.getName()`）和 `status`（suspended/completed/running 语义映射）字段

### New Test Files
3. **`ProcessInstanceServiceFilterTest.java`** — 12 个测试用例覆盖：
   - initiator 筛选（有值/ null / blank）
   - status 筛选（running / suspended / null）
   - processName 筛选（有值 / null / blank）
   - 组合筛选
   - 分页结果验证
   - 向后兼容无参重载

4. **`ProcessInstanceControllerTest.java`** — 新增 6 个测试用例覆盖：
   - 无筛选参数传递
   - initiator / status / processName 单独传递
   - 全部筛选组合
   - VO 包含 `currentNode` 和 `status` 字段

## Test Results
- 全量测试: 164 tests, 0 failures, 0 errors, 0 skipped — BUILD SUCCESS
- 本任务新增: 18 tests (12 service + 6 controller), 全部通过

## TDD Process
1. **RED**: 编写测试 → 编译失败（方法签名不匹配）
2. **GREEN**: 扩展 Service + Controller → 全部测试通过
3. **REFACTOR**: 代码结构清晰，与 `ProcessService.listProcessDefinitions` 模式一致

## Commit
- `73fbc06` — feat(process-instance): support initiator/status/processName filter

## Concerns
1. **`status=completed` 未实现**: 已完成流程不在 `RuntimeService` 的运行时表中，需要通过 `HistoryService.createHistoricProcessInstanceQuery().finished()` 查询。`HistoryService` 已注入但未使用，为后续任务预留。当前 `status=completed` 不会返回结果（运行时查询无已完成实例）。
2. **`currentNode` 取值**: 使用 `ProcessInstance.getName()` 获取当前节点名称。对于多实例或并行网关场景，此值可能为 null 或仅返回一个节点名。更精确的当前节点信息可通过 `runtimeService.createActivityInstanceQuery()` 获取，但超出本任务范围。
