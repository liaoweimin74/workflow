package com.workflow.ai.tool.page;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.workflow.ai.tool.AiTool;
import com.workflow.ai.tool.AiToolContext;
import org.springframework.stereotype.Component;

/**
 * 工具：页面操作指令下发（AI 页面操作核心通道）。
 *
 * <p>本工具不在服务端执行任何页面逻辑，而是把结构化动作序列原样透传给前端：
 * agent 循环检测到本工具调用后，通过 SSE 事件 {@code page_action} 下发动作，
 * 由当前页面的执行器（L1 结构化 / L2 注册 / L3 DOM 兜底）执行，执行结果由前端作为
 * {@code observation} 用户消息回传，形成多步闭环。
 *
 * <p>动作集与语义（op）见系统提示「页面操作」章节；此处仅做结构校验与计数。
 */
@Component
public class PageControlTool implements AiTool {

    public static final String NAME = "page_control";

    /** 单次调用允许的最大动作数（防止超长指令）。 */
    static final int MAX_ACTIONS = 12;

    private final ObjectMapper objectMapper;

    public PageControlTool(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public String description() {
        return "操作当前页面：输入查询条件、点击查询/按钮、填写表单、提交、筛选刷新、读取页面数据等。"
                + "actions 为按顺序执行的动作数组，每个动作 {op, target?, field?, value?, params?}，"
                + "可用 op 与 target 取值范围以系统提示「当前页面组件清单」为准。"
                + "执行结果会以 observation 消息回传，请根据结果继续下一步或向用户总结。";
    }

    @Override
    public JsonNode parametersSchema() {
        ObjectNode schema = objectMapper.createObjectNode();
        schema.put("type", "object");
        ObjectNode properties = schema.putObject("properties");

        ObjectNode actions = properties.putObject("actions");
        actions.put("type", "array");
        actions.put("description", "按顺序执行的动作列表（单次最多 " + MAX_ACTIONS + " 个）");
        ObjectNode items = actions.putObject("items");
        items.put("type", "object");
        ObjectNode ap = items.putObject("properties");
        ap.putObject("op").put("type", "string").put(
                "description", "动作类型：set-query/search/reset/set-value/set-filter/click/fill/open-create/"
                        + "open-edit/submit/validate/delete-rows/refresh/sort/navigate/get-state/read-table/expect");
        ap.putObject("target").put("type", "string")
                .put("description", "目标：字段名/数据源id/#ai-N(L3 DOM元素)/语义按钮名/菜单路径(navigate)");
        ap.putObject("field").put("type", "string").put("description", "字段名（set-value/set-filter 用，可并入 target）");
        ap.putObject("value").put("description", "赋值（set-query/set-value/set-filter/fill 用；任意 JSON 值：字符串/数字/数组/对象）");
        ap.putObject("params").put("type", "object")
                .put("description", "附加参数（sort:{sort,order}；read-table:{limit}；expect:{type,expected,comparator}）");
        ArrayNode required = items.putArray("required");
        required.add("op");

        ArrayNode req = schema.putArray("required");
        req.add("actions");
        return schema;
    }

    @Override
    public String execute(JsonNode arguments, AiToolContext context) {
        JsonNode actions = arguments == null ? null : arguments.path("actions");
        if (actions == null || !actions.isArray() || actions.isEmpty()) {
            return "{\"error\":\"缺少 actions 数组或为空\"}";
        }
        if (actions.size() > MAX_ACTIONS) {
            return "{\"error\":\"actions 超过单次上限 " + MAX_ACTIONS + "，请拆分多次调用\"}";
        }
        // 结构校验：每个动作必须有 op；op 白名单粗校验（不认识的原样透传，由前端判定）
        ArrayNode cleaned = objectMapper.createArrayNode();
        for (JsonNode a : actions) {
            String op = a.path("op").asText("").trim();
            if (op.isEmpty()) {
                return "{\"error\":\"存在缺少 op 的动作\"}";
            }
            cleaned.add(a);
        }
        ObjectNode out = objectMapper.createObjectNode();
        out.put("dispatched", true);
        out.put("count", cleaned.size());
        out.set("actions", cleaned);
        return out.toString();
    }
}
