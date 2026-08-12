## Implementation Plan

### Task 1: 后端表单配置解析

**步骤：**

1. 创建 `backend/src/main/java/com/workflow/api/dto/FormConfigResult.java`：
   ```java
   public class FormConfigResult {
       private String formDefId;
       private Map<String, String> fieldPermissions;
       // getters/setters
   }
   ```

2. 在 `WorkflowTaskService` 中新增 `extractFormConfig(String processDefId, String taskDefKey)` 方法：
   - 读取节点 NodeConfig（nodeId=taskDefKey），取 `form.formDefId` 和 `form.fieldPermissions`
   - 节点无 formDefId 时，读取 `__PROCESS__` 节点，取 `form.formDefId` 和 `form.fieldPermissions`
   - 都无则返回 null
   - 重构现有 `extractFormKey()` 内部调用 `extractFormConfig().getFormDefId()`

3. 编译验证：`mvn compile -pl backend`

**提交点：** `feat: 后端新增 extractFormConfig 表单配置解析`

---

### Task 2: 后端操作权限解析

**步骤：**

1. 创建 `backend/src/main/java/com/workflow/api/dto/OperationsConfig.java`：
   ```java
   public class OperationsConfig {
       private boolean allowReject = true;
       private boolean allowAddSign = false;
       private boolean allowTransfer = true;
       private boolean allowDelegate = false;
       private boolean allowForwardSign = false;
       // getters/setters
   }
   ```

2. 在 `WorkflowTaskService` 中新增 `extractOperations(String processDefId, String taskDefKey)` 方法：
   - 读取节点 NodeConfig，取 `operations` JSON
   - 解析每个字段，缺失字段用默认值
   - 节点无 operations 配置时返回全默认值

3. 编译验证：`mvn compile -pl backend`

**提交点：** `feat: 后端新增 extractOperations 操作权限解析`

---

### Task 3: 后端 TaskDetailVO 扩展

**步骤：**

1. `TaskDetailVO` 新增字段：
   ```java
   private Map<String, String> fieldPermissions;
   private OperationsConfig operations;
   ```

2. `WorkflowTaskService.getTaskDetail()` 中：
   - 调用 `extractFormConfig()` → 填充 `formKey`（已有）和 `fieldPermissions`（新增）
   - 调用 `extractOperations()` → 填充 `operations`

3. 编译验证：`mvn compile -pl backend`

**提交点：** `feat: TaskDetailVO 新增 fieldPermissions 和 operations 字段`

---

### Task 4: 后端发起页接口扩展

**步骤：**

1. 找到发起页加载流程定义的 DTO（`DeployedProcessDefinition` 或对应 VO），新增 `fieldPermissions` 字段

2. 在返回流程定义信息的 controller/service 中：
   - 找到 BPMN 第一个 userTask 的 taskDefKey
   - 调用 `extractFormConfig(processDefId, firstUserTaskDefKey)` → 填充 `formDefId` 和 `fieldPermissions`

3. 编译验证：`mvn compile -pl backend`

**提交点：** `feat: 发起页接口返回 fieldPermissions`

---

### Task 5: 后端单元测试

**步骤：**

1. 在 `WorkflowTaskServiceDetailTest`（或新建测试类）中添加测试：
   - `extractFormConfig_节点配置表单_返回节点配置`
   - `extractFormConfig_节点未配流程有默认_返回流程配置`
   - `extractFormConfig_都未配_返回null`
   - `extractOperations_节点完整配置_返回节点配置`
   - `extractOperations_节点部分配置_缺失字段用默认值`
   - `extractOperations_节点未配置_返回全默认值`

2. 运行测试：`mvn test -pl backend`

**提交点：** `test: 后端表单配置和操作权限解析单元测试`

---

### Task 6: 前端 FormRenderer 字段权限

**步骤：**

1. `FormRenderer.vue` 新增 prop：
   ```typescript
   fieldPermissions?: Record<string, 'EDIT' | 'VIEW' | 'HIDDEN'>
   ```

2. 在 form-create rule 加载后、实例创建前，遍历 rule 应用权限：
   ```typescript
   function applyFieldPermissions(rules: any[], permissions?: Record<string, string>): any[] {
     if (!permissions || Object.keys(permissions).length === 0) return rules
     return rules.filter(rule => {
       const perm = permissions[rule.field]
       if (perm === 'HIDDEN') return false  // 移除隐藏字段
       if (perm === 'VIEW') {
         if (!rule.props) rule.props = {}
         rule.props.disabled = true  // 只读
       }
       return true
     })
   }
   ```

