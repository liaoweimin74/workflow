package com.workflow.engine.process;

import com.workflow.api.dto.DesignSaveRequest;
import com.workflow.api.dto.EditorDTO;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.process.entity.NodeConfig;
import com.workflow.engine.process.entity.ProcessDraft;
import com.workflow.engine.process.repository.NodeConfigRepository;
import com.workflow.engine.process.repository.ProcessDraftRepository;
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

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.time.LocalDateTime;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 流程设计器服务。
 * 管理流程定义草稿（BPMN XML + 节点配置），支持部署到 Flowable 引擎。
 */
@Service
public class ProcessDesignService {

    private final ProcessDraftRepository draftRepository;
    private final NodeConfigRepository nodeConfigRepository;
    private final RepositoryService repositoryService;
    private final TenantProvider tenantProvider;

    public ProcessDesignService(ProcessDraftRepository draftRepository,
                                NodeConfigRepository nodeConfigRepository,
                                RepositoryService repositoryService,
                                TenantProvider tenantProvider) {
        this.draftRepository = draftRepository;
        this.nodeConfigRepository = nodeConfigRepository;
        this.repositoryService = repositoryService;
        this.tenantProvider = tenantProvider;
    }

    /**
     * 加载设计器数据：BPMN XML + 节点配置。
     */
    public EditorDTO loadEditor(String draftId) {
        String tenantId = tenantProvider.getTenantId();
        ProcessDraft draft = draftRepository.findByIdAndTenantId(draftId, tenantId)
                .orElseThrow(() -> new RuntimeException("Process draft not found: " + draftId));

        List<NodeConfig> configs = nodeConfigRepository.findByProcessDefId(draftId);
        Map<String, String> nodeConfigMap = configs.stream()
                .collect(Collectors.toMap(NodeConfig::getNodeId, NodeConfig::getConfigJson, (a, b) -> a));

        EditorDTO dto = new EditorDTO();
        dto.setId(draft.getId());
        dto.setName(draft.getName());
        dto.setKey(draft.getKey());
        dto.setCategoryId(draft.getCategoryId());
        dto.setBpmnXml(draft.getBpmnXml());
        dto.setNodeConfigs(nodeConfigMap);
        dto.setStatus(draft.getStatus());
        return dto;
    }

    /**
     * 保存设计器内容：事务内更新 BPMN XML + 替换节点配置。
     */
    @Transactional
    public ProcessDraft saveDesign(String draftId, DesignSaveRequest request) {
        String tenantId = tenantProvider.getTenantId();
        ProcessDraft draft = draftRepository.findByIdAndTenantId(draftId, tenantId)
                .orElseThrow(() -> new RuntimeException("Process draft not found: " + draftId));

        draft.setBpmnXml(request.getBpmnXml());
        if (request.getName() != null) draft.setName(request.getName());
        if (request.getKey() != null) draft.setKey(request.getKey());
        if (request.getCategoryId() != null) draft.setCategoryId(request.getCategoryId());

        // 已部署的流程被修改后标记为 MODIFIED
        if ("DEPLOYED".equals(draft.getStatus())) {
            draft.setStatus("MODIFIED");
        }

        draftRepository.save(draft);

        nodeConfigRepository.deleteByProcessDefId(draftId);

        Map<String, String> nodeConfigs = request.getNodeConfigs();
        if (nodeConfigs != null && !nodeConfigs.isEmpty()) {
            List<NodeConfig> configs = nodeConfigs.entrySet().stream()
                    .map(entry -> {
                        NodeConfig nc = new NodeConfig();
                        nc.setId(UUID.randomUUID().toString().replace("-", ""));
                        nc.setTenantId(tenantId);
                        nc.setProcessDefId(draftId);
                        nc.setNodeId(entry.getKey());
                        nc.setNodeType(inferNodeType(entry.getValue()));
                        nc.setConfigJson(entry.getValue());
                        return nc;
                    })
                    .collect(Collectors.toList());
            nodeConfigRepository.saveAll(configs);
        }

        return draft;
    }

