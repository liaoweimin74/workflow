package com.workflow.engine.form.mapping;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.process.bpmn.InitiatorNodeResolver;
import com.workflow.engine.process.entity.NodeConfig;
import com.workflow.engine.process.repository.NodeConfigRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * 映射配置发布校验器。
 *
 * <p>部署时校验流程定义下所有节点的表单字段映射与流程变量映射：
 * <ul>
 *   <li>targetField 必须存在于目标表单（本节点表单）schema</li>
 *   <li>{@code form:*} 源的 sourceField 必须存在于源表单 schema</li>
 *   <li>流程变量名全局唯一</li>
 *   <li>节点间映射（含 {@code form:initiator} 解析后的实际源节点）无循环引用</li>
 * </ul>
 * 校验失败抛 {@link IllegalArgumentException}，消息含节点与字段名。
 */
@Component
public class FormMappingValidator {

    private static final Logger log = LoggerFactory.getLogger(FormMappingValidator.class);

    private static final String FORM_PREFIX = "form:";
    private static final String INITIATOR_SOURCE = "form:initiator";

    private final NodeConfigRepository nodeConfigRepository;
    private final FormMappingResolver resolver;
    private final InitiatorNodeResolver initiatorNodeResolver;
    private final FormDefinitionRepository formDefRepository;
    private final ObjectMapper objectMapper;

    public FormMappingValidator(NodeConfigRepository nodeConfigRepository,
                                FormMappingResolver resolver,
                                InitiatorNodeResolver initiatorNodeResolver,
                                FormDefinitionRepository formDefRepository,
                                ObjectMapper objectMapper) {
        this.nodeConfigRepository = nodeConfigRepository;
        this.resolver = resolver;
        this.initiatorNodeResolver = initiatorNodeResolver;
        this.formDefRepository = formDefRepository;
        this.objectMapper = objectMapper;
    }

    /**
     * 校验指定流程定义版本下全部映射配置。
     *
     * @param processDefinitionId 部署版本流程定义 ID
     * @throws IllegalArgumentException 存在未知字段/变量名重复/循环引用
     */
    public void validate(String processDefinitionId) {
        List<NodeConfig> configs = nodeConfigRepository.findByProcessDefinitionId(processDefinitionId);
        if (configs.isEmpty()) {
            return;
        }
        Set<String> variableNames = new HashSet<>();
        Map<String, List<String>> edges = new LinkedHashMap<>();
        for (NodeConfig config : configs) {
            String nodeId = config.getNodeId();
            JsonNode root = parseConfig(config.getConfigJson());
            if (root == null) {
                continue;
            }
            validateNodeMappings(nodeId, root, processDefinitionId, variableNames, edges);
        }
        detectCycles(edges);
    }

    private void validateNodeMappings(String nodeId, JsonNode root, String processDefinitionId,
                                      Set<String> variableNames, Map<String, List<String>> edges) {
        String formDefId = root.path("form").path("formDefId").asText(null);
        // 表单字段映射：targetField 存在性 + form:* 源 sourceField 存在性 + 依赖边
        for (JsonNode mapping : root.path("form").path("dataMappings")) {
            String targetField = mapping.path("targetField").asText(null);
            if (targetField == null || targetField.isBlank()) {
                continue;
            }
            if (formDefId != null && !loadFieldNames(formDefId).contains(targetField)) {
                throw new IllegalArgumentException(
                        "节点 " + nodeId + " 的映射目标字段不存在: " + targetField);
            }
            validateSource(nodeId, mapping, processDefinitionId, edges);
        }
        // 流程变量映射：变量名唯一 + form:* 源 sourceField 存在性
        for (JsonNode mapping : root.path("variableMappings")) {
            String variable = mapping.path("variable").asText(null);
            if (variable == null || variable.isBlank()) {
                continue;
            }
            if (!variableNames.add(variable)) {
                throw new IllegalArgumentException("流程变量名重复: " + variable);
            }
            validateSource(nodeId, mapping, processDefinitionId, edges);
        }
    }

