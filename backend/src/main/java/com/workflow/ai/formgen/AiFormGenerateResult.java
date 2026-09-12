package com.workflow.ai.formgen;

import java.util.List;

/**
 * AI 表单生成结果。
 *
 * @param schema   清洗后的 form-create schema JSON（{@code {"rule":[...]}}）
 * @param fields   识别出的字段清单
 * @param warnings 校验修正项说明
 */
public record AiFormGenerateResult(String schema, List<FieldInfo> fields, List<String> warnings) {

    /**
     * 字段信息。
     *
     * @param field         字段名
     * @param title         中文标题
     * @param componentType 组件类型
     */
    public record FieldInfo(String field, String title, String componentType) {
    }
}
