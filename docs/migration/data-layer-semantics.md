# 数据层语义规格（Node.js + Prisma/SQLite 移植规格来源）

> Task 13-1c | 来源代码：`backend/src/main/java/com/workflow/engine/{form,datasource,page}`、`api/controller/{PageMenuController,DbSchemaController,DashboardController,MetadataProbeController}`、`api/dto`
> 范围：表单动态表、表单定义/数据、表单映射、业务数据查询（SQL 引擎）、数据源、页面定义、DB Schema 探测、看板。**不修改业务代码，纯语义盘点。**

---

## 1. 列类型映射表（form-create 控件 → 物理列类型）

### 1.1 主映射 `ColumnTypeMapper.mapComponentToColumn`（BUSINESS 表单 column_config 主路径）

| 控件类型 (rule.type) | 列类型 | 长度/精度 | 备注 |
|---|---|---|---|
| `input` | VARCHAR | 255 | |
| `textarea`, `RichText`, `richText` | TEXT | - | |
| `inputNumber` | INT；props.precision>0 → DECIMAL | DECIMAL(18, precision) | |
| `select` | JSON | - | 数组组件（走双列，见 1.2） |
| `radio` | VARCHAR | 255 | |
| `cascader` | JSON | - | 数组组件 |
| `checkbox`, `multiSelect`, `multiSelectPro` | JSON | - | 数组组件 |
| `LookupPicker` | VARCHAR | 255 | 存显示文本 |
| `DatePicker`/`datePicker` | DATE；props.type∈{datetime,datetimerange} → DATETIME | - | |
| `TimePicker`/`timePicker` | VARCHAR | 32 | |
| `switch` | TINYINT | 1 | |
| `Upload`/`upload`/`fileUpload` | JSON | - | |
| `rate` | INT | - | |
| `colorPicker` | VARCHAR | 16 | |
| `tree` | props.multiple\|\|showCheckbox → JSON；否则 VARCHAR(255) | | 数组组件（多选时） |
| `elTreeSelect` | JSON | - | 数组组件 |
| `elTransfer` | JSON | - | 数组组件 |
| `fcEditor` | TEXT | - | |
| `signaturePad` | TEXT | - | |
| `subForm` | JSON | - | 子表组件另走独立子表 |
| `slider` | props.range=true → JSON；step 为小数 → DECIMAL(18, 小数位数)；否则 INT | | |
| `userPicker`, `deptPicker`, `divider`, `groupContainer` | **null（不支持）** | | 发布校验直接拒绝 userPicker/deptPicker/divider/groupContainer/dataTable |
| 其他未知类型 | **null** | | |

### 1.2 数组组件双列映射 `mapArrayComponentToColumns`

数组组件集合：`select, checkbox, multiSelect, multiSelectPro, elTransfer, tree, elTreeSelect, cascader`。
- `<key>` **JSON** 列：存叶子 value 数组（单选为长度 1 的数组 `["x"]`）。
- `<key>_text` **VARCHAR(255)** 列：冗余显示文本（`hidden=true`，componentType=`<type>Text`，仅参与 CRUD 写入，供列表显示与模糊查询）。
- 非数组组件退回单列映射，不生成 `_text`。

### 1.3 dataPicker 双列映射 `mapPickerToColumns`

- `<key>` **TEXT**：存被引用记录 id 数组 JSON（如 `["u1","u2"]`，单选 `["u1"]`）；`pickerConfig` JSON：`{sourceFormKey, displayField, maxCount(null=不限,单选语义1)}`。
- `<key>_text` **TEXT**（hidden）：冗余显示文本数组 JSON（顺序与 id 数组一致）。
- 写入时 `BizDataSupport.resolvePickerValues`：校验 id 存在于目标表（404→400 "引用的数据不存在"）、maxCount 超限 400、生成 `_text`。

### 1.4 WORKFLOW 表单 schema 推断 `FormSchemaColumnExtractor.inferColumnType`（不建物理表，仅 metadata）

| 控件 | 推断类型 |
|---|---|
| inputNumber, rate | INT |
| inputTextarea, editor | TEXT |
| date, datetime, time, dateRange, dateTimeRange | DATETIME |
| switch, checkbox | TINYINT |
| 其他/default | VARCHAR |

schema 递归遍历：布局容器 `children`、子表单 `props.rule`、子表 `props.columns[].rule`；整体跳过 `formContainer`、`page-table`、`page-list-cards`（外部数据组件不产生列）；字段名须匹配 `^[a-zA-Z][a-zA-Z0-9_]{0,63}$`；label 取 rule.title（fallback label → field）。

### 1.5 列类型白名单与跨类变更

- 白名单（`ALLOWED_TYPES`）：`VARCHAR, TEXT, LONGTEXT, INT, DECIMAL, DATE, DATETIME, TINYINT, JSON`。
- 跨大类判定 `isCrossTypeChange`：STRING={VARCHAR,TEXT,LONGTEXT,TINYINT,JSON} / INT / DECIMAL / DATE={DATE,DATETIME}——同类内调整允许（VARCHAR 加长、DATE→DATETIME），跨类拒绝。
- 校验：VARCHAR 长度 1~255；DECIMAL 长度 1~30 且 0≤scale≤len；TINYINT 固定 (1)。

---

## 2. 动态建表 DDL 规则（DdlBuilder + DynamicTableManager）

### 2.1 表名与标识符

- 主表：`wf_biz_<formKey>`；子表：`wf_biz_<formKey>_<field>`。
- formKey / 字段 / 列名白名单：`^[a-zA-Z][a-zA-Z0-9_]{0,63}$`（字母开头，≤64）。
- 保留列名（不可作业务列）：主表 `id, tenant_id, version, created_by, created_at, updated_at`；子表另加 `biz_id, sort_no`。

### 2.2 主表 CREATE TABLE 模板

