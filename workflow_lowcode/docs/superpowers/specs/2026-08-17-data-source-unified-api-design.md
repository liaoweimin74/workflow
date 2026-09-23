# 数据源统一接口设计

日期：2026-08-17
状态：已确认（brainstorming 产出）

## 背景与目标

当前数据源架构（阶段二 PAGE 自定义页面）存在缺口：

1. `DataSourceAdapter` SPI 仅含 `supports(type)` + `query(ds, req)` 两个方法，只支持 FORM 类型。
2. **API/SYSTEM 类型没有适配器实现**——`queryData` 对它们抛"数据源类型未启用"（类型被支持、enable 校验已做，但查询链路是空的洞）。
3. 无元数据能力：切换数据源后表格列无法自动刷新（列中文名在 `column_config`，API 无来源）。
4. 无增删改能力：PAGE 渲染页表格操作按钮硬编码调 BizData API，未走数据源 SPI。

目标：统一数据源 SPI（元数据/列表/单条/增删改），补齐 FORM 增删改查与元数据 API，实现 API 数据源适配器（复用 HttpLogicExecutor），前端提供 API 数据源配置界面，打通设计器切换数据源自动刷新列。

## 设计决策（已确认）

| 决策点 | 结论 |
|---|---|
| 统一接口组织方式 | 方案 A：能力接口 + default 方法（只读数据源继承默认实现抛"不支持"） |
| 列元数据格式 | 复用 `ColumnConfig`，**第一版仅列定义字段**（key/label/columnType/length/scale/required/unique/indexed/hidden），**不含 componentType/pickerConfig**（组件类型与编辑弹窗能力后续再做） |
| API 数据源适配器范围 | 完整实现（metadata/query/get/create/update/delete），列配置界面不含组件类型 |
| 消费端范围 | 全打通：REST API 全暴露 + PAGE 表格操作按钮接数据源增删改 |
| FORM 数据源 | 补齐增删改查 API + 取元数据 API；配置界面选择表单时自动展示生成的 API 端点 |
| API 多操作配置 | params 扩展为 list/get/create/update/delete + columns；兼容旧 action 顶层格式 |
| 组件类型（componentType） | **第一版不加入**：FORM 数据源实际 column_config 无 componentType（仅列定义字段）；编辑弹窗渲染（columnToRule 映射）后续再设计 |

## 架构

```
┌──────────────────────────────────────────────────────────────┐
│ 消费端                                                       │
│  设计器（切换数据源→metadata→刷新列）/ 渲染页表格 / 数据源管理页 │
└──────────────────────────┬───────────────────────────────────┘
                           │ REST API（统一端点）
┌──────────────────────────▼───────────────────────────────────┐
│ DataSourceController（新增）                                  │
│  GET /{id}/metadata  GET /{id}/data  GET /{id}/data/{rowId}  │
│  POST /{id}/data  PUT /{id}/data/{rowId}  DELETE /{id}/data/{rowId} │
└──────────────────────────┬───────────────────────────────────┘
                           │ DataSourceDefinitionService.queryData / 新增写分发
┌──────────────────────────▼───────────────────────────────────┐
│ DataSourceAdapter（统一 SPI，方案 A）                          │
│  metadata() / query() / get()                                │
│  create()/update()/delete()（default → 不支持异常）            │
├─────────────────┬──────────────────┬─────────────────────────┤
│ FormAdapter     │ ApiAdapter（新）  │ SystemAdapter（新）      │
│ BizDataService  │ HttpLogicExecutor │ 内置 dept-tree/user-tree │
└─────────────────┴──────────────────┴─────────────────────────┘
```

## 详细设计

### 1. 统一 SPI（重构 `DataSourceAdapter`）

