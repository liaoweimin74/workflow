# Process Definition API

## Requirement: CRUD Operations

The system SHALL provide REST API for creating, reading, updating, and deleting process definitions.

### Scenario: Create process definition
WHEN POST `/api/v1/process-definitions` with BPMN XML and metadata
THEN the system SHALL save the process definition as DRAFT and return its ID

### Scenario: List process definitions
WHEN GET `/api/v1/process-definitions` with pagination parameters
THEN the system SHALL return a paginated list of process definitions for the current tenant

### Scenario: Get process definition detail
WHEN GET `/api/v1/process-definitions/{id}`
THEN the system SHALL return the process definition details including metadata

### Scenario: Update process definition
WHEN PUT `/api/v1/process-definitions/{id}` with updated BPMN XML
THEN the system SHALL update the draft process definition

### Scenario: Delete process definition
WHEN DELETE `/api/v1/process-definitions/{id}`
THEN the system SHALL delete the draft process definition (if not deployed)

## Requirement: Deploy Process Definition

The system SHALL support deploying a draft process definition to the Flowable engine.

### Scenario: Deploy to engine
WHEN POST `/api/v1/process-definitions/{id}/deploy`
THEN the system SHALL deploy the BPMN XML to the Flowable engine and mark status as DEPLOYED

### Scenario: Deploy creates new version
WHEN deploying the same process key multiple times
THEN the system SHALL auto-increment the version number

### Scenario: Get BPMN XML
WHEN GET `/api/v1/process-definitions/{id}/xml`
THEN the system SHALL return the raw BPMN XML content