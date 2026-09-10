package com.workflow.engine.form.mapping;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.engine.form.entity.FormData;
import com.workflow.engine.form.repository.FormDataRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.flowable.engine.RuntimeService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

/**
 * 流程变量映射写入器：按流程级 variableMappings 配置，将源表单字段或
 * 源流程变量的值写入目标流程变量。
 *
 * <p>触发时机：流程发起成功后、任务完成/驳回等流转动作后。
 * 源数据缺失时跳过该条写入，不抛错、不阻断。
 */
@Component
public class VariableMappingWriter {

    private static final Logger log = LoggerFactory.getLogger(VariableMappingWriter.class);

    private static final String VARIABLE_PREFIX = "variable:";
    private static final String FORM_PREFIX = "form:";

    private final FormMappingResolver resolver;
    private final FormDataRepository formDataRepository;
    private final RuntimeService runtimeService;
    private final TenantProvider tenantProvider;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public VariableMappingWriter(FormMappingResolver resolver,
                                 FormDataRepository formDataRepository,
                                 RuntimeService runtimeService,
                                 TenantProvider tenantProvider) {
        this.resolver = resolver;
        this.formDataRepository = formDataRepository;
        this.runtimeService = runtimeService;
        this.tenantProvider = tenantProvider;
    }

    /**
     * 遍历流程级 variableMappings 并写入流程变量。
     *
     * @param processDefinitionId 流程定义 ID
     * @param processInstanceId   流程实例 ID
     */
    public void write(String processDefinitionId, String processInstanceId) {
        List<VariableMapping> mappings = resolver.resolveVariableMappings(processDefinitionId);
        if (mappings.isEmpty()) {
            return;
        }
        for (VariableMapping mapping : mappings) {
            try {
                Object value = resolveValue(mapping, processDefinitionId, processInstanceId);
                if (value != null) {
                    runtimeService.setVariable(processInstanceId, mapping.variable(), value);
                }
            } catch (Exception e) {
                log.warn("Failed to write variable mapping [{}] for instance [{}]: {}",
                        mapping, processInstanceId, e.getMessage());
            }
        }
    }

    /**
     * 解析单条映射的值；源数据缺失返回 null（跳过写入）。
     */
    private Object resolveValue(VariableMapping mapping, String processDefinitionId, String processInstanceId) {
        String source = mapping.source();
        if (source == null || source.isBlank()) {
            return null;
        }
        if (source.startsWith(VARIABLE_PREFIX)) {
            String sourceVariable = source.substring(VARIABLE_PREFIX.length());
            return runtimeService.getVariable(processInstanceId, sourceVariable);
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
     * 读取流程实例下指定表单当前数据（非快照）的字段值（保持 JSON 原始类型）。
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
            if (value == null || value.isNull()) {
                return null;
            }
            return objectMapper.convertValue(value, Object.class);
        } catch (Exception e) {
            log.warn("Failed to read field [{}] from form [{}] instance [{}]: {}",
                    sourceField, formDefId, processInstanceId, e.getMessage());
            return null;
        }
    }
}