package com.workflow.ai.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.ai.model.PageRef;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * OpenPageTool 测试。
 */
class OpenPageToolTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final OpenPageTool tool = new OpenPageTool(new ObjectMapper());

    private AiToolContext ctx() {
        return new AiToolContext(List.of(
                new PageRef("/form", "表单管理"),
                new PageRef("/process/center", "流程中心")));
    }

    @Test
    void nameAndSchema() {
        assertThat(tool.name()).isEqualTo("open_page");
        assertThat(tool.parametersSchema().path("required").get(0).asText()).isEqualTo("path");
    }

    @Test
    void execute_whitelistedPath_returnsPage() throws Exception {
        String out = tool.execute(objectMapper.readTree("{\"path\":\"/form\"}"), ctx());

        assertThat(out).contains("\"/form\"").contains("表单管理");
    }

    @Test
    void execute_nonWhitelistedPath_returnsError() throws Exception {
        String out = tool.execute(objectMapper.readTree("{\"path\":\"https://evil.example.com\"}"), ctx());

        assertThat(out).contains("未找到该页面");
    }

    @Test
    void execute_missingPath_returnsError() throws Exception {
        String out = tool.execute(objectMapper.readTree("{}"), ctx());

        assertThat(out).contains("缺少 path");
    }
}
