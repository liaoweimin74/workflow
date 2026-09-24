# Design：视图查询设计器（View Designer）与自定义页面

> 变更：query-view-designer
> 日期：2026-08-16

## Context

系统当前表单分两类：`WORKFLOW`（数据存 `wf_form_data` JSON）、`BUSINESS`（发布时经 `DynamicTableManager.ensureTable` 生成物理表 `wf_biz_<formKey>`）。发布入口 `FormDefinitionService.publish()` 按 type 分支决定是否建表。

现有列表查询能力是 `BizDataListPage.vue`——按表单 column_config **自动生成**搜索栏 + 表格列 + 增删改弹窗，绑定固定物理表，**完全不可配置**。用户诉求：用设计器配置"列表查询界面"，发布**不建表**、只绑定已生成的物理表/表单，且要支持自定义事件；进一步还要能覆盖表格之外的异形风格（卡片/看板/日历等）与复杂交互。

前端已具备 form-create 渲染基础：`@form-create/designer@3.5` + `@form-create/element-ui@3.3`；`FormRenderer.vue` 通用渲染引擎已被 4 处复用；`DataPicker.vue` 通过 `formCreateInject`（`api.setValue` 等）与宿主交互——"任意组件渲染 + API 注入 + 事件"已有先例。

约束：不能改动现有 `FormDesigner.vue` / `FormDefinitionService.publish()` / `DynamicTableManager`，表单发布建表行为必须保持不变。

## Goals / Non-Goals

**Goals:**
- 提供"查询界面设计器"，发布动作不触发任何 DDL，只绑定已发布 BUSINESS 表单（`wf_biz_<formKey>`）
- 双轨：视图轨（声明式清单勾选，80% 表格场景）+ 自定义页面轨（form-create 拖拽，20% 复杂场景）
- 自定义页面轨支持**页面级多数据源绑定**（一个页面可绑定多个数据源）与通用组件联动（不限定左树右表等具体场景）
- 提供**全局数据源管理**（`wf_data_source` 实体 + 列表界面）：FORM/SYSTEM/API 多态来源一处维护、多页面复用
- 视图支持"声明式动作链 + 沙箱脚本"双层自定义事件
- 两轨共享数据层与 form-create 运行时，统一发布/菜单/路由消费
- 发布校验严格：绑定表单已发布、引用列存在、搜索字段类型合法

**Non-Goals:**
- 不改动现有表单设计器/表单发布建表流程（阶段一、二均不涉及）
- 不支持绑定 WORKFLOW 表单（`wf_form_data` JSON 列）——JSON 过滤能力弱，留待后续
- 不支持绑定任意数据库表（绕过表单元数据无法校验）
- 阶段一不含页面轨（轨 B）实现，仅含视图轨（轨 A）
- 不做多租户/权限模型扩展（沿用现有 TenantProvider 与菜单权限体系）

## Decisions

### D1：独立 `wf_page_def` 表 + `PageDefinition` 实体

不复用 `wf_form_def`。视图/页面的语义（绑定一对多、不建表、非表单布局 schema）与表单不同，混在一个表会让 `publish()` 分支爆炸、历史查询逻辑受牵连。

```sql
CREATE TABLE IF NOT EXISTS wf_page_def (
    id               VARCHAR(64)  NOT NULL PRIMARY KEY,
    tenant_id        VARCHAR(64)  NOT NULL,
    name             VARCHAR(255) NOT NULL,
    `key`            VARCHAR(255) NOT NULL,
    type             VARCHAR(32)  NOT NULL DEFAULT 'VIEW',-- VIEW/PAGE
    form_key         VARCHAR(255),
    `schema`         LONGTEXT,
    version          INT NOT NULL DEFAULT 1,
    status           VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    published_version INT,
    created_by       VARCHAR(50),
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_page_def_tenant_key_version (tenant_id, `key`, version),
    INDEX idx_page_def_tenant_form (tenant_id, form_key),
    INDEX idx_page_def_tenant_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='页面定义（视图/自定义页面）';
```

