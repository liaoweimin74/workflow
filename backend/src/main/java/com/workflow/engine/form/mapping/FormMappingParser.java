package com.workflow.engine.form.mapping;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Collections;
import java.util.List;

/**
 * 解析 NodeConfig.configJson 中的表单字段映射与流程变量映射配置。
 *
 * <p>configJson 结构：
 * <pre>
 * {
 *   "form": { "formDefId": "F2", "dataMappings": [ {"targetField": "...", "source": "form:initiator", "sourceField": "..."} ] },
 *   "variableMappings": [ {"variable": "...", "source": "form:initiator", "sourceField": "..."} ]
 * }
 * </pre>
 * 无配置（缺失/空）返回空列表；解析异常返回空列表并记录 warn 日志，不阻断调用方。
 */
public class FormMappingParser {

    private static final Logger log = LoggerFactory.getLogger(FormMappingParser.class);

    private final ObjectMapper objectMapper;

    public FormMappingParser(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * 解析表单字段映射（root.form.dataMappings 数组）。
     */
    public List<FormDataMapping> parseDataMappings(String configJson) {
        JsonNode root = parseRoot(configJson);
        if (root == null) {
            return Collections.emptyList();
        }
        JsonNode arr = root.path("form").path("dataMappings");
        return parseList(arr, FormDataMapping.class);
    }

    /**
     * 解析流程变量映射（root.variableMappings 数组）。
     */
    public List<VariableMapping> parseVariableMappings(String configJson) {
        JsonNode root = parseRoot(configJson);
        if (root == null) {
            return Collections.emptyList();
        }
        return parseList(root.path("variableMappings"), VariableMapping.class);
    }

    private JsonNode parseRoot(String configJson) {
        if (configJson == null || configJson.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readTree(configJson);
        } catch (Exception e) {
            log.warn("Failed to parse configJson: {}", e.getMessage());
            return null;
        }
    }

    private <T> List<T> parseList(JsonNode arr, Class<T> type) {
        if (arr == null || !arr.isArray() || arr.isEmpty()) {
            return Collections.emptyList();
        }
        try {
            return objectMapper.readerForListOf(type).readValue(arr);
        } catch (Exception e) {
            log.warn("Failed to parse {} list: {}", type.getSimpleName(), e.getMessage());
            return Collections.emptyList();
        }
    }
}