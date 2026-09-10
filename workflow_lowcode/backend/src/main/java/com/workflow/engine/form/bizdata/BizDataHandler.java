package com.workflow.engine.form.bizdata;

import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
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

    // ==================== 覆盖声明（override declaration） ====================

    /**
     * 是否覆盖新增操作。返回 true 时 {@link #create(Map)} 完整接管新增，
     * 通用实现与装饰钩子链不再执行。
     */
    default boolean overridesCreate() { return false; }

    /**
     * 是否覆盖更新操作。返回 true 时 {@link #update(String, Map, Integer)} 完整接管更新，
     * 通用实现与装饰钩子链不再执行。
     */
    default boolean overridesUpdate() { return false; }

    /**
     * 是否覆盖删除操作。返回 true 时 {@link #delete(String)} 完整接管删除，
     * 通用实现与装饰钩子链不再执行。
     */
    default boolean overridesDelete() { return false; }

    /**
     * 是否覆盖查询操作。返回 true 时 {@link #query(BizDataQueryRequest)} 完整接管查询，
     * 通用实现不再执行。
     */
    default boolean overridesQuery() { return false; }

    /**
     * 覆盖新增。仅当 {@link #overridesCreate()} 返回 true 时被调用；
     * 签名不含 formKey（handler 绑定即专属）。
     *
     * @return 新增后的业务数据行
     */
    default BizDataVO create(Map<String, Object> data) {
        throw unsupportedOverride();
    }

    /**
     * 覆盖更新（乐观锁：须携带当前 version）。
     * 仅当 {@link #overridesUpdate()} 返回 true 时被调用。
     *
     * @return 更新后的业务数据行
     */
    default BizDataVO update(String id, Map<String, Object> data, Integer version) {
        throw unsupportedOverride();
    }

    /**
     * 覆盖删除。仅当 {@link #overridesDelete()} 返回 true 时被调用。
     */
    default void delete(String id) {
        throw unsupportedOverride();
    }

    /**
     * 覆盖查询。仅当 {@link #overridesQuery()} 返回 true 时被调用。
     *
     * @return 分页查询结果
     */
    default BizDataPageVO query(BizDataQueryRequest req) {
        throw unsupportedOverride();
    }

    private UnsupportedOperationException unsupportedOverride() {
        return new UnsupportedOperationException("handler overrides but does not implement: " + getFormKey());
    }
}