```sql
CREATE TABLE IF NOT EXISTS wf_biz_<formKey> (
    id VARCHAR(64) NOT NULL,          -- UUID(32位无连字符)，主键
    tenant_id VARCHAR(64) NOT NULL,
    <业务列...>,                       -- 子表占位字段（subColumns 非空）不生成主表列
    version INT NOT NULL DEFAULT 1,   -- 乐观锁
    created_by VARCHAR(50),
    created_at DATETIME,
    updated_at DATETIME,
    PRIMARY KEY (id)
    -- c.unique → UNIQUE KEY uk_<formKey>_<key> (tenant_id, <key>)
    -- c.indexed → INDEX idx_<formKey>_<key> (<key>)
)
```

### 2.3 子表 CREATE TABLE 模板（subMode=dedicated 独立 CRUD；embedded 内嵌 JSON 随主表往返）

```sql
CREATE TABLE IF NOT EXISTS wf_biz_<formKey>_<field> (
    id VARCHAR(64) NOT NULL,
    biz_id VARCHAR(64) NOT NULL,      -- 主表行 id
    tenant_id VARCHAR(64) NOT NULL,
    <子表业务列...>,
    sort_no INT NOT NULL DEFAULT 0,   -- 行序
    version INT NOT NULL DEFAULT 1,
    created_by VARCHAR(50), created_at DATETIME, updated_at DATETIME,
    PRIMARY KEY (id),
    KEY idx_<formKey>_<field>_biz (tenant_id, biz_id)
    -- unique → UNIQUE KEY uk_<formKey>_<field>_<key> (tenant_id, biz_id, <key>)
    -- indexed → INDEX idx_<formKey>_<field>_<key> (<key>)
)
```

### 2.4 列定义片段

`VARCHAR(len 默认255)`、`TEXT`、`LONGTEXT`、`INT`、`DECIMAL(18 默认, scale 默认0)`、`DATE`、`DATETIME`、`TINYINT(1)`、`JSON`；`required=true` 追加 `NOT NULL`。

### 2.5 ALTER 策略（ensureTable / ensureSubTable 差异变更）

对比 desired（column_config）与 existing（information_schema 归一化后）：
1. 列不存在 → `ALTER TABLE t ADD COLUMN <key> <def>`（主表随后补 UNIQUE/INDEX 的 `ADD UNIQUE INDEX / ADD INDEX`；子表 ALTER 只加列，不加索引）。
2. 已存在列：
   - 跨类类型变更 → **抛异常**（"类型跨类变更不被支持"）。
   - 收窄（VARCHAR/TINYINT 长度减小；DECIMAL len 或 scale 减小）→ **抛异常**（防截断）。
   - 定义不同（类型/长度/精度/必填变化）→ `ALTER TABLE t MODIFY COLUMN <key> <def>`。
   - 新增 unique 声明 → `ADD UNIQUE INDEX`。
3. desired 中没有的现有列 → **忽略（禁止 DROP COLUMN）**。只加不减。
4. 无变更 → 不执行。

### 2.6 information_schema 读取与类型归一（H2/MySQL 双分支）

- 表存在性/表清单：`information_schema.TABLES WHERE (TABLE_SCHEMA=DATABASE() OR 'PUBLIC') AND TABLE_TYPE='BASE TABLE'`（视图排除；Flyway 历史表在控制器层过滤）。
- 列信息：H2 走 `TABLE_SCHEMA='PUBLIC'`、COLUMN_KEY 置空（unique 不可解析）；MySQL 走 `DATABASE()`、COLUMN_KEY 含 UNI 判 unique。按 ORDINAL_POSITION 排序。
- `normalizeType`（DATA_TYPE→白名单）：varchar/character varying→VARCHAR；text/mediumtext/tinytext/clob/character large object→TEXT；longtext→LONGTEXT；int/integer/bigint/smallint/mediumint→INT；decimal/numeric→DECIMAL；date→DATE；datetime/timestamp/timestamp without time zone→DATETIME；tinyint→TINYINT；json→JSON；其余 upper() 原样。
- CHARACTER_MAXIMUM_LENGTH ≥ int 上限（CLOB/LONGTEXT）→ length=null。

### 2.7 发布触达 DDL 的调用链

`FormDefinitionService.publish`（BUSINESS 表单）：
1. 悲观锁读（findByIdForUpdate，串行化发布）。
2. 校验 schema：格式（`{rule:[...]}` 或数组）、不含不支持组件（userPicker/deptPicker/divider/groupContainer/dataTable；group/tableForm/subForm 放行走子表）。
3. 校验 dataPicker 引用：目标表单已发布 BUSINESS、displayField/columns/dependOn.sourceColumn 存在、filters 列存在且非隐藏；dataSourceId 模式跳过列级校验。
4. 解析 column_config（必填校验、DdlBuilder 规则校验、SUB_TABLE 存储模式拒绝），剔除 `page-list-cards` 组件列与外部展示字段列。
5. `tableManager.ensureTable`（columns 非空才建）；对 subColumns 非空的字段 `ensureSubTable`。
6. 旧 PUBLISHED（同 key 排除自身）→ ARCHIVED；当前记录 status=PUBLISHED、publishedVersion=version；发布 FormCreatedEvent。
7. 重复发布：与上次发布 schema 完全相同 → 400 "表单内容未变化，无需发布"。

---

## 3. 表单定义与表单数据

### 3.1 wf_form_def（FormDefinition）

| 列 | 类型 | 说明 |
|---|---|---|
| id | VARCHAR(64) PK | UUID 无连字符 |
| tenant_id | VARCHAR(64) NOT NULL | |
| name | VARCHAR(255) NOT NULL | |
| `key` | VARCHAR(255) NOT NULL | 租户内唯一（同 key 多版本行） |
| type | VARCHAR(20) NOT NULL | WORKFLOW / BUSINESS |
| column_config | LONGTEXT | 仅 BUSINESS；列映射 JSON 数组（ColumnConfig[]） |
| `schema` | LONGTEXT | form-create 规则（`{rule,option}` 或数组） |
| version | INT NOT NULL | 版本号 |
| status | VARCHAR(32) NOT NULL | DRAFT / PUBLISHED / ARCHIVED |
| process_key | VARCHAR(64) | BUSINESS 绑定流程 key（启用流程状态守卫） |
| published_version | INT | 发布时记录的版本号 |
| created_by/created_at/updated_at | | |

