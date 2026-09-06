package com.workflow.example.leave;

import com.workflow.api.dto.BizDataVO;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.bizdata.BizDataService;
import com.workflow.engine.form.bizdata.BizDataSupport;
import com.workflow.engine.process.ProcessInstanceService;
import com.workflow.engine.task.RejectService;
import com.workflow.engine.task.WorkflowTaskService;
import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.task.api.Task;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 请假单（leave_bill）业务门面。
 *
 * <p>草稿期 CRUD 走 {@link BizDataService}（触发 handler 钩子 + 流程守卫：
 * 草稿期无流程实例 → 自由增删改；流程运行中 → 409 拦截）。
 *
 * <p>submit/approve/reject 的<b>状态字段更新</b>统一走
 * {@link BizDataSupport#updateGeneric}（无守卫通道），原因：
 * submit 启动流程后运行中实例已存在，approve/reject 时流程尚未（或刚）结束，
 * 走 {@link BizDataService#update} 会被运行时守卫 409 拦截——
 * 状态流转是流程引擎驱动的内部变更，不属于"业务数据被并发修改"场景。
 */
@Service
public class LeaveBillBizService {

    public static final String FORM_KEY = LeaveBillHandler.FORM_KEY;
    public static final String PROCESS_KEY = "leave-bill";

    private final BizDataService bizDataService;
    private final BizDataSupport bizDataSupport;
    private final ProcessInstanceService processInstanceService;
    private final WorkflowTaskService workflowTaskService;
    private final RejectService rejectService;

    public LeaveBillBizService(BizDataService bizDataService,
                               BizDataSupport bizDataSupport,
                               ProcessInstanceService processInstanceService,
                               WorkflowTaskService workflowTaskService,
                               RejectService rejectService) {
        this.bizDataService = bizDataService;
        this.bizDataSupport = bizDataSupport;
        this.processInstanceService = processInstanceService;
        this.workflowTaskService = workflowTaskService;
        this.rejectService = rejectService;
    }

    // ==================== 草稿期 CRUD（走门面，含 handler + 守卫） ====================

    @Transactional
    public BizDataVO createDraft(Map<String, Object> data) {
        return bizDataService.create(FORM_KEY, data);
    }

    @Transactional
    public BizDataVO updateDraft(String id, Map<String, Object> data, Integer version) {
        return bizDataService.update(FORM_KEY, id, data, version);
    }

    @Transactional
    public void deleteDraft(String id) {
        bizDataService.delete(FORM_KEY, id);
    }

    public String getStatus(String id) {
        Object status = bizDataService.getById(FORM_KEY, id).getData().get("status");
        return status == null ? null : String.valueOf(status);
    }

    /** 重新查询当前行（拿最新版本/状态）。 */
    public BizDataVO refresh(String id) {
        return bizDataService.getById(FORM_KEY, id);
    }

    // ==================== 流程语义操作 ====================

    /**
     * 提交审批：启动流程 + 置状态「待审批」。
     * 状态更新走 updateGeneric（startProcess 后运行中实例已存在，门面 update 会被守卫 409）。
     */
    @Transactional
    public BizDataVO submit(String id) {
        BizDataVO current = bizDataService.getById(FORM_KEY, id);
        String submitter = currentUser();
        Map<String, Object> variables = new LinkedHashMap<>();
        variables.put("initiator", submitter);
        variables.put("submitterId", submitter);
        variables.put("manager", "manager"); // 示例简化：审批人取固定变量
        processInstanceService.startProcess(PROCESS_KEY, id, variables);
        return bizDataSupport.updateGeneric(FORM_KEY, id, Map.of("status", "待审批"), current.getVersion());
    }

    /**
     * 审批通过：完成任务 + 置状态「已批准」。
     * businessKey（= 业务行 id）必须在 complete 之前从运行时实例取——complete 后流程结束，运行时查不到。
     */
    @Transactional
    public BizDataVO approve(String taskId) {
        String bizKey = requireRunningBizKey(taskId);
        BizDataVO current = bizDataService.getById(FORM_KEY, bizKey);
        workflowTaskService.completeTaskWithResponse(taskId, Map.of());
        return bizDataSupport.updateGeneric(FORM_KEY, bizKey, Map.of("status", "已批准"), current.getVersion());
    }

    /**
     * 驳回：流程移回发起人节点（流程仍在运行）+ 置状态「已驳回」。
     */
    @Transactional
    public BizDataVO reject(String taskId, String reason) {
        String bizKey = requireRunningBizKey(taskId);
        BizDataVO current = bizDataService.getById(FORM_KEY, bizKey);
        rejectService.reject(taskId, currentUser(), reason);
        return bizDataSupport.updateGeneric(FORM_KEY, bizKey, Map.of("status", "已驳回"), current.getVersion());
    }

    /**
     * 从待办任务反查业务行 id：task → processInstanceId → 运行时 businessKey。
     * 仅支持运行时仍在的实例（approve/reject 均在流程结束前调用）。
     */
    private String requireRunningBizKey(String taskId) {
        Task task = workflowTaskService.getTask(taskId)
                .orElseThrow(() -> new BusinessException(404, "任务不存在: " + taskId));
        ProcessInstance pi = processInstanceService.getProcessInstance(task.getProcessInstanceId())
                .orElseThrow(() -> new BusinessException(404, "流程实例不存在: " + task.getProcessInstanceId()));
        return pi.getBusinessKey();
    }

    /** 示例简化：真实环境从登录上下文取当前用户（此处固定值便于演示）。 */
    private String currentUser() {
        return "system";
    }
}