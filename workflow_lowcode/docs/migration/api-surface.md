# API 端点盘点（api-surface）

> **生成说明**
> - 生成日期：2026-09-16
> - 生成方式：静态扫描 `backend/src/main/java/` 下全部 Controller 源码（Task 12-a，Node.js 迁移前置盘点，接续 Task 13-1）
> - 统计口径：每个 Controller 方法上的 `@GetMapping / @PostMapping / @PutMapping / @DeleteMapping` 各计 1 个端点（类级 `@RequestMapping` 只作前缀）；SSE 端点（GET text/event-stream）计入；纯私有/辅助方法不计
> - 覆盖范围：39 个 `@RestController` 类，**共 197 个端点**
> - 用途：Java 后端 → Node.js 后端迁移的接口契约基线。Node 实现须逐条对齐"完整路径 + HTTP 方法 + 参数语义 + R 响应信封"

---

## 1. 路径拼接规则（重要）

```
浏览器/前端请求 = 前端 baseURL + api 模块相对路径
                = '/api' (frontend/src/utils/http.ts baseURL) + '/v1/categories' ...
                = /api/v1/categories
后端 Controller = @RequestMapping("/api/v1/categories")   ← 类级注解已写全 /api 前缀
```

- **后端 Controller 的 `@RequestMapping` 一律包含 `/api` 前缀**（system 模块为 `/api/auth`、`/api/users`…；低代码/流程/通知模块为 `/api/v1/…`），前端 axios `baseURL:'/api'` 拼上代码里写的 `/v1/...`、`/auth/...` 后恰好等于后端完整路径。
- **迁移建议**：Node.js 路由直接按本表的"完整路径"注册（含 `/api` 前缀），不要重复拼前缀。
- 网关链路：3000 端口 Next.js middleware 将 `/api/*` rewrite 到 8080 后端（5173 Vite dev 代理同理）。
- 横切约定（所有端点生效）：
  - 请求头 `X-Tenant-Id: default`：前端 http.ts 统一注入；`TenantInterceptor` 拦截 `/api/**` 读入 `TenantContext`（缺失不拦截，业务侧按需强制）。
  - 请求头 `Authorization: Bearer <accessToken>`（SSE 端点例外，改用 query `?token=`）。
  - 响应统一 `R<T>` 信封：`{ code, msg, data }`，`code=200` 成功（`PageResult<T>`：`{ rows, total, page, size }`；`PageResponse<T>`：`{ records/content, page, size, total }` 两种分页形态并存）。

### 鉴权模型（迁移必读）

- `SecurityConfig`：**仅两个端点 permitAll** —— `POST /api/auth/login`、`GET /api/v1/notifications/sse`；其余一律 `authenticated()`（无 Spring Security 注解级鉴权）。
- `@EnableMethodSecurity` 已开启、自定义 `@HasPermission` 注解 + `PermissionEvaluator` 类已存在，**但全项目没有任何 Controller 使用 `@PreAuthorize`/`@HasPermission`** —— 管理端权限靠代码内显式校验：
  - 通知管理端 7 个 Controller 每个方法内调用 `NotificationAdminAuthorization.requireAdmin()`（校验 `ROLE_ADMIN`/`admin` 角色）。
  - 页面渲染数据出口（`PageDefinitionController#/{key}/definition`、`PageQueryController` 两端点）经 `PageAccessGuard`（无菜单 404 / 无权限 403）。
  - **其余全部端点只要求"已登录"**，详见 §19 异常清单。

---

## 2. 认证模块（AuthController，`/api/auth`）— 5 个

| 方法 | 完整路径 | 方法名 | 参数 | 说明 |
|---|---|---|---|---|
| POST | /api/auth/login | login | @RequestBody LoginRequest（username/password，@Valid） | 登录，签发双 token（permitAll） |
| POST | /api/auth/logout | logout | @RequestHeader Authorization | 登出（Redis 排除后为 no-op） |
| POST | /api/auth/refresh | refresh | @RequestBody RefreshTokenRequest{refreshToken} | 刷新 accessToken |
| GET | /api/auth/userinfo | getCurrentUser | @AuthenticationPrincipal LoginUser | 当前用户信息（含角色/权限） |
| GET | /api/auth/menus | getMenus | @AuthenticationPrincipal LoginUser | 当前用户菜单树 |

> ⚠️ 前端 `ProfilePage.vue` 调用 `PUT /api/auth/password`（自助改密）——**后端无此端点（404）**，见 §19。

## 3. 用户模块（UserController，`/api/users`）— 8 个

