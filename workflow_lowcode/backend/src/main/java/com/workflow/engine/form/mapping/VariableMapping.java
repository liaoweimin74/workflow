package com.workflow.engine.form.mapping;

/**
 * 流程变量映射配置（流程级 configJson 的 variableMappings 条目）。
 *
 * @param variable    目标流程变量名
 * @param source      数据来源，形如 {@code form:initiator} / {@code form:<nodeId>} / {@code variable:<name>}
 * @param sourceField 源字段名；source 为 {@code variable:<name>} 时可省略
 */
public record VariableMapping(String variable, String source, String sourceField) {
}