**版本管理**：create→version=1 DRAFT；update 原地更新（不建新版本不改状态，name/key/schema/column_config/processKey 任一非 null 即更新）；publish 原地改 PUBLISHED（同 key 其他 PUBLISHED → ARCHIVED）；delete 软删 ARCHIVED（PUBLISHED 拒绝 400 "已发布的表单不能删除"）。

### 3.2 wf_form_data（FormData）——WORKFLOW 表单数据存储（JSON 列方案）

| 列 | 类型 | 说明 |
|---|---|---|
| id | VARCHAR(64) PK | |
| tenant_id | VARCHAR(64) NOT NULL | |
| form_def_id | VARCHAR(64) NOT NULL | |
| form_version | INT NOT NULL | 保存时的表单定义版本（快照语义） |
| process_instance_id | VARCHAR(64) NULL | 发起草稿为 null |
| task_id | VARCHAR(64) NULL | |
| data_json | LONGTEXT | 表单数据 JSON（**动态表 vs JSON 列的分界：WORKFLOW=JSON 列；BUSINESS=动态物理表**） |
| is_snapshot | BOOLEAN NOT NULL | true=任务审批冻结快照（不可变）；false=当前数据（节点间传递） |
| created_by/created_at/updated_at | | |

`FormDataService` 语义：
- `save`：同 (tenant, processInstanceId, formDefId, isSnapshot=false) upsert 单条当前数据，form_version 同步为当前定义版本。
- `saveSnapshot`：每次审批新建不可变快照行。
- `saveDraft` / `findDraft` / `clearDraft`：processInstanceId 为 null 的发起页草稿，每 formDef 一条，发起成功后清除。
- 查询：按 processInstance+formDef 当前数据；按 taskId 最新快照；按 processInstance 全部/快照列表。

### 3.3 ColumnConfig（列映射配置项，column_config 数组元素 / 数据源声明列复用）

字段：`key, label, columnType, length, scale, required, unique, indexed, hidden, pickerConfig, storageMode(JSON 默认|SUB_TABLE 未实现), componentType, sortable(Boolean null=未推导), filterable(Boolean null), matchType(eq|like|range), subColumns[], subMode(embedded|dedicated)`。

---

## 4. 表单字段/流程变量映射（engine/form/mapping）

### 4.1 配置结构（NodeConfig.configJson）

```json
{
  "form": { "formDefId": "F2", "dataMappings": [{"targetField":"...","source":"form:initiator|form:<nodeId>|variable:<name>","sourceField":"..."}] },
  "variableMappings": [{"variable":"...","source":"...","sourceField":"..."}]   // 仅流程级 __PROCESS__ 节点
}
```

- `FormMappingParser`：无配置/解析失败 → 空列表 + warn（不阻断）。
- `FormMappingResolver`：按 processDefinitionId 聚合节点映射（nodeId→mappings）；流程级变量映射取 `__PROCESS__` 节点；`form:initiator` 经 InitiatorNodeResolver 定位发起节点 → 其 `form.formDefId`；`form:<nodeId>` 直接截取；`variable:*` 返回 null（调用方直读变量）。
- `FormDataMerger.merge`：节点只读聚合 → `{targetField: value}`；源缺失跳过不抛错；variable 源读 Flowable 变量；form 源读当前（非快照）data_json 字段——标量（textual/boolean/number）转字符串，其余 `node.toString()`（JSON 文本）。
- `VariableMappingWriter.write`：流程发起成功后、任务完成/驳回后触发；逐条写流程变量；源缺失跳过；form 源字段保持 JSON 原始类型（convertValue）。
- `FormMappingValidator.validate`（部署时）：targetField 必须存在于目标（本节点）表单 schema；form:* 的 sourceField 必须存在于源表单 schema；流程变量名全局唯一；节点依赖边 DFS 环检测（含 form:initiator 解析后实际节点）。schema 字段收集递归 children/props.rule/props.columns[].rule。失败抛 IllegalArgumentException（含节点与字段名）。

---

## 5. 业务数据查询（engine/form/bizdata）——三种查询模式

统一入口 `BizDataService`：覆盖短路（BizDataHandler overridesXxx 按 formKey+op，重复声明启动 fail-fast）→ 守卫（FormProcessGuard update/delete 409）→ 装饰钩子链（before/after）→ 通用委托 `BizDataSupport`。

### 5.1 模式一：单表模式（queryGeneric，默认）

- 表：`wf_biz_<formKey>`；列白名单 = column_config keys + 内置 `id, created_at, updated_at`。
- SELECT：`SELECT * FROM t WHERE tenant_id = ? [filters] [keyword] ORDER BY <sort> <ASC|DESC> [LIMIT ? OFFSET ?]`；COUNT(1) 同条件。
- 排序默认 `created_at desc`；sort 必须白名单；order ∈ {asc,desc}（默认 desc）。
- 分页：page 从 1（内部转 offset=(page-1)*size）；size>0 钳制 1..100；**size<=0 不分页取全部（跳过 LIMIT/OFFSET）**。
- keyword：keywordColumn 支持逗号分隔多列 OR LIKE（单列保持单 LIKE），列逐一白名单校验，值 `%kw%`。

### 5.2 模式二：config 模式（声明式 JOIN，queryJoinConfig）

FORM 数据源 params：`{"queryMode":"config","joins":[{alias,targetFormKey,localField,foreignField,joinField,virtualKey,label,sortable,filterable}]}`。

