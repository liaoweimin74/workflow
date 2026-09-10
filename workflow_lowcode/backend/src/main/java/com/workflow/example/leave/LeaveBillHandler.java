package com.workflow.example.leave;

import com.workflow.api.dto.BizDataVO;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.bizdata.BizDataHandler;
import com.workflow.engine.form.bizdata.BizDataSupport;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 请假单（leave_bill）业务定制钩子。
 *
 * <p>beforeCreate：请假超过 5 天必须填写理由，否则拒绝创建（400）。
 * <p>afterCreate：置初始状态为「草稿」。afterCreate 内修改 VO 不落库，
 * 需要回写状态时走 {@link BizDataSupport#updateGeneric}（无守卫通道，
 * 避免流程引擎侧的运行中实例被守卫拦截）。
 */
@Component
public class LeaveBillHandler implements BizDataHandler {

    public static final String FORM_KEY = "leave_bill";

    private final BizDataSupport support;

    public LeaveBillHandler(BizDataSupport support) {
        this.support = support;
    }

    @Override
    public String getFormKey() {
        return FORM_KEY;
    }

    @Override
    public void beforeCreate(Map<String, Object> data) {
        Object daysObj = data.get("days");
        int days = daysObj instanceof Number n ? n.intValue() : 0;
        if (days > 5) {
            Object reason = data.get("reason");
            if (reason == null || String.valueOf(reason).isBlank()) {
                throw new BusinessException(400, "请假超过 5 天必须填写理由");
            }
        }
    }

    @Override
    public void afterCreate(BizDataVO created) {
        support.updateGeneric(FORM_KEY, created.getId(), Map.of("status", "草稿"), created.getVersion());
    }
}