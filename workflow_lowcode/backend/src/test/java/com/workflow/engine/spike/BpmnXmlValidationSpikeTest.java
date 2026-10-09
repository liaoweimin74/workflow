package com.workflow.engine.spike;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.engine.process.bpmn.MultiInstanceBpmnRewriter;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;

/**
 * 复现：bpmn-js 导出的真实 XML（含 incoming/outgoing 子元素）部署到 Flowable 是否报 XSD 校验错误。
 * 
 * <p>数据库中的 XML 由 bpmn-js 序列化，userTask 内含 &lt;incoming&gt;/&lt;outgoing&gt; 子元素。
 * 如果原始 XML 本身违反 BPMN XSD 顺序约束，Flowable 部署时会抛 cvc-complex-type.2.4.a。
 * 
 * <p>同时验证 {@link MultiInstanceBpmnRewriter} 改写后 XML 的 XSD 合规性。
 */
@DisplayName("Spike: bpmn-js 真实 XML 部署校验")
class BpmnXmlValidationSpikeTest extends AbstractFlowableSpikeTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final MultiInstanceBpmnRewriter rewriter = new MultiInstanceBpmnRewriter(objectMapper);

    // 从数据库 wf_process_draft 取的真实 XML（请假流程，bb0bb7ae）
    // 保留 userTask 的 incoming/outgoing 子元素结构（bpmn-js 真实输出格式）
    private static final String REAL_BPMN_XML = """
            <?xml version="1.0" encoding="UTF-8"?>
            <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                              xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                              xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                              xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                              xmlns:wf="http://workflow.com/schema/bpmn/wf"
                              xmlns:flowable="http://flowable.org/bpmn"
                              targetNamespace="test">
              <bpmn:process id="leave_apply" name="请假流程" isExecutable="true">
                <bpmn:startEvent id="Event_0uotfgr">
                  <bpmn:outgoing>Flow_12e58fi</bpmn:outgoing>
                </bpmn:startEvent>
                <bpmn:userTask id="Activity_0yqsyh4" wf:nodeRole="initiator" flowable:assignee="${initiator}">
                  <bpmn:incoming>Flow_12e58fi</bpmn:incoming>
                  <bpmn:outgoing>Flow_0qkec80</bpmn:outgoing>
                </bpmn:userTask>
                <bpmn:sequenceFlow id="Flow_12e58fi" sourceRef="Event_0uotfgr" targetRef="Activity_0yqsyh4" />
                <bpmn:userTask id="Activity_00iheto" flowable:assignee="${approver}">
                  <bpmn:incoming>Flow_0qkec80</bpmn:incoming>
                  <bpmn:outgoing>Flow_1xhus9m</bpmn:outgoing>
                </bpmn:userTask>
                <bpmn:sequenceFlow id="Flow_0qkec80" sourceRef="Activity_0yqsyh4" targetRef="Activity_00iheto" />
                <bpmn:endEvent id="Event_0ube3in">
                  <bpmn:incoming>Flow_1xhus9m</bpmn:incoming>
                </bpmn:endEvent>
                <bpmn:sequenceFlow id="Flow_1xhus9m" sourceRef="Activity_00iheto" targetRef="Event_0ube3in" />
              </bpmn:process>
              <bpmndi:BPMNDiagram id="BPMNDiagram_1">
                <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="leave_apply">
                  <bpmndi:BPMNShape id="Event_0uotfgr_di" bpmnElement="Event_0uotfgr">
                    <dc:Bounds x="137" y="284" width="36" height="36" />
                  </bpmndi:BPMNShape>
                  <bpmndi:BPMNShape id="Activity_0yqsyh4_di" bpmnElement="Activity_0yqsyh4">
                    <dc:Bounds x="230" y="262" width="100" height="80" />
                  </bpmndi:BPMNShape>
                  <bpmndi:BPMNShape id="Activity_00iheto_di" bpmnElement="Activity_00iheto">
                    <dc:Bounds x="390" y="262" width="100" height="80" />
                  </bpmndi:BPMNShape>
                  <bpmndi:BPMNShape id="Event_0ube3in_di" bpmnElement="Event_0ube3in">
                    <dc:Bounds x="552" y="284" width="36" height="36" />
                  </bpmndi:BPMNShape>
                  <bpmndi:BPMNEdge id="Flow_12e58fi_di" bpmnElement="Flow_12e58fi">
                    <di:waypoint x="173" y="302" />
                    <di:waypoint x="230" y="302" />
                  </bpmndi:BPMNEdge>
                  <bpmndi:BPMNEdge id="Flow_0qkec80_di" bpmnElement="Flow_0qkec80">
                    <di:waypoint x="330" y="302" />
                    <di:waypoint x="390" y="302" />
                  </bpmndi:BPMNEdge>
                  <bpmndi:BPMNEdge id="Flow_1xhus9m_di" bpmnElement="Flow_1xhus9m">
                    <di:waypoint x="490" y="302" />
                    <di:waypoint x="552" y="302" />
                  </bpmndi:BPMNEdge>
                </bpmndi:BPMNPlane>
              </bpmndi:BPMNDiagram>
            </bpmn:definitions>
            """;

    @Test
    @DisplayName("原始 bpmn-js XML（无 MI）部署到 Flowable 应成功")
    void rawBpmnXml_deploySucceeds() {
        deploy("leave_apply", REAL_BPMN_XML);
    }

    @Test
    @DisplayName("rewriter 改写后的 XML（countersign）部署到 Flowable 应成功，不报 cvc-complex-type.2.4.a")
    void rewrittenBpmnXml_deploySucceeds() {
        // 模拟数据库中的 countersign 配置
        String configJson = """
                {"approval":{"type":"user","userIds":[5],"multiMode":"countersign"}}""";

        String rewritten = rewriter.rewrite(REAL_BPMN_XML, Map.of("Activity_00iheto", configJson));

        // 验证改写后 XML 包含多实例
        org.assertj.core.api.Assertions.assertThat(rewritten)
                .contains("multiInstanceLoopCharacteristics")
                .contains("completionCondition");

        // 部署到 Flowable（触发 XSD 校验），不抛异常则通过
        deploy("leave_apply_mi", rewritten);
    }
}