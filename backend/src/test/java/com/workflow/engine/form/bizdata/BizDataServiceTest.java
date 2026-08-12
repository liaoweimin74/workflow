package com.workflow.engine.form.bizdata;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.FormDefinitionService;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.engine.form.column.DynamicTableManager;
import com.workflow.engine.tenant.TenantContext;
import com.workflow.engine.tenant.TenantProvider;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * BizDataService 单元测试：业务数据 CRUD 校验与租户隔离。
 */
@ExtendWith(MockitoExtension.class)
class BizDataServiceTest {

    @Mock
    private JdbcTemplate jdbcTemplate;

    @Mock
    private DynamicTableManager tableManager;

    @Mock
    private FormDefinitionService formDefService;

    @Mock
    private TenantProvider tenantProvider;

    private BizDataService bizDataService;

    private static final String TENANT_ID = "t1";
    private static final String TABLE = "wf_biz_biz_leave";

    @BeforeEach
    void setUp() {
        TenantContext.setTenantId(TENANT_ID);
        lenient().when(tenantProvider.getTenantId()).thenReturn(TENANT_ID);
        bizDataService = new BizDataService(jdbcTemplate, tableManager, formDefService, tenantProvider,
                new ObjectMapper(), List.of());

        ColumnConfig name = new ColumnConfig();
        name.setKey("name");
        name.setColumnType("VARCHAR");
        name.setLength(255);
        name.setRequired(true);
        ColumnConfig dept = new ColumnConfig();
        dept.setKey("dept");
        dept.setColumnType("VARCHAR");
        dept.setLength(64);
        lenient().when(tableManager.tableExists(TABLE)).thenReturn(true);
        lenient().when(formDefService.getBusinessColumnsByKey("biz_leave")).thenReturn(List.of(name, dept));
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    @Test
    void create_success_insertsAndReturns() {
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of(
                        "id", "row-1",
                        "tenant_id", TENANT_ID,
                        "name", "张三",
                        "dept", "研发部",
                        "version", 1,
                        "created_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)),
                        "updated_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)))));

        BizDataVO vo = bizDataService.create("biz_leave", Map.of("name", "张三", "dept", "研发部"));

        assertThat(vo.getId()).isEqualTo("row-1");
        assertThat(vo.getVersion()).isEqualTo(1);
        assertThat(vo.getData()).containsEntry("name", "张三");
        verify(jdbcTemplate).update(contains("INSERT INTO wf_biz_biz_leave"), any(Object[].class));
    }

    @Test
    void create_missingRequiredField_rejected() {
        assertThatThrownBy(() -> bizDataService.create("biz_leave", Map.of("dept", "研发部")))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("必填");
        verify(jdbcTemplate, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void create_tableNotExists_throws404() {
        when(tableManager.tableExists(TABLE)).thenReturn(false);

        assertThatThrownBy(() -> bizDataService.create("biz_leave", Map.of("name", "张三")))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(404));
    }

    @Test
    void getById_notFound_throws404() {
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());

        assertThatThrownBy(() -> bizDataService.getById("biz_leave", "row-x"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(404));
    }

    @Test
    void update_versionConflict_returns409() {
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(0);
        // 当前行存在（version 已是 4），说明是版本冲突而非记录不存在
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("id", "row-1", "tenant_id", TENANT_ID, "version", 4)));

        assertThatThrownBy(() -> bizDataService.update("biz_leave", "row-1", Map.of("name", "张三", "dept", "新部门"), 3))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(409));
    }

    @Test
    void update_rowNotExists_throws404() {
        // findById 先查 existing：行不存在直接 404
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());