- SQL 形态：
```sql
SELECT m.*, <alias>.<joinField> AS <virtualKey> FROM wf_biz_<formKey> m
  LEFT JOIN wf_biz_<targetFormKey> <alias>
    ON <alias>.<foreignField> = m.<localField>        -- localField 为 JSON 列时:
    -- ON <alias>.<foreignField> = JSON_UNQUOTE(JSON_EXTRACT(m.<localField>,'$[0]'))
  WHERE m.tenant_id = ? [AND 白名单筛选] ORDER BY <ref> ASC|DESC LIMIT ? OFFSET ?
```
- JOIN 类型恒为 LEFT JOIN；主表别名固定 `m`。
- QueryColumn：主表列 `ref="m."+key`（默认全 sortable/filterable=true）；虚拟列 `ref=alias+"."+joinField`（能力取 join 声明，类型取目标表单 joinField 列类型，fallback VARCHAR）。内置列 ref=`m.<col>`。
- 保存校验（JoinSqlGenerator.validate / DataSourceDefinitionService）：alias 匹配 `[a-zA-Z][a-zA-Z0-9_]{0,63}`（service 端 `[a-zA-Z_][a-zA-Z0-9_]*`）且唯一；targetFormKey 表单存在且物理表存在；localField/foreignField/joinField/label 必填；virtualKey 唯一且不与主表列冲突。
- 行映射 `toJoinVO`：主表 toVO + 虚拟列（virtualKey → joinField 值，仅非 null）。

### 5.3 模式三：sql / visual 模式（管理员 SQL 模板，querySqlTemplate / querySqlRaw）

FORM 或 SQL 数据源 params：`{"queryMode":"sql"|"visual","query":"SELECT ...","columns":[{key,label,columnType,sortable,filterable,...}],"params":["startTime"]}`。

- 保存校验 `SqlTemplateEngine.validate`：仅 SELECT（大小写不敏感前缀）；columns 非空；每声明列 key 必须出现在 SELECT 输出列/别名（`*` 通配跳过）；`:tenantId` **可选**（包含则运行时绑定租户；平台基础表无 tenant_id 时不强制）；其余 `:name` 占位符必须在 params 白名单内（参数名匹配 `[a-zA-Z_][a-zA-Z0-9_]*`）。
- 包裹执行 `SqlTemplateEngine.wrap` → `SqlQueryEngine.wrapSubquery`：
```sql
SELECT * FROM (<管理员SQL>) _qs [WHERE <白名单筛选>] [ORDER BY <声明列> ASC|DESC] LIMIT ? OFFSET ?
SELECT COUNT(*) FROM (<管理员SQL>) _qs [WHERE <白名单筛选>]
```
- 参数顺序：内层参数（:tenantId、白名单运行时参数按出现顺序）→ 筛选参数 → 分页参数（仅 select）。缺运行时参数/未声明占位符 → 400。
- 外层筛选/排序/关键词仅允许声明列中 filterable/sortable=true 的列（key=子查询输出列名）；默认排序=第一个可排序列 desc，全部不可排序则不加 ORDER BY。
- visual 模式：`VisualSqlGenerator.generate` 在保存侧把 `VisualQueryRequest` 翻译为 SQL 文本：`SELECT <selectColumns> FROM <mainTable> <mainAlias> [<joinType 默认 LEFT JOIN>] <targetTable> <alias> ON <on> WHERE <mainAlias>.tenant_id = :tenantId [AND <column> <op> ?] ORDER BY ...`（joinType/on 为声明字符串，安全性依赖探测与执行白名单）。
- SQL 数据源执行走 `querySqlRaw`（绕过绑定表单的 covering handler）；SQL 行映射 `toSqlVO`：保留全部输出列（可含聚合），列名大小写不敏感对齐声明 key（未匹配转小写，消除 H2 大写规范化），剔除 version/created_at/updated_at/tenant_id。

### 5.4 条件操作符全集（filter 协议，三种模式共用）

filter 为 JSON 字符串，两种格式：
- 旧格式：`{"col": value}` → 等值 AND（JSON 列 → JSON_CONTAINS）。
- 结构化：`{"logic": "AND"|"OR", "conditions": [{"column":"c","op":"eq","value":v}]}`（fragments 括号包裹，按 logic 连接）。

| op | 普通列 | JSON 数组列 | value 缺失行为 |
|---|---|---|---|
| eq（默认） | `col = ?` | `JSON_CONTAINS(col, ?)`（值序列化 JSON 片段 `"v"`） | 跳过该条件 |
| ne | `col <> ?` | `NOT JSON_CONTAINS(col, ?)` | 跳过 |
| like | `col LIKE '%v%'` | 同普通列 | 跳过 |
| in | `col IN (?,?,...)` | `JSON_OVERLAPS(col, ?)`（候选集序列化 `["a","b"]`） | 非数组/空跳过 |
| range | `(col >= ? AND col <= ?)`（value 为长度 2 的数组，两端均非 null） | 同普通列 | 不满足跳过 |
| isempty | `(col IS NULL OR col = '')` | 同 | 忽略 value |
| isnotempty | `(col IS NOT NULL AND col <> '')` | 同 | 忽略 value |
| 其他 | **抛 400 "非法筛选运算符"** | | |

filter JSON 非法 → 400 "筛选参数 filter 格式非法"。列未声明/不可筛 → 400。

### 5.5 通用 CRUD（动态表）

- create：必填校验（label 报错）→ 非字符串值序列化 JSON 字符串（serializeJsonColumns）→ dataPicker `_text` 生成 → INSERT（id/tenant_id/version=1 + 白名单列，值参数化）→ 子表行批量写（≤100 行，sort_no 0..n）→ 重新 findById 返回（防钩子回写后 version 过期）。
- update：乐观锁 `WHERE id=? AND tenant_id=? AND version=?`，`SET ... , version = version + 1, updated_at = NOW()`；affected=0 → 查行区分 404 / 409 "数据已被他人修改，请刷新后重试"；子表行 diff（有 id 且变化→UPDATE+sort_no；新行剥离客户端 id→INSERT；缺失→IN DELETE）。
- delete：级联删子表行（同事务）→ `DELETE ... WHERE id=? AND tenant_id=?`；affected=0 → 404。
- data filterData：静默忽略系统列（id/tenant_id/version）与未知字段。
- toVO：仅 column_config 列；JSON 列反序列化（失败原样返回，兼容旧逗号串）；embedded 子表行按 sort_no 附加；version/createdAt/updatedAt 系统字段进 BizDataVO。

### 5.6 SPI

