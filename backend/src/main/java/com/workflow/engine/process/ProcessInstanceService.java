package com.workflow.engine.process;

import com.workflow.engine.tenant.TenantProvider;
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
    private final TenantProvider tenantProvider;

    public ProcessInstanceService(RuntimeService runtimeService, TenantProvider tenantProvider) {
        this.runtimeService = runtimeService;
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

    public Page<ProcessInstance> listProcessInstances(Pageable pageable) {
        String tenantId = tenantProvider.getTenantId();
        ProcessInstanceQuery query = runtimeService.createProcessInstanceQuery()
                .processInstanceTenantId(tenantId)
                .orderByProcessInstanceId()
                .desc();

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