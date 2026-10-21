## ADDED Requirements

### Requirement: 动作链在产物中真执行

产物 SHALL 为 schema 中配置的按钮链、列链与组件链生成可执行 handler。按钮链从按钮事件触发，列链从列事件触发，组件链从组件事件触发；handler SHALL 按 schema 的 `type` 与 `params` 解析参数（含 `$row` 等行上下文），不得只写 manifest 而不生成执行代码。

#### Scenario: 三类动作链各执行一次

- **WHEN** 在合成页面中分别配置按钮链、列链、组件链各一条并出码
- **THEN** 在产物中触发对应事件后，每条链的副作用各发生一次
- **AND** manifest 对每条链声明与实际产物一致的实现位置

#### Scenario: 参数解析使用当前行上下文

- **WHEN** 列链接收到某一行数据并引用 `$row.<字段>`
- **THEN** handler 使用该行的真实字段值
- **AND** 不把 `BizDataVO` 外层包装当作业务字段

### Requirement: 事件脚本出码为普通函数

配置为 `type=script` 的事件脚本 SHALL 出成产物内的普通函数，不得依赖 `new Function`、`eval` 或运行时字符串求值，以满足小程序等目标端的限制。脚本可用的上下文 API SHALL 显式声明；无法在产物中提供的能力 SHALL 进入 unsupported 报告，不得静默失效。

#### Scenario: 脚本读写表单字段

- **WHEN** 按钮事件脚本读取并修改表单字段后出码并触发
- **THEN** 字段值按脚本逻辑变化
- **AND** 产物中不存在 `new Function` 或 `eval`

#### Scenario: 不支持的脚本 API 如实报告

- **WHEN** 脚本调用了产物上下文无法提供的能力
- **THEN** 生成报告列出该脚本与缺失能力
- **AND** 不生成一条表面成功但实际无效的 handler

### Requirement: 防双执行

组件内部的动作自派发与产物 handler SHALL 二者只生效其一。产物模式 SHALL 关闭组件内部的自动派发路径，一次用户操作恰好执行一次动作链。

#### Scenario: 点击行与按钮各只触发一次

- **WHEN** 在产物中点击一行或一个配置了动作链的按钮
- **THEN** 对应副作用计数为 1
- **AND** 不出现组件内部与产物 handler 同时执行的重复调用

#### Scenario: 非产物宿主保持原行为

- **WHEN** 同一组件在未开启产物模式的宿主渲染器中使用
- **THEN** 组件仍按现有语义自行派发动作
- **AND** 页面渲染器的既有动作行为不回归

### Requirement: 动作总线触发与诚实登记

产物 SHALL 按 `trigger` 与 `source` 精确匹配总线动作；`source` 不匹配的触发不得执行该动作。没有按钮或事件承载的触发器 SHALL 保持 `not-wired` 登记并在 unsupported 中说明，不得在 manifest 中宣称已实现。关闭 `autoBroadcast` 的筛选器 SHALL NOT 自动广播，仅通过动作总线编排。

#### Scenario: 无承载按钮的触发器不假执行

- **WHEN** schema 配置了一个总线上存在但页面没有任何按钮承载的触发器
- **THEN** manifest 不对该行为指认实现位置
- **AND** 报告中出现 `not-wired` 与对应的 unsupported 条目

#### Scenario: 同源多组件按 source 精确匹配

- **WHEN** 页面有两个数据组件，动作只声明其中一个为 source
- **THEN** 另一个组件的触发不执行该动作
- **AND** source 匹配的组件触发正常执行

#### Scenario: 筛选器关闭自动广播

- **WHEN** `dash-filter` 的 `autoBroadcast` 为 false 且用户改变筛选值
- **THEN** 产物不向其他组件广播
- **AND** 若配置了 `filter-change` 动作链，则仅执行该链
