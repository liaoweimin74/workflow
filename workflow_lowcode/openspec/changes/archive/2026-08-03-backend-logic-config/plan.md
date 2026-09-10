# Backend Logic Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 BPMN 节点（用户任务/开始/结束）支持配置后端业务逻辑（外部 API / 本系统白名单 Bean / Groovy 脚本），在节点进入或完成时自动执行，配置存入 `wf_node_config`，前端属性面板可编排。

**Architecture:** 设计器把 `backendLogic[]` 存入现有 `nodeConfigs` → `wf_node_config.config_json`。运行时注册全局 `FlowableEventListener`，按 `processDefinitionId → draftId → wf_node_config` 反查节点配置，按触发时机（ENTER/COMPLETE）过滤并按序执行；单条逻辑异常按各自 `errorAction`（忽略继续/中断流程）处理，结果写回 `resultVar`。

**Tech Stack:** Spring Boot 3 + Flowable 8.0.0 + Groovy + Spring RestClient；Vue 3 + TypeScript + Pinia + Element Plus + Vitest。

## Global Constraints

- 后端: Spring Boot 3，Java
- 前端: Vue 3 `<script setup lang="ts">`，Element Plus（组件 `size="small"`），禁止 `as any` / `@ts-ignore`
- 测试: 后端 JUnit5 + Mockito；前端 Vitest + `@vue/test-utils`（`mount` + `global.plugins: [ElementPlus]`）
- 存储: 复用 `wf_node_config` 表，禁止新增表；前端复用 `setNodeConfig`/`getNodeConfig`
- 脚本执行: 绑定 `DelegateExecution` + 流程变量上下文
- 提交信息: `feat:` / `fix:` 前缀，英文

---

## Task 1: 前端类型与存储

**Files:**
- Modify: `frontend/src/stores/designerStore.ts`
- Test: `frontend/src/stores/__tests__/designerStore.test.ts`

**Interfaces:**
- Produces（均从 `designerStore.ts` export）: `BackendLogicTrigger = 'ENTER' | 'COMPLETE'`、`BackendLogicErrorAction = 'IGNORE_CONTINUE' | 'FAIL_FLOW'`、`BackendLogicType = 'http' | 'bean' | 'script'`、`BackendLogicHttpConfig`、`BackendLogicBeanConfig`、`BackendLogicScriptConfig`、`BackendLogicItem`；并给 `NodeConfigData` 增加可选字段 `backendLogic?: BackendLogicItem[]`

- [ ] **Step 1: 定义 backendLogic 类型**

在 `frontend/src/stores/designerStore.ts` 现有 `ParamMapping` 接口之后追加：

```typescript
export type BackendLogicTrigger = 'ENTER' | 'COMPLETE'
export type BackendLogicErrorAction = 'IGNORE_CONTINUE' | 'FAIL_FLOW'
export type BackendLogicType = 'http' | 'bean' | 'script'

export interface BackendLogicHttpConfig {
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers?: Record<string, string>
  queryParams?: ParamMapping[]
  bodyParams?: ParamMapping[]
  connTimeoutMs?: number
  readTimeoutMs?: number
  retryCount?: number
}

export interface BackendLogicBeanConfig {
  beanName: string
  methodName: string
  params?: ParamMapping[]
}

export interface BackendLogicScriptConfig {
  language: 'groovy'
  source: string
}

export interface BackendLogicItem {
  id: string
  name: string
  enabled: boolean
  trigger: BackendLogicTrigger
  type: BackendLogicType
  errorAction: BackendLogicErrorAction
  resultVar?: string
  http?: BackendLogicHttpConfig
  bean?: BackendLogicBeanConfig
  script?: BackendLogicScriptConfig
}
```

在 `NodeConfigData` 接口内追加可选字段 `backendLogic?: BackendLogicItem[]`。

- [ ] **Step 2: 编写存储读写测试**

在 `frontend/src/stores/__tests__/designerStore.test.ts` 追加：

