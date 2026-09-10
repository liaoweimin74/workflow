# Retrospective: core-engine-integration

**Status**: Completed

## Evidence

| Metric | Value |
|---|---|
| Commit count | 1 (ae2f7e6) |
| Files changed | 6 |
| Lines added | 27 |
| Lines removed | 30 |
| Tasks completed | 5 |
| Verification verdict | ✅ Pass |

## What Went Well

1. **SB 4.0.7 + Flowable 8.0.0 + Modulith 2.0.0 upgrade clean** — dependency tree resolved without conflicts. Maven Central direct repo works (aliyun mirror lacks Flowable 8 artifacts).

2. **Spring Modulith module structure restored** — `@Modulithic` + 3 `package-info.java` declarations pass Modulith verification. Architecture boundary: `api` → `engine` → `identity`.

3. **Multi-tenant interceptor works** — `TenantInterceptor` enforces `X-Tenant-Id`, `TenantContext` uses ThreadLocal with `afterCompletion` cleanup. All 3 unit tests pass.

4. **REST API endpoints respond correctly** — paginated responses with unified `Result<T>` wrapper and `requestId` tracing. All 3 endpoints (process-definitions, instances, tasks) return 200.

## Issues

### Critical: `nullDatabaseMeansCurrent` cross-database search (fixed)

**Root cause**: MySQL Connector/J 9.x defaults `nullDatabaseMeansCurrent=false`. Flowable's `isTablePresent()` calls `getTables(null, null, ...)` which searches ALL databases on the MySQL instance — finds old ACT_GE_PROPERTY from Flowable 7 → assumes upgrade needed → fails.

**Fix**: Added `&nullDatabaseMeansCurrent=true` to JDBC URL.

### Critical: Hibernate 7 removed MySQL8Dialect (fixed)

**Root cause**: SB 4.0.7 bundles Hibernate 7.x which removed `org.hibernate.dialect.MySQL8Dialect`. Explicit dialect in config caused startup failure.

**Fix**: Remove dialect property — Hibernate 7 auto-detects from JDBC metadata.

### Minor: Flowable 8 starter artifact renamed

**Root cause**: Flowable 8 renamed starter from `flowable-spring-boot-starter` to `flowable-spring-boot-starter-process`.

**Fix**: Updated artifact ID in pom.xml.

## Deviations from Plan

| Planned | Actual | Reason |
|---------|--------|--------|
| Maven multi-module (6 modules) | Single module | Simpler architecture for first iteration; split later |
| Flyway for schema management | Flowable `database-schema-update: true` | Flowable 8 manages its own schema |
| Java 17 target | Java 21+ (target 21, JDK 26 runtime) | SB 4.0.7 requires Java 21+ |

## Action Items

- Document `nullDatabaseMeansCurrent` fix in project wiki for future MySQL + Flowable setups
- Consider multi-module split when new features stabilize (starter module for third-party integration)