| 方法 | 完整路径 | 方法名 | 参数 | 说明 |
|---|---|---|---|---|
| GET | /api/users | list | UserQueryRequest（query 绑定：keyword/status/orgId/page/size） | 用户分页 |
| GET | /api/users/batch | batch | @RequestParam ids（List\<Long\>，可空） | 按 id 批量取用户 |
| GET | /api/users/{id} | getById | @PathVariable Long id | 用户详情 |
| POST | /api/users | create | @RequestBody UserCreateRequest（@Valid） | 新建用户 |
| PUT | /api/users/{id} | update | @PathVariable id + @RequestBody UserUpdateRequest | 更新用户 |
| DELETE | /api/users/{id} | delete | @PathVariable Long id | 删除用户 |
| PUT | /api/users/{id}/status | updateStatus | @PathVariable id + @RequestBody StatusRequest{status} | 启用/停用 |
| PUT | /api/users/{id}/reset-password | resetPassword | @PathVariable Long id | 重置为默认密码 123456 |

## 4. 角色模块（RoleController，`/api/roles`）— 6 个

| 方法 | 完整路径 | 方法名 | 参数 | 说明 |
|---|---|---|---|---|
| GET | /api/roles | list | RoleQueryRequest（query 绑定） | 角色分页 |
| POST | /api/roles | create | @RequestBody RoleCreateRequest | 新建角色 |
| PUT | /api/roles/{id} | update | @PathVariable id + @RequestBody RoleUpdateRequest | 更新角色 |
| DELETE | /api/roles/{id} | delete | @PathVariable Long id | 删除角色 |
| GET | /api/roles/{id}/menus | getRoleMenus | @PathVariable Long id | 角色已授权菜单 id 列表 |
| PUT | /api/roles/{id}/menus | assignMenus | @PathVariable id + @RequestBody MenuIdsRequest{menuIds:Long[]} | 分配菜单权限 |

## 5. 菜单模块（MenuController，`/api/menus`）— 4 个

| 方法 | 完整路径 | 方法名 | 参数 | 说明 |
|---|---|---|---|---|
| GET | /api/menus/tree | tree | — | 全量菜单树（管理端） |
| POST | /api/menus | create | @RequestBody MenuCreateRequest | 新建菜单 |
| PUT | /api/menus/{id} | update | @PathVariable id + @RequestBody MenuUpdateRequest | 更新菜单 |
| DELETE | /api/menus/{id} | delete | @PathVariable Long id | 删除菜单 |

## 6. 组织机构模块（OrganizationController，`/api/orgs`）— 4 个

| 方法 | 完整路径 | 方法名 | 参数 | 说明 |
|---|---|---|---|---|
| GET | /api/orgs/tree | tree | — | 部门树 |
| POST | /api/orgs | create | @RequestBody OrganizationCreateRequest | 新建部门 |
| PUT | /api/orgs/{id} | update | @PathVariable id + @RequestBody OrganizationUpdateRequest | 更新部门 |
| DELETE | /api/orgs/{id} | delete | @PathVariable Long id | 删除部门 |

## 7. 字典模块（DictTypeController + DictDataController）— 8 个

| 方法 | 完整路径 | 方法名 | 参数 | 说明 |
|---|---|---|---|---|
| GET | /api/dict-types | list | DictTypeQueryRequest（query 绑定） | 字典类型分页 |
| POST | /api/dict-types | create | @RequestBody DictTypeCreateRequest | 新建字典类型 |
| PUT | /api/dict-types/{id} | update | @PathVariable id + @RequestBody DictTypeUpdateRequest | 更新字典类型 |
| DELETE | /api/dict-types/{id} | delete | @PathVariable Long id | 删除字典类型 |
| GET | /api/dict-data/{dictCode} | list | @PathVariable String dictCode | 按字典编码取数据项列表 |
| POST | /api/dict-data | create | @RequestBody DictDataCreateRequest | 新建数据项 |
| PUT | /api/dict-data/{id} | update | @PathVariable id + @RequestBody DictDataUpdateRequest | 更新数据项 |
| DELETE | /api/dict-data/{id} | delete | @PathVariable Long id | 删除数据项 |

## 8. 流程定义-已部署（ProcessDefinitionController，`/api/v1/deployed-processes`）— 8 个

| 方法 | 完整路径 | 方法名 | 参数 | 说明 |
|---|---|---|---|---|
| GET | /api/v1/deployed-processes | list | page=1, size=20, categoryId?, name?, status? | 已部署定义分页（Flowable 实时查） |
| GET | /api/v1/deployed-processes/summaries | summaries | — | 按 key 去重取最新版精简列表（子流程选择） |
| GET | /api/v1/deployed-processes/{id} | get | @PathVariable String id | 定义详情 + formDefId/fieldPermissions 解析（404 兜底） |
| GET | /api/v1/deployed-processes/{id}/xml | getXml | @PathVariable String id | BPMN XML 原文 |
| GET | /api/v1/deployed-processes/key/{key}/versions | listVersions | @PathVariable String key | 该 key 全部历史版本（多段路径避免与 /{id} 冲突） |
| GET | /api/v1/deployed-processes/versions/{procDefId}/editor | getVersionEditor | @PathVariable String procDefId | 历史版本编辑器数据（XML+NodeConfig 快照） |
| POST | /api/v1/deployed-processes/{id}/suspend | suspend | @PathVariable String id | 挂起定义 |
| POST | /api/v1/deployed-processes/{id}/activate | activate | @PathVariable String id | 激活定义 |

