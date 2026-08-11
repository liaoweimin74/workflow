package com.workflow.api.dto;

import java.util.Map;

/**
 * 表单配置解析结果。
 *
 * <p>包含表单定义 ID 和字段权限映射（key 为字段名，value 为 EDIT/VIEW/HIDDEN）。
 * 由 {@code extractFormConfig} 从节点或流程级 NodeConfig 解析得到。
 */
public class FormConfigResult {

    private String formDefId;
    private Map<String, String> fieldPermissions;

    public String getFormDefId() { return formDefId; }
    public void setFormDefId(String formDefId) { this.formDefId = formDefId; }

    public Map<String, String> getFieldPermissions() { return fieldPermissions; }
    public void setFieldPermissions(Map<String, String> fieldPermissions) { this.fieldPermissions = fieldPermissions; }
}