- `BizDataHandler`：按 formKey 注册；beforeCreate/afterCreate/beforeUpdate/beforeDelete 装饰；overridesCreate/Update/Delete/Query 覆盖接管（同 (formKey,op) 重复覆盖启动抛错）。
- `FormProcessGuard`：appliesTo + checkBeforeUpdate/checkBeforeDelete（不通过 409）。覆盖路径不自动执行守卫。
- 引用解析：`resolveByFormKey`/`resolveDisplayTexts`（id→displayField 值；displayField 缺省取第一个非隐藏无 pickerConfig 列）；`countReferencedBy`（扫描 BUSINESS column_config 的 dataPicker pickerConfig.sourceFormKey → {count, referencedBy[]}）。

---

## 6. SqlMetadataProbe 移植规格（精确行为步骤）

端点：`POST /api/v1/data-sources/explore-sql {sql}` → `ColumnMeta[]`。

1. **空校验**：sql null/blank → 400 "SQL 不能为空"。
2. **预处理**：trim；去掉尾部单个 `;`。
3. **语句类型**：前 6 字符大小写不敏感必须为 `SELECT`，否则 400 "仅支持 SELECT 查询"。
4. **单语句**：正则 `(?is).*;(\s*)(FROM|UPDATE|DELETE|INSERT|DROP|ALTER|CREATE|TRUNCATE).*` 命中 → 400 "仅支持单条 SELECT 查询"。
5. **尾随行注释剥离** `stripTrailingLineComment`：找最后一个 `--`；其后（同行内）无内容且左侧未转义 `'` 与 `"` 计数均为偶数 → 截断；注释后有换行内容 → 保留。
6. **占位符置 NULL** `bindPlaceholdersNull`（引号感知单遍扫描）：
   - 进入 `'...'`（支持 `''` 转义）/`"..."`/`` `...` `` 后逐字符复制直到配对引号，不替换内部内容；
   - 引号外裸 `?` → `NULL`；
   - 引号外 `:` 后跟字母 → 消费 `[A-Za-z0-9_]+` 整体替换为 `NULL`（`:tenantId` 与 `:name` 一视同仁——探测只读元数据，不依赖参数值，不返回数据行）。
7. **LIMIT 1 兜底**：若尾部已匹配 `LIMIT n` / `LIMIT n,m` / `FETCH FIRST n ROWS ONLY`（大小写不敏感）则原样；否则追加 ` LIMIT 1`。（Task 10 注：不再包裹 `SELECT * FROM (...) _probe LIMIT 1` 派生表——H2 派生表列名需唯一，JOIN+SELECT * 会报 Duplicate column；顶层执行允许重复标签，且对 ORDER BY/UNION 兼容。）
8. **执行**：PreparedStatement 执行完整 SQL，只读 `ResultSetMetaData`（不消费行）；读元数据失败 → 400 "读取列元数据失败: ..."。
9. **列映射** `mapColumns`：key=label（`getColumnLabel`）；类型 `normalizeType`：VARCHAR/CHAR→VARCHAR；LONGVARCHAR/CLOB→TEXT；LONGNVARCHAR/NCLOB→LONGTEXT；INTEGER/INT/BIGINT/SMALLINT/TINYINT→INT；DECIMAL/NUMERIC→DECIMAL；DATE→DATE；TIMESTAMP/DATETIME→DATETIME；BOOLEAN/BIT→TINYINT；**default→VARCHAR**（null→VARCHAR）；precision/scale 为 0 → null；nullable = isNullable != columnNoNulls。
10. **错误转 400 中文** `describeRootCause`：cause 链下探（≤10 层）→ 截断 H2 调试尾巴 `; SQL statement:` → 去尾部 `-- [42121]`/`-- [42121-240]` 错误码标注 → 超 220 字符截断 → 空则 "执行异常，请检查 SQL" → 关键词追加自助指引：
    - `duplicate column name` → +"。JOIN 时请显式列出所需列或加别名，避免 SELECT *"
    - `table not found` → +"。平台表使用大写表名（如 WF_FORM_DEF），业务表 wf_biz_* 在表单发布后生成"（keywordHit 支持对象名夹在关键词中间的 H2 消息形态，如 `Table "X" not found`）
    - `column not found` → +"。请核对列名，可在表/字段下拉中查看"
    - `syntax error` → +"。请检查 SQL 关键字与标点"
    整体 400 "SQL 执行失败：<msg>"。
11. 探测阶段**不强制** `:tenantId`（可能尚未完善；只读元数据无行流出）。

API 探测对照：`POST /explore-api` → HttpLogicExecutor 拉 page=1&size=1 样例，找响应中第一个数组节点，取首元素对象字段推断类型（textual→VARCHAR、integral→INT、floating→DECIMAL、boolean→TINYINT、array/object→JSON、null→VARCHAR），length/scale 为 null、nullable=true。

---

## 7. 数据源（engine/datasource）

### 7.1 类型枚举与 wf_data_source 表

| 列 | 说明 |
|---|---|
| id / tenant_id / name(租户内唯一) / form_key / source_key(租户内唯一) / form_id | 基础字段 |
| type | `FORM`（业务表单底表）/ `WORKFLOW`（工作流表单数据聚合，只读）/ `SYSTEM`（系统结构 dept-tree/user-tree）/ `API`（外部 REST）/ `SQL`（管理员 SQL/可视化查询） |
| params | LONGTEXT JSON（FORM 自动生成端点 + queryMode 段；API 操作配置；SQL query/columns/params） |
| status | DRAFT → ENABLED ⇄ DISABLED（API/SQL 创建即 ENABLED） |
| created_by/created_at/updated_at | |

- FORM/WORKFLOW 恒等约束：sourceKey ≡ formKey（entity PrePersist/PreUpdate 兜底反向填充）。
- 状态机：任意状态可删除，但被页面引用时拒绝（PageDefinition.dataSourceId 列 + PAGE schema `dataSources[].refId`，并集；ARCHIVED 页面引用不算）。
- 用户不能直接创建/编辑数据源（仅系统内部：表单事件、迁移器、SQL/可视化配置链路）。
- FORM/SYSTEM params 自动生成：FORM → `list/get/create/update/delete → /api/v1/biz-data/<formKey>[/{id}]`（parse=records、totalParse=total）；SYSTEM → `list → /api/v1/internal/system/<internalKey>`（dept-tree→dept-tree，user-tree→users）。FORM 带 queryMode 段时与生成端点合并（仅覆盖 queryMode/joins/query/columns/params 五个字段）。