## 9. 流程设计-草稿（ProcessDesignController，`/api/v1/process-definitions`）— 7 个

| 方法 | 完整路径 | 方法名 | 参数 | 说明 |
|---|---|---|---|---|
| POST | /api/v1/process-definitions/drafts | createDraft | @RequestParam name, key, categoryId? | 创建草稿 |
| GET | /api/v1/process-definitions/drafts | listDrafts | page, size, categoryId?, name? | 草稿分页（name 搜索优先于 categoryId 过滤） |
| GET | /api/v1/process-definitions/{id}/editor | loadEditor | @PathVariable String id | 设计器加载：BPMN XML + 节点配置 |
| PUT | /api/v1/process-definitions/{id}/design | saveDesign | @PathVariable id + @RequestBody DesignSaveRequest | 保存设计（含节点配置/审批人改写） |
| POST | /api/v1/process-definitions/{id}/deploy | deploy | @PathVariable String id | 部署到 Flowable（MultiInstanceBpmnRewriter 生效点） |
| POST | /api/v1/process-definitions/{id}/copy | copyProcess | @PathVariable String id | 复制草稿 |
| DELETE | /api/v1/process-definitions/{id} | deleteDraft | @PathVariable String id | 删除草稿 |

## 10. 流程分类（CategoryController，`/api/v1/categories`）— 5 个

| 方法 | 完整路径 | 方法名 | 参数 | 说明 |
|---|---|---|---|---|
| GET | /api/v1/categories | list | — | 分类列表（扁平） |
| GET | /api/v1/categories/tree | tree | — | 分类树 |
| POST | /api/v1/categories | create | @RequestBody Map{name, parentId?, sortOrder?} | 新建分类 |
| PUT | /api/v1/categories/{id} | update | @PathVariable String id + @RequestBody Map | 更新分类 |
| DELETE | /api/v1/categories/{id} | delete | @PathVariable String id | 删除分类 |

## 11. 流程实例 / 变量 / 审批历史（3 个 Controller 共用 `/api/v1/process-instances`）— 16 个

| 方法 | 完整路径 | 方法名 | 参数 | 说明 |
|---|---|---|---|---|
| POST | /api/v1/process-instances | start | @RequestBody StartProcessRequest{processKey, businessKey?, variables?, formDefId?} | 发起实例（注入 initiator 变量；表单快照落 form_data；变量映射写入） |
| GET | /api/v1/process-instances | list | page, size, initiator?, status?, processName? | 运行中实例分页 |
| GET | /api/v1/process-instances/{id} | get | @PathVariable String id | 实例详情（runtime 优先，回退历史表） |
| POST | /api/v1/process-instances/{id}/suspend | suspend | @PathVariable String id | 挂起实例 |
| POST | /api/v1/process-instances/{id}/resume | resume | @PathVariable String id | 恢复实例 |
| POST | /api/v1/process-instances/{id}/terminate | terminate | @PathVariable id + @RequestParam reason? | 终止实例（默认理由 "User terminated"） |
| GET | /api/v1/process-instances/{id}/highlight | highlight | @PathVariable String id | 流程图高亮数据（已走/当前节点、连线） |
| GET | /api/v1/process-instances/{id}/prediction | prediction | @PathVariable String id | 执行预测（已执行+活跃+预测节点） |
| GET | /api/v1/process-instances/history | listHistory | page, size, initiator?, status?, processName? | 历史实例分页（"我发起的"数据源） |
| GET | /api/v1/process-instances/{id}/history | history | @PathVariable String id | 审批记录时间线（ProcessHistoryController） |
| GET | /api/v1/process-instances/{pid}/variables | getVariables | @PathVariable String processInstanceId | 全部流程变量（ProcessVariableController） |
| GET | /api/v1/process-instances/{pid}/variables/{name} | getVariable | @PathVariable pid, name | 单个变量 |
| PUT | /api/v1/process-instances/{pid}/variables | setVariables | @PathVariable pid + @RequestBody Map | 批量设变量 |
| PUT | /api/v1/process-instances/{pid}/variables/{name} | setVariable | @PathVariable pid, name + @RequestBody {value} | 设单变量 |
| DELETE | /api/v1/process-instances/{pid}/variables/{name} | removeVariable | @PathVariable pid, name | 删变量 |
| PUT | /api/v1/process-instances/tasks/{taskId}/variables | setTaskVariables | @PathVariable String taskId + @RequestBody Map | 经任务 ID 设变量（注意挂在 process-instances 前缀下） |

## 12. 任务模块（TaskController + TaskRemindController，`/api/v1/tasks`）— 13 个

