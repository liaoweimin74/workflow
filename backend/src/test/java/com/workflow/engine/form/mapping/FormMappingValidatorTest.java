package com.workflow.engine.form.mapping;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.process.bpmn.InitiatorNodeResolver;
import com.workflow.engine.process.entity.NodeConfig;
import com.workflow.engine.process.repository.NodeConfigRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * FormMappingValidator 发布校验单元测试。
 *
 * <p>覆盖：targetField 存在性、form:* 源 sourceField 存在性、
 * 流程变量名唯一、节点间（含 form:initiator 间接环）循环引用检测。
 */
class FormMappingValidatorTest {

    private static final String PD_ID = "procDef:1:uuid";

    private NodeConfigRepository nodeConfigRepository;
    private FormMappingResolver resolver;
    private InitiatorNodeResolver initiatorNodeResolver;
    private FormDefinitionRepository formDefRepository;
    private FormMappingValidator validator;

    @BeforeEach
    void setUp() {
        nodeConfigRepository = mock(NodeConfigRepository.class);
        resolver = mock(FormMappingResolver.class);
        initiatorNodeResolver = mock(InitiatorNodeResolver.class);
        formDefRepository = mock(FormDefinitionRepository.class);
        validator = new FormMappingValidator(nodeConfigRepository, resolver, initiatorNodeResolver,
                formDefRepository, new ObjectMapper());

        // 默认场景：节点 UserTask_2 表单 F2 的 targetField 引用不存在的字段 "nonexistent"
        when(nodeConfigRepository.findByProcessDefinitionId(PD_ID))
                .thenReturn(List.of(
                        nodeConfig("UserTask_1", "{\"form\":{\"formDefId\":\"F1\"}}"),
                        nodeConfig("UserTask_2", "{\"form\":{\"formDefId\":\"F2\",\"dataMappings\":["
                                + "{\"targetField\":\"nonexistent\",\"source\":\"form:initiator\",\"sourceField\":\"applicantName\"}]}}")));
        when(initiatorNodeResolver.resolve(PD_ID)).thenReturn("UserTask_1");
        when(resolver.resolveSourceFormDefId("form:initiator", PD_ID, "UserTask_2", null))
                .thenReturn("F1");
        when(formDefRepository.findById("F1"))
                .thenReturn(Optional.of(formDef("F1", "{\"rule\":[{\"type\":\"input\",\"field\":\"applicantName\"}]}")));
        when(formDefRepository.findById("F2"))
                .thenReturn(Optional.of(formDef("F2", "{\"rule\":[{\"type\":\"input\",\"field\":\"name\"}]}")));
    }

    @Test
    void rejectsUnknownTargetField() {
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> validator.validate(PD_ID));
        assertTrue(ex.getMessage().contains("nonexistent"));
    }

    @Test
    void rejectsDuplicateVariableNames() {
        NodeConfig process = nodeConfig("__PROCESS__", "{\"variableMappings\":["
                + "{\"variable\":\"total\",\"source\":\"form:initiator\",\"sourceField\":\"amount\"},"
                + "{\"variable\":\"total\",\"source\":\"variable:other\"}]}");
        when(nodeConfigRepository.findByProcessDefinitionId("procDef:dupVar:uuid"))
                .thenReturn(List.of(process));
        when(initiatorNodeResolver.resolve("procDef:dupVar:uuid")).thenReturn("UserTask_1");
        when(resolver.resolveSourceFormDefId("form:initiator", "procDef:dupVar:uuid", "__PROCESS__", null))
                .thenReturn("F1");
        when(formDefRepository.findById("F1"))
                .thenReturn(Optional.of(formDef("F1", "{\"rule\":[{\"type\":\"input\",\"field\":\"amount\"}]}")));

        assertThrows(IllegalArgumentException.class,
                () -> validator.validate("procDef:dupVar:uuid"));
    }

    @Test
    void rejectsCyclicReferences() {
        // A 引 B、B 引 A
        when(nodeConfigRepository.findByProcessDefinitionId("procDef:cycle:uuid"))
                .thenReturn(List.of(
                        nodeConfig("A", "{\"form\":{\"formDefId\":\"FA\",\"dataMappings\":["
                                + "{\"targetField\":\"a\",\"source\":\"form:B\",\"sourceField\":\"b\"}]}}"),
                        nodeConfig("B", "{\"form\":{\"formDefId\":\"FB\",\"dataMappings\":["
                                + "{\"targetField\":\"b\",\"source\":\"form:A\",\"sourceField\":\"a\"}]}}")));
        when(resolver.resolveSourceFormDefId("form:B", "procDef:cycle:uuid", "A", null)).thenReturn("FB");
        when(resolver.resolveSourceFormDefId("form:A", "procDef:cycle:uuid", "B", null)).thenReturn("FA");
        when(formDefRepository.findById("FA"))
                .thenReturn(Optional.of(formDef("FA", "{\"rule\":[{\"type\":\"input\",\"field\":\"a\"}]}")));
        when(formDefRepository.findById("FB"))
                .thenReturn(Optional.of(formDef("FB", "{\"rule\":[{\"type\":\"input\",\"field\":\"b\"}]}")));

        assertThrows(IllegalArgumentException.class,
                () -> validator.validate("procDef:cycle:uuid"));
    }

    @Test
    void passesValidConfig() {
        // 覆盖默认非法配置：targetField 改为 F2 中真实存在的字段
        when(nodeConfigRepository.findByProcessDefinitionId(PD_ID))
                .thenReturn(List.of(
                        nodeConfig("UserTask_1", "{\"form\":{\"formDefId\":\"F1\"}}"),
                        nodeConfig("UserTask_2", "{\"form\":{\"formDefId\":\"F2\",\"dataMappings\":["
                                + "{\"targetField\":\"name\",\"source\":\"form:initiator\",\"sourceField\":\"applicantName\"}]}}")));

        assertDoesNotThrow(() -> validator.validate(PD_ID));
    }

    @Test
    void collectsSubTableFieldsForExistenceCheck() {
        // targetField 位于 group 子表 props.rule（fcRow 布局）内
        when(nodeConfigRepository.findByProcessDefinitionId("procDef:sub:uuid"))
                .thenReturn(List.of(
                        nodeConfig("UserTask_1", "{\"form\":{\"formDefId\":\"F1\"}}"),
                        nodeConfig("UserTask_2", "{\"form\":{\"formDefId\":\"F2\",\"dataMappings\":["
                                + "{\"targetField\":\"subAmount\",\"source\":\"variable:total\"}]}}")));
        when(formDefRepository.findById("F2"))
                .thenReturn(Optional.of(formDef("F2", "{\"rule\":[{\"type\":\"group\",\"field\":\"details\",\"props\":{\"rule\":["
                        + "{\"type\":\"fcRow\",\"field\":\"row1\",\"children\":["
                        + "{\"type\":\"input\",\"field\":\"subAmount\"}]}]}}]}")));

        assertDoesNotThrow(() -> validator.validate("procDef:sub:uuid"));
    }

    // ==================== helpers ====================

    private NodeConfig nodeConfig(String nodeId, String configJson) {
        NodeConfig nc = new NodeConfig();
        nc.setId("nc-" + nodeId);
        nc.setTenantId("tenant-1");
        nc.setProcessDefId("draft-1");
        nc.setNodeId(nodeId);
        nc.setConfigJson(configJson);
        return nc;
    }

    private FormDefinition formDef(String id, String schema) {
        FormDefinition fd = new FormDefinition();
        fd.setId(id);
        fd.setSchema(schema);
        return fd;
    }
}