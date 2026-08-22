## ADDED Requirements

### Requirement: 业务表单创建时自动创建数据源

系统 SHALL 在用户创建业务表单时自动创建对应的 FORM 类型数据源。

#### Scenario: 创建业务表单时自动创建数据源
- **WHEN** 用户创建一个新的业务表单
- **THEN** 系统自动创建一个 FORM 类型的数据源，并关联到该业务表单

#### Scenario: 数据源自动配置
- **WHEN** 系统自动创建数据源时
- **THEN** 数据源的名称、描述、状态等配置信息由系统自动生成，用户不可修改

#### Scenario: 数据源状态设置
- **WHEN** 系统自动创建数据源时
- **THEN** 数据源状态 SHALL 设置为 ENABLED

---

### Requirement: 业务表单修改时自动更新数据源

系统 SHALL 在用户修改业务表单时自动更新对应的 FORM 类型数据源。

#### Scenario: 修改业务表单时自动更新数据源
- **WHEN** 用户修改一个已存在的业务表单
- **THEN** 系统自动更新关联的数据源配置信息

#### Scenario: 数据源配置更新
- **WHEN** 系统自动更新数据源时
- **THEN** 数据源的配置信息 SHALL 与业务表单的当前配置保持一致

---

### Requirement: 业务表单删除时自动删除数据源

系统 SHALL 在用户删除业务表单时自动删除对应的 FORM 类型数据源。

#### Scenario: 删除业务表单时自动删除数据源
- **WHEN** 用户删除一个业务表单
- **THEN** 系统自动删除关联的数据源

#### Scenario: 数据源级联删除
- **WHEN** 系统自动删除数据源时
- **THEN** 数据源的所有关联关系 SHALL 被清除

---

### Requirement: 系统结构数据源自动创建

系统 SHALL 在系统初始化时自动创建 SYSTEM 类型的数据源。

#### Scenario: 系统启动时创建部门树数据源
- **WHEN** 系统启动时
- **THEN** 系统自动创建一个名为 "dept-tree" 的 SYSTEM 类型数据源，提供部门树数据

#### Scenario: 系统启动时创建用户树数据源
- **WHEN** 系统启动时
- **THEN** 系统自动创建一个名为 "user-tree" 的 SYSTEM 类型数据源，提供用户树数据

#### Scenario: 系统结构数据源不可修改
- **WHEN** 用户尝试修改系统结构数据源
- **THEN** 系统 SHALL 拒绝操作并返回错误信息