    /**
     * 校验映射条目的 form:* 源：sourceField 存在于源表单 schema；并记录依赖边。
     */
    private void validateSource(String nodeId, JsonNode mapping, String processDefinitionId,
                                Map<String, List<String>> edges) {
        String source = mapping.path("source").asText(null);
        if (source == null || !source.startsWith(FORM_PREFIX)) {
            return;
        }
        String sourceNodeId = resolveSourceNodeId(source, processDefinitionId);
        if (sourceNodeId != null) {
            edges.computeIfAbsent(nodeId, k -> new ArrayList<>()).add(sourceNodeId);
        }
        String sourceFormDefId = resolver.resolveSourceFormDefId(source, processDefinitionId, nodeId, null);
        if (sourceFormDefId == null) {
            log.warn("节点 [{}] 的映射源 [{}] 无法解析源表单，跳过字段存在性校验", nodeId, source);
            return;
        }
        String sourceField = mapping.path("sourceField").asText(null);
        if (sourceField == null || sourceField.isBlank()) {
            return;
        }
        if (!loadFieldNames(sourceFormDefId).contains(sourceField)) {
            throw new IllegalArgumentException(
                    "节点 " + nodeId + " 的映射源字段不存在: " + sourceField + "（source=" + source + "）");
        }
    }

    /**
     * 解析映射 source 对应的实际源节点 ID：form:initiator 经发起人解析器，form:&lt;nodeId&gt; 直接截取。
     */
    private String resolveSourceNodeId(String source, String processDefinitionId) {
        if (INITIATOR_SOURCE.equals(source)) {
            return initiatorNodeResolver.resolve(processDefinitionId);
        }
        return source.substring(FORM_PREFIX.length());
    }

    /**
     * 加载表单 schema 的全部字段名集合（递归穿透布局容器与子表结构）。
     * 表单不存在或 schema 非法时返回空集合（不阻断校验流程）。
     */
    private Set<String> loadFieldNames(String formDefId) {
        Optional<FormDefinition> formDef = formDefRepository.findById(formDefId);
        if (formDef.isEmpty() || formDef.get().getSchema() == null) {
            return Set.of();
        }
        try {
            JsonNode root = objectMapper.readTree(formDef.get().getSchema());
            JsonNode rule = root.isArray() ? root : root.path("rule");
            Set<String> names = new HashSet<>();
            collectFieldNames(rule, names);
            return names;
        } catch (Exception e) {
            log.warn("表单 [{}] schema 解析失败: {}", formDefId, e.getMessage());
            return Set.of();
        }
    }

    /**
     * 递归收集 rule 树中的字段名：
     * 布局容器（fcRow/fc-col）子字段在 children；group/subForm 在 props.rule；
     * tableForm 在 props.columns[].rule。
     */
    private void collectFieldNames(JsonNode rules, Set<String> names) {
        if (rules == null || !rules.isArray()) {
            return;
        }
        for (JsonNode rule : rules) {
            String field = rule.path("field").asText(null);
            if (field != null && !field.isBlank()) {
                names.add(field);
            }
            if (rule.path("children").isArray()) {
                collectFieldNames(rule.path("children"), names);
            }
            JsonNode props = rule.path("props");
            if (props.isObject()) {
                if (props.path("rule").isArray()) {
                    collectFieldNames(props.path("rule"), names);
                }
                JsonNode columns = props.path("columns");
                if (columns.isArray()) {
                    for (JsonNode col : columns) {
                        if (col.path("rule").isArray()) {
                            collectFieldNames(col.path("rule"), names);
                        }
                    }
                }
            }
        }
    }

    /**
     * 以节点为顶点、映射依赖为有向边做 DFS 环检测。
     */
    private void detectCycles(Map<String, List<String>> edges) {
        Map<String, Integer> state = new HashMap<>(); // 0=未访问 1=访问中 2=已完成
        for (String node : edges.keySet()) {
            if (dfsCycle(node, edges, state)) {
                throw new IllegalArgumentException("节点映射存在循环引用: " + node);
            }
        }
    }

    private boolean dfsCycle(String node, Map<String, List<String>> edges, Map<String, Integer> state) {
        int s = state.getOrDefault(node, 0);
        if (s == 2) {
            return false;
        }
        if (s == 1) {
            return true;
        }
        state.put(node, 1);
        for (String next : edges.getOrDefault(node, List.of())) {
            if (dfsCycle(next, edges, state)) {
                return true;
            }
        }
        state.put(node, 2);
        return false;
    }

    private JsonNode parseConfig(String configJson) {
        if (configJson == null || configJson.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readTree(configJson);
        } catch (Exception e) {
            log.warn("节点配置解析失败: {}", e.getMessage());
            return null;
        }
    }
}