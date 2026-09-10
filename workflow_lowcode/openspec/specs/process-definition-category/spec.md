# process-definition-category Specification

## Purpose
TBD - created by archiving change bpmn-designer-phase-1. Update Purpose after archive.
## Requirements
### Requirement: 分类 CRUD

系统 SHALL 支持对流程定义进行分类管理，提供分类的增删改查接口。

分类 SHALL 包含以下字段：名称、上级分类（支持树形结构）、排序号。

分类 SHALL 支持多级树形结构，通过 parent_id 关联。

#### Scenario: 创建分类
WHEN 用户创建一个新分类"请假流程"
AND 指定上级分类为"办公流程"
AND 排序号为 1
THEN 系统创建分类记录
AND 返回创建后的分类信息

#### Scenario: 查询分类树
WHEN 用户查询分类列表
THEN 系统返回树形结构的分类数据
AND 每个分类包含 id、name、parent_id、children 字段

#### Scenario: 修改分类
WHEN 用户修改分类名称
THEN 系统更新分类记录

#### Scenario: 删除分类
WHEN 用户删除一个没有子分类的分类
THEN 系统删除该分类记录
WHEN 用户删除一个有子分类的分类
THEN 系统拒绝删除
AND 返回错误提示"请先删除子分类"

### Requirement: 流程定义关联分类

流程定义 SHALL 支持关联一个分类，在创建和编辑流程定义时可选。

在流程设计器页面中，SHALL 显示当前流程定义的分类信息。

#### Scenario: 关联分类
WHEN 用户在创建流程定义时选择分类"请假流程"
THEN 流程定义记录关联该分类
AND 在流程定义列表中可以按分类筛选

#### Scenario: 设计中显示分类
WHEN 用户打开设计器编辑已有流程定义
THEN 工具栏中显示当前分类名称

