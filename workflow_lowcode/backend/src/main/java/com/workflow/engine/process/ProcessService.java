package com.workflow.engine.process;

import com.workflow.api.dto.ProcessDefinitionSummary;
import com.workflow.engine.tenant.TenantProvider;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.repository.Deployment;
import org.flowable.engine.repository.ProcessDefinition;
import org.flowable.engine.repository.ProcessDefinitionQuery;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class ProcessService {

    private static final Logger log = LoggerFactory.getLogger(ProcessService.class);

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

    /**
     * 分页查询已部署流程定义，支持按分类、名称、状态筛选。
     *
     * @param pageable   分页参数
     * @param categoryId 分类 ID（可选，精确匹配 Flowable category 字段）
     * @param name       流程名称（可选，模糊匹配 Flowable name 字段）
     * @param status     状态（可选，"active" 或 "suspended"）
     * @return 分页结果
     */
    public Page<ProcessDefinition> listProcessDefinitions(Pageable pageable,
                                                          String categoryId,
                                                          String name,
                                                          String status) {
        String tenantId = tenantProvider.getTenantId();
        ProcessDefinitionQuery query = repositoryService.createProcessDefinitionQuery()
                .processDefinitionTenantId(tenantId)
                .latestVersion();

        if (categoryId != null && !categoryId.isBlank()) {
            query.processDefinitionCategoryLike(categoryId);
        }
        if (name != null && !name.isBlank()) {
            query.processDefinitionNameLike(name);
        }
        if ("active".equalsIgnoreCase(status)) {
            query.active();
        } else if ("suspended".equalsIgnoreCase(status)) {
            query.suspended();
        }

        query.orderByProcessDefinitionVersion().desc();

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

    /**
     * 列出已部署流程定义精简信息，按 key 去重取最新版本。
     * 供 CallActivity 子流程选择下拉使用。
     */
    public List<ProcessDefinitionSummary> listSummaries() {
        String tenantId = tenantProvider.getTenantId();
        log.info("Listing deployed process summaries for tenant: {}", tenantId);
        List<ProcessDefinition> all = repositoryService.createProcessDefinitionQuery()
                .processDefinitionTenantId(tenantId)
                .latestVersion()
                .orderByProcessDefinitionName()
                .asc()
                .list();
        log.info("Found {} deployed process definitions", all.size());

        return all.stream().map(pd -> {
            ProcessDefinitionSummary s = new ProcessDefinitionSummary();
            s.setId(pd.getId());
            s.setKey(pd.getKey());
            s.setName(pd.getName() != null ? pd.getName() : pd.getKey());
            s.setVersion(pd.getVersion());
            return s;
        }).collect(Collectors.toList());
    }
}