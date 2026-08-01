# Engine Starter

## Requirement: Auto Configuration

The workflow-starter SHALL auto-configure the Flowable engine when added as a dependency.

### Scenario: Auto-configure on classpath
WHEN a Spring Boot application includes `workflow-starter` as a dependency
THEN the Flowable ProcessEngine SHALL be auto-configured without manual bean declarations

### Scenario: Configure multi-tenant
WHEN the starter auto-configures
THEN the ProcessEngine SHALL be configured with multi-tenant support enabled

## Requirement: Configuration Properties

The starter SHALL expose configurable properties via `application.yml`.

### Scenario: Database configuration
WHEN setting `workflow.datasource.*` properties
THEN the starter SHALL configure the Flowable data source accordingly

### Scenario: Tenant header name
WHEN setting `workflow.tenant.header-name`
THEN the system SHALL use the specified header name for tenant extraction (default: X-Tenant-Id)

## Requirement: Tenant Interceptor Registration

The starter SHALL automatically register the tenant interceptor.

### Scenario: Register interceptor
WHEN the starter auto-configures
THEN a `TenantInterceptor` SHALL be registered to intercept all incoming HTTP requests