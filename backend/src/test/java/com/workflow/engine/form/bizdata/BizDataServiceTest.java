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
        bizDataService = new BizDataService(jdbcTemplate, tableManager, formDefService, tenantProvider, new ObjectMapper());

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
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(0);
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
        BizDataPageVO page = bizDataService.query("biz_leave", req);

        assertThat(page.getTotal()).isEqualTo(1);
        assertThat(page.getRecords()).hasSize(1);
        assertThat(page.getRecords().get(0).getData()).containsEntry("name", "张三");
    }

    @Test
    void delete_success_removesRow() {
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);

        bizDataService.delete("biz_leave", "row-1");

        verify(jdbcTemplate).update(contains("DELETE FROM wf_biz_biz_leave"), any(Object[].class));
    }

    @Test
    void delete_crossTenant_returns404() {
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(0);

        assertThatThrownBy(() -> bizDataService.delete("biz_leave", "row-other-tenant"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(404));
    }
}
