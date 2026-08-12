package com.workflow.api.controller;

import com.workflow.api.dto.FormDataDTO;
import com.workflow.api.dto.FormDataSaveRequest;
import com.workflow.common.domain.R;
import com.workflow.engine.form.FormDataService;
import com.workflow.engine.form.entity.FormData;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * 表单实例数据 Controller。
 * 管理流程实例关联的表单数据的保存和查询。
 */
@RestController
@RequestMapping("/api/v1/form-data")
public class FormDataController {

    private final FormDataService formDataService;

    public FormDataController(FormDataService formDataService) {
        this.formDataService = formDataService;
    }

    /**
     * 保存表单当前数据（upsert，用于节点间传递）。
     */
    @PostMapping
    public R<FormData> save(@RequestBody FormDataSaveRequest request) {
        FormData formData = formDataService.save(
                request.getFormDefId(),
                request.getProcessInstanceId(),
                request.getTaskId(),
                request.getDataJson()
        );
        return R.ok(formData);
    }

    /**
     * 保存审批快照（每次创建新记录，不可变）。
     */
    @PostMapping("/snapshot")
    public R<FormData> saveSnapshot(@RequestBody FormDataSaveRequest request) {
        FormData formData = formDataService.saveSnapshot(
                request.getFormDefId(),
                request.getProcessInstanceId(),
                request.getTaskId(),
                request.getDataJson()
        );
        return R.ok(formData);
    }

    /**
     * 保存发起页草稿（processInstanceId 为 null 的表单数据）。
     */
    @PostMapping("/draft")
    public R<FormData> saveDraft(@RequestBody FormDataSaveRequest request) {
        FormData formData = formDataService.saveDraft(
                request.getFormDefId(),
                request.getDataJson()
        );
        return R.ok(formData);
    }

    /**
     * 查询发起页草稿。
     */
    @GetMapping("/draft/{formDefId}")
    public R<FormDataDTO> getDraft(@PathVariable String formDefId) {
        Optional<FormData> formData = formDataService.findDraft(formDefId);
        return R.ok(formData.map(this::toDTO).orElse(null));
    }

    /**
     * 清除发起页草稿（发起成功后调用）。
     */
    @DeleteMapping("/draft/{formDefId}")
    public R<Void> clearDraft(@PathVariable String formDefId) {
        formDataService.clearDraft(formDefId);
        return R.ok();
    }

    /**
     * 按流程实例和表单定义查询当前表单数据（非快照）。
     */
    @GetMapping
    public R<FormDataDTO> getByProcessInstance(
            @RequestParam String processInstanceId,
            @RequestParam String formDefId) {

        Optional<FormData> formData = formDataService.findByProcessInstance(processInstanceId, formDefId);
        return R.ok(formData.map(this::toDTO).orElse(null));
    }

    /**
     * 按 taskId 查询审批快照。
     */
    @GetMapping("/task/{taskId}")
    public R<FormDataDTO> getByTaskId(@PathVariable String taskId) {
        Optional<FormData> formData = formDataService.findByTaskId(taskId);
        return R.ok(formData.map(this::toDTO).orElse(null));
    }

    /**
     * 按流程实例查询所有审批快照（按时间倒序）。
     */
    @GetMapping("/process-instance/{processInstanceId}/snapshots")
    public R<List<FormDataDTO>> getSnapshots(@PathVariable String processInstanceId) {
        List<FormData> list = formDataService.findSnapshotsByProcessInstance(processInstanceId);
        List<FormDataDTO> dtos = list.stream()
                .map(this::toDTO)
                .collect(Collectors.toList());
        return R.ok(dtos);
    }

    /**
     * 获取单条表单数据。
     */
    @GetMapping("/{id}")
    public R<FormDataDTO> getById(@PathVariable String id) {
        FormData formData = formDataService.getById(id);
        return R.ok(toDTO(formData));
    }

    /**
     * 更新表单数据。
     */
    @PutMapping("/{id}")
    public R<FormData> update(@PathVariable String id,
                              @RequestBody FormDataSaveRequest request) {
        FormData formData = formDataService.update(id, request.getDataJson());
        return R.ok(formData);
    }

    /**
     * 按流程实例查询所有表单数据。
     */
    @GetMapping("/process-instance/{processInstanceId}")
    public R<List<FormDataDTO>> getByProcessInstance(@PathVariable String processInstanceId) {
        List<FormData> list = formDataService.findByProcessInstance(processInstanceId);
        List<FormDataDTO> dtos = list.stream()
                .map(this::toDTO)
                .collect(Collectors.toList());
        return R.ok(dtos);
    }

    private FormDataDTO toDTO(FormData formData) {
        FormDataDTO dto = new FormDataDTO();
        dto.setId(formData.getId());
        dto.setFormDefId(formData.getFormDefId());
        dto.setFormVersion(formData.getFormVersion());
        dto.setProcessInstanceId(formData.getProcessInstanceId());
        dto.setTaskId(formData.getTaskId());
        dto.setDataJson(formData.getDataJson());
        dto.setCreatedBy(formData.getCreatedBy());
        dto.setCreatedAt(formData.getCreatedAt());
        dto.setUpdatedAt(formData.getUpdatedAt());
        dto.setIsSnapshot(formData.getIsSnapshot());
        return dto;
    }
}
