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

TargetProfile SHALL 声明组件映射与端能力矩阵，emit SHALL 按映射出码：
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
