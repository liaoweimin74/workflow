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

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

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
            // 从 BPMN XML 解析 nodeId → nodeType 映射
            Map<String, String> nodeTypeMap = parseNodeTypes(request.getBpmnXml());

            List<NodeConfig> configs = nodeConfigs.entrySet().stream()
                    .map(entry -> {
                        NodeConfig nc = new NodeConfig();
                        nc.setId(UUID.randomUUID().toString().replace("-", ""));
                        nc.setTenantId(tenantId);
                        nc.setProcessDefId(draftId);
                        nc.setNodeId(entry.getKey());
                        String nodeType = nodeTypeMap.get(entry.getKey());
                        nc.setNodeType(nodeType != null ? nodeType : "unknown");
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

        // 部署到 Flowable，捕获引擎校验异常转为友好提示
        Deployment deployment;
        try {
            deployment = repositoryService.createDeployment()
                    .name(draft.getName())
                    .addString(draft.getKey() + ".bpmn20.xml", draft.getBpmnXml())
                    .tenantId(tenantId)
                    .deploy();
        } catch (Exception e) {
            String msg = e.getMessage();
            if (msg != null && msg.contains("BPMN")) {
                throw new BusinessException(400, "流程定义不完整：" + msg);
            }
            throw new BusinessException(400, "部署失败：" + (msg != null ? msg : "未知错误"));
        }

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
     * 删除草稿。已部署的流程不允许删除，需先停用。
     */
    @Transactional
    public void deleteDraft(String draftId) {
        String tenantId = tenantProvider.getTenantId();
        ProcessDraft draft = draftRepository.findByIdAndTenantId(draftId, tenantId)
                .orElseThrow(() -> new RuntimeException("Process draft not found: " + draftId));

        if (draft.getDeployId() != null) {
            throw new BusinessException(400, "已部署过的流程不允许删除，请先停用");
        }

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
     * 从 BPMN XML 解析 nodeId → nodeType 映射。
     * 遍历 process 元素下的所有子元素，取标签名（去掉命名空间前缀）作为 nodeType。
     */
    private Map<String, String> parseNodeTypes(String bpmnXml) {
        Map<String, String> result = new HashMap<>();
        if (bpmnXml == null || bpmnXml.isBlank()) return result;
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            // 禁用外部实体，防止 XXE
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            DocumentBuilder builder = factory.newDocumentBuilder();
            Document doc = builder.parse(new java.io.ByteArrayInputStream(bpmnXml.getBytes(java.nio.charset.StandardCharsets.UTF_8)));

            // 查找所有带 id 属性的 BPMN 元素（process 内的节点 + sequenceFlow）
            NodeList allElements = doc.getElementsByTagName("*");
            for (int i = 0; i < allElements.getLength(); i++) {
                Element el = (Element) allElements.item(i);
                String id = el.getAttribute("id");
                if (id == null || id.isEmpty()) continue;

                // 标签名可能含命名空间前缀，如 bpmn:userTask → userTask
                String tagName = el.getLocalName();
                if (tagName == null) {
                    tagName = el.getTagName();
                    int colon = tagName.indexOf(':');
                    if (colon >= 0) tagName = tagName.substring(colon + 1);
                }

                // 跳过非节点元素（diagram、plane、shape、edge 等）
                if ("BPMNDiagram".equalsIgnoreCase(tagName) || "BPMNPlane".equalsIgnoreCase(tagName)
                        || "BPMNShape".equalsIgnoreCase(tagName) || "BPMNEdge".equalsIgnoreCase(tagName)
                        || "definitions".equalsIgnoreCase(tagName) || "process".equalsIgnoreCase(tagName)) {
                    continue;
                }

                result.put(id, tagName);
            }
        } catch (Exception e) {
            // XML 解析失败时返回空 map，nodeType 将留空
        }
        return result;
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
