# Implementation Tasks

## 1. 系统结构内部 REST API (SystemInternalController)

- [ ] 1.1 部门树接口 `GET /api/v1/internal/system/dept-tree` → 扁平行（id/parentId/label/code），keyword 模糊匹配 label/code
- [ ] 1.2 用户列表接口 `GET /api/v1/internal/system/users`（分页 + keyword → username/姓名模糊）与 `GET /api/v1/internal/system/users/{id}`
- [ ] 1.3 部门 CRUD 接口 (POST/PUT/DELETE) → OrganizationService.create/update/delete
- [ ] 1.4 用户 CRUD 接口 (POST/PUT/DELETE) → UserService.create/update/delete
- [ ] 1.5 SYSTEM 列元数据接口：dept-tree/user-tree columns + writable=true

## 2. internal:// 本地派发 (InternalDataSourceRouter)

- [ ] 2.1 sourceKey/formKey → controller bean 方法 allowlist (internal:///→bean 映射)
- [ ] 2.2 TenantContext 透传 + 拒绝未注册路径 400

## 3. UnifiedDataSourceAdapter (收敄 3→1)

- [ ] 3.1 复制 ApiDataSourceAdapter 基线 → UnifiedDataSourceAdapter；删除旧 FormDataSourceAdapter / SystemDataSourceAdapter bean
- [ ] 3.2 接入 InternalDataSourceRouter (internal://) + 保留 HttpLogicExecutor (external https://)
- [ ] 3.3 参数自动生成器 paramsGenerator(type, formKey, sourceKey) → list/get/create/update/delete action + parse/totalParse
- [ ] 3.4 DataSourceDefinitionService.enable()/create() 回填 FORM/SYSTEM params（只读配置）
- [ ] 3.5 迁移并合并原 Form/System/Api adapter 单元测试 → UnifiedDataSourceAdapterTest

## 4. 前端单页签配置 (DataSourceListPage)

- [ ] 4.1 把 type 表单折叠为单 API 配置页签；FORM/SYSTEM 自动生成只读；API 可编辑
- [ ] 4.2 dataSourceApi 六大数据端点契约不变

## 5. 回归 & E2E

- [ ] 5.1 后端编译 + 单元测试 (mvn test)
- [ ] 5.2 前端 lint + 构建 (npm run build / npm run lint)
- [ ] 5.3 E2E：dept-tree / user-tree / FORM biz-data 走 UnifiedDataSourceAdapter 路由
