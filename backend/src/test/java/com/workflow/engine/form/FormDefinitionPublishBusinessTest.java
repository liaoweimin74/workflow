package com.workflow.engine.form;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.column.DynamicTableManager;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.tenant.TenantContext;
import com.workflow.engine.tenant.TenantProvider;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * 业务表单发布流程单元测试。
 * 验证 type=BUSINESS 时发布触发受控 DDL、含展示型组件被拒绝、非法 column_config 被拒绝。
 */
@ExtendWith(MockitoExtension.class)
class FormDefinitionPublishBusinessTest {

    @Mock
    private FormDefinitionRepository formDefRepository;

    @Mock
    private TenantProvider tenantProvider;

    @Mock
    private DynamicTableManager tableManager;

    private FormDefinitionService formDefService;

    private static final String TENANT_ID = "test-tenant";

    @BeforeEach
    void setUp() {
        TenantContext.setTenantId(TENANT_ID);
        lenient().when(tenantProvider.getTenantId()).thenReturn(TENANT_ID);
        formDefService = new FormDefinitionService(formDefRepository, tenantProvider, tableManager, new ObjectMapper());
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    private FormDefinition draft(String id, String key, String type, String schema, String columnConfig) {
        FormDefinition fd = new FormDefinition();
        fd.setId(id);
        fd.setTenantId(TENANT_ID);
        fd.setKey(key);
        fd.setType(type);
        fd.setSchema(schema);
        fd.setColumnConfig(columnConfig);
        fd.setVersion(1);
        fd.setStatus("DRAFT");
        return fd;
    }

    private void stubDraft(FormDefinition d) {
        lenient().when(formDefRepository.findByIdForUpdate(d.getId(), TENANT_ID)).thenReturn(Optional.of(d));
        lenient().when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                TENANT_ID, d.getKey(), "PUBLISHED")).thenReturn(Optional.empty());
        lenient().when(formDefRepository.save(any(FormDefinition.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void publishBusinessForm_createsTable() {
        String columnConfig = "[{\"key\":\"name\",\"columnType\":\"VARCHAR\",\"length\":255}]";
        FormDefinition d = draft("f1", "biz_leave", "BUSINESS",
                "{\"rule\":[{\"type\":\"input\",\"field\":\"name\"}]}", columnConfig);
        stubDraft(d);

        FormDefinition result = formDefService.publish("f1");

        assertEquals("PUBLISHED", result.getStatus());
        verify(tableManager).ensureTable(eq("biz_leave"), anyList());
    }

    @Test
    void publishWorkflowForm_doesNotCreateTable() {
        FormDefinition d = draft("f1", "wf_leave", "WORKFLOW",
                "{\"rule\":[{\"type\":\"input\",\"field\":\"reason\"}]}", null);
        stubDraft(d);

        formDefService.publish("f1");

        verify(tableManager, never()).ensureTable(anyString(), anyList());
    }

    @Test
    void publishBusinessForm_withDivider_rejected() {
        FormDefinition d = draft("f1", "biz_bad", "BUSINESS",
                "{\"rule\":[{\"type\":\"divider\",\"field\":\"d1\"}]}",
                "[{\"key\":\"d1\",\"columnType\":\"JSON\"}]");
        stubDraft(d);

        BusinessException ex = assertThrows(BusinessException.class, () -> formDefService.publish("f1"));

        assertTrue(ex.getMessage().contains("divider"));
        verify(tableManager, never()).ensureTable(anyString(), anyList());
        verify(formDefRepository, never()).save(any(FormDefinition.class));
    }

    // ==================== subForm / storageMode 发布校验 ====================

    @Test
    void publishSubFormJsonModeCreatesJsonColumn() {
        FormDefinition d = draft("f1", "biz_subform", "BUSINESS",
                "{\"rule\":[{\"type\":\"subForm\",\"field\":\"items\"}]}",
                "[{\"key\":\"items\",\"columnType\":\"JSON\",\"storageMode\":\"JSON\"}]");
        stubDraft(d);

        FormDefinition result = formDefService.publish("f1");

        assertEquals("PUBLISHED", result.getStatus());
        verify(tableManager).ensureTable(eq("biz_subform"), anyList());
    }

    @Test
    void publishSubTableModeRejected() {
        FormDefinition d = draft("f1", "biz_subtable", "BUSINESS",
                "{\"rule\":[{\"type\":\"subForm\",\"field\":\"items\"}]}",
                "[{\"key\":\"items\",\"columnType\":\"JSON\",\"storageMode\":\"SUB_TABLE\"}]");
        stubDraft(d);

        BusinessException ex = assertThrows(BusinessException.class, () -> formDefService.publish("f1"));

        assertTrue(ex.getMessage().contains("子表存储模式暂未实现"));
        verify(tableManager, never()).ensureTable(anyString(), anyList());
        verify(formDefRepository, never()).save(any(FormDefinition.class));
    }

    @Test
    void publishBusinessForm_invalidColumnConfig_rejected() {
        FormDefinition d = draft("f1", "biz_bad", "BUSINESS",
                "{\"rule\":[{\"type\":\"input\",\"field\":\"name\"}]}", "not-valid-json");
        stubDraft(d);

        assertThrows(BusinessException.class, () -> formDefService.publish("f1"));

        verify(tableManager, never()).ensureTable(anyString(), anyList());
    }

    @Test
    void publishBusinessForm_oldSchemaCompatibility_arrayFormat() {
        // 兼容旧版 schema 直接是数组的格式
        String columnConfig = "[{\"key\":\"name\",\"columnType\":\"VARCHAR\",\"length\":255}]";
        FormDefinition d = draft("f1", "biz_leave", "BUSINESS",
                "[{\"type\":\"input\",\"field\":\"name\"}]", columnConfig);
        stubDraft(d);

        formDefService.publish("f1");

        verify(tableManager).ensureTable(eq("biz_leave"), anyList());
    }

    // ==================== data-picker 发布校验 ====================

    private String pickerSchema(String sourceFormKey, String displayField) {
        return "{\"rule\":[{\"type\":\"dataPicker\",\"field\":\"emp_id\",\"props\":{"
                + "\"sourceFormKey\":\"" + sourceFormKey + "\","
                + "\"displayField\":\"" + displayField + "\","
                + "\"columns\":[\"" + displayField + "\"],\"mode\":\"single\"}}]}";
    }

    private FormDefinition targetForm(String key, String columnConfig) {
        FormDefinition t = new FormDefinition();
        t.setId("target-1");
        t.setTenantId(TENANT_ID);
        t.setKey(key);
        t.setType("BUSINESS");
        t.setSchema("[]");
        t.setColumnConfig(columnConfig);
        t.setVersion(1);
        t.setStatus("PUBLISHED");
        return t;
    }

    @Test
    void publish_withPicker_targetFormNotPublished_rejected() {
        FormDefinition d = draft("f1", "biz_leave", "BUSINESS",
                pickerSchema("emp_profile", "name"),
                "[{\"key\":\"emp_id\",\"columnType\":\"VARCHAR\",\"length\":64}]");
        stubDraft(d);
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                TENANT_ID, "emp_profile", "PUBLISHED")).thenReturn(Optional.empty());

        BusinessException ex = assertThrows(BusinessException.class, () -> formDefService.publish("f1"));

        assertTrue(ex.getMessage().contains("目标表单"));
        verify(tableManager, never()).ensureTable(anyString(), anyList());
    }

    @Test
    void publish_withPicker_displayFieldDeleted_rejected() {
        FormDefinition d = draft("f1", "biz_leave", "BUSINESS",
                pickerSchema("emp_profile", "name"),
                "[{\"key\":\"emp_id\",\"columnType\":\"VARCHAR\",\"length\":64}]");
        stubDraft(d);
        // 目标表单存在但 column_config 不含 name 列
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                TENANT_ID, "emp_profile", "PUBLISHED"))
                .thenReturn(Optional.of(targetForm("emp_profile",
                        "[{\"key\":\"dept\",\"columnType\":\"VARCHAR\",\"length\":64}]")));