| 方法 | 完整路径 | 方法名 | 参数 | 说明 |
|---|---|---|---|---|
| GET | /api/v1/tasks | listTodo | **assignee（必填）**, page=1, size=20, processName?, initiator?, createTimeStart?, createTimeEnd? | 待办分页 |
| GET | /api/v1/tasks/historic | listHistoric | **userId（必填）**, page, size, processName?, initiator?, endTimeStart?, endTimeEnd?, approveResult? | 已办分页 |
| GET | /api/v1/tasks/{id} | get | @PathVariable String id | 任务详情（含表单/权限/流程上下文） |
| POST | /api/v1/tasks/{id}/claim | claim | @PathVariable id + @RequestParam userId | 认领任务 |
| POST | /api/v1/tasks/{id}/complete | complete | @PathVariable id + @RequestBody CompleteTaskRequest{variables?, comment?}（可空体） | 完成任务（操作人取 SecurityContext；返回 processFinished 等） |
| POST | /api/v1/tasks/{id}/reject | reject | @PathVariable id + @RequestBody RejectRequest{reason?} | 驳回（退回发起人重填） |
| POST | /api/v1/tasks/{id}/refuse | refuse | @PathVariable id + @RequestBody RejectRequest{reason?} | 拒绝（写意见 action=refuse 并终止流程） |
| POST | /api/v1/tasks/{id}/transfer | transfer | @PathVariable id + @RequestBody TransferRequest{fromUser?, toUser, reason?} | 转办 |
| POST | /api/v1/tasks/{id}/delegate | delegate | @PathVariable id + @RequestBody DelegateRequest{fromUser?, delegateTo, comment?} | 委派 |
| POST | /api/v1/tasks/{id}/add-sign | addSign | @PathVariable id + @RequestBody AddSignRequest{userId?, users, comment?} | 加签 |
| POST | /api/v1/tasks/{id}/forward-sign | forwardSign | @PathVariable id + @RequestBody ForwardSignRequest{userId?, toUser, comment?} | 前加签/减签 |
| POST | /api/v1/tasks/{taskId}/remind | remind | @PathVariable String taskId | 催办单任务（24h 频控；推送站内信） |
| POST | /api/v1/tasks/by-instance/{processInstanceId}/remind | remindByInstance | @PathVariable String processInstanceId | 按实例催办全部活跃任务（无任务 404 / 全部被限流 429） |

## 13. 表单定义（FormDefinitionController，`/api/v1/form-definitions`）— 9 个

| 方法 | 完整路径 | 方法名 | 参数 | 说明 |
|---|---|---|---|---|
| POST | /api/v1/form-definitions | create | @RequestParam name, key, type?, processKey? | 创建表单定义 |
| GET | /api/v1/form-definitions | list | page, size, status?, name?, type? | 表单分页 |
| GET | /api/v1/form-definitions/{id} | getById | @PathVariable String id | 详情（含 schema/columnConfig） |
| GET | /api/v1/form-definitions/by-key/{key} | getByKey | @PathVariable String key | 按 key 取最新版（业务数据管理页用） |
| PUT | /api/v1/form-definitions/{id} | update | @PathVariable id + @RequestBody FormDefinitionSaveRequest | 原地更新（不建新版本） |
| DELETE | /api/v1/form-definitions/{id} | delete | @PathVariable String id | 软删除 |
| POST | /api/v1/form-definitions/{id}/publish | publish | @PathVariable String id | 发布（wf_biz_* 建表触发点） |
| GET | /api/v1/form-definitions/{id}/versions | getVersions | @PathVariable String id | 版本列表 |
| GET | /api/v1/form-definitions/{id}/versions/{version} | getByVersion | @PathVariable id, version:Integer | 取特定版本详情 |

## 14. 表单数据（FormDataController，`/api/v1/form-data`）— 11 个

| 方法 | 完整路径 | 方法名 | 参数 | 说明 |
|---|---|---|---|---|
| POST | /api/v1/form-data | save | @RequestBody FormDataSaveRequest{formDefId, processInstanceId?, taskId?, dataJson} | 保存当前数据（upsert） |
| POST | /api/v1/form-data/snapshot | saveSnapshot | 同上 | 审批快照（不可变新记录） |
| POST | /api/v1/form-data/draft | saveDraft | @RequestBody FormDataSaveRequest | 发起页草稿（无 processInstanceId） |
| GET | /api/v1/form-data/draft/{formDefId} | getDraft | @PathVariable String formDefId | 读草稿 |
| DELETE | /api/v1/form-data/draft/{formDefId} | clearDraft | @PathVariable String formDefId | 清草稿（发起成功后） |
| GET | /api/v1/form-data | getByProcessInstance | @RequestParam processInstanceId, formDefId | 按实例+表单查当前数据 |
| GET | /api/v1/form-data/task/{taskId} | getByTaskId | @PathVariable String taskId | 按 taskId 查审批快照 |
| GET | /api/v1/form-data/process-instance/{pid}/snapshots | getSnapshots | @PathVariable String processInstanceId | 实例全部快照（时间倒序） |
| GET | /api/v1/form-data/{id} | getById | @PathVariable String id | 单条表单数据 |
| PUT | /api/v1/form-data/{id} | update | @PathVariable id + @RequestBody FormDataSaveRequest | 更新 dataJson |
| GET | /api/v1/form-data/process-instance/{pid} | getByProcessInstance(全部) | @PathVariable String processInstanceId | 实例全部表单数据 |

