package com.workflow.example.emp;

import com.workflow.api.dto.BizDataVO;
import com.workflow.engine.form.bizdata.BizDataService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 员工档案（emp_profile）语义操作服务。
 * 复用 BizDataService 门面（乐观锁 + 守卫 + 钩子链），示例：调薪、离职。
 */
@Service
public class EmpProfileBizService {

    private static final String FORM_KEY = "emp_profile";

    private final BizDataService bizDataService;

    public EmpProfileBizService(BizDataService bizDataService) {
        this.bizDataService = bizDataService;
    }

    /**
     * 调薪：读取当前行版本，乐观锁更新 salary 字段。
     */
    @Transactional
    public BizDataVO adjustSalary(String id, BigDecimal amount) {
        BizDataVO current = bizDataService.getById(FORM_KEY, id);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("salary", amount);
        return bizDataService.update(FORM_KEY, id, data, current.getVersion());
    }

    /**
     * 离职：置 status=离职（此后 beforeDelete 放行；运行中受流程守卫拦截）。
     */
    @Transactional
    public BizDataVO resign(String id, String reason) {
        BizDataVO current = bizDataService.getById(FORM_KEY, id);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("status", "离职");
        if (reason != null && !reason.isBlank()) {
            data.put("reason", reason);
        }
        return bizDataService.update(FORM_KEY, id, data, current.getVersion());
    }
}