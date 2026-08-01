# Multi-Tenant Engine

## Requirement: Tenant Context Propagation

The system SHALL propagate tenant identity from HTTP request to Flowable engine operations.

### Scenario: Extract tenant from request header
WHEN a request arrives with header `X-Tenant-Id: tenant-abc`
THEN the system SHALL extract `tenant-abc` and store it in the current thread context

### Scenario: Reject request without tenant header
WHEN a request arrives without `X-Tenant-Id` header
THEN the system SHALL reject with HTTP 400 error

### Scenario: Clean up tenant context after request
WHEN a request completes (success or failure)
THEN the system SHALL clear the tenant context from the current thread

## Requirement: Tenant-Scoped Engine Operations

All Flowable engine operations SHALL be scoped to the current tenant.

### Scenario: Deploy process with tenant
WHEN deploying a process definition
THEN the system SHALL set the deployment's tenantId to the current tenant

### Scenario: Query by tenant
WHEN querying process definitions
THEN the system SHALL filter results by the current tenant ID

### Scenario: Start process with tenant
WHEN starting a process instance
THEN the system SHALL set the process instance's tenantId to the current tenant