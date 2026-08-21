package com.workflow.engine.datasource.event;

import org.springframework.context.ApplicationEvent;

/**
 * 业务表单更新事件。
 * 当业务表单更新时发布此事件，触发数据源配置同步。
 */
public class FormUpdatedEvent extends ApplicationEvent {

    private final String formId;
    private final String formName;
    private final String formKey;
    private final String tenantId;

    public FormUpdatedEvent(Object source, String formId, String formName, String formKey, String tenantId) {
        super(source);
        this.formId = formId;
        this.formName = formName;
        this.formKey = formKey;
        this.tenantId = tenantId;
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
}