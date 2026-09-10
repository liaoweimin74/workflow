# login-remember-username Specification

## Purpose
TBD - created by archiving change framework-ui-enhancements. Update Purpose after archive.
## Requirements
### Requirement: 记住用户名复选框

登录表单 SHALL 在密码输入框下方、登录按钮上方显示"记住用户名"复选框（`el-checkbox`），默认未勾选。

#### Scenario: 显示记住用户名复选框
- **WHEN** 用户打开登录页面
- **THEN** 密码输入框下方显示"记住用户名"复选框
- **AND** 复选框默认未勾选

---

### Requirement: 用户名持久化

当用户勾选"记住用户名"并成功登录后，用户名 SHALL 存储到 `localStorage`（key: `remembered_username`）。

当用户取消勾选"记住用户名"时，`localStorage` 中的 `remembered_username` MUST 立即清除。

#### Scenario: 勾选记住用户名后登录成功
- **WHEN** 用户勾选"记住用户名"复选框
- **AND** 输入用户名和密码
- **AND** 登录成功
- **THEN** 用户名存储到 localStorage 的 `remembered_username` 键

#### Scenario: 未勾选记住用户名
- **WHEN** 用户不勾选"记住用户名"复选框
- **AND** 登录成功
- **THEN** localStorage 中不写入 `remembered_username`
- **AND** 如果之前有存储则清除

#### Scenario: 取消勾选立即清除
- **WHEN** 用户在登录页取消"记住用户名"勾选
- **THEN** localStorage 中的 `remembered_username` 立即被清除

---

### Requirement: 用户名预填

登录页面加载时 SHALL 检查 `localStorage` 中的 `remembered_username`。如果存在，SHALL 预填到用户名输入框，并自动勾选"记住用户名"复选框。

#### Scenario: 预填已记住的用户名
- **WHEN** 用户打开登录页面
- **AND** localStorage 中存在 `remembered_username`
- **THEN** 用户名输入框自动填入已记住的用户名
- **AND** "记住用户名"复选框自动勾选

#### Scenario: 无已记住的用户名
- **WHEN** 用户打开登录页面
- **AND** localStorage 中不存在 `remembered_username`
- **THEN** 用户名输入框为空
- **AND** "记住用户名"复选框未勾选

---

### Requirement: 密码不手动存储

系统 MUST NOT 手动存储用户密码到 localStorage、sessionStorage 或 cookie。密码的自动填充 SHALL 完全依赖浏览器原生的密码管理器。

#### Scenario: 密码不存储
- **WHEN** 用户登录成功
- **THEN** localStorage 和 sessionStorage 中无密码相关数据
- **AND** 密码填充依赖浏览器密码管理器

