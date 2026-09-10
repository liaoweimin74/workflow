# process-config-and-version Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复工作流平台的四个配置与版本问题：流程级操作权限总控（问题1）、转办/转签合并与委派保留（问题2）、部署变化检测 hash（问题3）、流程历史版本查看（问题5）。

**Architecture:** 后端三处核心改动——`ProcessDesignService.deploy()` 变化检测改为"改写后 XML + nodeConfigMap 整体 SHA-256"（`deployed_config_hash` 存 `wf_process_draft`）；`extractOperations` 增加流程级 `__PROCESS__` 配置叠加（AND 规则）；`OperationsConfig` 移除 `allowForwardSign` 并在 transfer 服务层补权限校验。前端：流程属性面板加操作权限总控、任务详情移除转签入口、流程列表加版本历史抽屉、设计器加只读模式。历史版本数据全复用现有存储（Flowable XML + `wf_node_config` 版本快照）。

**Tech Stack:** Spring Boot 3 / Flowable 8 / JPA / Flyway / Vue 3 / TypeScript / Element Plus / Vitest / JUnit 5

## Global Constraints

- 后端测试命令（在 `backend/` 目录）：`mvn test -Dtest=<TestClassName>`
- 前端测试命令（在 `frontend/` 目录）：`npx vitest run <path>`（全量：`npm test`）
- 前端构建：`npm run build`（含 `tsc` 类型检查，必须通过）
- 变更必须先在 worktree（`.worktrees/process-config-and-version/`）中完成
- TDD：每个功能先写失败测试，再实现，再验证
- 禁止 `@ts-ignore`、`as any`；禁止空 catch 块
- 中文注释与用户提示

---

### Task 1: 部署变化检测 hash（deploy-change-detection）

**Files:**
- Modify: `backend/src/main/java/com/workflow/engine/process/entity/ProcessDraft.java`
- Modify: `backend/src/main/java/com/workflow/engine/process/ProcessDesignService.java:193-249`
- Create: `backend/src/main/resources/db/migration/V18__add_deployed_config_hash.sql`
- Test: `backend/src/test/java/com/workflow/engine/process/ProcessDesignServiceDeployTest.java`（新建）

**Interfaces:**
- Consumes: `ProcessDraft.getDeployedXml()`（现有）、`MultiInstanceBpmnRewriter.rewrite(bpmnXml, nodeConfigMap)`（现有）、`nodeConfigRepository.findByProcessDefId(draftId)`（现有）
- Produces: `ProcessDraft.getDeployedConfigHash()/setDeployedConfigHash(String)`；`ProcessDesignService.deploy(String draftId)` 变化检测语义变更

- [ ] **Step 1: 写失败测试（hash 计算与判定）**

创建 `backend/src/test/java/com/workflow/engine/process/ProcessDesignServiceDeployTest.java`：

```java
package com.workflow.engine.process;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class ProcessDesignServiceDeployTest {

    @Autowired
    private ProcessDesignService processDesignService;

    @Test
    void 相同配置内容产生相同hash() {
        // 通过反射调用私有 computeDeployHash 验证（或将该方法设为包可见后直接调用）
        String xml = "<definitions></definitions>";
        java.util.Map<String, String> configs = new java.util.TreeMap<>();
        configs.put("node1", "{\"operations\":{\"allowTransfer\":true}}");
        configs.put("__PROCESS__", "{\"approvalPolicy\":{\"operations\":{\"allowTransfer\":true}}}");

        String hash1 = invokeComputeHash(xml, configs);
        String hash2 = invokeComputeHash(xml, configs);
        assertThat(hash1).isEqualTo(hash2);
        assertThat(hash1).hasSize(64); // SHA-256 hex
    }

    @Test
    void 配置变化导致hash变化() {
        String xml = "<definitions></definitions>";
        java.util.Map<String, String> configs = new java.util.TreeMap<>();
        configs.put("node1", "{\"operations\":{\"allowTransfer\":true}}");
        String hash1 = invokeComputeHash(xml, configs);

        configs.put("node1", "{\"operations\":{\"allowTransfer\":false}}");
        String hash2 = invokeComputeHash(xml, configs);
        assertThat(hash1).isNotEqualTo(hash2);
    }

    private String invokeComputeHash(String xml, java.util.Map<String, String> configs) {
        try {
            java.lang.reflect.Method m = ProcessDesignService.class
                    .getDeclaredMethod("computeDeployHash", String.class, java.util.Map.class);
            m.setAccessible(true);
            return (String) m.invoke(processDesignService, xml, configs);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
```

