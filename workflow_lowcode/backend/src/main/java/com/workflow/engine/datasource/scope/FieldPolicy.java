package com.workflow.engine.datasource.scope;

/**
 * 单列字段策略：列名 + 处置 + （仅 MASK 时）引用的内置规则。
 *
 * <p>JSON 协议形态 {@code {"column":"phone","policy":"MASK","rule":"PHONE"}}，
 * 解析/校验/合并的唯一口径在 {@link FieldPolicies}。
 */
public record FieldPolicy(String column, FieldAccess access, MaskRule rule) {
}
