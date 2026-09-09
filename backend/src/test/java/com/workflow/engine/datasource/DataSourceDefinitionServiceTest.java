package com.workflow.engine.datasource;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.datasource.repository.DataSourceDefinitionRepository;
import com.workflow.engine.form.bizdata.FormQueryConfig;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.engine.page.repository.PageDefinitionRepository;
import com.workflow.engine.tenant.TenantContext;
import com.workflow.engine.tenant.TenantProvider;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 数据源定义服务测试（对齐 Task 7A）：
 * 创建（DRAFT / name 唯一 / type 必填 / FORM 表单存在）；
 * 启用（必填项齐全 + FORM 表单已发布才可 ENABLED）；禁用；删除仅 DRAFT（ENABLED 400）；
 * 不执行 DDL（Service 构造不含 DynamicTableManager/JdbcTemplate，结构性排除）；
 * API 类型数据源查询返回"数据源类型未启用"。
 */
@ExtendWith(MockitoExtension.class)
class DataSourceDefinitionServiceTest {

    @Mock
    private DataSourceDefinitionRepository dsRepository;

    @Mock
    private FormDefinitionRepository formDefRepository;

    @Mock
    private PageDefinitionRepository pageRepository;

    @Mock
    private TenantProvider tenantProvider;

    @Mock
    private DataSourceAdapter formAdapter;

    private ObjectMapper objectMapper = new ObjectMapper();
    private DataSourceDefinitionService service;

    private static final String TENANT_ID = "tenant-a";
    private static final String DS_ID = "ds-1";