### 7.2 InternalDataSourceRouter（internal:// allowlist，SSRF-safe）

- FORM（及有 formKey 的 SQL）→ BizDataController：`/api/v1/biz-data/<formKey>` list/get/create/update/delete。
- SYSTEM：dept-tree 仅 list/create/delete；user-tree 仅 list/get/create/delete；未知 sourceKey → 400。
- 无 formKey 的 SQL → 虚拟端点（仅租户上下文验证）。
- API 类型不走 router（external://，HttpLogicExecutor 直连，超时 10s，重试 0）。

### 7.3 元数据结构 DataSourceMetadata / ColumnMeta

- `DataSourceMetadata { columns: ColumnConfig[], writable: boolean, formKey: string|null }`。
- 各类型 metadata：
  - FORM：`getBusinessColumnsByKey`（PUBLISHED BUSINESS 的 column_config）+ config 模式追加虚拟列 / sql 模式追加声明列（key 冲突跳过）→ SortableResolver → writable=true。
  - WORKFLOW：`WorkflowFormDataQueryService.columnsFor`（最新 PUBLISHED schema 提取业务列）→ writable=false（数据中另有 5 系统列：instanceId/processStatus/initiatorName/startTime(DATETIME,可排)/currentNodeName，但不出现在 metadata）。
  - SYSTEM：固定列（dept：id/parentId/label/code；user：id/username/nickname/orgId/orgName/status(TINYINT)），全部 sortable=false。
  - API：params.columns；writable=params 声明了 create/update/delete。
  - SQL：params.columns（单一来源）；writable=绑定了 formKey（行级 CRUD 走 bizDataService）。
- `ColumnMeta(key, label, columnType, length, scale, nullable)`：探测结果统一返回。

### 7.4 SortableResolver

未显式标注 sortable 的列按规则填充（已标注不覆盖）：JSON/TEXT 类型、colorPicker 组件、含 subColumns → 不可排；其余（数值/日期/短文本）→ 可排。

### 7.5 初始化与同步

- `SystemDataSourceInitializer`（@PostConstruct）：在租户 `system` 下幂等创建两个 SYSTEM 数据源——`dept-tree`（部门树数据源）、`user-tree`（用户树数据源），ENABLED，createdBy=system。
- `DataSourceSyncListener`（事件）：FormCreatedEvent → BUSINESS→创建 FORM 数据源（name=`<表单名> 数据源`，ENABLED）、WORKFLOW→创建 WORKFLOW 数据源；FormUpdatedEvent → 同步改名；FormDeletedEvent → 删除对应数据源。
- `ViewDataSourceMigrator`（ApplicationRunner，幂等）：扫描 `type=VIEW AND formKey 非空 AND dataSourceId 为空` 页面 → 绑定表单为 PUBLISHED BUSINESS 时复用/创建 `<表单名> 数据源`（FORM，ENABLED）并回填 dataSourceId；逐页独立事务，失败不影响启动。

### 7.6 查询/写入分发（UnifiedDataSourceAdapter）

- query：FORM → router.resolve("list") + config?queryJoin : sql?querySql : query；WORKFLOW → WorkflowFormDataQueryService（native SQL：`wf_form_data f LEFT JOIN ACT_HI_PROCINST h`，`JSON_UNQUOTE(JSON_EXTRACT(f.data_json,'$.<列>')) = :filter`，keyword 同理 `LIKE CONCAT('%',:kw,'%')`，数值列排序先 `CAST(... AS DECIMAL(20,2)/SIGNED)`；每实例一行、排除快照/无实例行）；SYSTEM → 部门树扁平化 / 用户分页；API → HTTP（parse/totalParse 路径取数）；SQL → querySqlRaw（visual 或 sql 模式），缺配置 400。
- 写：FORM/SQL(绑定 formKey) → bizDataService CRUD；WORKFLOW 只读（400 "工作流表单数据源为只读…"）；SYSTEM delete 仅审计路由后拒绝；API → HTTP 操作。
- 所有访问要求 status=ENABLED（400 "数据源未启用，无法访问"）；无适配器 400 "数据源类型未启用"。

---

## 8. 页面定义（engine/page）

### 8.1 wf_page_def（PageDefinition）

id / tenant_id / name / `key`(租户内唯一) / type(VIEW|PAGE) / form_key(遗留) / data_source_id(新协议) / `schema`(LONGTEXT) / version / status(DRAFT|PUBLISHED|ARCHIVED) / published_version / created_by/at/updated_at。

### 8.2 版本与发布

- 同表单：create DRAFT v1 → update 原地 → publish（findByIdForUpdate 悲观行锁 + 同 key 进程内锁，防双 PUBLISHED）→ delete 软删（PUBLISHED 拒绝）。
- 发布：内容未变化拒绝（schema 语义比较——剔除编译产物键 rule/option 后 JSON 比对）；VIEW → validateForPublish + resolveBindColumns + ViewCompiler.compile，产物 `{rule, option[, display]}` 合并进 schema 持久化；PAGE 仅基础校验不编译。
- 预览：DRAFT VIEW 动态编译（内存合并，不持久化）。

### 8.3 ViewCompiler（声明 → 编译产物）

输入声明 schema：`{searchFields[], columns[], sortableFields[], pagination{show,pageSize,pageSizes}, filter, actions{create,edit,delete,view}, detail, events, display}`。
- searchFields → 查询条件 rule：matchType eq/like → input；range → datePicker(datetimerange, valueFormat=yyyy-MM-dd HH:mm:ss) 或双数字输入；未知 matchType 400；引用列校验。
- columns → el-table table rule；sortableFields → 顶层白名单数组；pagination 缺省 {show:true, pageSize:20, pageSizes:[10,20,50]}（非正整数 400）；actions/detail/events → 对应 rule/option。

### 8.4 PageValidator

