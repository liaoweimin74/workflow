# Core Engine Integration — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Build the Maven multi-module project skeleton, integrate Flowable 8 engine with multi-tenant support, implement core engine services and REST API, and verify with integration tests.

**Architecture:** Modular monolith with 6 Maven modules. Flowable 8 configured with multi-tenant ProcessEngine. Tenant identity propagated via `X-Tenant-Id` HTTP header through ThreadLocal context. REST API exposed at `/api/v1/`. workflow-starter provides auto-configuration for third-party integration.

**Tech Stack:** Spring Boot 3.x, Flowable 8.0.0+, Spring Data JPA, MySQL 8.x, Flyway, Maven 3.8+

---

## Task 1: Parent POM & Module Structure

- [ ] **Step 1:** Create `pom.xml` at root — parent POM with `spring-boot-starter-parent` (3.2.x), Flowable BOM (8.0.0), Flyway, MySQL connector, JPA. Define module list: workflow-model, workflow-core, workflow-api, workflow-starter, workflow-app
- [ ] **Step 2:** Create `workflow-model/pom.xml` — depends on spring-boot-starter-data-jpa, Flowable engine. Create package structure: `com.workflow.model.entity`, `.enums`, `.repository`
- [ ] **Step 3:** Create `workflow-core/pom.xml` — depends on workflow-model, Flowable engine, spring-context. Package: `com.workflow.core.engine`, `.tenant`, `.config`
- [ ] **Step 4:** Create `workflow-api/pom.xml` — depends on workflow-core, spring-boot-starter-web. Package: `com.workflow.api.controller`, `.dto`, `.interceptor`
- [ ] **Step 5:** Create `workflow-starter/pom.xml` — depends on workflow-api, spring-boot-autoconfigure. Package: `com.workflow.starter.autoconfigure`, `.properties`
- [ ] **Step 6:** Create `workflow-app/pom.xml` — depends on workflow-starter, spring-boot-starter-web. Create `WorkflowApplication.java` in `com.workflow.app`
- [ ] **Step 7:** Run `mvn compile -q` — verify all modules compile without errors

## Task 2: Database Schema (Flyway)

- [ ] **Step 1:** Configure Flowable `database-schema-update=true` so Flowable auto-creates its `ACT_*` tables
- [ ] **Step 2:** Create `workflow-app/src/main/resources/db/migration/V1__init_custom_tables.sql`:
  ```sql
  CREATE TABLE wf_tenant ( id VARCHAR(64) PRIMARY KEY, name VARCHAR(255) NOT NULL, status VARCHAR(20) DEFAULT 'ACTIVE', created_at DATETIME );
  CREATE TABLE wf_user ( id VARCHAR(64) PRIMARY KEY, tenant_id VARCHAR(64) NOT NULL, username VARCHAR(128) NOT NULL, display_name VARCHAR(255), email VARCHAR(255), phone VARCHAR(64), status VARCHAR(20) DEFAULT 'ACTIVE', created_at DATETIME, INDEX idx_tenant_user (tenant_id) );
  CREATE TABLE wf_role ( id VARCHAR(64) PRIMARY KEY, tenant_id VARCHAR(64) NOT NULL, name VARCHAR(128) NOT NULL, code VARCHAR(128) NOT NULL, description VARCHAR(512), INDEX idx_tenant_role (tenant_id), UNIQUE KEY uk_tenant_role_code (tenant_id, code) );
  CREATE TABLE wf_user_role ( user_id VARCHAR(64) NOT NULL, role_id VARCHAR(64) NOT NULL, PRIMARY KEY (user_id, role_id) );
  CREATE TABLE wf_dept ( id VARCHAR(64) PRIMARY KEY, tenant_id VARCHAR(64) NOT NULL, name VARCHAR(255) NOT NULL, parent_id VARCHAR(64), sort_order INT, INDEX idx_tenant_dept (tenant_id) );
  CREATE TABLE wf_process_def ( id VARCHAR(64) PRIMARY KEY, tenant_id VARCHAR(64) NOT NULL, name VARCHAR(255), process_key VARCHAR(255), version INT DEFAULT 1, bpmn_xml LONGTEXT, status VARCHAR(20) DEFAULT 'DRAFT', deploy_id VARCHAR(64), proc_def_id VARCHAR(64), description TEXT, created_by VARCHAR(64), created_at DATETIME, updated_at DATETIME, INDEX idx_tenant_proc (tenant_id), UNIQUE KEY uk_tenant_key_version (tenant_id, process_key, version) );
  ```
- [ ] **Step 3:** Configure `application.yml` with Flyway, datasource, and Flowable settings
- [ ] **Step 4:** Start application and verify all tables created successfully

## Task 3: Multi-Tenant Engine

- [ ] **Step 1:** Create `TenantContext.java` — `ThreadLocal<String>` holder with `set()`, `get()`, `clear()` methods
- [ ] **Step 2:** Create `TenantInterceptor.java` — extends `HandlerInterceptor`. In `preHandle`: extract `X-Tenant-Id` header, validate not empty, set to TenantContext. In `afterCompletion`: call TenantContext.clear()
- [ ] **Step 3:** Create `TenantProvider.java` — provides `getTenantId()` reading from TenantContext. Used by all service classes
- [ ] **Step 4:** Create `MultiTenantProcessEngineConfig.java` — extends `SpringProcessEngineConfiguration`. Override or configure `processDefinitionTenantId`, `processInstanceTenantId` on deployment and queries
- [ ] **Step 5:** Create `FlowableConfig.java` — `@Configuration` class that creates `ProcessEngineConfigurationImpl` with multi-tenant settings, data source, and database schema update

## Task 4: Engine Core Services