    /**
     * 复制流程定义草稿（含 BPMN XML + 节点配置）。
     */
    @Transactional
    public ProcessDraft copyProcess(String sourceDraftId) {
        String tenantId = tenantProvider.getTenantId();
        ProcessDraft source = draftRepository.findByIdAndTenantId(sourceDraftId, tenantId)
                .orElseThrow(() -> new RuntimeException("Process draft not found: " + sourceDraftId));

        String newId = UUID.randomUUID().toString().replace("-", "");
        ProcessDraft copy = new ProcessDraft();
        copy.setId(newId);
        copy.setTenantId(tenantId);
        copy.setName(source.getName() + " (副本)");
        copy.setKey(source.getKey() + "_copy_" + newId.substring(0, 8));
        copy.setCategoryId(source.getCategoryId());
        copy.setBpmnXml(source.getBpmnXml());
        copy.setStatus("DRAFT");
        copy.setVersion(0);
        copy.setCreatedBy(source.getCreatedBy());
        draftRepository.save(copy);

        List<NodeConfig> sourceConfigs = nodeConfigRepository.findByProcessDefId(sourceDraftId);
        if (!sourceConfigs.isEmpty()) {
            List<NodeConfig> copies = sourceConfigs.stream()
                    .map(nc -> {
                        NodeConfig newNc = new NodeConfig();
                        newNc.setId(UUID.randomUUID().toString().replace("-", ""));
                        newNc.setTenantId(tenantId);
                        newNc.setProcessDefId(newId);
                        newNc.setNodeId(nc.getNodeId());
                        newNc.setNodeType(nc.getNodeType());
                        newNc.setConfigJson(nc.getConfigJson());
                        return newNc;
                    })
                    .collect(Collectors.toList());
            nodeConfigRepository.saveAll(copies);
        }

        return copy;
    }

    /**
     * 部署流程到 Flowable 引擎。
     * 校验：BPMN XML 与上次部署内容一致则拒绝部署，避免产生多余版本。
     */
    @Transactional
    public ProcessDraft deploy(String draftId) {
        String tenantId = tenantProvider.getTenantId();
        ProcessDraft draft = draftRepository.findByIdAndTenantId(draftId, tenantId)
                .orElseThrow(() -> new RuntimeException("Process draft not found: " + draftId));

        // 与上次部署的 XML 一致则拒绝部署
        if (Objects.equals(trimToNull(draft.getDeployedXml()), trimToNull(draft.getBpmnXml()))) {
            throw new BusinessException(400, "流程数据未变化，无需部署");
        }

        Deployment deployment = repositoryService.createDeployment()
                .name(draft.getName())
                .addString(draft.getKey() + ".bpmn20.xml", draft.getBpmnXml())
                .tenantId(tenantId)
                .deploy();

        ProcessDefinition procDef = repositoryService.createProcessDefinitionQuery()
                .deploymentId(deployment.getId())
                .processDefinitionTenantId(tenantId)
                .latestVersion()
                .singleResult();

        draft.setStatus("DEPLOYED");
        draft.setDeployId(deployment.getId());
        draft.setLastDeployedAt(LocalDateTime.now());
        draft.setDeployedXml(draft.getBpmnXml());
        if (procDef != null) {
            draft.setProcessDefinitionId(procDef.getId());
            draft.setVersion(procDef.getVersion());
        }
        return draftRepository.save(draft);
    }

    /**
     * 创建新的流程定义草稿。
     */
    @Transactional
    public ProcessDraft createDraft(String name, String key, String categoryId) {
        String tenantId = tenantProvider.getTenantId();
        String id = UUID.randomUUID().toString().replace("-", "");
        String defaultXml = buildEmptyBpmnXml(key, name);

        ProcessDraft draft = new ProcessDraft();
        draft.setId(id);
        draft.setTenantId(tenantId);
        draft.setName(name);
        draft.setKey(key);
        draft.setCategoryId(categoryId);
        draft.setBpmnXml(defaultXml);
        draft.setStatus("DRAFT");
        draft.setVersion(0);
        return draftRepository.save(draft);
    }