版本管理语义对齐 `wf_form_def`：create→version=1/DRAFT；update→原地更新；publish→旧 PUBLISHED 降 ARCHIVED；悲观锁 `findByIdForUpdate` 串行化发布。

### D2：视图配置编译为 form-create rule（统一运行时）

视图 schema（type=VIEW）是声明式配置：`searchFields` / `columns` / `actions` / `detail` / `events`。发布时由 `ViewCompiler` 编译为标准 form-create `{rule, option}`——与页面轨 schema 同构，运行时共用 `FormRenderer`。

**Why（对比独立 ViewRenderer）**：统一引擎只维护一套渲染器；视图"自定义事件"在运行时天然就是 rule 的 `on` 字段，无需发明新事件机制；新风格只需注册新组件，无需新增渲染器。

### D3：视图 schema 结构

```json
{
  "searchFields": [
    { "key": "name", "label": "姓名", "matchType": "like" }
  ],
  "columns": [
    { "key": "name", "label": "姓名", "width": 130, "sortable": true }
  ],
  "actions": {
    "create": true, "edit": true, "delete": true, "view": true,
    "permissions": { "create": "form:edit", "edit": "form:edit", "delete": "form:list" }
  },
  "detail": { "type": "form", "width": "640px" },
  "events": [ { "id": "evt_1", "trigger": "rowClick", "target": "mainTable", "actions": [...] } ]
}
```

### D4：双层事件机制（自定义事件）

触发器：`rowClick` / `rowDoubleClick` / `selectionChange` / `actionClick` / `beforeQuery` / `afterQuery` / `detailOpen` / `detailClose`。

| 形态 | 实现 |
|---|---|
| 声明式动作链 | 内置动作执行器：`openDetail` / `openLink` / `openCreate` / `edit` / `delete` / `refresh` / `export` / `message`；支持 `$row.xxx` / `$param.xxx` 模板变量 |
| 脚本动作（`type:"script"`） | JS 片段在 `ScriptSandbox` 执行，注入白名单上下文：`row` / `params` / `selectedRows` / `ds`（数据源 API）/ `api`（form-create api）/ `actions`（动作执行器）/ `$`（受限工具） |

脚本示例：
```js
api.setValue('detailName', row.name)
actions.openLink({ pageKey: 'leave-detail', query: { id: row.id } })
```

### D5：发布行为（不建表）

`PageDefinitionService.publish(id)`：
1. 悲观锁 + 版本管理（旧 PUBLISHED 降 ARCHIVED；schema 未变化拒绝）
2. **不调用 DynamicTableManager、不执行任何 DDL**
3. 发布校验：绑定表单存在且 `status=PUBLISHED`；VIEW 的 searchFields/columns/detail 引用列存在于 column_config；搜索字段类型校验（JSON/TEXT 列不可作搜索条件）；拒绝引用隐藏列；PAGE 校验 rule 可被 FormRenderer 解析
4. VIEW 触发编译，运行时 rule 随发布持久化

### D6：查询执行与安全

`PageQueryController`：页面已发布 → 读取 schema + 绑定表单 column_config → filter **白名单化**（只允许 schema 声明的搜索字段，防注入）→ 复用 `BizDataService` 分页过滤引擎查 `wf_biz_<formKey>`。

### D7：数据源注入（页面轨，阶段二启用）

扩展 `formCreateInject` 机制注入数据源 API 到 form-create 运行时：`query` / `detail` / `create` / `update` / `remove`，供页面内 table 等数据组件声明绑定。

> **D8 上线后的关系**：D7 的"单数据源注入"是 D8 `dataSources` 数组长度为 1 的特例——组件未显式绑定 `dataSourceId` 时默认绑定 `dataSources[0]`，语义兼容，无迁移负担。

### D8：页面级多数据源绑定（页面轨，阶段二启用）

