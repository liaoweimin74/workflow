package com.workflow.example.emp;

import com.workflow.api.dto.BizDataVO;
import com.workflow.common.domain.R;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.Map;

/**
 * 员工档案（emp_profile）语义操作 REST 入口。
 * 响应封装对齐 {@code BizDataController}（R&lt;T&gt;）。
 */
@RestController
@RequestMapping("/api/v1/example/emp")
public class EmpProfileController {

    private final EmpProfileBizService empProfileBizService;

    public EmpProfileController(EmpProfileBizService empProfileBizService) {
        this.empProfileBizService = empProfileBizService;
    }

    /**
     * 调薪。请求体：{ "id": "行id", "amount": 18000.00 }
     */
    @PostMapping("/adjust-salary")
    public R<BizDataVO> adjustSalary(@RequestBody Map<String, Object> body) {
        String id = String.valueOf(body.get("id"));
        BigDecimal amount = toDecimal(body.get("amount"));
        return R.ok(empProfileBizService.adjustSalary(id, amount));
    }

    /**
     * 离职。请求体：{ "id": "行id", "reason": "个人原因" }（reason 可选）
     */
    @PostMapping("/resign")
    public R<BizDataVO> resign(@RequestBody Map<String, Object> body) {
        String id = String.valueOf(body.get("id"));
        Object reason = body.get("reason");
        return R.ok(empProfileBizService.resign(id, reason == null ? null : String.valueOf(reason)));
    }

    private static BigDecimal toDecimal(Object v) {
        if (v instanceof Number n) {
            return new BigDecimal(n.toString());
        }
        if (v == null) {
            throw new com.workflow.common.exception.BusinessException(400, "amount 不能为空");
        }
        return new BigDecimal(String.valueOf(v));
    }
}