    /**
     * 查询草稿列表。
     */
    public Page<ProcessDraft> listDrafts(Pageable pageable) {
        String tenantId = tenantProvider.getTenantId();
        return draftRepository.findByTenantIdOrderByUpdatedAtDesc(tenantId, pageable);
    }

    /**
     * 按分类查询草稿列表。
     */
    public Page<ProcessDraft> listDraftsByCategory(String categoryId, Pageable pageable) {
        String tenantId = tenantProvider.getTenantId();
        return draftRepository.findByTenantIdAndCategoryIdOrderByUpdatedAtDesc(tenantId, categoryId, pageable);
    }

    /**
     * 按名称搜索草稿。
     */
    public Page<ProcessDraft> searchDrafts(String name, Pageable pageable) {
        String tenantId = tenantProvider.getTenantId();
        return draftRepository.findByTenantIdAndNameContainingOrderByUpdatedAtDesc(tenantId, name, pageable);
    }

    /**
     * 删除草稿。
     */
    @Transactional
    public void deleteDraft(String draftId) {
        String tenantId = tenantProvider.getTenantId();
        ProcessDraft draft = draftRepository.findByIdAndTenantId(draftId, tenantId)
                .orElseThrow(() -> new RuntimeException("Process draft not found: " + draftId));
        nodeConfigRepository.deleteByProcessDefId(draftId);
        draftRepository.delete(draft);
    }

    private String buildEmptyBpmnXml(String processKey, String processName) {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
                + "<bpmn:definitions xmlns:bpmn=\"http://www.omg.org/spec/BPMN/20100524/MODEL\" "
                + "xmlns:bpmndi=\"http://www.omg.org/spec/BPMN/20100524/DI\" "
                + "xmlns:dc=\"http://www.omg.org/spec/DD/20100524/DC\" "
                + "xmlns:di=\"http://www.omg.org/spec/DD/20100524/DI\" "
                + "xmlns:flowable=\"http://flowable.org/bpmn\" "
                + "targetNamespace=\"http://flowable.org/bpmn\">\n"
                + "  <bpmn:process id=\"" + processKey + "\" name=\"" + processName + "\" isExecutable=\"true\">\n"
                + "    <bpmn:startEvent id=\"startEvent_1\"/>\n"
                + "  </bpmn:process>\n"
                + "  <bpmndi:BPMNDiagram id=\"BPMNDiagram_1\">\n"
                + "    <bpmndi:BPMNPlane id=\"BPMNPlane_1\" bpmnElement=\"" + processKey + "\">\n"
                + "      <bpmndi:BPMNShape id=\"startEvent_1_di\" bpmnElement=\"startEvent_1\">\n"
                + "        <dc:Rect x=\"160\" y=\"160\" width=\"36\" height=\"36\"/>\n"
                + "      </bpmndi:BPMNShape>\n"
                + "    </bpmndi:BPMNPlane>\n"
                + "  </bpmndi:BPMNDiagram>\n"
                + "</bpmn:definitions>";
    }

    /**
     * 从 config_json 粗略推断节点类型（仅用于排序/统计，实际类型由前端维护）。
     */
    private String inferNodeType(String configJson) {
        if (configJson == null) return "unknown";
        if (configJson.contains("\"approval\"")) return "userTask";
        if (configJson.contains("\"condition\"")) return "sequenceFlow";
        return "unknown";
    }

    /**
     * 比较请求中的 nodeConfigs 与数据库当前值是否一致。
     */
    private boolean nodeConfigsEqual(String draftId, Map<String, String> requestConfigs) {
        List<NodeConfig> existing = nodeConfigRepository.findByProcessDefId(draftId);
        Map<String, String> existingMap = new HashMap<>();
        for (NodeConfig nc : existing) {
            existingMap.put(nc.getNodeId(), nc.getConfigJson());
        }
        Map<String, String> reqMap = requestConfigs != null ? requestConfigs : new HashMap<>();
        return Objects.equals(existingMap, reqMap);
    }

    private static String trimToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
