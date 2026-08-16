package com.workflow.engine.page;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.engine.tenant.TenantContext;
import com.workflow.engine.tenant.TenantProvider;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * PageValidator 单元测试（TDD）。
 * 覆盖发布校验：绑定表单存在/发布、searchFields/columns 引用合法性、
 * 隐藏列与 JSON/TEXT 列禁止引用、合法配置通过。
 */
@ExtendWith(MockitoExtension.class)
class PageValidatorTest {

    @Mock
    private FormDefinitionRepository formDefRepository;

    @Mock
    private TenantProvider tenantProvider;

    private PageValidator validator;

    private static final String TENANT_ID = "test-tenant";

    @BeforeEach
    void setUp() {
        TenantContext.setTenantId(TENANT_ID);
        lenient().when(tenantProvider.getTenantId()).thenReturn(TENANT_ID);
        validator = new PageValidator(formDefRepository, new ObjectMapper(), tenantProvider);
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    private FormDefinition publishedForm(String columnConfigJson) {
        FormDefinition form = new FormDefinition();
        form.setId("form-1");
        form.setTenantId(TENANT_ID);
        form.setKey("leave");
        form.setType("BUSINESS");
        form.setStatus("PUBLISHED");
        form.setColumnConfig(columnConfigJson);
        return form;
    }

    private String columnConfigJson(ColumnConfig... columns) {
        try {
            return new ObjectMapper().writeValueAsString(List.of(columns));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private ColumnConfig col(String key, String columnType, boolean hidden) {
        ColumnConfig c = new ColumnConfig();
        c.setKey(key);
        c.setLabel(key);
        c.setColumnType(columnType);
        c.setHidden(hidden);
        return c;
    }

    private PageDefinition viewPage(String schema) {
        PageDefinition page = new PageDefinition();
        page.setType("VIEW");
        page.setFormKey("leave");
        page.setSchema(schema);
        return page;
    }

    // ==================== 绑定表单校验 ====================

    @Test
    void viewBindingNonexistentForm_rejected() {
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                eq(TENANT_ID), eq("leave"), eq("PUBLISHED")))
                .thenReturn(Optional.empty());

        PageDefinition page = viewPage("{\"searchFields\":[]}");
        assertThrows(BusinessException.class, () -> validator.validateForPublish(page));
    }

    @Test
    void viewBindingUnpublishedForm_rejected() {
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                eq(TENANT_ID), eq("leave"), eq("PUBLISHED")))
                .thenReturn(Optional.empty());