- [ ] **Step 1:** Create `ProcessService.java`:
  - `deployProcess(String name, String bpmnXml)` — creates deployment with tenantId, deploys BPMN XML
  - `listProcessDefinitions(Pageable pageable)` — queries by tenant ID, returns paginated result
  - `getProcessDefinition(String id)` — single lookup
  - `suspendProcessDefinition(String id)`, `activateProcessDefinition(String id)`
  - `deleteProcessDefinition(String id)` — only if no running instances
- [ ] **Step 2:** Create `ProcessInstanceService.java`:
  - `startProcess(String processKey, Map<String, Object> variables)` — starts by key + tenantId
  - `listProcessInstances(Pageable pageable)` — tenant-scoped query
  - `suspendProcessInstance(String id)`, `resumeProcessInstance(String id)`
  - `terminateProcessInstance(String id)` — delete with reason
- [ ] **Step 3:** Create `TaskService.java`:
  - `listTodoTasks(String userId, Pageable pageable)` — tenant-scoped active tasks
  - `listHistoricTasks(String userId, Pageable pageable)` — tenant-scoped completed tasks
  - `claimTask(String taskId, String userId)` — claim assignment
  - `completeTask(String taskId, Map<String, Object> variables)` — complete and propagate variables
- [ ] **Step 4:** Create `IdentityService.java`:
  - `resolveUserGroups(String userId)` — maps user to role codes (used by Flowable candidate group resolution)
  - Integrate with Flowable's `IdentityService` interface

## Task 5: REST API Layer

- [ ] **Step 1:** Create `ProcessDefinitionController.java`:
  - `POST /api/v1/process-definitions` — accept BPMN XML + metadata, save as draft
  - `GET /api/v1/process-definitions` — paginated list
  - `GET /api/v1/process-definitions/{id}` — detail
  - `PUT /api/v1/process-definitions/{id}` — update draft
  - `DELETE /api/v1/process-definitions/{id}` — delete draft
  - `POST /api/v1/process-definitions/{id}/deploy` — deploy to Flowable engine
  - `GET /api/v1/process-definitions/{id}/xml` — get BPMN XML content
- [ ] **Step 2:** Create `ProcessInstanceController.java`:
  - `POST /api/v1/process-instances` — start with processKey + variables
  - `GET /api/v1/process-instances` — paginated list with filters
  - `POST /api/v1/process-instances/{id}/suspend`
  - `POST /api/v1/process-instances/{id}/resume`
  - `POST /api/v1/process-instances/{id}/terminate`
- [ ] **Step 3:** Create `TaskController.java`:
  - `GET /api/v1/tasks?assignee={userId}` — todo tasks
  - `GET /api/v1/tasks/historic?userId={userId}` — historic tasks
  - `POST /api/v1/tasks/{id}/claim`
  - `POST /api/v1/tasks/{id}/complete`
- [ ] **Step 4:** Create `Result.java` — unified response wrapper: `{ code: 0, message: "success", data: T, requestId: "uuid" }`
- [ ] **Step 5:** Create `GlobalExceptionHandler.java` — `@RestControllerAdvice` that catches `FlowableException`, `IllegalArgumentException`, etc. and returns proper error response
- [ ] **Step 6:** Create DTO classes: `ProcessDefCreateRequest`, `ProcessDefResponse`, `ProcessInstanceResponse`, `TaskResponse`, `PageResponse<T>`

## Task 6: Starter Auto-Configuration

- [ ] **Step 1:** Create `WorkflowProperties.java` — `@ConfigurationProperties(prefix = "workflow")`:
  - `tenant.header-name` (default: `X-Tenant-Id`)
  - `datasource.*` (url, username, password, driver)
- [ ] **Step 2:** Create `WorkflowAutoConfiguration.java` — `@Configuration`:
  - Auto-configure `ProcessEngineConfigurationImpl`
  - Auto-configure `ProcessService`, `ProcessInstanceService`, `TaskService`, `IdentityService`
  - Register `TenantInterceptor` in Spring MVC interceptor registry
  - Conditional on `@ConditionalOnClass(ProcessEngine.class)`
- [ ] **Step 3:** Create `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` with `com.workflow.starter.autoconfigure.WorkflowAutoConfiguration`

## Task 7: Application Entry Point

- [ ] **Step 1:** Create `application.yml` in `workflow-app/src/main/resources/`:
  ```yaml
  spring:
    datasource:
      url: jdbc:mysql://localhost:3306/workflow?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC
      username: root
      password: root
    flyway:
      enabled: true
      locations: classpath:db/migration
  flowable:
    database-schema-update: true
    async-executor-activate: false  # disable for first phase
  workflow:
    tenant:
      header-name: X-Tenant-Id
  server:
    port: 8080
  ```
- [ ] **Step 2:** Create `WorkflowApplication.java` with `@SpringBootApplication` and `main` method
- [ ] **Step 3:** Start application, verify startup log shows Flowable engine initialized, tables created, no errors

## Task 8: Unit Tests

- [ ] **Step 1:** Create `TenantContextTest.java` — test set/get/clear, test ThreadLocal isolation
- [ ] **Step 2:** Create `ProcessServiceTest.java` — deploy a simple BPMN process, verify it's created with correct tenantId, query by tenant
- [ ] **Step 3:** Create `ProcessInstanceServiceTest.java` — deploy → start → verify instance created with tenantId
- [ ] **Step 4:** Create `TaskServiceTest.java` — deploy → start → query tasks → claim → complete → verify historic
- [ ] **Step 5:** Create `MultiTenantIsolationTest.java` — create processes in tenant-A and tenant-B, verify each tenant only sees its own data
- [ ] **Step 6:** Create `ProcessDefinitionControllerTest.java` — @WebMvcTest for API endpoints, verify HTTP 200 and response structure
- [ ] **Step 7:** Run `mvn test` — all tests pass