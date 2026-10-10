package com.workflow.engine.form.bizdata;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.engine.form.SerialNumberService;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.engine.form.column.DynamicTableManager;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.form.FormDefinitionService;
import com.workflow.engine.logicflow.service.FormLogicBindingService;
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
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 自动编号 × BizDataService.create 服务层集成点测试（Task 3-d）。
 * 验证钩子真实挂在 create 路径：提交值为空的 AutoNumber 字段在落库前被填充，
 * 生成值进入 INSERT 参数；钩子容错不影响创建主链路。
 */
@ExtendWith(MockitoExtension.class)
class BizDataServiceAutoNumberTest {

    private static final String TENANT_ID = "t1";
    private static final String FORM_KEY = "biz_order";
    private static final String TABLE = "wf_biz_biz_order";

    @Mock
    private JdbcTemplate jdbcTemplate;

    @Mock
    private DynamicTableManager tableManager;

    @Mock
    private FormDefinitionService formDefService;

    @Mock
    private TenantProvider tenantProvider;

    @Mock
    private FormLogicBindingService logicBindings;

    @Mock
    private FormDefinitionRepository formDefRepository;

    @Mock
    private SerialNumberService serialNumberService;

    private BizDataService bizDataService;

    @BeforeEach
    void setUp() {
        TenantContext.setTenantId(TENANT_ID);
        lenient().when(tenantProvider.getTenantId()).thenReturn(TENANT_ID);

        ColumnConfig name = new ColumnConfig();
        name.setKey("name");
        name.setColumnType("VARCHAR");
        name.setLength(255);
        name.setRequired(true);
        ColumnConfig orderNo = new ColumnConfig();
        orderNo.setKey("orderNo");
        orderNo.setColumnType("VARCHAR");
        orderNo.setLength(64);
        orderNo.setComponentType("AutoNumber");

        lenient().when(tableManager.tableExists(TABLE)).thenReturn(true);
        lenient().when(formDefService.getBusinessColumnsByKey(FORM_KEY))
                .thenReturn(List.of(name, orderNo));
        lenient().when(logicBindings.buildVars(any(), any(), any(),
                any(), any(), any(), any())).thenReturn(Map.of());

        AutoNumberHook hook = new AutoNumberHook(formDefRepository, serialNumberService, new ObjectMapper());
        bizDataService = new BizDataService(jdbcTemplate, tableManager, formDefService, tenantProvider,
                new ObjectMapper(), List.of(), List.of(), logicBindings, hook);
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    private void stubRowReads() {
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of(
                        "id", "row-1",
                        "tenant_id", TENANT_ID,
                        "name", "测试单",
                        "orderNo", "BN202506150001",
                        "version", 1,
                        "created_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)),
                        "updated_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)))));
    }

    private void stubPublishedSchema() {
        FormDefinition def = new FormDefinition();
        def.setKey(FORM_KEY);
        def.setSchema("""
                [{"type":"AutoNumber","field":"orderNo","title":"单号",
                  "props":{"prefix":"BN","dateFormat":"yyyyMMdd","resetPolicy":"day","seqDigits":4}}]
                """);
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                TENANT_ID, FORM_KEY, "PUBLISHED")).thenReturn(Optional.of(def));
    }

    @Test
    void create_emptyAutoNumberField_filledBeforeInsert() {
        stubPublishedSchema();
        when(serialNumberService.nextSerial(TENANT_ID, "biz_order.orderNo", "BN", "yyyyMMdd", "day", 4))
                .thenReturn("BN202506150001");
        stubRowReads();

        Map<String, Object> data = new HashMap<>();
        data.put("name", "测试单");

        bizDataService.create(FORM_KEY, data);

        // 生成值就地写回提交数据（后续 BEFORE_CREATE 调度与 INSERT 均可见）
        assertThat(data.get("orderNo")).isEqualTo("BN202506150001");
        verify(jdbcTemplate).update(contains("INSERT INTO " + TABLE), any(Object[].class));
    }

    @Test
    void create_serialGenerationFailure_doesNotBlockCreation() {
        stubPublishedSchema();
        when(serialNumberService.nextSerial(anyString(), anyString(), any(), any(), any(), any()))
                .thenThrow(new RuntimeException("serial db down"));
        stubRowReads();

        Map<String, Object> data = new HashMap<>();
        data.put("name", "测试单");

        assertThat(bizDataService.create(FORM_KEY, data).getId()).isEqualTo("row-1");
        assertThat(data).doesNotContainKey("orderNo");
        verify(jdbcTemplate).update(contains("INSERT INTO " + TABLE), any(Object[].class));
    }
}
