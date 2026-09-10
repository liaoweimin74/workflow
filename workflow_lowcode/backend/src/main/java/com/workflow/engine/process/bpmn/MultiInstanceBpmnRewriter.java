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
import java.util.ArrayList;
import java.util.List;
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
    private static final String ELEMENT_VAR_EXPR = "${approver}";
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
                if (multiMode != null) {
                    applyMultiInstance(doc, userTask, multiMode);
                    modified = true;
                    log.debug("改写 userTask [{}] 为多实例模式: {}", nodeId, multiMode);
                    continue;
                }

                // 单实例节点：根据 approval.userIds 设置审批人
                // 1 人 → flowable:assignee；多人 → flowable:candidateUsers
                List<String> userIds = extractUserIds(configJson);
                if (userIds.isEmpty()) {
                    continue;
                }
                applySingleAssignee(doc, userTask, userIds);
                modified = true;
                log.debug("改写 userTask [{}] 单实例审批人: {}", nodeId, userIds);
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

    /**
     * 从 configJson 提取 approval.userIds（审批人 ID 列表）。
     */
    private List<String> extractUserIds(String configJson) {
        if (configJson == null || configJson.isBlank()) {
            return List.of();
        }
        try {
            JsonNode root = objectMapper.readTree(configJson);
            JsonNode approval = root.path("approval");
            if (approval.isMissingNode() || !approval.isObject()) {
                return List.of();
            }
            JsonNode userIdsNode = approval.path("userIds");
            List<String> userIds = new ArrayList<>();
            if (userIdsNode.isArray()) {
                for (JsonNode idNode : userIdsNode) {
                    if (idNode.isTextual() || idNode.isNumber()) {
                        String id = idNode.asText();
                        if (id != null && !id.isBlank()) {
                            userIds.add(id.trim());
                        }
                    }
                }
            }
            return userIds;
        } catch (Exception e) {
            log.debug("解析 NodeConfig approval.userIds 失败: {}", e.getMessage());
            return List.of();
        }
    }

    /**
     * 为单实例 userTask 设置审批人：
     * 1 人 → flowable:assignee="5"；
     * 多人 → flowable:candidateUsers="5,6"（任一候选人可办理）。
     */
    private void applySingleAssignee(Document doc, Element userTask, List<String> userIds) {
        String joined = String.join(",", userIds);
        if (userIds.size() == 1) {
            userTask.setAttributeNS(FLOWABLE_NS, FLOWABLE_PREFIX + ":assignee", userIds.get(0));
        } else {
            userTask.setAttributeNS(FLOWABLE_NS, FLOWABLE_PREFIX + ":candidateUsers", joined);
        }
        log.debug("单实例 userTask [{}] 设置审批人: {}", userTask.getAttribute("id"), joined);
    }

    private void applyMultiInstance(Document doc, Element userTask, String multiMode) {
        // 如果已有 multiInstanceLoopCharacteristics，不重复添加
        NodeList existing = userTask.getElementsByTagNameNS(BPMN_NS, "multiInstanceLoopCharacteristics");
        if (existing.getLength() > 0) {
            return;
        }

        // 设置 userTask 的 assignee 为 ${approver}（多实例 elementVariable），
        // 这样每个实例会自动分配给对应的审批人
        userTask.setAttributeNS(FLOWABLE_NS, FLOWABLE_PREFIX + ":assignee", ELEMENT_VAR_EXPR);

        // 添加 extensionElements → executionListener（start 事件设置 approverList 变量）
        Element extensionElements = ensureExtensionElements(doc, userTask);
        Element listener = doc.createElementNS(FLOWABLE_NS, FLOWABLE_PREFIX + ":executionListener");
        listener.setAttribute("event", "start");
        listener.setAttribute("delegateExpression", "${multiInstanceApproverListener}");
        extensionElements.appendChild(listener);

        Element miLoop = doc.createElementNS(BPMN_NS, "bpmn:multiInstanceLoopCharacteristics");
        boolean isSequential = "sequential".equals(multiMode);
        miLoop.setAttribute("isSequential", String.valueOf(isSequential));
        miLoop.setAttributeNS(FLOWABLE_NS, FLOWABLE_PREFIX + ":collection", COLLECTION_EXPR);
        miLoop.setAttributeNS(FLOWABLE_NS, FLOWABLE_PREFIX + ":elementVariable", ELEMENT_VAR);

        Element completionCondition = doc.createElementNS(BPMN_NS, "bpmn:completionCondition");
        // 依次审批（sequential）和会签（countersign）都要求全部完成，或签（or_sign）只需一人通过
        String condition = "or_sign".equals(multiMode) ? OR_SIGN_CONDITION : COUNTERSIGN_CONDITION;
        completionCondition.setTextContent(condition);

        miLoop.appendChild(completionCondition);

        // multiInstanceLoopCharacteristics 必须插入到 incoming/outgoing 之后，
        // BPMN XSD 顺序：extensionElements? → incoming* → outgoing* → ioSpecification? → ... → loopCharacteristics? → rendering*
        Element insertBefore = null;
        NodeList children = userTask.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            Node child = children.item(i);
            if (child.getNodeType() != Node.ELEMENT_NODE) {
                continue;
            }
            String ns = child.getNamespaceURI();
            String localName = child.getLocalName();
            // 跳过 extensionElements、incoming、outgoing（这些都排在 miLoop 之前）
            if (BPMN_NS.equals(ns) && ("extensionElements".equals(localName)
                    || "incoming".equals(localName)
                    || "outgoing".equals(localName))) {
                continue;
            }
            // flowable:extensionElements（旧命名空间兼容）
            if (FLOWABLE_NS.equals(ns) && "extensionElements".equals(localName)) {
                continue;
            }
            insertBefore = (Element) child;
            break;
        }
        if (insertBefore != null) {
            userTask.insertBefore(miLoop, insertBefore);
        } else {
            userTask.appendChild(miLoop);
        }
    }

    /**
     * 获取或创建 userTask 的 extensionElements 子元素。
     * BPMN XSD 顺序：documentation* → extensionElements? → auditing? → ... → incoming* → outgoing* → ...
     * 所以 extensionElements 必须插入到 incoming/outgoing 之前。
     */
    private Element ensureExtensionElements(Document doc, Element userTask) {
        // extensionElements 用 BPMN 命名空间
        NodeList existing = userTask.getElementsByTagNameNS(BPMN_NS, "extensionElements");
        if (existing.getLength() > 0) {
            return (Element) existing.item(0);
        }

        // 使用 bpmn: 前缀确保序列化正确
        Element ext = doc.createElementNS(BPMN_NS, "bpmn:extensionElements");

        // 插入到第一个子元素之前
        Element firstChild = null;
        NodeList children = userTask.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            Node child = children.item(i);
            if (child.getNodeType() == Node.ELEMENT_NODE) {
                firstChild = (Element) child;
                break;
            }
        }
        userTask.insertBefore(ext, firstChild);
        return ext;
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