## 15. 业务数据（BizDataController，`/api/v1/biz-data`，表 = wf_biz_\<formKey\>）— 11 个

| 方法 | 完整路径 | 方法名 | 参数 | 说明 |
|---|---|---|---|---|
| GET | /api/v1/biz-data/referenced-count | referencedCount | — | dataPicker 引用统计（{formKey:{count,referencedBy}}） |
| POST | /api/v1/biz-data/{formKey} | create | @PathVariable formKey + @RequestBody Map | 新增行 |
| GET | /api/v1/biz-data/{formKey} | query | @PathVariable formKey + BizDataQueryRequest（query 绑定，filter 为 JSON 串） | 分页查询 |
| GET | /api/v1/biz-data/{formKey}/{id} | getById | @PathVariable formKey, id | 单行 |
| GET | /api/v1/biz-data/{formKey}/resolve | resolve | @PathVariable formKey + @RequestParam ids:List\<String\>, displayField? | 批量解析显示文本（字面量优先于 /{id}） |
| PUT | /api/v1/biz-data/{formKey}/{id} | update | @PathVariable formKey, id + @RequestBody Map（含 version） | 更新（乐观锁） |
| DELETE | /api/v1/biz-data/{formKey}/{id} | delete | @PathVariable formKey, id | 删行 |
| GET | /api/v1/biz-data/{formKey}/{id}/sub/{field} | listSubRows | @PathVariable formKey, id, field | 独立子表行列表（sort_no 升序） |
| POST | /api/v1/biz-data/{formKey}/{id}/sub/{field} | addSubRow | 同上 + @RequestBody Map | 追加子表行 |
| PUT | /api/v1/biz-data/{formKey}/{id}/sub/{field}/{rowId} | updateSubRow | @PathVariable formKey, id, field, rowId + @RequestBody Map | 更新子表行（乐观锁） |
| DELETE | /api/v1/biz-data/{formKey}/{id}/sub/{field}/{rowId} | deleteSubRow | @PathVariable formKey, id, field, rowId | 删子表行 |

## 16. 页面模块（PageDefinitionController + PageQueryController + PageMenuController，`/api/v1/pages`）— 12 个

| 方法 | 完整路径 | 方法名 | 参数 | 说明 |
|---|---|---|---|---|
| POST | /api/v1/pages | create | @RequestBody PageDefinitionSaveRequest{name,key,type,formKey?,dataSourceId?} | 创建页面（VIEW/PAGE） |
| GET | /api/v1/pages | list | page, size, status?, name?, type? | 页面分页 |
| GET | /api/v1/pages/{id} | getById | @PathVariable String id | 详情（含 schema） |
| GET | /api/v1/pages/{key}/definition | getByKey | @PathVariable String key + @RequestParam preview=false | 渲染取数：已发布版；preview=true 取最新（PageAccessGuard 校验） |
| PUT | /api/v1/pages/{id} | update | @PathVariable id + @RequestBody PageDefinitionSaveRequest | 更新 |
| DELETE | /api/v1/pages/{id} | delete | @PathVariable String id | 软删除 |
| POST | /api/v1/pages/{id}/publish | publish | @PathVariable String id | 发布（编译视图配置，不建表） |
| GET | /api/v1/pages/{pageKey}/data | query | @PathVariable pageKey + BizDataQueryRequest | 视图数据查询（filter/sort 白名单；PageAccessGuard） |
| GET | /api/v1/pages/{pageKey}/ds/{dataSourceId}/data | queryPageDataSource | @PathVariable pageKey, dataSourceId + BizDataQueryRequest | 自定义页面数据源查询（searchFields 白名单） |
| POST | /api/v1/pages/{id}/mount-menu | mountMenu | @PathVariable String id + @RequestBody MountMenuRequest{name?, parentId?} | 挂接菜单（仅 PUBLISHED；admin 自动授权 ROLE_ADMIN） |
| GET | /api/v1/pages/{key}/menus | getMenus | @PathVariable String key | 页面已挂菜单列表 |
| DELETE | /api/v1/pages/menus/{menuId} | unmountMenu | @PathVariable Long menuId | 解除挂接（软删菜单） |

## 17. 数据源模块（DataSourceController + DbSchemaController + MetadataProbeController，`/api/v1/data-sources`）— 18 个

