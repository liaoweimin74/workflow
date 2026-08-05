package com.workflow.api.controller;

import com.workflow.api.dto.ApprovalRecordVO;
import com.workflow.common.domain.R;
import com.workflow.engine.history.ProcessHistoryService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 审批历史 Controller。
 *
 * <p>提供流程实例的审批记录时间线查询。
 */
@RestController
@RequestMapping("/api/v1/process-instances")
public class ProcessHistoryController {

    private final ProcessHistoryService processHistoryService;

    public ProcessHistoryController(ProcessHistoryService processHistoryService) {
        this.processHistoryService = processHistoryService;
    }

    /**
     * 查询流程实例的审批历史记录。
     *
     * @param id 流程实例 ID
     * @return 审批记录列表，按时间正序排列
     */
    @GetMapping("/{id}/history")
    public R<List<ApprovalRecordVO>> history(@PathVariable String id) {
        return R.ok(processHistoryService.getApprovalHistory(id));
    }
}
