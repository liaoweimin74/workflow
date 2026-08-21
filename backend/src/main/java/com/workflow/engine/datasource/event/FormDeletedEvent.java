package com.workflow.engine.datasource.event;

import org.springframework.context.ApplicationEvent;

/**
 * 业务表单删除事件。
 * 当业务表单删除时发布此事件，触发数据源自动删除。
 */
public class FormDeletedEvent extends ApplicationEvent {

    private final String formId;
    private final String formKey;
    private final String tenantId;

    public FormDeletedEvent(Object source, String formId, String formKey, String tenantId) {
        super(source);
        this.formId = formId;
        this.formKey = formKey;
        this.tenantId = tenantId;
    }

    public String getFormId() {
        return formId;
    }

    public String getFormKey() {
        return formKey;
    }

    public String getTenantId() {
        return tenantId;
    }
}