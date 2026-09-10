# 跨表单数据传递（form-data-mapping）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现跨表单字段映射传递：下游节点可单向只读引用上游表单字段与流程变量，表单字段可提升为流程变量驱动网关条件。

**Architecture:** 后端新增映射配置解析（FormMappingResolver）与聚合（FormDataMerger），任务详情返回 `mappedData`；`__PROCESS__` 配置声明 variableMappings 并在发起/任务完成时写入 Flowable 变量；前端 FormRenderer 接收 mappedData 预填，属性面板新增数据来源配置。存储模型（wf_form_data）与快照机制不变。

**Tech Stack:** Java 17 + Spring Boot（Flowable 8, JPA）、Vue 3 + TypeScript + form-create/element-ui、JUnit 5、Vitest。

## Global Constraints

- 映射语义：单向只读——下游保存仅 upsert 本表单，`mappedData` 不回写源表单
- source 形式：`form:initiator` / `form:<nodeId>` / `variable:<name>`
- 未配置映射的节点/流程行为不变（空聚合）
- 源数据缺失：跳过该字段，不抛错、不阻断
- 配置校验：targetField/sourceField 存在性、禁止循环引用、variable 名唯一
- 所有 Requirement 使用 SHALL 语义；测试位于 `backend/src/test/java/com/workflow/`（JUnit）与 `frontend/src/**/*.test.ts`（Vitest）
- 后端测试：`mvn test -Dtest=<Class>`（在 backend/ 下）；前端测试：`npm run test`（在 frontend/ 下）
- 参考 artifacts：`openspec/changes/form-data-mapping/design.md`（架构决策）、`specs/*/spec.md`（验收标准）

---

## Task 1: 映射配置值对象与 JSON 解析

**Files:**
- Create: `backend/src/main/java/com/workflow/engine/form/mapping/FormDataMapping.java`
- Create: `backend/src/main/java/com/workflow/engine/form/mapping/VariableMapping.java`
- Create: `backend/src/main/java/com/workflow/engine/form/mapping/FormMappingParser.java`
- Test: `backend/src/test/java/com/workflow/engine/form/mapping/FormMappingParserTest.java`

**Interfaces:**
- Produces:
  - `record FormDataMapping(String targetField, String source, String sourceField)`（Jackson 反序列化字段：targetField/source/sourceField）
  - `record VariableMapping(String variable, String source, String sourceField)`
  - `class FormMappingParser { List<FormDataMapping> parseDataMappings(String configJson); List<VariableMapping> parseVariableMappings(String configJson); }`（configJson 为 NodeConfig.configJson；无配置返回空列表）

- [ ] **Step 1: 写失败测试**

```java
class FormMappingParserTest {
    private final FormMappingParser parser = new FormMappingParser(new ObjectMapper());

    @Test
    void parsesFormDataMappings() {
        String json = "{\"form\":{\"formDefId\":\"F2\",\"dataMappings\":[" +
            "{\"targetField\":\"applicantName\",\"source\":\"form:initiator\",\"sourceField\":\"name\"}," +
            "{\"targetField\":\"auditResult\",\"source\":\"variable:gatewayResult\"}]}}";
        List<FormDataMapping> list = parser.parseDataMappings(json);
        assertEquals(2, list.size());
        assertEquals("applicantName", list.get(0).targetField());
        assertEquals("form:initiator", list.get(0).source());
        assertEquals("name", list.get(0).sourceField());
        assertNull(list.get(1).sourceField());
    }

    @Test
    void parsesVariableMappings() {
        String json = "{\"variableMappings\":[{\"variable\":\"requestAmount\"," +
            "\"source\":\"form:initiator\",\"sourceField\":\"amount\"}]}";
        List<VariableMapping> list = parser.parseVariableMappings(json);
        assertEquals(1, list.size());
        assertEquals("requestAmount", list.get(0).variable());
    }

    @Test
    void emptyWhenNoConfig() {
        assertTrue(parser.parseDataMappings("{}").isEmpty());
        assertTrue(parser.parseDataMappings(null).isEmpty());
        assertTrue(parser.parseVariableMappings("{\"form\":{\"formDefId\":\"F2\"}}").isEmpty());
    }
}
```