- [ ] **Step 2: 运行测试验证失败**

Run: `mvn test -Dtest=ProcessDesignServiceDeployTest`
Expected: FAIL（编译错误——`computeDeployHash` 方法不存在）

- [ ] **Step 3: 实现 hash 计算**

在 `ProcessDesignService.java` 添加私有方法：

```java
/**
 * 计算部署配置 hash：改写后 XML + 节点配置（含 __PROCESS__）整体指纹。
 * nodeConfigMap 按键排序后规范化序列化，保证相同内容 hash 一致。
 */
private String computeDeployHash(String effectiveBpmnXml, Map<String, String> nodeConfigMap) {
    try {
        TreeMap<String, String> sorted = new TreeMap<>(nodeConfigMap);
        String canonicalJson = objectMapper.writeValueAsString(sorted);
        String input = trimToNull(effectiveBpmnXml) + "|" + canonicalJson;
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
        return HexFormat.of().formatHex(hash);
    } catch (Exception e) {
        throw new RuntimeException("Failed to compute deploy hash", e);
    }
}
```

确保 `ProcessDesignService` 已注入 `ObjectMapper`（若未注入，在构造器添加参数，并在 `FlowableEngineConfig`/配置类中的 Bean 创建处传入；若类已有 `objectMapper` 字段则直接使用）。

- [ ] **Step 4: 运行测试验证通过**

Run: `mvn test -Dtest=ProcessDesignServiceDeployTest`
Expected: PASS（2 个测试）

- [ ] **Step 5: 写失败测试（deploy 判定与降级）**

在同一测试类追加：

```java
@Test
void 仅修改节点配置可部署() {
    // 准备：创建草稿并部署一次（内容 A），再修改 nodeConfig（内容 B）后部署应成功
    // 用真实 repository 数据 + Flowable（集成测试风格），或 mock draftRepository/deploy 路径
    // 断言：第二次 deploy 不抛"流程数据未变化"，且 deployedConfigHash 已更新
}

@Test
void 内容无变化时拦截() {
    // 准备：部署内容 A 后不改动再次部署
    // 断言：抛 BusinessException(400, "流程数据未变化，无需部署")
}

@Test
void 历史数据降级路径() {
    // 准备：构造 ProcessDraft（deployedConfigHash=null, deployedXml 与 effective 相同）
    // 断言：deploy 拒绝（保持旧行为）
    // 再改 XML 后：deploy 成功且写入 hash
}
```

（若集成测试成本高，可改为对 `deploy` 方法做 mock 单测：mock `draftRepository`、`nodeConfigRepository`、`repositoryService`、`multiInstanceBpmnRewriter`。）

- [ ] **Step 6: 运行测试验证失败**

Run: `mvn test -Dtest=ProcessDesignServiceDeployTest`
Expected: FAIL（deploy 逻辑未改）

- [ ] **Step 7: 实现 deploy 判定逻辑**

修改 `ProcessDesignService.deploy()`（第 208-211 行区域）：

```java
// 与上次部署内容比较：hash 为主（覆盖 XML + 配置），历史数据（hash 为空）降级比较 XML
String currentHash = computeDeployHash(effectiveBpmnXml, nodeConfigMap);
String storedHash = draft.getDeployedConfigHash();
boolean unchanged;
if (storedHash != null && !storedHash.isBlank()) {
    unchanged = storedHash.equals(currentHash);
} else {
    unchanged = Objects.equals(trimToNull(draft.getDeployedXml()), trimToNull(effectiveBpmnXml));
}
if (unchanged) {
    throw new BusinessException(400, "流程数据未变化，无需部署");
}
```

并在部署成功段（`draft.setDeployedXml(effectiveBpmnXml);` 附近）追加：

```java
draft.setDeployedConfigHash(currentHash);
```

- [ ] **Step 8: 运行测试验证通过**

Run: `mvn test -Dtest=ProcessDesignServiceDeployTest`
Expected: PASS（全部测试）

- [ ] **Step 9: 实体与迁移**

在 `ProcessDraft.java` 添加字段（放在 `deployedXml` 之后）：

