package com.workflow.engine.datasource.scope;

/**
 * 字段策略的列处置（designs §2.4：列 → 可见 / 脱敏 / 隐藏）。
 *
 * <p>序数即严格度（VISIBLE &lt; MASK &lt; HIDDEN）：主体跨权限对象命中多份策略时按列取最严
 * （strictest-wins），保证一份窄授权不会被另一份宽授权放大——列策略作用于整个结果集，
 * 行集合并集后不可按行分离，取最严是唯一 fail-closed 的合并语义。
 */
public enum FieldAccess {

    /** 可见：列原样输出（缺省，未声明的列即此）。 */
    VISIBLE,

    /** 脱敏：按引用的内置规则掩码后输出。 */
    MASK,

    /** 隐藏：整列从结果中移除（键缺席，不是空值——空值会伪装成「有这列但没数据」）。 */
    HIDDEN
}
