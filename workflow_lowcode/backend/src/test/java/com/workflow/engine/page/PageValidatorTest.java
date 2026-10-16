package com.workflow.engine.page;

import com.fasterxml.jackson.databind.ObjectMapper;
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
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * PageValidator 单元测试（TDD）。
 * VIEW 视图编译已废弃，仅覆盖自定义页面（PAGE）发布校验：
 * - dataSources 条目 id 唯一、refId 指向存在且 ENABLED 的全局数据源
 * - rule 中数据组件 dataSourceId 命中 dataSources[].id
 * - actions set-filter 字段命中目标数据源 searchFields 白名单
 * - FORM 数据源绑定表单须已发布、searchFields/columns 引用列存在
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

    @Test
    void page_missingRuleArray_rejected() {
        // VIEW 编译废弃后 validateForPublish 统一按 PAGE 校验：无 rule 数组 → 拒绝（早于数据源解析）
        assertThrows(BusinessException.class,
                () -> validator.validateForPublish(pagePage("{\"searchFields\":[]}")));
    }
}
