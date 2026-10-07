package com.workflow.engine.logicflow.engine;

import com.fasterxml.jackson.databind.JsonNode;
import com.workflow.engine.logicflow.dsl.LogicFlowDsl;
import com.workflow.engine.logicflow.dsl.NodeType;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 逻辑流 DSL 图结构校验器（发布时硬校验；保存草稿时不校验，允许半成品）。
 *
 * <p>仅产出<b>硬错误</b>（存在即禁止发布）：
 * <ul>
 *   <li>节点 id 重复；</li>
 *   <li>边引用不存在的节点（source/target）；</li>
 *   <li>CONDITION 节点缺 branch=true / branch=false 出边；</li>
 *   <li>HTTP 节点缺 url；BEAN 节点缺 beanName/methodName；SCRIPT 节点缺 source；</li>
 *   <li>非 END/CONDITION 节点无出边（含 START）。</li>
 * </ul>
 *
 * <p>刻意<b>不</b>报错（WARN 级，忽略）：START 缺失、多 START、END 缺失、不可达节点——
 * 画布允许非完整图形态的草稿演进，运行期引擎自有语义兜底（无 START → FAILED 等）。
 */
@Component
public class LogicFlowDslValidator {

    public List<String> validate(LogicFlowDsl dsl) {
        List<String> errors = new ArrayList<>();
        if (dsl == null || dsl.getNodes() == null || dsl.getNodes().isEmpty()) {
            errors.add("缺少节点定义(nodes)");
            return errors;
        }

        // 1) 节点 id 唯一 + 建索引
        Map<String, NodeType> nodeTypes = new LinkedHashMap<>();
        Set<String> duplicated = new LinkedHashSet<>();
        for (LogicFlowDsl.NodeDef node : dsl.getNodes()) {
            if (node.getId() == null || node.getId().isBlank()) {
                errors.add("存在缺少 id 的节点");
                continue;
            }
            if (nodeTypes.containsKey(node.getId())) {
                duplicated.add(node.getId());
            }
            nodeTypes.put(node.getId(), node.getType());
        }
        for (String id : duplicated) {
            errors.add("节点 id 重复: " + id);
        }

        // 2) 出边索引 + 边端点存在性
        Map<String, List<String>> outBranches = new LinkedHashMap<>();
        List<LogicFlowDsl.EdgeDef> edges = dsl.getEdges() != null ? dsl.getEdges() : List.of();
        for (LogicFlowDsl.EdgeDef edge : edges) {
            String source = edge.getSource();
            String target = edge.getTarget();
            if (source == null || !nodeTypes.containsKey(source)) {
                errors.add("边 " + edge.getId() + " 引用不存在的源节点: " + source);
            } else {
                outBranches.computeIfAbsent(source, k -> new ArrayList<>())
                        .add(edge.getBranch() == null ? "" : edge.getBranch().trim());
            }
            if (target == null || !nodeTypes.containsKey(target)) {
                errors.add("边 " + edge.getId() + " 引用不存在的目标节点: " + target);
            }
        }

        // 3) 逐节点硬校验
        for (LogicFlowDsl.NodeDef node : dsl.getNodes()) {
            if (node.getId() == null || node.getId().isBlank()) {
                continue;
            }
            NodeType type = node.getType();
            if (type == null) {
                errors.add("节点 " + node.getId() + " 类型未知或缺省");
                continue;
            }
            switch (type) {
                case CONDITION -> {
                    List<String> branches = outBranches.getOrDefault(node.getId(), List.of());
                    if (!branches.contains("true")) {
                        errors.add("CONDITION 节点 " + node.getId() + " 缺少 branch=true 出边");
                    }
                    if (!branches.contains("false")) {
                        errors.add("CONDITION 节点 " + node.getId() + " 缺少 branch=false 出边");
                    }
                }
                case END -> {
                    // 终点允许无出边
                }
                default -> {
                    if (!outBranches.containsKey(node.getId())) {
                        errors.add("节点无出边: " + node.getId() + " (" + type + ")");
                    }
                }
            }
            switch (type) {
                case HTTP -> {
                    JsonNode config = node.getConfig();
                    if (config == null || isBlankText(config, "url")) {
                        errors.add("HTTP 节点 " + node.getId() + " 缺少 url");
                    }
                }
                case BEAN -> {
                    JsonNode config = node.getConfig();
                    if (config == null || isBlankText(config, "beanName") || isBlankText(config, "methodName")) {
                        errors.add("BEAN 节点 " + node.getId() + " 缺少 beanName/methodName");
                    }
                }
                case SCRIPT -> {
                    JsonNode config = node.getConfig();
                    if (config == null || isBlankText(config, "source")) {
                        errors.add("SCRIPT 节点 " + node.getId() + " 缺少 source");
                    }
                }
                default -> {
                    // 其余类型无 config 硬要求
                }
            }
        }
        return errors;
    }

    private static boolean isBlankText(JsonNode config, String field) {
        JsonNode node = config.get(field);
        return node == null || node.isNull() || node.asText().isBlank();
    }
}
