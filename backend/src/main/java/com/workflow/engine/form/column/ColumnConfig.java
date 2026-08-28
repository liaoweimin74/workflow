package com.workflow.engine.form.column;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/**
 * 列映射配置项。
 * 定义业务表单字段到物理表列的映射关系。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class ColumnConfig {

    /** 字段 key（表单 schema 中的 field，同时作为物理表列名） */
    private String key;

    /** 字段显示名（用于前端列头与筛选器标签） */
    private String label;

    /** 列类型（白名单：VARCHAR/TEXT/LONGTEXT/INT/DECIMAL/DATE/DATETIME/TINYINT/JSON） */
    private String columnType;

    /** 长度（VARCHAR/TINYINT 使用） */
    private Integer length;

    /** 小数精度（DECIMAL 使用，如 2 表示 DECIMAL(18,2)） */
    private Integer scale;

    /** 是否必填（对应 NOT NULL） */
    private boolean required;

    /** 是否唯一（生成 UNIQUE (tenant_id, key) 复合索引） */
    private boolean unique;

    /** 是否建普通索引（用于筛选/排序加速） */
    private boolean indexed;

    /** 是否隐藏列（data-picker 冗余文本列等：不进前端默认表格列/筛选列，但参与 CRUD 写入） */
    private boolean hidden;

    /** 数据引用配置（dataPicker 字段专用：sourceFormKey/displayField/mode 的 JSON，普通列 null） */
    private String pickerConfig;

    /** 存储模式（JSON：整体 JSON 列，默认；SUB_TABLE：子表，预留未实现） */
    private String storageMode = "JSON";

    /** 组件类型（form-create rule 的 type，如 colorPicker/elTransfer；供前端按组件定制渲染） */
    private String componentType;

    /** 是否可排序（缺省 null=未推导，由 SortableResolver 填充；数据源 metadata 声明） */
    private Boolean sortable;

    /** 子表列映射（非空表示该 key 为子表字段，映射独立物理表 wf_biz_<formKey>_<key>） */
    private List<ColumnConfig> subColumns;

    /** 子表传输方式：embedded（默认，内嵌 JSON 随主表往返）/ dedicated（独立子表 CRUD 接口） */
    private String subMode;

    public ColumnConfig() {}
    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }


    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }

    public String getColumnType() { return columnType; }
    public void setColumnType(String columnType) { this.columnType = columnType; }

    public Integer getLength() { return length; }
    public void setLength(Integer length) { this.length = length; }

    public Integer getScale() { return scale; }
    public void setScale(Integer scale) { this.scale = scale; }

    public boolean isRequired() { return required; }
    public void setRequired(boolean required) { this.required = required; }

    public boolean isUnique() { return unique; }
    public void setUnique(boolean unique) { this.unique = unique; }

    public boolean isIndexed() { return indexed; }
    public void setIndexed(boolean indexed) { this.indexed = indexed; }

    public boolean isHidden() { return hidden; }
    public void setHidden(boolean hidden) { this.hidden = hidden; }

    public String getPickerConfig() { return pickerConfig; }
    public void setPickerConfig(String pickerConfig) { this.pickerConfig = pickerConfig; }

    public String getStorageMode() { return storageMode; }
    public void setStorageMode(String storageMode) { this.storageMode = storageMode; }

    public String getComponentType() { return componentType; }
    public void setComponentType(String componentType) { this.componentType = componentType; }

    public Boolean getSortable() { return sortable; }
    public void setSortable(Boolean sortable) { this.sortable = sortable; }

    public List<ColumnConfig> getSubColumns() { return subColumns; }
    public void setSubColumns(List<ColumnConfig> subColumns) { this.subColumns = subColumns; }

    public String getSubMode() { return subMode; }
    public void setSubMode(String subMode) { this.subMode = subMode; }
}
