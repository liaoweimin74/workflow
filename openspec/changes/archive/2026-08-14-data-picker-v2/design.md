## Context

业务表单底表 v1 已落地：`FormDefinition.type=BUSINESS` + `column_config` 列映射 + 运行时受控 DDL 建表（`wf_biz_<formKey>`）+ 通用 CRUD（`BizDataService`，参数化 SQL/乐观锁/租户隔离）+ `BizDataHandler` 钩子。

data-picker v1 已实现：设计器可拖入"数据引用"组件并可视化配置（`sourceFormKey`/`displayField`/`columns`/`mode`/`returnFields`/`dependOn`）；运行时 `DataPicker.vue` 弹窗选择（搜索/分页/单多选/级联重置/回填）；存储为两列（`<key>` VARCHAR(64) 存 id + `<key>_text` VARCHAR(1024) 冗余显示文本，hidden）；后端 `resolveDisplayTexts`/`resolveByFormKey` 批量解析、CRUD 自动维护 `_text`、发布校验引用列存在性。

本变更基于对业界主流低代码平台（钉钉宜搭/明道云/简道云/飞书多维表格/Airtable/NocoDB）数据引用方案的调研，将 dataPicker 定位收敛为**纯引用派**（表单只存 id 引用，不冗余存储底表数据，`_text` 降级为展示缓存），补齐过滤条件双类型、级联保留已选值、允许新增、跳转查看、悬空降级等业界标配能力，并以轻量"引用感知"三件套缓解被引用表单被删/改列导致的悬空风险。

**约束**：
- 复用 `BizDataService.query`（级联 filter + keyword + 分页已具备）
- 复用 `DataPicker.vue`/`DataPickerConfigDialog.vue` 现状实现，增量升级
- 仅本系统业务表单数据源（外部 API 不做）
- 已发布表单 schema 向后兼容（`dependOn` 与 `filters` 双形态识别，不强制迁移）

## Goals / Non-Goals

**Goals:**
- dataPicker 定位收敛：`_text` 为展示缓存（非业务数据），显示以实时 resolve 为准
- 过滤条件升级：`filters[]` 支持固定值（static）与当前表单字段动态值（field）两类，向后兼容 `dependOn`
- 级联行为修正：条件变化后已选值默认保留，可配置清空
- 允许新增：弹窗内现场创建目标记录并自动选中 + 回填
- 跳转查看：只读态/显示文本点击跳转目标记录详情
- 悬空降级：resolve 失败编辑态标红提示、只读显示原始 id
- 引用感知三件套：被引用计数标记、删除/改列风险警告、配置弹窗目标表单增强

**Non-Goals:**
- 独立数据源管理模块（后续 feature：外部 API 数据源落地时再抽象 `dataSourceType` 枚举与分发）
- 外部 API 数据源
- 双向关联 / 聚合（rollup）/ 关联本表（自关联）/ 子表单内引用（1:N 明细）——后续阶段
- `_text` 的自动对账/定时刷新（缓存语义，不做强一致）

## Decisions

### D1. 存储语义：`_text` 降级为展示缓存

两列映射保留（`<key>` id + `<key>_text` 冗余文本），但 `_text` 的定位从"业务快照"降级为"展示缓存（非业务数据，可在未来移除）"。

- `BizDataService.resolvePickerValues` 的 CRUD 自动维护**保留**，但语义标注为"尽力而为"
- 显示优先级：**编辑态/审批页实时 resolve 优先**（`resolveDisplayTexts`，失败回退 `_text`）；**列表/只读直接用 `_text`**（性能）
- 依据：Airtable cell format V2（`[{id, name}]`）同款形态；纯引用派（NocoDB lookup 物化）亦有展示缓存先例

### D2. 过滤条件模型：`dependOn` → `filters[]`

```
"filters": [
  { "column": "dept",   "operator": "=", "valueType": "field",  "value": "dept_field" },
  { "column": "status", "operator": "=", "valueType": "static", "value": "active" }
]
```

- `operator` v2 仅支持 `=`（等值），后续按需扩展 like/in
- 运行时**归一化**：`dependOn` 等价于单条 field 型 filter（`{column: sourceColumn, operator: "=", valueType: "field", value: field}`），双形态向后兼容，优先读 `filters`
- 查询侧：全部条件合入 `BizDataService.query` 的 `filter` 参数（AND 语义）；static 值直接进 filter，field 值取当前表单字段值
- 发布校验：`filters[].column` 必须存在于目标表单 column_config（非 hidden 列）

### D3. 级联行为：保留已选值（可配置清空）

- 新增 `clearOnCascadeChange: boolean`（默认 `false`）
- `false`（默认，业界宜搭语义）：依赖字段变化 → 仅刷新选项列表，**不清空**当前选择与回填
- `true`：保持 v1 行为（清空选择 + 回填 + 刷新）
- 依据：宜搭官方文档"条件变化后，已选择的关联数据不受此限制，也不会在不满足条件的时候被清空"