        PageDefinition page = viewPage("{\"searchFields\":[]}");
        assertThrows(BusinessException.class, () -> validator.validateForPublish(page));
    }

    // ==================== searchFields 校验 ====================

    @Test
    void searchFieldReferencingMissingColumn_rejected() {
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                eq(TENANT_ID), eq("leave"), eq("PUBLISHED")))
                .thenReturn(Optional.of(publishedForm(columnConfigJson(
                        col("name", "VARCHAR", false)))));

        PageDefinition page = viewPage("{\"searchFields\":[{\"key\":\"nonexistent\",\"label\":\"不存在\",\"matchType\":\"eq\"}]}");
        assertThrows(BusinessException.class, () -> validator.validateForPublish(page));
    }

    @Test
    void searchFieldReferencingHiddenColumn_rejected() {
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                eq(TENANT_ID), eq("leave"), eq("PUBLISHED")))
                .thenReturn(Optional.of(publishedForm(columnConfigJson(
                        col("name", "VARCHAR", false),
                        col("secret", "VARCHAR", true)))));

        PageDefinition page = viewPage("{\"searchFields\":[{\"key\":\"secret\",\"label\":\"隐藏\",\"matchType\":\"eq\"}]}");
        assertThrows(BusinessException.class, () -> validator.validateForPublish(page));
    }

    @Test
    void searchFieldReferencingJsonColumn_rejected() {
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                eq(TENANT_ID), eq("leave"), eq("PUBLISHED")))
                .thenReturn(Optional.of(publishedForm(columnConfigJson(
                        col("name", "VARCHAR", false),
                        col("content", "JSON", false)))));

        PageDefinition page = viewPage("{\"searchFields\":[{\"key\":\"content\",\"label\":\"内容\",\"matchType\":\"like\"}]}");
        assertThrows(BusinessException.class, () -> validator.validateForPublish(page));
    }

    @Test
    void searchFieldReferencingTextColumn_rejected() {
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                eq(TENANT_ID), eq("leave"), eq("PUBLISHED")))
                .thenReturn(Optional.of(publishedForm(columnConfigJson(
                        col("name", "VARCHAR", false),
                        col("remark", "TEXT", false)))));

        PageDefinition page = viewPage("{\"searchFields\":[{\"key\":\"remark\",\"label\":\"备注\",\"matchType\":\"like\"}]}");
        assertThrows(BusinessException.class, () -> validator.validateForPublish(page));
    }

    // ==================== columns 校验 ====================

    @Test
    void columnReferencingMissingColumn_rejected() {
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                eq(TENANT_ID), eq("leave"), eq("PUBLISHED")))
                .thenReturn(Optional.of(publishedForm(columnConfigJson(
                        col("name", "VARCHAR", false)))));

        PageDefinition page = viewPage("{\"columns\":[{\"key\":\"ghost\",\"label\":\"幽灵列\"}]}");
        assertThrows(BusinessException.class, () -> validator.validateForPublish(page));
    }

    @Test
    void columnReferencingHiddenColumn_rejected() {
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                eq(TENANT_ID), eq("leave"), eq("PUBLISHED")))
                .thenReturn(Optional.of(publishedForm(columnConfigJson(
                        col("name", "VARCHAR", false),
                        col("secret", "VARCHAR", true)))));

        PageDefinition page = viewPage("{\"columns\":[{\"key\":\"secret\",\"label\":\"隐藏\"}]}");
        assertThrows(BusinessException.class, () -> validator.validateForPublish(page));
    }

    // ==================== 合法配置 ====================

    @Test
    void validViewSchema_passes() {
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                eq(TENANT_ID), eq("leave"), eq("PUBLISHED")))
                .thenReturn(Optional.of(publishedForm(columnConfigJson(
                        col("name", "VARCHAR", false),
                        col("apply_date", "DATE", false)))));

        PageDefinition page = viewPage("{\"searchFields\":[{\"key\":\"name\",\"label\":\"姓名\",\"matchType\":\"like\"}],"
                + "\"columns\":[{\"key\":\"name\",\"label\":\"姓名\"},{\"key\":\"apply_date\",\"label\":\"日期\"}]}");
        assertDoesNotThrow(() -> validator.validateForPublish(page));
    }

    @Test
    void formBinding_formMustBeBusinessType() {
        FormDefinition workflowForm = new FormDefinition();
        workflowForm.setId("form-w");
        workflowForm.setTenantId(TENANT_ID);
        workflowForm.setKey("leave");
        workflowForm.setType("WORKFLOW");
        workflowForm.setStatus("PUBLISHED");
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                eq(TENANT_ID), eq("leave"), eq("PUBLISHED")))
                .thenReturn(Optional.of(workflowForm));

        PageDefinition page = viewPage("{\"searchFields\":[]}");
        assertThrows(BusinessException.class, () -> validator.validateForPublish(page));
    }

    @Test
    void schemaWithIllegalJson_rejected() {
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                eq(TENANT_ID), eq("leave"), eq("PUBLISHED")))
                .thenReturn(Optional.of(publishedForm(columnConfigJson(
                        col("name", "VARCHAR", false)))));

        PageDefinition page = viewPage("not-json");
        assertThrows(BusinessException.class, () -> validator.validateForPublish(page));
    }
}