```ts
import { useDesignerStore, type NodeConfigData, type BackendLogicItem } from '../designerStore'

it('backendLogic 序列化读写往返', () => {
  setActivePinia(createPinia())
  const store = useDesignerStore()
  const logic: BackendLogicItem = {
    id: 'l1', name: '同步订单', enabled: true,
    trigger: 'ENTER', type: 'http',
    errorAction: 'IGNORE_CONTINUE', resultVar: 'orderStatus',
    http: { url: 'https://ex/api', method: 'POST', bodyParams: [{ source: 'orderId', target: 'id' }] },
  }
  const cfg: NodeConfigData = { backendLogic: [logic] }
  store.setNodeConfig('UserTask_1', cfg)
  const back = store.getNodeConfig('UserTask_1')
  expect(back?.backendLogic?.[0].http?.url).toBe('https://ex/api')
  expect(back?.backendLogic?.[0].trigger).toBe('ENTER')
})
```

- [ ] **Step 3: 运行验证**

Run: `cd frontend && npx vitest run src/stores/__tests__/designerStore.test.ts && npx vue-tsc --noEmit`
Expected: PASS，无类型错误

- [ ] **Step 4: 提交**

```bash
git add frontend/src/stores/designerStore.ts frontend/src/stores/__tests__/designerStore.test.ts
git commit -m "feat: add backendLogic types to designerStore"
```

---

## Task 2: 后端 Bean 白名单注册

**Files:**
- Create: `backend/src/main/java/com/workflow/engine/logic/BackendBeanRegistry.java`
- Create: `backend/src/main/java/com/workflow/engine/logic/annotation/BackendLogicBean.java`
- Create: `backend/src/main/java/com/workflow/api/controller/BackendLogicBeanController.java`
- Create: `backend/src/main/java/com/workflow/api/dto/BackendBeanInfo.java`
- Test: `backend/src/test/java/com/workflow/engine/logic/BackendBeanRegistryTest.java`

**Interfaces:**
- Produces: `BackendBeanRegistry`（`Collection<RegisteredBeanMethod> listMethods()`）、`RegisteredBeanMethod`（`beanName`/`methodName`/`displayName`/`parameterCount`）、`GET /api/v1/backend-logic/beans` 返回 `R<List<BackendBeanInfo>>`

- [ ] **Step 1: 写失败测试**

`BackendBeanRegistryTest.java`：注册一个方法后 `listMethods()` 能列出它；未注册方法抛异常。

- [ ] **Step 2: 实现 manifests 与 registry**

`BackendLogicBean`（`@Retention(RUNTIME)` class 级注解，标注 Bean 为可后端逻辑调用）；`BackendBeanRegistry`（构造时注入所有 `ObjectMapper`、扫描带注解 Bean 的方法，记录 `RegisteredBeanMethod`）；`BackendBeanInfo` DTO。

- [ ] **Step 3: 实现只读 Controller**

`BackendLogicBeanController` 调 `registry.listMethods()` 映射为 `List<BackendBeanInfo>` 返回 `R.ok(...)`。

- [ ] **Step 4: 后端测试与构建**

Run: `cd backend && ./mvnw test` Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/src/main/java/com/workflow/engine/logic/ backend/src/main/java/com/workflow/api/ backend/src/test/java/com/workflow/engine/logic/
git commit -m "feat: add BackendBeanRegistry whitelist for invoke system service"
```

---

## Task 3: Groovy 脚本执行器

**Files:**
- Modify: `backend/pom.xml`
- Create: `backend/src/main/java/com/workflow/engine/logic/executor/GroovyScriptLogic.java`
- Test: `backend/src/test/java/com/workflow/engine/logic/executor/GroovyScriptLogicTest.java`

**Interfaces:**
- Produces: `GroovyScriptLogic`（`Object execute(String script, DelegateExecution execution, Map<String,Object> vars)`）

- [ ] **Step 1: 新增 pom 依赖**

在 `backend/pom.xml` 增加 `org.apache.groovy:groovy`（版本由 Spring Boot BOM 管理）。

- [ ] **Step 2: 写失败测试**

`GroovyScriptLogicTest`: 脚本读取变量、脚本返回结果、脚本异常传播。

- [ ] **Step 3: 实现 GroovyScriptLogic**

用 `GroovyShell` 绑定 `(vars) -> { ... }`；把流程变量放入绑定，执行脚本，返回最后一个表达式值；异常向上抛出。

- [ ] **Step 4: 运行测试**

Run: `cd backend && ./mvnw test` Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/pom.xml backend/src/main/java/com/workflow/engine/logic/executor/GroovyScriptLogic.java backend/src/test/java/com/workflow/engine/logic/executor/GroovyScriptLogicTest.java
git commit -m "feat: add Groovy script logic executor"
```

