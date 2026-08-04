package com.workflow.api.controller;

import com.workflow.api.dto.PageResponse;
import com.workflow.api.dto.ProcessDefinitionSummary;
import com.workflow.common.domain.R;
import com.workflow.engine.process.ProcessService;
import org.flowable.engine.repository.ProcessDefinition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/deployed-processes")
public class ProcessDefinitionController {

    private final ProcessService processService;

    public ProcessDefinitionController(ProcessService processService) {
        this.processService = processService;
    }

    @GetMapping
    public R<PageResponse<ProcessDefinition>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String categoryId,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String status) {

        Page<ProcessDefinition> result = processService.listProcessDefinitions(
                PageRequest.of(page, size), categoryId, name, status);

        PageResponse<ProcessDefinition> response = new PageResponse<>(
                result.getContent(),
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
    public R<ProcessDefinition> get(@PathVariable String id) {
        return processService.getProcessDefinition(id)
                .map(R::ok)
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
}