- [ ] **Step 2: 运行确认失败**

Run: `mvn test -Dtest=FormMappingParserTest`（在 backend/）
Expected: 编译失败（类不存在）

- [ ] **Step 3: 实现值对象与解析器**

`FormDataMapping` / `VariableMapping` 为 Java record（`targetField`、`source`、`sourceField` / `variable`、`source`、`sourceField`），可被 Jackson `treeToValue` 反序列化。

`FormMappingParser`：注入 `ObjectMapper`；`parseDataMappings` 读 `root.form.dataMappings` 数组（缺失/空返回空列表）；`parseVariableMappings` 读 `root.variableMappings` 数组；解析异常返回空列表并 `log.warn`。

- [ ] **Step 4: 运行确认通过**

Run: `mvn test -Dtest=FormMappingParserTest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/workflow/engine/form/mapping/ backend/src/test/java/com/workflow/engine/form/mapping/
git commit -m "feat: add form mapping config value objects and parser"
```

---

## Task 2: 映射解析器（按部署版本解析 + 源表单定位）

**Files:**
- Create: `backend/src/main/java/com/workflow/engine/form/mapping/FormMappingResolver.java`
- Modify: `backend/src/main/java/com/workflow/engine/form/mapping/FormMappingParser.java`（如需扩展）
- Test: `backend/src/test/java/com/workflow/engine/form/mapping/FormMappingResolverTest.java`

**Interfaces:**
- Consumes: `FormMappingParser`、`NodeConfigRepository`（`findByProcessDefinitionId(String)`）、`InitiatorNodeResolver`（`String resolve(String processDefinitionId)`）
- Produces:
  - `class FormMappingResolver { FormMappingResolver(NodeConfigRepository, InitiatorNodeResolver, FormMappingParser, ObjectMapper); Map<String, List<FormDataMapping>> resolveDataMappings(String processDefinitionId); // nodeId → mappings List<VariableMapping> resolveVariableMappings(String processDefinitionId); // __PROCESS__ 配置 String resolveSourceFormDefId(String source, String processDefinitionId, String nodeId, String processInstanceId); }`
  - `resolveSourceFormDefId` 语义：`form:initiator` → InitiatorNodeResolver 定位发起节点 → 该节点表单 formDefId（查 NodeConfig 快照 form.formDefId）；`form:<nodeId>` → 该节点表单 formDefId；`variable:*` → 返回 null（由调用方直接读变量）

- [ ] **Step 1: 写失败测试**

```java
class FormMappingResolverTest {
    // 构造 NodeConfig 快照：node UserTask_1 配 form.formDefId=F2 + dataMappings；
    // __PROCESS__ 配 form.formDefId=F0 + variableMappings；InitiatorNodeResolver 返回 "StartEvent_1"，其配置 form.formDefId=F1
    @Test
    void resolvesNodeDataMappings() {
        Map<String, List<FormDataMapping>> m = resolver.resolveDataMappings("procDef:1:uuid");
        assertTrue(m.containsKey("UserTask_1"));
        assertEquals("F2", m.get("UserTask_1").get(0).source().equals("form:initiator") ? "initiator" : m.get("UserTask_1").get(0).source());
    }

    @Test
    void resolvesProcessVariableMappings() {
        List<VariableMapping> list = resolver.resolveVariableMappings("procDef:1:uuid");
        assertEquals(1, list.size());
        assertEquals("requestAmount", list.get(0).variable());
    }

    @Test
    void resolvesInitiatorFormDefId() {
        String formDefId = resolver.resolveSourceFormDefId("form:initiator", "procDef:1:uuid", "UserTask_1", "inst1");
        assertEquals("F1", formDefId); // 发起人节点 StartEvent_1 的表单
    }

    @Test
    void variableSourceReturnsNull() {
        assertNull(resolver.resolveSourceFormDefId("variable:gatewayResult", "procDef:1:uuid", "UserTask_1", "inst1"));
    }
}
```

- [ ] **Step 2: 运行确认失败**

