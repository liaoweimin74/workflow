package com.workflow.engine.logicflow.dsl;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;

/**
 * 逻辑编排 DSL 定义（存 wf_logic_flow.dsl_json）。
 *
 * <pre>{@code
 * {
 *   "nodes": [
 *     {"id":"start1","type":"START","name":"开始","x":120,"y":160},
 *     {"id":"call1","type":"HTTP","name":"调用风控","x":320,"y":160,
 *      "config":{"url":"https://api.example.com/risk","method":"GET",
 *                "headers":{"Authorization":"Bearer {{token}}"},
 *                "queryParams":[{"source":"orderId","target":"orderId"}],
 *                "connTimeoutMs":3000,"readTimeoutMs":5000,"retryCount":0},
 *      "resultVar":"risk","errorAction":"FAIL_FLOW"},
 *     {"id":"cond1","type":"CONDITION","name":"是否通过","x":520,"y":160,
 *      "config":{"variable":"risk","operator":"EQ","value":"PASS"}},
 *     {"id":"end1","type":"END","name":"结束","x":720,"y":160}
 *   ],
 *   "edges": [
 *     {"id":"e1","source":"start1","target":"call1"},
 *     {"id":"e2","source":"call1","target":"cond1"},
 *     {"id":"e3","source":"cond1","target":"end1","branch":"true"},
 *     {"id":"e4","source":"cond1","target":"reject1","branch":"false"}
 *   ]
 * }
 * }</pre>
 *
 * <p>节点六型见 {@link NodeType}；config 结构按类型区分：
 * <ul>
 *   <li>HTTP：{@code BackendLogicHttpConfig} 字段（url/method/headers/queryParams/bodyParams/
 *       connTimeoutMs=3000/readTimeoutMs=5000/retryCount=0）；</li>
 *   <li>BEAN：{@code {beanName, methodName, params:[{source,target}]}}；</li>
 *   <li>SCRIPT：{@code {language:"groovy", source}}；</li>
 *   <li>CONDITION：{@code {variable, operator: EQ|NE|GT|LT|GTE|LTE|EMPTY|NOT_EMPTY, value?}}
 *       （value 支持字面量或 {{var}}）。</li>
 * </ul>
 */
public class LogicFlowDsl {

    private List<NodeDef> nodes;
    private List<EdgeDef> edges;

    public List<NodeDef> getNodes() { return nodes; }
    public void setNodes(List<NodeDef> nodes) { this.nodes = nodes; }

    public List<EdgeDef> getEdges() { return edges; }
    public void setEdges(List<EdgeDef> edges) { this.edges = edges; }

    /** 从 JSON 反序列化；空串/空白视为空 DSL（节点边均为空列表，允许草稿半成品）。 */
    public static LogicFlowDsl parse(String json, ObjectMapper objectMapper) {
        LogicFlowDsl dsl = new LogicFlowDsl();
        dsl.setNodes(new ArrayList<>());
        dsl.setEdges(new ArrayList<>());
        if (json == null || json.isBlank()) {
            return dsl;
        }
        try {
            LogicFlowDsl parsed = objectMapper.readValue(json, LogicFlowDsl.class);
            if (parsed != null) {
                dsl.setNodes(parsed.getNodes() != null ? parsed.getNodes() : new ArrayList<>());
                dsl.setEdges(parsed.getEdges() != null ? parsed.getEdges() : new ArrayList<>());
            }
            return dsl;
        } catch (JsonProcessingException e) {
            // @JsonCreator 抛出的「未知节点类型」直接透传（消息带类型名）；
            // Jackson 可能按 List→NodeDef→type 嵌套多层 wrap，沿 cause 链找
            IllegalArgumentException unknownType = findUnknownNodeType(e);
            if (unknownType != null) {
                throw unknownType;
            }
            throw new IllegalArgumentException("INVALID_DSL_JSON: " + e.getOriginalMessage(), e);
        }
    }

    /** 在异常 cause 链中查找 NodeType @JsonCreator 抛出的 UNKNOWN_NODE_TYPE。 */
    private static IllegalArgumentException findUnknownNodeType(Throwable e) {
        while (e != null) {
            if (e instanceof IllegalArgumentException iae && iae.getMessage() != null
                    && iae.getMessage().startsWith("UNKNOWN_NODE_TYPE")) {
                return iae;
            }
            e = e.getCause();
        }
        return null;
    }

    /** 序列化为 JSON；失败抛 {@link IllegalArgumentException}。 */
    public String toJson(ObjectMapper objectMapper) {
        try {
            return objectMapper.writeValueAsString(this);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("FAILED_TO_SERIALIZE_DSL: " + e.getOriginalMessage(), e);
        }
    }

    /** DSL 节点定义。 */
    public static class NodeDef {
        private String id;
        private NodeType type;
        private String name;
        /** 画布坐标（设计器用，运行期忽略）。 */
        private Double x;
        private Double y;
        /** 节点配置（结构随 type 变化，见类注释）。 */
        private JsonNode config;
        /** 结果写回变量名（可选）。 */
        private String resultVar;
        /** 异常策略：FAIL_FLOW（默认，中断整个流）| IGNORE_CONTINUE（记失败轨迹后继续）。 */
        private String errorAction;

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }

        public NodeType getType() { return type; }
        public void setType(NodeType type) { this.type = type; }

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public Double getX() { return x; }
        public void setX(Double x) { this.x = x; }

        public Double getY() { return y; }
        public void setY(Double y) { this.y = y; }

        public JsonNode getConfig() { return config; }
        public void setConfig(JsonNode config) { this.config = config; }

        public String getResultVar() { return resultVar; }
        public void setResultVar(String resultVar) { this.resultVar = resultVar; }

        public String getErrorAction() { return errorAction; }
        public void setErrorAction(String errorAction) { this.errorAction = errorAction; }
    }

    /** DSL 边定义（branch 仅 CONDITION 出边使用："true" | "false"）。 */
    public static class EdgeDef {
        private String id;
        private String source;
        private String target;
        private String branch;

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }

        public String getSource() { return source; }
        public void setSource(String source) { this.source = source; }

        public String getTarget() { return target; }
        public void setTarget(String target) { this.target = target; }

        public String getBranch() { return branch; }
        public void setBranch(String branch) { this.branch = branch; }
    }
}
