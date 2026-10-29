# uniapp-codegen-target（delta）

## ADDED Requirements

### Requirement: uni-app 第二出码目标

出码模块 SHALL 在既有 `parse → IR` 骨架上新增 `emitUniApp(IR, TargetProfile)` 第二后端，输入同一份页面 schema 与 IR。产物 SHALL 为独立可编译的 uni-app 工程：`pages.json`（按 Client 页面清单与导航生成）、`manifest.json`（按 Client build_config 生成）、`App.vue`、`pages/<key>.vue` 与移动侧运行时包 `@lc/runtime-uni`（仓库内 file 依赖）。产物 MUST NOT 依赖宿主 vite alias，MUST NOT 引入 form-create 运行时，MUST NOT 包含 `new Function`/`eval`。

#### Scenario: 对页面生成 uni-app 工程
- **WHEN** 对一个含字段控件与列表的页面定义执行 uniapp 目标出码
- **THEN** 产物包含 pages.json、manifest.json 与该页面的 .vue 文件
- **AND** 产物工程脱离宿主仓库可独立编译

#### Scenario: 产物不含运行时求值
- **WHEN** 检查任意产物源码
- **THEN** 不存在 `new Function`、`eval` 调用
- **AND** 动作与脚本逻辑均为生成期展开的普通函数

---

### Requirement: 组件映射保真口径

TargetProfile SHALL 声明组件映射与端能力矩阵，emit SHALL 按映射出码；`componentMap` SHALL 同时作为设计器契约渲染画布（`@lc/ui-mobile`）与 emit 的组件解析依据（单一事实源）：
- 字段族：input/textarea→uni-easyinput、inputNumber→uni-number-box、datePicker→uni-datetime-picker、group/subForm→块容器、select→picker/uni-data-select（multiple 与远程搜索自绘弹层）
- 列表与详情：page-list-cards→uni-card 列表 + 触底加载、page-detail→堆叠详情、page-steps→uni-steps、page-data-container→uni-popup 弹层
- **page-table SHALL 出 uni-table 简表（横向滚动），操作列 SHALL 收进「···」弹层**（用户决策）
- **fcTable SHALL 降级为纵向堆叠（放弃合并单元格语义）；tableForm SHALL 出卡片式子列表编辑器**（用户决策）
- web-only 组件（PageIframe、Excel 导入导出、树/树表族）SHALL 登记为 unsupported/丢弃并计入报告，MUST NOT 产出假挂点或静默丢失

#### Scenario: page-table 出码为 uni-table 简表
- **WHEN** 页面含 page-table 节点并以 uniapp 目标出码
- **THEN** 产物使用 uni-table 渲染数据、横向滚动可及全部列
- **AND** 行操作按钮收进「···」弹层且动作链出口真实执行

#### Scenario: web-only 组件不产出假实现
- **WHEN** 页面含 PageIframe 节点并以 uniapp 目标出码
- **THEN** 报告将其登记为 unsupported（含路径与原因）
- **AND** 产物中不存在该节点的残缺实现或无效挂点

---

### Requirement: 图表语义层映射

移动端图表 SHALL 基于 schema 的语义配置 `config = {type, dimension, measures:[{key,agg}]}` 出码：数据聚合与 option 构造逻辑（buildChartDataset/buildPieDataset）SHALL 与 Web 端同源复用，渲染 SHALL 使用 Uni ECharts（lime-echart）；含图表的页面 SHALL 生成进小程序分包以规避主包体积限制。uCharts SHALL 作为性能 fallback 备选（语义层引擎无关）。

#### Scenario: 图表产物与 Web 同源构造
- **WHEN** 页面含 page-chart（type=bar、dimension、measures）并以 uniapp 目标出码
- **THEN** 产物以同一聚合逻辑构造 echarts option 并由 lime-echart 渲染
- **AND** 图表页落在分包目录，主包不引入 echarts 依赖

---

### Requirement: 动作出口按端适配

uniapp 产物 SHALL 按端适配 ACTION_OPS 出口：open-link→uni.navigateTo、message→uni.showToast、list-ref 族→组件 ref 调用、container 族→产物容器段函数；移动端无对位语义的 op（如 export）SHALL 整支登记 unsupported。脚本 SHALL 以生成期编译的普通函数执行，上下文白名单校验沿用既有口径。

#### Scenario: 行点击跳转产物为 uni 路由
- **WHEN** 列表配置了 open-link 动作链并以 uniapp 目标出码
- **THEN** 产物 handler 调用 uni.navigateTo 打开目标页面
- **AND** 链参数中 $row 占位符已在生成期展开为 ctx 取值