3. 确保在 `formCreate.create()` 调用前应用，不可在初始化后修改

4. 验证：手动在浏览器中测试字段权限渲染

**提交点：** `feat: FormRenderer 支持字段级权限控制`

---

### Task 7: 前端 TaskDetailPage 按钮动态渲染

**步骤：**

1. `task.ts` 中 TaskDetailVO 接口新增：
   ```typescript
   fieldPermissions?: Record<string, 'EDIT' | 'VIEW' | 'HIDDEN'>
   operations?: OperationsConfig
   ```

2. 定义 `OperationsConfig` 接口：
   ```typescript
   export interface OperationsConfig {
     allowReject: boolean
     allowAddSign: boolean
     allowTransfer: boolean
     allowDelegate: boolean
     allowForwardSign: boolean
   }
   ```

3. `TaskDetailPage.vue`：
   - FormRenderer 传入 `:field-permissions="taskDetail?.fieldPermissions"`
   - 按钮区改为条件渲染：
     ```vue
     <el-button type="primary">通过</el-button>
     <el-button v-if="operations?.allowReject">驳回</el-button>
     <el-dropdown v-if="hasMoreOperations">
       <el-button>更多操作</el-button>
       <template #dropdown>
         <el-dropdown-menu>
           <el-dropdown-item v-if="operations?.allowTransfer">转办</el-dropdown-item>
           <el-dropdown-item v-if="operations?.allowDelegate">委派</el-dropdown-item>
           <el-dropdown-item v-if="operations?.allowAddSign">加签</el-dropdown-item>
           <el-dropdown-item v-if="operations?.allowForwardSign">转签</el-dropdown-item>
         </el-dropdown-menu>
       </template>
     </el-dropdown>
     ```
   - `hasMoreOperations` computed：allowTransfer || allowDelegate || allowAddSign || allowForwardSign

4. 验证：启动前后端，发起流程后到任务处理页检查按钮显示

**提交点：** `feat: TaskDetailPage 按钮按 operations 配置动态渲染`

---

### Task 8: 前端发起页字段权限

**步骤：**

1. `processDefinition.ts` 中 DeployedProcessDefinition 接口新增 `fieldPermissions` 字段

2. `ProcessStartPage.vue` 中 FormRenderer 传入 `:field-permissions="processDef?.fieldPermissions"`

3. 验证：发起页表单按字段权限渲染

**提交点：** `feat: 发起页表单应用字段权限`

---

### Task 9: 前端设计器操作配置扩展

**步骤：**

1. `designerStore.ts` 中 `NodeConfigData.operations` 新增：
   ```typescript
   allowDelegate?: boolean
   allowForwardSign?: boolean
   ```

2. `UserTaskProperty.vue` 操作 Tab 补全两个开关：
   - "允许委派" → `operations.allowDelegate`
   - "允许转签" → `operations.allowForwardSign`

3. 流程级 `ProcessConfigData.approvalPolicy` 中 `allowAddSigner` 和 `allowDelegate` 添加弃用注释

4. 验证：设计器中可配置 5 个操作开关，保存后重新打开配置保留

**提交点：** `feat: 设计器操作配置扩展为 5 个操作项`

---

### Task 10: 前端集成验证

**步骤：**

1. 完整流程验证：
   - 在设计器中配置节点表单 + 字段权限 + operations
   - 部署流程
   - 发起流程，验证发起页表单按字段权限渲染
   - 到任务处理页，验证表单按字段权限渲染、按钮按 operations 显示

2. 旧配置兼容验证：
   - 用已有流程（无 allowDelegate/allowForwardSign 配置），验证不报错，按钮按默认值显示

3. 极端场景验证：
   - 所有更多操作关闭 → 不显示下拉
   - 无表单配置 → 无表单区，按钮仍按 operations 显示

**提交点：** `test: 前端集成验证通过`

---

## 依赖关系

```
Task 1 (extractFormConfig) ─┬─→ Task 3 (TaskDetailVO) ──→ Task 5 (后端测试)
Task 2 (extractOperations) ─┘                                 ↓
Task 4 (发起页接口) ────────────────────────────────→ Task 5
                                                        ↓
Task 6 (FormRenderer) ──────────────────────→ Task 7 (TaskDetailPage) ──→ Task 10 (集成验证)
                                              ↓
                                    Task 8 (发起页)
                                              ↓
Task 9 (设计器扩展) ──────────────────────────────────────→ Task 10
```

Task 1-4 后端可并行。Task 6-9 前端可并行（Task 6 是 7/8 的前置）。Task 10 最后。
