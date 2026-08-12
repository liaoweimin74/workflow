## Context

当前系统已具备**工作流表单**完整链路：`FormDesigner.vue`（`@form-create/designer`）设计表单，schema 以 form-create 格式 `{rule, option}` 存于 `wf_form_def`（LONGTEXT）；`FormRenderer.vue`（`@form-create/element-ui`）渲染，已支持 `rule` 直传模式（不依赖流程上下文）；表单数据以 JSON 存 `wf_form_data`（含 process_instance_id / task_id / is_snapshot），由 `FormDataController` 提供保存/快照/草稿/查询 API；流程节点通过 BPMN 设计器属性 `FormPropertyTab` 绑定 formDefId + 字段权限。

**缺失能力**：不支持独立于流程的**业务表单（底表）**——即表单定义发布后成为一张可查询、可约束、可增删改查的结构化业务数据表。PRD §3.2.1 的"数据引用组件"（从业务表/表单/API 选取数据）与设计文档 §5.7 的数据源类型（TABLE/FORM/API）均依赖该能力作为数据源基础。

**约束**：
- 多租户：逻辑隔离（共享表 + tenant_id 列），全链路强制 tenant_id 过滤
- 统一设计器：不拆分独立设计器，schema 格式与组件体系复用
- 版本管理：`wf_form_def` 已有 version/published_version 机制，发布后不可改 schema
- 现有工作流表单数据零改动

## Goals / Non-Goals

**Goals:**
- 表单定义支持 `type=BUSINESS`，复用同一设计器与渲染器
- 发布业务表单时，基于 `column_config` 列映射运行时创建物理表 `wf_biz_<formKey>`
- 提供通用业务数据 CRUD API（分页查询/筛选/排序/增删改）+ 乐观锁
- 前端提供业务数据管理页（动态列表格 + 复用 FormRenderer 编辑）
- 列名/类型/长度白名单校验，动态 SQL 全参数化，杜绝注入
- 表结构变更受控（只增列/改宽/改必填/加索引，禁删列、禁类型跨类变更），变更随版本表审计

**Non-Goals:**
- data-picker 组件引用业务表单数据（v2）
- 流程完成后表单数据写回业务表（沉淀，v2）
- 子表/嵌套表单作为可查询列（v2，发布时提示移除）
- 行级权限/数据范围控制（v2，v1 仅"能管理该表单即能查全部"）
- 表结构版本回滚/数据迁移工具（v1 仅记录变更历史）
- 每租户独立建表（明确不采用，见 Decisions）

## Decisions

### D1. 统一设计器，`type` 字段区分宿主

`wf_form_def` 新增列：
- `type` VARCHAR(20) NOT NULL DEFAULT 'WORKFLOW' —— 枚举 WORKFLOW / BUSINESS，旧数据默认兼容
- `column_config` JSON NULL —— 仅 BUSINESS 使用，存列映射

`FormDefinition` 实体新增 `type`、`columnConfig` 字段；DTO 同步扩展。列表接口支持 `type` 筛选参数。

**备选**：独立设计器 —— 组件/渲染双份维护，成本翻倍，否决。

### D2. 列映射 `column_config` 结构

```json
{
  "columns": [
    { "key": "name",   "label": "姓名", "columnType": "VARCHAR", "length": 255, "scale": null, "required": true,  "unique": false, "indexed": true },
    { "key": "amount", "label": "金额", "columnType": "DECIMAL", "length": 18,  "scale": 2,    "required": true,  "unique": false, "indexed": false },
    { "key": "dept",   "label": "部门", "columnType": "VARCHAR", "length": 64,  "required": false, "unique": false, "indexed": true }
  ]
}
```

- `columnType` 白名单：VARCHAR / TEXT / INT / DECIMAL / DATE / DATETIME / TINYINT / JSON
- `length`/`scale` 按类型校验（VARCHAR≤255、TEXT 无长度、DECIMAL(18,n) 等）
- 发布时前端将 schema 字段自动生成列映射草案，用户可覆盖类型/长度/必填/唯一/索引；类型跨类变更受限（见 D4）
- 表单删除的字段：schema 移除但列保留（标记 deprecated），不删列防丢数据

### D3. 运行时受控 DDL

发布 `type=BUSINESS` 表单时，`FormDefinitionService.publish()` 内执行（事务边界外，DDL 隐式提交）：

- **建表**：`CREATE TABLE IF NOT EXISTS wf_biz_<formKey>`，固定列 `id VARCHAR(64) PK`、`tenant_id VARCHAR(64) NOT NULL`、业务列、`created_by VARCHAR(50)`、`created_at DATETIME`、`updated_at DATETIME`；`formKey` 正则白名单 `^[a-zA-Z][a-zA-Z0-9_]{0,63}$`
- **变更**：对比上一已发布版本的 `column_config` 与当前物理表信息（`information_schema` 查询），生成差异 DDL：
  - 允许：`ADD COLUMN`、`MODIFY COLUMN`（仅加宽/加 scale/改必填属性 TINYINT 标志不影响列类型）、`ADD INDEX`/`ADD UNIQUE INDEX`（`UNIQUE (tenant_id, <field>)` 复合）
  - 禁止：`DROP COLUMN`、类型跨类变更（如 VARCHAR→DECIMAL）、缩短长度/精度
- 并发安全：发布操作加分布式/应用级锁（如 `SELECT ... FOR UPDATE` on form_def 行）防并发发布竞态
- 审计：结构变更记录在 `wf_form_def` 新版本行（version 递增 + 更新 published_version），DDL 语句可回查

### D4. 组件 → 列类型映射规则

