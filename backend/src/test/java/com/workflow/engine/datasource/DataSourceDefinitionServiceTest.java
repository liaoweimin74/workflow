package com.workflow.engine.datasource;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.datasource.repository.DataSourceDefinitionRepository;
import com.workflow.engine.form.FormDefinitionService;
import com.workflow.engine.form.bizdata.BizDataService;
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
        service = new DataSourceDefinitionService(dsRepository, formDefRepository,
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

        assertEquals("DRAFT", result.getStatus());
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
        when(dsRepository.findByIdAndTenantId(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                TENANT_ID, "draft-form", "PUBLISHED")).thenReturn(Optional.empty());

        BusinessException ex = assertThrows(BusinessException.class, () -> service.enable(DS_ID));
        assertTrue(ex.getMessage().contains("未发布"));
        assertEquals("DRAFT", ds.getStatus());
    }

    @Test
    void enable_formSource_success() {
        DataSourceDefinition ds = draftDs("FORM", "biz_leave", null, null);
        when(dsRepository.findByIdAndTenantId(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                TENANT_ID, "biz_leave", "PUBLISHED")).thenReturn(Optional.of(publishedForm("biz_leave")));
        when(dsRepository.save(any(DataSourceDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        DataSourceDefinition result = service.enable(DS_ID);

        assertEquals("ENABLED", result.getStatus());
    }

    @Test
    void enable_systemSource_success() {
        DataSourceDefinition ds = draftDs("SYSTEM", null, "dept-tree", null);
        when(dsRepository.findByIdAndTenantId(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));
        when(dsRepository.save(any(DataSourceDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        DataSourceDefinition result = service.enable(DS_ID);

        assertEquals("ENABLED", result.getStatus());
    }

    @Test
    void enable_missingRequiredField_rejected() {
        // SYSTEM 类型缺 sourceKey → 必填校验失败，保持 DRAFT
        DataSourceDefinition ds = draftDs("SYSTEM", null, null, null);
        when(dsRepository.findByIdAndTenantId(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.enable(DS_ID));
        assertTrue(ex.getMessage().contains("sourceKey"));
        assertEquals("DRAFT", ds.getStatus());
    }

    // ==================== 禁用 ====================

    @Test
    void disable_setsDisabled() {
        DataSourceDefinition ds = draftDs("FORM", "biz_leave", null, null);
        ds.setStatus("ENABLED");
        when(dsRepository.findByIdAndTenantId(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));
        when(dsRepository.save(any(DataSourceDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        DataSourceDefinition result = service.disable(DS_ID);

        assertEquals("DISABLED", result.getStatus());
    }

    // ==================== 删除 ====================

    @Test
    void delete_draft_success() {
        DataSourceDefinition ds = draftDs("FORM", "biz_leave", null, null);
        when(dsRepository.findByIdAndTenantId(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));

        service.delete(DS_ID);

        verify(dsRepository).delete(ds);
    }

    @Test
    void delete_enabled_rejected() {
        DataSourceDefinition ds = draftDs("FORM", "biz_leave", null, null);
        ds.setStatus("ENABLED");
        when(dsRepository.findByIdAndTenantId(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.delete(DS_ID));
        assertTrue(ex.getMessage().contains("禁用"));
        verify(dsRepository, never()).delete(any());
    }

    // ==================== 查询分发（Adapter SPI） ====================

    @Test
    void query_apiType_noAdapter_rejected() {
        DataSourceDefinition ds = draftDs("API", null, "external-stock", null);
        ds.setStatus("ENABLED");
        when(dsRepository.findByIdAndTenantId(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));

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
        when(dsRepository.findByIdAndTenantId(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));

        assertThrows(BusinessException.class, () -> service.queryData(DS_ID, new BizDataQueryRequest()));
    }

    @Test
    void query_formSource_delegatesToAdapter() {
        DataSourceDefinition ds = draftDs("FORM", "biz_leave", null, null);
        ds.setStatus("ENABLED");
        when(dsRepository.findByIdAndTenantId(DS_ID, TENANT_ID)).thenReturn(Optional.of(ds));
        when(formAdapter.query(eq(ds), any(BizDataQueryRequest.class)))
                .thenReturn(new BizDataPageVO(List.of(), 0, 0, 20));

        BizDataPageVO vo = service.queryData(DS_ID, new BizDataQueryRequest());

        assertNotNull(vo);
        verify(formAdapter).query(eq(ds), any(BizDataQueryRequest.class));
    }

    // ==================== FORM 适配器（真实组件委托 BizDataService） ====================

    @Test
    void formAdapter_supportsOnlyForm_andDelegatesToBizData() {
        BizDataService bizDataService = mock(BizDataService.class);
        FormDefinitionService formDefService = mock(FormDefinitionService.class);
        FormDataSourceAdapter adapter = new FormDataSourceAdapter(bizDataService, formDefService, tenantProvider);

        assertTrue(adapter.supports("FORM"));
        assertFalse(adapter.supports("SYSTEM"));
        assertFalse(adapter.supports("API"));

        DataSourceDefinition ds = draftDs("FORM", "biz_leave", null, null);
        when(bizDataService.query(eq("biz_leave"), any())).thenReturn(new BizDataPageVO(List.of(), 0, 0, 20));

        adapter.query(ds, new BizDataQueryRequest());

        verify(bizDataService).query(eq("biz_leave"), any());
    }
}