### D4. 允许新增

- 选择弹窗新增"新增"按钮（配置项 `allowCreate: boolean`，默认 false）
- 点击 → 打开目标表单快速创建（内嵌渲染目标表单 schema 的创建表单，或跳转目标表单新增页）
- 提交成功 → 刷新选项列表 → **自动选中新记录** → 执行 `returnFields` 回填
- 权限：沿用 v1"能管理目标表单即能新增"（Non-Goal 行级权限）

### D5. 审批快照形态

`wf_form_data`（流程变量 JSON）中 dataPicker 值存 `{"id": "<id>", "text": "<显示文本>"}`：

- 审批归档是**流程历史**而非底表业务数据，不违反"底表不冗余"定位
- 审批页按流程变量渲染（PRD 3.12），零 join 可读
- 底表列仍为两列（id + `_text`），两者独立

### D6. 引用完整性

- create/update 校验 id 存在于目标表单（现状 400 拦截）**保留**——引用派语义要求"引用的必须真实存在"
- 目标记录事后被删 → resolve 返回缺失 → 编辑态该记录**标红提示**（"引用数据已删除"），只读态显示原始 id；列表直接用 `_text`（不感知）
- resolve 失败不阻断提交（缓存语义，非强一致）

### D7. 引用感知（轻量三件套，不建模块）

1. **被引用计数**：后端新增 `GET /api/v1/biz-data/referenced-count`，遍历全部 BUSINESS 表单 `column_config`，统计 `pickerConfig.sourceFormKey` 出现次数，返回 `{ formKey: count }` 全量映射（单次调用，量级小）
2. **删除/改列风险警告**：表单管理列表删除被引用表单 / 列配置编辑删除被引用列前，前端调 referenced-count 命中则弹确认框（"该表单被 N 个表单引用，删除后引用将无法解析"）；发布校验侧已有"引用列被删拦截"，本次补操作侧提示
3. **配置弹窗增强**：`DataPickerConfigDialog` 目标表单选择器支持关键字搜索 + 分类分组（复用表单分类）

### D8. 文件清单

```
后端：
  BizDataController.java        + GET /api/v1/biz-data/referenced-count
  BizDataService.java           + countReferencedBy (遍历 column_config 统计)
  BizDataService.java           resolvePickerValues 语义注释更新（展示缓存）
  发布校验（FormPublishValidator 或等效） + filters[].column 存在性校验
  测试                           + 引用计数/过滤条件校验/双形态兼容
前端：
  views/form/components/DataPicker.vue          filters 解析/级联保留/允许新增/跳转查看/悬空标红
  views/form/components/DataPickerConfigDialog.vue  过滤条件编辑器/目标表单增强/新增开关/级联开关
  views/form/components/DataPickerCreateDialog.vue（新）目标表单快速创建
  FormListPage.vue / BizDataListPage.vue        被引用计数徽标 + 删除确认
  api/bizData.ts                                + referencedCount
  测试                                           + filters/级联/新增交互
```

## Risks / Trade-offs

- [_text 与实时值不一致（目标记录 displayField 变化）] → 缓存语义接受；编辑态 resolve 优先自愈显示；文档标注"列表值可能滞后"
- [级联保留已选值导致所选记录不符合新条件] → 业界默认行为（宜搭）；提供 `clearOnCascadeChange` 开关兜底
- [允许新增产生低质数据] → 默认关闭，按表单开启；权限沿用"能管理目标表单即能新增"
- [referenced-count 全量统计开销] → 遍历 column_config（JSON 解析），数据量小可接受；表单发布时可选缓存
- [filters 双形态兼容复杂度] → 统一归一化到 filters 单一内部表示，`dependOn` 仅入口兼容
- [审批快照 text 冗余] → 流程历史归档语义，非底表业务数据，接受冗余换取审批页零 join

## Migration Plan

1. 无数据库结构变更（动态表，列映射规则不变）
2. 已发布表单不受影响：schema 双形态兼容，运行时归一化；`filters` 仅新配置产出
3. 后端仅新增 referenced-count 接口与校验扩展，增量向后兼容
4. 前端组件/配置弹窗增量升级；回滚时仅回退前端组件与统计接口（无破坏性变更）

## Open Questions

- 允许新增的落地形态：内嵌创建表单 vs 跳转独立页——倾向内嵌弹窗（复用在用表单渲染能力），实现时确认
- 跳转查看的目标路由：复用 BizDataListPage 详情 vs 独立详情路由——倾向复用详情
- referenced-count 是否需要租户过滤——是（同租户统计，租户隔离天然保证）