Run: `mvn test -Dtest=FormMappingResolverTest`
Expected: 编译失败

- [ ] **Step 3: 实现 FormMappingResolver**

`resolveDataMappings`：`findByProcessDefinitionId` 遍历 NodeConfig，用 parser 解析每个 configJson 的 dataMappings，按 nodeId 组装 Map。`resolveVariableMappings`：找 `nodeId == "__PROCESS__"` 的配置解析 variableMappings。`resolveSourceFormDefId`：解析 `source` 前缀（`form:`/`variable:`）；`form:initiator` 走 InitiatorNodeResolver → 查发起节点 NodeConfig 的 `form.formDefId`；`form:<nodeId>` 直接查该节点 NodeConfig 的 `form.formDefId`；查不到返回 null。

- [ ] **Step 4: 运行确认通过**

Run: `mvn test -Dtest=FormMappingResolverTest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/workflow/engine/form/mapping/ backend/src/test/java/com/workflow/engine/form/mapping/
git commit -m "feat: add form mapping resolver with source form lookup"
```

---

## Task 3: mappedData 聚合（FormDataMerger）

**Files:**
- Create: `backend/src/main/java/com/workflow/engine/form/mapping/FormDataMerger.java`
- Modify: `backend/src/main/java/com/workflow/engine/form/FormDataService.java`（如需补充查询方法）
- Test: `backend/src/test/java/com/workflow/engine/form/mapping/FormDataMergerTest.java`

**Interfaces:**
- Consumes: `FormMappingResolver`（resolveDataMappings/resolveSourceFormDefId）、`FormDataRepository`（`findByTenantIdAndProcessInstanceIdAndFormDefIdAndIsSnapshot`）、`RuntimeService`（Flowable `getVariable(String, String)`）、`TenantProvider`
- Produces: `Map<String, Object> merge(String processDefinitionId, String nodeId, String processInstanceId)` —— targetField → value；源缺失跳过；`variable:*` 源读流程变量

- [ ] **Step 1: 写失败测试**

```java
class FormDataMergerTest {
    // fixture: 节点 UserTask_1 有 2 条映射：
    //   applicantName ← form:initiator.name（发起表单 F1 当前数据 dataJson {"name":"张三"}）
    //   auditResult   ← variable:gatewayResult（流程变量 gatewayResult="PASS"）
    @Test
    void mergesFormAndVariableSources() {
        Map<String, Object> merged = merger.merge("procDef:1:uuid", "UserTask_1", "inst1");
        assertEquals("张三", merged.get("applicantName"));
        assertEquals("PASS", merged.get("auditResult"));
    }

    @Test
    void skipsMissingSource() {
        // 发起表单无数据 → merged 不含 applicantName，不抛异常
        Map<String, Object> merged = merger.merge("procDef:1:uuid", "UserTask_1", "instNoData");
        assertFalse(merged.containsKey("applicantName"));
    }

    @Test
    void emptyWhenNoMappings() {
        assertTrue(merger.merge("procDef:1:uuid", "Node_NoMapping", "inst1").isEmpty());
    }
}
```

- [ ] **Step 2: 运行确认失败**

Run: `mvn test -Dtest=FormDataMergerTest`
Expected: 编译失败

- [ ] **Step 3: 实现 FormDataMerger**

`merge(...)`：`resolver.resolveDataMappings(processDefinitionId).getOrDefault(nodeId, List.of())` 遍历：`variable:*` → `runtimeService.getVariable(processInstanceId, name)`（null 跳过）；`form:*` → `resolver.resolveSourceFormDefId(source, ...)` 为 null 跳过 → `formDataRepository.findByTenantIdAndProcessInstanceIdAndFormDefIdAndIsSnapshot(tenant, instId, formDefId, false)`，存在则 `objectMapper.readTree(dataJson).get(sourceField)`（缺失跳过），值放入 result。异常 catch 后跳过该条（log.warn）。

- [ ] **Step 4: 运行确认通过**

Run: `mvn test -Dtest=FormDataMergerTest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/workflow/engine/form/mapping/FormDataMerger.java backend/src/test/java/com/workflow/engine/form/mapping/FormDataMergerTest.java
git commit -m "feat: merge mapped form data from upstream forms and variables"
```