    @BeforeEach
    void setUp() {
        TenantContext.setTenantId(TENANT_ID);
        lenient().when(tenantProvider.getTenantId()).thenReturn(TENANT_ID);
        // FORM 适配器已注册；SYSTEM/API 无适配器
        lenient().when(formAdapter.supports("FORM")).thenReturn(true);
        lenient().when(formAdapter.supports("SYSTEM")).thenReturn(false);
        lenient().when(formAdapter.supports("API")).thenReturn(false);
        service = new DataSourceDefinitionService(dsRepository, formDefRepository, pageRepository,
                tenantProvider, objectMapper, List.of(formAdapter));
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    private DataSourceDefinition draftDs(String type, String formKey, String sourceKey, String params) {
        DataSourceDefinition ds = new DataSourceDefinition();
        ds.setId(DS_ID);
        ds.setTenantId(TENANT_ID);
        ds.setName("测试数据源");
        ds.setType(type);
        ds.setFormKey(formKey);
        ds.setSourceKey(sourceKey);
        ds.setParams(params);
        ds.setStatus("DRAFT");
        return ds;
    }

    private FormDefinition publishedForm(String key) {
        FormDefinition fd = new FormDefinition();
        fd.setId("form-" + key);
        fd.setTenantId(TENANT_ID);
        fd.setKey(key);
        fd.setType("BUSINESS");
        fd.setStatus("PUBLISHED");
        fd.setPublishedVersion(1);
        return fd;
    }

    // ==================== 创建 ====================

    @Test
    void create_success_defaultsToDraft() {
        DataSourceDefinition saved = draftDs("FORM", "biz_leave", null, null);
        when(dsRepository.existsByTenantIdAndName(TENANT_ID, "测试数据源")).thenReturn(false);
        when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "biz_leave")).thenReturn(true);
        when(dsRepository.save(any(DataSourceDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        DataSourceDefinition result = service.create("测试数据源", "FORM", "biz_leave", null, null);

        assertEquals("DRAFT", result.getStatus());
        assertEquals(TENANT_ID, result.getTenantId());
    }

    @Test
    void create_duplicateName_rejected() {
        when(dsRepository.existsByTenantIdAndName(TENANT_ID, "测试数据源")).thenReturn(true);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.create("测试数据源", "FORM", "biz_leave", null, null));
        assertTrue(ex.getMessage().contains("已存在"));
        verify(dsRepository, never()).save(any());
    }

    @Test
    void create_missingType_rejected() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.create("测试数据源", null, null, null, null));
        assertTrue(ex.getMessage().contains("type") || ex.getMessage().contains("类型"));
    }

    @Test
    void create_unsupportedType_rejected() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.create("测试数据源", "XXX", null, null, null));
        assertTrue(ex.getMessage().contains("不支持"));
    }

    @Test
    void create_formSource_missingFormKey_rejected() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.create("测试数据源", "FORM", null, null, null));
        assertTrue(ex.getMessage().contains("formKey"));
    }

    @Test
    void create_formSource_autoGeneratesParams() throws Exception {
        when(dsRepository.existsByTenantIdAndName(TENANT_ID, "测试数据源")).thenReturn(false);
        when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "product")).thenReturn(true);
        when(dsRepository.save(any(DataSourceDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        DataSourceDefinition result = service.create("测试数据源", "FORM", "product", null, null);

        String params = result.getParams();
        assertNotNull(params);
        JsonNode node = objectMapper.readTree(params);
        assertEquals("GET", node.get("list").get("method").asText());
        assertEquals("/api/v1/biz-data/product", node.get("list").get("action").asText());
        assertEquals("records", node.get("list").get("parse").asText());
        assertEquals("total", node.get("list").get("totalParse").asText());
        assertEquals("POST", node.get("create").get("method").asText());
        assertEquals("/api/v1/biz-data/product", node.get("create").get("action").asText());
        assertEquals("GET", node.get("get").get("method").asText());
        assertEquals("/api/v1/biz-data/product/{id}", node.get("get").get("action").asText());
        assertEquals("DELETE", node.get("delete").get("method").asText());
        assertEquals("/api/v1/biz-data/product/{id}", node.get("delete").get("action").asText());
    }

    @Test
    void create_formSource_unknownForm_rejected() {
        when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "no-such-form")).thenReturn(false);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.create("测试数据源", "FORM", "no-such-form", null, null));
        assertTrue(ex.getMessage().contains("表单不存在"));
    }

    @Test
    void create_systemSource_missingSourceKey_rejected() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.create("测试数据源", "SYSTEM", null, null, null));
        assertTrue(ex.getMessage().contains("sourceKey"));
    }

    @Test
    void create_systemSource_autoGeneratesParams() throws Exception {
        when(dsRepository.existsByTenantIdAndName(TENANT_ID, "测试数据源")).thenReturn(false);
        when(dsRepository.save(any(DataSourceDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        DataSourceDefinition result = service.create("测试数据源", "SYSTEM", null, "dept-tree", null);

        String params = result.getParams();
        assertNotNull(params);
        JsonNode node = objectMapper.readTree(params);
        assertEquals("GET", node.get("list").get("method").asText());
        assertEquals("/api/v1/internal/system/dept-tree", node.get("list").get("action").asText());
    }

    @Test
    void create_systemSource_unknownSourceKey_rejected() {
        assertThrows(BusinessException.class,
                () -> service.create("测试数据源", "SYSTEM", null, "unknown-key", null));
    }

    @Test
    void create_apiSource_invalidParams_rejected() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.create("测试数据源", "API", null, "external-stock", "{not-json}"));
        assertTrue(ex.getMessage().contains("JSON"));
    }

    @Test
    void create_apiSource_missingAction_rejected() {
        // params 合法 JSON 但缺少 action（LookupFetchConfig 契约：action 必填）
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.create("测试数据源", "API", null, "external-stock", "{\"parse\":\"records\"}"));
        assertTrue(ex.getMessage().contains("action"));
    }

    @Test
    void create_apiSource_paramsNotObject_rejected() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.create("测试数据源", "API", null, "external-stock", "[1,2,3]"));
        assertTrue(ex.getMessage().contains("JSON 对象"));
    }

    @Test
    void create_apiSource_validParams_success() {
        when(dsRepository.existsByTenantIdAndName(TENANT_ID, "测试数据源")).thenReturn(false);
        when(dsRepository.save(any(DataSourceDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        DataSourceDefinition result = service.create("测试数据源", "API", null, "external-stock",
                "{\"action\":\"/v1/external/list\",\"method\":\"GET\",\"parse\":\"records\",\"totalParse\":\"total\","
                        + "\"searchParam\":\"keyword\",\"keywordColumn\":\"name\",\"pageBase\":1,"
                        + "\"data\":{\"k\":\"v\"},\"headers\":{\"X-Api-Key\":\"xxx\"}}");

        assertEquals("ENABLED", result.getStatus());
    }

    @Test
    void create_apiSource_paramsNull_rejected() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.create("测试数据源", "API", null, "external-stock", null));
        assertTrue(ex.getMessage().contains("action"));
    }

    // ==================== 启用 ====================

    @Test
    void enable_formSource_withUnpublishedForm_rejected() {
        DataSourceDefinition ds = draftDs("FORM", "draft-form", null, null);
        when(dsRepository.findByIdAccessible(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                TENANT_ID, "draft-form", "PUBLISHED")).thenReturn(Optional.empty());

        BusinessException ex = assertThrows(BusinessException.class, () -> service.enable(DS_ID));
        assertTrue(ex.getMessage().contains("未发布"));
        assertEquals("DRAFT", ds.getStatus());
    }

    @Test
    void enable_formSource_success() {
        DataSourceDefinition ds = draftDs("FORM", "biz_leave", null, null);
        when(dsRepository.findByIdAccessible(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                TENANT_ID, "biz_leave", "PUBLISHED")).thenReturn(Optional.of(publishedForm("biz_leave")));
        when(dsRepository.save(any(DataSourceDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        DataSourceDefinition result = service.enable(DS_ID);

        assertEquals("ENABLED", result.getStatus());
    }

    @Test
    void enable_systemSource_success() {
        DataSourceDefinition ds = draftDs("SYSTEM", null, "dept-tree", null);
        ds.setParams(null);
        when(dsRepository.findByIdAccessible(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));
        when(dsRepository.save(any(DataSourceDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        DataSourceDefinition result = service.enable(DS_ID);

        assertEquals("ENABLED", result.getStatus());
        assertNotNull(result.getParams());
        assertTrue(result.getParams().contains("/api/v1/internal/system/dept-tree"));
    }

    @Test
    void enable_missingRequiredField_rejected() {
        // SYSTEM 类型缺 sourceKey → 必填校验失败，保持 DRAFT
        DataSourceDefinition ds = draftDs("SYSTEM", null, null, null);
        when(dsRepository.findByIdAccessible(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.enable(DS_ID));
        assertTrue(ex.getMessage().contains("sourceKey"));
        assertEquals("DRAFT", ds.getStatus());
    }

    // ==================== 禁用 ====================

    @Test
    void disable_setsDisabled() {
        DataSourceDefinition ds = draftDs("FORM", "biz_leave", null, null);
        ds.setStatus("ENABLED");
        when(dsRepository.findByIdAccessible(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));
        when(dsRepository.save(any(DataSourceDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        DataSourceDefinition result = service.disable(DS_ID);

        assertEquals("DISABLED", result.getStatus());
    }

    // ==================== 删除 ====================

    @Test
    void delete_draft_success() {
        DataSourceDefinition ds = draftDs("FORM", "biz_leave", null, null);
        when(dsRepository.findByIdAccessible(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));
        when(pageRepository.countByTenantIdAndDataSourceId(TENANT_ID, DS_ID)).thenReturn(0L);
        when(pageRepository.findByTenantIdAndTypeOrderByUpdatedAtDesc(eq(TENANT_ID), eq("PAGE"), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));

        service.delete(DS_ID);

        verify(dsRepository).delete(ds);
    }

    @Test
    void delete_enabled_noReference_success() {
        DataSourceDefinition ds = draftDs("API", null, "external-stock", null);
        ds.setStatus("ENABLED");
        when(dsRepository.findByIdAccessible(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));
        when(pageRepository.countByTenantIdAndDataSourceId(TENANT_ID, DS_ID)).thenReturn(0L);
        when(pageRepository.findByTenantIdAndTypeOrderByUpdatedAtDesc(eq(TENANT_ID), eq("PAGE"), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));

        service.delete(DS_ID);

        verify(dsRepository).delete(ds);
    }

    @Test
    void delete_referencedByPage_rejected() {
        DataSourceDefinition ds = draftDs("API", null, "external-stock", null);
        ds.setStatus("ENABLED");
        when(dsRepository.findByIdAccessible(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));
        when(pageRepository.countByTenantIdAndDataSourceId(TENANT_ID, DS_ID)).thenReturn(2L);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.delete(DS_ID));
        assertTrue(ex.getMessage().contains("引用"));
        verify(dsRepository, never()).delete(any());
    }

    @Test
    void delete_referencedByPageSchema_rejected() {
        // PAGE 类型页面的引用声明在 schema.dataSources[].refId，dataSourceId 列为空 → 依赖列统计会漏
        DataSourceDefinition ds = draftDs("API", null, "external-stock", null);
        ds.setStatus("ENABLED");
        when(dsRepository.findByIdAccessible(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));
        when(pageRepository.countByTenantIdAndDataSourceId(TENANT_ID, DS_ID)).thenReturn(0L);
        PageDefinition page = new PageDefinition();
        page.setId("page-1");
        page.setTenantId(TENANT_ID);
        page.setType("PAGE");
        page.setSchema("{\"dataSources\":[{\"id\":\"ds_cmp\",\"refId\":\"ds-1\",\"name\":\"外部库存数据源\"}]}");
        when(pageRepository.findByTenantIdAndTypeOrderByUpdatedAtDesc(eq(TENANT_ID), eq("PAGE"), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(page), Pageable.unpaged(), 1));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.delete(DS_ID));
        assertTrue(ex.getMessage().contains("引用"));
        verify(dsRepository, never()).delete(any());
    }

    @Test
    void delete_schemaRefOnlyArchivedPage_notBlocked() {
        // 页面已软删除（ARCHIVED）不再使用，其 schema 引用不应阻塞数据源删除
        DataSourceDefinition ds = draftDs("API", null, "external-stock", null);
        ds.setStatus("ENABLED");
        when(dsRepository.findByIdAccessible(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));
        when(pageRepository.countByTenantIdAndDataSourceId(TENANT_ID, DS_ID)).thenReturn(0L);
        PageDefinition archived = new PageDefinition();
        archived.setId("page-archived");
        archived.setTenantId(TENANT_ID);
        archived.setType("PAGE");
        archived.setStatus("ARCHIVED");
        archived.setSchema("{\"dataSources\":[{\"id\":\"ds_cmp\",\"refId\":\"ds-1\",\"name\":\"外部库存数据源\"}]}");
        when(pageRepository.findByTenantIdAndTypeOrderByUpdatedAtDesc(eq(TENANT_ID), eq("PAGE"), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(archived), Pageable.unpaged(), 1));

        service.delete(DS_ID);

        verify(dsRepository).delete(ds);
    }

    // ==================== 查询分发（Adapter SPI） ====================

    @Test
    void query_apiType_noAdapter_rejected() {
        DataSourceDefinition ds = draftDs("API", null, "external-stock", null);
        ds.setStatus("ENABLED");
        when(dsRepository.findByIdAccessible(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));

        BizDataQueryRequest req = new BizDataQueryRequest();
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.queryData(DS_ID, req));
        assertTrue(ex.getMessage().contains("数据源类型未启用") || ex.getMessage().contains("未启用"));
        verify(formAdapter, never()).query(any(), any());
    }

    @Test
    void query_disabledSource_rejected() {
        DataSourceDefinition ds = draftDs("FORM", "biz_leave", null, null);
        ds.setStatus("DISABLED");
        when(dsRepository.findByIdAccessible(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));

        assertThrows(BusinessException.class, () -> service.queryData(DS_ID, new BizDataQueryRequest()));
    }

    @Test
    void query_formSource_delegatesToAdapter() {
        DataSourceDefinition ds = draftDs("FORM", "biz_leave", null, null);
        ds.setStatus("ENABLED");
        when(dsRepository.findByIdAccessible(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));
        when(formAdapter.query(eq(ds), any(BizDataQueryRequest.class)))
                .thenReturn(new BizDataPageVO(List.of(), 0, 0, 20));

        BizDataPageVO vo = service.queryData(DS_ID, new BizDataQueryRequest());

        assertNotNull(vo);
        verify(formAdapter).query(eq(ds), any(BizDataQueryRequest.class));
    }

    // ==================== WORKFLOW 启用校验 ====================

    @Test
    void enable_workflowSource_withPublishedWorkflowForm_success() {
        DataSourceDefinition ds = draftDs("WORKFLOW", "wf_leave", null, null);
        when(dsRepository.findByIdAccessible(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));
        FormDefinition wf = publishedForm("wf_leave");
        wf.setType("WORKFLOW");
        when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "wf_leave")).thenReturn(true);
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                TENANT_ID, "wf_leave", "PUBLISHED")).thenReturn(Optional.of(wf));
        when(dsRepository.save(any(DataSourceDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        DataSourceDefinition result = service.enable(DS_ID);

        assertEquals("ENABLED", result.getStatus());
    }

    @Test
    void enable_workflowSource_withBusinessForm_rejected() {
        DataSourceDefinition ds = draftDs("WORKFLOW", "wf_leave", null, null);
        when(dsRepository.findByIdAccessible(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));
        when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "wf_leave")).thenReturn(true);
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                TENANT_ID, "wf_leave", "PUBLISHED")).thenReturn(Optional.of(publishedForm("wf_leave")));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.enable(DS_ID));
        assertTrue(ex.getMessage().contains("业务表单不可配置为工作流表单数据源"));
        assertEquals("DRAFT", ds.getStatus());
    }

    @Test
    void enable_workflowSource_onlyDraftForm_rejected() {
        DataSourceDefinition ds = draftDs("WORKFLOW", "wf_leave", null, null);
        when(dsRepository.findByIdAccessible(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));
        when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "wf_leave")).thenReturn(true);
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                TENANT_ID, "wf_leave", "PUBLISHED")).thenReturn(Optional.empty());

        BusinessException ex = assertThrows(BusinessException.class, () -> service.enable(DS_ID));
        assertTrue(ex.getMessage().contains("工作流表单必须先发布"));
    }

    @Test
    void enable_workflowSource_missingForm_rejected() {
        DataSourceDefinition ds = draftDs("WORKFLOW", "no-such", null, null);
        when(dsRepository.findByIdAccessible(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));
        when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "no-such")).thenReturn(false);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.enable(DS_ID));
        assertTrue(ex.getMessage().contains("表单不存在"));
    }

    // ==================== getEnabled 跨租户测试 ====================

    @Test
    void getEnabled_includesSystemDatasources() {
        // ARRANGE：当前租户有一个 ENABLED 的 FORM 数据源，system 租户有 SYSTEM 数据源
        DataSourceDefinition tenantDs = draftDs("FORM", "biz_form", null, null);
        tenantDs.setStatus("ENABLED");
        tenantDs.setTenantId(TENANT_ID);

        DataSourceDefinition systemDs = draftDs("SYSTEM", null, "dept-tree", null);
        systemDs.setId("ds-system");
        systemDs.setStatus("ENABLED");
        systemDs.setTenantId("system");

        // getEnabled 调用新的跨租户查询方法
        when(dsRepository.findByStatusAndAccessibleTenant("ENABLED", TENANT_ID))
                .thenReturn(List.of(tenantDs, systemDs));

        // ACT
        List<DataSourceDefinition> result = service.getEnabled();

        // ASSERT：返回当前租户的 + SYSTEM 的数据源
        assertEquals(2, result.size());
        assertTrue(result.stream().anyMatch(ds -> "SYSTEM".equals(ds.getType())));
        assertTrue(result.stream().anyMatch(ds -> TENANT_ID.equals(ds.getTenantId())));
    }

    @Test
    void getEnabled_excludesOtherTenantDatasources() {
        // ARRANGE：其他租户的非 SYSTEM 数据源不应返回
        DataSourceDefinition otherTenantDs = draftDs("FORM", "other_form", null, null);
        otherTenantDs.setStatus("ENABLED");
        otherTenantDs.setTenantId("other-tenant");

        DataSourceDefinition systemDs = draftDs("SYSTEM", null, "user-tree", null);
        systemDs.setId("ds-system");
        systemDs.setStatus("ENABLED");
        systemDs.setTenantId("system");

        when(dsRepository.findByStatusAndAccessibleTenant("ENABLED", TENANT_ID))
                .thenReturn(List.of(systemDs)); // 只返回 SYSTEM，其他租户的不返回

        // ACT
        List<DataSourceDefinition> result = service.getEnabled();

        // ASSERT
        assertEquals(1, result.size());
        assertEquals("SYSTEM", result.get(0).getType());
    }

    @Test
    void getById_systemDatasourceAccessibleAcrossTenants() {
        // SYSTEM 数据源归属 tenantId="system"，但任何租户都能访问
        DataSourceDefinition systemDs = draftDs("SYSTEM", null, "dept-tree", null);
        systemDs.setId("ds-system");
        systemDs.setTenantId("system");
        systemDs.setStatus("ENABLED");

        when(dsRepository.findByIdAccessible("ds-system", TENANT_ID)).thenReturn(Optional.of(systemDs));

        DataSourceDefinition result = service.getById("ds-system");

        assertEquals("ds-system", result.getId());
        assertEquals("SYSTEM", result.getType());
        assertEquals("dept-tree", result.getSourceKey());
    }

    // ==================== source_key 泛化（Task 3） ====================

    @Test
    void create_formSource_sourceKeyAutoEqualsFormKey() {
        when(dsRepository.existsByTenantIdAndName(TENANT_ID, "测试数据源")).thenReturn(false);
        when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "biz_leave")).thenReturn(true);
        when(dsRepository.save(any(DataSourceDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        DataSourceDefinition result = service.create("测试数据源", "FORM", "biz_leave", null, null);

        assertEquals("biz_leave", result.getSourceKey());
    }

    @Test
    void create_formSource_sourceKeyParamIgnoredWhenDiffersFromFormKey() {
        when(dsRepository.existsByTenantIdAndName(TENANT_ID, "测试数据源")).thenReturn(false);
        when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "biz_leave")).thenReturn(true);
        when(dsRepository.save(any(DataSourceDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        DataSourceDefinition result = service.create("测试数据源", "FORM", "biz_leave", "custom-key", null);

        // formKey 为权威源头，sourceKey 恒等于 formKey
        assertEquals("biz_leave", result.getSourceKey());
    }

    @Test
    void create_formSource_duplicateSourceKey_rejected() {
        when(dsRepository.existsByTenantIdAndName(TENANT_ID, "测试数据源")).thenReturn(false);
        when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "biz_leave")).thenReturn(true);
        when(dsRepository.existsByTenantIdAndSourceKey(TENANT_ID, "biz_leave")).thenReturn(true);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.create("测试数据源", "FORM", "biz_leave", null, null));
        assertTrue(ex.getMessage().contains("sourceKey"));
        verify(dsRepository, never()).save(any());
    }

    @Test
    void create_workflowSource_sourceKeyAutoEqualsFormKey() {
        when(dsRepository.existsByTenantIdAndName(TENANT_ID, "测试数据源")).thenReturn(false);
        when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "wf_leave")).thenReturn(true);
        when(dsRepository.save(any(DataSourceDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        DataSourceDefinition result = service.create("测试数据源", "WORKFLOW", "wf_leave", null, null);

        assertEquals("wf_leave", result.getSourceKey());
    }

    @Test
    void create_sqlSource_success_withOptionalFormKey() {
        when(dsRepository.existsByTenantIdAndName(TENANT_ID, "测试数据源")).thenReturn(false);
        when(dsRepository.save(any(DataSourceDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        DataSourceDefinition result = service.create("测试数据源", "SQL", null, "orders-report", null);

        assertEquals("ENABLED", result.getStatus());
        assertEquals("SQL", result.getType());
        assertEquals("orders-report", result.getSourceKey());
        assertNull(result.getFormKey());
    }

    @Test
    void create_sqlSource_missingSourceKey_rejected() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.create("测试数据源", "SQL", null, null, null));
        assertTrue(ex.getMessage().contains("sourceKey"));
    }

    @Test
    void update_formSource_sourceKeyFollowsFormKeyChange() {
        DataSourceDefinition ds = draftDs("FORM", "biz_leave", "biz_leave", null);
        ds.setStatus("DRAFT");
        when(dsRepository.findByIdAccessible(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));
        when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "biz_leave2")).thenReturn(true);
        when(dsRepository.existsByTenantIdAndSourceKey(TENANT_ID, "biz_leave2")).thenReturn(false);
        when(dsRepository.save(any(DataSourceDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        DataSourceDefinition result = service.update(DS_ID, null, null, "biz_leave2", null, null);

        assertEquals("biz_leave2", result.getFormKey());
        assertEquals("biz_leave2", result.getSourceKey());
    }

    @Test
    void update_formSource_newFormKeySourceKeyConflict_rejected() {
        DataSourceDefinition ds = draftDs("FORM", "biz_leave", "biz_leave", null);
        ds.setStatus("DRAFT");
        when(dsRepository.findByIdAccessible(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));
        when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "biz_leave2")).thenReturn(true);
        when(dsRepository.existsByTenantIdAndSourceKey(TENANT_ID, "biz_leave2")).thenReturn(true);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.update(DS_ID, null, null, "biz_leave2", null, null));
        assertTrue(ex.getMessage().contains("sourceKey"));
        verify(dsRepository, never()).save(any());
    }

    @Test
    void update_unchangedSourceKey_noSelfConflict() {
        // FORM 类型仅改名称：formKey/sourceKey 均不变 → 不做唯一性校验（自身不算冲突）
        DataSourceDefinition ds = draftDs("FORM", "biz_leave", "biz_leave", null);
        ds.setStatus("DRAFT");
        when(dsRepository.findByIdAccessible(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));
        when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "biz_leave")).thenReturn(true);
        when(dsRepository.save(any(DataSourceDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        service.update(DS_ID, "新名称", null, null, null, null);

        verify(dsRepository, never()).existsByTenantIdAndSourceKey(any(), any());
    }

    @Test
    void create_apiSource_savesAsPublished() {
        when(dsRepository.existsByTenantIdAndName(TENANT_ID, "外部库存API")).thenReturn(false);
        when(dsRepository.save(any(DataSourceDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        DataSourceDefinition result = service.create("外部库存API", "API", null, "external-stock",
                "{\"action\":\"/api/v1/external/stock\",\"parse\":\"records\"}");

        assertEquals("ENABLED", result.getStatus());
    }

    @Test
    void create_sqlSource_savesAsPublished() {
        when(dsRepository.existsByTenantIdAndName(TENANT_ID, "员工查询SQL")).thenReturn(false);
        when(dsRepository.save(any(DataSourceDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        DataSourceDefinition result = service.create("员工查询SQL", "SQL", "emp_profile", "emp_profile_query",
                "{\"querySql\":\"SELECT * FROM wf_biz_emp_profile\"}");

        assertEquals("ENABLED", result.getStatus());
    }

    // ==================== FORM 查询配置段（queryMode）保存校验（Task 5） ====================

    /** update FORM 数据源 params（主表单 biz_leave 已存在；expectSave=false 表示预期失败，不 stub save） */
    private DataSourceDefinition updateFormParams(String params) {
        return updateFormParams(params, true);
    }

    private DataSourceDefinition updateFormParams(String params, boolean expectSave) {
        DataSourceDefinition ds = draftDs("FORM", "biz_leave", "biz_leave", "{\"list\":{}}");
        ds.setStatus("DRAFT");
        when(dsRepository.findByIdAccessible(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));
        when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "biz_leave")).thenReturn(true);
        if (expectSave) {
            when(dsRepository.save(any(DataSourceDefinition.class))).thenAnswer(inv -> inv.getArgument(0));
        }
        return service.update(DS_ID, null, null, null, null, params);
    }

    private static String configJoinsParams(String... joinJson) {
        return "{\"list\":{},\"queryMode\":\"config\",\"joins\":[" + String.join(",", joinJson) + "]}";
    }

    private static String sqlParams(String query, String columnsJson, String paramsJson) {
        return "{\"list\":{},\"queryMode\":\"sql\",\"query\":\"" + query + "\",\"columns\":" + columnsJson
                + (paramsJson == null ? "" : ",\"params\":" + paramsJson) + "}";
    }

    private static String join(String alias, String target, String local, String foreign, String joinField,
                               String virtualKey, String label, boolean sortable, boolean filterable) {
        return "{\"alias\":\"" + alias + "\",\"targetFormKey\":\"" + target + "\",\"localField\":\"" + local
                + "\",\"foreignField\":\"" + foreign + "\",\"joinField\":\"" + joinField
                + "\",\"virtualKey\":\"" + virtualKey + "\",\"label\":\"" + label
                + "\",\"sortable\":" + sortable + ",\"filterable\":" + filterable + "}";
    }

    @Test
    void update_formConfigMode_validJoins_saved() {
        String params = configJoinsParams(join("j1", "biz_customer", "customer_id", "id", "name",
                "customer_name", "客户名称", true, true));
        when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "biz_customer")).thenReturn(true);

        DataSourceDefinition result = updateFormParams(params);

        assertEquals(params, result.getParams());
    }

    @Test
    void update_formConfigMode_multiJoins_saved() {
        String params = configJoinsParams(
                join("j1", "biz_customer", "customer_id", "id", "name", "customer_name", "客户名称", true, true),
                join("j2", "biz_dept", "dept_id", "id", "name", "dept_name", "部门名称", true, false));
        when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "biz_customer")).thenReturn(true);
        when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "biz_dept")).thenReturn(true);

        DataSourceDefinition result = updateFormParams(params);

        assertEquals(params, result.getParams());
    }

    @Test
    void update_formConfigMode_targetFormNotExist_rejected() {
        String params = configJoinsParams(join("j1", "biz_customer", "customer_id", "id", "name",
                "customer_name", "客户名称", true, true));
        when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "biz_customer")).thenReturn(false);

        BusinessException ex = assertThrows(BusinessException.class, () -> updateFormParams(params, false));
        assertTrue(ex.getMessage().contains("目标表单不存在"));
        verify(dsRepository, never()).save(any());
    }

    @Test
    void update_formConfigMode_virtualKeyMissing_rejected() {
        String params = configJoinsParams(join("j1", "biz_customer", "customer_id", "id", "name",
                "", "客户名称", true, true));
        when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "biz_customer")).thenReturn(true);

        BusinessException ex = assertThrows(BusinessException.class, () -> updateFormParams(params, false));
        assertTrue(ex.getMessage().contains("virtualKey"));
        verify(dsRepository, never()).save(any());
    }

    @Test
    void update_formConfigMode_duplicateVirtualKey_rejected() {
        String params = configJoinsParams(
                join("j1", "biz_customer", "customer_id", "id", "name", "customer_name", "客户名称", true, true),
                join("j2", "biz_dept", "dept_id", "id", "name", "customer_name", "部门名称", true, false));
        when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "biz_customer")).thenReturn(true);
        when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "biz_dept")).thenReturn(true);

        BusinessException ex = assertThrows(BusinessException.class, () -> updateFormParams(params, false));
        assertTrue(ex.getMessage().contains("virtualKey"));
        verify(dsRepository, never()).save(any());
    }

    @Test
    void update_formConfigMode_emptyJoins_rejected() {
        String params = "{\"list\":{},\"queryMode\":\"config\",\"joins\":[]}";

        BusinessException ex = assertThrows(BusinessException.class, () -> updateFormParams(params, false));
        assertTrue(ex.getMessage().contains("joins"));
        verify(dsRepository, never()).save(any());
    }

    @Test
    void update_formSqlMode_valid_saved() {
        String params = sqlParams("SELECT m.* FROM wf_biz_leave m WHERE m.tenant_id = :tenantId",
                "[{\"key\":\"name\",\"label\":\"姓名\",\"columnType\":\"VARCHAR\",\"sortable\":true,\"filterable\":true}]",
                null);

        DataSourceDefinition result = updateFormParams(params);

        assertEquals(params, result.getParams());
    }

    @Test
    void update_formSqlMode_declaredParams_saved() {
        String params = sqlParams("SELECT m.* FROM wf_biz_leave m WHERE m.tenant_id = :tenantId"
                        + " AND m.created_at >= :startTime",
                "[{\"key\":\"name\",\"label\":\"姓名\",\"columnType\":\"VARCHAR\",\"sortable\":true,\"filterable\":true}]",
                "[\"startTime\"]");

        DataSourceDefinition result = updateFormParams(params);

        assertEquals(params, result.getParams());
    }

    @Test
    void update_formSqlMode_missingTenantId_rejected() {
        String params = sqlParams("SELECT * FROM wf_biz_leave",
                "[{\"key\":\"name\",\"label\":\"姓名\",\"columnType\":\"VARCHAR\",\"sortable\":true,\"filterable\":true}]",
                null);

        BusinessException ex = assertThrows(BusinessException.class, () -> updateFormParams(params, false));
        assertTrue(ex.getMessage().contains("tenantId"));
        verify(dsRepository, never()).save(any());
    }

    @Test
    void update_formSqlMode_unmatchedColumn_rejected() {
        String params = sqlParams("SELECT name, amount FROM wf_biz_leave m WHERE m.tenant_id = :tenantId",
                "[{\"key\":\"age\",\"label\":\"年龄\",\"columnType\":\"INTEGER\",\"sortable\":true,\"filterable\":true}]",
                null);

        BusinessException ex = assertThrows(BusinessException.class, () -> updateFormParams(params, false));
        assertTrue(ex.getMessage().contains("不在查询结果中"));
        verify(dsRepository, never()).save(any());
    }

    @Test
    void update_formSqlMode_undeclaredPlaceholder_rejected() {
        String params = sqlParams("SELECT m.* FROM wf_biz_leave m WHERE m.tenant_id = :tenantId"
                        + " AND m.created_at >= :startTime",
                "[{\"key\":\"name\",\"label\":\"姓名\",\"columnType\":\"VARCHAR\",\"sortable\":true,\"filterable\":true}]",
                null);

        BusinessException ex = assertThrows(BusinessException.class, () -> updateFormParams(params, false));
        assertTrue(ex.getMessage().contains("未声明参数"));
        verify(dsRepository, never()).save(any());
    }

    @Test
    void update_formSqlMode_emptyColumns_rejected() {
        String params = sqlParams("SELECT m.* FROM wf_biz_leave m WHERE m.tenant_id = :tenantId", "[]", null);

        BusinessException ex = assertThrows(BusinessException.class, () -> updateFormParams(params, false));
        assertTrue(ex.getMessage().contains("columns"));
        verify(dsRepository, never()).save(any());
    }

    @Test
    void update_formNoQueryMode_backwardCompatible() {
        // 老数据源 params 无 queryMode 段 → 不校验、原样保存（向后兼容）
        DataSourceDefinition result = updateFormParams("{\"list\":{}}");

        assertEquals("{\"list\":{}}", result.getParams());
    }

    @Test
    void update_formUnknownQueryMode_rejected() {
        String params = "{\"list\":{},\"queryMode\":\"weird\"}";

        BusinessException ex = assertThrows(BusinessException.class, () -> updateFormParams(params, false));
        assertTrue(ex.getMessage().contains("queryMode"));
        verify(dsRepository, never()).save(any());
    }

    @Test
    void create_formWithConfigMode_mergesIntoGeneratedParams() {
        // FORM 创建时传入 config queryMode 段：校验通过后与自动生成端点合并保存
        String params = configJoinsParams(join("j1", "biz_customer", "customer_id", "id", "name",
                "customer_name", "客户名称", true, true));
        when(dsRepository.existsByTenantIdAndName(TENANT_ID, "带关联配置")).thenReturn(false);
        when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "biz_leave")).thenReturn(true);
        when(formDefRepository.existsByTenantIdAndKey(TENANT_ID, "biz_customer")).thenReturn(true);
        when(dsRepository.save(any(DataSourceDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        DataSourceDefinition result = service.create("带关联配置", "FORM", "biz_leave", null, params);

        assertEquals("config", FormQueryConfig.parse(result.getParams(), objectMapper).queryMode());
        assertEquals(1, FormQueryConfig.parse(result.getParams(), objectMapper).joins().size());
    }
}