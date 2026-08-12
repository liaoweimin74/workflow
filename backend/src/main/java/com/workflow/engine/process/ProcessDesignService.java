package com.workflow.engine.process;

import com.workflow.api.dto.DesignSaveRequest;
import com.workflow.api.dto.EditorDTO;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.process.bpmn.MultiInstanceBpmnRewriter;
import com.workflow.engine.process.entity.NodeConfig;
import com.workflow.engine.process.entity.ProcessDraft;
import com.workflow.engine.process.repository.NodeConfigRepository;
import com.workflow.engine.process.repository.ProcessDraftRepository;
import com.workflow.engine.tenant.TenantProvider;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.repository.Deployment;
import org.flowable.engine.repository.ProcessDefinition;
import org.flowable.engine.repository.ProcessDefinitionQuery;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.TreeMap;
import java.time.LocalDateTime;
import java.util.UUID;
import java.util.stream.Collectors;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;
import java.io.StringWriter;
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
    private final MultiInstanceBpmnRewriter multiInstanceBpmnRewriter;
    private final ObjectMapper objectMapper;

    public ProcessDesignService(ProcessDraftRepository draftRepository,
                                NodeConfigRepository nodeConfigRepository,
                                RepositoryService repositoryService,
                                TenantProvider tenantProvider,
                                MultiInstanceBpmnRewriter multiInstanceBpmnRewriter,
                                ObjectMapper objectMapper) {
        this.draftRepository = draftRepository;
        this.nodeConfigRepository = nodeConfigRepository;
        this.repositoryService = repositoryService;
        this.tenantProvider = tenantProvider;
        this.multiInstanceBpmnRewriter = multiInstanceBpmnRewriter;
        this.objectMapper = objectMapper;
    }

    /**
     * 加载设计器数据：BPMN XML + 节点配置。
     */
    public EditorDTO loadEditor(String draftId) {
        String tenantId = tenantProvider.getTenantId();
        ProcessDraft draft = draftRepository.findByIdAndTenantId(draftId, tenantId)
                .orElseThrow(() -> new RuntimeException("Process draft not found: " + draftId));

        // 仅读取当前编辑中的配置（processDefinitionId IS NULL），不含历史版本快照
        List<NodeConfig> configs = nodeConfigRepository.findByProcessDefIdAndProcessDefinitionIdIsNull(draftId);
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

        // 只删除"当前编辑中"的配置（processDefinitionId IS NULL），保留已部署的版本快照
        nodeConfigRepository.deleteByProcessDefIdAndProcessDefinitionIdIsNull(draftId);

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
                        // __PROCESS__ 是流程级配置，不是 BPMN 节点
                        String nodeType;
                        if ("__PROCESS__".equals(entry.getKey())) {
                            nodeType = "process";
                        } else {
                            nodeType = nodeTypeMap.get(entry.getKey());
                        }
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

        // 仅复制当前编辑中的配置（不含历史版本快照）
        List<NodeConfig> sourceConfigs = nodeConfigRepository.findByProcessDefIdAndProcessDefinitionIdIsNull(sourceDraftId);
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

        // 加载 NodeConfig（仅当前编辑中配置，不含历史版本快照），改写 BPMN XML（会签/或签 → MI parallel）
        List<NodeConfig> configs = nodeConfigRepository.findByProcessDefIdAndProcessDefinitionIdIsNull(draftId);
        Map<String, String> nodeConfigMap = configs.stream()
                .collect(Collectors.toMap(NodeConfig::getNodeId, NodeConfig::getConfigJson, (a, b) -> a));
        String effectiveBpmnXml = multiInstanceBpmnRewriter.rewrite(draft.getBpmnXml(), nodeConfigMap);

        // 注入 StartEvent/EndEvent 默认名称
        effectiveBpmnXml = injectEventNames(effectiveBpmnXml);

        // 与上次部署的内容比较（hash 为主，覆盖 XML + 节点配置含 __PROCESS__）：
        // 历史数据（deployed_config_hash 为空）降级比较：XML 相同 且 配置与上次部署快照一致 → 未变化。
        String currentHash = computeDeployHash(effectiveBpmnXml, nodeConfigMap);
        String storedHash = draft.getDeployedConfigHash();
        boolean unchanged;
        if (storedHash != null && !storedHash.isBlank()) {
            unchanged = storedHash.equals(currentHash);
        } else {
            unchanged = isSameAsLastDeployment(draft, effectiveBpmnXml, nodeConfigMap);
        }
        if (unchanged) {
            throw new BusinessException(400, "流程数据未变化，无需部署");
        }

        // 部署到 Flowable，捕获引擎校验异常转为友好提示
        Deployment deployment;
        try {
            deployment = repositoryService.createDeployment()
                    .name(draft.getName())
                    .addString(draft.getKey() + ".bpmn20.xml", effectiveBpmnXml)
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
        draft.setDeployedXml(effectiveBpmnXml);
        draft.setDeployedConfigHash(currentHash);
        if (procDef != null) {
            draft.setProcessDefinitionId(procDef.getId());
            draft.setVersion(procDef.getVersion());

            // 生成当前配置的版本快照：
            // 复制 processDefinitionId IS NULL 的"当前编辑中"配置，绑定新部署版本
            // 运行时按精确版本反查，保证不同版本的流程实例使用各自部署时的配置
            snapshotNodeConfigs(draftId, tenantId, procDef.getId());
        }
        return draftRepository.save(draft);
    }

    /**
     * 复制当前配置（processDefinitionId IS NULL）生成指定部署版本的快照。
     * 同一部署版本重复生成时先删除旧快照（幂等）。
     */
    private void snapshotNodeConfigs(String draftId, String tenantId, String processDefinitionId) {
        List<NodeConfig> currentConfigs = nodeConfigRepository
                .findByProcessDefIdAndProcessDefinitionIdIsNull(draftId);
        if (currentConfigs.isEmpty()) {
            return;
        }
        // 幂等：先删除该版本已存在的快照
        nodeConfigRepository.deleteByProcessDefIdAndProcessDefinitionId(draftId, processDefinitionId);
        List<NodeConfig> snapshots = currentConfigs.stream().map(src -> {
            NodeConfig nc = new NodeConfig();
            nc.setId(UUID.randomUUID().toString().replace("-", ""));
            nc.setTenantId(tenantId);
            nc.setProcessDefId(draftId);
            nc.setNodeId(src.getNodeId());
            nc.setNodeType(src.getNodeType());
            nc.setConfigJson(src.getConfigJson());
            nc.setProcessDefinitionId(processDefinitionId);
            return nc;
        }).collect(Collectors.toList());
        nodeConfigRepository.saveAll(snapshots);
    }

    /**
     * 降级路径判定：历史数据（deployed_config_hash 为空）是否与上次部署内容一致。
     * XML 相同 且 当前配置与上次部署版本快照一致 → 视为未变化；任一不同 → 允许部署。
     */
    private boolean isSameAsLastDeployment(ProcessDraft draft, String effectiveBpmnXml, Map<String, String> nodeConfigMap) {
        if (!Objects.equals(trimToNull(draft.getDeployedXml()), trimToNull(effectiveBpmnXml))) {
            return false; // XML 变化
        }
        String procDefId = draft.getProcessDefinitionId();
        if (procDefId == null) {
            return true; // 无历史部署记录且 XML 相同，视为未变化
        }
        List<NodeConfig> snapshots = nodeConfigRepository
                .findByProcessDefIdAndProcessDefinitionId(draft.getId(), procDefId);
        Map<String, String> snapshotMap = snapshots.stream()
                .collect(Collectors.toMap(NodeConfig::getNodeId, NodeConfig::getConfigJson, (a, b) -> a));
        return snapshotMap.equals(nodeConfigMap);
    }

    /**
     * 计算部署配置 hash：改写后 XML + 节点配置（含 __PROCESS__）整体指纹。
     * nodeConfigMap 按键排序后规范化序列化，保证相同内容 hash 一致。
     *
     * @param effectiveBpmnXml 改写后的 BPMN XML
     * @param nodeConfigMap    节点配置（nodeId → configJson，含 __PROCESS__ 键）
     * @return SHA-256 十六进制字符串（64 位）
     */
    private String computeDeployHash(String effectiveBpmnXml, Map<String, String> nodeConfigMap) {
        try {
            TreeMap<String, String> sorted = new TreeMap<>(nodeConfigMap);
            String canonicalJson = objectMapper.writeValueAsString(sorted);
            String input = trimToNull(effectiveBpmnXml) + "|" + canonicalJson;
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            throw new RuntimeException("Failed to compute deploy hash", e);
        }
    }

    /**
     * 创建新的流程定义草稿。
     */
    @Transactional
    public ProcessDraft createDraft(String name, String key, String categoryId) {
        String tenantId = tenantProvider.getTenantId();
        String id = UUID.randomUUID().toString().replace("-", "");
        String defaultXml = buildEmptyBpmnXml(key, name, categoryId);

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

    private String buildEmptyBpmnXml(String processKey, String processName, String categoryId) {
        // targetNamespace 用于 Flowable 流程定义的 category 字段
        // 如果有业务分类 ID，使用它；否则使用默认命名空间
        String targetNamespace = (categoryId != null && !categoryId.isBlank())
                ? categoryId
                : "http://flowable.org/bpmn";

        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
                + "<bpmn:definitions xmlns:bpmn=\"http://www.omg.org/spec/BPMN/20100524/MODEL\" "
                + "xmlns:bpmndi=\"http://www.omg.org/spec/BPMN/20100524/DI\" "
                + "xmlns:dc=\"http://www.omg.org/spec/DD/20100524/DC\" "
                + "xmlns:di=\"http://www.omg.org/spec/DD/20100524/DI\" "
                + "xmlns:flowable=\"http://flowable.org/bpmn\" "
                + "targetNamespace=\"" + targetNamespace + "\">\n"
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

    private static final String BPMN_NS = "http://www.omg.org/spec/BPMN/20100524/MODEL";

    /**
     * 给 BPMN XML 中的 StartEvent 补 name="开始"、EndEvent 补 name="结束"。
     * 已有名称的事件不覆盖。
     */
    private String injectEventNames(String bpmnXml) {
        if (bpmnXml == null || bpmnXml.isBlank()) {
            return bpmnXml;
        }
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            DocumentBuilder builder = factory.newDocumentBuilder();
            Document doc = builder.parse(new ByteArrayInputStream(bpmnXml.getBytes(StandardCharsets.UTF_8)));

            boolean modified = false;

            // StartEvent → "开始"
            NodeList startEvents = doc.getElementsByTagNameNS(BPMN_NS, "startEvent");
            for (int i = 0; i < startEvents.getLength(); i++) {
                Element el = (Element) startEvents.item(i);
                String name = el.getAttribute("name");
                if (name == null || name.isBlank()) {
                    el.setAttribute("name", "开始");
                    modified = true;
                }
            }

            // EndEvent → "结束"
            NodeList endEvents = doc.getElementsByTagNameNS(BPMN_NS, "endEvent");
            for (int i = 0; i < endEvents.getLength(); i++) {
                Element el = (Element) endEvents.item(i);
                String name = el.getAttribute("name");
                if (name == null || name.isBlank()) {
                    el.setAttribute("name", "结束");
                    modified = true;
                }
            }

            if (!modified) {
                return bpmnXml;
            }

            return serializeXml(doc);
        } catch (Exception e) {
            return bpmnXml;
        }
    }

    private String serializeXml(Document doc) throws Exception {
        TransformerFactory tf = TransformerFactory.newInstance();
        Transformer t = tf.newTransformer();
        t.setOutputProperty(OutputKeys.ENCODING, "UTF-8");
        t.setOutputProperty(OutputKeys.INDENT, "yes");
        StringWriter sw = new StringWriter();
        t.transform(new DOMSource(doc), new StreamResult(sw));
        return sw.toString();
    }
}