---

## Task 4: 外部 API HTTP 执行器

**Files:**
- Create: `backend/src/main/java/com/workflow/engine/logic/executor/HttpLogicExecutor.java`
- Create: `backend/src/main/java/com/workflow/engine/logic/parse/ParamMapping.java`
- Create: `backend/src/main/java/com/workflow/engine/logic/parse/VariableResolver.java`
- Test: `backend/src/test/java/com/workflow/engine/logic/executor/HttpLogicExecutorTest.java`

**Interfaces:**
- Produces: `HttpLogicExecutor`（`Object execute(String url, String method, Map<String,String> headers, List<ParamMapping> query, List<ParamMapping> body, Map<String,Object> vars, int connectTimeoutMs, int readTimeoutMs, int retryCount)`）、`ParamMapping`（`String source` / `String target`）、`VariableResolver.resolve(String text, Map<String,Object> vars)`

- [ ] **Step 1: 写失败测试**

`HttpLogicExecutorTest` 用 `MockRestServiceServer` 验证 GET query/body 映射、POST body、占位符替换、重试。

- [ ] **Step 2: 实现 VariableResolver 与 ParamMapping**

`VariableResolver`：把文本 `{{ varName }}` 替换为变量值（缺失置空）；`ParamMapping` 记录源/目标。

- [ ] **Step 3: 实现 HttpLogicExecutor**

用 Spring `RestClient` 构造请求并设置连接/读超时；queryParams 拼 query、bodyParams 组装 JSON、headers 占位替换；网络异常按 retryCount 固定间隔重试；返回响应体。

- [ ] **Step 4: 运行测试**

Run: `cd backend && ./mvnw test` Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/src/main/java/com/workflow/engine/logic/ backend/src/test/java/com/workflow/engine/logic/
git commit -m "feat: add HTTP external logic executor"
```

---

## Task 5: 逻辑分发与事件监听

**Files:**
- Create: `backend/src/main/java/com/workflow/engine/logic/BackendLogicExecutor.java`
- Create: `backend/src/main/java/com/workflow/engine/logic/resolver/ProcessConfigResolver.java`
- Create: `backend/src/main/java/com/workflow/engine/logic/BackendLogicEventListener.java`
- Modify: Flowable 引擎配置（注册监听器）
- Test: `backend/src/test/java/com/workflow/engine/logic/BackendLogicExecutorTest.java`

**Interfaces:**
- Consumes: `HttpLogicExecutor`、`GroovyScriptLogic`、`BackendBeanRegistry`（Task 2/3/4）
- Produces: `ProcessConfigResolver`（由 `processDefinitionId` → `Map<nodeId, BackendLogicItem[]>`，进程内 TTL 缓存）、`BackendLogicExecutor`（`void executeNode(String draftId, String nodeId, String trigger, DelegateExecution execution, Map<String,Object> vars)`）、`BackendLogicEventListener`（Flowable `FlowableEventListener`，`boolean isFailOnException()` 返回 false 以自行处理异常）

- [ ] **Step 1: 实现 ProcessConfigResolver**

`ProcessConfigResolver.resolve(processDefinitionId)`：查 `ProcessDraftRepository.findByProcessDefinitionId` 得 draftId → `NodeConfigRepository.findByProcessDefId` 过滤 `node_id`，解析 `config_json` 中 `backendLogic`，按 nodeId 建 Map；进程内 `ConcurrentHashMap` + TTL（约 5 分钟）缓存。

- [ ] **Step 2: 实现 BackendLogicExecutor**

输入节点 `backendLogic[]`，过滤 `enabled && trigger`，按序：按 `type` 分派到 Http/Groovy/Bean；成功且有 `resultVar` 则 `runtimeService.setVariable`；异常按 `errorAction`：`IGNORE_CONTINUE` 记日志继续 / `FAIL_FLOW` 抛出中断。

- [ ] **Step 3: 实现 BackendLogicEventListener**

监听 `PROCESS_STARTED`（begin 事件 ENTER）、`ACTIVITY_STARTED`（userTask ENTER）、`TASK_COMPLETED`（userTask COMPLETE）、`ACTIVITY_COMPLETED`（endEvent COMPLETE）；取 `processDefinitionId` 调 resolver、定位当前 `activityId` 调 executor。

- [ ] **Step 4: 注册监听器**

在 Flowable 引擎配置（`ProcessEngineConfigurationConfigurer` 或 `FlowableApplicationListener`）注册全局监听器。

- [ ] **Step 5: 测试与构建**

`BackendLogicExecutorTest`：验证各 trigger 过滤、多逻辑顺序、`IGNORE_CONTINUE` 继续、`FAIL_FLOW` 抛错、`resultVar` 写回。Run: `cd backend && ./mvnw test` Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add backend/src/main/java/com/workflow/engine/logic/ backend/src/test/java/com/workflow/engine/logic/
git commit -m "feat: add BackendLogicEventListener for runtime execution"
```

