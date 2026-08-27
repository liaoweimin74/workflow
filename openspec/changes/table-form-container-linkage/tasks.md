## Tasks

### Task 1: 扩展DsActionBus事件和动作类型
**目标**：在DsActionBus中新增表格-容器联动的事件和动作类型

**步骤**：
1. 在DsActionBus.ts中新增事件类型定义：`row-edit`、`row-view`、`row-click`、`row-create`
2. 在DsActionBus.ts中新增动作类型定义：`open-container`、`load-record`、`save-container`、`close-container`
3. 更新DsLink接口，支持新的事件和动作类型
4. 更新DsStep接口，支持新的动作参数

**验收标准**：
- [x] DsActionBus支持注册新的事件类型
- [x] DsActionBus支持执行新的动作类型
- [x] 新增的事件和动作类型有完整的类型定义

---

### Task 2: 增强formContainer显示模式
**目标**：formContainer支持多种显示形式（弹出窗口、新开页签、页面内嵌）

**步骤**：
1. 在formContainer.js中新增displayMode配置选项
2. 实现弹出窗口显示模式（dialog）
3. 实现新开页签显示模式（newTab）
4. 实现页面内嵌显示模式（inline）
5. 支持事件流覆盖默认显示模式

**验收标准**：
- [x] formContainer支持displayMode配置
- [x] 默认使用弹出窗口显示
- [x] 弹出窗口支持配置宽度和高度
- [x] 新开页签支持配置标题
- [x] 页面内嵌支持配置高度
- [x] 事件流可以覆盖默认显示模式

---

### Task 3: 增强formContainer按钮配置
**目标**：formContainer支持默认按钮和自定义按钮配置

**步骤**：
1. 在formContainer.js中新增按钮配置选项
2. 实现默认按钮：新增、取消、确定、删除（默认隐藏）、复制（默认隐藏）
3. 实现按钮显示/隐藏配置
4. 实现自定义按钮配置
5. 实现按钮事件链配置

**验收标准**：
- [x] formContainer支持默认按钮显示
- [x] 删除和复制按钮默认隐藏
- [x] 支持配置按钮显示/隐藏
- [x] 支持配置自定义按钮
- [x] 支持配置按钮事件链

---

### Task 4: 增强PageDataTable事件触发
**目标**：PageDataTable支持触发表格-容器联动事件

**步骤**：
1. 在PageDataTable.vue中集成DsActionBus
2. 实现编辑按钮事件触发
3. 实现查看按钮事件触发
4. 实现行点击事件触发
5. 实现新增按钮事件触发

**验收标准**：
- [ ] 点击编辑按钮触发row-edit事件
- [ ] 点击查看按钮触发row-view事件
- [ ] 点击行触发row-click事件
- [ ] 点击新增按钮触发row-create事件
- [ ] 事件包含当前行数据

---

### Task 5: 实现智能数据同步
**目标**：保存后智能同步表格中的对应行数据

**步骤**：
1. 在PageRendererPage.vue中实现保存后同步逻辑
2. 根据保存返回的记录ID查找表格中的对应行
3. 如果找到，更新该行数据
4. 如果未找到，刷新整个表格

**验收标准**：
- [ ] 保存成功后自动同步表格数据
- [ ] 同步逻辑正确处理新增和更新场景
- [ ] 同步失败时有错误处理

---

### Task 6: 创建事件流配置界面
**目标**：在页面设计器中创建事件流配置界面

**步骤**：
1. 在PageDesigner.vue中扩展事件配置面板
2. 添加表格-容器联动事件配置选项
3. 添加动作配置选项
4. 支持可视化配置和JSON高级配置

**验收标准**：
- [ ] 页面设计器支持配置表格-容器联动事件
- [ ] 支持配置联动动作
- [ ] 支持可视化配置
- [ ] 支持JSON高级配置

---

## Dependencies

- Task 1 依赖：无
- Task 2 依赖：Task 1
- Task 3 依赖：Task 1
- Task 4 依赖：Task 1
- Task 5 依赖：Task 4
- Task 6 依赖：Task 1, Task 2, Task 3

## Parallelization

- Task 2 和 Task 3 可以并行执行（都依赖 Task 1）
- Task 4 可以与 Task 2、Task 3 并行执行（都依赖 Task 1）
- Task 5 依赖 Task 4，需要等待 Task 4 完成
- Task 6 依赖 Task 1、Task 2、Task 3，需要等待这些任务完成
