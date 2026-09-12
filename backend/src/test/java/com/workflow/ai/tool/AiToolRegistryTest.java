package com.workflow.ai.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AiToolRegistry 测试。
 */
class AiToolRegistryTest {

    static class FakeTool implements AiTool {
        @Override public String name() { return "fake_tool"; }
        @Override public String description() { return "desc"; }
        @Override public JsonNode parametersSchema() { return new ObjectMapper().createObjectNode().put("type", "object"); }
        @Override public String execute(JsonNode arguments) { return "{\"ok\":true}"; }
    }

    static class BoomTool implements AiTool {
        @Override public String name() { return "boom"; }
        @Override public String description() { return "d"; }
        @Override public JsonNode parametersSchema() { return new ObjectMapper().createObjectNode(); }
        @Override public String execute(JsonNode arguments) { throw new RuntimeException("boom"); }
    }

    @Test
    void specs_listsRegisteredTools() {
        AiToolRegistry registry = new AiToolRegistry(List.of(new FakeTool()));

        assertThat(registry.specs()).hasSize(1);
        assertThat(registry.specs().get(0).name()).isEqualTo("fake_tool");
        assertThat(registry.has("fake_tool")).isTrue();
    }

    @Test
    void execute_unknownTool_returnsErrorJson() {
        AiToolRegistry registry = new AiToolRegistry(List.of());

        assertThat(registry.execute("nope", null)).contains("未知工具");
    }

    @Test
    void execute_toolException_returnsErrorJson() {
        AiToolRegistry registry = new AiToolRegistry(List.of(new BoomTool()));

        assertThat(registry.execute("boom", null)).contains("boom");
    }

    @Test
    void execute_success() {
        AiToolRegistry registry = new AiToolRegistry(List.of(new FakeTool()));

        assertThat(registry.execute("fake_tool", null)).isEqualTo("{\"ok\":true}");
    }
}
