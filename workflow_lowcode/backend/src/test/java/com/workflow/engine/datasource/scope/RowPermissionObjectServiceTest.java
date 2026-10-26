package com.workflow.engine.datasource.scope;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.DataSourceMetadata;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.DataSourceDefinitionService;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.datasource.repository.DataSourceDefinitionRepository;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.engine.tenant.TenantContext;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.system.repository.SysMemberGroupMemberRepository;
import com.workflow.system.repository.SysOrganizationRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 权限对象 CRUD：只维护条件与数据源关联，授权表由角色管理独占写入。 */
class RowPermissionObjectServiceTest {

    private static final String TENANT = "t1";
    private static final String DS1 = "ds-order";
    private static final String DS2 = "ds-customer";

    private final ObjectMapper om = new ObjectMapper();

    private RowPermissionRepository permissionRepository;
    private RowPermissionSourceRepository sourceRepository;
    private RowPermissionGrantRepository grantRepository;
    private DataSourceDefinitionService dataSourceService;
    private RowPermissionObjectService service;

    @BeforeEach
    void setUp() {
        permissionRepository = mock(RowPermissionRepository.class);
        sourceRepository = mock(RowPermissionSourceRepository.class);
        grantRepository = mock(RowPermissionGrantRepository.class);
        dataSourceService = mock(DataSourceDefinitionService.class);
        DataScopeService dataScopeService = new DataScopeService(permissionRepository, sourceRepository,
                grantRepository,
                new DataScopeSubjectResolver(),
                new DataScopeVariables(mock(SysOrganizationRepository.class)),
                om, new TenantProvider(), mock(DataSourceDefinitionRepository.class));
        service = new RowPermissionObjectService(permissionRepository, sourceRepository, grantRepository,
                dataScopeService, dataSourceService, new TenantProvider(), om);
        TenantContext.setTenantId(TENANT);
        when(dataSourceService.getById(anyString())).thenAnswer(inv -> definition(inv.getArgument(0)));
        // 默认两个源都有条件列：列可用性由具体用例收窄
        when(dataSourceService.scopeColumns(anyString()))
                .thenAnswer(inv -> new HashSet<>(List.of("owner_id", "dept_id", "created_by")));
        // 默认 metadata 含 phone：字段策略保存期校验读这一面，具体用例按需收窄
        when(dataSourceService.metadata(anyString())).thenAnswer(inv -> metadata(
                column("owner_id", "负责人"), column("dept_id", "归属部门"), column("phone", "手机号")));
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    @Test
    void save_creates_object_and_links_sources() {
        when(permissionRepository.save(any(RowPermission.class))).thenAnswer(inv -> {
            RowPermission permission = inv.getArgument(0);
            permission.setId(10L);
            return permission;
        });
        when(sourceRepository.findByTenantIdAndPermissionId(TENANT, 10L)).thenReturn(List.of());
        when(grantRepository.findByTenantIdAndPermissionId(TENANT, 10L)).thenReturn(List.of());

        RowPermissionObjectService.Detail saved = service.save(input(null,
                List.of(leaf("dept_id", "in", "{orgIdSubtree}")),
                List.of(DS1, DS2)));

        assertEquals(10L, saved.permission().getId());
        assertEquals("销售-部门", saved.permission().getName());
        ArgumentCaptor<RowPermissionSource> sourceCaptor = ArgumentCaptor.forClass(RowPermissionSource.class);
        verify(sourceRepository, org.mockito.Mockito.times(2)).save(sourceCaptor.capture());
        assertEquals(List.of(DS1, DS2),
                sourceCaptor.getAllValues().stream().map(RowPermissionSource::getDataSourceId).toList());
    }

    @Test
    void save_never_touches_grant_table() {
        RowPermission existing = permission(10L, "销售-部门");
        RowPermissionSource oldLink = link(10L, DS1);
        RowPermissionGrant clerkGrant = grantEntity(10L, DataScopeSubject.ROLE, "ROLE_CLERK");
        RowPermissionGrant salesGrant = grantEntity(10L, DataScopeSubject.ROLE, "ROLE_SALES");
        when(permissionRepository.findByIdAndTenantId(10L, TENANT)).thenReturn(Optional.of(existing));
        when(permissionRepository.save(any(RowPermission.class))).thenAnswer(inv -> inv.getArgument(0));
        when(sourceRepository.findByTenantIdAndPermissionId(TENANT, 10L)).thenReturn(List.of(oldLink));
        when(grantRepository.findByTenantIdAndPermissionId(TENANT, 10L))
                .thenReturn(List.of(salesGrant, clerkGrant));

        RowPermissionObjectService.Detail saved = service.save(input(10L,
                List.of(leaf("owner_id", "eq", "{userId}")), List.of(DS2)));

        verify(sourceRepository).deleteAll(List.of(oldLink));
        verify(sourceRepository).flush();
        // 换数据源、换条件都不动授权：角色管理勾的授权必须原样留着
        verify(grantRepository, never()).save(any());
        verify(grantRepository, never()).delete(any());
        verify(grantRepository, never()).deleteAll(any());
        assertEquals(List.of("ROLE|ROLE_CLERK", "ROLE|ROLE_SALES"), saved.grants().stream()
                .map(grant -> grant.subjectType() + "|" + grant.subjectKey())
                .toList());
    }

    @Test
    void save_rejects_object_without_sources() {
        BusinessException e = assertThrows(BusinessException.class,
                () -> service.save(input(null, List.of(leaf("owner_id", "eq", "{userId}")), List.of())));

        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("至少关联一个数据源"), e.getMessage());
        verify(permissionRepository, never()).save(any());
    }

