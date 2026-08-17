package com.workflow.engine.form.mapping;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.engine.process.bpmn.InitiatorNodeResolver;
import com.workflow.engine.process.entity.NodeConfig;
import com.workflow.engine.process.repository.NodeConfigRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 映射配置解析器：按部署版本聚合节点级表单字段映射与流程级变量映射，
 * 并解析映射 source（form:initiator / form:&lt;nodeId&gt;）对应的源表单定义 ID。
 */
public class FormMappingResolver {

    private static final Logger log = LoggerFactory.getLogger(FormMappingResolver.class);

    /** 流程级配置的保留 nodeId。 */
    public static final String PROCESS_NODE_ID = "__PROCESS__";

    private static final String FORM_PREFIX = "form:";
    private static final String VARIABLE_PREFIX = "variable:";
    private static final String INITIATOR_SOURCE = "form:initiator";

    private final NodeConfigRepository nodeConfigRepository;
    private final InitiatorNodeResolver initiatorNodeResolver;
    private final FormMappingParser parser;
    private final ObjectMapper objectMapper;

    public FormMappingResolver(NodeConfigRepository nodeConfigRepository,
                               InitiatorNodeResolver initiatorNodeResolver,
                               FormMappingParser parser,
                               ObjectMapper objectMapper) {
        this.nodeConfigRepository = nodeConfigRepository;
        this.initiatorNodeResolver = initiatorNodeResolver;
        this.parser = parser;
        this.objectMapper = objectMapper;
    }

    /**
     * 聚合流程定义下各节点的表单字段映射（nodeId → mappings）。
     * 仅包含实际配置了映射的节点。
     */
    public Map<String, List<FormDataMapping>> resolveDataMappings(String processDefinitionId) {
        Map<String, List<FormDataMapping>> result = new HashMap<>();
        for (NodeConfig nodeConfig : nodeConfigRepository.findByProcessDefinitionId(processDefinitionId)) {
            List<FormDataMapping> mappings = parser.parseDataMappings(nodeConfig.getConfigJson());
            if (!mappings.isEmpty()) {
                result.put(nodeConfig.getNodeId(), mappings);
            }
        }
        return result;
    }

    /**
     * 解析流程级变量映射（__PROCESS__ 节点的 variableMappings），无配置返回空列表。
     */
    public List<VariableMapping> resolveVariableMappings(String processDefinitionId) {
        for (NodeConfig nodeConfig : nodeConfigRepository.findByProcessDefinitionId(processDefinitionId)) {
            if (PROCESS_NODE_ID.equals(nodeConfig.getNodeId())) {
                return parser.parseVariableMappings(nodeConfig.getConfigJson());
            }
        }
        return List.of();
    }

    /**
     * 解析映射 source 对应的源表单定义 ID。
     *
     * <ul>
     *   <li>{@code form:initiator} → InitiatorNodeResolver 定位发起节点 → 该节点表单 formDefId</li>
     *   <li>{@code form:<nodeId>} → 该节点表单 formDefId</li>
     *   <li>{@code variable:<name>} → 返回 null（由调用方直接读流程变量）</li>
     * </ul>
     *
     * @return 源表单定义 ID；无法解析时返回 null
     */
    public String resolveSourceFormDefId(String source, String processDefinitionId,
                                         String nodeId, String processInstanceId) {
        if (source == null || !source.startsWith(FORM_PREFIX)) {
            return null;
        }
        String sourceNodeId;
        if (INITIATOR_SOURCE.equals(source)) {
            sourceNodeId = initiatorNodeResolver.resolve(processDefinitionId);
            if (sourceNodeId == null) {
                log.warn("process [{}] initiator node not found for source [{}]", processDefinitionId, source);
                return null;
            }
        } else {
            sourceNodeId = source.substring(FORM_PREFIX.length());
        }
        return findFormDefId(processDefinitionId, sourceNodeId);
    }

    /**
     * 查询指定节点的表单定义 ID（NodeConfig 快照的 form.formDefId）。
     */
    private String findFormDefId(String processDefinitionId, String sourceNodeId) {
        for (NodeConfig nodeConfig : nodeConfigRepository.findByProcessDefinitionId(processDefinitionId)) {
            if (sourceNodeId.equals(nodeConfig.getNodeId())) {
                try {
                    JsonNode root = objectMapper.readTree(nodeConfig.getConfigJson());
                    JsonNode formDefId = root.path("form").path("formDefId");
                    return formDefId.isMissingNode() || formDefId.isNull() ? null : formDefId.asText();
                } catch (Exception e) {
                    log.warn("Failed to read formDefId for node [{}] in process [{}]: {}",
                            sourceNodeId, processDefinitionId, e.getMessage());
                    return null;
                }
            }
        }
        return null;
    }
}