package com.workflow.example.leave;

import com.workflow.api.dto.BizDataVO;
import com.workflow.common.domain.R;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 请假单（leave_bill）流程语义操作 REST 入口。
 * 响应封装对齐 {@code BizDataController}（R&lt;T&gt;）。
 */
@RestController
@RequestMapping("/api/v1/example/leave")
public class LeaveBillController {

    private final LeaveBillBizService leaveBillBizService;

    public LeaveBillController(LeaveBillBizService leaveBillBizService) {
        this.leaveBillBizService = leaveBillBizService;
    }

    /**
     * 提交审批。请求体：{ "id": "行id" }
     */
    @PostMapping("/submit")
    public R<BizDataVO> submit(@RequestBody Map<String, Object> body) {
        String id = String.valueOf(body.get("id"));
        return R.ok(leaveBillBizService.submit(id));
    }

    /**
     * 审批通过。请求体：{ "taskId": "任务id" }
     */
    @PostMapping("/approve")
    public R<BizDataVO> approve(@RequestBody Map<String, Object> body) {
        String taskId = String.valueOf(body.get("taskId"));
        return R.ok(leaveBillBizService.approve(taskId));
    }

    /**
     * 驳回。请求体：{ "taskId": "任务id", "reason": "驳回原因" }（reason 可选）
     */
    @PostMapping("/reject")
    public R<BizDataVO> reject(@RequestBody Map<String, Object> body) {
        String taskId = String.valueOf(body.get("taskId"));
        Object reason = body.get("reason");
        return R.ok(leaveBillBizService.reject(taskId, reason == null ? null : String.valueOf(reason)));
    }
}