    @Test
    void save_rejects_source_that_cannot_enforce_scope() {
        doThrow(new BusinessException(400, "数据源类型 SYSTEM 的取数实现不消费筛选条件"))
                .when(dataSourceService).requireScopeConfigurable(DS2);

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.save(input(null, List.of(leaf("owner_id", "eq", "{userId}")), List.of(DS1, DS2))));

        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("不消费筛选条件"), e.getMessage());
        verify(permissionRepository, never()).save(any());
    }

    /** 条件同时施加到所有关联源：某一源缺列就是该源整条查询报错，必须在保存期点名拦住。 */
    @Test
    void save_rejects_column_that_one_linked_source_cannot_filter() {
        when(dataSourceService.scopeColumns(DS2)).thenReturn(new HashSet<>(List.of("owner_id")));

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.save(input(null, List.of(leaf("dept_id", "eq", "{orgId}")), List.of(DS1, DS2))));

        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("dept_id"), e.getMessage());
        assertTrue(e.getMessage().contains("客户台账"), e.getMessage());
        verify(permissionRepository, never()).save(any());
    }

    /** 源一个可用列都没有（SQL 模板没声明可筛选列）：换成任何列都救不了，直接说明根因。 */
    @Test
    void save_rejects_source_without_any_usable_column() {
        when(dataSourceService.scopeColumns(DS1)).thenReturn(new HashSet<>());

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.save(input(null, List.of(leaf("owner_id", "eq", "{userId}")), List.of(DS1))));

        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("没有可施加范围条件的列"), e.getMessage());
        verify(permissionRepository, never()).save(any());
    }

    // ==================== 字段策略（对象基线，保存期校验） ====================

    /** 合法策略随对象落库：存储 JSON 走 FieldPolicies 唯一协议口径（列/处置/规则齐全）。 */
    @Test
    void save_stores_validated_field_policies() throws Exception {
        when(permissionRepository.save(any(RowPermission.class))).thenAnswer(inv -> {
            RowPermission permission = inv.getArgument(0);
            permission.setId(10L);
            return permission;
        });
        when(sourceRepository.findByTenantIdAndPermissionId(TENANT, 10L)).thenReturn(List.of());
        when(grantRepository.findByTenantIdAndPermissionId(TENANT, 10L)).thenReturn(List.of());

        RowPermissionObjectService.Detail saved = service.save(new RowPermissionObjectService.Input(null,
                "销售-部门", null, List.of(leaf("owner_id", "eq", "{userId}")), List.of(DS1),
                List.of(Map.of("column", "phone", "policy", "MASK", "rule", "PHONE"))));

        assertEquals("[{\"column\":\"phone\",\"policy\":\"MASK\",\"rule\":\"PHONE\"}]",
                saved.permission().getFieldPoliciesJson());
        assertEquals(List.of(Map.of("column", "phone", "policy", "MASK", "rule", "PHONE")),
                saved.fieldPolicies());
    }

    /** 策略列会下发到每个关联源的输出：任一源不认识这一列就点名拒绝，防查询期整条报错。 */
    @Test
    void save_rejects_policy_column_missing_on_linked_source() {
        when(dataSourceService.metadata(DS2)).thenReturn(metadata(column("owner_id", "负责人")));

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.save(new RowPermissionObjectService.Input(null, "销售-部门", null,
                        List.of(leaf("owner_id", "eq", "{userId}")), List.of(DS1, DS2),
                        List.of(Map.of("column", "phone", "policy", "HIDDEN")))));

        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("phone"), e.getMessage());
        assertTrue(e.getMessage().contains("客户台账"), e.getMessage());
        verify(permissionRepository, never()).save(any());
    }

    /** MASK 必带规则是协议层校验：保存期就报错，静默降级等于策略失效。 */
    @Test
    void save_rejects_mask_without_rule() {
        BusinessException e = assertThrows(BusinessException.class,
                () -> service.save(new RowPermissionObjectService.Input(null, "销售-部门", null,
                        List.of(leaf("owner_id", "eq", "{userId}")), List.of(DS1),
                        List.of(Map.of("column", "phone", "policy", "MASK")))));

        assertEquals(400, e.getCode());
        verify(permissionRepository, never()).save(any());
    }

    /** 「没配策略」写 NULL 列（与配空数组同语义），回显为空列表。 */
    @Test
    void save_without_policies_writes_null_and_echoes_empty() {
        when(permissionRepository.save(any(RowPermission.class))).thenAnswer(inv -> {
            RowPermission permission = inv.getArgument(0);
            permission.setId(10L);
            return permission;
        });
        when(sourceRepository.findByTenantIdAndPermissionId(TENANT, 10L)).thenReturn(List.of());
        when(grantRepository.findByTenantIdAndPermissionId(TENANT, 10L)).thenReturn(List.of());

        RowPermissionObjectService.Detail saved = service.save(input(null,
                List.of(leaf("owner_id", "eq", "{userId}")), List.of(DS1)));

        assertNull(saved.permission().getFieldPoliciesJson());
        assertEquals(List.of(), saved.fieldPolicies());
    }

    // ==================== 候选列（交集） ====================

    /** 条件同时下发到所有关联源，候选按交集给：DS2 筛不出的 dept_id 不该出现在下拉里。 */
    @Test
    void candidates_intersect_every_selected_source() {
        when(dataSourceService.scopeColumns(DS1))
                .thenReturn(new java.util.LinkedHashSet<>(List.of("owner_id", "dept_id", "created_by")));
        when(dataSourceService.scopeColumns(DS2))
                .thenReturn(new java.util.LinkedHashSet<>(List.of("owner_id", "created_by")));
        when(dataSourceService.metadata(DS1))
                .thenReturn(metadata(column("owner_id", "负责人"), column("dept_id", "归属部门")));
        when(dataSourceService.metadata(DS2)).thenReturn(metadata(column("owner_id", "归属人")));

        List<RowPermissionObjectService.ColumnOption> options =
                service.columnCandidates(List.of(DS1, DS2));

        assertEquals(List.of("owner_id", "created_by"), options.stream()
                .map(RowPermissionObjectService.ColumnOption::key).toList());
        // 标签取第一处声明的；内置列不在 metadata 里，用固定中文名
        assertEquals("负责人", options.get(0).label());
        assertEquals("创建人", options.get(1).label());
    }

    /** 毫无共同列：返回空列表而不是硬凑一个，前端据此提示「没有共同可筛的列」。 */
    @Test
    void candidates_are_empty_when_sources_share_no_column() {
        when(dataSourceService.scopeColumns(DS1)).thenReturn(new HashSet<>(List.of("owner_id")));
        when(dataSourceService.scopeColumns(DS2)).thenReturn(new HashSet<>(List.of("customer_no")));
        when(dataSourceService.metadata(anyString())).thenReturn(metadata());

        assertTrue(service.columnCandidates(List.of(DS1, DS2)).isEmpty());
    }

    @Test
    void candidates_without_any_source_are_empty_and_read_nothing() {
        assertTrue(service.columnCandidates(List.of()).isEmpty());
        assertTrue(service.columnCandidates(List.of("  ")).isEmpty());

        verify(dataSourceService, never()).scopeColumns(anyString());
    }

    /** 不可施加范围的源照样报错：候选下拉不能绕过保存期那道判定。 */
    @Test
    void candidates_reject_source_that_does_not_consume_filters() {
        doThrow(new BusinessException(400, "数据源类型 WORKFLOW 的取数实现不消费筛选条件"))
                .when(dataSourceService).requireScopeConfigurable(DS2);

        BusinessException e = assertThrows(BusinessException.class, () -> service.columnCandidates(List.of(DS1, DS2)));

        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("不消费筛选条件"), e.getMessage());
    }

    @Test
    void save_rejects_blank_name() {
        BusinessException noName = assertThrows(BusinessException.class,
                () -> service.save(new RowPermissionObjectService.Input(null, "  ", null,
                        List.of(leaf("owner_id", "eq", "{userId}")), List.of(DS1))));

        assertEquals(400, noName.getCode());
        verify(permissionRepository, never()).save(any());
    }

    /** v3：空条件对象 = 全部行，是「某角色看全部」的正规配法。 */
    @Test
    void save_accepts_empty_conditions_as_all_rows() {
        when(permissionRepository.save(any(RowPermission.class))).thenAnswer(inv -> {
            RowPermission permission = inv.getArgument(0);
            permission.setId(10L);
            return permission;
        });
        when(sourceRepository.findByTenantIdAndPermissionId(TENANT, 10L)).thenReturn(List.of());
        when(grantRepository.findByTenantIdAndPermissionId(TENANT, 10L)).thenReturn(List.of());

        RowPermissionObjectService.Detail saved = service.save(input(null, List.of(), List.of(DS1)));

        assertEquals(List.of(), saved.conditions());
    }

    @Test
    void delete_removes_children_then_object() {
        RowPermission existing = permission(10L, "销售-部门");
        when(permissionRepository.findByIdAndTenantId(10L, TENANT)).thenReturn(Optional.of(existing));

        service.delete(10L);

        verify(grantRepository).deleteByTenantIdAndPermissionId(TENANT, 10L);
        verify(sourceRepository).deleteByTenantIdAndPermissionId(TENANT, 10L);
        verify(permissionRepository).delete(existing);
    }

    @Test
    void get_unknown_object_returns_404() {
        when(permissionRepository.findByIdAndTenantId(99L, TENANT)).thenReturn(Optional.empty());

        BusinessException e = assertThrows(BusinessException.class, () -> service.get(99L));

        assertEquals(404, e.getCode());
    }

    @Test
    void list_returns_conditions_sources_and_grants() throws Exception {
        RowPermission permission = permission(10L, "销售-部门");
        permission.setConditionsJson(om.writeValueAsString(List.of(leaf("owner_id", "eq", "{userId}"))));
        when(permissionRepository.findByTenantIdOrderByIdDesc(TENANT)).thenReturn(List.of(permission));
        when(sourceRepository.findByTenantIdAndPermissionId(TENANT, 10L)).thenReturn(List.of(link(10L, DS1)));
        when(grantRepository.findByTenantIdAndPermissionId(TENANT, 10L))
                .thenReturn(List.of(grantEntity(10L, DataScopeSubject.ROLE, "clerk")));

        List<RowPermissionObjectService.Detail> list = service.list();

        assertEquals(1, list.size());
        assertEquals(List.of(DS1), list.get(0).dataSourceIds());
        assertEquals(1, list.get(0).grants().size());
        assertEquals(List.of(leaf("owner_id", "eq", "{userId}")), list.get(0).conditions());
    }

    /** 管理页要能看见已存策略（编辑入口的前置），Detail 回显走同一协议解析。 */
    @Test
    void list_echoes_stored_field_policies() throws Exception {
        RowPermission permission = permission(10L, "销售-部门");
        permission.setFieldPoliciesJson(om.writeValueAsString(
                List.of(Map.of("column", "phone", "policy", "MASK", "rule", "PHONE"))));
        when(permissionRepository.findByTenantIdOrderByIdDesc(TENANT)).thenReturn(List.of(permission));
        when(sourceRepository.findByTenantIdAndPermissionId(TENANT, 10L)).thenReturn(List.of());
        when(grantRepository.findByTenantIdAndPermissionId(TENANT, 10L)).thenReturn(List.of());

        List<RowPermissionObjectService.Detail> list = service.list();

        assertEquals(List.of(Map.of("column", "phone", "policy", "MASK", "rule", "PHONE")),
                list.get(0).fieldPolicies());
    }

    // ==================== 辅助 ====================

    private DataSourceMetadata metadata(ColumnConfig... columns) {
        DataSourceMetadata meta = new DataSourceMetadata();
        meta.setColumns(List.of(columns));
        return meta;
    }

    private ColumnConfig column(String key, String label) {
        ColumnConfig column = new ColumnConfig();
        column.setKey(key);
        column.setLabel(label);
        return column;
    }

    private DataSourceDefinition definition(String id) {
        DataSourceDefinition ds = new DataSourceDefinition();
        ds.setId(id);
        ds.setName(DS1.equals(id) ? "销售订单" : "客户台账");
        ds.setType("FORM");
        return ds;
    }

    private RowPermissionObjectService.Input input(Long id, List<Map<String, Object>> conditions,
                                                   List<String> dataSourceIds) {
        return new RowPermissionObjectService.Input(id, " 销售-部门 ", "  备注 ", conditions, dataSourceIds);
    }

    private Map<String, Object> leaf(String column, String op, Object value) {
        Map<String, Object> leaf = new java.util.LinkedHashMap<>();
        leaf.put("column", column);
        leaf.put("op", op);
        leaf.put("value", value);
        return leaf;
    }

    private RowPermission permission(Long id, String name) {
        RowPermission permission = new RowPermission();
        permission.setId(id);
        permission.setTenantId(TENANT);
        permission.setName(name);
        return permission;
    }

    private RowPermissionSource link(Long permissionId, String dataSourceId) {
        RowPermissionSource link = new RowPermissionSource();
        link.setTenantId(TENANT);
        link.setPermissionId(permissionId);
        link.setDataSourceId(dataSourceId);
        return link;
    }

    private RowPermissionGrant grantEntity(Long permissionId, DataScopeSubject subjectType, String subjectKey) {
        RowPermissionGrant grant = new RowPermissionGrant();
        grant.setTenantId(TENANT);
        grant.setPermissionId(permissionId);
        grant.setSubjectType(subjectType);
        grant.setSubjectKey(subjectKey);
        return grant;
    }
}
