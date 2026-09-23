package com.workflow.ai.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;

/**
 * 工具：在回复中提供可点击的页面入口（引导用户跳转到平台内页面）。
 *
 * <p>安全：仅接受当前用户可访问页面白名单（{@link AiToolContext#pages()}）中的路径，
 * 不接受任意 URL，避免提示注入诱导跳转。
 */
@Component
public class OpenPageTool implements AiTool {

    public static final String NAME = "open_page";

    private final ObjectMapper objectMapper;

    public OpenPageTool(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public String description() {
        return "在回复中提供一个可点击的页面入口，引导用户直接跳转到平台内某页面。"
                + "仅当用户需要前往某页面（如配置、查看、管理）时调用；"
                + "path 必须是系统提示中列出的「用户可访问页面」之一的路径。";
    }

    @Override
    public JsonNode parametersSchema() {
        ObjectNode schema = objectMapper.createObjectNode();
        schema.put("type", "object");
        ObjectNode properties = schema.putObject("properties");
        ObjectNode path = properties.putObject("path");
        path.put("type", "string");
        path.put("description", "目标页面的路由路径，必须来自系统提示中列出的可用页面");
        ArrayNode required = schema.putArray("required");
        required.add("path");
        return schema;
    }

    @Override
    public String execute(JsonNode arguments, AiToolContext context) {
        String requested = arguments == null ? "" : arguments.path("path").asText("").trim();
        if (requested.isEmpty()) {
            return "{\"error\":\"缺少 path 参数\"}";
        }
        if (context == null || context.pages() == null) {
            return "{\"error\":\"未找到该页面\"}";
        }
        for (var page : context.pages()) {
            if (requested.equals(page.path())) {
                ObjectNode out = objectMapper.createObjectNode();
                out.put("path", page.path());
                out.put("label", page.label());
                return out.toString();
            }
        }
        return "{\"error\":\"未找到该页面\"}";
    }
}
