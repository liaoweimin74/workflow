package com.workflow.engine.logicflow.service;

import com.workflow.common.exception.BusinessException;
import com.workflow.engine.logicflow.entity.FormLogicBinding;
import com.workflow.engine.logicflow.repository.FormLogicBindingRepository;
import com.workflow.framework.security.domain.LoginUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * 表单 × 逻辑编排绑定应用服务：绑定 CRUD + 触发调度。
 *
 * <p>调度语义：
 * <ul>
 *   <li>BEFORE_*：同步执行，任一绑定失败（status != SUCCESS 或运行异常）即抛
 *       {@link BusinessException} 拒绝当前操作（配合调用方 @Transactional 回滚）——校验语义，无策略可选；</li>
 *   <li>AFTER_* + SYNC_IN_TX（默认）：同步执行，失败抛异常回滚主操作（强一致）；</li>
 *   <li>AFTER_* + AFTER_COMMIT：注册事务提交后回调执行，失败仅 WARN + 运行历史留痕，
 *       不影响已提交的主操作（弱一致，适合通知/外部系统）。</li>
 * </ul>
 *
 * <p>触发顺序：同触发点多绑定按创建时间升序依次执行。调用方负责组装入参
 * （{@link #buildVars}），并通过 {@link #dispatch} 触发。
 */
@Service
public class FormLogicBindingService {

    private static final Logger log = LoggerFactory.getLogger(FormLogicBindingService.class);

    /** 表单类型。 */
    public static final String FORM_TYPE_BUSINESS = "BUSINESS";
    public static final String FORM_TYPE_WORKFLOW = "WORKFLOW";
    public static final Set<String> FORM_TYPES = Set.of(FORM_TYPE_BUSINESS, FORM_TYPE_WORKFLOW);

    /** 触发点全集。 */
    public static final String TRIG_BEFORE_CREATE = "BEFORE_CREATE";
    public static final String TRIG_AFTER_CREATE = "AFTER_CREATE";
    public static final String TRIG_BEFORE_UPDATE = "BEFORE_UPDATE";
    public static final String TRIG_AFTER_UPDATE = "AFTER_UPDATE";
    public static final String TRIG_BEFORE_DELETE = "BEFORE_DELETE";
    public static final String TRIG_AFTER_DELETE = "AFTER_DELETE";
    /** 工作流表单：审批快照保存前（校验语义，dataId 未生成）。 */
    public static final String TRIG_BEFORE_SNAPSHOT = "BEFORE_SNAPSHOT";
    /** 工作流表单：审批快照落库后（AFTER 语义，dataId = 快照记录 id）。 */
    public static final String TRIG_AFTER_SNAPSHOT = "AFTER_SNAPSHOT";
    /** 工作流表单：节点间表单数据保存前（非快照 upsert 路径，校验语义）。 */
    public static final String TRIG_BEFORE_SAVE = "BEFORE_SAVE";
    /** 工作流表单：节点间表单数据保存后（非快照 upsert 路径，dataId = 记录 id）。 */
    public static final String TRIG_AFTER_SAVE = "AFTER_SAVE";
    /** 工作流表单：审批任务通过后（每次 complete 动作后；AFTER 语义）。 */
    public static final String TRIG_AFTER_TASK_APPROVE = "AFTER_TASK_APPROVE";
    /** 工作流表单：审批拒绝（终止全流程）后（AFTER 语义）。 */
    public static final String TRIG_AFTER_TASK_REJECT = "AFTER_TASK_REJECT";
    /** 工作流表单：驳回退回发起人后（AFTER 语义）。 */
    public static final String TRIG_AFTER_TASK_RETURN = "AFTER_TASK_RETURN";
    /** 工作流表单：流程实例结束（最后一个审批任务通过）后（AFTER 语义）。 */
    public static final String TRIG_AFTER_PROCESS_FINISH = "AFTER_PROCESS_FINISH";
    /** 工作流表单：任务转办后（AFTER 语义，toUser = 新办理人）。 */
    public static final String TRIG_AFTER_TASK_TRANSFER = "AFTER_TASK_TRANSFER";
    /** 工作流表单：任务委派后（AFTER 语义，toUser = 被委派人）。 */
    public static final String TRIG_AFTER_TASK_DELEGATE = "AFTER_TASK_DELEGATE";
    /** 工作流表单：加签后（AFTER 语义，toUser = 加签人，多人逗号分隔）。 */
    public static final String TRIG_AFTER_TASK_ADD_SIGN = "AFTER_TASK_ADD_SIGN";
    /** 工作流表单：任务认领后（AFTER 语义）。 */
    public static final String TRIG_AFTER_TASK_CLAIM = "AFTER_TASK_CLAIM";
    /** 工作流表单：审批催办后（AFTER 语义；触发频率受催办限流天然约束）。 */
    public static final String TRIG_AFTER_TASK_URGE = "AFTER_TASK_URGE";
    /** 工作流表单：发起人撤回（回退发起节点）后（AFTER 语义）。 */
    public static final String TRIG_AFTER_PROCESS_WITHDRAW = "AFTER_PROCESS_WITHDRAW";
    /** 工作流表单：流程实例终止（管理员作废）后（AFTER 语义）。 */
    public static final String TRIG_AFTER_PROCESS_TERMINATE = "AFTER_PROCESS_TERMINATE";
    /** 工作流表单：流程实例启动（含首份表单数据落库）后（AFTER 语义）。 */
    public static final String TRIG_AFTER_PROCESS_START = "AFTER_PROCESS_START";
    public static final Set<String> TRIGGER_TYPES = Set.of(
            TRIG_BEFORE_CREATE, TRIG_AFTER_CREATE,
            TRIG_BEFORE_UPDATE, TRIG_AFTER_UPDATE,
            TRIG_BEFORE_DELETE, TRIG_AFTER_DELETE,
            TRIG_BEFORE_SNAPSHOT, TRIG_AFTER_SNAPSHOT,
            TRIG_BEFORE_SAVE, TRIG_AFTER_SAVE,
            TRIG_AFTER_TASK_APPROVE, TRIG_AFTER_TASK_REJECT,
            TRIG_AFTER_TASK_RETURN, TRIG_AFTER_PROCESS_FINISH,
            TRIG_AFTER_TASK_TRANSFER, TRIG_AFTER_TASK_DELEGATE,
            TRIG_AFTER_TASK_ADD_SIGN, TRIG_AFTER_TASK_CLAIM,
            TRIG_AFTER_TASK_URGE,
            TRIG_AFTER_PROCESS_WITHDRAW, TRIG_AFTER_PROCESS_TERMINATE,
            TRIG_AFTER_PROCESS_START);

    /**
     * 未显式指定 executionMode 时默认 AFTER_COMMIT 的触发点：转办/委派/加签/认领/催办/
     * 撤回/终止/启动等辅助动作，逻辑流失败不应阻断审批主操作（弱一致，留痕即可）。
     * 显式传 SYNC_IN_TX 仍可强一致。
     */
    public static final Set<String> DEFAULT_AFTER_COMMIT_TRIGGERS = Set.of(
            TRIG_AFTER_TASK_TRANSFER, TRIG_AFTER_TASK_DELEGATE,
            TRIG_AFTER_TASK_ADD_SIGN, TRIG_AFTER_TASK_CLAIM,
            TRIG_AFTER_TASK_URGE,
            TRIG_AFTER_PROCESS_WITHDRAW, TRIG_AFTER_PROCESS_TERMINATE,
            TRIG_AFTER_PROCESS_START);

    public static final String MODE_SYNC_IN_TX = "SYNC_IN_TX";
    public static final String MODE_AFTER_COMMIT = "AFTER_COMMIT";
    public static final Set<String> EXECUTION_MODES = Set.of(MODE_SYNC_IN_TX, MODE_AFTER_COMMIT);

    private final FormLogicBindingRepository repository;
    private final LogicFlowService logicFlowService;

    public FormLogicBindingService(FormLogicBindingRepository repository,
                                   LogicFlowService logicFlowService) {
        this.repository = repository;
        this.logicFlowService = logicFlowService;
    }

    // ------------------------------------------------------------------
    // 绑定 CRUD
    // ------------------------------------------------------------------

    /** 某表单全部绑定（租户内）。 */
    public List<FormLogicBinding> list(String tenantId, String formType, String formKey) {
        return repository.findByTenantIdAndFormTypeAndFormKeyOrderByCreatedAtAsc(
                normalize(tenantId), requireType(formType), requireKey(formKey));
    }

    /** 创建绑定（校验枚举/唯一性；BEFORE_* 强制 SYNC_IN_TX）。 */
    @Transactional
    public FormLogicBinding create(String tenantId, String formType, String formKey, String triggerType,
                                   String flowKey, String executionMode, Boolean enabled, String description) {
        String tenant = normalize(tenantId);
        String type = requireType(formType);
        String key = requireKey(formKey);
        String trigger = requireTrigger(triggerType);
        String flow = requireKey(flowKey, "flowKey");
        String mode = normalizeMode(executionMode, trigger);

        if (repository.existsByTenantIdAndFormTypeAndFormKeyAndTriggerTypeAndFlowKey(
                tenant, type, key, trigger, flow)) {
            throw new BusinessException("绑定已存在: " + key + "." + trigger + " -> " + flow);
        }
        // 目标流须存在（发布状态运行时再校验，允许先绑后发）
        logicFlowService.requireByKey(tenant, flow);

        FormLogicBinding binding = new FormLogicBinding();
        binding.setId(UUID.randomUUID().toString().replace("-", ""));
        binding.setTenantId(tenant);
        binding.setFormType(type);
        binding.setFormKey(key);
        binding.setTriggerType(trigger);
        binding.setFlowKey(flow);
        binding.setExecutionMode(mode);
        binding.setEnabled(enabled == null ? Boolean.TRUE : enabled);
        binding.setDescription(description);
        return repository.save(binding);
    }

    /** 更新绑定（触发点/流/模式/启停/描述）。 */
    @Transactional
    public FormLogicBinding update(String tenantId, String id, String triggerType, String flowKey,
                                   String executionMode, Boolean enabled, String description) {
        FormLogicBinding binding = requireOwned(tenantId, id);
        String tenant = normalize(tenantId);
        if (flowKey != null) {
            String flow = requireKey(flowKey, "flowKey");
            logicFlowService.requireByKey(tenant, flow);
            binding.setFlowKey(flow);
        }
        if (triggerType != null) {
            binding.setTriggerType(requireTrigger(triggerType));
        }
        String effectiveTrigger = binding.getTriggerType();
        binding.setExecutionMode(normalizeMode(executionMode != null ? executionMode
                : binding.getExecutionMode(), effectiveTrigger));
        // 触发点变更为 BEFORE_* 时强制同事务（校验语义不允许提交后执行）
        if (effectiveTrigger.startsWith("BEFORE_")) {
            binding.setExecutionMode(MODE_SYNC_IN_TX);
        }
        if (enabled != null) {
            binding.setEnabled(enabled);
        }
        if (description != null) {
            binding.setDescription(description);
        }
        return repository.save(binding);
    }

    /** 删除绑定。 */
    @Transactional
    public void delete(String tenantId, String id) {
        repository.delete(requireOwned(tenantId, id));
    }

    // ------------------------------------------------------------------
    // 触发调度
    // ------------------------------------------------------------------

    /**
     * 触发调度：按 (tenant, formType, formKey, trigger) 取启用绑定依次执行。
     * BEFORE_ 与 AFTER_COMMIT 之外的失败语义见类注释；本方法不抛出「无绑定」类噪音。
     *
     * @param vars 触发变量快照（调度期间按只读处理；AFTER_COMMIT 路径提交后引用同一快照）
     */
    public void dispatch(String tenantId, String formType, String formKey,
                         String triggerType, Map<String, Object> vars) {
        String tenant = normalize(tenantId);
        List<FormLogicBinding> bindings = repository
                .findByTenantIdAndFormTypeAndFormKeyAndTriggerTypeAndEnabledTrueOrderByCreatedAtAsc(
                        tenant, formType, formKey, triggerType);
        if (bindings.isEmpty()) {
            return;
        }
        boolean before = triggerType.startsWith("BEFORE_");
        for (FormLogicBinding binding : bindings) {
            if (!before && MODE_AFTER_COMMIT.equals(binding.getExecutionMode())
                    && TransactionSynchronizationManager.isSynchronizationActive()) {
                registerAfterCommit(binding, vars);
            } else {
                runAndEnforce(binding, vars);
            }
        }
    }

    /** BEFORE_ 与 SYNC_IN_TX 路径：同步执行，失败抛 BusinessException（拒绝/回滚）。 */
    private void runAndEnforce(FormLogicBinding binding, Map<String, Object> vars) {
        LogicFlowService.RunResult result;
        try {
            result = logicFlowService.runByKey(binding.getTenantId(), binding.getFlowKey(), vars);
        } catch (BusinessException e) {
            // 流不存在/未发布等前置错误同样视为触发失败（BEFORE/SYNC_IN_TX 需阻断）
            throw new BusinessException("FORM_FLOW_TRIGGER_FAILED: " + binding.getFlowKey()
                    + ": " + e.getMessage());
        }
        if (!LogicFlowService.STATUS_SUCCESS.equals(result.status())) {
            throw new BusinessException("FORM_FLOW_TRIGGER_FAILED: " + binding.getFlowKey()
                    + ": " + result.errorMessage());
        }
    }

    /** AFTER_COMMIT 路径：注册提交后回调；执行异常仅 WARN（运行历史已留痕）。 */
    private void registerAfterCommit(FormLogicBinding binding, Map<String, Object> vars) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                try {
                    LogicFlowService.RunResult result =
                            logicFlowService.runByKey(binding.getTenantId(), binding.getFlowKey(), vars);
                    if (!LogicFlowService.STATUS_SUCCESS.equals(result.status())) {
                        log.warn("表单触发编排失败(提交后, 不回滚): binding={} flow={} run={} error={}",
                                binding.getId(), binding.getFlowKey(), result.runId(), result.errorMessage());
                    }
                } catch (Exception e) {
                    log.warn("表单触发编排异常(提交后, 不回滚): binding={} flow={}",
                            binding.getId(), binding.getFlowKey(), e);
                }
            }
        });
    }

    // ------------------------------------------------------------------
    // 触发变量组装
    // ------------------------------------------------------------------

    /**
     * 组装触发入参（系统注入约定，第一版免映射）：
     * {@code formData / formDataExisting / formKey / formType / dataId / opType / operator / __trigger}。
     *
     * @param formData        当前数据行（BUSINESS：字段 Map；WORKFLOW：dataJson 解析后的 Map）
     * @param formDataExisting 更新/删除前的旧行（create/快照传 null）
     * @param opType          CREATE | UPDATE | DELETE | SNAPSHOT | SAVE
     */
    public Map<String, Object> buildVars(String formType, String formKey, String triggerType,
                                         String opType, String dataId,
                                         Map<String, Object> formData, Map<String, Object> formDataExisting) {
        Map<String, Object> vars = new LinkedHashMap<>();
        vars.put("formData", formData);
        vars.put("formDataExisting", formDataExisting);
        vars.put("formKey", formKey);
        vars.put("formType", formType);
        vars.put("dataId", dataId);
        vars.put("opType", opType);
        vars.put("operator", currentOperator());
        Map<String, Object> trigger = new LinkedHashMap<>();
        trigger.put("source", "form-submit");
        trigger.put("formType", formType);
        trigger.put("formKey", formKey);
        trigger.put("trigger", triggerType);
        trigger.put("opType", opType);
        vars.put("__trigger", trigger);
        return vars;
    }

    /** 当前登录人（无会话上下文时归为 system，如内部任务/异步线程）。 */
    private static String currentOperator() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof LoginUser loginUser
                && loginUser.getUsername() != null && !loginUser.getUsername().isBlank()) {
            return loginUser.getUsername();
        }
        return "system";
    }

    /**
     * 组装审批事件触发入参（系统注入约定，与前端 TRIGGER_PARAM_SPECS 逐字段对齐）：
     * {@code formData / processInstanceId / taskId / formKey / formType / opType / operator / comment / __trigger}。
     *
     * <p>与 {@link #buildVars} 分开组装：审批事件的上下文是流程实例而非表单 CRUD 行，
     * 不注入 formDataExisting/dataId；formData 取该流程实例最新一条表单数据（可为 null）。
     *
     * @param formData          该流程实例最新表单数据（解析失败/无记录传 null）
     * @param opType            APPROVE | REJECT | RETURN | FINISH | TRANSFER | DELEGATE |
     *                          ADD_SIGN | CLAIM | URGE | WITHDRAW | TERMINATE | START
     * @param comment           审批意见/拒绝原因（可为 null）
     * @param operatorOverride  审批人（null 时回落当前登录人）
     */
    public Map<String, Object> buildApprovalVars(String formType, String formKey, String triggerType,
                                                 String opType, String processInstanceId, String taskId,
                                                 Map<String, Object> formData, String comment,
                                                 String operatorOverride) {
        Map<String, Object> vars = new LinkedHashMap<>();
        vars.put("formData", formData);
        vars.put("processInstanceId", processInstanceId);
        vars.put("taskId", taskId);
        vars.put("formKey", formKey);
        vars.put("formType", formType);
        vars.put("opType", opType);
        vars.put("operator", operatorOverride != null && !operatorOverride.isBlank()
                ? operatorOverride : currentOperator());
        vars.put("comment", comment);
        Map<String, Object> trigger = new LinkedHashMap<>();
        trigger.put("source", "form-approval");
        trigger.put("formType", formType);
        trigger.put("formKey", formKey);
        trigger.put("trigger", triggerType);
        trigger.put("opType", opType);
        trigger.put("processInstanceId", processInstanceId);
        trigger.put("taskId", taskId);
        vars.put("__trigger", trigger);
        return vars;
    }

    // ------------------------------------------------------------------
    // 内部校验
    // ------------------------------------------------------------------

    private FormLogicBinding requireOwned(String tenantId, String id) {
        FormLogicBinding binding = repository.findById(id)
                .orElseThrow(() -> new BusinessException("绑定不存在: " + id));
        if (!binding.getTenantId().equals(normalize(tenantId))) {
            throw new BusinessException("绑定不存在: " + id);
        }
        return binding;
    }

    private static String requireType(String formType) {
        if (formType == null || !FORM_TYPES.contains(formType)) {
            throw new BusinessException("formType 非法（须 BUSINESS/WORKFLOW）: " + formType);
        }
        return formType;
    }

    private static String requireTrigger(String triggerType) {
        if (triggerType == null || !TRIGGER_TYPES.contains(triggerType)) {
            throw new BusinessException("triggerType 非法: " + triggerType);
        }
        return triggerType;
    }

    private static String requireKey(String key) {
        return requireKey(key, "formKey");
    }

    private static String requireKey(String key, String field) {
        if (key == null || key.isBlank()) {
            throw new BusinessException(field + " 不能为空");
        }
        return key.trim();
    }

    /** BEFORE_* 强制 SYNC_IN_TX；辅助动作默认 AFTER_COMMIT，其余默认 SYNC_IN_TX，均可显式覆盖。 */
    private static String normalizeMode(String executionMode, String triggerType) {
        if (triggerType.startsWith("BEFORE_")) {
            return MODE_SYNC_IN_TX;
        }
        if (executionMode == null || executionMode.isBlank()) {
            return DEFAULT_AFTER_COMMIT_TRIGGERS.contains(triggerType)
                    ? MODE_AFTER_COMMIT : MODE_SYNC_IN_TX;
        }
        if (!EXECUTION_MODES.contains(executionMode)) {
            throw new BusinessException("executionMode 非法（须 SYNC_IN_TX/AFTER_COMMIT）: " + executionMode);
        }
        return executionMode;
    }

    private static String normalize(String tenantId) {
        return tenantId == null || tenantId.isBlank() ? "default" : tenantId;
    }
}
