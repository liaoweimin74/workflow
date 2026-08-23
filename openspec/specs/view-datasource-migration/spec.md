# view-datasource-migration Specification

## Purpose
TBD - created by archiving change unify-workflow-form-datasource. Update Purpose after archive.
## Requirements
### Requirement: 存量视图启动时自动迁移

系统 SHALL 在应用启动时以 ApplicationRunner 幂等执行迁移：扫描 `type=VIEW AND formKey 非空 AND dataSourceId 为空` 的页面定义，为每个唯一 formKey 按命名约定查找既有 FORM 数据源复用，不存在则创建同名 FORM 数据源并直接置为 ENABLED（前提：表单 PUBLISHED 且 BUSINESS），随后回填页面 dataSourceId。已回填的页面 MUST NOT 被重复处理。

#### Scenario: 存量视图自动迁移
- **WHEN** 应用启动且存在绑定业务表单但无 dataSourceId 的 VIEW 页面
- **THEN** 迁移完成后每个页面 dataSourceId 指向一个 ENABLED 的 FORM 数据源，原渲染行为不变

#### Scenario: 重复启动幂等
- **WHEN** 应用再次重启
- **THEN** 已有 dataSourceId 的页面不被重复处理，不产生重复数据源

---

### Requirement: 迁移数据源复用与创建

多个视图绑定同一 formKey 时 MUST 复用同一个 FORM 数据源；创建的数据源状态 MUST 直接为 ENABLED 且 type=FORM、formKey 与原视图一致。

#### Scenario: 多个视图共享同一表单复用一个数据源
- **WHEN** 三个视图均绑定同一业务表单 key 并触发迁移
- **THEN** 仅创建（或复用）一个 FORM 数据源，三个视图的 dataSourceId 一致

---

### Requirement: 不满足条件的页面跳过并记录日志

当绑定的 formKey 无 PUBLISHED 版本或非 BUSINESS 类型时，MUST 跳过该页面的迁移并记录警告日志；MUST NOT 阻断其他页面的迁移与应用启动。

#### Scenario: 表单未发布的页面被跳过
- **WHEN** 某 VIEW 页面绑定的表单无 PUBLISHED 版本
- **THEN** 该页面 dataSourceId 保持为空并输出警告日志，其余页面正常迁移完成

---

### Requirement: 逐页面事务隔离

迁移 MUST 以页面为单位使用独立事务：单页迁移失败 MUST NOT 影响其他页面的迁移结果。

#### Scenario: 单页迁移失败不影响其他页面
- **WHEN** 迁移过程中某页保存抛出异常
- **THEN** 该页保持原状并记录错误日志，其余页面全部完成回填

