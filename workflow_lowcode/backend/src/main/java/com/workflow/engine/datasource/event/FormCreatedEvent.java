package com.workflow.engine.datasource.event;

import org.springframework.context.ApplicationEvent;

/**
 * 业务表单创建事件。
 * 当业务表单创建时发布此事件，触发数据源自动同步。
 */
public class FormCreatedEvent extends ApplicationEvent {

    private final String formId;
    private final String formName;
    private final String formKey;
    private final String tenantId;
    /** 表单类型：BUSINESS → FORM 数据源；WORKFLOW → WORKFLOW 数据源 */
    private final String formType;

    public FormCreatedEvent(Object source, String formId, String formName, String formKey, String tenantId) {
        this(source, formId, formName, formKey, tenantId, "BUSINESS");
    }

    public FormCreatedEvent(Object source, String formId, String formName, String formKey, String tenantId,
                            String formType) {
        super(source);
        this.formId = formId;
        this.formName = formName;
        this.formKey = formKey;
        this.tenantId = tenantId;
        this.formType = formType;
    }

    public String getFormId() {
        return formId;
    }

    public String getFormName() {
        return formName;
    }

    public String getFormKey() {
        return formKey;
    }

    public String getTenantId() {
        return tenantId;
    }

    public String getFormType() {
        return formType;
    }
}
