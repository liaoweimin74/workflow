package com.workflow.engine.process;

import com.workflow.engine.tenant.TenantProvider;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.repository.Deployment;
import org.flowable.engine.repository.ProcessDefinition;
import org.flowable.engine.repository.ProcessDefinitionQuery;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class ProcessService {

    private final RepositoryService repositoryService;
    private final TenantProvider tenantProvider;

    public ProcessService(RepositoryService repositoryService, TenantProvider tenantProvider) {
        this.repositoryService = repositoryService;
        this.tenantProvider = tenantProvider;
    }

    @Transactional
    public Deployment deployProcess(String name, String bpmnXml) {
        String tenantId = tenantProvider.getTenantId();
        return repositoryService.createDeployment()
                .name(name)
                .addString(name + ".bpmn20.xml", bpmnXml)
                .tenantId(tenantId)
                .deploy();
    }

    public Page<ProcessDefinition> listProcessDefinitions(Pageable pageable) {
        String tenantId = tenantProvider.getTenantId();
        ProcessDefinitionQuery query = repositoryService.createProcessDefinitionQuery()
                .processDefinitionTenantId(tenantId)
                .orderByProcessDefinitionVersion()
                .desc();

        long total = query.count();
        List<ProcessDefinition> content = query
                .listPage((int) pageable.getOffset(), pageable.getPageSize());

        return new PageImpl<>(content, pageable, total);
    }

    public Optional<ProcessDefinition> getProcessDefinition(String procDefId) {
        String tenantId = tenantProvider.getTenantId();
        ProcessDefinition procDef = repositoryService.createProcessDefinitionQuery()
                .processDefinitionId(procDefId)
                .processDefinitionTenantId(tenantId)
                .singleResult();
        return Optional.ofNullable(procDef);
    }

    @Transactional
    public void suspendProcessDefinition(String procDefId) {
        repositoryService.suspendProcessDefinitionById(procDefId);
    }

    @Transactional
    public void activateProcessDefinition(String procDefId) {
        repositoryService.activateProcessDefinitionById(procDefId);
    }

    public String getProcessDefinitionXml(String procDefId) {
        try (InputStream is = repositoryService.getProcessModel(procDefId);
             BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            return reader.lines().collect(Collectors.joining("\n"));
        } catch (Exception e) {
            throw new RuntimeException("Failed to read process model", e);
        }
    }
}