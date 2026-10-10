package com.workflow.engine.form.bizdata;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.engine.form.SerialNumberService;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * AutoNumberHook 单元测试（Task 3-d）。
 * 覆盖：column_config 一级识别 / schema 二级兜底（含嵌套遍历）/ props 提取与默认值 /
 * 已有值幂等不覆盖 / 取号失败不阻断 / 表单缺失降级。
 */
@ExtendWith(MockitoExtension.class)
class AutoNumberHookTest {

    private static final String TENANT_ID = "t1";

    @Mock
    private FormDefinitionRepository formDefRepository;

    @Mock
    private SerialNumberService serialNumberService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private AutoNumberHook hook;

    @BeforeEach
    void setUp() {
        hook = new AutoNumberHook(formDefRepository, serialNumberService, objectMapper);
    }

    // ==================== 工具 ====================

    private static ColumnConfig column(String key, String componentType) {
        ColumnConfig c = new ColumnConfig();
        c.setKey(key);
        c.setColumnType("VARCHAR");
        c.setLength(255);
        if (componentType != null) {
            c.setComponentType(componentType);
        }
        return c;
    }

    private static BizDataContext ctx(String formKey, List<ColumnConfig> columns) {
        List<String> keys = columns.stream().map(ColumnConfig::getKey).toList();
        return new BizDataContext("wf_biz_" + formKey, formKey, columns, keys, Map.of());
    }

