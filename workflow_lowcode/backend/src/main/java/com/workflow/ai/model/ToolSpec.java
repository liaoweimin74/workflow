package com.workflow.ai.model;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * 工具（函数）定义。
 *
 * @param name       工具名
 * @param description 工具用途描述
 * @param parameters  参数 JSON Schema
 */
public record ToolSpec(String name, String description, JsonNode parameters) {
}