自定义页面（type=PAGE）schema 增加顶层 `dataSources: []` 数组（与 rule/option 平级）——**绑定层**：每个条目通过 `refId` 引用全局数据源（D9 实体），并携带**页面级覆盖**（局部别名 id、searchFields/columns 白名单、默认 filter 参数）。组件以页面内 `id` 声明绑定。联动不自造布局专用逻辑（如左树右表只是一个例子），统一走页面级 `actions` 动作总线。

```json
{
  "rule": ["表格组件(dataSourceId='ds-products')", "树组件(dataSourceId='ds-cats')"],
  "option": {},
  "dataSources": [
    { "id": "ds-cats",     "refId": "ds_cat_tree_001", "searchFields": ["name"], "columns": ["id","name"] },
    { "id": "ds-products", "refId": "ds_prod_list_002", "searchFields": ["name","categoryId"], "columns": ["id","name","categoryId","price"] }
  ],
  "actions": [
    { "trigger": { "componentId": "tree", "event": "node-click" },
      "steps": [
        { "op": "set-filter", "target": "ds-products", "field": "categoryId", "value": "{node.id}" },
        { "op": "refresh",    "target": "ds-products" }
      ] }
  ]
}
```

**绑定层与全局层分离**：
- 全局层（D9 `wf_data_source`）：数据源"是什么"——类型、formKey/systemKey/apiKey、状态。一处维护、多页面复用
- 绑定层（页面 `dataSources[]`）：页面"怎么用"——局部别名、白名单、默认参数。**同一全局数据源可被不同页面以不同白名单复用**（左树右表：树用分类表 name 字段，表用商品表 name/categoryId/price 白名单）
- 发布校验：`refId` 必须指向存在且 `status=ENABLED` 的全局数据源（悬空引用 400）

**联动（通用动作总线）**：
- `trigger`：任意组件事件（node-click / row-click / selection-change / button-click…）
- `steps`：动作链，目标统一引用页面内数据源 `id`（`set-filter` / `refresh` / `set-value` / `open-detail` / `call-api`…）
- 复杂联动（多数据源交叉、条件逻辑）走 ScriptSandbox 脚本兜底，脚本上下文含 `registry`（全部已注册数据源）与 `actions`
- 联动动作对数据源的过滤同样受该数据源 `searchFields` 白名单约束（左树右表的 `categoryId` 过滤必须已声明）

**发布校验（集中遍历一次）**：
- `dataSources`：页面内 `id` 唯一、`refId` 非空且命中 D9 全局数据源（存在且 ENABLED）
- FORM 类全局数据源：formKey 对应表单已发布；searchFields/columns 引用列存在于 column_config；拒绝隐藏列、JSON/TEXT 列不作搜索条件
- rule 中数据组件 `dataSourceId` 必须命中绑定层 `dataSources[].id`（否则 400）
- `actions` 引用的 componentId / target 必须存在
- 不建表承诺不变（发布链路单测断言无 DDL）

### D9：全局数据源管理（独立管理模块）

新增 `wf_data_source` 实体 + 独立管理界面（DataSourceListPage），与页面轨解耦、独立生命周期。

```sql
CREATE TABLE IF NOT EXISTS wf_data_source (
    id          VARCHAR(64)  NOT NULL PRIMARY KEY,
    tenant_id   VARCHAR(64)  NOT NULL,
    name        VARCHAR(255) NOT NULL,
    `type`      VARCHAR(32)  NOT NULL,             -- FORM / SYSTEM / API
    form_key    VARCHAR(255),                      -- type=FORM：绑定业务表单
    source_key  VARCHAR(255),                      -- type=SYSTEM/API：注册表 key
    `params`    LONGTEXT,                          -- type=API：静态参数 JSON
    status      VARCHAR(32)  NOT NULL DEFAULT 'DRAFT',  -- DRAFT / ENABLED / DISABLED
    created_by  VARCHAR(50),
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_ds_tenant_name (tenant_id, name),
    INDEX idx_ds_tenant_type (tenant_id, `type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='全局数据源（业务表单/系统结构/第三方API）';
