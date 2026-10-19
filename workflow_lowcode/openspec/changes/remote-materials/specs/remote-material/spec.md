## ADDED Requirements

### Requirement: 物料包上传注册

系统 SHALL 提供物料上传接口 `POST /api/v1/materials`，接受 bundle 文件（ESM JS）与 manifest（JSON：type、name、version、sdkVersion，type 为 PAGE 时含菜单建议，type 为 WIDGET 时含 meta），校验通过后创建 `sys_material` 记录并将 bundle 写入物料专用存储目录（`workflow.material.storage-path`）。manifest 必填字段缺失或 type 非法 SHALL 返回 400。同 material_key 重新上传 SHALL 将版本号 +1 覆盖原记录并替换 bundle 文件。上传权限 SHALL 限定为持有 `material:manage` 权限的用户，无权限 SHALL 返回 403。

#### Scenario: 成功上传页面型物料
- **WHEN** 管理员上传 bundle.js 与 manifest（type=PAGE、name=库存看板、sdkVersion=1、菜单建议）
- **THEN** 系统创建 sys_material 记录（material_key 唯一、version=1、status=1 启用）
- **AND** 响应返回物料 id、key、version

#### Scenario: 同 key 重新上传版本递增
- **WHEN** 对已存在 material_key=stock-board 的物料再次上传合法包
- **THEN** 系统不新建记录，原记录 version 由 1 变为 2
- **AND** bundle 文件替换为新上传内容

#### Scenario: manifest 缺必填字段拒绝
- **WHEN** 上传的 manifest 缺少 type 或 name
- **THEN** 系统返回 400
- **AND** 不创建记录、不落附件

#### Scenario: 非管理员拒绝上传
- **WHEN** 无 material:manage 权限的用户调用上传接口
- **THEN** 系统返回 403

---

### Requirement: 物料列表与详情查询

系统 SHALL 提供物料列表接口 `GET /api/v1/materials`（分页、按关键字/类型筛选）与详情接口 `GET /api/v1/materials/{id}`，详情 SHALL 包含 manifest 内容、版本、状态、bundle 下载地址。物料不存在 SHALL 返回 404。列表与详情 SHALL 要求登录，不要求 `material:manage`。

#### Scenario: 查询物料列表
- **WHEN** 已登录用户请求 GET /api/v1/materials?type=PAGE
- **THEN** 系统返回分页的 PAGE 型物料数组，每项含 key、name、version、status

#### Scenario: 查询物料详情
- **WHEN** 已登录用户请求 GET /api/v1/materials/{id}
- **THEN** 系统返回 manifest 全文与 bundle 下载地址

#### Scenario: 查询不存在的物料
- **WHEN** 请求 GET /api/v1/materials/99999
- **THEN** 系统返回 404

---

### Requirement: 物料启停与删除

系统 SHALL 提供启停接口 `PUT /api/v1/materials/{id}/status` 与删除接口 `DELETE /api/v1/materials/{id}`，均 SHALL 要求 `material:manage` 权限。停用（status=0）后运行时加载器 SHALL 拒绝加载该物料。删除 SHALL 移除记录与 bundle 附件；被菜单引用的物料删除前 SHALL 提示引用关系（返回引用菜单列表，由用户确认后强制删除）。

#### Scenario: 停用物料
- **WHEN** 管理员将物料 stock-board 置为停用
- **THEN** 记录 status=0
- **AND** 运行时对该物料的加载请求返回不可用（前端渲染错误态）

#### Scenario: 删除被菜单引用的物料
- **WHEN** 管理员删除已被 sys_menu 引用的物料且未确认
- **THEN** 系统返回 409 并附引用菜单列表
- **AND** 不删除记录

#### Scenario: 无权限删除
- **WHEN** 无 material:manage 权限的用户调用删除接口
- **THEN** 系统返回 403

---

### Requirement: 物料 bundle 下载（公开读）

