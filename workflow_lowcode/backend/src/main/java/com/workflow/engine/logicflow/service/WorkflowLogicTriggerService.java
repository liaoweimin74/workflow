package com.workflow.engine.logicflow.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.engine.form.entity.FormData;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.repository.FormDataRepository;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.process.entity.NodeConfig;
import com.workflow.engine.process.repository.NodeConfigRepository;
import com.workflow.engine.tenant.TenantContext;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.repository.ProcessDefinition;
import org.flowable.task.api.Task;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 工作流事件 × 逻辑编排触发调度（formhook-v2 #5 触发点扩展）。
 *
 * <p>把 BPMN 工作流生命周期事件映射到 WORKFLOW 表单绑定并派发逻辑编排：
 * <ul>
 *   <li>流程级 AFTER_PROCESS_START / PROCESS_COMPLETE / PROCESS_CANCEL：派发到该流程定义
 *       引用的<b>全部表单</b>（各节点表单 + 流程级 {@code __PROCESS__} 表单，去重）——
 *       「流程在这个表单所属的流程上启动/结束/取消」；</li>
 *   <li>任务级 TASK_CREATE / TASK_APPROVE / TASK_REJECT / TASK_TIMEOUT：派发到<b>任务节点表单</b>，
 *       节点未配表单时回落 {@code __PROCESS__} 流程级表单，两者皆无则跳过。</li>
 * </ul>
 *
 * <p>失败语义沿用 {@link FormLogicBindingService#dispatch}：SYNC_IN_TX 失败抛
 * {@link com.workflow.common.exception.BusinessException} 阻断/回滚主操作；
 * AFTER_COMMIT 提交后留痕不回滚。各注入点的租户与异常约定：
 * <ul>
 *   <li>Web 请求线程（审批/驳回，{@link WorkflowTaskService 注入方}）：租户显式传入
 *       {@code TenantProvider.getTenantId()}，异常自然沿事务传播；</li>
 *   <li>Flowable 全局监听器（启动/任务创建/完成/取消）：租户 hint 传 null，
 *       内部按 TenantContext → 流程定义租户 → default 降级；</li>
 *   <li>TaskTimeoutScanner（后台线程）：租户取 Task.tenantId，调用方包裹
 *       try/catch——扫描轮询不因绑定流失败而停摆（documented 偏差）。</li>
 * </ul>
 */
@Service
public class WorkflowLogicTriggerService {

    private static final Logger log = LoggerFactory.getLogger(WorkflowLogicTriggerService.class);

    /** 流程级配置节点 ID（NodeConfig.nodeId），承载流程级表单与策略。 */
    private static final String PROCESS_LEVEL_NODE = "__PROCESS__";

    private final FormLogicBindingService logicBindings;
    private final NodeConfigRepository nodeConfigRepository;
    private final FormDefinitionRepository formDefRepository;
    private final FormDataRepository formDataRepository;
    private final RepositoryService repositoryService;
    private final ObjectMapper objectMapper;

    public WorkflowLogicTriggerService(FormLogicBindingService logicBindings,
                                       NodeConfigRepository nodeConfigRepository,
                                       FormDefinitionRepository formDefRepository,
                                       FormDataRepository formDataRepository,
                                       RepositoryService repositoryService,
                                       ObjectMapper objectMapper) {
        this.logicBindings = logicBindings;
        this.nodeConfigRepository = nodeConfigRepository;
        this.formDefRepository = formDefRepository;
        this.formDataRepository = formDataRepository;
        this.repositoryService = repositoryService;
        this.objectMapper = objectMapper;
    }

    // ------------------------------------------------------------------
    // 触发入口
    // ------------------------------------------------------------------

    /**
     * 任务级事件触发（TASK_CREATE / TASK_APPROVE / TASK_REJECT / TASK_TIMEOUT）。
     *
     * @param tenantHint  租户提示（Web 线程传 TenantProvider 结果；监听器/后台传 null 走降级链）
     * @param triggerType FormLogicBindingService.TRIG_* 任务级常量
     * @param task        Flowable 任务（捕获于动作前亦可，仅取 ID/节点/定义键）
     * @param extra       附加上下文（outcome/reason/timeoutAction 等，可 null）
     */
    public void fireTaskEvent(String tenantHint, String triggerType, Task task, Map<String, Object> extra) {
        if (task == null || task.getProcessDefinitionId() == null) {
            return;
        }
        String tenant = resolveTenant(tenantHint, task.getProcessDefinitionId());
        String formDefId = resolveTaskFormDefId(task.getProcessDefinitionId(), task.getTaskDefinitionKey());
        if (formDefId == null) {
            return;
        }
        fireForForm(tenant, triggerType, formDefId, task.getProcessDefinitionId(),
                task.getProcessInstanceId(), task.getId(), task.getTaskDefinitionKey(), extra);
    }

    /**
     * 流程级事件触发（AFTER_PROCESS_START / PROCESS_COMPLETE / PROCESS_CANCEL）。
     * 派发到流程定义引用的全部表单；无表单引用时不触发。
     */
    public void fireProcessEvent(String tenantHint, String triggerType,
                                 String processDefinitionId, String processInstanceId,
                                 Map<String, Object> extra) {
        if (processDefinitionId == null || processDefinitionId.isBlank()) {
            return;
        }
        String tenant = resolveTenant(tenantHint, processDefinitionId);
        for (String formDefId : resolveProcessFormDefIds(processDefinitionId)) {
            fireForForm(tenant, triggerType, formDefId, processDefinitionId,
                    processInstanceId, null, null, extra);
        }
    }

    // ------------------------------------------------------------------
    // 单表单派发
    // ------------------------------------------------------------------

    private void fireForForm(String tenant, String triggerType, String formDefId,
                             String processDefinitionId, String processInstanceId,
                             String taskId, String nodeId, Map<String, Object> extra) {
        FormDefinition formDef = formDefRepository.findByIdAndTenantId(formDefId, tenant).orElse(null);
        if (formDef == null) {
            // 跨租户/已删除表单不触发（NodeConfig 残留引用）
            return;
        }

        // 该表单在本实例的当前数据（非快照）；无则 formData=null
        FormData current = formDataRepository
                .findByTenantIdAndProcessInstanceIdAndFormDefIdAndIsSnapshot(
                        tenant, processInstanceId, formDefId, false)
                .orElse(null);
        Map<String, Object> formData = parseFormDataQuietly(current == null ? null : current.getDataJson());

        Map<String, Object> wf = new LinkedHashMap<>();
        wf.put("processInstanceId", processInstanceId);
        wf.put("processDefinitionId", processDefinitionId);
        wf.put("processDefinitionKey", processDefinitionKey(processDefinitionId));
        wf.put("taskId", taskId);
        wf.put("nodeId", nodeId);
        if (extra != null) {
            wf.putAll(extra);
        }

        // 复用系统注入约定（formData/formKey/formType/opType/operator…），dataId=当前数据行 id（无则实例 id）
        Map<String, Object> vars = logicBindings.buildVars(
                FormLogicBindingService.FORM_TYPE_WORKFLOW, formDef.getKey(), triggerType,
                triggerType, current == null ? processInstanceId : current.getId(), formData, null);
        vars.putAll(wf);

        // __trigger 覆盖为工作流事件源（buildVars 默认 form-submit）
        Map<String, Object> trigger = new LinkedHashMap<>();
        trigger.put("source", "workflow-event");
        trigger.put("formType", FormLogicBindingService.FORM_TYPE_WORKFLOW);
        trigger.put("formKey", formDef.getKey());
        trigger.put("trigger", triggerType);
        trigger.put("opType", triggerType);
        trigger.putAll(wf);
        vars.put("__trigger", trigger);

        logicBindings.dispatch(tenant, FormLogicBindingService.FORM_TYPE_WORKFLOW,
                formDef.getKey(), triggerType, vars);
        log.info("工作流触发点已派发 trigger={} form={} process={} task={}",
                triggerType, formDef.getKey(), processInstanceId, taskId);
    }

    // ------------------------------------------------------------------
    // 表单/租户解析
    // ------------------------------------------------------------------

    /**
     * 任务节点表单解析：任务节点 NodeConfig.form → 无则 {@code __PROCESS__} 流程级表单
     * → 都无返回 null（跳过触发）。
     */
    private String resolveTaskFormDefId(String processDefinitionId, String nodeId) {
        List<NodeConfig> configs = nodeConfigRepository.findByProcessDefinitionId(processDefinitionId);
        if (nodeId != null && !nodeId.isBlank()) {
            for (NodeConfig nc : configs) {
                if (nodeId.equals(nc.getNodeId())) {
                    String f = extractFormDefId(nc.getConfigJson());
                    if (f != null) {
                        return f;
                    }
                }
            }
        }
        for (NodeConfig nc : configs) {
            if (PROCESS_LEVEL_NODE.equals(nc.getNodeId())) {
                String f = extractFormDefId(nc.getConfigJson());
                if (f != null) {
                    return f;
                }
            }
        }
        return null;
    }

    /** 流程定义引用的全部表单（节点表单 + 流程级表单，LinkedHashSet 去重保序）。 */
    private List<String> resolveProcessFormDefIds(String processDefinitionId) {
        Set<String> ids = new LinkedHashSet<>();
        for (NodeConfig nc : nodeConfigRepository.findByProcessDefinitionId(processDefinitionId)) {
            String f = extractFormDefId(nc.getConfigJson());
            if (f != null) {
                ids.add(f);
            }
        }
        return new ArrayList<>(ids);
    }

    /** 租户降级链：hint → TenantContext → 流程定义租户 → default。 */
    private String resolveTenant(String hint, String processDefinitionId) {
        if (hint != null && !hint.isBlank()) {
            return hint;
        }
        String ctx = TenantContext.getTenantId();
        if (ctx != null && !ctx.isBlank()) {
            return ctx;
        }
        try {
            ProcessDefinition def = repositoryService.createProcessDefinitionQuery()
                    .processDefinitionId(processDefinitionId).singleResult();
            if (def != null && def.getTenantId() != null && !def.getTenantId().isBlank()) {
                return def.getTenantId();
            }
        } catch (Exception ignore) {
            // 引擎查询失败按 default 兜底
        }
        return "default";
    }

    private String processDefinitionKey(String processDefinitionId) {
        try {
            ProcessDefinition def = repositoryService.createProcessDefinitionQuery()
                    .processDefinitionId(processDefinitionId).singleResult();
            return def == null ? null : def.getKey();
        } catch (Exception e) {
            return null;
        }
    }

    /** NodeConfig config_json → form.formDefId（无效/缺失返回 null）。 */
    private String extractFormDefId(String configJson) {
        if (configJson == null || configJson.isBlank()) {
            return null;
        }
        try {
            JsonNode form = objectMapper.readTree(configJson).get("form");
            if (form == null || !form.has("formDefId")) {
                return null;
            }
            String val = form.get("formDefId").asText();
            return val == null || val.isEmpty() ? null : val;
        } catch (Exception e) {
            return null;
        }
    }

    /** dataJson → Map（宽松解析：失败返回 null，不阻断触发链）。 */
    @SuppressWarnings("unchecked")
    private Map<String, Object> parseFormDataQuietly(String dataJson) {
        if (dataJson == null || dataJson.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(dataJson, LinkedHashMap.class);
        } catch (Exception e) {
            return null;
        }
    }
}
