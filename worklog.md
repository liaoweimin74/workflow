# 工作交接文档 (worklog)

---
Task ID: 1
Agent: 主控 (Z.ai Code)
Task: 后端配置为不需要 Redis（用户指定用 yml 配置方式，不移除 pom 依赖）

Work Log:
- 排查发现 `spring-boot-starter-data-redis` 仍在 pom.xml 中（用户明确要求不移除），`RedisConfig`/`RedisCache` 均已是 `@ConditionalOnBean` 条件装配
- 确认 Spring Boot 4.0.7 的 Redis 自动配置类全限定名（SB4 改过包名，从 `spring-boot-data-redis-4.0.7.jar` 的 `AutoConfiguration.imports` 提取）：
  - `org.springframework.boot.data.redis.autoconfigure.DataRedisAutoConfiguration`
  - `org.springframework.boot.data.redis.autoconfigure.DataRedisReactiveAutoConfiguration`
  - `org.springframework.boot.data.redis.autoconfigure.DataRedisRepositoriesAutoConfiguration`
  - `org.springframework.boot.data.redis.autoconfigure.health.DataRedisHealthContributorAutoConfiguration`
  - `org.springframework.boot.data.redis.autoconfigure.health.DataRedisReactiveHealthContributorAutoConfiguration`
  - `org.springframework.boot.data.redis.autoconfigure.observation.LettuceObservationAutoConfiguration`
- 修改 `backend/src/main/resources/application.yml`：新增 `spring.autoconfigure.exclude` 排除以上 6 个自动配置类
- 修改 `backend/src/main/java/com/workflow/framework/config/FlowableEngineConfig.java`：`processEngineConfigurer` 中增加 `configuration.setDatabaseType("mysql")`
- 用 JDK21（`/home/z/tools/jdk21`，系统 JRE 无 javac，maven 需 `JAVA_HOME` 指向它）重新打包：`JAVA_HOME=/home/z/tools/jdk21 /home/z/tools/maven/bin/mvn -o package -DskipTests`
- 清空损坏的 H2 数据目录（旧半成品 schema 已备份到 `/home/z/backup/`，可删）
- 通过 `/api/portal/services` 触发服务监督器（Next.js 子进程常驻 + 20s 看门狗）拉起后端

Stage Summary:
- **Redis 已通过 yml 配置彻底排除**：启动日志中 Redis 相关输出 0 条，不创建任何 Redis Bean，运行期零 Redis 依赖。`NotificationCache`（null 安全降级）与 `AuthServiceImpl`（logout no-op）无需改动即可正常工作
- **顺带修复了后端启动崩溃循环**（148 次重启的根因）：Flowable 8 的 H2 方言建表脚本使用 `identity` 列类型，而 H2 2.x（含 2.3.232/2.4.240）在 `MODE=MySQL` 下不识别该类型（`Unknown data type: "IDENTITY"`），导致首次建库失败、残留半成品 schema 后每次重启 NPE。实测验证 Flowable 的 MySQL 方言脚本（4 个共 1170 行、45 张表）可在 H2 MODE=MySQL 完整执行，故强制 `databaseType=mysql`（对真实 MySQL 环境同样正确）
- **验证结果**：两次完整启动均成功（全新库 18.7s 启动：Hibernate 建表 → Flyway 全量迁移 V2-V31 → Flowable 建表 → Tomcat；二次启动直接复用库）。登录 API 正常签发 token（admin/admin123），`/api/auth/menus` 返回完整菜单树
- **环境备忘**：后端 jar 由 Next.js 服务监督器管理（`src/lib/service-supervisor.ts`），看门狗 20s 巡检自动拉起；日志 `/home/z/tools/backend.log`；H2 库文件 `backend/data/workflow.mv.db`
- 风险提示：H2 沙箱库仅单实例可用；若换真实 MySQL 环境，`databaseType=mysql` 依然正确，无需回退

---
Task ID: 2 (待办池，供后续巡检任务参考)
Agent: -
Task: 下一步候选工作项

候选事项:
- 前端 Vite (5173) 与后端 (8080) 联调冒烟：通过浏览器验证登录页 → 首页 → 流程中心主链路
- H2 沙箱库的 `workflow.trace.db` 会积累告警日志，可关注体积增长
- `AuthServiceImpl` 中残留未使用的 Redis 相关 import（可编译，建议后续顺手清理）
- `GenHash.java` 位于 backend 根目录（工具类），可考虑移入合适位置或删除
