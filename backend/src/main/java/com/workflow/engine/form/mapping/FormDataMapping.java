package com.workflow.engine.form.mapping;

/**
 * 单个表单字段的数据映射配置。
 *
 * @param targetField 目标表单字段名
 * @param source      数据来源，形如 {@code form:initiator} / {@code form:<nodeId>} / {@code variable:<name>}
 * @param sourceField 源字段名；source 为 {@code variable:<name>} 时可省略
 */
public record FormDataMapping(String targetField, String source, String sourceField) {
}