| 方法 | 完整路径 | 方法名 | 参数 | 说明 |
|---|---|---|---|---|
| POST | /api/v1/data-sources | create | @RequestBody DataSourceSaveRequest{name,type,formKey?,sourceKey?,params?} | 创建（默认 DRAFT） |
| PUT | /api/v1/data-sources/{id} | update | @PathVariable String id + @RequestBody DataSourceSaveRequest | 原地更新 |
| DELETE | /api/v1/data-sources/{id} | delete | @PathVariable String id | 删除（仅 DRAFT） |
| POST | /api/v1/data-sources/{id}/enable | enable | @PathVariable String id | 启用（校验必填项/FORM 已发布） |
| POST | /api/v1/data-sources/{id}/disable | disable | @PathVariable String id | 禁用 |
| GET | /api/v1/data-sources | list | page, size, type?, status? | 数据源分页 |
| GET | /api/v1/data-sources/enabled | enabled | — | 已启用列表（设计器下拉） |
| GET | /api/v1/data-sources/{id} | getById | @PathVariable String id | 详情 |
| GET | /api/v1/data-sources/{id}/metadata | metadata | @PathVariable String id | 列定义 + 可写标记 |
| GET | /api/v1/data-sources/{id}/data | queryData | @PathVariable id + BizDataQueryRequest | 统一数据访问分页查询（DataSourceAdapter SPI） |
| GET | /api/v1/data-sources/{id}/data/{rowId} | getData | @PathVariable id, rowId | 单行 |
| POST | /api/v1/data-sources/{id}/data | createData | @PathVariable id + @RequestBody Map | 新增（只读源 400） |
| PUT | /api/v1/data-sources/{id}/data/{rowId} | updateData | @PathVariable id, rowId + @RequestParam version? + @RequestBody Map | 修改（乐观锁可空） |
| DELETE | /api/v1/data-sources/{id}/data/{rowId} | deleteData | @PathVariable id, rowId | 删除 |
| GET | /api/v1/data-sources/db/tables | tables | — | 当前库全部基础表名（排除 flyway_schema_history） |
| GET | /api/v1/data-sources/db/tables/{table}/columns | columns | @PathVariable String table | 按表名列字段（information_schema，JdbcTemplate 参数绑定） |
| POST | /api/v1/data-sources/explore-sql | exploreSql | @RequestBody Map{sql} | 执行 SQL 取列元数据（LIMIT 1 包裹，不返回数据；非 SELECT 拒绝） |
| POST | /api/v1/data-sources/explore-api | exploreApi | @RequestBody Map{action, method?, data?} | 调 API list 拉样例推断列（超时 10s） |

## 18. 内部接口 / 逻辑配置 / 仪表盘 / 示例（SystemInternalController + BackendLogicBeanController + DashboardController + 2 个示例 Controller）— 16 个

| 方法 | 完整路径 | 方法名 | 参数 | 说明 |
|---|---|---|---|---|
| GET | /api/v1/internal/system/dept-tree | deptTree | @RequestParam keyword? | 部门树扁平化（SystemInternalController） |
| GET | /api/v1/internal/system/users | users | keyword?, page=1, size=20 | 用户分页（BizDataPageVO 形态） |
| GET | /api/v1/internal/system/users/{id} | getUser | @PathVariable String id | 用户单条 |
| GET | /api/v1/internal/system/dept-tree/metadata | deptTreeMetadata | — | 部门数据源元数据（只读） |
| GET | /api/v1/internal/system/users/metadata | usersMetadata | — | 用户数据源元数据（只读） |
| POST | /api/v1/internal/system/dept | createDept | @RequestBody Map{orgName, orgCode} | 建部门（委托 OrganizationService） |
| DELETE | /api/v1/internal/system/dept/{id} | deleteDept | @PathVariable String id | 删部门 |
| POST | /api/v1/internal/system/user | createUser | @RequestBody Map{username, nickname, orgId?} | 建用户 |
| DELETE | /api/v1/internal/system/user/{id} | deleteUser | @PathVariable String id | 删用户 |
| GET | /api/v1/backend-logic/beans | beans | — | 已注册后端逻辑 Bean 方法清单（BackendLogicBeanController） |
| GET | /api/v1/dashboard/stats | stats | @RequestParam userId? | 看板 KPI/7 日趋势/状态占比（DashboardController） |
| POST | /api/v1/example/emp/adjust-salary | adjustSalary | @RequestBody Map{id, amount} | 示例：调薪 |
| POST | /api/v1/example/emp/resign | resign | @RequestBody Map{id, reason?} | 示例：离职 |
| POST | /api/v1/example/leave/submit | submit | @RequestBody Map{id} | 示例：请假提交审批 |
| POST | /api/v1/example/leave/approve | approve | @RequestBody Map{taskId} | 示例：审批通过 |
| POST | /api/v1/example/leave/reject | reject | @RequestBody Map{taskId, reason?} | 示例：驳回 |

## 19. 消息中心-用户端 + SSE（NotificationController + NotificationSseController，`/api/v1/notifications`）— 9 个

