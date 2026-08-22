package com.workflow.engine.page;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.DataSourceMetadata;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.DataSourceDefinitionService;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
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
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
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
    private DataSourceDefinitionService dsService;

    @Mock
    private TenantProvider tenantProvider;

    private PageValidator validator;

    private static final String TENANT_ID = "test-tenant";

    @BeforeEach
    void setUp() {
        TenantContext.setTenantId(TENANT_ID);
        lenient().when(tenantProvider.getTenantId()).thenReturn(TENANT_ID);
        validator = new PageValidator(formDefRepository, new ObjectMapper(), tenantProvider, dsService);
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

    private PageDefinition viewPage(String dataSourceId, String formKey, String schema) {
        PageDefinition page = new PageDefinition();
        page.setType("VIEW");
        page.setDataSourceId(dataSourceId);
        page.setFormKey(formKey);
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

    // ==================== PAGE 自定义页面校验 ====================

    private PageDefinition pagePage(String schema) {
        PageDefinition page = new PageDefinition();
        page.setType("PAGE");
        page.setFormKey(null);
        page.setSchema(schema);
        return page;
    }

    private DataSourceDefinition enabledDs(String id, String type, String formKey) {
        DataSourceDefinition ds = new DataSourceDefinition();
        ds.setId(id);
        ds.setTenantId(TENANT_ID);
        ds.setName("ds-" + id);
        ds.setType(type);
        ds.setFormKey(formKey);
        ds.setSourceKey("sk-" + id);
        ds.setStatus("ENABLED");
        return ds;
    }

    @Test
    void page_validSchema_passes() {
        when(dsService.getEnabled()).thenReturn(List.of(
                enabledDs("ds_ref_001", "FORM", "product"),
                enabledDs("ds_ref_002", "FORM", "category")));
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                eq(TENANT_ID), eq("product"), eq("PUBLISHED")))
                .thenReturn(Optional.of(publishedForm(columnConfigJson(
                        col("name", "VARCHAR", false),
                        col("categoryId", "VARCHAR", false)))));
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                eq(TENANT_ID), eq("category"), eq("PUBLISHED")))
                .thenReturn(Optional.of(publishedForm(columnConfigJson(
                        col("id", "VARCHAR", false)))));

        String schema = """
                {"rule":[{"type":"page-tree","field":"tree1","props":{"dataSourceId":"ds-cats"}},
                  {"type":"page-table","field":"table1","props":{"dataSourceId":"ds-products"}}],
                 "option":{},
                 "dataSources":[
                   {"id":"ds-cats","refId":"ds_ref_002"},
                   {"id":"ds-products","refId":"ds_ref_001","searchFields":["categoryId"]}],
                 "actions":[{"trigger":"node-click","steps":[
                   {"op":"set-filter","target":"ds-products","field":"categoryId","value":"{node.id}"},
                   {"op":"refresh","target":"ds-products"}]}]}
                """;
        assertDoesNotThrow(() -> validator.validateForPublish(pagePage(schema)));
    }

    @Test
    void page_danglingDataSourceRef_rejected() {
        when(dsService.getEnabled()).thenReturn(List.of(enabledDs("ds_ref_001", "FORM", "product")));

        String schema = """
                {"rule":[{"type":"page-table","field":"t1","props":{"dataSourceId":"ds-products"}}],
                 "option":{},
                 "dataSources":[{"id":"ds-products","refId":"ds_ref_GHOST"}],
                 "actions":[]}
                """;
        assertThrows(BusinessException.class, () -> validator.validateForPublish(pagePage(schema)));
    }

    @Test
    void page_disabledDataSourceRef_rejected() {
        DataSourceDefinition disabled = enabledDs("ds_ref_001", "FORM", "product");
        disabled.setStatus("DISABLED");
        when(dsService.getEnabled()).thenReturn(List.of());

        String schema = """
                {"rule":[{"type":"page-table","field":"t1","props":{"dataSourceId":"ds-products"}}],
                 "option":{},
                 "dataSources":[{"id":"ds-products","refId":"ds_ref_001"}],
                 "actions":[]}
                """;
        assertThrows(BusinessException.class, () -> validator.validateForPublish(pagePage(schema)));
    }

    @Test
    void page_componentDanglingDataSourceId_rejected() {
        when(dsService.getEnabled()).thenReturn(List.of(enabledDs("ds_ref_001", "FORM", "product")));
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                eq(TENANT_ID), eq("product"), eq("PUBLISHED")))
                .thenReturn(Optional.of(publishedForm(columnConfigJson(
                        col("name", "VARCHAR", false)))));

        String schema = """
                {"rule":[{"type":"page-table","field":"t1","props":{"dataSourceId":"ds-ghost"}}],
                 "option":{},
                 "dataSources":[{"id":"ds-products","refId":"ds_ref_001"}],
                 "actions":[]}
                """;
        assertThrows(BusinessException.class, () -> validator.validateForPublish(pagePage(schema)));
    }

    @Test
    void page_actionSetFilterUndeclaredField_rejected() {
        when(dsService.getEnabled()).thenReturn(List.of(enabledDs("ds_ref_001", "FORM", "product")));
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                eq(TENANT_ID), eq("product"), eq("PUBLISHED")))
                .thenReturn(Optional.of(publishedForm(columnConfigJson(
                        col("name", "VARCHAR", false)))));

        // set-filter 引用 secretColumn，但 ds-products 的 searchFields 未声明
        String schema = """
                {"rule":[{"type":"page-table","field":"t1","props":{"dataSourceId":"ds-products"}}],
                 "option":{},
                 "dataSources":[{"id":"ds-products","refId":"ds_ref_001","searchFields":["name"]}],
                 "actions":[{"trigger":"click","steps":[
                   {"op":"set-filter","target":"ds-products","field":"secretColumn","value":"x"}]}]}
                """;
        assertThrows(BusinessException.class, () -> validator.validateForPublish(pagePage(schema)));
    }

    @Test
    void page_duplicateDataSourceId_rejected() {
        when(dsService.getEnabled()).thenReturn(List.of(
                enabledDs("ds_ref_001", "FORM", "product"),
                enabledDs("ds_ref_002", "FORM", "category")));

        String schema = """
                {"rule":[],
                 "option":{},
                 "dataSources":[
                   {"id":"ds-x","refId":"ds_ref_001"},
                   {"id":"ds-x","refId":"ds_ref_002"}],
                 "actions":[]}
                """;
        assertThrows(BusinessException.class, () -> validator.validateForPublish(pagePage(schema)));
    }

    // ==================== VIEW 数据源协议（dataSourceId）校验 ====================

    /** 固定 metadata：name/apply_date 两列（模拟 FORM/WORKFLOW 数据源 metadata） */
    private DataSourceMetadata metadataOf(String... keys) {
        return new DataSourceMetadata(List.of(
                col("name", "VARCHAR", false),
                col("apply_date", "DATE", false)), false);
    }

    @Test
    void view_dataSourceAndFormKeyBothNull_rejected() {
        PageDefinition page = viewPage(null, null, "{\"searchFields\":[]}");
        BusinessException ex = assertThrows(BusinessException.class,
                () -> validator.validateForPublish(page));
        assertTrue(ex.getMessage().contains("请选择数据源"));
    }

    @Test
    void view_dataSourceNotExist_rejected() {
        when(dsService.metadata("ds-ghost")).thenThrow(new BusinessException(404, "数据源不存在: ds-ghost"));
        PageDefinition page = viewPage("ds-ghost", null, "{\"searchFields\":[]}");
        BusinessException ex = assertThrows(BusinessException.class,
                () -> validator.validateForPublish(page));
        assertEquals(404, ex.getCode());
    }

    @Test
    void view_dataSourceDisabled_rejected() {
        when(dsService.metadata("ds-off")).thenThrow(new BusinessException(400, "数据源未启用，无法访问: off"));
        PageDefinition page = viewPage("ds-off", null, "{\"searchFields\":[]}");
        assertThrows(BusinessException.class, () -> validator.validateForPublish(page));
    }

    @Test
    void view_searchFieldNotInMetadata_rejected() {
        when(dsService.metadata("ds-1")).thenReturn(metadataOf());
        PageDefinition page = viewPage("ds-1", null,
                "{\"searchFields\":[{\"key\":\"ghost\",\"label\":\"幽灵\",\"matchType\":\"eq\"}]}");
        BusinessException ex = assertThrows(BusinessException.class,
                () -> validator.validateForPublish(page));
        assertTrue(ex.getMessage().contains("ghost"));
    }

    @Test
    void view_columnNotInMetadata_rejected() {
        when(dsService.metadata("ds-1")).thenReturn(metadataOf());
        PageDefinition page = viewPage("ds-1", null,
                "{\"columns\":[{\"key\":\"ghost\",\"label\":\"幽灵列\"}]}");
        BusinessException ex = assertThrows(BusinessException.class,
                () -> validator.validateForPublish(page));
        assertTrue(ex.getMessage().contains("ghost"));
    }

    @Test
    void view_validDataSourceSchema_passes() {
        when(dsService.metadata("ds-1")).thenReturn(metadataOf());
        PageDefinition page = viewPage("ds-1", null,
                "{\"searchFields\":[{\"key\":\"name\",\"label\":\"姓名\",\"matchType\":\"like\"}],"
                        + "\"columns\":[{\"key\":\"name\",\"label\":\"姓名\"},{\"key\":\"apply_date\",\"label\":\"日期\"}]}");
        assertDoesNotThrow(() -> validator.validateForPublish(page));
    }

    // ==================== resolveBindColumns 取列来源切换 ====================

    @Test
    void resolveBindColumns_dataSourceBound_returnsMetadataColumns() {
        when(dsService.metadata("ds-1")).thenReturn(metadataOf());
        PageDefinition page = viewPage("ds-1", null, "{}");

        List<ColumnConfig> columns = validator.resolveBindColumns(page);

        assertEquals(2, columns.size());
        assertEquals("name", columns.get(0).getKey());
        assertEquals("apply_date", columns.get(1).getKey());
    }

    @Test
    void resolveBindColumns_legacyFormKey_fallsBackToFormConfig() {
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                eq(TENANT_ID), eq("leave"), eq("PUBLISHED")))
                .thenReturn(Optional.of(publishedForm(columnConfigJson(
                        col("name", "VARCHAR", false)))));
        PageDefinition page = viewPage("{\"searchFields\":[]}");

        List<ColumnConfig> columns = validator.resolveBindColumns(page);

        assertEquals(1, columns.size());
        assertEquals("name", columns.get(0).getKey());
    }
}
