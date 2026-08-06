package com.workflow.api.controller;

import com.workflow.api.dto.PageResponse;
import com.workflow.api.dto.ProcessDefinitionSummary;
import com.workflow.common.domain.R;
import com.workflow.engine.process.ProcessService;
import org.flowable.engine.repository.ProcessDefinition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/deployed-processes")
public class ProcessDefinitionController {

    private final ProcessService processService;

    public ProcessDefinitionController(ProcessService processService) {
        this.processService = processService;
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
                .map(def -> R.ok(toMap(def)))
                .orElse(R.fail(404, "Process definition not found"));
    }

    @GetMapping("/{id}/xml")
    public R<String> getXml(@PathVariable String id) {
        String xml = processService.getProcessDefinitionXml(id);
        return R.ok(xml);
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