```java
/** 上次部署时的配置 hash（XML + nodeConfig 整体指纹），用于部署变化检测 */
@Column(name = "deployed_config_hash", length = 64)
private String deployedConfigHash;

public String getDeployedConfigHash() { return deployedConfigHash; }
public void setDeployedConfigHash(String deployedConfigHash) { this.deployedConfigHash = deployedConfigHash; }
```

创建 `backend/src/main/resources/db/migration/V18__add_deployed_config_hash.sql`：

```sql
ALTER TABLE wf_process_draft ADD COLUMN deployed_config_hash VARCHAR(64) NULL COMMENT '上次部署时的配置hash（XML+节点配置整体指纹）';
```

- [ ] **Step 10: 回归验证**

Run: `mvn test`（backend 全量）
Expected: PASS（无回归）
Run: `git add -A && git commit -m "feat: 部署变化检测改为XML+配置整体hash"`

---

### Task 2: 操作权限解析改造（process-operation-policy + task-detail）

**Files:**
- Modify: `backend/src/main/java/com/workflow/api/dto/OperationsConfig.java:19-35`
- Modify: `backend/src/main/java/com/workflow/engine/task/WorkflowTaskService.java:901-940`
- Test: `backend/src/test/java/com/workflow/engine/task/WorkflowTaskServiceDetailTest.java`（追加测试）

**Interfaces:**
- Consumes: `OperationsConfig`（现有 4+1 字段）、`nodeConfigRepository.findByProcessDefinitionId(processDefinitionId)`（现有）、`objectMapper`（现有）
- Produces: `OperationsConfig` 移除 `allowForwardSign`；`extractOperations(String processDefinitionId, String taskDefinitionKey)` 返回流程级 AND 节点级合并结果

- [ ] **Step 1: 写失败测试（extractOperations 流程级叠加）**

在 `WorkflowTaskServiceDetailTest.java` 追加：

```java
@Test
void extractOperations_流程级关闭转办_节点级开启_结果为false() {
    // 准备：mock nodeConfigRepository.findByProcessDefinitionId 返回两条：
    //   nodeId="__PROCESS__" configJson={"approvalPolicy":{"operations":{"allowTransfer":false}}}
    //   nodeId="task1"       configJson={"operations":{"allowTransfer":true}}
    OperationsConfig result = workflowTaskService.extractOperations("procDefId", "task1");
    assertThat(result.isAllowTransfer()).isFalse();
}

@Test
void extractOperations_返回对象不包含allowForwardSign字段() {
    // 准备：节点配置含 operations.allowForwardSign=true
    // 断言：JSON 序列化结果不含 "allowForwardSign" 键
}
```

- [ ] **Step 2: 运行测试验证失败**

Run: `mvn test -Dtest=WorkflowTaskServiceDetailTest`
Expected: FAIL（叠加逻辑不存在 / allowForwardSign 字段仍在）

- [ ] **Step 3: 实现流程级叠加解析**

修改 `WorkflowTaskService.extractOperations`（第 901-918 行）：

```java
public OperationsConfig extractOperations(String processDefinitionId, String taskDefinitionKey) {
    if (processDefinitionId == null || taskDefinitionKey == null) {
        return new OperationsConfig();
    }
    try {
        List<NodeConfig> configs = nodeConfigRepository.findByProcessDefinitionId(processDefinitionId);
        // 流程级总控（__PROCESS__），未配置视为全开
        OperationsConfig processLevel = new OperationsConfig();
        boolean hasProcessLevel = false;
        for (NodeConfig nc : configs) {
            if ("__PROCESS__".equals(nc.getNodeId())) {
                OperationsConfig pc = parseOperationsFromConfig(nc.getConfigJson());
                // 从 approvalPolicy.operations 解析（注意路径不同于节点级）
                processLevel = parseProcessOperations(nc.getConfigJson());
                hasProcessLevel = true;
                break;
            }
        }
        // 节点级
        OperationsConfig nodeLevel = new OperationsConfig();
        for (NodeConfig nc : configs) {
            if (taskDefinitionKey.equals(nc.getNodeId())) {
                nodeLevel = parseOperationsFromConfig(nc.getConfigJson());
                break;
            }
        }
        if (!hasProcessLevel) {
            return nodeLevel; // 流程级全开时等价于节点级
        }
        // AND 合并
        OperationsConfig result = new OperationsConfig();
        result.setAllowReject(processLevel.isAllowReject() && nodeLevel.isAllowReject());
        result.setAllowAddSign(processLevel.isAllowAddSign() && nodeLevel.isAllowAddSign());
        result.setAllowTransfer(processLevel.isAllowTransfer() && nodeLevel.isAllowTransfer());
        result.setAllowDelegate(processLevel.isAllowDelegate() && nodeLevel.isAllowDelegate());
        return result;
    } catch (Exception e) {
        log.warn("从 NodeConfig 解析操作配置失败", e);
        return new OperationsConfig();
    }
}
```