---

## Task 4: 任务详情返回 mappedData（含已办）

**Files:**
- Modify: `backend/src/main/java/com/workflow/api/dto/TaskDetailVO.java`（加 `mappedData` 字段 + getter/setter）
- Modify: `backend/src/main/java/com/workflow/engine/task/WorkflowTaskService.java`（`getTaskDetail`/`buildTaskDetailFromRuntime` 与历史详情构建处填充 mappedData）
- Test: `backend/src/test/java/com/workflow/engine/task/WorkflowTaskServiceDetailTest.java`（扩展）

**Interfaces:**
- Consumes: `FormDataMerger.merge(processDefinitionId, taskDefinitionKey, processInstanceId)`
- Produces: `TaskDetailVO.mappedData`（`Map<String, Object>`，未配置映射时为 null）

- [ ] **Step 1: 写失败测试**

扩展 `WorkflowTaskServiceDetailTest`：
```java
@Test
void taskDetailContainsMappedData() {
    // mock FormDataMerger.merge 返回 {"applicantName":"张三"}
    TaskDetailVO vo = service.getTaskDetail("task1").orElseThrow();
    assertEquals("张三", vo.getMappedData().get("applicantName"));
}
```
（若现有测试类构造方式复杂，新建 `WorkflowTaskServiceMappedDataTest` 用相同 fixture 方式。）

- [ ] **Step 2: 运行确认失败**

Run: `mvn test -Dtest=WorkflowTaskServiceDetailTest`
Expected: 编译失败（TaskDetailVO 无 mappedData）

- [ ] **Step 3: 实现**

`TaskDetailVO` 增加 `private Map<String, Object> mappedData;` + getter/setter。`WorkflowTaskService`：任务节点 formDefId 存在时（或无论是否配置映射均调用）`taskDetail.setMappedData(formDataMerger.merge(processDefinitionId, taskDefKey, processInstanceId))`；merge 返回空 Map 时置为 null。历史任务详情构建（`getHistoricTaskDetail`）以历史 processDefinitionId 调用同一逻辑。

- [ ] **Step 4: 运行确认通过**

Run: `mvn test -Dtest=WorkflowTaskServiceDetailTest`
Expected: PASS（含原有用例）

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/workflow/api/dto/TaskDetailVO.java backend/src/main/java/com/workflow/engine/task/WorkflowTaskService.java backend/src/test/java/com/workflow/engine/task/
git commit -m "feat: return mappedData in task detail for runtime and historic tasks"
```

---

## Task 5: 流程变量映射写入（发起 + 任务完成）

**Files:**
- Create: `backend/src/main/java/com/workflow/engine/form/mapping/VariableMappingWriter.java`
- Modify: `backend/src/main/java/com/workflow/api/controller/ProcessInstanceController.java`（start 成功后调用）
- Modify: `backend/src/main/java/com/workflow/engine/task/WorkflowTaskService.java`（complete/reject 等流转动作后调用）
- Test: `backend/src/test/java/com/workflow/engine/form/mapping/VariableMappingWriterTest.java`

**Interfaces:**
- Consumes: `FormMappingResolver.resolveVariableMappings`、`FormMappingResolver.resolveSourceFormDefId`、`FormDataRepository`、`RuntimeService`（`setVariable`）、`TenantProvider`
- Produces: `void write(String processDefinitionId, String processInstanceId)` —— 遍历 variableMappings：`variable:*` 源原样 set；`form:*` 源解析 formDefId → 查当前数据 → 取 sourceField（缺失跳过）→ `runtimeService.setVariable(processInstanceId, variable, value)`

- [ ] **Step 1: 写失败测试**

```java
class VariableMappingWriterTest {
    @Test
    void writesFormFieldToVariable() {
        // fixture: variableMappings [{variable:requestAmount, source:form:initiator, sourceField:amount}]
        // 发起表单当前数据 {"amount":5000}
        writer.write("procDef:1:uuid", "inst1");
        verify(runtimeService).setVariable("inst1", "requestAmount", 5000);
    }

