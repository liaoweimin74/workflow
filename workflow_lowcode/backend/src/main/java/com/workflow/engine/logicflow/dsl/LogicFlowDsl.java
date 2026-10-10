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
 *      "results":[{"name":"risk","mode":"WHOLE"}],"errorAction":"FAIL_FLOW"},
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
 * <p>节点类型见 {@link NodeType}；config 结构按类型区分：
 * <ul>
 *   <li>HTTP：{@code BackendLogicHttpConfig} 字段（url/method/headers/queryParams/bodyParams/
 *       connTimeoutMs=3000/readTimeoutMs=5000/retryCount=0）；</li>
 *   <li>BEAN：{@code {beanName, methodName, params:[{source,target}]}}；</li>
 *   <li>执行型节点（HTTP/BEAN/SCRIPT/DATA_UPDATE/SUBFLOW/BATCH 及 CONDITION）节点级 results（可选）
 *       统一输出声明：{@code results:[{name, mode: WHOLE|KEY, type: string|number|boolean|json, desc?}...]} ——
 *       mode=WHOLE 将节点返回值整体写入变量（null 跳过不写）；
 *       mode=KEY 要求输出源为 Map（HTTP 为 body 先尝试 JSON 解析），按 name 取对应 key 写入
 *       （缺 key 跳过不写）。严格度分流：SCRIPT 严格（声明 KEY 而非 Map → 节点失败）；
 *       其余节点宽松（非 Map/解析失败 → 警告跳过，节点继续）；</li>
 *   <li>CONDITION：{@code {variable, operator: EQ|NE|GT|LT|GTE|LTE|EMPTY|NOT_EMPTY, value?}}
 *       （value 支持字面量或 {{var}}）。</li>
 *   <li>BATCH：{@code {collection, itemVar="item", indexVar="index",
 *       body:[{id?, type: HTTP|BEAN|SCRIPT|DATA_UPDATE|SUBFLOW, name?, config, results?, errorAction?}...],
 *       stopOnError=true, maxItems=100}}（循环体链，每项迭代按序执行链上节点）；
 *       legacy 兼容 {@code {actionType: HTTP|SCRIPT|BEAN, actionConfig:{...}}} 单动作形态。</li>
 *   <li>SUBFLOW：{@code {flowId, passAllVars=true, varsMapping:[{source,target}]}}
 *       （调用另一条已发布逻辑流，outputVars 作为节点返回值，由 results 声明写入）。</li>
 * </ul>
 *
 * <p>顶层 {@code inputVars[]} 为入参声明（可选，纯契约描述，引擎不消费）：
 * {@code [{name, type: string|number|boolean|json, required, desc}]}。
 */
public class LogicFlowDsl {

    private List<NodeDef> nodes;
    private List<EdgeDef> edges;
    /** 入参声明（可选，设计器编辑 / 运行测试渲染表单用，引擎不消费）。 */
    private List<InputVarDef> inputVars;

    public List<NodeDef> getNodes() { return nodes; }
    public void setNodes(List<NodeDef> nodes) { this.nodes = nodes; }

    public List<InputVarDef> getInputVars() { return inputVars; }
    public void setInputVars(List<InputVarDef> inputVars) { this.inputVars = inputVars; }

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
                dsl.setInputVars(parsed.getInputVars() != null ? parsed.getInputVars() : new ArrayList<>());
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

    /** DSL 节点定义（兼容存量草稿中已下线的 resultVar 键：反序列化忽略未知字段）。 */
    @com.fasterxml.jackson.annotation.JsonIgnoreProperties(ignoreUnknown = true)
    public static class NodeDef {
        private String id;
        private NodeType type;
        private String name;
        /** 画布坐标（设计器用，运行期忽略）。 */
        private Double x;
        private Double y;
        /** 节点配置（结构随 type 变化，见类注释）。 */
        private JsonNode config;
        /** 输出声明（全部执行型节点可配：按 mode 从节点返回值提取写入上下文）。 */
        private List<ResultVarDef> results;
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

        public List<ResultVarDef> getResults() { return results; }
        public void setResults(List<ResultVarDef> results) { this.results = results; }

        public String getErrorAction() { return errorAction; }
        public void setErrorAction(String errorAction) { this.errorAction = errorAction; }
    }

    /**
     * 输出参数声明（全部执行型节点统一输出模型，单表替代 resultVar）：
     * mode=WHOLE 取节点返回值的整体；mode=KEY 从返回值 Map（HTTP 为 body JSON 解析结果）按 name 取对应 key。
     */
    /** 字段结构树节点（JSON 实例推断产物，与前端 jsonStructure / 后端 form-fields 树同构；仅设计期消费，运行期不读取）。 */
    @com.fasterxml.jackson.annotation.JsonIgnoreProperties(ignoreUnknown = true)
    public static class FieldNode {
        private String path;
        private String label;
        private String type;
        private java.util.List<FieldNode> children;

        public String getPath() { return path; }
        public void setPath(String path) { this.path = path; }
        public String getLabel() { return label; }
        public void setLabel(String label) { this.label = label; }
        public String getType() { return type; }
        public void setType(String type) { this.type = type; }
        public java.util.List<FieldNode> getChildren() { return children; }
        public void setChildren(java.util.List<FieldNode> children) { this.children = children; }
    }

    @com.fasterxml.jackson.annotation.JsonIgnoreProperties(ignoreUnknown = true)
    public static class ResultVarDef {
        private String name;
        private java.util.List<FieldNode> structure;
        /** WHOLE=整体值 | KEY=按 key 取（发布校验必填；运行期未知/缺省按 WHOLE 兜底）。 */
        private String mode;
        /** string | number | boolean | json（展示辅助，不做强校验）。 */
        private String type;
        private String desc;

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getMode() { return mode; }
        public void setMode(String mode) { this.mode = mode; }

        public String getType() { return type; }
        public void setType(String type) { this.type = type; }

        public String getDesc() { return desc; }
        public void setDesc(String desc) { this.desc = desc; }

        public java.util.List<FieldNode> getStructure() { return structure; }
        public void setStructure(java.util.List<FieldNode> structure) { this.structure = structure; }
    }

    /** 入参声明（运行测试表单 / 文档展示用）。 */
    @com.fasterxml.jackson.annotation.JsonIgnoreProperties(ignoreUnknown = true)
    public static class InputVarDef {
        private String name;
        private java.util.List<FieldNode> structure;
        /** string | number | boolean | json（展示辅助，不做强校验）。 */
        private String type;
        private Boolean required;
        private String desc;

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getType() { return type; }
        public void setType(String type) { this.type = type; }

        public Boolean getRequired() { return required; }
        public void setRequired(Boolean required) { this.required = required; }

        public String getDesc() { return desc; }
        public void setDesc(String desc) { this.desc = desc; }

        public java.util.List<FieldNode> getStructure() { return structure; }
        public void setStructure(java.util.List<FieldNode> structure) { this.structure = structure; }
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
