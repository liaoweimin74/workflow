package com.workflow.ai.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.workflow.ai.model.ToolSpec;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 工具注册表：汇总所有 {@link AiTool}，供 agent 生成工具声明与分派执行。
 */
@Component
public class AiToolRegistry {

    private final Map<String, AiTool> tools = new LinkedHashMap<>();

    public AiToolRegistry(List<AiTool> toolList) {
        if (toolList != null) {
            for (AiTool tool : toolList) {
                tools.put(tool.name(), tool);
            }
        }
    }

    /** 工具声明列表（发给模型）。 */
    public List<ToolSpec> specs() {
        return tools.values().stream()
                .map(t -> new ToolSpec(t.name(), t.description(), t.parametersSchema()))
                .toList();
    }

    /** 是否注册了该工具。 */
    public boolean has(String name) {
        return tools.containsKey(name);
    }

    /** 执行工具；未知工具或执行异常返回错误 JSON，不抛出。 */
    public String execute(String name, JsonNode arguments) {
        AiTool tool = tools.get(name);
        if (tool == null) {
            return "{\"error\":\"未知工具: " + escape(name) + "\"}";
        }
        try {
            return tool.execute(arguments);
        } catch (Exception e) {
            return "{\"error\":\"" + escape(e.getMessage()) + "\"}";
        }
    }

    private static String escape(String s) {
        if (s == null) {
            return "";
        }
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
