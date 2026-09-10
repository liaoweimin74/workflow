package com.workflow.api.dto;

import com.workflow.engine.form.column.ColumnConfig;

import java.util.List;

/**
 * 数据源元数据（统一 SPI metadata 方法返回）。
 * columns 复用 ColumnConfig 列定义字段（第一版仅 key/label/columnType/length/scale/required/unique/indexed/hidden），
 * 组件类型（componentType）与编辑弹窗渲染后续再做。
 */
public class DataSourceMetadata {

    /** 列定义列表（与 FORM 数据源 column_config 格式一致） */
    private List<ColumnConfig> columns;

    /** 是否支持增删改（只读数据源 false） */
    private boolean writable;

    /** 绑定表单 formKey（FORM/WORKFLOW 数据源；SYSTEM/API 为空）——编辑弹窗按表单 schema 构建组件用 */
    private String formKey;

    public DataSourceMetadata() {}

    public DataSourceMetadata(List<ColumnConfig> columns, boolean writable) {
        this.columns = columns;
        this.writable = writable;
    }

    public List<ColumnConfig> getColumns() { return columns; }
    public void setColumns(List<ColumnConfig> columns) { this.columns = columns; }

    public boolean isWritable() { return writable; }
    public void setWritable(boolean writable) { this.writable = writable; }

    public String getFormKey() { return formKey; }
    public void setFormKey(String formKey) { this.formKey = formKey; }
}
