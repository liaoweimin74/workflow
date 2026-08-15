package com.workflow.engine.form.bizdata;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.FormDefinitionService;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.engine.form.column.DynamicTableManager;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.tenant.TenantContext;
import com.workflow.engine.tenant.TenantProvider;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
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
        return pickerColumn(key, sourceFormKey, null);
    }

    private ColumnConfig pickerColumn(String key, String sourceFormKey, Integer maxCount) {
        ColumnConfig c = new ColumnConfig();
        c.setKey(key);
        c.setColumnType("TEXT");
        String mc = maxCount == null ? "null" : String.valueOf(maxCount);
        c.setPickerConfig("{\"sourceFormKey\":\"" + sourceFormKey + "\",\"displayField\":\"name\",\"maxCount\":" + mc + "}");
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
                                "emp_id", "[\"t1\"]",
                                "emp_id_text", "[\"张三\"]",
                                "version", 1,
                                "created_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)),
                                "updated_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)))));
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);

        BizDataVO vo = bizDataService.create("biz_leave", Map.of("emp_id", "[\"t1\"]"));

        assertThat(vo.getData()).containsEntry("emp_id", "[\"t1\"]").containsEntry("emp_id_text", "[\"张三\"]");
        ArgumentCaptor<Object[]> params = ArgumentCaptor.forClass(Object[].class);
        verify(jdbcTemplate).update(contains("INSERT INTO wf_biz_biz_leave"), params.capture());
        assertThat(params.getValue()).contains("[\"张三\"]");
    }

    @Test
    void create_withPickerMissingId_rejected400() {
        when(formDefService.getBusinessColumnsByKey("biz_leave"))
                .thenReturn(List.of(pickerColumn("emp_id", "emp_profile"), hiddenTextColumn("emp_id_text")));
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());

        assertThatThrownBy(() -> bizDataService.create("biz_leave", Map.of("emp_id", "[\"ghost\"]")))
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
                                "emp_id", "[\"a\",\"b\"]",
                                "emp_id_text", "[\"张三\",\"李四\"]",
                                "version", 1,
                                "created_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)),
                                "updated_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)))));
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);

        BizDataVO vo = bizDataService.create("biz_leave", Map.of("emp_id", "[\"a\",\"b\"]"));

        assertThat(vo.getData()).containsEntry("emp_id_text", "[\"张三\",\"李四\"]");
    }

    @Test
    void create_withPickerOverMaxCount_rejected400() {
        // maxCount=1（单选语义）：传 2 个 id → 400（在 resolve 之前拦截）
        when(formDefService.getBusinessColumnsByKey("biz_leave"))
                .thenReturn(List.of(pickerColumn("emp_id", "emp_profile", 1), hiddenTextColumn("emp_id_text")));

        assertThatThrownBy(() -> bizDataService.create("biz_leave", Map.of("emp_id", "[\"a\",\"b\"]")))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(400))
                .hasMessageContaining("引用数量超出限制");

        verify(jdbcTemplate, never()).queryForList(contains("wf_biz_emp_profile"), any(Object[].class));
        verify(jdbcTemplate, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void create_withPickerInvalidJson_rejected400() {
        when(formDefService.getBusinessColumnsByKey("biz_leave"))
                .thenReturn(List.of(pickerColumn("emp_id", "emp_profile"), hiddenTextColumn("emp_id_text")));

        assertThatThrownBy(() -> bizDataService.create("biz_leave", Map.of("emp_id", "a,b")))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(400))
                .hasMessageContaining("引用值格式非法");
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
                                "emp_id", "[\"t1\"]",
                                "emp_id_text", "[\"张三\"]",
                                "version", 2,
                                "created_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)),
                                "updated_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0))))); // 更新后 findById
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);

        BizDataVO vo = bizDataService.update("biz_leave", "row-1", Map.of("emp_id", "[\"t1\"]"), 1);

        assertThat(vo.getVersion()).isEqualTo(2);
        assertThat(vo.getData()).containsEntry("emp_id_text", "[\"张三\"]");
    }

    // ==================== JSON 列（多选 checkbox/tree 多选/elTransfer/subForm） ====================

    private ColumnConfig jsonColumn(String key) {
        ColumnConfig c = new ColumnConfig();
        c.setKey(key);
        c.setColumnType("JSON");
        return c;
    }

    @Test
    void create_serializesJsonColumnList_toJsonString() {
        when(formDefService.getBusinessColumnsByKey("biz_leave"))
                .thenReturn(List.of(simpleColumn("name", "VARCHAR", 255), simpleColumn("dept", "VARCHAR", 64),
                        jsonColumn("tags")));
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of(
                        "id", "row-1",
                        "tenant_id", TENANT_ID,
                        "name", "张三",
                        "dept", "研发部",
                        "tags", "[\"a\",\"b\"]",
                        "version", 1,
                        "created_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)),
                        "updated_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)))));

        BizDataVO vo = bizDataService.create("biz_leave",
                Map.of("name", "张三", "dept", "研发部", "tags", List.of("a", "b")));

        ArgumentCaptor<Object[]> params = ArgumentCaptor.forClass(Object[].class);
        verify(jdbcTemplate).update(contains("INSERT INTO wf_biz_biz_leave"), params.capture());
        assertThat(params.getValue()).contains("[\"a\",\"b\"]");
        assertThat(vo.getData()).containsEntry("tags", List.of("a", "b"));
    }

    @Test
    void read_legacyNonJsonValue_returnsAsIs() {
        when(formDefService.getBusinessColumnsByKey("biz_leave"))
                .thenReturn(List.of(simpleColumn("name", "VARCHAR", 255), simpleColumn("dept", "VARCHAR", 64),
                        jsonColumn("tags")));
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of(
                        "id", "row-1",
                        "tenant_id", TENANT_ID,
                        "name", "张三",
                        "dept", "研发部",
                        "tags", "a,b",
                        "version", 1,
                        "created_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)),
                        "updated_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)))));

        BizDataVO vo = bizDataService.getById("biz_leave", "row-1");

        assertThat(vo.getData()).containsEntry("tags", "a,b");
    }

    @Test
    void create_serializesArrayValue_forNonJsonColumn() {
        // 级联选择器等值形态为数组、但列类型非 JSON（历史发布 VARCHAR 列）的字段：
        // 非字符串值必须序列化，否则被 MySQL 驱动按 Java 序列化写入（\xAC\xED 乱码）
        when(formDefService.getBusinessColumnsByKey("biz_leave"))
                .thenReturn(List.of(simpleColumn("name", "VARCHAR", 255), simpleColumn("region", "VARCHAR", 255)));
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of(
                        "id", "row-1",
                        "tenant_id", TENANT_ID,
                        "name", "张三",
                        "region", "[\"gd\",\"sz\"]",
                        "version", 1,
                        "created_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)),
                        "updated_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)))));

        BizDataVO vo = bizDataService.create("biz_leave",
                Map.of("name", "张三", "region", List.of("gd", "sz")));

        ArgumentCaptor<Object[]> params = ArgumentCaptor.forClass(Object[].class);
        verify(jdbcTemplate).update(contains("INSERT INTO wf_biz_biz_leave"), params.capture());
        assertThat(params.getValue()).contains("[\"gd\",\"sz\"]");
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

    // ==================== 引用统计（referenced-count） ====================

    @Test
    void countReferencedBy_统计各表单被dataPicker引用次数() {
        FormDefinition formA = businessForm("form_a", pickerCols("emp_profile"));
        FormDefinition formB = businessForm("form_b", pickerCols("emp_profile", "dept_profile"));
        FormDefinition formC = businessForm("form_c", "[]");
        when(formDefService.list(isNull(), isNull(), eq("BUSINESS"), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(formA, formB, formC)), new PageImpl<>(List.of()));

        Map<String, Map<String, Object>> result = bizDataService.countReferencedBy();

        assertThat(result).containsKey("emp_profile");
        assertThat(result.get("emp_profile").get("count")).isEqualTo(2);
        assertThat(result.get("emp_profile").get("referencedBy"))
                .asList().containsExactlyInAnyOrder("form_a", "form_b");
        assertThat(result.get("dept_profile").get("count")).isEqualTo(1);
        assertThat(result).doesNotContainKey("form_c");
    }

    // ==================== LookupPicker（单选显示文本）与 dataPicker 判别 ====================

    @Test
    void create_lookupPickerSingle_旧配置无pickerType_也不触发引用解析() {
        // 存量 LookupPicker 单选列：pickerConfig 无 pickerType、值=显示文本（"张三"），
        // 无 <key>_text 冗余列 → 不应按 data-picker 解析（否则把"张三"当 id 查引用报错）
        ColumnConfig lookup = new ColumnConfig();
        lookup.setKey("lookup");
        lookup.setColumnType("VARCHAR");
        lookup.setLength(255);
        lookup.setPickerConfig("{\"sourceFormKey\":\"emp_profile\",\"displayField\":\"name\",\"mode\":\"single\"}");
        when(formDefService.getBusinessColumnsByKey("biz_leave")).thenReturn(List.of(lookup));
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of(
                        "id", "row-1",
                        "tenant_id", TENANT_ID,
                        "lookup", "张三",
                        "version", 1,
                        "created_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)),
                        "updated_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)))));

        BizDataVO vo = bizDataService.create("biz_leave", Map.of("lookup", "张三"));

        assertThat(vo.getData()).containsEntry("lookup", "张三");
        assertThat(vo.getData()).doesNotContainKey("lookup_text");
        // 不触发对 emp_profile 的查询
        verify(jdbcTemplate, never()).queryForList(contains("wf_biz_emp_profile"), any(Object[].class));
    }

    @Test
    void create_dataPicker_有_text列_仍触发引用解析() {
        // dataPicker 列：pickerConfig 无 pickerType 但有 <key>_text 冗余列 → 仍按 data-picker 解析
        ColumnConfig ref = new ColumnConfig();
        ref.setKey("emp_ref");
        ref.setColumnType("TEXT");
        ref.setPickerConfig("{\"sourceFormKey\":\"emp_profile\",\"displayField\":\"name\"}");
        ColumnConfig refText = new ColumnConfig();
        refText.setKey("emp_ref_text");
        refText.setColumnType("TEXT");
        refText.setHidden(true);
        when(formDefService.getBusinessColumnsByKey("biz_leave")).thenReturn(List.of(ref, refText));
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
                .thenAnswer(inv -> {
                    String sql = (String) inv.getArgument(0);
                    if (sql.contains("wf_biz_emp_profile")) {
                        // resolveDisplayTexts 查 emp_profile
                        return List.of(Map.of("id", "u1", "name", "张三"));
                    }
                    // findById 回查本表
                    return List.of(Map.of(
                            "id", "row-1",
                            "tenant_id", TENANT_ID,
                            "emp_ref", "[\"u1\"]",
                            "emp_ref_text", "[\"张三\"]",
                            "version", 1,
                            "created_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)),
                            "updated_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0))));
                });

        BizDataVO vo = bizDataService.create("biz_leave", Map.of("emp_ref", "[\"u1\"]"));

        assertThat(vo.getData()).containsEntry("emp_ref_text", "[\"张三\"]");
        verify(jdbcTemplate).queryForList(contains("wf_biz_emp_profile"), any(Object[].class));
    }

    private FormDefinition businessForm(String key, String columnConfig) {
        FormDefinition f = new FormDefinition();
        f.setKey(key);
        f.setType("BUSINESS");
        f.setColumnConfig(columnConfig);
        return f;
    }

    /** 构造含 N 个 dataPicker 引用列的 column_config JSON（pickerConfig.sourceFormKey 依次为入参） */
    private String pickerCols(String... sourceFormKeys) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < sourceFormKeys.length; i++) {
            if (i > 0) {
                sb.append(",");
            }
            sb.append("{\"key\":\"ref_").append(i + 1)
                    .append("\",\"label\":\"引用\",\"columnType\":\"VARCHAR\",\"length\":64,")
                    .append("\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":false,")
                    .append("\"pickerConfig\":\"{\\\"sourceFormKey\\\":\\\"").append(sourceFormKeys[i])
                    .append("\\\",\\\"displayField\\\":\\\"name\\\"}\"}");
        }
        return sb.append("]").toString();
    }

    private ColumnConfig simpleColumn(String key, String type, Integer length) {
        ColumnConfig c = new ColumnConfig();
        c.setKey(key);
        c.setColumnType(type);
        c.setLength(length);
        return c;
    }

    // ==================== 子表读写 ====================

    private ColumnConfig subtableColumn(String key, List<ColumnConfig> subs, String subMode) {
        ColumnConfig c = new ColumnConfig();
        c.setKey(key);
        c.setSubColumns(subs);
        c.setSubMode(subMode);
        return c;
    }

    private Map<String, Object> mainRow() {
        return Map.of(
                "id", "row-1",
                "tenant_id", TENANT_ID,
                "name", "报销单",
                "version", 1,
                "created_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)),
                "updated_at", Timestamp.valueOf(LocalDateTime.of(2026, 8, 12, 10, 0)));
    }

    @Test
    void create_withSubRows_insertsMainAndSub() {
        ColumnConfig name = simpleColumn("name", "VARCHAR", 255);
        ColumnConfig itemName = simpleColumn("name", "VARCHAR", 255);
        ColumnConfig itemAmount = simpleColumn("amount", "DECIMAL", 18);
        itemAmount.setScale(2);
        ColumnConfig items = subtableColumn("items", List.of(itemName, itemAmount), "embedded");
        when(formDefService.getBusinessColumnsByKey("biz_leave")).thenReturn(List.of(name, items));
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(mainRow()));

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("name", "报销单");
        data.put("items", List.of(
                Map.of("name", "差旅", "amount", 1200),
                Map.of("name", "办公", "amount", 450)));
        BizDataVO vo = bizDataService.create("biz_leave", data);

        assertThat(vo.getId()).isEqualTo("row-1");
        // 主表 INSERT 1 次 + 子表 INSERT 2 次
        verify(jdbcTemplate).update(contains("INSERT INTO wf_biz_biz_leave "), any(Object[].class));
        ArgumentCaptor<Object[]> captor = ArgumentCaptor.forClass(Object[].class);
        verify(jdbcTemplate, times(2)).update(contains("INSERT INTO wf_biz_biz_leave_items"), captor.capture());
        List<Object[]> all = captor.getAllValues();
        // params: [rowId, bizId, tenantId, sortNo, name, amount]
        assertThat(all.get(0)).contains("t1", 0, "差旅", 1200);
        assertThat(all.get(1)).contains("t1", 1, "办公", 450);
        // 两行同属一个主行 biz_id
        assertThat(all.get(0)[1]).isEqualTo(all.get(1)[1]);
    }

    @Test
    void create_subRowsOverLimit_rejected400() {
        ColumnConfig name = simpleColumn("name", "VARCHAR", 255);
        ColumnConfig items = subtableColumn("items", List.of(simpleColumn("name", "VARCHAR", 255)), "embedded");
        when(formDefService.getBusinessColumnsByKey("biz_leave")).thenReturn(List.of(name, items));

        List<Map<String, Object>> tooMany = new ArrayList<>();
        for (int i = 0; i < 101; i++) {
            tooMany.add(Map.of("name", "行" + i));
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("name", "报销单");
        data.put("items", tooMany);

        assertThatThrownBy(() -> bizDataService.create("biz_leave", data))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getCode()).isEqualTo(400))
                .hasMessageContaining("超限");
    }

    @Test
    void update_diff_addsRemovesUpdates() {
        ColumnConfig name = simpleColumn("name", "VARCHAR", 255);
        ColumnConfig items = subtableColumn("items", List.of(simpleColumn("name", "VARCHAR", 255)), "embedded");
        when(formDefService.getBusinessColumnsByKey("biz_leave")).thenReturn(List.of(name, items));
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
                .thenAnswer(inv -> {
                    String sql = (String) inv.getArgument(0);
                    if (sql.contains("wf_biz_biz_leave_items")) {
                        return List.of(
                                Map.of("id", "sub-1", "biz_id", "row-1", "tenant_id", TENANT_ID, "name", "差旅", "sort_no", 0, "version", 1),
                                Map.of("id", "sub-2", "biz_id", "row-1", "tenant_id", TENANT_ID, "name", "办公", "sort_no", 1, "version", 1));
                    }
                    return List.of(mainRow());
                });
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("name", "报销单");
        data.put("items", List.of(
                Map.of("id", "sub-1", "name", "差旅更新"),
                Map.of("name", "新增行")));
        bizDataService.update("biz_leave", "row-1", data, 1);

        verify(jdbcTemplate).update(contains("UPDATE wf_biz_biz_leave_items SET"), any(Object[].class));
        verify(jdbcTemplate).update(contains("INSERT INTO wf_biz_biz_leave_items"), any(Object[].class));
        verify(jdbcTemplate).update(contains("DELETE FROM wf_biz_biz_leave_items"), any(Object[].class));
    }

    @Test
    void update_withoutSubField_keepsRows() {
        ColumnConfig name = simpleColumn("name", "VARCHAR", 255);
        ColumnConfig items = subtableColumn("items", List.of(simpleColumn("name", "VARCHAR", 255)), "embedded");
        when(formDefService.getBusinessColumnsByKey("biz_leave")).thenReturn(List.of(name, items));
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(mainRow()));
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);

        bizDataService.update("biz_leave", "row-1", Map.of("name", "报销单改"), 1);

        // 主表 UPDATE 有，子表无任何写操作
        verify(jdbcTemplate).update(contains("UPDATE wf_biz_biz_leave "), any(Object[].class));
        verify(jdbcTemplate, never()).update(contains("wf_biz_biz_leave_items"), any(Object[].class));
    }

    @Test
    void delete_cascadesSubRows() {
        ColumnConfig name = simpleColumn("name", "VARCHAR", 255);
        ColumnConfig items = subtableColumn("items", List.of(simpleColumn("name", "VARCHAR", 255)), "embedded");
        when(formDefService.getBusinessColumnsByKey("biz_leave")).thenReturn(List.of(name, items));
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(mainRow()));
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);

        bizDataService.delete("biz_leave", "row-1");

        verify(jdbcTemplate).update(contains("DELETE FROM wf_biz_biz_leave_items"), any(Object[].class));
        verify(jdbcTemplate).update(contains("DELETE FROM wf_biz_biz_leave "), any(Object[].class));
    }

    @Test
    void getById_embedded_attachesSubRows() {
        ColumnConfig name = simpleColumn("name", "VARCHAR", 255);
        ColumnConfig items = subtableColumn("items", List.of(simpleColumn("name", "VARCHAR", 255)), "embedded");
        when(formDefService.getBusinessColumnsByKey("biz_leave")).thenReturn(List.of(name, items));
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
                .thenAnswer(inv -> {
                    String sql = (String) inv.getArgument(0);
                    if (sql.contains("wf_biz_biz_leave_items")) {
                        return List.of(Map.of("id", "sub-1", "biz_id", "row-1", "tenant_id", TENANT_ID,
                                "name", "差旅", "sort_no", 0));
                    }
                    return List.of(mainRow());
                });

        BizDataVO vo = bizDataService.getById("biz_leave", "row-1");

        List<?> itemsData = (List<?>) vo.getData().get("items");
        assertThat(itemsData).hasSize(1);
        @SuppressWarnings("unchecked")
        Map<String, Object> first = (Map<String, Object>) itemsData.get(0);
        assertThat(first).containsEntry("id", "sub-1").containsEntry("name", "差旅");
    }

    @Test
    void getById_dedicated_doesNotAttachSubRows() {
        ColumnConfig name = simpleColumn("name", "VARCHAR", 255);
        ColumnConfig items = subtableColumn("items", List.of(simpleColumn("name", "VARCHAR", 255)), "dedicated");
        when(formDefService.getBusinessColumnsByKey("biz_leave")).thenReturn(List.of(name, items));
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(mainRow()));

        BizDataVO vo = bizDataService.getById("biz_leave", "row-1");

        assertThat(vo.getData()).doesNotContainKey("items");
        verify(jdbcTemplate, never()).queryForList(contains("wf_biz_biz_leave_items"), any(Object[].class));
    }
}