新增私有方法（注意流程级配置路径为 `approvalPolicy.operations`，节点级为 `operations`）：

```java
/**
 * 从 __PROCESS__ 配置解析流程级操作权限（路径 approvalPolicy.operations）。
 * 未配置时返回全开默认值。
 */
private OperationsConfig parseProcessOperations(String configJson) {
    OperationsConfig result = new OperationsConfig(); // 全开默认
    try {
        JsonNode json = objectMapper.readTree(configJson);
        JsonNode ops = json.path("approvalPolicy").path("operations");
        if (ops.isObject()) {
            if (ops.has("allowReject")) result.setAllowReject(ops.get("allowReject").asBoolean());
            if (ops.has("allowAddSign")) result.setAllowAddSign(ops.get("allowAddSign").asBoolean());
            if (ops.has("allowTransfer")) result.setAllowTransfer(ops.get("allowTransfer").asBoolean());
            if (ops.has("allowDelegate")) result.setAllowDelegate(ops.get("allowDelegate").asBoolean());
        }
    } catch (Exception e) {
        log.warn("从 __PROCESS__ 解析 operations JSON 失败: {}", e.getMessage());
    }
    return result;
}
```

- [ ] **Step 4: 移除 allowForwardSign**

`OperationsConfig.java`：删除第 19-20 行（字段）、第 34-35 行（getter/setter）。同时删除 `parseOperationsFromConfig`（第 935 行）的 `allowForwardSign` 解析行。

- [ ] **Step 5: 运行测试验证通过**

Run: `mvn test -Dtest=WorkflowTaskServiceDetailTest`
Expected: PASS

- [ ] **Step 6: 全量回归 + 提交**

Run: `mvn test`
Expected: PASS（若有测试断言 allowForwardSign，同步更新）
Run: `git add -A && git commit -m "feat: 操作权限解析叠加流程级配置，移除allowForwardSign"`

---

### Task 3: 转办权限校验与多实例语义（task-transfer）

**Files:**
- Modify: `backend/src/main/java/com/workflow/api/controller/TaskController.java:157-164`
- Test: `backend/src/test/java/com/workflow/engine/task/TransferServiceTest.java`（追加）

**Interfaces:**
- Consumes: `transferService.transfer(String taskId, String fromUser, String toUser, String reason)`（现有）、`extractOperations`（Task 2 产物）、`Task` 查询（现有）
- Produces: transfer 接口在 `allowTransfer=false` 时返回 400；MI 节点转办语义由测试锁定

- [ ] **Step 1: 写失败测试（权限校验）**

在 `TransferServiceTest.java` 追加：

```java
@Test
void 节点禁止转办时接口返回400() {
    // mock extractOperations 返回 allowTransfer=false
    // 调用 controller.transfer 或 service 校验方法
    // 断言：抛 BusinessException(400) 且 taskService.setAssignee 未被调用
}
```

（若校验放在 `TaskController`，则对 controller 做 mock 测试；若放在 `TransferService`，则对 service 测试。推荐放 `TransferService`，便于复用与单测。）

- [ ] **Step 2: 运行测试验证失败**

Run: `mvn test -Dtest=TransferServiceTest`
Expected: FAIL（无校验逻辑）

- [ ] **Step 3: 实现权限校验**

在 `TransferService.transfer` 方法开头（`fromUser.equals(toUser)` 校验之后）追加：

```java
// 权限校验：节点级 AND 流程级 allowTransfer（extractOperations 已叠加）
String processDefinitionId = task.getProcessDefinitionId();
String taskDefinitionKey = task.getTaskDefinitionKey();
if (!workflowTaskService.extractOperations(processDefinitionId, taskDefinitionKey).isAllowTransfer()) {
    throw new com.workflow.common.exception.BusinessException(400, "该节点不允许转办");
}
```

