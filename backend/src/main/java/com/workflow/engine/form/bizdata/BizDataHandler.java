package com.workflow.engine.form.bizdata;

import com.workflow.api.dto.BizDataVO;

import java.util.Map;

/**
 * 业务表单定制逻辑钩子（SPI）。
 * 实现类按 formKey 注册到 Spring 容器，BizDataService 在 CRUD 各环节自动调用。
 * 钩子中抛出 BusinessException 即拒绝当前操作（配合 @Transactional 回滚）。
 *
 * <p>使用示例：
 * <pre>{@code
 * @Component
 * public class LeaveBillHandler implements BizDataHandler {
 *     public String getFormKey() { return "leave_bill"; }
 *     public void beforeCreate(Map<String, Object> data) {
 *         if ((int) data.get("days") > 5 && !data.containsKey("reason")) {
 *             throw new BusinessException(400, "请假超过 5 天必须填写理由");
 *         }
 *     }
 * }
 * }</pre>
 */
public interface BizDataHandler {

    /**
     * 绑定的业务表单 key（对应 wf_biz_<formKey>）。
     */
    String getFormKey();

    /**
     * 新增前的业务校验/预处理。抛 BusinessException 拒绝创建。
     */
    default void beforeCreate(Map<String, Object> data) {}

    /**
     * 新增成功后的回调（如写关联表、发通知）。
     */
    default void afterCreate(BizDataVO created) {}

    /**
     * 更新前的业务校验（existing 为当前行数据，含更新前 version）。
     * 抛 BusinessException 拒绝更新。
     */
    default void beforeUpdate(Map<String, Object> data, BizDataVO existing) {}

    /**
     * 删除前的业务校验。抛 BusinessException 拒绝删除。
     */
    default void beforeDelete(BizDataVO existing) {}
}