| 方法 | 完整路径 | 方法名 | 参数 | 说明 |
|---|---|---|---|---|
| GET | /api/v1/notifications | list | page, size, keyword?, category?, unread?, start?, end?（yyyy-MM-dd HH:mm:ss）, messageType? | 我的消息分页 |
| GET | /api/v1/notifications/{id} | getById | @PathVariable Long id | 消息详情（归属校验） |
| PUT | /api/v1/notifications/{id}/read | markAsRead | @PathVariable Long id | 标记已读 |
| POST | /api/v1/notifications/read-batch | batchMarkAsRead | @RequestBody List\<Long\> messageIds | 批量已读 |
| POST | /api/v1/notifications/{id}/toggle-read | toggleRead | @PathVariable Long id | 已读/未读切换 |
| POST | /api/v1/notifications/read-all | markAllAsRead | — | 全部已读 |
| DELETE | /api/v1/notifications/{id} | delete | @PathVariable Long id | 删除消息 |
| GET | /api/v1/notifications/unread-count | getUnreadCount | — | 未读数（铃铛角标） |
| GET | /api/v1/notifications/sse | connect | @RequestParam token（JWT） | SSE 长连接（permitAll，query 传 token，text/event-stream） |

## 20. 通知-内部 API（InternalNotificationController，`/api/v1/internal/notifications`）— 2 个

| 方法 | 完整路径 | 方法名 | 参数 | 说明 |
|---|---|---|---|---|
| POST | /api/v1/internal/notifications/send | send | @RequestBody Message + @RequestParam recipientIds:List\<Long\>, channels:List\<ChannelType\> | 自由内容发消息（事件驱动） |
| POST | /api/v1/internal/notifications/send-by-template | sendByTemplate | @RequestBody TemplateSendRequest{templateCode, variables, messageType?, eventCode?, senderId?} + @RequestParam recipientIds, channels | 按模板发消息 |

## 21. 通知-管理端（7 个 Controller，`/api/v1/admin/notification/*`，全部 `requireAdmin()`）— 25 个

| 方法 | 完整路径 | 方法名 | 参数 | 说明 |
|---|---|---|---|---|
| GET | /api/v1/admin/notification/stats/overview | overview | — | 统计概览：总消息/总收件/待重试（StatsController） |
| GET | /api/v1/admin/notification/channels | list | — | 渠道列表（enabled/successRate）（ChannelController） |
| POST | /api/v1/admin/notification/channels/{id}/enable | enable | @PathVariable Long id | 启用渠道 |
| POST | /api/v1/admin/notification/channels/{id}/disable | disable | @PathVariable Long id | 禁用渠道 |
| PUT | /api/v1/admin/notification/channels/{id}/config | updateConfig | @PathVariable id + @RequestBody Map\<String,String\> | 更新渠道配置（敏感字段加密） |
| POST | /api/v1/admin/notification/channels/{id}/test | test | @PathVariable Long id | 渠道连通性测试（站内信真发一条） |
| POST | /api/v1/admin/notification/announcements | publish | @RequestParam title, content, recipientIds:List\<Long\> | 发布公告（PUBLIC 消息 + SSE 推送）（AnnouncementController） |
| GET | /api/v1/admin/notification/announcements | list | page, size, keyword? | 公告列表（含接收人数） |
| GET | /api/v1/admin/notification/announcements/{id} | detail | @PathVariable Long id | 公告详情（完整 Markdown） |
| DELETE | /api/v1/admin/notification/announcements/{id} | recall | @PathVariable Long id | 撤回公告（删收件人+消息） |
| GET | /api/v1/admin/notification/deliveries | list | page, size, keyword?, recipient?, channel?, start?, end? | 发送记录列表（消息+收件人聚合）（DeliveryController） |
| POST | /api/v1/admin/notification/deliveries/{id}/retry | retry | @PathVariable Long id | 手动重发（重新走完整发送链路） |
| GET | /api/v1/admin/notification/events | list | page, size, keyword?, enabled? | 业务事件定义分页（EventDefinitionController） |
| POST | /api/v1/admin/notification/events | create | @RequestBody Map{eventCode, eventName, description?, businessDomain?} | 新建事件定义 |
| PUT | /api/v1/admin/notification/events/{id} | update | @PathVariable Long id + @RequestBody Map | 更新事件定义 |
| DELETE | /api/v1/admin/notification/events/{id} | delete | @PathVariable Long id | 删除事件定义 |
| POST | /api/v1/admin/notification/events/{id}/toggle | toggle | @PathVariable Long id | 启用/停用切换 |
| GET | /api/v1/admin/notification/subscriptions | list | page, size, eventCode? | 订阅规则分页（SubscriptionController） |
| POST | /api/v1/admin/notification/subscriptions | create | @RequestBody Map{eventCode, channel, priority, enable, action, condition?} | 新建订阅规则 |
| PUT | /api/v1/admin/notification/subscriptions/{id} | update | @PathVariable Long id + @RequestBody Map | 更新订阅规则 |
| DELETE | /api/v1/admin/notification/subscriptions/{id} | delete | @PathVariable Long id | 删除订阅规则 |
| GET | /api/v1/admin/notification/templates | list | — | 消息模板列表（TemplateController） |
| POST | /api/v1/admin/notification/templates | create | @RequestBody MessageTemplate | 新建模板（tenantId 由后端注入） |
| PUT | /api/v1/admin/notification/templates/{id} | update | @PathVariable Long id + @RequestBody MessageTemplate | 更新模板 |
| POST | /api/v1/admin/notification/templates/{id}/toggle | toggle | @PathVariable Long id | 模板启用/停用 |