（注意：`Task task` 查询需在权限校验前；`WorkflowTaskService` 通过构造器注入 `TransferService`。若形成循环依赖，改为在 `TaskController.transfer` 中校验。）

- [ ] **Step 4: 写失败测试（MI 节点转办语义）**

在 `TransferServiceTest.java` 追加：

```java
@Test
void 多实例节点转办_原办理人待办消失_目标用户获得待办() {
    // 准备：会签节点产生两个子任务（assignee=alice / bob），alice 转办给 carol
    // 断言：alice 的待办查询不含该任务
    // 断言：carol 的待办查询含该任务（同 execution）
    // 断言：bob 的任务不受影响（assignee 仍为 bob）
    // 断言：审计记录 action=transfer
}
```

- [ ] **Step 5: 运行测试验证失败**

Run: `mvn test -Dtest=TransferServiceTest`
Expected: FAIL（MI 场景未覆盖或行为不符）

- [ ] **Step 6: 确认实现（预期无需改动）**

`TransferService` 现有 `setAssignee` 逻辑已天然满足 MI 语义（类注释已声明"业务上等价于转签"）。运行测试确认通过；若测试暴露问题（如 owner 未清空），补充 `task.setOwner(null)` 修复。

- [ ] **Step 7: 运行测试验证通过 + 提交**

Run: `mvn test -Dtest=TransferServiceTest`
Expected: PASS
Run: `git add -A && git commit -m "feat: 转办增加权限校验，锁定多实例转办语义"`

---

### Task 4: 前端配置层级与操作菜单（process-operation-policy + bpmn-designer + task-detail）

**Files:**
- Modify: `frontend/src/stores/designerStore.ts`（`ProcessConfigData`、`DEFAULT_PROCESS_CONFIG`）
- Modify: `frontend/src/api/task.ts`（`OperationsConfig` 类型）
- Modify: `frontend/src/views/designer/properties/ProcessProperty.vue`
- Modify: `frontend/src/views/designer/properties/UserTaskProperty.vue`
- Modify: `frontend/src/views/process/TaskDetailPage.vue`
- Test: `frontend/src/stores/__tests__/designerStore.test.ts`（追加）

**Interfaces:**
- Consumes: `NodeConfigData.operations`（现有类型，移除 allowForwardSign）、`ProcessConfigData`（现有）
- Produces: `ProcessConfigData.approvalPolicy.operations`（4 开关）；`OperationsConfig`（前端类型，无 allowForwardSign）

- [ ] **Step 1: 写失败测试（designerStore 类型与默认值）**

在 `frontend/src/stores/__tests__/designerStore.test.ts` 追加：

```typescript
import { DEFAULT_PROCESS_CONFIG } from '@/stores/designerStore'

describe('DEFAULT_PROCESS_CONFIG', () => {
  it('approvalPolicy.operations 默认四开关全开', () => {
    const ops = DEFAULT_PROCESS_CONFIG.approvalPolicy.operations
    expect(ops.allowReject).toBe(true)
    expect(ops.allowAddSign).toBe(true)
    expect(ops.allowTransfer).toBe(true)
    expect(ops.allowDelegate).toBe(true)
    // @ts-expect-error 已移除的废弃字段不应存在
    expect(DEFAULT_PROCESS_CONFIG.approvalPolicy.allowAddSigner).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run src/stores/__tests__/designerStore.test.ts`
Expected: FAIL（类型/默认值不匹配）

- [ ] **Step 3: 更新 designerStore.ts**

在 `designerStore.ts` 的 `ProcessConfigData` 接口中：

```typescript
export interface ProcessConfigData {
  name: string
  key: string
  categoryId: string | null
  description: string
  approvalPolicy: {
    deduplication: {
      enabled: boolean
      scope: 'GLOBAL' | 'PHASE'
      action: 'AUTO_PASS' | 'SKIP' | 'ESCALATE'
    }
    allowRecall: boolean
    // 流程级操作权限总控（节点级 operations 覆盖，生效 = AND）
    operations: {
      allowReject: boolean
      allowAddSign: boolean
      allowTransfer: boolean
      allowDelegate: boolean
    }
  }
  numberRule: {
    enabled: boolean
    pattern: string
  }
}
```

