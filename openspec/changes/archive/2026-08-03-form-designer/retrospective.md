# Retrospective — form-designer

## 变更概述

实现表单设计器模块，包括后端表单定义/数据的 CRUD、版本管理、发布流程，以及前端基于 `@form-create/designer` 的可视化表单设计器。

## 做得好的

- **组件库选型正确**：`@form-create/designer` + `@form-create/element-ui` 提供了成熟的拖拽式表单设计器，无需从零实现
- **版本管理策略清晰**：每次保存创建新版本记录，发布操作标记状态，支持版本回溯
- **多租户隔离**：所有查询通过 `TenantProvider` 过滤，与现有架构一致
- **测试覆盖**：后端 12 个单元测试覆盖 Service 层所有核心场景，前端 81 个测试通过
- **端到端验证充分**：从 API 到浏览器 UI 全链路验证，发现并修复了 3 个集成问题

## 做得不好的

- **V12 迁移脚本 3 次返工**：
  1. `CREATE TABLE` 与 JPA `ddl-auto: update` 冲突 → 需 `IF NOT EXISTS`
  2. 菜单 INSERT 缺少 `status`/`is_deleted` NOT NULL 字段
  3. 菜单 `status = 0` 但 `buildMenuTree` 要求 `status == 1`
  - 根因：未充分理解现有 `sys_menu` 表结构和 `AuthService` 过滤逻辑
- **端到端验证发现菜单不显示**：应在实现阶段就检查菜单数据与 API 返回的一致性
- **Scope 边界模糊**：BPMN 集成和流程运行时表单渲染在 spec 中有描述，但实际未实现，应在 tasks.md 中更明确标注 out-of-scope

## 学到的

- Flyway 迁移脚本必须与现有代码的假设一致（表结构、状态值、过滤逻辑）
- `buildMenuTree` 的 `status == 1` 过滤是隐藏假设，只有端到端验证才能发现
- `@form-create/designer` 的 schema 格式与后端存储的 JSON 字符串需要正确序列化/反序列化

## 下次改进

- 写迁移脚本前先 Read 相关 Entity 和 Service 代码，理解字段含义和过滤逻辑
- 迁移脚本写完后立即通过 API 验证数据可见性（如菜单是否返回）
- 在 tasks.md 中明确标注 in-scope vs out-of-scope
