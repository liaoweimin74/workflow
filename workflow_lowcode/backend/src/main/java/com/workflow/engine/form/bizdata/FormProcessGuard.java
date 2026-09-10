package com.workflow.engine.form.bizdata;

/**
 * 表单流程状态守卫（SPI）。
 * 接口层不依赖流程引擎类型；实现类依据表单流程绑定判定适用并执行检查。
 * 检查不通过时抛 {@code BusinessException}（409），拒绝数据变更。
 */
public interface FormProcessGuard {

    /**
     * 判定该守卫是否适用于指定表单（formKey）。
     */
    boolean appliesTo(String formKey);

    /**
     * 更新前检查。不通过时抛 {@code BusinessException}(409)。
     */
    void checkBeforeUpdate(String formKey, String id);

    /**
     * 删除前检查。不通过时抛 {@code BusinessException}(409)。
     */
    void checkBeforeDelete(String formKey, String id);
}