```java
public interface DataSourceAdapter {

    /** 是否支持该数据源类型 */
    boolean supports(String type);

    /** 取元数据：列定义（ColumnConfig 列表）+ 可写标记 */
    DataSourceMetadata metadata(DataSourceDefinition ds);

    /** 列表分页查询 */
    BizDataPageVO query(DataSourceDefinition ds, BizDataQueryRequest req);

    /** 单条查询 */
    BizDataVO get(DataSourceDefinition ds, String id);

    // ===== 写能力：只读数据源继承默认实现 → 抛"该数据源不支持XX" =====

    default String create(DataSourceDefinition ds, Map<String, Object> data) {
        throw new BusinessException(400, "该数据源不支持新增: " + ds.getName());
    }

    default void update(DataSourceDefinition ds, String id, Map<String, Object> data, Integer version) {
        throw new BusinessException(400, "该数据源不支持修改: " + ds.getName());
    }

    default void delete(DataSourceDefinition ds, String id) {
        throw new BusinessException(400, "该数据源不支持删除: " + ds.getName());
    }
}
```

`DataSourceMetadata`（新 DTO）：

```java
public class DataSourceMetadata {
    private List<ColumnConfig> columns;  // 复用 ColumnConfig（第一版仅 key/label/columnType/length/scale/required/unique/indexed/hidden）
    private boolean writable;            // 是否支持增删改
}
```

### 2. 适配器实现

#### FormDataSourceAdapter（重构现有）
- `metadata`：`formDefService.getBusinessColumnsByKey(ds.getFormKey())` → ColumnConfig 列表（中文名在 label）；writable=true
- `query`/`get`：委托 `BizDataService.query` / 新增 `detail` 转发（现有 query 已有；detail 补齐）
- `create`/`update`/`delete`：委托 `BizDataService.create/update/delete`（补齐）

#### ApiDataSourceAdapter（新增）
- 构造：注入 `HttpLogicExecutor`、`ObjectMapper`
- `metadata`：从 params 的 `columns` 数组解析 → ColumnConfig 列表；`columns` 缺失时尝试从 `list` action 首次响应推断字段名（可选增强，第一版仅显式配置）
- `query`：`HttpLogicExecutor.execute(list.action, list.method, headers, query映射, body, vars, timeout, retry)` → 按 `parse`/`totalParse` 抽取 records/total → 映射为 BizDataPageVO
- `get`：`get.action`（支持 `{id}` 路径变量）
- `create`/`update`/`delete`：对应 action 配置存在则执行（body 映射），未配置 → 继承 default 抛"不支持"
- 认证：params 支持 `headers`（静态头如 X-Api-Key）

#### SystemDataSourceAdapter（新增）
- `metadata`：内置列定义（dept-tree: id/name/parentId；user-tree: id/name/deptId）
- `query`：SYSTEM 查询（租户上下文，dept/user 服务）
- `get`/写：只读（继承 default）

### 3. API 数据源 params 扩展（LookupFetchConfig → 多操作）

当前格式（单一 action）：
```json
{ "action": "/v1/external/list", "method": "POST", "parse": "records", "totalParse": "total",
  "searchParam": "kw", "keywordColumn": "name", "pageBase": 0,
  "data": { "dept": "IT" }, "headers": { "X-Api-Key": "abc" } }
```

扩展后：
```json
{
  "list":    { "action": "/v1/external/list",   "method": "POST", "parse": "records", "totalParse": "total" },
  "get":     { "action": "/v1/external/{id}",   "method": "GET" },
  "create":  { "action": "/v1/external",        "method": "POST" },
  "update":  { "action": "/v1/external/{id}",   "method": "PUT" },
  "delete":  { "action": "/v1/external/{id}",   "method": "DELETE" },
  "columns": [
    { "key": "name",  "label": "名称", "columnType": "VARCHAR", "required": true },
    { "key": "price", "label": "价格", "columnType": "DECIMAL", "scale": 2 }
  ],
  "searchParam": "kw", "keywordColumn": "name", "pageBase": 0,
  "data": { "dept": "IT" }, "headers": { "X-Api-Key": "abc" }
}
```

> columns 复用 ColumnConfig 的列定义字段（key/label/columnType/length/scale/required/unique/indexed/hidden），与 FORM 数据源 column_config 格式一致；**不含 componentType**（组件类型与编辑弹窗渲染后续再做）。

兼容：顶层 `action`/`method`/`parse`/`totalParse` 存在时自动归入 `list`（method 默认 GET）。

