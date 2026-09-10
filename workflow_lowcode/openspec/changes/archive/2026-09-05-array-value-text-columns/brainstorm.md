## Design Summary

业务表单中的数组值组件（select/tree/elTreeSelect/transfer/cascader）当前存储方案存在两类缺陷：
1. **列类型随单选/多选配置漂移**：select 单选 VARCHAR、多选 JSON；elTreeSelect 单选曾 VARCHAR、多选 JSON。数据落库后再切换配置即格式错位，且 VARCHAR 存数组经后端序列化后回显异常（问题 5A/5B）。
2. **查询语义缺失**：组件存储的是 value 而非显示 label，列表显示与按 label 筛选都不可用（问题 1/4）。

本变更采用**主列统一 JSON（叶子 value 数组）+ `<key>_text` 冗余显示列**方案：
- 主列 `<key>`：JSON，叶子 value 数组（单选 `["x"]`、多选 `["x","y"]`），承担回显、精确查询（JSON_CONTAINS）、统计。
- 冗余列 `<key>_text`：显示文本，cascader 为全路径（`/` 分隔），其余组件为叶子 label；多选叶子间 `, ` 连接。承担列表显示与模糊查询（LIKE）。
- label 由**前端提交时生成**（组件渲染时持有 value→label 映射）。
- cascader 配 `emitPath: false`（值只存最下级叶子，不存路径数组）。

## Alternatives Considered

### 方案 A：主列统一 JSON（叶子 value）+ `<key>_text` 冗余显示列
- **做法**：数组组件发布时生成两列——主列 JSON 存叶子 value 数组；`<key>_text` 存显示文本（cascader 全路径 `/` 分隔，其余 label，多选 `, ` 连接）。前端提交生成 text 列。显示走 text 列，模糊查询走 text 列 LIKE，精确查询走主列 JSON_CONTAINS。
- **优点**：列类型稳定不漂移；单选/多选自由切换；显示与按 label 查询可用（text 列）；回显走 value 匹配渲染时已加载的 options。
- **缺点**：双列双写（存储冗余、options 变更后旧 label 过期——dataPicker 已接受此权衡）；需存量迁移。
- **為何未採用**：为 Agreed Approach，见下。

### 方案 B：现状混合存储 + 配置锁定
- **做法**：保持单选 VARCHAR / 多选 JSON，但发布后禁止切换单选↔多选（或切换时强制重建列/迁移）。
- **优点**：保留单选字段 VARCHAR 索引与等值/排序；改动最小。
- **缺点**：查询缺陷未解决（存 value 无法按 label 查询）；列类型仍随首次配置确定，切换受限。
- **為何未採用**：只解决了"配置漂移"，未解决"存 value 不可按 label 显示/查询"这一根本缺陷。

### 方案 C：全 JSON 单列 + MySQL JSON 查询特性
- **做法**：只存主列 JSON 数组，精确查询用 JSON_CONTAINS / `->>'$[0]'` + 生成列索引，多值索引加速包含查询。
- **优点**：单列无冗余；精确查询（等值/包含/交集）可用 MySQL JSON 特性实现。
- **缺点**：**按显示 label 模糊搜索无法用 JSON 实现**（数组内无 LIKE），仍需 text 冗余列；依赖 MySQL 8.0.17+（多值索引/JSON_OVERLAPS）；查询构建器需按列类型分支。
- **為何未採用**：精确查询与模糊查询两需求都要满足时，text 冗余列不可避免，与方案 A 重叠；方案 A 一并解决显示与模糊搜索。

## Agreed Approach

采用**方案 A**（主列统一 JSON 叶子 value 数组 + `<key>_text` 冗余显示列）。核心决策链条：

- **存储语义统一**：所有数组组件（select/tree/elTreeSelect/transfer/cascader）主列一律 JSON 存"叶子 value 数组"，单选即长度 1 的数组。列类型不再随配置漂移。
- **cascader 只存叶子**：`emitPath: false`（设计器默认），值字段不再存路径数组；text 列存全路径 `/` 分隔的显示文本（信息量最大化）。
- **冗余列承载显示与查询**：`<key>_text` 存显示文本，列表显示与模糊搜索（LIKE）走它；主列 value 走回显与精确查询（JSON_CONTAINS）。
- **前端提交生成 label**：组件渲染时持有 options（value→label 映射），提交时一并携带 `<key>_text`；后端仅落库，不做 options 解析（规避组件间 options 位置不一致与数据源反解复杂度）。

## Key Decisions

1. **列结构**：数组组件发布生成两列——`<key>` JSON（叶子 value 数组）+ `<key>_text` VARCHAR(255)（显示文本，可筛选）。
2. **cascader emitPath=false**：值只存最下级叶子 value；text 列存全路径（`/` 分隔，多选叶子间 `, `）。
3. **label 来源**：前端提交时生成（方案 A），非后端解析。
4. **显示方式**：对齐 dataPicker 双列模式——列表列 prop=主列 key，render 读 `<key>_text`，缺失回退主列 value；不新增列表列。
5. **查询**：模糊搜索走 text 列 LIKE（单选多选统一）；精确筛选走主列 JSON_CONTAINS（数组含元素）/ `->>'$[0]'`（单选）。
6. **回显**：不变——主列 value 匹配渲染时已加载的 options（`resolveOptionRules` / 静态 options）。
7. **写入链路**：前端提交预处理生成 `<key>_text`；后端 `BizDataService.create/update` 落两列。

## Open Questions

- **text 列物理类型**：VARCHAR(255)（可进 `filterableColumns` 做 LIKE）是否足够；cascader 全路径最长可达多少级需确认上限。
- **存量迁移策略**：已发布表单重新发布生成 text 列 + 主列数据按新语义回填（路径→叶子、单值→数组）的具体执行方式。
- **与 dataPicker 一致性整合**：dataPicker 已有 `<key>_text`（后端 resolvePickerValues 生成），本方案是否统一为前端生成模式，或保留 dataPicker 的后端解析。