        assertThatThrownBy(() -> bizDataService.update("biz_leave", "row-x", Map.of("name", "张三", "dept", "新部门"), 1))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(404));
    }

    @Test
    void query_success_returnsPage() {
        when(jdbcTemplate.queryForObject(anyString(), eq(Long.class), any(Object[].class))).thenReturn(1L);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of(
                        "id", "row-1",
                        "tenant_id", TENANT_ID,
                        "name", "张三",
                        "version", 1,
                        "created_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)),
                        "updated_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)))));

        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"dept\":\"研发部\"}");
        BizDataPageVO page = bizDataService.query("biz_leave", req);

        assertThat(page.getTotal()).isEqualTo(1);
        assertThat(page.getRecords()).hasSize(1);
        assertThat(page.getRecords().get(0).getData()).containsEntry("name", "张三");
    }

    @Test
    void query_invalidFilterJson_returns400() {
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("not-json");

        assertThatThrownBy(() -> bizDataService.query("biz_leave", req))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(400));
    }

    @Test
    void delete_success_removesRow() {
        // beforeDelete 需先读 existing
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of(
                        "id", "row-1",
                        "tenant_id", TENANT_ID,
                        "name", "张三",
                        "version", 1,
                        "created_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)),
                        "updated_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)))));
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);

        bizDataService.delete("biz_leave", "row-1");

        verify(jdbcTemplate).update(contains("DELETE FROM wf_biz_biz_leave"), any(Object[].class));
    }

    @Test
    void delete_crossTenant_returns404() {
        // findById 先查 existing：跨租户行不存在 → 404（不执行 DELETE）
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());

        assertThatThrownBy(() -> bizDataService.delete("biz_leave", "row-other-tenant"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(404));
    }

    // ==================== data-picker 引用字段 ====================

    private ColumnConfig pickerColumn(String key, String sourceFormKey) {
        ColumnConfig c = new ColumnConfig();
        c.setKey(key);
        c.setColumnType("VARCHAR");
        c.setLength(64);
        c.setPickerConfig("{\"sourceFormKey\":\"" + sourceFormKey + "\",\"displayField\":\"name\",\"mode\":\"single\"}");
        return c;
    }

    private ColumnConfig hiddenTextColumn(String key) {
        ColumnConfig c = new ColumnConfig();
        c.setKey(key);
        c.setColumnType("VARCHAR");
        c.setLength(1024);
        c.setHidden(true);
        return c;
    }

    @Test
    void create_withPickerField_resolvesAndMaintainsText() {
        when(formDefService.getBusinessColumnsByKey("biz_leave"))
                .thenReturn(List.of(pickerColumn("emp_id", "emp_profile"), hiddenTextColumn("emp_id_text")));
        // 第一次 queryForList：resolve 目标表；第二次：findById 当前表
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
                .thenReturn(
                        List.of(Map.of("id", "t1", "name", "张三")),
                        List.of(Map.of(
                                "id", "row-1",
                                "tenant_id", TENANT_ID,
                                "emp_id", "t1",
                                "emp_id_text", "张三",
                                "version", 1,
                                "created_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)),
                                "updated_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)))));
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);

        BizDataVO vo = bizDataService.create("biz_leave", Map.of("emp_id", "t1"));

        assertThat(vo.getData()).containsEntry("emp_id", "t1").containsEntry("emp_id_text", "张三");
        ArgumentCaptor<Object[]> params = ArgumentCaptor.forClass(Object[].class);
        verify(jdbcTemplate).update(contains("INSERT INTO wf_biz_biz_leave"), params.capture());
        assertThat(params.getValue()).contains("张三");
    }

    @Test
    void create_withPickerMissingId_rejected400() {
        when(formDefService.getBusinessColumnsByKey("biz_leave"))
                .thenReturn(List.of(pickerColumn("emp_id", "emp_profile"), hiddenTextColumn("emp_id_text")));
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());

        assertThatThrownBy(() -> bizDataService.create("biz_leave", Map.of("emp_id", "ghost")))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(400))
                .hasMessageContaining("引用的数据不存在");

        verify(jdbcTemplate, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void create_withPickerMultipleIds_joinsTextInOrder() {
        when(formDefService.getBusinessColumnsByKey("biz_leave"))
                .thenReturn(List.of(pickerColumn("emp_id", "emp_profile"), hiddenTextColumn("emp_id_text")));
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
                .thenReturn(
                        List.of(Map.of("id", "a", "name", "张三"), Map.of("id", "b", "name", "李四")),
                        List.of(Map.of(
                                "id", "row-1",
                                "tenant_id", TENANT_ID,
                                "emp_id", "a,b",
                                "emp_id_text", "张三,李四",
                                "version", 1,
                                "created_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)),
                                "updated_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)))));
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);

        BizDataVO vo = bizDataService.create("biz_leave", Map.of("emp_id", "a,b"));

        assertThat(vo.getData()).containsEntry("emp_id_text", "张三,李四");
    }

    @Test
    void update_withPickerField_recomputesText() {
        when(formDefService.getBusinessColumnsByKey("biz_leave"))
                .thenReturn(List.of(pickerColumn("emp_id", "emp_profile"), hiddenTextColumn("emp_id_text")));
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
                .thenReturn(
                        List.of(Map.of("id", "t1", "name", "张三")),   // update 前 findById existing
                        List.of(Map.of("id", "t1", "name", "张三")),   // resolvePickerValues 目标表
                        List.of(Map.of(
                                "id", "row-1",
                                "tenant_id", TENANT_ID,
                                "emp_id", "t1",
                                "emp_id_text", "张三",
                                "version", 2,
                                "created_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)),
                                "updated_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0))))); // 更新后 findById
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);

        BizDataVO vo = bizDataService.update("biz_leave", "row-1", Map.of("emp_id", "t1"), 1);

        assertThat(vo.getVersion()).isEqualTo(2);
        assertThat(vo.getData()).containsEntry("emp_id_text", "张三");
    }

    // ==================== resolve API ====================

    @Test
    void resolveDisplayTexts_batchReturnsMap() {
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("id", "a", "name", "张三"), Map.of("id", "b", "name", "李四")));

        Map<String, String> map = bizDataService.resolveDisplayTexts("emp_profile", List.of("a", "b"), "name");

        assertThat(map).containsEntry("a", "张三").containsEntry("b", "李四");
    }

    @Test
    void resolveDisplayTexts_missingIds_omitted() {
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("id", "a", "name", "张三")));

        Map<String, String> map = bizDataService.resolveDisplayTexts("emp_profile", List.of("a", "x"), "name");

        assertThat(map).containsEntry("a", "张三");
        assertThat(map).doesNotContainKey("x");
    }

    @Test
    void resolveByFormKey_defaultDisplayField_firstNonHiddenColumn() {
        // 列：emp_id（pickerConfig）隐藏列 emp_id_text + 普通列 name（第一个非 hidden）
        lenient().when(tableManager.tableExists("wf_biz_emp_profile")).thenReturn(true);
        when(formDefService.getBusinessColumnsByKey("emp_profile"))
                .thenReturn(List.of(
                        pickerColumn("emp_id", "x"),
                        hiddenTextColumn("emp_id_text"),
                        simpleColumn("name", "VARCHAR", 255)));
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("id", "a", "name", "张三")));

        Map<String, String> map = bizDataService.resolveByFormKey("emp_profile", List.of("a"), null);

        assertThat(map).containsEntry("a", "张三");
    }

    @Test
    void resolveDisplayTexts_invalidDisplayField_rejected400() {
        assertThatThrownBy(() -> bizDataService.resolveDisplayTexts("emp_profile", List.of("a"), "name; DROP"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(400));
    }

    private ColumnConfig simpleColumn(String key, String type, Integer length) {
        ColumnConfig c = new ColumnConfig();
        c.setKey(key);
        c.setColumnType(type);
        c.setLength(length);
        return c;
    }
}
