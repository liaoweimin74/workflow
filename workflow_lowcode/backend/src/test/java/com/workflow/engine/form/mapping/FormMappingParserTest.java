package com.workflow.engine.form.mapping;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * FormMappingParser 单元测试。
 *
 * <p>验证：从 NodeConfig.configJson 解析表单字段映射与流程变量映射；
 * 无配置或非法配置时返回空列表。
 */
class FormMappingParserTest {

    private final FormMappingParser parser = new FormMappingParser(new ObjectMapper());

    @Test
    void parsesFormDataMappings() {
        String json = "{\"form\":{\"formDefId\":\"F2\",\"dataMappings\":[" +
            "{\"targetField\":\"applicantName\",\"source\":\"form:initiator\",\"sourceField\":\"name\"}," +
            "{\"targetField\":\"auditResult\",\"source\":\"variable:gatewayResult\"}]}}";
        List<FormDataMapping> list = parser.parseDataMappings(json);
        assertEquals(2, list.size());
        assertEquals("applicantName", list.get(0).targetField());
        assertEquals("form:initiator", list.get(0).source());
        assertEquals("name", list.get(0).sourceField());
        assertNull(list.get(1).sourceField());
    }

    @Test
    void parsesVariableMappings() {
        String json = "{\"variableMappings\":[{\"variable\":\"requestAmount\"," +
            "\"source\":\"form:initiator\",\"sourceField\":\"amount\"}]}";
        List<VariableMapping> list = parser.parseVariableMappings(json);
        assertEquals(1, list.size());
        assertEquals("requestAmount", list.get(0).variable());
    }

    @Test
    void emptyWhenNoConfig() {
        assertTrue(parser.parseDataMappings("{}").isEmpty());
        assertTrue(parser.parseDataMappings(null).isEmpty());
        assertTrue(parser.parseVariableMappings("{\"form\":{\"formDefId\":\"F2\"}}").isEmpty());
    }
}