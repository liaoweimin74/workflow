package com.workflow.engine.datasource;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.engine.form.column.FormSchemaColumnExtractor;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.tenant.TenantContext;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.system.domain.vo.UserVO;
import com.workflow.system.service.UserService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.engine.runtime.ProcessInstanceQuery;
import org.flowable.task.api.Task;
import org.flowable.task.api.TaskQuery;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * WorkflowFormDataQueryService 单元测试：
 * 覆盖行组装（系统列 + dataJson 展开）、旧版本字段兼容、filter 白名单校验、
 * getById 与 404、草稿行排除 SQL 条件、columnsFor 组合。
 * 行结构：{id, data_json, process_instance_id, h.START_TIME_, h.START_USER_ID_}。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class WorkflowFormDataQueryServiceTest {

    private static final String COLUMN_CONFIG =
            "[{\"key\":\"reason\",\"label\":\"事由\",\"columnType\":\"VARCHAR\",\"length\":255},"
                    + "{\"key\":\"days\",\"label\":\"天数\",\"columnType\":\"INT\"}]";

    @Mock private EntityManager em;
    @Mock private FormDefinitionRepository formDefRepository;
    @Mock private RuntimeService runtimeService;
    @Mock private TaskService taskService;
    @Mock private UserService userService;

    private Query rowsQuery;
    private Query countQuery;
    private final List<String> capturedSql = new ArrayList<>();
    private WorkflowFormDataQueryService service;

    @BeforeEach
    void setUp() {
        TenantContext.setTenantId("tenant-1");
        rowsQuery = mock(Query.class);
        countQuery = mock(Query.class);
        // 分页/明细 SQL 含 LIMIT 路由到 rowsQuery；COUNT SQL 路由到 countQuery
        when(em.createNativeQuery(anyString())).thenAnswer(inv -> {
            String sql = inv.getArgument(0);
            capturedSql.add(sql);
            return sql.toUpperCase().contains("LIMIT") ? rowsQuery : countQuery;
        });
        when(rowsQuery.setParameter(anyString(), any())).thenReturn(rowsQuery);
        when(countQuery.setParameter(anyString(), any())).thenReturn(countQuery);

        FormDefinition published = def("fd-2", 2, "PUBLISHED", COLUMN_CONFIG);
        // WORKFLOW 类型始终从 schema 解析，需要设置 schema 字段
        published.setSchema("{\"rule\":[{\"field\":\"reason\",\"title\":\"事由\",\"type\":\"input\"},"
                + "{\"field\":\"days\",\"title\":\"天数\",\"type\":\"inputNumber\"}]"
                + ",\"option\":{}}");
        FormDefinition v1 = def("fd-1", 1, "ARCHIVED",
                "[{\"key\":\"reason\",\"label\":\"事由\"},{\"key\":\"legacyField\",\"label\":\"旧列\"}]");
        v1.setSchema("{\"rule\":[{\"field\":\"reason\",\"title\":\"事由\",\"type\":\"input\"},"
                + "{\"field\":\"legacyField\",\"title\":\"旧列\",\"type\":\"input\"}]"
                + ",\"option\":{}}");
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                "tenant-1", "leave", "PUBLISHED")).thenReturn(Optional.of(published));
        when(formDefRepository.findByTenantIdAndKeyOrderByVersionDesc("tenant-1", "leave"))
                .thenReturn(List.of(published, v1));

        // Flowable：pi-1 运行中未挂起；当前节点"部门审批"
        ProcessInstance running = mock(ProcessInstance.class);
        when(running.getId()).thenReturn("pi-1");
        when(running.isSuspended()).thenReturn(false);
        ProcessInstanceQuery rtq = mock(ProcessInstanceQuery.class);
        when(runtimeService.createProcessInstanceQuery()).thenReturn(rtq);
        when(rtq.processInstanceTenantId(anyString())).thenReturn(rtq);
        when(rtq.processInstanceIds(anySet())).thenReturn(rtq);
        when(rtq.list()).thenReturn(List.of(running));

        Task task = mock(Task.class);
        when(task.getName()).thenReturn("部门审批");
        when(task.getProcessInstanceId()).thenReturn("pi-1");
        TaskQuery tq = mock(TaskQuery.class);
        when(taskService.createTaskQuery()).thenReturn(tq);
        // 参照 WorkflowTaskService 既有模式：逐实例查询当前活动节点
        when(tq.processInstanceId(anyString())).thenReturn(tq);
        when(tq.active()).thenReturn(tq);
        when(tq.list()).thenReturn(List.of(task));

        UserVO user = mock(UserVO.class);
        when(user.id()).thenReturn(100L);
        when(user.nickname()).thenReturn("张三");
        when(userService.findByIds(anyList())).thenReturn(List.of(user));

        service = new WorkflowFormDataQueryService(em, formDefRepository,
                new FormSchemaColumnExtractor(new ObjectMapper()),
                runtimeService, taskService, userService,
                new ObjectMapper(), new TenantProvider());
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    private FormDefinition def(String id, int version, String status, String columnConfig) {
        FormDefinition f = new FormDefinition();
        f.setId(id);
        f.setVersion(version);
        f.setStatus(status);
        f.setType("WORKFLOW");
        f.setColumnConfig(columnConfig);
        return f;
    }

    /** 行结构：id, data_json, process_instance_id, START_TIME_, START_USER_ID_ */
    private Object[] row(String dataJson) {
        return new Object[]{"row-1", dataJson, "pi-1",
                java.sql.Timestamp.valueOf("2026-01-15 10:30:00"), "100"};
    }

    private BizDataQueryRequest req() {
        BizDataQueryRequest r = new BizDataQueryRequest();
        r.setPage(0);
        r.setSize(20);
        return r;
    }

    // ==================== 场景 1：每实例一行，系统列 + dataJson 展开 ====================

    @Test
    void query_assemblesSystemAndBusinessColumns() {
        when(rowsQuery.getResultList())
                .thenReturn(Collections.singletonList(row("{\"reason\":\"请假\",\"days\":3}")));
        when(countQuery.getSingleResult()).thenReturn(2L);

        BizDataPageVO page = service.query("leave", req());

        assertEquals(2L, page.getTotal());
        assertEquals(1, page.getRecords().size());
        assertEquals(0, page.getPage());
        assertEquals(20, page.getSize());

        BizDataVO vo = page.getRecords().get(0);
        assertEquals("row-1", vo.getId());
        Map<String, Object> data = vo.getData();
        assertEquals("pi-1", data.get("instanceId"));
        assertEquals("running", data.get("processStatus"));
        assertEquals("张三", data.get("initiatorName"));
        assertEquals(LocalDateTime.of(2026, 1, 15, 10, 30), data.get("startTime"));
        assertEquals("部门审批", data.get("currentNodeName"));
        assertEquals("请假", data.get("reason"));
        assertEquals(3, ((Number) data.get("days")).intValue());
    }

    // ==================== 场景 2：旧版本多余字段忽略、缺失字段 null 不抛错 ====================

    @Test
    void query_ignoresLegacyFields_andToleratesMissing() {
        when(rowsQuery.getResultList())
                .thenReturn(Collections.singletonList(row("{\"reason\":\"旧数据\",\"legacyField\":\"历史值\"}")));
        when(countQuery.getSingleResult()).thenReturn(1L);

        BizDataPageVO page = service.query("leave", req());

        Map<String, Object> data = page.getRecords().get(0).getData();
        assertFalse(data.containsKey("legacyField"), "旧版本多余字段必须被忽略");
        assertNull(data.get("days"), "最新 schema 缺失字段应为 null");
        assertEquals("旧数据", data.get("reason"));
    }

    // ==================== 场景 3：filter 列不在最新 schema keys 内 → 400 ====================

    @Test
    void query_rejectsFilterColumnOutsideSchema() {
        BizDataQueryRequest r = req();
        r.setFilter("{\"evil\":\"x\"}");

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.query("leave", r));
        assertEquals(400, ex.getCode());
    }

    // ==================== 场景 4：getById 单行 / 404 ====================

    @Test
    void getById_returnsAssembledRow() {
        when(rowsQuery.getResultList())
                .thenReturn(Collections.singletonList(row("{\"reason\":\"请假\"}")));

        BizDataVO vo = service.getById("leave", "row-1");

        assertEquals("row-1", vo.getId());
        assertEquals("running", vo.getData().get("processStatus"));
        assertEquals("请假", vo.getData().get("reason"));
    }

    @Test
    void getById_missing_throws404() {
        when(rowsQuery.getResultList()).thenReturn(List.of());

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.getById("leave", "nope"));
        assertEquals(404, ex.getCode());
    }

    // ==================== 场景 5：草稿行排除条件出现在分页 SQL 中 ====================

    @Test
    void query_excludesDraftRows_viaSqlConditions() {
        when(rowsQuery.getResultList()).thenReturn(List.of());
        when(countQuery.getSingleResult()).thenReturn(0L);

        service.query("leave", req());

        String pageSql = capturedSql.stream()
                .filter(s -> s.toUpperCase().contains("LIMIT"))
                .findFirst()
                .orElse("");
        assertFalse(pageSql.isBlank(), "应捕获到分页查询 SQL");
        assertTrue(pageSql.contains("f.tenant_id = :tenantId"), () -> pageSql);
        assertTrue(pageSql.contains("form_def_id IN (:ids)"), () -> pageSql);
        assertTrue(pageSql.contains("is_snapshot = 0"), () -> pageSql);
        assertTrue(pageSql.contains("process_instance_id IS NOT NULL"), () -> pageSql);
        assertTrue(pageSql.contains("ORDER BY COALESCE(h.START_TIME_, f.created_at) DESC"),
                () -> pageSql);
    }

    // ==================== 补充：columnsFor / systemColumns ====================

    @Test
    void columnsFor_returnsOnlyBusinessColumns() {
        List<ColumnConfig> cols = service.columnsFor("leave");

        // 仅返回表单定义的业务字段，不包含系统列
        assertEquals(2, cols.size());
        assertEquals("reason", cols.get(0).getKey());
        assertEquals("days", cols.get(1).getKey());
    }

    @Test
    void columnsFor_workflowType_ignoresColumnConfig_usesSchema() {
        // WORKFLOW 表单即使有 columnConfig（被前端误存），也始终从 schema 解析
        String badColumnConfig = "[{\"key\":\"reason\",\"label\":\"reason\"},{\"key\":\"id\",\"label\":\"id\"}]";
        String schemaJson = "{\"rule\":[{\"field\":\"reason\",\"title\":\"原因\",\"type\":\"input\"},"
                + "{\"field\":\"date_range\",\"title\":\"请假时间\",\"type\":\"timePicker\"}]"
                + "}";
        FormDefinition wfPublished = def("fd-wf2", 1, "PUBLISHED", badColumnConfig);
        wfPublished.setSchema(schemaJson);
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                "tenant-1", "leave", "PUBLISHED")).thenReturn(Optional.of(wfPublished));

        List<ColumnConfig> cols = service.columnsFor("leave");

        // 应只有 2 个业务列（从 schema 解析），不包含系统列，也不使用 columnConfig
        assertEquals(2, cols.size());
        assertEquals("reason", cols.get(0).getKey());
        assertEquals("原因", cols.get(0).getLabel());
        assertEquals("date_range", cols.get(1).getKey());
        assertEquals("请假时间", cols.get(1).getLabel());
    }

    @Test
    void systemColumns_isFiveSystemFields() {
        List<ColumnConfig> cols = WorkflowFormDataQueryService.systemColumns();

        assertEquals(5, cols.size());
        assertEquals(
                List.of("instanceId", "processStatus", "initiatorName", "startTime", "currentNodeName"),
                cols.stream().map(ColumnConfig::getKey).toList());
    }

    // ==================== 补充：columnConfig 为空时从 schema rule 推导列 ====================

    @Test
    void columnsFor_fallsBackToSchemaWhenColumnConfigNull() {
        // Arrange：WORKFLOW 表单 columnConfig=null，从 schema rule 数组解析
        String schemaJson = "{\"rule\":[{\"field\":\"title\",\"title\":\"标题\",\"type\":\"input\"},"
                + "{\"field\":\"amount\",\"title\":\"金额\",\"type\":\"inputNumber\"}]"
                + "}";
        FormDefinition formWithSchema = def("fd-3", 3, "PUBLISHED", null);
        formWithSchema.setSchema(schemaJson);
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                "tenant-1", "leave", "PUBLISHED")).thenReturn(Optional.of(formWithSchema));

        // Act
        List<ColumnConfig> cols = service.columnsFor("leave");

        // Assert：仅返回表单定义的业务列(2 个)，不包含系统列
        assertEquals(2, cols.size());
        assertEquals("title", cols.get(0).getKey());
        assertEquals("标题", cols.get(0).getLabel());
        assertEquals("input", cols.get(0).getComponentType());
        assertEquals("amount", cols.get(1).getKey());
        assertEquals("金额", cols.get(1).getLabel());
        assertEquals("INT", cols.get(1).getColumnType());
    }

    @Test
    void query_fallsBackToSchemaForBusinessColumns() {
        // Arrange：WORKFLOW 表单 columnConfig=null，schema 包含 rule 数组
        String schemaJson = "{\"rule\":[{\"field\":\"title\",\"title\":\"标题\",\"type\":\"input\"}]}";
        FormDefinition formWithSchema = def("fd-3", 3, "PUBLISHED", null);
        formWithSchema.setSchema(schemaJson);
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                "tenant-1", "leave", "PUBLISHED")).thenReturn(Optional.of(formWithSchema));
        when(formDefRepository.findByTenantIdAndKeyOrderByVersionDesc("tenant-1", "leave"))
                .thenReturn(List.of(formWithSchema));

        when(rowsQuery.getResultList())
                .thenReturn(Collections.singletonList(row("{\"title\":\"请假申请\"}")));
        when(countQuery.getSingleResult()).thenReturn(1L);

        // Act
        BizDataPageVO page = service.query("leave", req());

        // Assert：数据包含表单字段 "title"，而不仅是系统列
        assertEquals(1, page.getRecords().size());
        BizDataVO vo = page.getRecords().get(0);
        assertEquals("row-1", vo.getId());
        assertEquals("pi-1", vo.getData().get("instanceId"));
        assertEquals("请假申请", vo.getData().get("title"));
    }
}