    @Test
    void skipsWhenSourceDataMissing() {
        writer.write("procDef:1:uuid", "instNoData");
        verify(runtimeService, never()).setVariable(any(), any(), any());
    }

    @Test
    void passesThroughVariableSource() {
        // variableMappings [{variable:copy, source:variable:orig}] → setVariable("copy", orig 值)
        when(runtimeService.getVariable("inst1", "orig")).thenReturn("X");
        writer.write("procDef:1:uuid", "inst1");
        verify(runtimeService).setVariable("inst1", "copy", "X");
    }
}
```

- [ ] **Step 2: 运行确认失败**

Run: `mvn test -Dtest=VariableMappingWriterTest`
Expected: 编译失败

- [ ] **Step 3: 实现 VariableMappingWriter**

按 Interfaces 语义实现；`form:*` 源取值复用与 FormDataMerger 相同的查询模式（`findByTenantIdAndProcessInstanceIdAndFormDefIdAndIsSnapshot(..., false)` + `readTree`）。

- [ ] **Step 4: 接入调用点**

`ProcessInstanceController.start`：`runtimeService.startProcessInstanceByKey(...)` 返回 instance 后、返回响应前调用 `variableMappingWriter.write(instance.getProcessDefinitionId(), instance.getId())`（TDD：在现有发起测试中断言变量写入——若现有测试覆盖 start，补充断言）。`WorkflowTaskService`：complete/reject 成功后调用 `write(task.getProcessDefinitionId(), task.getProcessInstanceId())`。

- [ ] **Step 5: 运行确认通过**

Run: `mvn test -Dtest=VariableMappingWriterTest`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/workflow/engine/form/mapping/VariableMappingWriter.java backend/src/main/java/com/workflow/api/controller/ProcessInstanceController.java backend/src/main/java/com/workflow/engine/task/WorkflowTaskService.java backend/src/test/java/
git commit -m "feat: write mapped form fields to process variables on start and task completion"
```

---

## Task 6: 发布校验（字段存在性 + 循环引用 + 变量名唯一）

**Files:**
- Create: `backend/src/main/java/com/workflow/engine/form/mapping/FormMappingValidator.java`
- Modify: `backend/src/main/java/com/workflow/engine/process/ProcessDesignService.java`（`deploy(String draftId)` 内调用校验，失败抛异常阻止部署）
- Test: `backend/src/test/java/com/workflow/engine/form/mapping/FormMappingValidatorTest.java`

**Interfaces:**
- Consumes: `FormMappingResolver`、`FormDefinitionRepository`（按 formDefId 取 schema 字段名集合）、节点配置全集
- Produces: `void validate(String processDefinitionId)` —— 校验失败抛 `IllegalArgumentException`，消息含节点与字段名
- 校验规则：targetField 存在于目标表单 schema；`form:*` 源 sourceField 存在于源表单 schema；variable 名唯一；节点间（含 form:initiator 间接环）无循环引用

- [ ] **Step 1: 写失败测试**

```java
class FormMappingValidatorTest {
    @Test
    void rejectsUnknownTargetField() {
        // 节点 UserTask_1 表单 F2 schema 无字段 "nonexistent"
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
            () -> validator.validate("procDef:1:uuid"));
        assertTrue(ex.getMessage().contains("nonexistent"));
    }

    @Test
    void rejectsDuplicateVariableNames() {
        assertThrows(IllegalArgumentException.class, () -> validator.validate("procDef:dupVar:uuid"));
    }

    @Test
    void rejectsCyclicReferences() {
        // A 引 B、B 引 A
        assertThrows(IllegalArgumentException.class, () -> validator.validate("procDef:cycle:uuid"));
    }

    @Test
    void passesValidConfig() {
        assertDoesNotThrow(() -> validator.validate("procDef:1:uuid"));
    }
}
```

- [ ] **Step 2: 运行确认失败**

Run: `mvn test -Dtest=FormMappingValidatorTest`
Expected: 编译失败

- [ ] **Step 3: 实现 FormMappingValidator**

