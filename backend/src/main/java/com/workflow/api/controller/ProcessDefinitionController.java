package com.workflow.api.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.EditorDTO;
import com.workflow.api.dto.PageResponse;
import com.workflow.api.dto.ProcessDefinitionSummary;
import com.workflow.api.dto.ProcessVersionVO;
import com.workflow.common.domain.R;
import com.workflow.engine.process.ProcessService;
import com.workflow.engine.process.bpmn.InitiatorNodeResolver;
import com.workflow.engine.process.entity.NodeConfig;
import com.workflow.engine.process.entity.ProcessDraft;
import com.workflow.engine.process.repository.NodeConfigRepository;
import com.workflow.engine.process.repository.ProcessDraftRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.repository.Deployment;
import org.flowable.engine.repository.ProcessDefinition;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.*;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/deployed-processes")
public class ProcessDefinitionController {

    private static final Logger log = LoggerFactory.getLogger(ProcessDefinitionController.class);

    private final ProcessService processService;
    private final ProcessDraftRepository processDraftRepository;
    private final NodeConfigRepository nodeConfigRepository;
    private final InitiatorNodeResolver initiatorNodeResolver;
    private final ObjectMapper objectMapper;
    private final RepositoryService repositoryService;
    private final TenantProvider tenantProvider;

    public ProcessDefinitionController(ProcessService processService,
                                       ProcessDraftRepository processDraftRepository,
                                       NodeConfigRepository nodeConfigRepository,
                                       InitiatorNodeResolver initiatorNodeResolver,
                                       ObjectMapper objectMapper,
                                       RepositoryService repositoryService,
                                       TenantProvider tenantProvider) {
        this.processService = processService;
        this.processDraftRepository = processDraftRepository;
        this.nodeConfigRepository = nodeConfigRepository;
        this.initiatorNodeResolver = initiatorNodeResolver;
        this.objectMapper = objectMapper;
        this.repositoryService = repositoryService;
        this.tenantProvider = tenantProvider;
    }