`DEFAULT_PROCESS_CONFIG` 同步：移除 `allowAddSigner` / `allowDelegate`，新增 `operations: { allowReject: true, allowAddSign: true, allowTransfer: true, allowDelegate: true }`。

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run src/stores/__tests__/designerStore.test.ts`
Expected: PASS

- [ ] **Step 5: 更新 api/task.ts 类型**

`OperationsConfig` 类型移除 `allowForwardSign`（如前端类型定义在 `api/task.ts` 或 `types` 中，全局搜索 `allowForwardSign` 一并清理）。

- [ ] **Step 6: 更新 ProcessProperty.vue**

将第 33-39 行的废弃开关（允许加签 `allowAddSigner` / 允许转办 `allowDelegate`）替换为"节点操作权限"分区：

```vue
<el-divider content-position="left">节点操作权限</el-divider>

<el-form-item label="允许驳回">
  <el-switch v-model="config.approvalPolicy.operations.allowReject" @change="syncToStore" />
</el-form-item>
<el-form-item label="允许加签">
  <el-switch v-model="config.approvalPolicy.operations.allowAddSign" @change="syncToStore" />
</el-form-item>
<el-form-item label="允许转办">
  <el-switch v-model="config.approvalPolicy.operations.allowTransfer" @change="syncToStore" />
</el-form-item>
<el-form-item label="允许委派">
  <el-switch v-model="config.approvalPolicy.operations.allowDelegate" @change="syncToStore" />
</el-form-item>
```

（提示文案可注明"流程级总开关，节点级可覆盖；会签节点转办等同转签"）

- [ ] **Step 7: 更新 UserTaskProperty.vue**

在操作分区移除"允许转签"（`operations.allowForwardSign`）表单项，保留驳回/加签/转办/委派 4 项。`saveConfig()` 中的 `allowForwardSign: operations.allowForwardSign` 一行删除。

- [ ] **Step 8: 更新 TaskDetailPage.vue**

- "更多操作"下拉移除"转签"入口项
- 菜单显隐逻辑删除 `operations.allowForwardSign` 判断
- 会签节点上"转办"按钮文案保持不变（后端已等价转签）

- [ ] **Step 9: 类型检查 + 提交**

Run: `npm run build`（含 tsc）
Expected: PASS（无类型错误）
Run: `git add -A && git commit -m "feat: 前端配置层级收敛（流程级操作权限总控+移除转签入口）"`

---

### Task 5: 后端历史版本接口（process-version-history）

**Files:**
- Modify: `backend/src/main/java/com/workflow/api/controller/ProcessDefinitionController.java`
- Modify: `backend/src/main/java/com/workflow/engine/process/ProcessService.java`（新增方法）
- Create: `backend/src/main/java/com/workflow/api/dto/ProcessVersionVO.java`
- Test: `backend/src/test/java/com/workflow/api/controller/ProcessDefinitionControllerTest.java`（追加）

**Interfaces:**
- Consumes: `repositoryService.createProcessDefinitionQuery()`（现有）、`nodeConfigRepository.findByProcessDefIdAndProcessDefinitionId`（现有，需确认存在）、`EditorDTO`（现有）
- Produces: `GET /api/v1/deployed-processes/key/{key}/versions` → `List<ProcessVersionVO>`；`GET /api/v1/deployed-processes/versions/{procDefId}/editor` → `EditorDTO`

- [ ] **Step 1: 写失败测试（版本列表接口）**

在 `ProcessDefinitionControllerTest.java` 追加：

```java
@Test
void 版本列表_返回全部版本并按版本号倒序() {
    // mock repositoryService.createProcessDefinitionQuery 返回 v1/v2/v3 三条
    // 调用 GET /api/v1/deployed-processes/key/leave/versions
    // 断言：3 条记录、倒序、v3.isLatest=true、v1/v2.isLatest=false
}

@Test
void 版本列表_流程不存在返回空数组() {
    // mock 查询返回空
    // 断言：200 + 空数组
}
```

- [ ] **Step 2: 运行测试验证失败**

Run: `mvn test -Dtest=ProcessDefinitionControllerTest`
Expected: FAIL（接口 404）

- [ ] **Step 3: 创建 ProcessVersionVO**

```java
package com.workflow.api.dto;

public class ProcessVersionVO {
    private String procDefId;
    private int version;
    private String name;
    private java.util.Date deploymentTime;
    private boolean latest;

