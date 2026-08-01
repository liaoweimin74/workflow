# Identity Local

## Requirement: User Management

The system SHALL provide built-in user management for the first phase.

### Scenario: Create user
WHEN creating a user with userId, name, and tenantId
THEN the user SHALL be stored in the `wf_user` table

### Scenario: Query user by ID
WHEN querying a user by userId
THEN the system SHALL return the user information

### Scenario: Users scoped to tenant
WHEN querying users
THEN the results SHALL be filtered by the current tenant ID

## Requirement: Role Management

The system SHALL support role-based access control with built-in roles.

### Scenario: Create role
WHEN creating a role with name and tenantId
THEN the role SHALL be stored in the `wf_role` table

### Scenario: Assign role to user
WHEN assigning a role to a user
THEN the association SHALL be stored in the `wf_user_role` table

### Scenario: Built-in roles exist
WHEN the system initializes
THEN the following roles SHALL exist: SUPER_ADMIN, TENANT_ADMIN, PROCESS_DESIGNER, NORMAL_USER

## Requirement: Department Management

The system SHALL support tree-structured department management.

### Scenario: Create department
WHEN creating a department with name, parentId, and tenantId
THEN the department SHALL be stored in the `wf_dept` table with its parent reference

### Scenario: List departments by tenant
WHEN querying departments
THEN the system SHALL return the department tree for the current tenant