    private void stubPublishedSchema(String formKey, String schema) {
        FormDefinition def = new FormDefinition();
        def.setKey(formKey);
        def.setSchema(schema);
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                TENANT_ID, formKey, "PUBLISHED")).thenReturn(Optional.of(def));
    }

    // ==================== 一级识别：column_config ====================

    @Test
    void fill_columnConfigTier_generatesAndPutsValue() {
        stubPublishedSchema("formA", """
                [{"type":"AutoNumber","field":"orderNo","title":"编号",
                  "props":{"prefix":"PO","dateFormat":"yyyy-MM-dd","resetPolicy":"month","seqDigits":6}}]
                """);
        when(serialNumberService.nextSerial(TENANT_ID, "formA.orderNo", "PO", "yyyy-MM-dd", "month", 6))
                .thenReturn("PO2025-06-000042");

        Map<String, Object> data = new HashMap<>();
        data.put("name", "张三");
        hook.fill("formA", TENANT_ID, ctx("formA", List.of(
                column("name", "input"), column("orderNo", "AutoNumber"))), data);

        assertThat(data.get("orderNo")).isEqualTo("PO2025-06-000042");
        assertThat(data.get("name")).isEqualTo("张三");
    }

    @Test
    void fill_existingValue_notOverwritten() {
        Map<String, Object> data = new HashMap<>();
        data.put("orderNo", "USER-SET-1");
        hook.fill("formA", TENANT_ID, ctx("formA", List.of(
                column("orderNo", "AutoNumber"))), data);

        assertThat(data.get("orderNo")).isEqualTo("USER-SET-1");
        verifyNoInteractions(serialNumberService);
    }

    @Test
    void fill_blankValue_treatedAsEmpty_andFilled() {
        stubPublishedSchema("formA", "[]");
        when(serialNumberService.nextSerial(eq(TENANT_ID), eq("formA.orderNo"),
                any(), any(), any(), any())).thenReturn("BN202506150001");

        Map<String, Object> data = new HashMap<>();
        data.put("orderNo", "   ");
        hook.fill("formA", TENANT_ID, ctx("formA", List.of(
                column("orderNo", "AutoNumber"))), data);

        assertThat(data.get("orderNo")).isEqualTo("BN202506150001");
    }

    @Test
    void fill_noAutoNumberInColumnConfig_noGeneration() {
        // 一级未命中 → 必查 schema 兜底（空返回即空 map）→ 两级均无 AutoNumber → no-op
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                TENANT_ID, "formA", "PUBLISHED")).thenReturn(Optional.empty());

        Map<String, Object> data = new HashMap<>();
        data.put("name", "x");
        hook.fill("formA", TENANT_ID, ctx("formA", List.of(
                column("name", "input"), column("memo", "textarea"))), data);

        verifyNoInteractions(serialNumberService);
        assertThat(data).containsEntry("name", "x");
    }

    @Test
    void fill_generationFailure_skipsFieldWithoutBlocking() {
        stubPublishedSchema("formA", "[]");
        when(serialNumberService.nextSerial(anyString(), anyString(), any(), any(), any(), any()))
                .thenThrow(new RuntimeException("db down"));

        Map<String, Object> data = new HashMap<>();
        data.put("name", "x");
        assertThatCode(() -> hook.fill("formA", TENANT_ID, ctx("formA", List.of(
                column("name", "input"), column("orderNo", "AutoNumber"))), data))
                .doesNotThrowAnyException();

        assertThat(data).doesNotContainKey("orderNo");
        assertThat(data.get("name")).isEqualTo("x");
    }

    // ==================== 二级识别：schema 兜底 ====================

    @Test
    void fill_schemaFallback_whenColumnConfigLacksComponentType() {
        // 存量发布表单 column_config 未记录 componentType 的场景：从 schema 兜底识别
        stubPublishedSchema("formB", """
                [{"type":"AutoNumber","field":"orderNo","title":"编号",
                  "props":{"prefix":"SO","dateFormat":"yyyyMMdd","resetPolicy":"year","seqDigits":5}}]
                """);
        when(serialNumberService.nextSerial(TENANT_ID, "formB.orderNo", "SO", "yyyyMMdd", "year", 5))
                .thenReturn("SO202500001");

        Map<String, Object> data = new HashMap<>();
        data.put("name", "x");
        hook.fill("formB", TENANT_ID, ctx("formB", List.of(
                column("name", "input"), column("orderNo", null))), data);

        assertThat(data.get("orderNo")).isEqualTo("SO202500001");
    }

    @Test
    void fill_schemaFallback_traversesNestedChildren() {
        stubPublishedSchema("formC", """
                [{"type":"fcRow","children":[
                    {"type":"AutoNumber","field":"no2","title":"编号","props":{"prefix":"S"}}
                ]}]
                """);
        when(serialNumberService.nextSerial(TENANT_ID, "formC.no2", "S", null, null, null))
                .thenReturn("S001");

        Map<String, Object> data = new HashMap<>();
        data.put("name", "x");
        hook.fill("formC", TENANT_ID, ctx("formC", List.of(column("name", "input"))), data);

        assertThat(data.get("no2")).isEqualTo("S001");
    }

    @Test
    void fill_schemaAutoNumber_missingProps_usesDefaults() {
        stubPublishedSchema("formD", """
                [{"type":"AutoNumber","field":"orderNo","title":"编号"}]
                """);
        when(serialNumberService.nextSerial(TENANT_ID, "formD.orderNo", null, null, null, null))
                .thenReturn("BN202506150001");

        Map<String, Object> data = new HashMap<>();
        data.put("name", "x");
        hook.fill("formD", TENANT_ID, ctx("formD", List.of(column("orderNo", null), column("name", "input"))), data);

        assertThat(data.get("orderNo")).isEqualTo("BN202506150001");
    }

    @Test
    void fill_neitherTierHasAutoNumber_noopWithoutSerialCall() {
        stubPublishedSchema("formE", """
                [{"type":"input","field":"name"}]
                """);
        Map<String, Object> data = new HashMap<>();
        data.put("name", "x");
        hook.fill("formE", TENANT_ID, ctx("formE", List.of(column("name", "input"))), data);

        verifyNoInteractions(serialNumberService);
        assertThat(data).containsEntry("name", "x");
    }

    // ==================== 降级与容错 ====================

    @Test
    void fill_publishedFormMissing_columnConfigTierStillFillsWithDefaultProps() {
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                TENANT_ID, "formA", "PUBLISHED")).thenReturn(Optional.empty());
        when(serialNumberService.nextSerial(TENANT_ID, "formA.orderNo", null, null, null, null))
                .thenReturn("BN202506150001");

        Map<String, Object> data = new HashMap<>();
        data.put("name", "x");
        hook.fill("formA", TENANT_ID, ctx("formA", List.of(column("orderNo", "AutoNumber"), column("name", "input"))), data);

        assertThat(data.get("orderNo")).isEqualTo("BN202506150001");
    }

    @Test
    void fill_schemaFetchThrows_degradesToDefaultProps_columnConfigTier() {
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                TENANT_ID, "formA", "PUBLISHED")).thenThrow(new RuntimeException("db down"));
        when(serialNumberService.nextSerial(TENANT_ID, "formA.orderNo", null, null, null, null))
                .thenReturn("BN202506150001");

        Map<String, Object> data = new HashMap<>();
        data.put("name", "x");
        assertThatCode(() -> hook.fill("formA", TENANT_ID, ctx("formA", List.of(
                column("orderNo", "AutoNumber"), column("name", "input"))), data)).doesNotThrowAnyException();

        assertThat(data.get("orderNo")).isEqualTo("BN202506150001");
    }

    @Test
    void fill_nullDataAndCtx_noop() {
        assertThatCode(() -> {
            hook.fill("formA", TENANT_ID, ctx("formA", List.of(column("orderNo", "AutoNumber"))), null);
            hook.fill("formA", TENANT_ID, null, new HashMap<>(Map.of("orderNo", "")));
        }).doesNotThrowAnyException();

        verify(serialNumberService, never()).nextSerial(anyString(), anyString(),
                any(), any(), any(), anyInt());
    }
}