- VIEW：dataSourceId（新协议，取数据源 metadata 列）或遗留 formKey（须 PUBLISHED BUSINESS 表单 column_config）至少其一；searchFields 列存在、非隐藏、非 JSON/TEXT/LONGTEXT；columns 存在（custom=true 跳过）、非隐藏。
- PAGE（阶段二）：dataSources[] id 唯一、refId 指向存在且 ENABLED 数据源；rule 中数据组件（page-table、page-tree）dataSourceId 命中 dataSources[].id；actions set-filter 字段命中目标数据源 searchFields。

### 8.5 PageAccessGuard

按路径 `/page/<pageKey>` 查 sys_menu（is_deleted=0）：无关联菜单 → 404（不暴露存在性）；启用菜单的 permission 权限码 OR 任一通过 → 放行；全部无权限 → 403；admin 自动放行。

### 8.6 挂载/探测/看板端点

- `PageMenuController`：`POST /api/v1/pages/{id}/mount-menu`（仅 PUBLISHED；创建 sys_menu：path=/page/<key>、component=page/PageRenderer、permission=page:read:<key>、sortOrder=0、status=1；当前用户为 admin 时自动授权 ROLE_ADMIN）；`GET /{key}/menus`（按 path 反查未删菜单）；`DELETE /menus/{menuId}`（软删 is_deleted=1）。
- `DbSchemaController`：`GET /api/v1/data-sources/db/tables`（全部 BASE TABLE，排除 flyway_schema_history）；`GET /tables/{table}/columns`（information_schema 列信息，表不存在返回 []）。供 SQL 数据源可视化配置（主表/JOIN 目标/字段下拉）对齐真实库结构。
- `DashboardController`：`GET /api/v1/dashboard/stats?userId=` → Flowable 实时统计：todoCount/doneCount（我的待办/已办）、runningCount（进行中）、definitionCount（最新版本流程定义）、startedByMeCount、trend（近 7 日发起趋势）、statusShare{running, finished}。

---

## 9. 关键 DTO 字段（api/dto）

| DTO | 字段 |
|---|---|
| `BizDataQueryRequest` | filter(JSON 字符串：旧 `{col:v}` 或结构化 `{logic,conditions[{column,op,value}]}`)、keyword、keywordColumn(逗号多列)、sort、order(asc/desc)、params(JSON 字符串，sql 模式白名单运行时参数)、page(默认1)、size(默认20；≤0=不分页取全部) |
| `BizDataVO` | id、data(Map，业务字段不含系统列)、version、createdAt、updatedAt |
| `BizDataPageVO` | records、total、page、size |
| `VisualQueryRequest` | mainTable、mainAlias、joins[{alias,targetTable,joinType,on,columns}]、selectColumns[]、where[{column,op,value}]、orderBy[{column,order}]、params[] |
| `ColumnMeta` (record) | key、label、columnType、length、scale、nullable |
| `DataSourceMetadata` | columns(ColumnConfig[])、writable、formKey |
| `DataSourceSaveRequest` | name、type、formKey、sourceKey、params |
| `PageDefinitionSaveRequest` | name、key、type、formKey、dataSourceId、schema |

---

## 10. SQLite 方言适配注意点（H2 MODE=MySQL → SQLite/Prisma）

### 10.1 类型映射建议

| H2/MySQL 类型 | SQLite 建议 | 说明 |
|---|---|---|
| VARCHAR(n)≤255 | TEXT | SQLite 不强制长度；n 移到应用层校验（或 CHECK(length(x)<=n)） |
| TEXT / LONGTEXT | TEXT | 同一类型 |
| INT | INTEGER | |
| DECIMAL(p,s) | NUMERIC 或 INTEGER(分单位) | SQLite NUMERIC 即 REAL 亲和，p/s 不强制；金额类建议应用层定点处理 |
| DATE / DATETIME | TEXT（ISO-8601 'YYYY-MM-DD[ HH:MM:SS]'） | 字典序=时间序，范围比较/排序安全 |
| TINYINT(1) | INTEGER (0/1) | |
| JSON | TEXT | JSON 函数处理；列类型名可写 JSON（NUMERIC 亲和）但无语义 |
| id/tenant_id VARCHAR(64) | TEXT | UUID 无连字符字符串 |

### 10.2 动态 DDL 引擎必须重写的行为

1. **information_schema 不可用** → 表存在性：`SELECT name FROM sqlite_master WHERE type='table' AND name=?`；表清单：sqlite_master 全表（需自行过滤 sqlite 内部表/迁移表）；列信息：`PRAGMA table_info(<table>)`（name/type/notnull/pk/dflt_value）——ColumnInfo 归一化需把 SQLite 亲和类型（INTEGER/TEXT/REAL/NUMERIC/BLOB）映射回白名单。
2. **ALTER 受限**：SQLite 支持 `ALTER TABLE ... ADD COLUMN`（但新增 NOT NULL 列必须带 DEFAULT，且不能加 PRIMARY KEY/UNIQUE）；**没有 MODIFY COLUMN**——类型/精度变更需"建新表→INSERT SELECT→DROP→RENAME"重建（或仅应用层校验、拒绝跨类并记录不生效）；索引不能在 CREATE TABLE 内联，`ADD INDEX/ADD UNIQUE INDEX` → 独立 `CREATE [UNIQUE] INDEX idx_... ON t(cols)`（注意幂等 `IF NOT EXISTS`）。
3. DDL 在 SQLite 中是**事务性**的（无 MySQL 隐式提交）——发布流程"DDL 先于版本记录"的顺序可获得真正原子性；但注意 JdbcTemplate/Prisma 事务语义差异。
4. `CREATE TABLE IF NOT EXISTS`、`PRIMARY KEY (id)` 可保留；内联 `UNIQUE KEY name(cols)` / `KEY name(cols)` 语法必须移出。

### 10.3 SQL 函数差异（排查清单）