字段存在性：`formDefRepository` 取表单 schema（`FormDefinitionDetailDTO.schema` 或直接读 FormDefinition.schema JSON），解析字段名集合（`field`/`prop`，含 fcRow 递归子字段——复用前端字段解析思路，后端遍历 rule 树）。循环引用：以节点为顶点、映射关系为有向边（含 form:initiator 解析后的实际源节点）做 DFS 环检测。变量名唯一：Set 判重。

- [ ] **Step 4: 接入 deploy**

`ProcessDesignService.deploy`：部署生成 NodeConfig 快照后调用 `formMappingValidator.validate(newProcessDefinitionId)`；`IllegalArgumentException` 向上抛出（现有异常处理呈现给前端）。TDD：扩展 `ProcessDesignServiceDeployTest` 断言非法映射配置部署失败。

- [ ] **Step 5: 运行确认通过**

Run: `mvn test -Dtest=FormMappingValidatorTest,ProcessDesignServiceDeployTest`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/workflow/engine/form/mapping/FormMappingValidator.java backend/src/main/java/com/workflow/engine/process/ProcessDesignService.java backend/src/test/java/
git commit -m "feat: validate form mappings on process deploy"
```

---

## Task 7: FormRenderer 映射数据预填（前端）

**Files:**
- Modify: `frontend/src/views/form/components/FormRenderer.vue`
- Test: `frontend/src/views/form/components/FormRenderer.test.ts`（新建，如项目已有组件测试模式则沿用）

**Interfaces:**
- Consumes: 新增 prop `mappedData?: Record<string, unknown>`
- Produces: 合并后的 `formData`（本表单数据优先）

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import FormRenderer from './FormRenderer.vue'

describe('FormRenderer mappedData', () => {
  it('merges mappedData into form data on mount', async () => {
    const wrapper = mount(FormRenderer, {
      props: {
        rule: [{ type: 'input', field: 'applicantName', title: '申请人' }],
        mappedData: { applicantName: '张三' },
      },
    })
    await wrapper.vm.$nextTick()
    const data = (wrapper.vm as any).getFormData()
    expect(data.applicantName).toBe('张三')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm run test`（frontend/，可 `npx vitest run FormRenderer`）
Expected: FAIL（mappedData prop 不存在）

- [ ] **Step 3: 实现**

`defineProps` 增加 `mappedData?: Record<string, unknown>`；`onMounted` 中在 `loadData()` 之后执行：`if (props.mappedData) { formData.value = { ...props.mappedData, ...formData.value } }`（本表单数据优先覆盖映射）。注意与 `initialValues`/`loadData` 的合并顺序：mappedData 先铺底、本表单数据后覆盖。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run FormRenderer`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/form/components/FormRenderer.vue frontend/src/views/form/components/FormRenderer.test.ts
git commit -m "feat: prefill form fields from mappedData in FormRenderer"
```

---

## Task 8: 节点属性面板"数据来源"配置（前端）

**Files:**
- Modify: `frontend/src/views/designer/properties/FormPropertyTab.vue`
- Modify: `frontend/src/components/business/types.ts`（`FormConfig` 类型扩展 `dataMappings`）
- Test: `frontend/src/views/designer/properties/FormPropertyTabs.test.ts`（扩展）

**Interfaces:**
- Consumes: `designerStore.getNodeConfig/setNodeConfig`（现有）
- Produces: 节点配置 `form.dataMappings: { targetField; source; sourceField? }[]`

- [ ] **Step 1: 扩展类型定义**

`types.ts` 中 `FormConfig` 增加 `dataMappings?: { targetField: string; source: string; sourceField?: string }[]`；`NodeConfigData.form` 同步。写失败测试：`FormPropertyTabs.test.ts` 中 mount FormPropertyTab（沿用现有测试 fixture），mock 表单与字段列表，断言选中字段配置来源后 `setNodeConfig` 收到含 dataMappings 的节点配置。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run FormPropertyTabs`
Expected: FAIL

- [ ] **Step 3: 实现**

字段权限表新增"数据来源"列：
- 下拉选项：无 / 发起人表单 / 指定节点 / 流程变量
- 选择"发起人表单"→ 源字段下拉（加载发起人表单 schema 字段，经 `formApi.getFormDefinition`）
- 选择"指定节点"→ 节点下拉（`designerStore` 节点列表）+ 源字段下拉（加载该节点表单字段）
- 选择"流程变量"→ 变量名输入框
- 变更后 `saveConfig()` 将映射数组写入 `form.dataMappings`（清除来源的字段移除对应条目）

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run FormPropertyTabs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/designer/properties/FormPropertyTab.vue frontend/src/components/business/types.ts frontend/src/views/designer/properties/FormPropertyTabs.test.ts
git commit -m "feat: add data source configuration for form fields in node properties"
```