系统 SHALL 提供按 key 的 bundle 下载端点 `GET /api/materials/{key}/bundle`，该端点 SHALL 不要求 Authorization（ESM 动态 import 无法携带请求头），访问级别与静态资源一致；物料不存在或已停用 SHALL 返回 404。响应 Content-Type SHALL 为 application/javascript。数据安全由物料运行时发起的 API 调用鉴权兜底，物料文件本身不含业务数据。

#### Scenario: 动态 import 可直接加载
- **WHEN** 浏览器对 bundle 下载地址执行 import()（不带 Authorization 头）
- **THEN** 请求成功返回 application/javascript 内容
- **AND** 模块默认导出为 Vue 组件定义

#### Scenario: 未登录可下载但受管理接口保护
- **WHEN** 未登录会话请求 bundle 下载地址
- **THEN** 下载成功
- **AND** 同一会话请求上传/启停接口仍返回 401/403

---

### Requirement: 页面型物料运行时动态加载

前端 SHALL 提供静态路由 `/material/:materialKey`（组件 name=MaterialRenderer，与 PageRenderer 同机制：keep-alive 按 route.path 隔离不同物料实例）。菜单 component 值为 `material:<key>` 形态时，该路由 SHALL 解析出 key 并加载物料：获取 manifest 与 bundle 下载地址，校验 manifest.sdkVersion 主版本与宿主一致后以原生 `import()` 加载，渲染模块默认导出的 Vue 组件。加载失败（key 不存在、已停用、sdkVersion 不符、网络错误）SHALL 渲染明确错误态并提供重试，SHALL NOT 白屏。

#### Scenario: 菜单挂载的物料页面正常渲染
- **WHEN** 用户点击菜单，其 component=material:stock-board 且该物料启用、sdkVersion 主版本匹配
- **THEN** 系统动态加载 bundle 并渲染其默认导出组件
- **AND** 物料内 import 'vue' 与宿主为同一实例（provide/inject 可用）

#### Scenario: sdkVersion 主版本不匹配拒绝加载
- **WHEN** 物料 manifest.sdkVersion 主版本为 2，宿主为 1
- **THEN** 不执行 import()
- **AND** 渲染错误态并提示版本不兼容

#### Scenario: 物料停用后菜单访问呈现错误态
- **WHEN** 用户访问 component=material:stock-board 的菜单且该物料已停用
- **THEN** 渲染错误态（物料不可用）并提供重试按钮
- **AND** 不抛出未捕获异常、不白屏

---

### Requirement: material-bundle 导出与导入

系统 SHALL 提供物料打包导出接口 `POST /api/materials/export`（按 id 列表导出 zip，根 `manifest.json` 内含 kind=material-bundle、schemaVersion 与物料清单，条目为 `<key>.manifest.json` + `<key>.bundle.js`）与导入接口 `POST /api/materials/import`；导入前 SHALL 提供预检接口 `POST /api/materials/inspect`，逐物料返回同 key 冲突（含目标系统现有版本）与可导性判定。上传/导出/预检/导入 SHALL 要求 `material:manage` 权限。

导入 SHALL 逐条独立判定：同 key 已存在时按用户选择覆盖（沿用现有记录、版本 +1 并替换 bundle）或跳过，未显式选择的冲突条目 SHALL 默认跳过；manifest 校验失败、SDK 主版本与宿主不一致、包内条目名与 `manifest.key` 不一致的条目 SHALL 单独标记失败而不影响其余条目；导入成功的物料 SHALL 处于启用状态。结果报告 SHALL 逐条给出状态（导入/覆盖/跳过/失败）与原因。

导出 SHALL 保持包内 manifest 原文（含 `meta` 数组顺序），SHALL NOT 重排或改写；包内条目路径 SHALL 由服务端按物料 key 生成，key 不合法或路径越界（如 `../`）的包 SHALL 被拒绝。

#### Scenario: 导出所选物料
- **WHEN** 管理员选择 2 个物料调用 export
- **THEN** 返回 zip，包内含 kind=material-bundle 标识与 2 个物料条目（manifest + bundle 文件）
- **AND** bundle 与平台存储的原文逐字节一致，manifest 的 `meta` 数组顺序与库中原文一致

