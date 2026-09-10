## ADDED Requirements

### Requirement: 全局铃铛组件
系统 SHALL 在全局布局导航栏右侧提供 NotificationBell 组件，显示未读消息数（红点/数字徽章），点击展开下拉面板显示最近5条消息。

#### Scenario: 显示未读数
- WHEN 用户有3条未读消息
- THEN 铃铛组件 SHALL 显示红色数字徽章"3"

#### Scenario: 下拉面板显示最近消息
- WHEN 用户点击铃铛
- THEN SHALL 展开下拉面板，显示最近5条消息的标题、摘要、时间

#### Scenario: 跳转消息中心
- WHEN 用户点击下拉面板底部"查看全部"
- THEN SHALL 路由跳转到 /messages 消息中心页面

### Requirement: 消息中心页面
系统 SHALL 提供独立消息中心页面（路由 /messages），三栏布局：左侧分类筛选 | 中间消息列表 | 右侧消息详情。

#### Scenario: 分类筛选
- WHEN 用户点击左侧"工作流"分类
- THEN 中间消息列表 SHALL 仅显示 category 为 WORKFLOW 的消息

#### Scenario: 消息列表展示
- WHEN 用户进入消息中心
- THEN SHALL 以列表形式展示消息，包含标题、摘要、时间、已读/未读状态、来源图标

#### Scenario: 批量操作
- WHEN 用户勾选多条消息并点击"全部已读"
- THEN 系统 SHALL 将选中消息标记为已读

### Requirement: 消息跳转
系统 SHALL 根据消息的 linkTemplate.type 决定跳转方式：INTERNAL → router.push、WORKFLOW_INSTANCE → /process/${id}、EXTERNAL → window.open、DEEPLINK → location.href。

#### Scenario: 流程实例跳转
- WHEN 用户点击一条 linkTemplate.type 为 WORKFLOW_INSTANCE 的消息
- THEN 前端 SHALL 路由跳转到 /process/${instanceId}

#### Scenario: 外部链接跳转
- WHEN 用户点击一条 linkTemplate.type 为 EXTERNAL 的消息
- THEN 前端 SHALL 通过 window.open 在新标签页打开链接

### Requirement: 前端模块独立
所有新增前端页面和组件 SHALL 放在 src/modules/notification/ 目录下，Pinia store 独立，不与其他模块共享状态。

#### Scenario: 模块目录隔离
- WHEN 开发消息中心页面
- THEN 文件 SHALL 位于 src/modules/notification/views/MessageCenter.vue

#### Scenario: 复用现有组件
- WHEN 实现消息列表
- SHALL 复用 src/components/business/SearchTable.vue 组件
