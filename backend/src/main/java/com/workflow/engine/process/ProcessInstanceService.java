package com.workflow.engine.process;

import com.workflow.engine.tenant.TenantProvider;
import org.flowable.engine.HistoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.engine.runtime.ProcessInstanceQuery;
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

    private final RuntimeService runtimeService;
    private final HistoryService historyService;
    private final TenantProvider tenantProvider;

    public ProcessInstanceService(RuntimeService runtimeService,
                                  HistoryService historyService,
                                  TenantProvider tenantProvider) {
        this.runtimeService = runtimeService;
        this.historyService = historyService;
        this.tenantProvider = tenantProvider;
    }

    @Transactional
    public ProcessInstance startProcess(String processKey, Map<String, Object> variables) {
        String tenantId = tenantProvider.getTenantId();
        return runtimeService.startProcessInstanceByKeyAndTenantId(processKey, variables, tenantId);
    }

    @Transactional
    public ProcessInstance startProcess(String processKey, String businessKey, Map<String, Object> variables) {
        String tenantId = tenantProvider.getTenantId();
        return runtimeService.startProcessInstanceByKeyAndTenantId(processKey, businessKey, variables, tenantId);
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
}