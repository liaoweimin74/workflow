package com.workflow.engine.task;

import com.workflow.api.dto.CompleteTaskResponse;
import com.workflow.api.dto.TaskDetailVO;
import com.workflow.api.dto.TaskDoneFilter;
import com.workflow.api.dto.TaskDoneVO;
import com.workflow.api.dto.TaskTodoFilter;
import com.workflow.api.dto.TaskTodoVO;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.system.domain.vo.UserVO;
import com.workflow.system.service.UserService;
import org.flowable.engine.HistoryService;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.history.HistoricProcessInstance;
import org.flowable.engine.repository.ProcessDefinition;
import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.task.api.Task;
import org.flowable.task.api.history.HistoricTaskInstance;
import org.flowable.variable.api.history.HistoricVariableInstance;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class WorkflowTaskService {

    private final org.flowable.engine.TaskService flowableTaskService;
    private final HistoryService historyService;
    private final TenantProvider tenantProvider;
    private final RuntimeService runtimeService;
    private final RepositoryService repositoryService;
    private final UserService userService;

    public WorkflowTaskService(org.flowable.engine.TaskService flowableTaskService,
                               HistoryService historyService,
                               TenantProvider tenantProvider,
                               RuntimeService runtimeService,
                               RepositoryService repositoryService,
                               UserService userService) {
        this.flowableTaskService = flowableTaskService;
        this.historyService = historyService;
        this.tenantProvider = tenantProvider;
        this.runtimeService = runtimeService;
        this.repositoryService = repositoryService;
        this.userService = userService;
    }

    public Page<Task> listTodoTasks(String assignee, Pageable pageable) {
        String tenantId = tenantProvider.getTenantId();
        var query = flowableTaskService.createTaskQuery()
                .taskTenantId(tenantId)
                .taskAssignee(assignee)
                .orderByTaskCreateTime()
                .desc();

        long total = query.count();
        List<Task> content = query
                .listPage((int) pageable.getOffset(), pageable.getPageSize());

        return new PageImpl<>(content, pageable, total);
    }

    public Page<Task> listCandidateTasks(String userId, Pageable pageable) {
        String tenantId = tenantProvider.getTenantId();
        var query = flowableTaskService.createTaskQuery()
                .taskTenantId(tenantId)
                .taskCandidateUser(userId)
                .orderByTaskCreateTime()
                .desc();

        long total = query.count();
        List<Task> content = query
                .listPage((int) pageable.getOffset(), pageable.getPageSize());

        return new PageImpl<>(content, pageable, total);
    }

    public Page<HistoricTaskInstance> listHistoricTasks(String userId, Pageable pageable) {
        String tenantId = tenantProvider.getTenantId();
        var query = historyService.createHistoricTaskInstanceQuery()
                .taskTenantId(tenantId)
                .taskAssignee(userId)
                .finished()
                .orderByHistoricTaskInstanceEndTime()
                .desc();

        long total = query.count();
        List<HistoricTaskInstance> content = query
                .listPage((int) pageable.getOffset(), pageable.getPageSize());

        return new PageImpl<>(content, pageable, total);
    }

    // ==================== VO 方法 ====================

    /**
     * 查询待办任务列表，返回 TaskTodoVO 分页（含关联字段）。
     *
     * <p>批量查询 ProcessInstance + UserService 避免 N+1。
     *
     * @param assignee 办理人
     * @param pageable 分页
     * @param filter   过滤参数（processName, initiator, createTimeStart/End）
     * @return TaskTodoVO 分页
     */
    public Page<TaskTodoVO> listTodoTasksVO(String assignee, Pageable pageable, TaskTodoFilter filter) {
        String tenantId = tenantProvider.getTenantId();
        var query = flowableTaskService.createTaskQuery()
                .taskTenantId(tenantId)
                .taskAssignee(assignee)
                .orderByTaskCreateTime()
                .desc();

        // createTime 范围过滤（Flowable 原生支持 taskCreatedAfter/Before）
        if (filter != null) {
            if (filter.createTimeStart() != null) {
                query.taskCreatedAfter(parseDate(filter.createTimeStart()));
            }
            if (filter.createTimeEnd() != null) {
                query.taskCreatedBefore(parseDate(filter.createTimeEnd()));
            }
        }

        long total = query.count();
        List<Task> tasks = query.listPage((int) pageable.getOffset(), pageable.getPageSize());

        List<TaskTodoVO> vos = assembleTodoVOs(tasks);

        // 内存过滤 processName / initiator（Flowable TaskQuery 不直接支持）
        if (filter != null) {
            vos = vos.stream()
                    .filter(vo -> matchesProcessName(vo, filter.processName()))
                    .filter(vo -> matchesInitiator(vo, filter.initiator()))
                    .toList();
        }

        return new PageImpl<>(vos, pageable, total);
    }

    /**
     * 查询已办任务列表，返回 TaskDoneVO 分页（含关联字段）。
     *
     * @param userId   办理人
     * @param pageable 分页
     * @param filter   过滤参数（processName, initiator, endTimeStart/End, approveResult）
     * @return TaskDoneVO 分页
     */
    public Page<TaskDoneVO> listHistoricTasksVO(String userId, Pageable pageable, TaskDoneFilter filter) {
        String tenantId = tenantProvider.getTenantId();
        var query = historyService.createHistoricTaskInstanceQuery()
                .taskTenantId(tenantId)
                .taskAssignee(userId)
                .finished()
                .orderByHistoricTaskInstanceEndTime()
                .desc();

        // endTime 范围过滤
        if (filter != null) {
            if (filter.endTimeStart() != null) {
                query.taskCompletedAfter(parseDate(filter.endTimeStart()));
            }
            if (filter.endTimeEnd() != null) {
                query.taskCompletedBefore(parseDate(filter.endTimeEnd()));
            }
        }

        long total = query.count();
        List<HistoricTaskInstance> tasks = query.listPage((int) pageable.getOffset(), pageable.getPageSize());

        List<TaskDoneVO> vos = assembleDoneVOs(tasks);

        // 内存过滤 processName / initiator / approveResult
        if (filter != null) {
            vos = vos.stream()
                    .filter(vo -> matchesProcessName(vo, filter.processName()))
                    .filter(vo -> matchesInitiator(vo, filter.initiator()))
                    .filter(vo -> filter.approveResult() == null || filter.approveResult().equals(vo.getApproveResult()))
                    .toList();
        }

        return new PageImpl<>(vos, pageable, total);
    }

    // ==================== VO 组装（批量查询，避免 N+1）====================

    private List<TaskTodoVO> assembleTodoVOs(List<Task> tasks) {
        if (tasks.isEmpty()) {
            return List.of();
        }

        // 1. 批量收集 processInstanceIds
        Set<String> processInstanceIds = tasks.stream()
                .map(Task::getProcessInstanceId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        // 2. 批量查询 ProcessInstance
        Map<String, ProcessInstance> piMap = batchQueryProcessInstances(processInstanceIds);

        // 3. 批量收集 processDefinitionIds → 查 ProcessDefinition 名称
        Set<String> processDefinitionIds = tasks.stream()
                .map(Task::getProcessDefinitionId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<String, ProcessDefinition> pdMap = batchQueryProcessDefinitions(processDefinitionIds);

        // 4. 批量查询 initiator 变量 + 解析用户名
        Map<String, String> initiatorMap = batchQueryInitiators(processInstanceIds, piMap);
        Map<String, String> initiatorNameMap = batchQueryInitiatorNames(initiatorMap.values());

        // 5. 组装 VO
        return tasks.stream().map(task -> {
            TaskTodoVO vo = new TaskTodoVO();
            vo.setTaskId(task.getId());
            vo.setProcessInstanceId(task.getProcessInstanceId());
            vo.setProcessDefinitionId(task.getProcessDefinitionId());
            vo.setCurrentNodeName(task.getName());
            vo.setAssignee(task.getAssignee());
            if (task.getCreateTime() != null) {
                vo.setCreateTime(formatDate(task.getCreateTime()));
            }

            ProcessInstance pi = piMap.get(task.getProcessInstanceId());
            if (pi != null) {
                vo.setBusinessKey(pi.getBusinessKey());
            }

            ProcessDefinition pd = pdMap.get(task.getProcessDefinitionId());
            if (pd != null) {
                vo.setProcessName(pd.getName() != null ? pd.getName() : pd.getKey());
            }

            String initiator = initiatorMap.get(task.getProcessInstanceId());
            vo.setInitiator(initiator);
            vo.setInitiatorName(initiatorNameMap.get(initiator));

            return vo;
        }).toList();
    }

    private List<TaskDoneVO> assembleDoneVOs(List<HistoricTaskInstance> tasks) {
        if (tasks.isEmpty()) {
            return List.of();
        }

        // 1. 批量收集 processInstanceIds
        Set<String> processInstanceIds = tasks.stream()
                .map(HistoricTaskInstance::getProcessInstanceId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        // 2. 批量查询 HistoricProcessInstance
        Map<String, HistoricProcessInstance> piMap = batchQueryHistoricProcessInstances(processInstanceIds);

        // 3. 批量收集 processDefinitionIds → 查 ProcessDefinition 名称
        Set<String> processDefinitionIds = tasks.stream()
                .map(HistoricTaskInstance::getProcessDefinitionId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<String, ProcessDefinition> pdMap = batchQueryProcessDefinitions(processDefinitionIds);

        // 4. 批量查询 initiator 变量 + 解析用户名
        Map<String, String> initiatorMap = batchQueryHistoricInitiators(processInstanceIds);
        Map<String, String> initiatorNameMap = batchQueryInitiatorNames(initiatorMap.values());

        // 5. 组装 VO
        return tasks.stream().map(task -> {
            TaskDoneVO vo = new TaskDoneVO();
            vo.setTaskId(task.getId());
            vo.setProcessInstanceId(task.getProcessInstanceId());
            vo.setProcessDefinitionId(task.getProcessDefinitionId());
            vo.setCurrentNodeName(task.getName());
            vo.setAssignee(task.getAssignee());
            if (task.getStartTime() != null) {
                vo.setCreateTime(formatDate(task.getStartTime()));
            }
            if (task.getEndTime() != null) {
                vo.setEndTime(formatDate(task.getEndTime()));
            }

            HistoricProcessInstance pi = piMap.get(task.getProcessInstanceId());
            if (pi != null) {
                vo.setBusinessKey(pi.getBusinessKey());
            }

            ProcessDefinition pd = pdMap.get(task.getProcessDefinitionId());
            if (pd != null) {
                vo.setProcessName(pd.getName() != null ? pd.getName() : pd.getKey());
            }

            String initiator = initiatorMap.get(task.getProcessInstanceId());
            vo.setInitiator(initiator);
            vo.setInitiatorName(initiatorNameMap.get(initiator));

            // approveResult: wf_task_comment 表尚未创建，暂设为 null
            // TODO: Task 后续实现 wf_task_comment 查询后填充

            return vo;
        }).toList();
    }

    // ==================== 批量查询辅助方法 ====================

    private Map<String, ProcessInstance> batchQueryProcessInstances(Set<String> processInstanceIds) {
        if (processInstanceIds.isEmpty()) {
            return Map.of();
        }
        List<ProcessInstance> instances = runtimeService.createProcessInstanceQuery()
                .processInstanceIds(processInstanceIds)
                .list();
        return instances.stream()
                .collect(Collectors.toMap(ProcessInstance::getId, Function.identity(), (a, b) -> a));
    }

    private Map<String, HistoricProcessInstance> batchQueryHistoricProcessInstances(Set<String> processInstanceIds) {
        if (processInstanceIds.isEmpty()) {
            return Map.of();
        }
        List<HistoricProcessInstance> instances = historyService.createHistoricProcessInstanceQuery()
                .processInstanceIds(processInstanceIds)
                .list();
        return instances.stream()
                .collect(Collectors.toMap(HistoricProcessInstance::getId, Function.identity(), (a, b) -> a));
    }

    private Map<String, ProcessDefinition> batchQueryProcessDefinitions(Set<String> processDefinitionIds) {
        if (processDefinitionIds.isEmpty()) {
            return Map.of();
        }
        List<ProcessDefinition> defs = repositoryService.createProcessDefinitionQuery()
                .processDefinitionIds(processDefinitionIds)
                .list();
        return defs.stream()
                .collect(Collectors.toMap(ProcessDefinition::getId, Function.identity(), (a, b) -> a));
    }

    /**
     * 批量查询运行中流程实例的 initiator 变量。
     */
    private Map<String, String> batchQueryInitiators(Set<String> processInstanceIds,
                                                     Map<String, ProcessInstance> piMap) {
        if (processInstanceIds.isEmpty()) {
            return Map.of();
        }
        Map<String, String> result = new HashMap<>();
        for (String piId : processInstanceIds) {
            try {
                Object initiator = runtimeService.getVariable(piId, "initiator");
                if (initiator != null) {
                    result.put(piId, String.valueOf(initiator));
                }
            } catch (Exception e) {
                // 流程实例可能已结束，变量不可查
            }
        }
        return result;
    }

    /**
     * 批量查询历史流程实例的 initiator 变量。
     */
    private Map<String, String> batchQueryHistoricInitiators(Set<String> processInstanceIds) {
        if (processInstanceIds.isEmpty()) {
            return Map.of();
        }
        Map<String, String> result = new HashMap<>();
        for (String piId : processInstanceIds) {
            try {
                HistoricVariableInstance hv = historyService.createHistoricVariableInstanceQuery()
                        .processInstanceId(piId)
                        .variableName("initiator")
                        .singleResult();
                if (hv != null && hv.getValue() != null) {
                    result.put(piId, String.valueOf(hv.getValue()));
                }
            } catch (Exception e) {
                // ignore
            }
        }
        return result;
    }

    /**
     * 批量查询用户姓名。
     */
    private Map<String, String> batchQueryInitiatorNames(Collection<String> initiatorIds) {
        if (initiatorIds == null || initiatorIds.isEmpty()) {
            return Map.of();
        }
        List<Long> userIds = initiatorIds.stream()
                .filter(Objects::nonNull)
                .map(id -> {
                    try {
                        return Long.parseLong(id);
                    } catch (NumberFormatException e) {
                        return null;
                    }
                })
                .filter(Objects::nonNull)
                .toList();

        if (userIds.isEmpty()) {
            return Map.of();
        }

        List<UserVO> users = userService.findByIds(userIds);
        return users.stream()
                .collect(Collectors.toMap(
                        u -> String.valueOf(u.id()),
                        u -> u.nickname() != null ? u.nickname() : u.username(),
                        (a, b) -> a));
    }

    // ==================== 过滤辅助 ====================

    private boolean matchesProcessName(TaskTodoVO vo, String processName) {
        return processName == null ||
                (vo.getProcessName() != null && vo.getProcessName().contains(processName));
    }

    private boolean matchesInitiator(TaskTodoVO vo, String initiator) {
        return initiator == null || initiator.equals(vo.getInitiator());
    }

    // ==================== 日期辅助 ====================

    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    private Date parseDate(String dateStr) {
        return Date.from(
                java.time.LocalDateTime.parse(dateStr, DATE_FORMATTER)
                        .atZone(ZoneId.systemDefault())
                        .toInstant());
    }

    private String formatDate(Date date) {
        return DATE_FORMATTER.format(
                date.toInstant().atZone(ZoneId.systemDefault()).toLocalDateTime());
    }

    public Optional<Task> getTask(String taskId) {
        String tenantId = tenantProvider.getTenantId();
        Task task = flowableTaskService.createTaskQuery()
                .taskId(taskId)
                .taskTenantId(tenantId)
                .singleResult();
        return Optional.ofNullable(task);
    }

    /**
     * 查询任务详情，返回 TaskDetailVO（含 processName/initiator/initiatorName/businessKey/formKey/variables）。
     *
     * <p>复用批量查询辅助方法，单任务场景直接调用。
     *
     * @param taskId 任务 ID
     * @return TaskDetailVO，任务不存在时返回 Optional.empty()
     */
    public Optional<TaskDetailVO> getTaskDetail(String taskId) {
        Optional<Task> taskOpt = getTask(taskId);
        if (taskOpt.isEmpty()) {
            return Optional.empty();
        }
        Task task = taskOpt.get();

        TaskDetailVO vo = new TaskDetailVO();
        vo.setTaskId(task.getId());
        vo.setName(task.getName());
        vo.setDescription(task.getDescription());
        vo.setAssignee(task.getAssignee());
        vo.setProcessInstanceId(task.getProcessInstanceId());
        vo.setProcessDefinitionId(task.getProcessDefinitionId());
        if (task.getCreateTime() != null) {
            vo.setCreateTime(formatDate(task.getCreateTime()));
        }

        // ProcessInstance → businessKey + initiator（复用 batch 查询模式）
        String processInstanceId = task.getProcessInstanceId();
        if (processInstanceId != null) {
            Set<String> piIdSet = Set.of(processInstanceId);

            // 1. 复用 batchQueryProcessInstances 获取运行中 ProcessInstance
            Map<String, ProcessInstance> piMap = batchQueryProcessInstances(piIdSet);
            ProcessInstance pi = piMap.get(processInstanceId);

            if (pi != null) {
                // 流程运行中：直接取 businessKey + initiator 变量
                vo.setBusinessKey(pi.getBusinessKey());

                Map<String, String> initiatorMap = batchQueryInitiators(piIdSet, piMap);
                String initiator = initiatorMap.get(processInstanceId);
                if (initiator != null) {
                    vo.setInitiator(initiator);
                    Map<String, String> nameMap = batchQueryInitiatorNames(List.of(initiator));
                    vo.setInitiatorName(nameMap.get(initiator));
                }
            } else {
                // 2. 流程已结束：fallback 查 HistoricProcessInstance 获取 businessKey
                try {
                    HistoricProcessInstance hpi = historyService.createHistoricProcessInstanceQuery()
                            .processInstanceId(processInstanceId)
                            .singleResult();
                    if (hpi != null) {
                        vo.setBusinessKey(hpi.getBusinessKey());
                    }
                } catch (Exception e) {
                    // 历史查询失败，忽略
                }

                // initiator 变量也从历史变量中获取
                Map<String, String> initiatorMap = batchQueryHistoricInitiators(piIdSet);
                String initiator = initiatorMap.get(processInstanceId);
                if (initiator != null) {
                    vo.setInitiator(initiator);
                    Map<String, String> nameMap = batchQueryInitiatorNames(List.of(initiator));
                    vo.setInitiatorName(nameMap.get(initiator));
                }
            }
        }

        // ProcessDefinition → processName
        String processDefinitionId = task.getProcessDefinitionId();
        if (processDefinitionId != null) {
            Map<String, ProcessDefinition> pdMap = batchQueryProcessDefinitions(Set.of(processDefinitionId));
            ProcessDefinition pd = pdMap.get(processDefinitionId);
            if (pd != null) {
                vo.setProcessName(pd.getName() != null ? pd.getName() : pd.getKey());
            }

            // formKey 从 BpmnModel 中当前任务的 UserTask 节点提取
            String formKey = extractFormKey(processDefinitionId, task.getTaskDefinitionKey());
            vo.setFormKey(formKey);
        }

        // variables
        try {
            Map<String, Object> variables = flowableTaskService.getVariables(taskId);
            vo.setVariables(variables);
        } catch (Exception e) {
            vo.setVariables(Map.of());
        }

        return Optional.of(vo);
    }

    /**
     * 从 BpmnModel 中提取指定 UserTask 节点的 formKey。
     *
     * @param processDefinitionId 流程定义 ID
     * @param taskDefinitionKey   任务定义键（BPMN 节点 ID）
     * @return formKey，未找到时返回 null
     */
    private String extractFormKey(String processDefinitionId, String taskDefinitionKey) {
        if (processDefinitionId == null || taskDefinitionKey == null) {
            return null;
        }
        try {
            org.flowable.bpmn.model.BpmnModel model = repositoryService.getBpmnModel(processDefinitionId);
            if (model == null) {
                return null;
            }
            for (org.flowable.bpmn.model.Process process : model.getProcesses()) {
                for (var flowElement : process.getFlowElements()) {
                    if (flowElement instanceof org.flowable.bpmn.model.UserTask userTask) {
                        if (taskDefinitionKey.equals(userTask.getId())) {
                            return userTask.getFormKey();
                        }
                    }
                }
            }
        } catch (Exception e) {
            // BpmnModel 获取失败，忽略
        }
        return null;
    }

    @Transactional
    public void claimTask(String taskId, String userId) {
        flowableTaskService.claim(taskId, userId);
    }

    @Transactional
    public void completeTask(String taskId, Map<String, Object> variables) {
        flowableTaskService.complete(taskId, variables);
    }

    /**
     * 完成任务并返回下一个任务信息。
     *
     * @param taskId    任务 ID
     * @param variables 流程变量
     * @return 包含下一个任务信息和流程结束标志的响应
     */
    @Transactional
    public CompleteTaskResponse completeTaskWithResponse(String taskId, Map<String, Object> variables) {
        // 1. 查当前任务获取 processInstanceId
        Task currentTask = flowableTaskService.createTaskQuery()
                .taskId(taskId)
                .singleResult();

        if (currentTask == null) {
            throw new IllegalStateException("Task not found: " + taskId);
        }

        String processInstanceId = currentTask.getProcessInstanceId();

        // 2. 完成任务
        flowableTaskService.complete(taskId, variables);

        // 3. 查流程是否仍在运行
        ProcessInstance runningInstance = runtimeService.createProcessInstanceQuery()
                .processInstanceId(processInstanceId)
                .singleResult();

        boolean processFinished = (runningInstance == null);

        // 4. 如果流程未结束，查下一个任务
        String nextTaskId = null;
        String nextTaskName = null;
        String nextTaskAssignee = null;
        String nextTaskDefinitionKey = null;

        if (!processFinished) {
            Task nextTask = flowableTaskService.createTaskQuery()
                    .processInstanceId(processInstanceId)
                    .singleResult();

            if (nextTask != null) {
                nextTaskId = nextTask.getId();
                nextTaskName = nextTask.getName();
                nextTaskAssignee = nextTask.getAssignee();
                nextTaskDefinitionKey = nextTask.getTaskDefinitionKey();
            }
        }

        return CompleteTaskResponse.builder()
                .processInstanceId(processInstanceId)
                .processFinished(processFinished)
                .nextTaskId(nextTaskId)
                .nextTaskName(nextTaskName)
                .nextTaskAssignee(nextTaskAssignee)
                .nextTaskDefinitionKey(nextTaskDefinitionKey)
                .build();
    }

    @Transactional
    public void delegateTask(String taskId, String userId) {
        flowableTaskService.delegateTask(taskId, userId);
    }
}