    // getter/setter 全部字段
}
```

- [ ] **Step 4: 实现版本列表接口**

在 `ProcessDefinitionController.java` 添加（注意路径与现有 `/{id}` 避免冲突，用多段路径）：

```java
@GetMapping("/key/{key}/versions")
public R<List<ProcessVersionVO>> listVersions(@PathVariable String key) {
    String tenantId = tenantProvider.getTenantId();
    List<ProcessDefinition> defs = repositoryService.createProcessDefinitionQuery()
            .processDefinitionKey(key)
            .processDefinitionTenantId(tenantId)
            .orderByProcessDefinitionVersion().desc()
            .list();
    List<ProcessVersionVO> result = new ArrayList<>();
    for (ProcessDefinition pd : defs) {
        ProcessVersionVO vo = new ProcessVersionVO();
        vo.setProcDefId(pd.getId());
        vo.setVersion(pd.getVersion());
        vo.setName(pd.getName());
        vo.setDeploymentTime(pd.getDeploymentTime());
        result.add(vo);
    }
    // latest 标记：最高版本号
    int maxVersion = defs.stream().mapToInt(ProcessDefinition::getVersion).max().orElse(-1);
    result.forEach(v -> v.setLatest(v.getVersion() == maxVersion));
    return R.ok(result);
}
```

（依赖注入 `RepositoryService` 与 `TenantProvider`，若 controller 已有则复用。）

- [ ] **Step 5: 运行测试验证通过**

Run: `mvn test -Dtest=ProcessDefinitionControllerTest`
Expected: PASS

- [ ] **Step 6: 写失败测试（版本 editor 接口）**

同一测试类追加：

```java
@Test
void 版本editor_返回该版本XML与配置快照() {
    // mock repositoryService.getProcessModel("xyz1") 返回 v1 XML
    // mock nodeConfigRepository.findByProcessDefIdAndProcessDefinitionId(draftId, "xyz1") 返回快照配置
    // 调用 GET /api/v1/deployed-processes/versions/xyz1/editor
    // 断言：bpmnXml = v1 XML、nodeConfigs 含 __PROCESS__、不含当前编辑配置
}

@Test
void 版本editor_XML读取失败返回404() {
    // mock getProcessModel 抛异常
    // 断言：响应 404
}
```

- [ ] **Step 7: 运行测试验证失败**

Run: `mvn test -Dtest=ProcessDefinitionControllerTest`
Expected: FAIL（接口 404）

- [ ] **Step 8: 实现版本 editor 接口**

```java
@GetMapping("/versions/{procDefId}/editor")
public R<EditorDTO> getVersionEditor(@PathVariable String procDefId) {
    try {
        String xml = repositoryService.getProcessModel(procDefId);
        if (xml == null) {
            return R.fail(404, "版本 BPMN XML 不存在");
        }
        // 通过 processDefinitionId 反查 draftId（ProcessDefinition 无 draftId，需用 deployId 匹配
        // 或从 NodeConfigRepository 反查存在的 processDefId）
        // 简化方案：nodeConfigRepository 提供按 processDefinitionId 查询各 draftId 的方法
        List<NodeConfig> snapshots = nodeConfigRepository.findByProcessDefinitionId(procDefId);
        Map<String, String> nodeConfigMap = snapshots.stream()
                .collect(Collectors.toMap(NodeConfig::getNodeId, NodeConfig::getConfigJson, (a, b) -> a));
        EditorDTO dto = new EditorDTO();
        dto.setBpmnXml(xml);
        dto.setNodeConfigs(nodeConfigMap);
        dto.setStatus("DEPLOYED");
        return R.ok(dto);
    } catch (Exception e) {
        log.warn("读取历史版本失败: {}", e.getMessage());
        return R.fail(404, "历史版本数据读取失败");
    }
}
```

（注：`nodeConfigRepository.findByProcessDefinitionId` 已存在——Task 2 的 `extractOperations` 使用了它；`__PROCESS__` 快照同样按 processDefinitionId 存储，直接覆盖。）

- [ ] **Step 9: 运行测试验证通过 + 提交**

Run: `mvn test -Dtest=ProcessDefinitionControllerTest`
Expected: PASS
Run: `git add -A && git commit -m "feat: 流程历史版本列表与版本编辑器接口"`

---

### Task 6: 前端历史版本查看（process-version-history）

**Files:**
- Modify: `frontend/src/api/processDefinition.ts`
- Modify: `frontend/src/views/process/ProcessListPage.vue`
- Modify: `frontend/src/views/designer/ProcessDesigner.vue`
- Modify: `frontend/src/router/index.ts`（或路由配置所在文件）
- Test: `frontend/src/views/process/__tests__/ProcessListPage.test.ts`（新建，可选）

**Interfaces:**
- Consumes: `deployedProcessApi`（现有对象）、`ProcessDesigner.vue`（现有组件）
- Produces: `deployedProcessApi.getVersions(key)`、`deployedProcessApi.getVersionEditor(procDefId)`；`ProcessDesigner.vue` 支持 `readOnly` prop

- [ ] **Step 1: 封装 API**

在 `frontend/src/api/processDefinition.ts` 的 `deployedProcessApi` 对象中添加：

```typescript
/** 流程历史版本列表（按 key） */
getVersions(key: string): Promise<R<ProcessVersion[]>> {
  return http.get(`/v1/deployed-processes/key/${key}/versions`)
},