#### Scenario: 无对位语义的动作整链拒绝
- **WHEN** 动作链包含移动端无对位的 op（export）
- **THEN** 该链整支登记 unsupported（含触发器与原因）
- **AND** 产物不挂接该事件的残缺 handler

---

### Requirement: per-target 可出码率 Gate

出码报告 SHALL 按 target（web/uniapp）分桶统计可出码率与 unsupported 明细；语料体检测试 SHALL 以 uniapp 目标基线为持续 Gate：C 保真桶 >0 或可出码率低于基线时测试 SHALL 失败。

#### Scenario: 语料体检覆盖 uniapp 目标
- **WHEN** 运行语料体检测试
- **THEN** 报告输出 web 与 uniapp 两套分桶数字
- **AND** uniapp 可出码率低于基线或 C 桶非零时测试失败

---

### Requirement: 页面根级字段族装配

uniapp 产物 SHALL 在页面根装配已登记契约的字段族节点（组件契约声明 `field` 且不属列表/容器/展示组件族）：模板挂进 `uni-forms` 载体、脚本由页面级表单后端（`model` + `errors`）承载 `v-model` 与 `:error-message`。同一页面并存容器段时，两套表单后端 MUST 各用独立声明名（MUST NOT 重复声明同一标识符）。未登记出码契约的类型 SHALL 照旧以 `lc:todo` 占位并逐节点登记 unsupported，MUST NOT 静默丢弃。

#### Scenario: 根级字段在产物中真渲染
- **WHEN** 页面根含 input 与 LookupPicker 节点并以 uniapp 目标出码
- **THEN** 产物模板含对应控件与 `uni-forms-item` 载体，且绑定到页面级表单后端字段
- **AND** manifest 中这些节点不再出现 `not-assembled` 登记

#### Scenario: 无出码契约的类型仍显式登记
- **WHEN** 页面根含未登记出码契约的类型（如 radio）并以 uniapp 目标出码
- **THEN** 产物只留 `lc:todo` 挂点注释且 manifest 逐节点登记 unsupported
- **AND** 产物中不存在该类型的残缺实现或无效挂点

---

### Requirement: 查找选择器移动端形态

`dataPicker` / `LookupPicker` SHALL 在 uniapp 目标出码为「只读触发框 + 底部弹层」形态：弹层内提供搜索与分页取数（走数据源记录接口），选中行 SHALL 按契约写回声明生效（`idField` 回写 id，`returnFields` 按 `key=被查表源字段 → value=表单目标字段` 逐项回写），清除 SHALL 清空同批目标字段。`dataPicker` 的多选上限（`maxCount`）与级联清理（`clearOnCascadeChange`）SHALL 生效；uni 首版无法对位的配置项（`allowCreate`、`detailReadonly`）SHALL 逐项登记 unsupported，MUST NOT 造无实现的入口。

#### Scenario: 选中行按契约写回表单字段
- **WHEN** LookupPicker 配置 `idField`/`returnFields` 并在产物中选中一行
- **THEN** 目标字段被写入 id 与被查表字段值（方向 key=源字段、value=目标字段）
- **AND** 清除动作把同批目标字段置空

#### Scenario: 无法对位的配置只登记
- **WHEN** dataPicker 配置 `allowCreate=true` 并以 uniapp 目标出码
- **THEN** 报告登记该配置项为 unsupported（含路径与原因）
- **AND** 产物不出现「允许新建」的假入口

---

### Requirement: dash-filter 广播联动产物化

`dash-filter` SHALL 在 uniapp 目标出码为自绘筛选栏（`date-range` / `select` / `keyword` 三形态，keyword 走防抖）；产物 SHALL 自持页面级仪表盘实例登记表，目标件挂载时上报实例、筛选变更时按 `{ field: (op, value) }` 条件对全部显式接入的目标件调用 `setFilter`（对位宿主渲染器的 dashInstances 广播语义）。条件合并 SHALL 与宿主同源：`{field: value}` 等值、`{field: {op, value}}` 显式运算符、`{field: null}` 清除，并与组件级基础 `filter` 合并后下发。未接入 `setFilter` 的组件 MUST NOT 被伪造挂接。

#### Scenario: 筛选变更广播到目标组件
- **WHEN** 页面含 dash-filter 与 dash-kpi 并以 uniapp 目标出码，运行期筛选器变更
- **THEN** 产物页面的实例登记表向目标件下发合并后的条件并触发重查
- **AND** 筛选器清除时对应字段条件被移除

#### Scenario: 无目标件时不造假联动
- **WHEN** 页面只有 dash-filter、没有任何显式接入的目标件
- **THEN** 产物不出与广播无关的伪 handler
- **AND** 筛选栏自身仍按已装配形态渲染（与宿主渲染器空实例表行为一致）
