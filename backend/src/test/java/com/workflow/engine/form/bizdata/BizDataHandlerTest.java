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
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * BizDataHandler 钩子单元测试：按 formKey 注册的定制逻辑在 CRUD 各环节被正确调用。
 */
@ExtendWith(MockitoExtension.class)
class BizDataHandlerTest {

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
    private static final String TABLE = "wf_biz_leave_bill";

    /** 记录调用的测试 handler */
    private static class RecordingHandler implements BizDataHandler {
        final String formKey;
        final AtomicInteger beforeCreate = new AtomicInteger();
        final AtomicInteger afterCreate = new AtomicInteger();
        final AtomicInteger beforeUpdate = new AtomicInteger();
        final AtomicInteger beforeDelete = new AtomicInteger();
        boolean rejectOnCreate;

        RecordingHandler(String formKey) {
            this.formKey = formKey;
        }

        @Override
        public String getFormKey() {
            return formKey;
        }

        @Override
        public void beforeCreate(Map<String, Object> data) {
            beforeCreate.incrementAndGet();
            if (rejectOnCreate) {
                throw new BusinessException(400, "保存前校验失败");
            }
        }

        @Override
        public void afterCreate(BizDataVO vo) {
            afterCreate.incrementAndGet();
        }

        @Override
        public void beforeUpdate(Map<String, Object> data, BizDataVO existing) {
            beforeUpdate.incrementAndGet();
        }

        @Override
        public void beforeDelete(BizDataVO existing) {
            beforeDelete.incrementAndGet();
        }
    }

    private RecordingHandler handler;

