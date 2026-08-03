package com.workflow.engine.form.entity;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * FormDefinition 实体单元测试。
 */
class FormDefinitionTest {

    @Test
    void formKeyGetterSetter() {
        FormDefinition formDef = new FormDefinition();
        formDef.setFormKey("user-crud");

        assertEquals("user-crud", formDef.getFormKey());
    }

    @Test
    void formKey_defaultsToNull() {
        FormDefinition formDef = new FormDefinition();
        assertNull(formDef.getFormKey());
    }
}