---

## Task 9: 流程级变量映射面板（前端）

**Files:**
- Modify: `frontend/src/views/designer/properties/ProcessFormPropertyTab.vue`（流程级配置面板）
- Modify: `frontend/src/components/business/types.ts`（流程配置类型增加 `variableMappings`）
- Test: `frontend/src/views/designer/properties/ProcessFormPropertyTab.test.ts`（新建或扩展）

**Interfaces:**
- Consumes: `designerStore.getProcessConfig/setProcessConfig`（现有）
- Produces: `__PROCESS__` 配置 `variableMappings: { variable; source; sourceField? }[]`

- [ ] **Step 1: 写失败测试**

`ProcessFormPropertyTab.test.ts`：mount 面板，mock 流程配置，新增一个变量映射条目（变量名 + 数据源），断言 `setProcessConfig` 收到含 variableMappings 的配置；输入重复变量名断言 UI 提示。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run ProcessFormPropertyTab`
Expected: FAIL

- [ ] **Step 3: 实现**

面板新增"流程变量映射"分区：条目列表（变量名输入 + 数据源选择[发起人表单字段/指定节点字段/流程变量] + 源字段选择 + 删除按钮）+ "添加映射"按钮；保存时写 `processConfig.variableMappings`；重复变量名校验（前端提示 + 阻止保存）。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run ProcessFormPropertyTab`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/designer/properties/ProcessFormPropertyTab.vue frontend/src/components/business/types.ts frontend/src/views/designer/properties/ProcessFormPropertyTab.test.ts
git commit -m "feat: add process-level variable mapping panel to designer"
```

---

## Task 10: 页面接线与端到端验证

**Files:**
- Modify: `frontend/src/views/process/TaskDetailPage.vue`（待办详情传 mappedData）
- Modify: `frontend/src/views/process/TaskDoneDetailPage.vue`（已办详情传 mappedData）
- Modify: `frontend/src/api/process.ts` 或对应任务 API 类型（`TaskDetailVO` 增加 `mappedData`）
- Modify: `frontend/src/api/form.ts`（如需）

- [ ] **Step 1: 更新前端类型与接线**

任务详情 API 响应类型增加 `mappedData?: Record<string, unknown> | null`；`TaskDetailPage` 的 FormRenderer 模板传 `:mapped-data="taskDetail?.mappedData ?? undefined"`；`TaskDoneDetailPage` 同样处理。

- [ ] **Step 2: 前端构建验证**

Run: `npm run build`（frontend/）
Expected: tsc + vite build 通过

- [ ] **Step 3: 后端全量测试**

Run: `mvn test`（backend/）
Expected: 全绿（含新增 FormMapping* 测试与既有回归）

- [ ] **Step 4: 手动端到端验证**

1. 设计器配置多表单流程：发起节点绑定 F1（含字段 name/amount），审批节点绑定 F2 并映射 `applicantName ← form:initiator.name`、`requestAmount ← variable:requestAmount`，流程级配置 variableMappings `requestAmount ← form:initiator.amount`，网关 `amount > 1000` 分流
2. 发起流程填写 F1 → 审批节点：F2 显示只读的申请人姓名与金额
3. 审批通过 → 网关按金额正确分流；已办详情回显一致
4. 发布含非法映射（targetField 不存在）→ 部署被拒绝并提示字段名

- [ ] **Step 5: Commit**

```bash
git add frontend/ backend/
git commit -m "feat: wire mappedData through task pages and verify form data mapping end-to-end"
```