| 组件 | 列类型 | 说明 |
|---|---|---|
| 单行文本 / 下拉(单选) / 单选 | VARCHAR(n) | 默认 255，草案可调 |
| 多选 / 多选下拉 | VARCHAR(1024) | JSON 数组字符串，v1 接受不可友好查询 |
| 多行文本 / 富文本 | TEXT | |
| 数字(整数) | INT | |
| 数字(小数) | DECIMAL(18,n) | n 按组件 precision 配置，默认 2 |
| 日期 | DATE | |
| 日期时间 | DATETIME | |
| 日期范围 | 两列 `<key>_start` / `<key>_end` | DATETIME |
| 开关 | TINYINT(1) | |
| 文件上传 | JSON | 存文件列表，不可按内容查询 |
| 子表 / 嵌套表单 | —— | v1 发布时校验，存在则阻止发布并提示移除 |

映射由后端 `ColumnTypeMapper` 提供默认值，前端草案可覆盖。

### D5. 业务数据 CRUD API（新增 `BizDataController`）

```
POST   /api/v1/biz-data/{formKey}           新增一行
GET    /api/v1/biz-data/{formKey}           分页查询
GET    /api/v1/biz-data/{formKey}/{id}      详情
PUT    /api/v1/biz-data/{formKey}/{id}      更新（乐观锁 version）
DELETE /api/v1/biz-data/{formKey}/{id}      删除
```

- 动态 SQL 由 `BizDataQueryBuilder` 生成，**全部参数化（PreparedStatement）**，字段名/排序字段白名单（仅接受 `column_config` 中的 key + 内置 id/created_at/updated_at）
- 查询参数：`filter`（字段=值 集合）、`keyword`（对指定文本列 LIKE）、`sort`/`order`、`page`/`size`；强制 `tenant_id` 过滤
- 校验：必填字段校验（发布时生成的规则缓存）、唯一字段冲突检查（数据库唯一索引兜底 + 预检查友好报错）
- 乐观锁：表内置 `version INT` 列，PUT 携带 version，不一致返回 409
- 表不存在 → 404；formKey 非法 → 400

### D6. 前端

- **表单管理列表** `FormListPage.vue`：增加类型筛选（全部/工作流/业务），业务表单行可"管理数据"
- **业务数据管理页** `/biz-data/:formKey`（新增路由）：通用数据表格——列由 `column_config` 动态生成（label/宽度/对齐），支持筛选器、排序、分页、行内新增/编辑（弹窗内复用 `FormRenderer` `rule` 直传模式）/删除（确认框）
- **发布流程**：`FormDesigner.vue` 对 BUSINESS 类型在发布前弹出"列映射确认"对话框——自动映射草案展示（字段/类型/长度/必填/唯一/索引），可编辑，确认后连同发布请求提交
- 新建表单时选择类型（WORKFLOW/BUSINESS），创建后进入同一设计器

### D7. 后端模块结构（新增文件）

```
backend/src/main/java/com/workflow/
├── engine/form/
│   ├── ColumnTypeMapper.java        # 组件→列类型映射 + 白名单校验
│   ├── DdlBuilder.java              # CREATE/ALTER 语句生成（参数化元数据，无用户输入拼接）
│   ├── DynamicTableManager.java     # 建表/变更/表信息查询（information_schema）
│   └── BizDataService.java          # 业务数据 CRUD（动态 SQL + 参数化 + tenant 过滤）
├── api/
│   ├── controller/BizDataController.java
│   └── dto/ (BizDataSaveRequest, BizDataQueryRequest, ColumnConfigDTO 等)
```

## Risks / Trade-offs

- [动态 DDL 注入风险] → 列名/表名正则白名单、类型/长度枚举白名单、DDL 由后端拼接不含用户自由文本；所有 DDL 语句记录审计
- [表单改版导致表结构膨胀/删字段遗留列] → 禁止删列策略（deprecated 标记），明确写入文档与发布交互提示
- [并发发布 DDL 竞态] → 发布前对 form_def 行 `SELECT FOR UPDATE` 加锁，串行化结构变更
- [多选/文件等非标字段不可友好查询] → 文档化约束，v1 接受；列映射草案中标注"不可筛选"提示
- [动态表数量增长] → 共享表 + tenant_id 策略控制表数量（租户数 × 表单数），与逻辑隔离一致
- [发布后 schema 不可改 vs 表结构变更] → 版本机制已存在：变更走新版本 + 受控 DDL，运行中数据保留
- [动态 SQL 性能] → 参数化 + 索引（indexed 标记生成单列索引，(tenant_id, unique) 复合索引）；v1 规模足够，不做分表
- [唯一约束跨租户冲突] → 复合索引 `UNIQUE (tenant_id, field)` 从根上隔离

## Migration Plan

1. **Flyway 迁移**（`wf_form_def` 表）：`ALTER TABLE wf_form_def ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'WORKFLOW'`；`ADD COLUMN column_config JSON NULL`
2. **代码部署**：后端 + 前端同步发布
3. **回滚**：新增 API/表为增量能力，回滚不影响工作流表单既有功能；已创建的 `wf_biz_<formKey>` 表数据保留（不做删除）
4. 历史 `wf_form_def` 数据 `type` 默认 'WORKFLOW'，无需数据迁移

## Open Questions

- 列映射草案确认交互的细节（默认值展示、非法组合的即时校验）—— implementation 阶段细化
- 多选字段存储格式（JSON 数组 vs 逗号分隔）—— 默认 JSON 数组字符串
- 业务数据管理页是否需要批量导入/导出（v1 不做，列为候选）
