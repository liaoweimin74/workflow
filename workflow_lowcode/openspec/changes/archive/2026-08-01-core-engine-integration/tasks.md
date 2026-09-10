## 1. Parent POM & Module Structure

- [ ] 1.1 Create parent POM with dependency management (Spring Boot, Flowable 8, Flyway, MySQL, JPA)
- [ ] 1.2 Create workflow-model module (JPA entities, enums, repositories)
- [ ] 1.3 Create workflow-core module (engine services, tenant provider, config)
- [ ] 1.4 Create workflow-api module (REST controllers, DTOs, interceptors)
- [ ] 1.5 Create workflow-starter module (auto-configuration, properties)
- [ ] 1.6 Create workflow-app module (Spring Boot main class, application.yml)
- [ ] 1.7 Verify all modules compile with `mvn compile`

## 2. Database Schema (Flyway)

- [ ] 2.1 Create Flyway migration V1 for Flowable tables (auto-managed by Flowable)
- [ ] 2.2 Create Flyway migration V1 for custom tables (wf_user, wf_role, wf_dept, wf_user_role, wf_role_permission)
- [ ] 2.3 Create Flyway migration V1 for workflow definitions table (wf_process_def)
- [ ] 2.4 Verify migrations run successfully on MySQL

## 3. Multi-Tenant Engine

- [ ] 3.1 Implement TenantContext (ThreadLocal-based tenant holder)
- [ ] 3.2 Implement TenantInterceptor (extract X-Tenant-Id from HTTP header)
- [ ] 3.3 Implement TenantProvider (inject tenantId into Flowable operations)
- [ ] 3.4 Configure Flowable ProcessEngine with multi-tenant support
- [ ] 3.5 Implement ProcessEngineConfiguration customization

## 4. Engine Core Services

- [ ] 4.1 Implement ProcessService (deploy, query, suspend/activate process definitions)
- [ ] 4.2 Implement ProcessInstanceService (start, query, suspend/resume, terminate)
- [ ] 4.3 Implement TaskService (query, claim, complete tasks)
- [ ] 4.4 Implement IdentityService (user/role lookup for Flowable integration)

## 5. REST API Layer

- [ ] 5.1 Implement ProcessDefinitionController (CRUD + deploy + xml endpoint)
- [ ] 5.2 Implement ProcessInstanceController (start + lifecycle + query)
- [ ] 5.3 Implement TaskController (list + claim + complete + historic)
- [ ] 5.4 Implement unified response wrapper and exception handler
- [ ] 5.5 Implement request validation and error handling

## 6. Starter Auto-Configuration

- [ ] 6.1 Implement WorkflowAutoConfiguration (ProcessEngine, services beans)
- [ ] 6.2 Implement WorkflowProperties (configurable via application.yml)
- [ ] 6.3 Register TenantInterceptor in Spring MVC interceptor registry
- [ ] 6.4 Configure spring.factories or spring auto-configuration imports

## 7. Application Entry Point

- [ ] 7.1 Create WorkflowApplication main class
- [ ] 7.2 Configure application.yml with datasource, Flyway, Flowable settings
- [ ] 7.3 Verify application starts successfully

## 8. Unit Tests

- [ ] 8.1 Write tests for TenantContext (propagation, cleanup, isolation)
- [ ] 8.2 Write tests for ProcessService (deploy, query, tenant-scoped)
- [ ] 8.3 Write tests for ProcessInstanceService (start, lifecycle, tenant-scoped)
- [ ] 8.4 Write tests for TaskService (claim, complete, tenant-scoped)
- [ ] 8.5 Write integration test: deploy → start → complete → verify
- [ ] 8.6 Write integration test: multi-tenant data isolation