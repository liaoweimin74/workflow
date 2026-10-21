package com.workflow.engine.datasource.scope;

/**
 * 数据源的数据权限覆盖状态（v3：关联即受控）。
 *
 * <p>{@link #COVERED}：已关联权限对象且至少一个对象有授权（部分角色可见其范围）；
 * {@link #NO_GRANT}：已关联但没有任何授权——除管理员外该源整源不可见，通常是配置只做了一半；
 * {@link #EXEMPT}：未关联，但管理员已显式豁免并留痕；
 * {@link #GAP}：未关联也没有豁免——数据源不受数据权限控制（全量可见），是需要盘点的风险点。
 */
public enum RowScopeCoverageStatus {
    COVERED,
    NO_GRANT,
    EXEMPT,
    GAP
}
