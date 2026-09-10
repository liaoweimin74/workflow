# Maven 增量编译漏编「新源文件」导致热部署不生效

## 现象
- 新增 `DbSchemaController.java`（全新 controller），在 backend 目录跑 `mvn test -Dtest=...` 测试全绿（DbSchemaControllerTest 4/4）。
- 但浏览器请求新接口 `GET /api/v1/data-sources/db/tables` 返回 **500**：`No static resource api/v1/data-sources/db/tables for request ...`（Spring 静态资源兜底 = 所有 controller 都没匹配 = 新 controller 未加载）。
- 排查确认 `backend/target/classes/.../DbSchemaController.class` **不存在**，而同目录其他 controller.class 均已生成；`mvn compile` 手动执行后才生成。

## 根因
maven-compiler-plugin（3.14.x）默认 `useIncrementalCompilation=true`。`mvn test` 触发增量编译时，**新加入的源文件**在特定时间戳/缓存组合下会被增量判断跳过（源文件写入时间晚于编译扫描点），导致新类未编译进 `target/classes`，而测试能通过是因为测试类编译路径存在另一种陈旧 class 复用/或恰好时点命中。

> 精确的增量判断触发条件未完全确认（与编译时刻源文件时间戳、编译缓存相关），但现象可稳定复现为：新文件第一次不进 `target/classes`，需手动 `mvn compile` 补编。

## 应对
1. **新增后端源文件后**：务必先显式跑一次 `mvn compile`（或 `mvn clean test`），确认 `target/classes` 里生成了新类，再依赖 devtools 热重启。
2. 新接口 500 + `No static resource ...` 报错 = 排查「新类是否真的进了 target/classes」的第一信号，不要直接怀疑 SQL/代码逻辑。
3. devtools 热重启依赖 `target/classes` 变更；`mvn test` 只编译不改动 class 时不会触发重启。

## 影响面
- 后端 devtools 热部署 + Maven 增量编译组合下，新增 controller/service 类都有此风险。
- 修改既有类（如 `DynamicTableManager`）无此问题（增量编译对已存在文件正常）。