---

## 22. 模块 × 端点数统计

| 模块（功能域） | Controller 数 | 端点数 |
|---|---:|---:|
| 认证（auth） | 1 | 5 |
| 用户管理 | 1 | 8 |
| 角色管理 | 1 | 6 |
| 菜单管理 | 1 | 4 |
| 组织机构 | 1 | 4 |
| 字典（类型+数据） | 2 | 8 |
| 流程定义-已部署 | 1 | 8 |
| 流程设计-草稿 | 1 | 7 |
| 流程分类 | 1 | 5 |
| 流程实例+变量+审批历史 | 3 | 16 |
| 任务（待办/办理/催办） | 2 | 13 |
| 表单定义 | 1 | 9 |
| 表单数据 | 1 | 11 |
| 业务数据（biz-data） | 1 | 11 |
| 页面（定义/查询/挂菜单） | 3 | 12 |
| 数据源（管理+db schema+元数据探测） | 3 | 18 |
| 内部数据源（system 委托） | 1 | 9 |
| 后端逻辑 Bean 配置 | 1 | 1 |
| 仪表盘 | 1 | 1 |
| 消息中心-用户端+SSE | 2 | 9 |
| 通知-内部 API | 1 | 2 |
| 通知-管理端 | 7 | 25 |
| 示例（请假单/员工档案） | 2 | 5 |
| **合计** | **39** | **197** |

> 说明：`system` 包（§2–§7）合计 35 个端点，走 `/api/<资源>` 直挂风格；其余（流程/表单/页面/数据源/通知等）走 `/api/v1/...` 风格。无独立文件上传模块（文件端点为 0）。

## 23. 扫描发现的异常与迁移注意点

1. **【前端 404 缺口】`PUT /api/auth/password` 不存在**：`frontend/src/views/profile/ProfilePage.vue` 调用自助改密，但 AuthController 只有 login/logout/refresh/userinfo/menus 五个端点。迁移 Node 时决定：补实现，或前端改走 `PUT /api/users/{id}/reset-password`（管理员语义）。
2. **【权限薄弱面】除通知管理端 25 个端点（requireAdmin）与页面数据出口（PageAccessGuard）外，其余 ~170 个端点只做 JWT 认证、不做角色/权限校验**。敏感面包括：用户/角色/菜单/组织/字典全套增删改、流程部署与终止、`explore-sql`（任意只读 SQL 探测）、`/db/tables`（全库表结构枚举）、`/api/v1/internal/notifications/send`（向任意用户发消息）。`@HasPermission`/`PermissionEvaluator` 已备而未用——迁移时建议先按现状 1:1 对齐，再考虑补权限模型。
3. **【共用前缀与路径冲突规避】** 4 组 Controller 共用前缀（`/api/v1/process-instances`×3、`/api/v1/tasks`×2、`/api/v1/pages`×3、`/api/v1/data-sources`×2）；`/history`、`/key/{key}/versions`、`/versions/{procDefId}/editor`、`/summaries`、`/referenced-count`、`/enabled` 等多段字面量路径是有意设计，用于避开单段 `/{id}` 模板匹配——Node 迁移若用 Express/路由库需保证同样的"字面量优先于参数"匹配顺序。
4. **【非常规路径】** `PUT /api/v1/process-instances/tasks/{taskId}/variables`：任务级变量挂在 process-instances 前缀下（非 `/api/v1/tasks/...`），迁移时勿"顺手纠正"。
5. **【必填参数风格不一】** `GET /api/v1/tasks?assignee=`（必填，缺省报错）vs `GET /api/v1/tasks/historic?userId=`（必填）；其余列表端点 userId 均从 SecurityContext 取——前端现状已适配（worklog Task 3 记录）。
6. **【分页信封双形态】** system 模块与通知端用 `PageResult{rows,total,page,size}`；v1 低代码端多用 `PageResponse{records,page,size,total}`（字段名 `records`，Flowable 侧手写映射）。迁移需按调用方分别对齐。
7. **【SSE 特例】** `GET /api/v1/notifications/sse` 是唯一 permitAll + query token 认证的端点，且响应非 R 信封（text/event-stream）。
8. **【example 模块】** `/api/v1/example/**` 5 个端点为流程语义操作演示（BizService → Flowable），迁移评估时可降级为可选。
