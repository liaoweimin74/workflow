package com.workflow.engine.form.mapping;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.engine.process.bpmn.InitiatorNodeResolver;
import com.workflow.engine.process.entity.NodeConfig;
import com.workflow.engine.process.repository.NodeConfigRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * FormMappingResolver 单元测试。
 *
 * <p>验证：按部署版本解析节点级表单字段映射与流程级变量映射；
 * form:initiator / form:&lt;nodeId&gt; 源的表单定义定位。
 */
class FormMappingResolverTest {

    private NodeConfigRepository nodeConfigRepository;
    private InitiatorNodeResolver initiatorNodeResolver;
    private FormMappingParser parser;
    private FormMappingResolver resolver;

    private static final String PROC_DEF = "procDef:1:uuid";

    @BeforeEach
    void setUp() {
        // 节点 UserTask_1 配 form.formDefId=F2 + dataMappings
        NodeConfig userTask1 = new NodeConfig();
        userTask1.setNodeId("UserTask_1");
        userTask1.setProcessDefinitionId(PROC_DEF);
        userTask1.setConfigJson("{\"form\":{\"formDefId\":\"F2\",\"dataMappings\":[" +
            "{\"targetField\":\"applicantName\",\"source\":\"form:initiator\",\"sourceField\":\"name\"}]}}");

        // 发起节点 StartEvent_1 配 form.formDefId=F1
        NodeConfig startEvent1 = new NodeConfig();
        startEvent1.setNodeId("StartEvent_1");
        startEvent1.setProcessDefinitionId(PROC_DEF);
        startEvent1.setConfigJson("{\"form\":{\"formDefId\":\"F1\"}}");

        // __PROCESS__ 配 form.formDefId=F0 + variableMappings
        NodeConfig process = new NodeConfig();
        process.setNodeId("__PROCESS__");
        process.setProcessDefinitionId(PROC_DEF);
        process.setConfigJson("{\"form\":{\"formDefId\":\"F0\"},\"variableMappings\":[" +
            "{\"variable\":\"requestAmount\",\"source\":\"form:initiator\",\"sourceField\":\"amount\"}]}");

        nodeConfigRepository = mock(NodeConfigRepository.class);
        when(nodeConfigRepository.findByProcessDefinitionId(PROC_DEF))
            .thenReturn(List.of(userTask1, startEvent1, process));

        initiatorNodeResolver = mock(InitiatorNodeResolver.class);
        when(initiatorNodeResolver.resolve(PROC_DEF)).thenReturn("StartEvent_1");

        parser = mock(FormMappingParser.class);
        when(parser.parseDataMappings(anyString())).thenReturn(List.of());
        when(parser.parseDataMappings(userTask1.getConfigJson()))
            .thenReturn(List.of(new FormDataMapping("applicantName", "form:initiator", "name")));
        when(parser.parseVariableMappings(process.getConfigJson()))
            .thenReturn(List.of(new VariableMapping("requestAmount", "form:initiator", "amount")));

        resolver = new FormMappingResolver(nodeConfigRepository, initiatorNodeResolver, parser, new ObjectMapper());
    }

    @Test
    void resolvesNodeDataMappings() {
        Map<String, List<FormDataMapping>> m = resolver.resolveDataMappings(PROC_DEF);
        assertTrue(m.containsKey("UserTask_1"));
        assertEquals(1, m.get("UserTask_1").size());
        assertEquals("applicantName", m.get("UserTask_1").get(0).targetField());
        assertEquals("form:initiator", m.get("UserTask_1").get(0).source());
    }

    @Test
    void resolvesProcessVariableMappings() {
        List<VariableMapping> list = resolver.resolveVariableMappings(PROC_DEF);
        assertEquals(1, list.size());
        assertEquals("requestAmount", list.get(0).variable());
    }

    @Test
    void resolvesInitiatorFormDefId() {
        String formDefId = resolver.resolveSourceFormDefId("form:initiator", PROC_DEF, "UserTask_1", "inst1");
        assertEquals("F1", formDefId); // 发起人节点 StartEvent_1 的表单
    }

    @Test
    void variableSourceReturnsNull() {
        assertNull(resolver.resolveSourceFormDefId("variable:gatewayResult", PROC_DEF, "UserTask_1", "inst1"));
    }
}