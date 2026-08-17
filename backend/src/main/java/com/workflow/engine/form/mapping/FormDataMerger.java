package com.workflow.engine.form.mapping;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.engine.form.entity.FormData;
import com.workflow.engine.form.repository.FormDataRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.flowable.engine.RuntimeService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * mappedData 聚合器：按节点映射配置，将上游表单字段与流程变量的值聚合为
 * 目标节点可读的只读数据（targetField → value）。
 *
 * <p>语义：单向只读——聚合结果不回写源表单；源数据缺失时跳过该字段，不抛错、不阻断。
 */
public class FormDataMerger {

    private static final Logger log = LoggerFactory.getLogger(FormDataMerger.class);

    private static final String VARIABLE_PREFIX = "variable:";
    private static final String FORM_PREFIX = "form:";

    private final FormMappingResolver resolver;
    private final FormDataRepository formDataRepository;
    private final RuntimeService runtimeService;
    private final TenantProvider tenantProvider;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public FormDataMerger(FormMappingResolver resolver,
                          FormDataRepository formDataRepository,
                          RuntimeService runtimeService,
                          TenantProvider tenantProvider) {
        this.resolver = resolver;
        this.formDataRepository = formDataRepository;
        this.runtimeService = runtimeService;
        this.tenantProvider = tenantProvider;
    }

    /**
     * 聚合指定节点在流程实例下的 mappedData。
     *
     * @return targetField → value；无映射配置时返回空 Map
     */
    public Map<String, Object> merge(String processDefinitionId, String nodeId, String processInstanceId) {
        List<FormDataMapping> mappings =
            resolver.resolveDataMappings(processDefinitionId).getOrDefault(nodeId, List.of());
        if (mappings.isEmpty()) {
            return Map.of();
        }

        Map<String, Object> result = new LinkedHashMap<>();
        for (FormDataMapping mapping : mappings) {
            try {
                Object value = resolveValue(mapping, processDefinitionId, processInstanceId);
                if (value != null) {
                    result.put(mapping.targetField(), value);
                }
            } catch (Exception e) {
                log.warn("Failed to merge mapping [{}] for node [{}] in process [{}]: {}",
                        mapping, nodeId, processDefinitionId, e.getMessage());
            }
        }
        return result;
    }

    /**
     * 解析单条映射的值；源缺失/不可用时返回 null。
     */
    private Object resolveValue(FormDataMapping mapping, String processDefinitionId, String processInstanceId) {
        String source = mapping.source();
        if (source == null || source.isBlank()) {
            return null;
        }
        if (source.startsWith(VARIABLE_PREFIX)) {
            String variableName = source.substring(VARIABLE_PREFIX.length());
            return runtimeService.getVariable(processInstanceId, variableName);
        }
        if (source.startsWith(FORM_PREFIX)) {
            String formDefId = resolver.resolveSourceFormDefId(source, processDefinitionId, null, processInstanceId);
            if (formDefId == null) {
                return null;
            }
            return readFormField(formDefId, processInstanceId, mapping.sourceField());
        }
        return null;
    }

    /**
     * 读取流程实例下指定表单当前数据（非快照）的指定字段。
     */
    private Object readFormField(String formDefId, String processInstanceId, String sourceField) {
        if (sourceField == null || sourceField.isBlank()) {
            return null;
        }
        Optional<FormData> formData = formDataRepository
            .findByTenantIdAndProcessInstanceIdAndFormDefIdAndIsSnapshot(
                tenantProvider.getTenantId(), processInstanceId, formDefId, false);
        if (formData.isEmpty() || formData.get().getDataJson() == null) {
            return null;
        }
        try {
            JsonNode root = objectMapper.readTree(formData.get().getDataJson());
            JsonNode value = root.get(sourceField);
            return value == null || value.isNull() ? null : jsonToPlainValue(value);
        } catch (Exception e) {
            log.warn("Failed to read field [{}] from form [{}] instance [{}]: {}",
                    sourceField, formDefId, processInstanceId, e.getMessage());
            return null;
        }
    }

    private Object jsonToPlainValue(JsonNode node) {
        if (node.isTextual() || node.isBoolean() || node.isNumber()) {
            return node.asText();
        }
        return node.toString();
    }
}