### 4. 统一 REST API（`DataSourceController` 新增）

```
GET    /api/v1/data-sources/{id}/metadata       → DataSourceMetadata
GET    /api/v1/data-sources/{id}/data           → BizDataPageVO（filter/sort/分页）
GET    /api/v1/data-sources/{id}/data/{rowId}   → BizDataVO
POST   /api/v1/data-sources/{id}/data           → 新增（返回 id）
PUT    /api/v1/data-sources/{id}/data/{rowId}   → 修改
DELETE /api/v1/data-sources/{id}/data/{rowId}   → 删除
```

- 权限：数据源查询/写操作沿用现有权限体系（页面渲染场景 token 已带租户）
- 写操作前置校验：数据源须 ENABLED（复用 `getById` + 状态校验）
- PAGE 页面 `queryPageDataSource` 保留（页面内 id → refId → 同一 SPI 分发），与数据源直连端点共享 `DataSourceDefinitionService`

### 5. FORM 数据源配置界面（前端 DataSourceListPage）

- 选择表单后**自动展示**该表单的增删改查 API 端点（只读展示）：
  - 列表：`GET /api/v1/biz-data/{formKey}`
  - 单条：`GET /api/v1/biz-data/{formKey}/{id}`
  - 新增：`POST /api/v1/biz-data/{formKey}`
  - 修改：`PUT /api/v1/biz-data/{formKey}/{id}`
  - 删除：`DELETE /api/v1/biz-data/{formKey}/{id}`
- 后端 `BizDataController` 补齐：检查现有端点（create/update/delete/detail/resolve 已有），缺 metadata 端点（可经统一数据源 metadata 端点覆盖）

### 6. 消费端全打通

- **设计器（PageDesigner）**：数据源下拉 `change` → `GET /api/v1/data-sources/{refId}/metadata` → 解析 columns → 写入 activeRule.props.columns（表格）/忽略（树）；组件列即时刷新
- **渲染页（PageRendererPage）**：表格操作按钮（新增/编辑/删除）→ 数据源增删改 API（按 dataSourceId → refId → 统一端点），替代当前硬编码 BizData 调用
- **PageDataTable/PageDataTree**：fetchData 改走数据源统一端点（当前 `/v1/pages/{pageKey}/ds/{dataSourceId}/data` 保留或迁移到 `/v1/data-sources/{refId}/data`，二选一——推荐保留页面端点做白名单过滤，新增数据源端点做通用访问）

## 测试策略

- **后端单元测试**：
  - `DataSourceAdapter` 重构不破坏现有 FORM 查询（回归）
  - `ApiDataSourceAdapter`：mock HttpLogicExecutor，验证 action 解析/parse 抽取/写操作映射/未配置抛不支持
  - `SystemDataSourceAdapter`：列定义与查询
  - `DataSourceController`：六端点（metadata/list/get/create/update/delete），只读数据源写操作 → 400
  - FORM metadata：返回 column_config 列（中文名）
- **前端**：
  - PageDesigner 切换数据源自动刷新列（组件测试 + 浏览器验证）
  - DataSourceListPage API 配置界面（多操作表单 + 列定义）
- **E2E**：product-dashboard 左树右表 + 表格新增/编辑/删除按钮走数据源写 API

## 实施顺序

1. 后端：重构 `DataSourceAdapter`（加 metadata/get/写方法 + default）+ `DataSourceMetadata` DTO
2. 后端：`FormDataSourceAdapter` 补齐（metadata/get/create/update/delete）
3. 后端：`ApiDataSourceAdapter`（多操作 params 解析 + HttpLogicExecutor 复用）
4. 后端：`SystemDataSourceAdapter`（内置列定义 + 查询）
5. 后端：`DataSourceController` 六端点 + `DataSourceDefinitionService` 写分发
6. 后端：测试（单元 + 集成）
7. 前端：DataSourceListPage API 配置界面（多操作表单 + 列定义 + FORM 自动展示 API）
8. 前端：PageDesigner 切换数据源自动刷新列
9. 前端：渲染页表格操作按钮接数据源写 API
10. 回归 + E2E 验证
