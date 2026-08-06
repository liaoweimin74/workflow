package com.workflow.engine.process.bpmn;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;
import java.io.ByteArrayInputStream;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * BPMN XML 多实例改写器。
 *
 * <p>在部署前扫描 BPMN XML 中的 userTask，根据 NodeConfig 的 approval.multiMode 配置，
 * 将普通 userTask 改写为 MI parallel（会签/或签）：
 * <ul>
 *   <li>countersign（会签）：completionCondition = nrOfCompletedInstances == nrOfInstances</li>
 *   <li>or_sign（或签）：completionCondition = nrOfCompletedInstances >= 1</li>
 * </ul>
 *
 * <p>改写器假设 userTask 已有 flowable:assignee 属性，改写时添加
 * multiInstanceLoopCharacteristics 子元素，collection 绑定到 ${approverList}，
 * elementVariable 绑定到 approver。
 */
@Component
public class MultiInstanceBpmnRewriter {

    private static final Logger log = LoggerFactory.getLogger(MultiInstanceBpmnRewriter.class);

    private static final String BPMN_NS = "http://www.omg.org/spec/BPMN/20100524/MODEL";
    private static final String FLOWABLE_NS = "http://flowable.org/bpmn";
    private static final String FLOWABLE_PREFIX = "flowable";

    private static final String COLLECTION_EXPR = "${approverList}";
    private static final String ELEMENT_VAR = "approver";
    private static final String COUNTERSIGN_CONDITION = "${rejected || (nrOfCompletedInstances == nrOfInstances)}";
    private static final String OR_SIGN_CONDITION = "${rejected || (nrOfCompletedInstances >= 1)}";

    private final ObjectMapper objectMapper;

    public MultiInstanceBpmnRewriter(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * 改写 BPMN XML，根据 nodeConfigs 添加多实例特性。
     *
     * @param bpmnXml    原始 BPMN XML
     * @param nodeConfigs nodeId → configJson 字符串
     * @return 改写后的 BPMN XML（无配置变更则原样返回）
     */
    public String rewrite(String bpmnXml, Map<String, String> nodeConfigs) {
        if (bpmnXml == null || bpmnXml.isBlank() || nodeConfigs == null || nodeConfigs.isEmpty()) {
            return bpmnXml;
        }

        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            DocumentBuilder builder = factory.newDocumentBuilder();
            Document doc = builder.parse(new ByteArrayInputStream(bpmnXml.getBytes(StandardCharsets.UTF_8)));

            boolean modified = false;
            NodeList userTasks = doc.getElementsByTagNameNS(BPMN_NS, "userTask");

            for (int i = 0; i < userTasks.getLength(); i++) {
                Element userTask = (Element) userTasks.item(i);
                String nodeId = userTask.getAttribute("id");
                if (nodeId == null || nodeId.isEmpty()) {
                    continue;
                }

                String configJson = nodeConfigs.get(nodeId);
                if (configJson == null || configJson.isBlank()) {
                    continue;
                }

                String multiMode = extractMultiMode(configJson);
                if (multiMode == null) {
                    continue;
                }

                applyMultiInstance(doc, userTask, multiMode);
                modified = true;
                log.debug("改写 userTask [{}] 为多实例模式: {}", nodeId, multiMode);
            }

            if (!modified) {
                return bpmnXml;
            }

            return serializeDocument(doc);
        } catch (Exception e) {
            log.warn("BPMN XML 改写失败，返回原始 XML: {}", e.getMessage());
            return bpmnXml;
        }
    }

    private String extractMultiMode(String configJson) {
        try {
            JsonNode root = objectMapper.readTree(configJson);
            JsonNode approval = root.path("approval");
            if (approval.isMissingNode() || !approval.isObject()) {
                return null;
            }
            JsonNode modeNode = approval.path("multiMode");
            if (modeNode.isMissingNode() || modeNode.isNull()) {
                return null;
            }
            String mode = modeNode.asText();
            return ("countersign".equals(mode) || "or_sign".equals(mode) || "sequential".equals(mode)) ? mode : null;
        } catch (Exception e) {
            log.debug("解析 NodeConfig JSON 失败，跳过: {}", e.getMessage());
            return null;
        }
    }

    private void applyMultiInstance(Document doc, Element userTask, String multiMode) {
        // 如果已有 multiInstanceLoopCharacteristics，不重复添加
        NodeList existing = userTask.getElementsByTagNameNS(BPMN_NS, "multiInstanceLoopCharacteristics");
        if (existing.getLength() > 0) {
            return;
        }

        Element miLoop = doc.createElementNS(BPMN_NS, "multiInstanceLoopCharacteristics");
        boolean isSequential = "sequential".equals(multiMode);
        miLoop.setAttribute("isSequential", String.valueOf(isSequential));
        miLoop.setAttributeNS(FLOWABLE_NS, FLOWABLE_PREFIX + ":collection", COLLECTION_EXPR);
        miLoop.setAttributeNS(FLOWABLE_NS, FLOWABLE_PREFIX + ":elementVariable", ELEMENT_VAR);

        Element completionCondition = doc.createElementNS(BPMN_NS, "completionCondition");
        // 依次审批（sequential）和会签（countersign）都要求全部完成，或签（or_sign）只需一人通过
        String condition = "or_sign".equals(multiMode) ? OR_SIGN_CONDITION : COUNTERSIGN_CONDITION;
        completionCondition.setTextContent(condition);

        miLoop.appendChild(completionCondition);

        // multiInstanceLoopCharacteristics 必须插入到 incoming/outgoing 之后，
        // 确保 XML 子元素顺序符合 BPMN 2.0 XSD 要求：
        //   incoming* → outgoing* → ioSpecification? → ... → loopCharacteristics? → rendering*
        // 如果找不到 incoming/outgoing，则插入到第一个子元素位置。
        Element firstChild = null;
        NodeList children = userTask.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            Node child = children.item(i);
            if (child.getNodeType() == Node.ELEMENT_NODE) {
                String ns = child.getNamespaceURI();
                String localName = child.getLocalName();
                // 跳过 incoming/outgoing，找到第一个非 incoming/outgoing 的元素
                if (BPMN_NS.equals(ns) && ("incoming".equals(localName) || "outgoing".equals(localName))) {
                    continue;
                }
                firstChild = (Element) child;
                break;
            }
        }
        userTask.insertBefore(miLoop, firstChild);
    }

    private String serializeDocument(Document doc) throws Exception {
        TransformerFactory tf = TransformerFactory.newInstance();
        Transformer transformer = tf.newTransformer();
        transformer.setOutputProperty(OutputKeys.OMIT_XML_DECLARATION, "no");
        transformer.setOutputProperty(OutputKeys.ENCODING, "UTF-8");
        transformer.setOutputProperty(OutputKeys.INDENT, "yes");

        StringWriter writer = new StringWriter();
        transformer.transform(new DOMSource(doc), new StreamResult(writer));
        return writer.toString();
    }
}
