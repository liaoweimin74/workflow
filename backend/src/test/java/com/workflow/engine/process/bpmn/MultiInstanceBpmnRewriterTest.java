package com.workflow.engine.process.bpmn;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.w3c.dom.Document;
import org.w3c.dom.Element;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;
import java.io.StringWriter;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * MultiInstanceBpmnRewriter 单元测试。
 *
 * <p>验证：给定普通 userTask BPMn XML + NodeConfig（multiMode），
 * 改写后 XML 包含 multiInstanceLoopCharacteristics、collection、completionCondition。
 */
class MultiInstanceBpmnRewriterTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final MultiInstanceBpmnRewriter rewriter = new MultiInstanceBpmnRewriter(objectMapper);

    private static final String PLAIN_BPMN = """
            <?xml version="1.0" encoding="UTF-8"?>
            <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
                         xmlns:flowable="http://flowable.org/bpmn"
                         targetNamespace="test">
              <process id="testProcess" name="测试流程" isExecutable="true">
                <startEvent id="start" />
                <userTask id="approvalTask" name="审批"
                          flowable:assignee="${approver}" />
                <endEvent id="end" />
                <sequenceFlow id="f1" sourceRef="start" targetRef="approvalTask" />
                <sequenceFlow id="f2" sourceRef="approvalTask" targetRef="end" />
              </process>
            </definitions>
            """;

    private Map<String, String> buildConfigs(String nodeId, String multiMode, String... userIds) throws Exception {
        StringBuilder json = new StringBuilder();
        json.append("{\"approval\":{\"type\":\"user\",\"multiMode\":\"").append(multiMode).append("\"");
        if (userIds.length > 0) {
            json.append(",\"userIds\":[");
            for (int i = 0; i < userIds.length; i++) {
                if (i > 0) json.append(",");
                json.append(userIds[i]);
            }
            json.append("]");
        }
        json.append("}}");
        Map<String, String> configs = new HashMap<>();
        configs.put(nodeId, json.toString());
        return configs;
    }

    private String rewrite(String bpmnXml, Map<String, String> nodeConfigs) throws Exception {
        return rewriter.rewrite(bpmnXml, nodeConfigs);
    }

    private Document parseXml(String xml) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true);
        DocumentBuilder builder = factory.newDocumentBuilder();
        return builder.parse(new java.io.ByteArrayInputStream(xml.getBytes("UTF-8")));
    }

    private Element getFirstUserTask(Document doc) {
        return (Element) doc.getElementsByTagNameNS(
                "http://www.omg.org/spec/BPMN/20100524/MODEL", "userTask").item(0);
    }

    @Test
    void rewrite_countersign_addsMultiInstanceLoopCharacteristics() throws Exception {
        Map<String, String> configs = buildConfigs("approvalTask", "countersign", "1", "2", "3");

        String result = rewrite(PLAIN_BPMN, configs);
        Document doc = parseXml(result);
        Element userTask = getFirstUserTask(doc);

        Element miLoop = (Element) userTask.getElementsByTagNameNS(
                "http://www.omg.org/spec/BPMN/20100524/MODEL", "multiInstanceLoopCharacteristics").item(0);

        assertThat(miLoop).as("会签 userTask 应包含 multiInstanceLoopCharacteristics").isNotNull();
        assertThat(miLoop.getAttribute("isSequential")).isEqualTo("false");
        assertThat(miLoop.getAttribute("flowable:collection")).isEqualTo("${approverList}");
        assertThat(miLoop.getAttribute("flowable:elementVariable")).isEqualTo("approver");
    }

    @Test
    void rewrite_countersign_completionCondition_allMustComplete() throws Exception {
        Map<String, String> configs = buildConfigs("approvalTask", "countersign", "1", "2", "3");

        String result = rewrite(PLAIN_BPMN, configs);
        Document doc = parseXml(result);
        Element userTask = getFirstUserTask(doc);
        Element miLoop = (Element) userTask.getElementsByTagNameNS(
                "http://www.omg.org/spec/BPMN/20100524/MODEL", "multiInstanceLoopCharacteristics").item(0);

        Element condition = (Element) miLoop.getElementsByTagNameNS(
                "http://www.omg.org/spec/BPMN/20100524/MODEL", "completionCondition").item(0);

        assertThat(condition).as("应包含 completionCondition").isNotNull();
        assertThat(condition.getTextContent().trim())
                .isEqualTo("${nrOfCompletedInstances == nrOfInstances}");
    }

    @Test
    void rewrite_orSign_completionCondition_anyCanComplete() throws Exception {
        Map<String, String> configs = buildConfigs("approvalTask", "or_sign", "1", "2", "3");

        String result = rewrite(PLAIN_BPMN, configs);
        Document doc = parseXml(result);
        Element userTask = getFirstUserTask(doc);
        Element miLoop = (Element) userTask.getElementsByTagNameNS(
                "http://www.omg.org/spec/BPMN/20100524/MODEL", "multiInstanceLoopCharacteristics").item(0);

        Element condition = (Element) miLoop.getElementsByTagNameNS(
                "http://www.omg.org/spec/BPMN/20100524/MODEL", "completionCondition").item(0);

        assertThat(condition).as("或签应包含 completionCondition").isNotNull();
        assertThat(condition.getTextContent().trim())
                .isEqualTo("${nrOfCompletedInstances >= 1}");
    }

    @Test
    void rewrite_orSign_addsMultiInstanceLoopCharacteristics() throws Exception {
        Map<String, String> configs = buildConfigs("approvalTask", "or_sign", "1", "2");

        String result = rewrite(PLAIN_BPMN, configs);
        Document doc = parseXml(result);
        Element userTask = getFirstUserTask(doc);

        Element miLoop = (Element) userTask.getElementsByTagNameNS(
                "http://www.omg.org/spec/BPMN/20100524/MODEL", "multiInstanceLoopCharacteristics").item(0);

        assertThat(miLoop).as("或签 userTask 应包含 multiInstanceLoopCharacteristics").isNotNull();
        assertThat(miLoop.getAttribute("isSequential")).isEqualTo("false");
    }

    @Test
    void rewrite_noMultiMode_leavesUserTaskUnchanged() throws Exception {
        Map<String, String> configs = new HashMap<>();
        configs.put("approvalTask", "{\"approval\":{\"type\":\"user\"}}");

        String result = rewrite(PLAIN_BPMN, configs);
        Document doc = parseXml(result);
        Element userTask = getFirstUserTask(doc);

        Element miLoop = (Element) userTask.getElementsByTagNameNS(
                "http://www.omg.org/spec/BPMN/20100524/MODEL", "multiInstanceLoopCharacteristics").item(0);

        assertThat(miLoop).as("无 multiMode 的 userTask 不应改写").isNull();
    }

    @Test
    void rewrite_noNodeConfig_leavesUserTaskUnchanged() throws Exception {
        String result = rewrite(PLAIN_BPMN, new HashMap<>());
        Document doc = parseXml(result);
        Element userTask = getFirstUserTask(doc);

        Element miLoop = (Element) userTask.getElementsByTagNameNS(
                "http://www.omg.org/spec/BPMN/20100524/MODEL", "multiInstanceLoopCharacteristics").item(0);

        assertThat(miLoop).as("无 NodeConfig 的 userTask 不应改写").isNull();
    }

    @Test
    void rewrite_preservesOriginalAssigneeAttribute() throws Exception {
        Map<String, String> configs = buildConfigs("approvalTask", "countersign", "1", "2", "3");

        String result = rewrite(PLAIN_BPMN, configs);
        Document doc = parseXml(result);
        Element userTask = getFirstUserTask(doc);

        assertThat(userTask.getAttribute("flowable:assignee"))
                .isEqualTo("${approver}");
    }

    @Test
    void rewrite_invalidJson_skipsNodeGracefully() throws Exception {
        Map<String, String> configs = new HashMap<>();
        configs.put("approvalTask", "{invalid json}");

        String result = rewrite(PLAIN_BPMN, configs);

        // 不抛异常，userTask 保持原样
        Document doc = parseXml(result);
        Element userTask = getFirstUserTask(doc);
        Element miLoop = (Element) userTask.getElementsByTagNameNS(
                "http://www.omg.org/spec/BPMN/20100524/MODEL", "multiInstanceLoopCharacteristics").item(0);
        assertThat(miLoop).isNull();
    }

    @Test
    void rewrite_multipleUserTasks_onlyRewritesConfiguredOnes() throws Exception {
        String bpmnWithTwoTasks = """
                <?xml version="1.0" encoding="UTF-8"?>
                <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
                             xmlns:flowable="http://flowable.org/bpmn"
                             targetNamespace="test">
                  <process id="testProcess" name="测试流程" isExecutable="true">
                    <startEvent id="start" />
                    <userTask id="task1" name="审批1" flowable:assignee="${approver}" />
                    <userTask id="task2" name="审批2" flowable:assignee="${approver2}" />
                    <endEvent id="end" />
                    <sequenceFlow id="f1" sourceRef="start" targetRef="task1" />
                    <sequenceFlow id="f2" sourceRef="task1" targetRef="task2" />
                    <sequenceFlow id="f3" sourceRef="task2" targetRef="end" />
                  </process>
                </definitions>
                """;

        Map<String, String> configs = buildConfigs("task2", "countersign", "1", "2", "3");

        String result = rewrite(bpmnWithTwoTasks, configs);
        Document doc = parseXml(result);

        var userTasks = doc.getElementsByTagNameNS(
                "http://www.omg.org/spec/BPMN/20100524/MODEL", "userTask");

        Element task1 = (Element) userTasks.item(0);
        Element task2 = (Element) userTasks.item(1);

        Element miLoop1 = (Element) task1.getElementsByTagNameNS(
                "http://www.omg.org/spec/BPMN/20100524/MODEL", "multiInstanceLoopCharacteristics").item(0);
        Element miLoop2 = (Element) task2.getElementsByTagNameNS(
                "http://www.omg.org/spec/BPMN/20100524/MODEL", "multiInstanceLoopCharacteristics").item(0);

        assertThat(miLoop1).as("task1 无配置，不应改写").isNull();
        assertThat(miLoop2).as("task2 有会签配置，应改写").isNotNull();
    }
}
