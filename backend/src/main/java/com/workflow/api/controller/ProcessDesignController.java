package com.workflow.api.controller;

import com.workflow.api.dto.DesignSaveRequest;
import com.workflow.api.dto.EditorDTO;
import com.workflow.api.dto.PageResponse;
import com.workflow.common.domain.R;
import com.workflow.engine.process.ProcessDesignService;
import com.workflow.engine.process.entity.ProcessDraft;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.*;

/**
 * 流程设计器 Controller。
 * 管理流程定义草稿的 CRUD、部署、复制等操作。
 */
@RestController
@RequestMapping("/api/v1/process-definitions")
public class ProcessDesignController {

    private final ProcessDesignService designService;

    public ProcessDesignController(ProcessDesignService designService) {
        this.designService = designService;
    }

    /**
     * 创建新的流程定义草稿。
     */
    @PostMapping("/drafts")
    public R<ProcessDraft> createDraft(@RequestParam String name,
                                       @RequestParam String key,
                                       @RequestParam(required = false) String categoryId) {
        ProcessDraft draft = designService.createDraft(name, key, categoryId);
        return R.ok(draft);
    }

    /**
     * 查询草稿列表（分页）。
     */
    @GetMapping("/drafts")
    public R<PageResponse<ProcessDraft>> listDrafts(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String categoryId,
            @RequestParam(required = false) String name) {

        PageRequest pageable = PageRequest.of(page, size);
        Page<ProcessDraft> result;

        if (name != null && !name.isBlank()) {
            result = designService.searchDrafts(name, pageable);
        } else if (categoryId != null && !categoryId.isBlank()) {
            result = designService.listDraftsByCategory(categoryId, pageable);
        } else {
            result = designService.listDrafts(pageable);
        }

        PageResponse<ProcessDraft> response = new PageResponse<>(
                result.getContent(),
                result.getNumber(),
                result.getSize(),
                result.getTotalElements()
        );
        return R.ok(response);
    }

    /**
     * 加载设计器数据：BPMN XML + 节点配置。
     */
    @GetMapping("/{id}/editor")
    public R<EditorDTO> loadEditor(@PathVariable String id) {
        EditorDTO editor = designService.loadEditor(id);
        return R.ok(editor);
    }

    /**
     * 保存设计器内容。
     */
    @PutMapping("/{id}/design")
    public R<ProcessDraft> saveDesign(@PathVariable String id,
                                      @RequestBody DesignSaveRequest request) {
        ProcessDraft draft = designService.saveDesign(id, request);
        return R.ok(draft);
    }

    /**
     * 部署流程到 Flowable 引擎。
     */
    @PostMapping("/{id}/deploy")
    public R<ProcessDraft> deploy(@PathVariable String id) {
        ProcessDraft draft = designService.deploy(id);
        return R.ok(draft);
    }

    /**
     * 复制流程定义草稿。
     */
    @PostMapping("/{id}/copy")
    public R<ProcessDraft> copyProcess(@PathVariable String id) {
        ProcessDraft copy = designService.copyProcess(id);
        return R.ok(copy);
    }

    /**
     * 删除草稿。
     */
    @DeleteMapping("/{id}")
    public R<Void> deleteDraft(@PathVariable String id) {
        designService.deleteDraft(id);
        return R.ok();
    }
}
