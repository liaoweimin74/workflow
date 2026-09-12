package com.workflow.ai.formgen;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.ai.tool.AiToolContext;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * GenerateFormSchemaTool 测试。
 */
class GenerateFormSchemaToolTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void nameAndParametersSchema() {
        GenerateFormSchemaTool tool = new GenerateFormSchemaTool(mock(AiFormGenerationService.class), objectMapper);

        assertThat(tool.name()).isEqualTo("generate_form_schema");
        assertThat(tool.parametersSchema().path("required").get(0).asText()).isEqualTo("description");
        assertThat(tool.description()).contains("表单");
    }

    @Test
    void execute_delegatesToServiceAndReturnsJson() throws Exception {
        AiFormGenerationService service = mock(AiFormGenerationService.class);
        when(service.generateSync("请假单")).thenReturn(
                new AiFormGenerateResult("{\"rule\":[]}", List.of(), List.of()));
        GenerateFormSchemaTool tool = new GenerateFormSchemaTool(service, objectMapper);

        String output = tool.execute(objectMapper.readTree("{\"description\":\"请假单\"}"), AiToolContext.empty());

        assertThat(output).contains("\"schema\"").contains("rule");
    }
}
