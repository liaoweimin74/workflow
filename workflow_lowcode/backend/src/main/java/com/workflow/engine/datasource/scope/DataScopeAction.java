package com.workflow.engine.datasource.scope;

/**
 * 数据范围约束的动作维度。
 *
 * <p>两个值都已接线执行（不提供选了不起作用的选项）：
 * <ul>
 *   <li>{@link #READ}：列表、聚合、单条读取；</li>
 *   <li>{@link #WRITE}：修改、删除（按行校验归属）。</li>
 * </ul>
 * 新增不属行级范围语义（新行还没有归属可校验），由功能权限（菜单/按钮）负责。
 */
public enum DataScopeAction {
    READ,
    WRITE
}
