# Task API

## Requirement: Query Tasks

The system SHALL provide REST API for querying tasks assigned to the current user.

### Scenario: List todo tasks
WHEN GET `/api/v1/tasks` with assignee and pagination
THEN the system SHALL return a paginated list of active tasks for the specified user

### Scenario: List historic tasks
WHEN GET `/api/v1/tasks/historic` with user ID and pagination
THEN the system SHALL return a paginated list of completed tasks for the specified user

### Scenario: Filter tasks by tenant
WHEN querying tasks
THEN the system SHALL filter results by the current tenant ID

## Requirement: Claim Task

The system SHALL support claiming a task before processing it.

### Scenario: Claim task
WHEN POST `/api/v1/tasks/{id}/claim` with userId
THEN the system SHALL assign the task to the specified user

## Requirement: Complete Task

The system SHALL support completing a task with form data.

### Scenario: Complete task with variables
WHEN POST `/api/v1/tasks/{id}/complete` with variables
THEN the system SHALL complete the task and advance the process instance

### Scenario: Complete task propagates variables
WHEN completing a task with variables
THEN the variables SHALL be set on the process instance for subsequent nodes