```

**类型（来源多态）**：

| type | 说明 |
|---|---|
| `FORM` | 绑定已发布业务表单（`formKey`）；多表单页面的主体。发布校验要求 formKey 存在且表单已发布 |
| `SYSTEM` | 系统结构（`sourceKey`：dept-tree / user-tree 等，一期固定枚举注册表，无 CRUD） |
| `API` | 第三方 API（`sourceKey` + `params`）；一期仅预留适配器接口，不实装查询 |

**生命周期与规则**：
- CRUD 独立于页面：创建 → DRAFT；编辑任意状态；启用 ENABLED（校验 type 必填项合法）；禁用 DISABLED（不影响已发布页面运行，但阻止新页面绑定/重新发布引用它）
- 状态机：`DRAFT ⇄ ENABLED ⇄ DISABLED`；删除仅允许 DRAFT（ENABLED/DISABLED 需先禁用再删，避免页面引用悬空）
- **不建表**：数据源管理只登记元数据，不触发任何 DDL
- 命名唯一：tenant 内 name 唯一，作为设计器下拉的显示标识
- API 适配器一期只做接口预留（`DataSourceAdapter` SPI），不实现真实请求——页面绑定 API 数据源可保存，但查询时返回"数据源类型未启用"错误

**Why 独立模块（对比页面内联）**：
- 多页面复用同一份数据源配置（尤其 API 的鉴权参数、SYSTEM 的注册 key）——一处维护而非每页拷贝
- 数据源是比页面更底层、更稳定的资产，独立生命周期（禁用不影响已发布页面灰度回退）
- 设计器下拉选择已有数据源，降低页面配置门槛（无需每次记住 formKey）

## Risks / Trade-offs

| 风险 | 对策 |
|---|---|
| form-create 渲染非表单组件（布局组件 props/响应式兼容） | 页面组件库先行 Spike 验证（阶段二）；视图编译仅用已验证组件 |
| 视图编译 → rule 映射面广、规则复杂 | ViewCompiler 集中管理映射；编译产物快照可预览（ViewDesigner 预览按钮） |
| 脚本沙箱安全（视图脚本若开启） | 白名单上下文 + 受限执行环境（iframe/Function 包装验证后选型）；视图事件脚本默认关闭、按需开启 |
| 查询 API 越权（查非本表单字段） | filter 白名单 + 后端强制绑定表单校验 |
| 多数据源校验遗漏（组件绑了不存在的 ds / 动作链引用悬空） | 发布校验集中遍历 dataSources + rule + actions 一次完成；单测覆盖悬空引用失败路径 |
| 联动过滤绕过白名单（树节点值直接注入右表查询） | 联动动作的 set-filter 字段亦须命中目标数据源 searchFields；后端按 ds-id 校验 filter |
| 与 BizDataListPage 并存期定位混淆 | 页面轨上线后 BizDataListPage 保留为兼容入口，新页面引导使用 PageRenderer |
| DDL-free 承诺被破坏（后续人误加建表逻辑） | 发布链路单测断言无 DDL 执行；代码 review 关注点 |

## Migration Plan

- 迁移脚本：`V19__create_wf_page_def.sql` 创建 `wf_page_def` 表 + `wf_data_source` 表（合并进同一次迁移，对齐 V12 模式）+ 页面管理菜单（父菜单 + 子菜单 + 按钮权限 + ROLE_ADMIN 授权）
- 纯增量：不修改现有表结构/现有 API/现有前端页面，可独立部署；数据源管理界面独立于页面轨，可先行上线
- 回滚：删除迁移 + 移除新增 API/前端页面即可（无数据迁移负担）
- 阶段一上线后，BizDataListPage 继续保留；新查询界面使用 PageRenderer

## Open Questions

- ScriptSandbox 受限执行实现选型（iframe / new Function 包装 / worker）——阶段一落地时验证
- 视图事件脚本默认开启策略——需产品确认默认关闭、按需开启
- 阶段二页面组件库首批组件清单——页面轨启动时确认
- API 数据源适配器（DataSourceAdapter SPI）的首批实现——一期仅预留接口，首个真实 API 适配器随页面轨落地