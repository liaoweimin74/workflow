package com.workflow.api.controller;

import com.workflow.api.dto.PageResponse;
import com.workflow.api.dto.Result;
import com.workflow.engine.process.ProcessService;
import org.flowable.engine.repository.ProcessDefinition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/process-definitions")
public class ProcessDefinitionController {

    private final ProcessService processService;

    public ProcessDefinitionController(ProcessService processService) {
        this.processService = processService;
    }

    @GetMapping
    public Result<PageResponse<ProcessDefinition>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        Page<ProcessDefinition> result = processService.listProcessDefinitions(PageRequest.of(page, size));

        PageResponse<ProcessDefinition> response = new PageResponse<>(
                result.getContent(),
                result.getNumber(),
                result.getSize(),
                result.getTotalElements()
        );

        return Result.success(response);
    }

    @GetMapping("/{id}")
    public Result<ProcessDefinition> get(@PathVariable String id) {
        return processService.getProcessDefinition(id)
                .map(Result::success)
                .orElse(Result.error(404, "Process definition not found"));
    }

    @GetMapping("/{id}/xml")
    public Result<String> getXml(@PathVariable String id) {
        String xml = processService.getProcessDefinitionXml(id);
        return Result.success(xml);
    }

    @PostMapping("/{id}/suspend")
    public Result<Void> suspend(@PathVariable String id) {
        processService.suspendProcessDefinition(id);
        return Result.success(null);
    }

    @PostMapping("/{id}/activate")
    public Result<Void> activate(@PathVariable String id) {
        processService.activateProcessDefinition(id);
        return Result.success(null);
    }
}