#### Scenario: 导入前预检冲突与不可导条目
- **WHEN** 管理员上传 zip 调用 inspect
- **THEN** 每个物料返回是否同 key 冲突（含现有版本）、是否可导；SDK 主版本与宿主不一致的物料标记为不可导并给出原因
- **AND** 预检不落库、不落盘

#### Scenario: 导入时同 key 覆盖
- **WHEN** 导入的包内物料 key=stock-board 已存在且用户选择覆盖
- **THEN** 原记录 bundle 被替换、version 在现有版本上加一
- **AND** 结果报告标记该物料为"覆盖"

#### Scenario: 导入时同 key 跳过
- **WHEN** 导入的包内物料 key 已存在且用户未选择覆盖
- **THEN** 原记录与 bundle 文件均不变
- **AND** 结果报告标记该物料为"跳过"

#### Scenario: 单个物料不合法不影响其余物料导入
- **WHEN** 包内一个物料的 manifest 缺必填字段或 meta 形状不合法，另一个物料完全合法
- **THEN** 前者在报告中为"失败"并带原因，后者照常入库

#### Scenario: 拒绝条目名与 manifest 不一致的物料
- **WHEN** 包内条目名为 `a-board` 而该条 manifest 的 `key` 为 `b-board`
- **THEN** 该条标记为失败，SHALL NOT 按任一 key 落库

#### Scenario: 删除后重新导入同 key 物料
- **WHEN** 物料被删除（软删，`material_key` 仍占用唯一键）后再次导入同 key
- **THEN** 复用原记录（同 id）恢复为未删除并版本 +1，SHALL NOT 新插一行导致唯一键冲突

#### Scenario: 非管理员导出或导入被拒
- **WHEN** 无 `material:manage` 权限的登录用户调用 export/inspect/import
- **THEN** 返回 403，且不产生任何 zip 读取或入库副作用

---

### Requirement: 物料工程模板下载

系统 SHALL 提供 `GET /api/materials/scaffold-template`，返回可直接构建的物料工程模板 zip：工程骨架（依赖清单与锁文件、页面型/组件型两套 vite 配置、构建后校验脚本）、PAGE 与 WIDGET 两类示例物料源码及 manifest、`@platform/sdk` 类型声明、开发教程（README）与物料规范说明（MATERIAL_SPEC，含依赖 external 白名单与范围、单文件 ESM 产物与语法限制、`meta` 数组协议、Node 与构建工具版本下限、安全约定）。模板内容 SHALL 与仓库内脚手架真源一致；清单中任一文件读取不到时 SHALL 整体失败并报错，SHALL NOT 返回残缺工程。该接口 SHALL 要求 `material:manage` 权限。

#### Scenario: 下载模板并直接构建
- **WHEN** 管理员下载工程模板解压后执行依赖安装与两条构建命令
- **THEN** 产出页面型与组件型各自的 bundle + manifest，构建后校验通过
- **AND** 两个产物均可通过上传接口注册并在运行时正常加载

#### Scenario: 模板文件缺失时不返回残缺工程
- **WHEN** 模板清单中某个文件在打包资源中不存在
- **THEN** 接口返回业务错误并点出缺失文件，SHALL NOT 返回缺少文件的 zip


---

### Requirement: 物料开发脚手架

项目 SHALL 提供 material-scaffold 物料模板工程：vite library mode 构建配置（external vue/element-plus/@platform/sdk）、`@platform/sdk` 类型声明、示例页面物料与构建脚本（产物 = bundle + manifest.json）。脚手架构建产物 SHALL 能直接通过上传接口注册并被运行时加载。

#### Scenario: 脚手架产物端到端可用
- **WHEN** 开发者基于脚手架构建出 bundle 与 manifest 并上传平台
- **THEN** 上传校验通过（manifest 字段完整、bundle 可解析）
- **AND** 配置菜单 component=material:<key> 后页面可正常渲染