        BusinessException ex = assertThrows(BusinessException.class, () -> formDefService.publish("f1"));

        assertTrue(ex.getMessage().contains("引用列"));
    }

    @Test
    void publish_withPicker_validConfig_passes() {
        FormDefinition d = draft("f1", "biz_leave", "BUSINESS",
                pickerSchema("emp_profile", "name"),
                "[{\"key\":\"emp_id\",\"columnType\":\"VARCHAR\",\"length\":64},"
                        + "{\"key\":\"emp_id_text\",\"columnType\":\"VARCHAR\",\"length\":1024,\"hidden\":true}]");
        stubDraft(d);
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                TENANT_ID, "emp_profile", "PUBLISHED"))
                .thenReturn(Optional.of(targetForm("emp_profile",
                        "[{\"key\":\"name\",\"columnType\":\"VARCHAR\",\"length\":255}]")));

        FormDefinition result = formDefService.publish("f1");

        assertEquals("PUBLISHED", result.getStatus());
        verify(tableManager).ensureTable(eq("biz_leave"), anyList());
    }

    // ==================== filters 发布校验 ====================

    private String pickerSchemaWithFilters(String sourceFormKey, String displayField, String filtersJson) {
        return "{\"rule\":[{\"type\":\"dataPicker\",\"field\":\"emp_id\",\"props\":{"
                + "\"sourceFormKey\":\"" + sourceFormKey + "\","
                + "\"displayField\":\"" + displayField + "\","
                + "\"columns\":[\"" + displayField + "\"],\"mode\":\"single\","
                + "\"filters\":" + filtersJson + "}}]}";
    }

    @Test
    void publish_withPicker_filterColumnDeleted_rejected() {
        FormDefinition d = draft("f1", "biz_leave", "BUSINESS",
                pickerSchemaWithFilters("emp_profile", "name",
                        "[{\"column\":\"gone_col\",\"operator\":\"=\",\"valueType\":\"static\",\"value\":\"x\"}]"),
                "[{\"key\":\"emp_id\",\"columnType\":\"VARCHAR\",\"length\":64}]");
        stubDraft(d);
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                TENANT_ID, "emp_profile", "PUBLISHED"))
                .thenReturn(Optional.of(targetForm("emp_profile",
                        "[{\"key\":\"name\",\"columnType\":\"VARCHAR\",\"length\":255}]")));

        BusinessException ex = assertThrows(BusinessException.class, () -> formDefService.publish("f1"));

        assertTrue(ex.getMessage().contains("过滤条件引用列"));
        verify(tableManager, never()).ensureTable(anyString(), anyList());
    }

    @Test
    void publish_withPicker_filterValid_passes() {
        FormDefinition d = draft("f1", "biz_leave", "BUSINESS",
                pickerSchemaWithFilters("emp_profile", "name",
                        "[{\"column\":\"dept\",\"operator\":\"=\",\"valueType\":\"field\",\"value\":\"dept_field\"}]"),
                "[{\"key\":\"emp_id\",\"columnType\":\"VARCHAR\",\"length\":64},"
                        + "{\"key\":\"emp_id_text\",\"columnType\":\"VARCHAR\",\"length\":1024,\"hidden\":true}]");
        stubDraft(d);
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                TENANT_ID, "emp_profile", "PUBLISHED"))
                .thenReturn(Optional.of(targetForm("emp_profile",
                        "[{\"key\":\"name\",\"columnType\":\"VARCHAR\",\"length\":255},"
                                + "{\"key\":\"dept\",\"columnType\":\"VARCHAR\",\"length\":64}]")));

        FormDefinition result = formDefService.publish("f1");

        assertEquals("PUBLISHED", result.getStatus());
    }
}
