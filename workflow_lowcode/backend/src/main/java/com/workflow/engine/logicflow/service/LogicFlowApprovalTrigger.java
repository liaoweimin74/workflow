package com.workflow.engine.logicflow.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.engine.form.entity.FormData;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.repository.FormDataRepository;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 审批事件 → 逻辑编排触发器（工作流表单 AFTER_TASK_* / AFTER_PROCESS_FINISH 触发点）。
 *
 * <p>挂点（均 AFTER 语义，失败语义由绑定 executionMode 决定：SYNC_IN_TX 回滚 / AFTER_COMMIT 留痕）：
 * <ul>
 *   <li>{@link #onTaskApproved}：任务审批通过后（{@code AFTER_TASK_APPROVE}）；
 *       流程同时结束时追加 {@code AFTER_PROCESS_FINISH}；</li>
 *   <li>{@link #onTaskRefused}：审批拒绝（终止全流程）后（{@code AFTER_TASK_REJECT}）；</li>
 *   <li>{@link #onTaskReturned}：驳回退回发起人后（{@code AFTER_TASK_RETURN}）；</li>
 *   <li>{@link #onTaskAction}：任务协作类动作（转办/委派/加签/认领/催办）后
 *       （{@code AFTER_TASK_TRANSFER/DELEGATE/ADD_SIGN/CLAIM/URGE}）；</li>
 *   <li>{@link #onProcessAction}：流程级事件（撤回/终止/启动）后
 *       （{@code AFTER_PROCESS_WITHDRAW/TERMINATE/START}）。</li>
 * </ul>
 *
 * <p>formKey 解析：绑定按 (WORKFLOW, formKey) 组织，而审批事件发生在流程实例上。
 * 从该流程实例最新一条表单数据（FormData，快照/非快照均可）反查 formDefId →
 * FormDefinition.key；无表单数据（无表单流程）时不触发——没有绑定入口即无目标。
 * 不依赖 task 包服务，避免 task ↔ logicflow 循环依赖。
 *
 * <p>注入变量（与前端 TRIGGER_PARAM_SPECS 逐字段对齐）见
 * {@link FormLogicBindingService#buildApprovalVars}。
 */
@Service
public class LogicFlowApprovalTrigger {

    private static final Logger log = LoggerFactory.getLogger(LogicFlowApprovalTrigger.class);

    private final FormLogicBindingService logicBindings;
    private final FormDataRepository formDataRepository;
    private final FormDefinitionRepository formDefRepository;
    private final TenantProvider tenantProvider;
    private final ObjectMapper objectMapper;

    public LogicFlowApprovalTrigger(FormLogicBindingService logicBindings,
                                    FormDataRepository formDataRepository,
                                    FormDefinitionRepository formDefRepository,
                                    TenantProvider tenantProvider,
                                    ObjectMapper objectMapper) {
        this.logicBindings = logicBindings;
        this.formDataRepository = formDataRepository;
        this.formDefRepository = formDefRepository;
        this.tenantProvider = tenantProvider;
        this.objectMapper = objectMapper;
    }

    /**
     * 任务审批通过后触发：AFTER_TASK_APPROVE 每次通过必触发；
     * processFinished=true 时追加 AFTER_PROCESS_FINISH（同一上下文，同一批绑定各自调度）。
     */
    public void onTaskApproved(String processInstanceId, String taskId,
                               String userId, String comment, boolean processFinished) {
        Optional<ApprovalContext> ctx = resolveContext(processInstanceId);
        if (ctx.isEmpty()) {
            return;
        }
        ApprovalContext c = ctx.get();
        dispatch(c, FormLogicBindingService.TRIG_AFTER_TASK_APPROVE, "APPROVE",
                processInstanceId, taskId, userId, comment);
        if (processFinished) {
            dispatch(c, FormLogicBindingService.TRIG_AFTER_PROCESS_FINISH, "FINISH",
                    processInstanceId, taskId, userId, comment);
        }
    }

    /** 审批拒绝（终止全流程）后触发 AFTER_TASK_REJECT。 */
    public void onTaskRefused(String processInstanceId, String taskId, String userId, String reason) {
        resolveContext(processInstanceId).ifPresent(c ->
                dispatch(c, FormLogicBindingService.TRIG_AFTER_TASK_REJECT, "REJECT",
                        processInstanceId, taskId, userId, reason));
    }

    /** 驳回退回发起人后触发 AFTER_TASK_RETURN。 */
    public void onTaskReturned(String processInstanceId, String taskId, String userId, String reason) {
        resolveContext(processInstanceId).ifPresent(c ->
                dispatch(c, FormLogicBindingService.TRIG_AFTER_TASK_RETURN, "RETURN",
                        processInstanceId, taskId, userId, reason));
    }

    /**
     * 任务协作类动作后触发对应 AFTER_* 绑定（转办/委派/加签/认领/催办）。
     *
     * @param triggerType TRIG_AFTER_TASK_TRANSFER / DELEGATE / ADD_SIGN / CLAIM / URGE
     * @param opType      TRANSFER / DELEGATE / ADD_SIGN / CLAIM / URGE
     * @param toUser      目标人（新办理人/被委派人/加签人逗号分隔/被催办人；认领为 null）
     */
    public void onTaskAction(String processInstanceId, String taskId, String triggerType, String opType,
                             String userId, String comment, String toUser) {
        resolveContext(processInstanceId).ifPresent(c ->
                dispatch(c, triggerType, opType, processInstanceId, taskId, userId, comment, toUser));
    }

    /**
     * 流程级事件后触发对应 AFTER_* 绑定（撤回/终止/启动）。
     *
     * <p>启动事件由控制器在首份表单数据落库后调用（无表单数据的启动 resolveContext
     * 为空不触发，与既有「无表单数据不触发」原则一致）。
     *
     * @param triggerType TRIG_AFTER_PROCESS_WITHDRAW / TERMINATE / START
     * @param opType      WITHDRAW / TERMINATE / START
     */
    public void onProcessAction(String processInstanceId, String triggerType, String opType,
                                String taskId, String userId, String comment) {
        resolveContext(processInstanceId).ifPresent(c ->
                dispatch(c, triggerType, opType, processInstanceId, taskId, userId, comment, null));
    }

    // ------------------------------------------------------------------
    // 内部
    // ------------------------------------------------------------------

    private void dispatch(ApprovalContext ctx, String triggerType, String opType,
                          String processInstanceId, String taskId, String userId, String comment) {
        dispatch(ctx, triggerType, opType, processInstanceId, taskId, userId, comment, null);
    }

    private void dispatch(ApprovalContext ctx, String triggerType, String opType,
                          String processInstanceId, String taskId, String userId, String comment,
                          String toUser) {
        try {
            logicBindings.dispatch(tenantProvider.getTenantId(),
                    FormLogicBindingService.FORM_TYPE_WORKFLOW, ctx.formKey(), triggerType,
                    logicBindings.buildApprovalVars(FormLogicBindingService.FORM_TYPE_WORKFLOW,
                            ctx.formKey(), triggerType, opType, processInstanceId, taskId,
                            ctx.formData(), comment, userId, toUser));
        } catch (Exception e) {
            // SYNC_IN_TX 绑定的 BusinessException 需要向上传播（回滚主操作），
            // 这里仅对「无绑定/上下文解析」外的意外异常兜底记日志后重抛
            if (e instanceof com.workflow.common.exception.BusinessException) {
                throw e;
            }
            log.warn("审批事件触发编排异常: formKey={} trigger={} instance={}",
                    ctx.formKey(), triggerType, processInstanceId, e);
            throw e;
        }
    }

    /** 流程实例 → (formKey, 最新表单数据)。无表单数据记录时返回 empty。 */
    private Optional<ApprovalContext> resolveContext(String processInstanceId) {
        String tenantId = tenantProvider.getTenantId();
        if (processInstanceId == null || processInstanceId.isBlank()) {
            return Optional.empty();
        }
        List<FormData> records =
                formDataRepository.findByTenantIdAndProcessInstanceId(tenantId, processInstanceId);
        if (records == null || records.isEmpty()) {
            return Optional.empty();
        }
        FormData latest = records.stream()
                .max(Comparator.comparing(FormData::getCreatedAt,
                        Comparator.nullsFirst(Comparator.naturalOrder())))
                .orElse(records.get(0));
        Optional<FormDefinition> def = latest.getFormDefId() == null ? Optional.empty()
                : formDefRepository.findByIdAndTenantId(latest.getFormDefId(), tenantId);
        if (def.isEmpty()) {
            log.debug("审批事件触发跳过：流程实例 {} 表单定义不存在（formDefId={}）",
                    processInstanceId, latest.getFormDefId());
            return Optional.empty();
        }
        return Optional.of(new ApprovalContext(def.get().getKey(), parseFormDataQuietly(latest.getDataJson())));
    }

    /** dataJson → Map（宽松解析：失败返回 null，审批主操作不因脏数据阻断）。 */
    private Map<String, Object> parseFormDataQuietly(String dataJson) {
        if (dataJson == null || dataJson.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(dataJson,
                    objectMapper.getTypeFactory().constructMapType(LinkedHashMap.class, String.class, Object.class));
        } catch (Exception e) {
            return null;
        }
    }

    /** 审批触发上下文：解析出的 formKey + 最新表单数据。 */
    private record ApprovalContext(String formKey, Map<String, Object> formData) {
    }
}
