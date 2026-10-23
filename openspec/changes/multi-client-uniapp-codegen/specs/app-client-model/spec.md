# app-client-model（delta）

## ADDED Requirements

### Requirement: 应用与客户端实例建模

系统 SHALL 提供「应用（App）→ 客户端实例（Client）」两层模型：
- `wf_app` 表示受众产品（如商户端、买家端），SHALL 归属租户（`tenant_id`）并持有名称、code（`uk(tenant_id, code)`）、主题与状态；应用数量与命名 SHALL NOT 被限定为特定业务角色。
- `wf_app_client` 表示 App 的一个交付实例，SHALL 声明端类型 `client_type`（WEB / MP_WEIXIN / H5 / APP）、渲染模式 `render_mode`（RUNTIME / CODEGEN）、构建配置 `build_config_json`（小程序 appid、H5 域名、APP 包名等）与导航配置 `navigation_json`；同一端类型 SHALL 允许多个 Client，同一 App SHALL 允许多个 Client；唯一键 SHALL 为 `(tenant_id, app_id, client_type, name)`。
- 应用与客户端 MUST NOT 构成数据隔离边界：表单、数据源、工作流、行级权限 SHALL 保持在租户层共享。

#### Scenario: 创建商户端小程序客户端
- **WHEN** 管理员在应用「商户端」下创建 `client_type=MP_WEIXIN`、`render_mode=CODEGEN`、`build_config_json` 含 appid 的客户端
- **THEN** 系统创建成功并可按 Client 维护构建配置与导航
- **AND** 同一 App 下可继续创建 WEB / H5 / APP 类型的其他 Client

#### Scenario: 同一端类型下的多个应用
- **WHEN** 租户内已存在应用「商户端」，再创建应用「买家端」并各自创建 MP_WEIXIN 客户端
- **THEN** 两个应用及其客户端互不干扰、独立配置页面与导航
- **AND** 二者引用的表单、数据源、工作流仍为同一租户共享数据

---

### Requirement: 页面应用归属与唯一性

页面定义 SHALL 归属应用：`wf_page_def` 增加 `app_id`，页面 key 唯一性 SHALL 变为 `(tenant_id, app_id, key, version)`；同一租户下不同应用 SHALL 允许存在同 key 页面。存量数据升级时，系统 SHALL 为每租户回填一个「默认应用」并将既有页面 `app_id` 归入其中，保证升级零感知；`app_id` 列 SHALL 落真实应用 id（不留 NULL 双轨）。

#### Scenario: 存量升级零感知
- **WHEN** 执行数据库迁移
- **THEN** 每个租户生成一个「默认应用」
- **AND** 既有页面全部归入该应用，既有路由、菜单、渲染行为不变

#### Scenario: 同 key 页面在不同应用共存
- **WHEN** 应用「商户端」已存在页面 key=order-list，用户在应用「买家端」创建 key=order-list 的页面
- **THEN** 创建成功且互不影响
- **AND** 同一应用内重复 key 仍按既有版本规则校验

---

### Requirement: 客户端页面启用清单

Client 的交付内容 SHALL 由 `wf_app_client_page` 启用清单决定：每个条目 SHALL 引用所属 App 的一个页面并携带导航顺序 `sort` 与导航配置；未分配给某 Client 的页面 MUST NOT 出现在该 Client 的导航、预览与构建产物中。

#### Scenario: 页面分配与导航顺序
- **WHEN** 管理员将应用「商户端」的页面 A、B 分配给小程序客户端并设置 sort=1、2
- **THEN** 该客户端的导航（tabBar/页面清单）按 sort 展示 A、B
- **AND** 同应用未分配的页面 C 不出现在该客户端的任何入口与产物中

---

### Requirement: 应用管理接口

系统 SHALL 提供 App / Client / 页面分配的 CRUD 与查询接口，接口 SHALL 校验租户归属（跨租户访问 404/403），页面分配接口 SHALL 校验页面属于该 Client 所属 App（跨应用分配 400）。

#### Scenario: 跨应用分配页面被拒绝
- **WHEN** 调用页面分配接口将「买家端」的页面分配给「商户端」的客户端
- **THEN** 系统返回 400
- **AND** 不产生分配记录