    @GetMapping
    public R<PageResponse<Map<String, Object>>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String categoryId,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String status) {

        Page<ProcessDefinition> result = processService.listProcessDefinitions(
                PageRequest.of(page, size), categoryId, name, status);

        PageResponse<Map<String, Object>> response = new PageResponse<>(
                result.getContent().stream().map(this::toMap).toList(),
                result.getNumber(),
                result.getSize(),
                result.getTotalElements()
        );

        return R.ok(response);
    }

    /**
     * 已部署流程定义精简列表（按 key 去重取最新版本）。
     * 供调用活动子流程选择下拉使用。
     */
    @GetMapping("/summaries")
    public R<List<ProcessDefinitionSummary>> summaries() {
        return R.ok(processService.listSummaries());
    }

    @GetMapping("/{id}")
    public R<Map<String, Object>> get(@PathVariable String id) {
        return processService.getProcessDefinition(id)
                .map(def -> {
                    Map<String, Object> map = toMap(def);
                    // 查询流程关联的表单定义 ID
                    resolveFormDefIds(id, map);
                    return R.ok(map);
                })
                .orElse(R.fail(404, "Process definition not found"));
    }

    /**
     * 通过 NodeConfig 解析流程默认表单和发起人节点表单。
     * <p>优先级：发起人节点有表单配置则使用发起人节点表单，否则使用流程默认表单。
     * 表单和字段权限作为整体从同一层取，不跨层合并。
     * 结果写入 map：
     * <ul>
     *   <li>formDefId — 优先级最高的表单（发起人节点 > 流程默认）</li>
     *   <li>fieldPermissions — 与 formDefId 同层的字段权限</li>
     *   <li>initiatorFormDefId — 发起人节点表单（单独返回，前端可区分）</li>
     *   <li>processFormDefId — 流程默认表单（单独返回，前端可区分）</li>
     * </ul>
     */
    private void resolveFormDefIds(String processDefinitionId, Map<String, Object> map) {
        if (processDefinitionId == null) {
            map.put("formDefId", null);
            map.put("fieldPermissions", null);
            map.put("initiatorFormDefId", null);
            map.put("processFormDefId", null);
            return;
        }
// 精确匹配该部署版本的 NodeConfig 快照（部署时由当前配置复制生成）
        List<NodeConfig> configs = nodeConfigRepository.findByProcessDefinitionId(processDefinitionId);
        FormConfig processCfg = null;
        FormConfig initiatorCfg = null;

        for (NodeConfig nc : configs) {
            try {
                FormConfig cfg = extractFormConfig(json(nc.getConfigJson()));
                if (cfg == null || cfg.formDefId == null) continue;

                if ("__PROCESS__".equals(nc.getNodeId())) {
                    processCfg = cfg;
                }
            } catch (Exception e) {
                // 忽略解析错误
            }
        }

        // 通过 InitiatorNodeResolver 获取发起人节点 ID，查其 NodeConfig 中的表单
        String initiatorNodeId = initiatorNodeResolver.resolve(processDefinitionId);
        if (initiatorNodeId != null) {
            for (NodeConfig nc : configs) {
                if (initiatorNodeId.equals(nc.getNodeId())) {
                    try {
                        initiatorCfg = extractFormConfig(json(nc.getConfigJson()));
                    } catch (Exception e) {
                        // 忽略解析错误
                    }
                    break;
                }
            }
        }

        // 优先级：发起人节点表单 > 流程默认表单（表单与字段权限同层取）
        FormConfig effective = initiatorCfg != null && initiatorCfg.formDefId != null ? initiatorCfg : processCfg;

        map.put("formDefId", effective != null ? effective.formDefId : null);
        map.put("fieldPermissions", effective != null ? effective.fieldPermissions : null);
        map.put("initiatorFormDefId", initiatorCfg != null ? initiatorCfg.formDefId : null);
        map.put("processFormDefId", processCfg != null ? processCfg.formDefId : null);
    }

    private com.fasterxml.jackson.databind.JsonNode json(String configJson) throws Exception {
        return objectMapper.readTree(configJson);
    }

    /**
     * 从 NodeConfig JSON 中提取表单配置（formDefId + fieldPermissions）。
     *
     * @return 表单配置；无 form 节点或无 formDefId 时返回 null
     */
    private FormConfig extractFormConfig(com.fasterxml.jackson.databind.JsonNode json) {
        com.fasterxml.jackson.databind.JsonNode form = json.get("form");
        if (form == null || !form.has("formDefId")) {
            return null;
        }
        String val = form.get("formDefId").asText();
        if (val == null || val.isEmpty()) {
            return null;
        }
        Map<String, String> permissions = new HashMap<>();
        com.fasterxml.jackson.databind.JsonNode permNode = form.get("fieldPermissions");
        if (permNode != null && permNode.isObject()) {
            permNode.fields().forEachRemaining(e -> permissions.put(e.getKey(), e.getValue().asText()));
        }
        return new FormConfig(val, permissions);
    }

    /**
     * 表单配置值对象（formDefId + fieldPermissions 同层）。
     */
    private record FormConfig(String formDefId, Map<String, String> fieldPermissions) {
    }

    @GetMapping("/{id}/xml")
    public R<String> getXml(@PathVariable String id) {
        String xml = processService.getProcessDefinitionXml(id);
        return R.ok(xml);
    }

    /**
     * 流程历史版本列表：按 key 返回该租户下的全部已部署版本，按版本号倒序。
     * 路径使用多段 {@code /key/{key}/versions}，避免与单段 {@code /{id}} 路由冲突。
     */
    @GetMapping("/key/{key}/versions")
    public R<List<ProcessVersionVO>> listVersions(@PathVariable String key) {
        String tenantId = tenantProvider.getTenantId();
        List<ProcessDefinition> defs = repositoryService.createProcessDefinitionQuery()
                .processDefinitionKey(key)
                .processDefinitionTenantId(tenantId)
                .orderByProcessDefinitionVersion().desc()
                .list();

        List<ProcessVersionVO> result = new ArrayList<>(defs.size());
        for (ProcessDefinition pd : defs) {
            ProcessVersionVO vo = new ProcessVersionVO();
            vo.setProcDefId(pd.getId());
            vo.setVersion(pd.getVersion());
            vo.setName(pd.getName());
            vo.setDeploymentTime(resolveDeploymentTime(pd.getDeploymentId()));
            result.add(vo);
        }

        // latest 标记：最高版本号对应的版本为最新
        int maxVersion = defs.stream()
                .mapToInt(ProcessDefinition::getVersion)
                .max()
                .orElse(-1);
        result.forEach(v -> v.setLatest(v.getVersion() == maxVersion));
        return R.ok(result);
    }

    /**
     * 通过 deploymentId 反查部署时间。
     * Flowable 8 的 ProcessDefinition 不直接暴露部署时间，需走 DeploymentQuery。
     */
    private Date resolveDeploymentTime(String deploymentId) {
        if (deploymentId == null) {
            return null;
        }
        try {
            Deployment deployment = repositoryService.createDeploymentQuery()
                    .deploymentId(deploymentId)
                    .singleResult();
            return deployment != null ? deployment.getDeploymentTime() : null;
        } catch (Exception e) {
            log.warn("查询部署时间失败, deploymentId={}: {}", deploymentId, e.getMessage());
            return null;
        }
    }

    /**
     * 历史版本编辑器数据：该版本部署时的 BPMN XML + 节点配置快照（含 __PROCESS__）。
     */
    @GetMapping("/versions/{procDefId}/editor")
    public R<EditorDTO> getVersionEditor(@PathVariable String procDefId) {
        try {
            String xml = readProcessModel(procDefId);
            if (xml == null) {
                return R.fail(404, "历史版本数据读取失败");
            }
            List<NodeConfig> snapshots = nodeConfigRepository.findByProcessDefinitionId(procDefId);
            Map<String, String> nodeConfigMap = snapshots.stream()
                    .collect(Collectors.toMap(NodeConfig::getNodeId, NodeConfig::getConfigJson, (a, b) -> a));

            EditorDTO dto = new EditorDTO();
            dto.setBpmnXml(xml);
            dto.setNodeConfigs(nodeConfigMap);
            dto.setStatus("DEPLOYED");
            return R.ok(dto);
        } catch (Exception e) {
            log.warn("读取历史版本数据失败, procDefId={}: {}", procDefId, e.getMessage());
            return R.fail(404, "历史版本数据读取失败");
        }
    }

    /**
     * 读取部署版本的 BPMN XML。读取失败或资源不存在时返回 null。
     */
    private String readProcessModel(String procDefId) {
        try (InputStream is = repositoryService.getProcessModel(procDefId)) {
            if (is == null) {
                return null;
            }
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
                return reader.lines().collect(Collectors.joining("\n"));
            }
        } catch (Exception e) {
            log.warn("读取历史版本 BPMN XML 失败, procDefId={}: {}", procDefId, e.getMessage());
            return null;
        }
    }

    @PostMapping("/{id}/suspend")
    public R<Void> suspend(@PathVariable String id) {
        processService.suspendProcessDefinition(id);
        return R.ok();
    }

    @PostMapping("/{id}/activate")
    public R<Void> activate(@PathVariable String id) {
        processService.activateProcessDefinition(id);
        return R.ok();
    }

    /**
     * 将 Flowable ProcessDefinition 安全序列化为 Map，
     * 避免直接 Jackson 序列化触发内部懒加载（processEngineConfiguration null 崩溃）。
     */
    private Map<String, Object> toMap(ProcessDefinition def) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", def.getId());
        map.put("key", def.getKey());
        map.put("name", def.getName());
        map.put("version", def.getVersion());
        map.put("description", def.getDescription());
        map.put("deploymentId", def.getDeploymentId());
        map.put("resourceName", def.getResourceName());
        map.put("diagramResourceName", def.getDiagramResourceName());
        map.put("tenantId", def.getTenantId());
        map.put("category", def.getCategory());
        map.put("suspended", def.isSuspended());
        return map;
    }
}