    @BeforeEach
    void setUp() {
        TenantContext.setTenantId(TENANT_ID);
        lenient().when(tenantProvider.getTenantId()).thenReturn(TENANT_ID);
        handler = new RecordingHandler("leave_bill");
        bizDataService = new BizDataService(jdbcTemplate, tableManager, formDefService, tenantProvider,
                new ObjectMapper(), List.of(handler));

        ColumnConfig days = new ColumnConfig();
        days.setKey("days");
        days.setColumnType("INT");
        ColumnConfig reason = new ColumnConfig();
        reason.setKey("reason");
        reason.setColumnType("VARCHAR");
        reason.setLength(255);
        lenient().when(tableManager.tableExists(TABLE)).thenReturn(true);
        lenient().when(formDefService.getBusinessColumnsByKey("leave_bill"))
                .thenReturn(List.of(days, reason));
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    private void stubInsertReturn() {
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of(
                        "id", "row-1",
                        "tenant_id", TENANT_ID,
                        "days", 3,
                        "version", 1,
                        "created_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)),
                        "updated_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)))));
    }

    @Test
    void create_invokesBeforeAndAfterCreate() {
        stubInsertReturn();

        bizDataService.create("leave_bill", Map.of("days", 3));

        assertThat(handler.beforeCreate.get()).isEqualTo(1);
        assertThat(handler.afterCreate.get()).isEqualTo(1);
    }

    @Test
    void create_beforeCreateThrows_rejectsAndSkipsInsert() {
        handler.rejectOnCreate = true;

        assertThatThrownBy(() -> bizDataService.create("leave_bill", Map.of("days", 3)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("保存前校验失败");

        verify(jdbcTemplate, never()).update(anyString(), any(Object[].class));
        assertThat(handler.afterCreate.get()).isZero();
    }

    @Test
    void update_invokesBeforeUpdate_withExistingRow() {
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of(
                        "id", "row-1",
                        "tenant_id", TENANT_ID,
                        "days", 3,
                        "version", 2,
                        "created_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)),
                        "updated_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)))));

        bizDataService.update("leave_bill", "row-1", Map.of("days", 5), 1);

        assertThat(handler.beforeUpdate.get()).isEqualTo(1);
    }

    @Test
    void delete_invokesBeforeDelete() {
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of(
                        "id", "row-1",
                        "tenant_id", TENANT_ID,
                        "days", 3,
                        "version", 1,
                        "created_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)),
                        "updated_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)))));
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);

        bizDataService.delete("leave_bill", "row-1");

        assertThat(handler.beforeDelete.get()).isEqualTo(1);
    }

    @Test
    void unrelatedFormKey_handlerNotInvoked() {
        // 另一个表单（无对应 handler）的 create 不触发 leave_bill 的 handler
        String otherTable = "wf_biz_biz_form";
        lenient().when(tableManager.tableExists(otherTable)).thenReturn(true);
        lenient().when(formDefService.getBusinessColumnsByKey("biz_form"))
                .thenReturn(List.of());
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("id", "row-x", "tenant_id", TENANT_ID, "version", 1)));

        bizDataService.create("biz_form", Map.of());

        assertThat(handler.beforeCreate.get()).isZero();
        assertThat(handler.afterCreate.get()).isZero();
    }

    @Test
    void update_beforeUpdateThrows_rejectsUpdate() {
        BizDataHandler rejecting = new BizDataHandler() {
            @Override
            public String getFormKey() { return "leave_bill"; }

            @Override
            public void beforeUpdate(Map<String, Object> data, BizDataVO existing) {
                throw new BusinessException(400, "更新被拒绝");
            }
        };
        bizDataService = new BizDataService(jdbcTemplate, tableManager, formDefService, tenantProvider,
                new ObjectMapper(), List.of(handler, rejecting));
        // 两个 handler 都注册到 leave_bill：handler 先执行（通过），rejecting 后执行（拒绝）
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("id", "row-1", "tenant_id", TENANT_ID, "days", 3, "version", 2)));

        assertThatThrownBy(() -> bizDataService.update("leave_bill", "row-1", Map.of("days", 5), 1))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("更新被拒绝");

        verify(jdbcTemplate, never()).update(anyString(), any(Object[].class));
    }

    // ==================== 覆盖声明（override declaration） ====================

    @Test
    void handlerOverridingQuery_takesOverQuery() {
        BizDataHandler overriding = mock(BizDataHandler.class);
        when(overriding.getFormKey()).thenReturn("emp_profile");
        when(overriding.overridesQuery()).thenReturn(true);
        BizDataPageVO expected = new BizDataPageVO(List.of(), 0L, 1, 20);
        when(overriding.query(any())).thenReturn(expected);
        bizDataService = new BizDataService(jdbcTemplate, tableManager, formDefService, tenantProvider,
                new ObjectMapper(), List.of(overriding));

        BizDataPageVO result = bizDataService.query("emp_profile", new BizDataQueryRequest());

        assertThat(result).isSameAs(expected);
        verify(overriding).query(any());
        // 覆盖接管时不做通用实现的表上下文加载
        verify(tableManager, never()).tableExists(anyString());
    }

    @Test
    void handlerOverridingCreate_takesOverCreate() {
        BizDataHandler overriding = mock(BizDataHandler.class);
        when(overriding.getFormKey()).thenReturn("emp_profile");
        when(overriding.overridesCreate()).thenReturn(true);
        BizDataVO expected = new BizDataVO("e1", Map.of("name", "张三"), 1, null, null);
        when(overriding.create(any())).thenReturn(expected);
        bizDataService = new BizDataService(jdbcTemplate, tableManager, formDefService, tenantProvider,
                new ObjectMapper(), List.of(overriding));

        BizDataVO result = bizDataService.create("emp_profile", Map.of("name", "张三"));

        assertThat(result).isSameAs(expected);
        verify(overriding).create(any());
        verify(jdbcTemplate, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void handlerOverridingUpdate_takesOverUpdate_skipsDecorators() {
        BizDataHandler overriding = mock(BizDataHandler.class);
        when(overriding.getFormKey()).thenReturn("leave_bill");
        when(overriding.overridesUpdate()).thenReturn(true);
        BizDataVO expected = new BizDataVO("row-1", Map.of("days", 5), 2, null, null);
        when(overriding.update(anyString(), any(), any())).thenReturn(expected);
        bizDataService = new BizDataService(jdbcTemplate, tableManager, formDefService, tenantProvider,
                new ObjectMapper(), List.of(handler, overriding));

        BizDataVO result = bizDataService.update("leave_bill", "row-1", Map.of("days", 5), 1);

        assertThat(result).isSameAs(expected);
        verify(overriding).update(eq("row-1"), any(), eq(1));
        // 覆盖接管时装饰钩子链不执行
        assertThat(handler.beforeUpdate.get()).isZero();
        verify(jdbcTemplate, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void handlerOverridingDelete_takesOverDelete() {
        BizDataHandler overriding = mock(BizDataHandler.class);
        when(overriding.getFormKey()).thenReturn("leave_bill");
        when(overriding.overridesDelete()).thenReturn(true);
        bizDataService = new BizDataService(jdbcTemplate, tableManager, formDefService, tenantProvider,
                new ObjectMapper(), List.of(handler, overriding));

        bizDataService.delete("leave_bill", "row-1");

        verify(overriding).delete("row-1");
        // 覆盖接管时装饰钩子链不执行
        assertThat(handler.beforeDelete.get()).isZero();
        verify(jdbcTemplate, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void duplicateOverrideDeclaration_failsStartup() {
        BizDataHandler a = mock(BizDataHandler.class);
        when(a.getFormKey()).thenReturn("emp_profile");
        when(a.overridesQuery()).thenReturn(true);
        BizDataHandler b = mock(BizDataHandler.class);
        when(b.getFormKey()).thenReturn("emp_profile");
        when(b.overridesQuery()).thenReturn(true);

        assertThatThrownBy(() -> new BizDataService(jdbcTemplate, tableManager, formDefService, tenantProvider,
                new ObjectMapper(), List.of(a, b)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("duplicate override declaration: emp_profile.query");
    }

    @Test
    void overridingQueryOnly_updateStillGeneric() {
        BizDataHandler overriding = mock(BizDataHandler.class);
        when(overriding.getFormKey()).thenReturn("leave_bill");
        when(overriding.overridesQuery()).thenReturn(true);
        BizDataPageVO expected = new BizDataPageVO(List.of(), 0L, 1, 20);
        when(overriding.query(any())).thenReturn(expected);
        bizDataService = new BizDataService(jdbcTemplate, tableManager, formDefService, tenantProvider,
                new ObjectMapper(), List.of(handler, overriding));

        // update 未声明覆盖 → 继续走通用实现
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("id", "row-1", "tenant_id", TENANT_ID, "days", 3, "version", 2)));

        bizDataService.update("leave_bill", "row-1", Map.of("days", 5), 1);

        assertThat(handler.beforeUpdate.get()).isEqualTo(1);
        verify(overriding, never()).update(anyString(), any(), any());
        // 同 service 的 query 仍被覆盖接管
        assertThat(bizDataService.query("leave_bill", new BizDataQueryRequest())).isSameAs(expected);
    }
}