| H2/MySQL 用法（现代码出现处） | SQLite 等价 |
|---|---|
| `NOW()`（BizDataQueryBuilder.buildUpdate、子表 UPDATE） | `CURRENT_TIMESTAMP` 或 `datetime('now')`（注意时区/格式） |
| `CONCAT('%', :kw, '%')`（WorkflowFormDataQueryService keyword） | `'%' || :kw || '%'` |
| `IFNULL(a,b)` | SQLite 原生支持（同 COALESCE），无需改 |
| `DATE_FORMAT` | `strftime('%Y-%m-%d %H:%M:%S', col)` |
| `JSON_UNQUOTE(JSON_EXTRACT(x,'$.k'))`（JOIN/WORKFLOW 查询） | `json_extract(x,'$.k')`（SQLite 返回 SQL 值，字符串已去引号） |
| `JSON_CONTAINS(col, ?)` / `JSON_OVERLAPS(col, ?)` | **无对应**，见 10.4 |
| `CAST(x AS SIGNED)` / `CAST(x AS DECIMAL(20,2))`（WORKFLOW 数值排序） | `CAST(x AS INTEGER)` / `CAST(x AS REAL)` |
| `LIMIT n` / `LIMIT n,m` / `LIMIT ? OFFSET ?` | 均支持（`LIMIT off,cnt` 逗号形式语义同 MySQL）；`FETCH FIRST n ROWS ONLY` **不支持**（探测器需剥离/改写） |

### 10.4 JSON 过滤移植（最高风险）

filter 协议中 JSON 数组列的三个分支需用 `json_each` 重写：
- `eq`：`JSON_CONTAINS(col, '"v"')` → `EXISTS (SELECT 1 FROM json_each(col) WHERE json_each.value = json('v-JSON片段'))`
- `ne`：`NOT JSON_CONTAINS(...)` → `NOT EXISTS (...)`
- `in`：`JSON_OVERLAPS(col, '["a","b"]')` → `EXISTS (SELECT 1 FROM json_each(col) WHERE json_each.value IN (SELECT value FROM json_each('["a","b"]')))`
- 注意空数组/NULL/非 JSON 文本容错（json_each 对非法 JSON 抛错，需 `json_valid(col)` 守护或 COALESCE）。

### 10.5 锁与并发

- 发布流程的 `findByIdForUpdate`（SELECT ... FOR UPDATE 悲观行锁）**SQLite 不支持** → 需以 `BEGIN IMMEDIATE`（写事务串行化）+ busy_timeout 或应用层互斥替代；Prisma 需用 `$executeRaw`/交互式事务配合。
- SQLite 库级单写：动态表 DDL + 数据写入同事务发布时注意 SQLITE_BUSY（WAL 模式 + busy_timeout 建议）。

### 10.6 行为语义差异

- **大小写**：H2/MySQL(MODE=MySQL) 默认 ci 比较，SQLite `=` 为 BINARY 区分大小写 → 影响唯一索引（tenant_id+业务值）、keyword/筛选等值匹配；LIKE 仅 ASCII 不区分大小写。需视业务决定 COLLCATE NOCASE。
- **错误消息关键词**：SqlMetadataProbe 的中文指引关键词（duplicate column name / table not found / column not found / syntax error）需补 SQLite 形态：`no such table: X`、`no such column: X`、`UNIQUE constraint failed: t.c`、`near "...": syntax error`；`; SQL statement:` 截尾逻辑对 SQLite 不需要，但保留无害。
- **保留字/引号**：实体中 `` `key` ``、`` `schema` ``、`` `type` `` 反引号（H2/MySQL）→ SQLite 用双引号 `"key"` 或改名（`key` 在 SQLite 非严格保留但建议引用；`order/group/index/table` 类若出现在动态列名需引用——当前列白名单未排除 order/group，动态建表时注意）。
- **探测 LIMIT 1 兜底**在 SQLite 下成立；`TRAILING_LIMIT` 的 `LIMIT n,m` 分支保留，`FETCH FIRST` 分支对 SQLite 应改为剥离（SQLite 不解析）。
- **重复列标签**：顶层执行（非派生表）允许重复列名——SQLite JDBC 同样允许，但 queryForList 转.Map 时后列覆盖前列，与 H2 行为一致，无额外动作。
- `DECIMAL` 显示精度、`TINYINT` 与 BOOLEAN 的驱动映射差异需在 Prisma schema（String/Int/DateTime）层固定，避免依赖驱动类型推断。

---

## 11. 移植检查清单（速查）

- [ ] 列类型映射 1.1/1.2/1.3/1.4 四张表逐条移植（含 slider/tree/DatePicker 的 props 分支）
- [ ] DdlBuilder：表名/列名正则、保留字、白名单、收窄/跨类拒绝、只加不减
- [ ] ensureTable 差异变更 → PRAGMA 版本（ADD COLUMN / CREATE INDEX / 重建表策略）
- [ ] FormDefinition publish 事务顺序 + 悲观锁替代方案
- [ ] wf_form_data JSON 存储与快照/草稿语义（form_version 记录）
- [ ] filter 协议 7 操作符 × 普通/JSON 两分支 + 旧格式兼容
- [ ] 三种查询模式 + wrapSubquery 包裹形态 + 参数顺序
- [ ] SqlMetadataProbe 11 步行为 + 中文错误指引关键词（含 SQLite 形态）
- [ ] 数据源 5 类型 metadata/query/写能力矩阵 + internal:// allowlist
- [ ] 页面编译产物 merge/strip 语义（schemaEquals 剔除 rule/option）
- [ ] PageMenuController 的 sys_menu 挂载字段（path/component/permission 约定）
- [ ] DashboardController（Flowable 统计）在 Node 侧的替代数据来源

---
*Task 13-1c 生成。语义以代码为准：column/（DdlBuilder·ColumnTypeMapper·DynamicTableManager·FormSchemaColumnExtractor）、form/（FormDefinitionService·FormDataService·mapping/*）、bizdata/（BizDataSupport·BizDataQueryBuilder·JoinSqlGenerator·SqlTemplateEngine·SqlQueryEngine·SqlMetadataProbe·FormQueryConfig）、datasource/（DataSourceDefinitionService·UnifiedDataSourceAdapter·InternalDataSourceRouter·WorkflowFormDataQueryService·SortableResolver·VisualSqlGenerator·listener/*）、page/（PageDefinitionService·ViewCompiler·PageValidator·PageAccessGuard·ViewDataSourceMigrator）。
