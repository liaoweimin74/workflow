package com.workflow.engine.form.bizdata;

import com.workflow.engine.form.column.ColumnConfig;

import java.util.List;
import java.util.Map;

/**
 * 业务表单运行时上下文（表名解析后的列与子表元数据）。
 */
public record BizDataContext(String tableName, String formKey, List<ColumnConfig> columns,
                             List<String> columnKeys, Map<String, SubTableDef> subTables) {

    /** 子表定义（独立物理表 wf_biz_&lt;formKey&gt;_&lt;field&gt;） */
    public record SubTableDef(String tableName, String subMode,
                              List<ColumnConfig> subColumns, List<String> subKeys) {}
}