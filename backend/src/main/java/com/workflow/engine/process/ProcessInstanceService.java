package com.workflow.engine.process;

import com.workflow.engine.process.bpmn.InitiatorNodeResolver;
import com.workflow.engine.history.entity.WfTaskComment;
import com.workflow.engine.history.repository.WfTaskCommentRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.flowable.engine.HistoryService;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.engine.history.HistoricProcessInstance;
import org.flowable.engine.history.HistoricProcessInstanceQuery;
import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.engine.runtime.ProcessInstanceQuery;
import org.flowable.task.api.Task;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class ProcessInstanceService {

    private static final Logger log = LoggerFactory.getLogger(ProcessInstanceService.class);

    private final RuntimeService runtimeService;
    private final HistoryService historyService;
    private final TenantProvider tenantProvider;
    private final TaskService taskService;
    private final InitiatorNodeResolver initiatorNodeResolver;
    private final WfTaskCommentRepository commentRepository;

    public ProcessInstanceService(RuntimeService runtimeService,
                                  HistoryService historyService,
                                  TenantProvider tenantProvider,
                                  TaskService taskService,
                                  InitiatorNodeResolver initiatorNodeResolver,
                                  WfTaskCommentRepository commentRepository) {
        this.runtimeService = runtimeService;
        this.historyService = historyService;
        this.tenantProvider = tenantProvider;
        this.taskService = taskService;
        this.initiatorNodeResolver = initiatorNodeResolver;
        this.commentRepository = commentRepository;
    }

    @Transactional
    public ProcessInstance startProcess(String processKey, Map<String, Object> variables) {
        String tenantId = tenantProvider.getTenantId();
        ProcessInstance instance = runtimeService.startProcessInstanceByKeyAndTenantId(processKey, variables, tenantId);
        autoCompleteInitiatorTask(instance, variables);
        return instance;
    }

    @Transactional
    public ProcessInstance startProcess(String processKey, String businessKey, Map<String, Object> variables) {
        String tenantId = tenantProvider.getTenantId();
        ProcessInstance instance = runtimeService.startProcessInstanceByKeyAndTenantId(processKey, businessKey, variables, tenantId);
        autoCompleteInitiatorTask(instance, variables);
        return instance;
    }

    /**
     * 自动完成发起人节点，使流程流转到第一个审批节点。
     */
    private void autoCompleteInitiatorTask(ProcessInstance instance, Map<String, Object> variables) {
        try {
            String initiatorNodeId = initiatorNodeResolver.resolve(instance.getProcessDefinitionId());
            if (initiatorNodeId == null) {
                log.warn("未找到发起人节点 processDefinitionId={}", instance.getProcessDefinitionId());
                return;
            }

            List<Task> tasks = taskService.createTaskQuery()
                    .processInstanceId(instance.getId())
                    .taskDefinitionKey(initiatorNodeId)
                    .list();

            if (tasks.isEmpty()) {
                log.warn("发起人节点无待办任务 processInstanceId={} initiatorNodeId={}", instance.getId(), initiatorNodeId);
                return;
            }

            for (Task task : tasks) {
                log.info("自动完成发起人节点 task={} nodeId={} processInstanceId={}", task.getId(), initiatorNodeId, instance.getId());
                String assignee = task.getAssignee() != null ? task.getAssignee() : String.valueOf(variables.get("initiator"));
                taskService.complete(task.getId(), variables);
                // complete 后写 submit comment，此时 ACT_HI_ACTINST 已有记录
                WfTaskComment comment = new WfTaskComment();
                comment.setId(java.util.UUID.randomUUID().toString().replace("-", ""));
                comment.setTenantId(tenantProvider.getTenantId());
                comment.setTaskId(task.getId());
                comment.setProcessInstanceId(instance.getId());
                comment.setUserId(assignee);
                comment.setAction("submit");
                comment.setComment(null);
                comment.setTargetUserId(null);
                commentRepository.save(comment);
            }
        } catch (Exception e) {
            log.error("自动完成发起人节点失败 processInstanceId={}", instance.getId(), e);
        }
    }

    /**
     * 列出流程实例（无筛选，向后兼容）。
     */
    public Page<ProcessInstance> listProcessInstances(Pageable pageable) {
        return listProcessInstances(pageable, null, null, null);
    }

    /**
     * 列出流程实例，支持按发起人、状态、流程名称筛选。
     *
     * @param pageable    分页参数
     * @param initiator   发起人 ID（可选，通过流程变量 initiator 筛选）
     * @param status      状态（可选："running" → active, "suspended" → suspended）
     * @param processName 流程名称（可选，模糊匹配）
     * @return 分页结果
     */
    public Page<ProcessInstance> listProcessInstances(Pageable pageable,
                                                      String initiator,
                                                      String status,
                                                      String processName) {
        String tenantId = tenantProvider.getTenantId();
        ProcessInstanceQuery query = runtimeService.createProcessInstanceQuery()
                .processInstanceTenantId(tenantId);

        if (initiator != null && !initiator.isBlank()) {
            query.variableValueEquals("initiator", initiator);
        }
        if ("running".equalsIgnoreCase(status)) {
            query.active();
        } else if ("suspended".equalsIgnoreCase(status)) {
            query.suspended();
        }
        if (processName != null && !processName.isBlank()) {
            query.processDefinitionNameLike(processName);
        }

        query.orderByProcessInstanceId().desc();

        long total = query.count();
        List<ProcessInstance> content = query
                .listPage((int) pageable.getOffset(), pageable.getPageSize());

        return new PageImpl<>(content, pageable, total);
    }

    public Optional<ProcessInstance> getProcessInstance(String instanceId) {
        String tenantId = tenantProvider.getTenantId();
        ProcessInstance instance = runtimeService.createProcessInstanceQuery()
                .processInstanceId(instanceId)
                .processInstanceTenantId(tenantId)
                .singleResult();
        return Optional.ofNullable(instance);
    }

    /**
     * 按 ID 查询历史流程实例（包含已结束的），用于流程跟踪接口的回退查询。
     *
     * <p>已结束实例只存在于历史表（ACT_HI_PROCINST），runtime 表（ACT_RU_EXECUTION）
     * 中已无记录，直接查 runtime 会得到 404。
     */
    public Optional<HistoricProcessInstance> getHistoricProcessInstance(String instanceId) {
        String tenantId = tenantProvider.getTenantId();
        HistoricProcessInstance instance = historyService.createHistoricProcessInstanceQuery()
                .processInstanceId(instanceId)
                .processInstanceTenantId(tenantId)
                .singleResult();
        return Optional.ofNullable(instance);
    }

    @Transactional
    public void suspendProcessInstance(String instanceId) {
        runtimeService.suspendProcessInstanceById(instanceId);
    }

    @Transactional
    public void resumeProcessInstance(String instanceId) {
        runtimeService.activateProcessInstanceById(instanceId);
    }

    @Transactional
    public void terminateProcessInstance(String instanceId, String reason) {
        runtimeService.deleteProcessInstance(instanceId, reason);
    }

    /**
     * 列出历史流程实例（包含已结束的），用于"我发起的"列表。
     * 查 act_hi_procinst 表，支持按发起人、状态、流程名称筛选。
     */
    public Page<HistoricProcessInstance> listHistoricProcessInstances(Pageable pageable,
                                                                      String initiator,
                                                                      String status,
                                                                      String processName) {
        String tenantId = tenantProvider.getTenantId();
        HistoricProcessInstanceQuery query = historyService.createHistoricProcessInstanceQuery()
                .processInstanceTenantId(tenantId);

        if (initiator != null && !initiator.isBlank()) {
            query.variableValueEquals("initiator", initiator);
        }
        if ("running".equalsIgnoreCase(status)) {
            query.unfinished();
        } else if ("completed".equalsIgnoreCase(status)) {
            query.finished();
        } else if ("suspended".equalsIgnoreCase(status)) {
            // 历史表中无法直接查 suspended，只查 runtime
        }
        if (processName != null && !processName.isBlank()) {
            query.processDefinitionName(processName);
        }

        query.orderByProcessInstanceStartTime().desc();

        long total = query.count();
        List<HistoricProcessInstance> content = query
                .listPage((int) pageable.getOffset(), pageable.getPageSize());

        return new PageImpl<>(content, pageable, total);
    }
}