---

## Task 6: 前端属性面板

**Files:**
- Create: `frontend/src/views/designer/properties/BackendLogicProperty.vue`
- Modify: `frontend/src/views/designer/properties/PropertyPanel.vue`
- Create: `frontend/src/api/backendLogic.ts`

**Interfaces:**
- Consumes: `BackendLogicItem`（Task 1）、`getNodeConfig`/`setNodeConfig`、`GET /api/v1/backend-logic/beans`
- Produces: `BackendLogicProperty.vue`（从 `designerStore.selectedNodeConfig` 读写 `backendLogic`）、在 `PropertyPanel` 对 userTask/startEvent/endEvent 被选中时渲染

- [ ] **Step 1: 新增 API 模块**

`frontend/src/api/backendLogic.ts`: `listBeans()` 调 `GET /api/v1/backend-logic/beans` 返回 `BackendBeanInfo[]`。

- [ ] **Step 2: 实现 BackendLogicProperty.vue**

el-form 分区：逻辑列表（每项名称/启用/触发时机/类型/异常策略/resultVar + HTTP|Bean|Script 按类型渲染子表单 + 删除、新增、上移、下移）；Bean 类型用 `api.listBeans()` 下拉；保存调用 `designerStore.setNodeConfig(selectedNodeId, { ...current, backendLogic })`。

- [ ] **Step 3: 接入 PropertyPanel**

在 `PropertyPanel.vue` 中，对 `selectedNodeType` 为 userTask/开始/结束（`isUserTask || isEventNode`）时，在现有属性组件之后追加渲染 `<backend-logic-property />`。

- [ ] **Step 4: 类型检查与手动验证**

Run: `cd frontend && npx vue-tsc --noEmit && npx vitest run`
Manual: 配置逻辑→保存→重载回填；Bean 下拉可见。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/designer/properties/ frontend/src/api/backendLogic.ts
git commit -m "feat: add BackendLogicProperty panel for node backend logic"
```

---

## Task 7: 端到端验证

**Files:**
- Create: `backend/src/test/java/com/workflow/engine/logic/BackendLogicIntegrationTest.java`

**Interfaces:**
- Consumes: 全部上述能力

- [ ] **Step 1: 写集成测试**

用嵌入 H2/测试库部署一个含用户任务+开始+结束的流程，给节点配置后端逻辑（HTTP/Bean/Groovy 各一），启动实例，断言进入/完成逻辑执行、结果变量写回、异常路径中断。

- [ ] **Step 2: 全量测试**

Run: `cd backend && ./mvnw test` Expected: 全部 PASS；`cd frontend && npx vitest run && npx vue-tsc --noEmit` Expected: PASS

- [ ] **Step 3: 手动验证**

启动前后端，设计流程配置三类逻辑→保存→部署→发起→任务处理→确认日志顺序执行、结果变量、异常处理。

- [ ] **Step 4: 提交**

```bash
git add backend/src/test/java/com/workflow/engine/logic/BackendLogicIntegrationTest.java
git commit -m "test: add backend logic end-to-end integration test"
```