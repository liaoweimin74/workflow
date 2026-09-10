# Tasks: backend-logic-config

## 1. 前端类型与存储

- [ ] 1.1 在 `frontend/src/stores/designerStore.ts` 的 `NodeConfigData` 新增 `backendLogic?: BackendLogicItem[]` 类型定义（含 `http`/`bean`/`script` 子结构、`ParamMapping` 复用、占位符约定）
- [ ] 1.2 在 `frontend/src/stores/__tests__/designerStore.test.ts` 新增 backendLogic 序列化读写测试（setNodeConfig/getNodeConfig 往返）
- [ ] 1.3 运行 `npx vue-tsc --noEmit` 与现有 vitest，确认类型与无回归

## 2. 后端 Bean 白名单注册

- [ ] 2.1 新增 `BackendBeanRegistry`（白名单存储 + `register(beanName, method, 元信息)` API）
- [ ] 2.2 定义 `@BackendLogicBean` 注解并在启动时扫描/注册可调用 Bean 方法
- [ ] 2.3 新增接口 `GET /api/v1/backend-logic/beans` 返回已注册方法清单（Bean 名、方法名、展示名）
- [ ] 2.4 为 BackendBeanRegistry 编写单元测试（Mockito）

## 3. 外部 API HTTP 执行器

- [ ] 3.1 实现 `HttpLogicExecutor`：基于 Spring `RestClient` 发起请求，支持 GET/POST/PUT/DELETE
- [ ] 3.2 实现 `{{ varName }}` 占位符替换与 queryParams/bodyParams/headers 变量映射
- [ ] 3.3 实现连接/读超时与固定间隔重试逻辑
- [ ] 3.4 为 HttpLogicExecutor 编写单元测试（MockRestServiceServer）

## 4. Groovy 脚本执行器

- [ ] 4.1 在 `backend/pom.xml` 新增 `org.apache.groovy:groovy` 依赖
- [ ] 4.2 实现 `GroovyScriptLogic`：绑定 execution + 流程变量上下文，编译执行脚本
- [ ] 4.3 为 GroovyScript 编写单元测试（变量读写、结果返回、异常抛出）

## 5. 逻辑分发与事件监听

- [ ] 5.1 实现 `BackendLogicExecutor`：读取节点 `backendLogic[]`，按 trigger 过滤、按序执行、按 `errorAction` 处理（IGNORE_CONTINUE / FAIL_FLOW）、结果写回 `resultVar`
- [ ] 5.2 实现反查映射 `processDefinitionId → draftId → wf_node_config` 的查找服务 + 进程内 TTL 缓存（约 5 分钟），部署时失效
- [ ] 5.3 实现全局 `FlowableEventListener`：监听 `PROCESS_STARTED`/`ACTIVITY_STARTED`/`TASK_COMPLETED`/`ACTIVITY_COMPLETED`，按节点类型与触发时机分派
- [ ] 5.4 注册监听器到 Flowable 引擎配置（引擎启动）
- [ ] 5.5 为 BackendLogicExecutor 编写单元测试（各 trigger、各 errorAction、多逻辑顺序、resultVar 写回）

## 6. 前端属性面板

- [ ] 6.1 创建 `BackendLogicProperty.vue`：列表管理（增/删/上下移）、每个逻辑的触发时机/类型/异常策略/resultVar 表单、HTTP/Bean/Script 分类型编辑
- [ ] 6.2 接入 Bean 白名单下拉（调用 `GET /api/v1/backend-logic/beans`）
- [ ] 6.3 将 `BackendLogicProperty` 接入 `PropertyPanel.vue`，使 startEvent/endEvent/userTask 节点共享该附加面板
- [ ] 6.4 运行 `npx vue-tsc --noEmit` 与现有 vitest，手动验证保存/重载回填

## 7. 端到端验证

- [ ] 7.1 编写集成级验证：配置流程→部署→启动→断言进入/完成逻辑执行、结果变量、异常路径
- [ ] 7.2 后端 `./mvnw test` 通过
- [ ] 7.3 前端 `npx vitest run` + `npx vue-tsc --noEmit` 通过
- [ ] 7.4 手动验证设计器配置、保存、部署、运行时执行全链路