/** 某版本的编辑器数据（XML + 配置快照） */
getVersionEditor(procDefId: string): Promise<R<EditorData>> {
  return http.get(`/v1/deployed-processes/versions/${procDefId}/editor`)
},
```

新增类型（文件顶部或同文件）：

```typescript
export interface ProcessVersion {
  procDefId: string
  version: number
  name: string
  deploymentTime: string
  isLatest: boolean
}

export interface EditorData {
  id?: string
  name?: string
  key?: string
  bpmnXml: string
  nodeConfigs: Record<string, string>
  status?: string
}
```

- [ ] **Step 2: 设计器只读模式**

`ProcessDesigner.vue` 增加 `readOnly` prop：

```vue
<script setup lang="ts">
const props = defineProps<{ readOnly?: boolean }>()
</script>
```

只读行为：
- bpmn-js 加载 XML 后禁用编辑：通过 `eventBus` 拦截或使用 viewer 模式（若项目用 `BpmnModeler`，只读时改用 `new BpmnViewer()` 或对 `modeling` 禁用）。最简实现：加载后调用 `modeler.get('eventBus').on(['element.changed'], e => e.gfx && e.gfx.hidden)` 不可靠——推荐直接实例化 `BpmnViewer`（`bpmn-js` 自带 `lib/Viewer`）替代 `BpmnModeler`，主题/样式逻辑复用
- 工具栏：`v-if="!readOnly"` 控制保存、部署、导入、撤销、重做按钮；只读时显示"返回"按钮（`router.back()` 或回流程列表）
- 节点配置加载：只读模式从 `props` 传入的 `nodeConfigs`（不调用编辑接口）

- [ ] **Step 3: 流程列表版本历史抽屉**

`ProcessListPage.vue` 操作列加"版本历史"按钮（仅对已部署流程显示），点击打开 `el-drawer`：
- 抽屉标题：流程名 + "版本历史"
- 内容：版本表格（版本号 / 部署时间 / 最新标记）
- 点击行/查看按钮 → `router.push({ path: '/workflow/designer', query: { procDefId: row.procDefId, readOnly: '1' } })`

- [ ] **Step 4: 路由接入**

路由配置新增只读设计器路由（或复用现有设计器路由，通过 query `readOnly` 切换）：

```typescript
{
  path: '/workflow/designer',
  name: 'ProcessDesigner',
  component: () => import('@/views/designer/ProcessDesigner.vue'),
  props: (route: any) => ({ readOnly: route.query.readOnly === '1' })
}
```

`ProcessDesigner.vue` 在 `readOnly` 模式挂载时：从 `route.query.procDefId` 调 `getVersionEditor`，用返回的 `bpmnXml` + `nodeConfigs` 渲染。

- [ ] **Step 5: 类型检查 + 构建**

Run: `npm run build`
Expected: PASS

- [ ] **Step 6: 提交**

Run: `git add -A && git commit -m "feat: 流程历史版本查看（抽屉+只读设计器）"`

---

## 执行顺序与依赖

1. Task 1（部署检测）→ Task 2（权限解析）→ Task 3（转办校验）——后端基础，顺序执行
2. Task 4（前端配置 UI）依赖 Task 2 的接口契约（无 allowForwardSign）
3. Task 5（版本接口）与 Task 1-3 独立，可并行
4. Task 6（版本前端）依赖 Task 5

每个 Task 独立提交，随时可单独回滚。全部完成后运行 `mvn test` + `npm run build` 全量验证。
