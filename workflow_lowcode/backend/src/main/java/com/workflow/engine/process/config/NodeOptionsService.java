package com.workflow.engine.process.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.engine.process.entity.NodeConfig;
import com.workflow.engine.process.repository.NodeConfigRepository;
import org.flowable.bpmn.model.BpmnModel;
import org.flowable.bpmn.model.ExtensionAttribute;
import org.flowable.bpmn.model.FlowElement;
import org.flowable.bpmn.model.Process;
import org.flowable.bpmn.model.UserTask;
import org.flowable.engine.RepositoryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 节点配置读取服务（NodeJS 端编译模型 taskRole/节点配置块的 Java 侧等价读取点）。
 *
 * <p>所有消费方（任务详情下发、门禁校验、审批人解析、超时扫描、撤回/再次发起门禁）
 * 统一经此读取 wf_node_config.config_json 的 Task 61/65 配置块，解析口径见 {@link NodeOptions}。
 */
@Service
public class NodeOptionsService {

    private static final Logger log = LoggerFactory.getLogger(NodeOptionsService.class);

    private final NodeConfigRepository nodeConfigRepository;
    private final RepositoryService repositoryService;
    private final ObjectMapper objectMapper;

    public NodeOptionsService(NodeConfigRepository nodeConfigRepository,
                              RepositoryService repositoryService,
                              ObjectMapper objectMapper) {
        this.nodeConfigRepository = nodeConfigRepository;
        this.repositoryService = repositoryService;
        this.objectMapper = objectMapper;
    }

    /**
     * 读取指定部署版本 + 节点的配置块；无 NodeConfig 行或解析失败返回 empty（旧数据兼容）。
     */
    public Optional<NodeOptions> find(String processDefinitionId, String nodeId) {
        if (processDefinitionId == null || nodeId == null) {
            return Optional.empty();
        }
        try {
            List<NodeConfig> configs = nodeConfigRepository.findByProcessDefinitionId(processDefinitionId);
            for (NodeConfig nc : configs) {
                if (nodeId.equals(nc.getNodeId())) {
                    return Optional.ofNullable(parse(nc.getConfigJson()));
                }
            }
            return Optional.empty();
        } catch (Exception e) {
            log.warn("读取节点配置失败 defId={} nodeId={}: {}", processDefinitionId, nodeId, e.getMessage());
            return Optional.empty();
        }
    }

    /**
     * 解析节点类别（对齐 NodeJS：isInitiator → initiator；config.taskRole → 显式值；
     * BPMN wf:nodeRole → 真源兜底；缺省 approver）。
     */
    public String resolveTaskRole(String processDefinitionId, String nodeId, boolean isInitiatorTask) {
        if (isInitiatorTask) {
            return "initiator";
        }
        Optional<NodeOptions> opts = find(processDefinitionId, nodeId);
        if (opts.isPresent() && opts.get().getTaskRole() != null) {
            return opts.get().getTaskRole();
        }
        String fromBpmn = readBpmnNodeRole(processDefinitionId, nodeId);
        return fromBpmn != null ? fromBpmn : "approver";
    }

    /**
     * 从 BPMN 模型读 wf:nodeRole 扩展属性（key 兼容 "nodeRole" 与 "wf:nodeRole"）。
     */
    public String readBpmnNodeRole(String processDefinitionId, String nodeId) {
        if (processDefinitionId == null || nodeId == null) {
            return null;
        }
        try {
            BpmnModel model = repositoryService.getBpmnModel(processDefinitionId);
            if (model == null) {
                return null;
            }
            for (Process process : model.getProcesses()) {
                FlowElement element = process.getFlowElement(nodeId, true);
                if (element instanceof UserTask userTask) {
                    Map<String, List<ExtensionAttribute>> attributes = userTask.getAttributes();
                    if (attributes == null || attributes.isEmpty()) {
                        return null;
                    }
                    for (String key : new String[]{"nodeRole", "wf:nodeRole"}) {
                        List<ExtensionAttribute> attrs = attributes.get(key);
                        if (attrs == null) {
                            continue;
                        }
                        for (ExtensionAttribute attr : attrs) {
                            String value = attr.getValue();
                            if (NodeOptions.TASK_ROLES.contains(value)) {
                                return value;
                            }
                        }
                    }
                }
            }
            return null;
        } catch (Exception e) {
            log.debug("读取 BPMN nodeRole 失败 defId={} nodeId={}: {}", processDefinitionId, nodeId, e.getMessage());
            return null;
        }
    }

    private NodeOptions parse(String configJson) {
        try {
            JsonNode root = objectMapper.readTree(configJson);
            return NodeOptions.parse(root);
        } catch (Exception e) {
            log.warn("解析节点配置 JSON 失败: {}", e.getMessage());
            return null;
        }
    }
}
