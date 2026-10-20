package com.workflow.engine.datasource.scope;

/**
 * 数据源某一读写轴的覆盖状态。
 *
 * <p>{@link #COVERED}：关联的权限对象在该轴上至少有一条授权；
 * {@link #EXEMPT}：没有覆盖，但管理员已显式豁免并留痕；
 * {@link #GAP}：没有覆盖也没有豁免——「没挂即不受控」的缺口，需要处理。
 */
public enum RowScopeCoverageStatus {
    COVERED,
    EXEMPT,
    GAP
}
