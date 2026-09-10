# process-center Specification

## Purpose
TBD - created by archiving change process-todo-center. Update Purpose after archive.
## Requirements
### Requirement: 已部署流程分类分组展示

流程中心页面 SHALL 按流程分类对已部署且已激活的流程定义进行分组展示。每个分类为一个可折叠区块，默认展开第一个分类，其余折叠。分类内流程以卡片形式展示，每张卡片包含：流程名称、流程图标（未配置时使用分类默认图标）、简短描述、版本号、"发起"按钮。

#### Scenario: 正常展示已部署流程

WHEN 用户访问流程中心页面
THEN 系统 SHALL 调用 `GET /api/v1/categories/tree` 获取分类树，调用 `GET /api/v1/deployed-processes?status=active` 获取已激活流程
AND 按分类分组渲染卡片，每个分类为折叠区块，默认展开第一个

#### Scenario: 已挂起流程不展示

WHEN 流程定义状态为 suspended
THEN 系统 SHALL 在流程中心列表中排除该流程定义

#### Scenario: 发起人权限过滤

WHEN 流程定义的开始事件配置了发起人权限
THEN 系统 SHALL 仅对有权限的用户展示该流程卡片

### Requirement: 流程名称搜索

流程中心页面 SHALL 在顶部提供流程名称搜索框，支持跨分类模糊匹配。搜索时所有分类 SHALL 自动展开，匹配项高亮。

#### Scenario: 搜索流程

WHEN 用户在搜索框输入关键词
THEN 系统 SHALL 调用 `GET /api/v1/deployed-processes?name=<keyword>&status=active`
AND 所有分类自动展开，展示匹配的流程卡片

#### Scenario: 无匹配结果

WHEN 搜索无匹配流程
THEN 系统 SHALL 显示空状态提示

### Requirement: 流程列表 API 筛选扩展

`GET /api/v1/deployed-processes` 端点 SHALL 支持以下可选查询参数：
- `categoryId`：按分类 ID 筛选
- `name`：按流程名称模糊搜索
- `status`：按状态筛选（active/suspended）

#### Scenario: 按分类筛选

WHEN 请求携带 `categoryId` 参数
THEN 系统 SHALL 仅返回该分类下的流程定义

#### Scenario: 按名称搜索

WHEN 请求携带 `name` 参数
THEN 系统 SHALL 返回名称包含该关键词的流程定义

#### Scenario: 按状态筛选

WHEN 请求携带 `status=active` 参数
THEN 系统 SHALL 仅返回已激活（非挂起）的流程定义

