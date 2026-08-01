# Process Instance API

## Requirement: Start Process Instance

The system SHALL support starting a process instance from a deployed process definition.

### Scenario: Start process by key
WHEN POST `/api/v1/process-instances` with processKey and variables
THEN the system SHALL start a new process instance and return its ID

### Scenario: Start process with tenant
WHEN starting a process instance
THEN the system SHALL set the tenant ID from the current context

## Requirement: Process Instance Lifecycle

The system SHALL support suspending, resuming, and terminating process instances.

### Scenario: Suspend process instance
WHEN POST `/api/v1/process-instances/{id}/suspend`
THEN the system SHALL suspend the process instance

### Scenario: Resume process instance
WHEN POST `/api/v1/process-instances/{id}/resume`
THEN the system SHALL resume the suspended process instance

### Scenario: Terminate process instance
WHEN POST `/api/v1/process-instances/{id}/terminate`
THEN the system SHALL terminate the running process instance

## Requirement: Query Process Instances

The system SHALL provide query capabilities for process instances.

### Scenario: List process instances
WHEN GET `/api/v1/process-instances` with pagination and optional filters
THEN the system SHALL return a paginated list of process instances for the current tenant