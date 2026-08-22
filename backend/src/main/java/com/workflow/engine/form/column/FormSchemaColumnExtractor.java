package com.workflow.engine.form.column;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 表单列定义解析器。
 * 解析前端设计器生成并随表单持久化的 columnConfig JSON（用户确认过的列映射），
 * 供 WORKFLOW 数据源 metadata 组装使用；输入为空、非法或非数组时返回空列表。
 */
@Component
public class FormSchemaColumnExtractor {

    private final ObjectMapper objectMapper;

    public FormSchemaColumnExtractor(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * 将 columnConfig JSON 解析为列定义列表。
     *
     * @param columnConfigJson 前端持久化的列映射 JSON 数组（FormDefinition.columnConfig）
     * @return 列定义列表；输入为空、非法或非数组时返回空列表
     */
    public List<ColumnConfig> extract(String columnConfigJson) {
        if (columnConfigJson == null || columnConfigJson.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(columnConfigJson, new TypeReference<List<ColumnConfig>>() {});
        } catch (JsonProcessingException e) {
            return List.of();
        }
    }
}
