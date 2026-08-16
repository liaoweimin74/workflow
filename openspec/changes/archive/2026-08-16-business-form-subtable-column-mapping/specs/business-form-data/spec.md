# business-form-data Specification

## Purpose
定义 BUSINESS 表单物理表管理与业务数据 CRUD 行为。本 delta 移除"发布时拒绝子表组件"的限制，改为允许子表组件发布（持久化行为由 business-form-subtable 规范定义）。

## MODIFIED Requirements

### Requirement: 业务表单物理表管理

系统 SHALL 在发布 type=BUSINESS 的表单定义时，基于 column_config 列映射通过运行时受控 DDL 创建或变更物理表 `wf_biz_<formKey>`。

物理表 SHALL 包含固定列：id（VARCHAR(64) 主键）、tenant_id（VARCHAR(64) NOT NULL）、version（INT 乐观锁）、created_by、created_at、updated_at，以及按 column_config 映射生成的业务列。

列名 SHALL 通过正则白名单 `^[a-zA-Z][a-zA-Z0-9_]{0,63}$` 校验，列类型 SHALL 仅允许白名单集合（VARCHAR/TEXT/INT/DECIMAL/DATE/DATETIME/TINYINT/JSON），长度与精度 SHALL 按类型校验。

表结构变更 SHALL 仅允许增列、改列宽、改必填、加索引；系统 SHALL 禁止删列与类型跨类变更（如 VARCHAR 改 DECIMAL）。

唯一约束 SHALL 以 (tenant_id, 字段) 复合索引形式创建。

发布时，系统 SHALL 允许 schema 包含子表组件（group/tableForm/subForm）：group 与 tableForm 映射为独立子表物理表，subForm 映射为主表 JSON 列，具体持久化行为遵循 business-form-subtable 规范。系统 SHALL 拒绝 schema 中包含不可映射组件（userPicker、deptPicker、divider、groupContainer）的发布，并提示组件类型。

#### Scenario: 发布业务表单创建物理表

- **WHEN** 用户发布 type=BUSINESS 的表单定义
- **AND** column_config 包含 name（VARCHAR(255) 必填）与 amount（DECIMAL(18,2)）两列
- **THEN** 系统创建物理表 wf_biz_<formKey>
- **AND** 表包含 id、tenant_id、version、created_by、created_at、updated_at 固定列
- **AND** 表包含 name 与 amount 业务列
- **AND** 发布版本记录中保存结构变更历史

#### Scenario: 发布包含子表组件的业务表单

- **WHEN** 用户发布 type=BUSINESS 的表单定义
- **AND** schema 中包含 group/tableForm 子表组件
- **AND** column_config 中该子表字段配置了 subColumns 列映射
- **THEN** 系统创建主表 wf_biz_<formKey>
- **AND** 系统创建子表 wf_biz_<formKey>_<field>
- **AND** 发布成功返回 200

#### Scenario: 发布包含不可映射组件的业务表单

- **WHEN** 用户尝试发布 type=BUSINESS 的表单定义
- **AND** schema 中包含 userPicker 等不可映射组件
- **THEN** 系统返回 400 错误
- **AND** 提示移除不可映射组件后方可发布

#### Scenario: 变更已发布业务表单的表结构

- **WHEN** 用户修改已发布的 BUSINESS 表单定义并发布新版本
- **AND** 新增了一个字段、删除了一个字段、修改了一个字段长度
- **THEN** 系统对物理表执行 ADD COLUMN 与 MODIFY COLUMN（加宽）
- **AND** 系统不执行 DROP COLUMN（被删字段的列保留）
- **AND** 新版本记录保存结构变更历史

#### Scenario: 非法列名发布

- **WHEN** 用户发布的 column_config 包含非法列名（如含空格或特殊字符）
- **THEN** 系统返回 400 错误
- **AND** 不执行任何 DDL

---
