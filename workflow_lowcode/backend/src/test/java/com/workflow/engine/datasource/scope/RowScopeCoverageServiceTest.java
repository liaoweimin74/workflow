package com.workflow.engine.datasource.scope;

import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.DataSourceDefinitionService;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.datasource.repository.DataSourceDefinitionRepository;
import com.workflow.engine.tenant.TenantContext;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.framework.security.domain.LoginUser;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 覆盖度判定（按轴、只算真正有授权的对象）与豁免留痕（理由必填、软撤销）。 */
class RowScopeCoverageServiceTest {

    private static final String TENANT = "t1";

    private DataSourceDefinitionRepository dataSourceRepository;
    private DataSourceDefinitionService dataSourceService;
    private RowPermissionRepository permissionRepository;
    private RowPermissionSourceRepository sourceRepository;
    private RowPermissionGrantRepository grantRepository;
    private RowScopeExemptionRepository exemptionRepository;
    private RowScopeCoverageService service;

    @BeforeEach
    void setUp() {
        dataSourceRepository = mock(DataSourceDefinitionRepository.class);
        dataSourceService = mock(DataSourceDefinitionService.class);
        permissionRepository = mock(RowPermissionRepository.class);
        sourceRepository = mock(RowPermissionSourceRepository.class);
        grantRepository = mock(RowPermissionGrantRepository.class);
        exemptionRepository = mock(RowScopeExemptionRepository.class);
        service = new RowScopeCoverageService(dataSourceRepository, dataSourceService, permissionRepository,
                sourceRepository, grantRepository, exemptionRepository, new TenantProvider());
        TenantContext.setTenantId(TENANT);
        LoginUser loginUser = new LoginUser(1L, "admin", null, List.of("admin"), Set.of(), true);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(loginUser, null, loginUser.getAuthorities()));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        TenantContext.clear();
    }

    @Test
    void report_marks_axes_by_grants_on_linked_permissions() {
        stubSources(ds("ds-order", "订单", "FORM"));
        when(sourceRepository.findByTenantId(TENANT)).thenReturn(List.of(
                link("ds-order", 1L), link("ds-order", 2L)));
        when(permissionRepository.findByTenantIdAndIdIn(eq(TENANT), any()))
                .thenReturn(List.of(permission(1L, "自建数据"), permission(2L, "未授权对象")));
        when(grantRepository.findByTenantId(TENANT)).thenReturn(List.of(
                grantEntity(1L, DataScopeAction.READ)));
        when(exemptionRepository.findByTenantIdAndRevokedAtIsNull(TENANT)).thenReturn(List.of());

        RowScopeCoverageService.Report report = service.report();

        assertEquals(1, report.sources().size());
        RowScopeCoverageService.SourceCoverage row = report.sources().get(0);
        assertEquals(RowScopeCoverageStatus.COVERED, row.read().status());
        assertEquals(List.of("自建数据"), row.read().permissionNames());
        assertEquals(RowScopeCoverageStatus.GAP, row.write().status());
        assertEquals(1, report.coveredAxes());
        assertEquals(0, report.exemptAxes());
        assertEquals(1, report.gapAxes());
        assertEquals(2, report.totalAxes());
    }

    @Test
    void report_exempts_only_axes_without_coverage() {
        stubSources(ds("ds-a", "A", "FORM"), ds("ds-b", "B", "SQL"));
        when(sourceRepository.findByTenantId(TENANT)).thenReturn(List.of(link("ds-b", 1L)));
        when(permissionRepository.findByTenantIdAndIdIn(eq(TENANT), any()))
                .thenReturn(List.of(permission(1L, "已覆盖")));
        when(grantRepository.findByTenantId(TENANT)).thenReturn(List.of(
                grantEntity(1L, DataScopeAction.READ)));
        RowScopeExemption readExempt = exemption("ds-a", DataScopeAction.READ, "历史遗留，暂不收紧");
        RowScopeExemption mootExempt = exemption("ds-b", DataScopeAction.READ, "后来补了配置");
        when(exemptionRepository.findByTenantIdAndRevokedAtIsNull(TENANT))
                .thenReturn(List.of(readExempt, mootExempt));

        RowScopeCoverageService.Report report = service.report();

        RowScopeCoverageService.SourceCoverage a = byId(report, "ds-a");
        RowScopeCoverageService.SourceCoverage b = byId(report, "ds-b");
        assertEquals(RowScopeCoverageStatus.EXEMPT, a.read().status());
        assertNotNull(a.read().exemption());
        assertEquals("历史遗留，暂不收紧", a.read().exemption().reason());
        assertEquals(RowScopeCoverageStatus.GAP, a.write().status());
        assertNull(a.write().exemption());
        // 已有覆盖时状态按覆盖算，豁免记录仍返回（它真实存在，只是不再决定状态）
        assertEquals(RowScopeCoverageStatus.COVERED, b.read().status());
        assertNotNull(b.read().exemption());
    }

    @Test
    void report_only_lists_enabled_scope_enforceable_sources() {
        stubSources(ds("ds-form", "表单源", "FORM"), ds("ds-sql", "SQL源", "SQL"),
                ds("ds-sys", "系统源", "SYSTEM"), ds("ds-flow", "流程源", "WORKFLOW"));
        when(sourceRepository.findByTenantId(TENANT)).thenReturn(List.of());
        when(grantRepository.findByTenantId(TENANT)).thenReturn(List.of());
        when(exemptionRepository.findByTenantIdAndRevokedAtIsNull(TENANT)).thenReturn(List.of());

        RowScopeCoverageService.Report report = service.report();

        assertEquals(List.of("SQL源", "表单源"),
                report.sources().stream().map(RowScopeCoverageService.SourceCoverage::name).toList());
        assertEquals(4, report.gapAxes());
    }

    @Test
    void exempt_requires_reason_and_rejects_duplicate_active_record() {
        when(dataSourceService.getById("ds-order")).thenReturn(ds("ds-order", "订单", "FORM"));
        BusinessException noReason = assertThrows(BusinessException.class,
                () -> service.exempt("ds-order", DataScopeAction.READ, "   "));
        assertEquals(400, noReason.getCode());
        assertTrue(noReason.getMessage().contains("理由不能为空"), noReason.getMessage());

        BusinessException tooLong = assertThrows(BusinessException.class,
                () -> service.exempt("ds-order", DataScopeAction.READ, "x".repeat(501)));
        assertEquals(400, tooLong.getCode());

        when(exemptionRepository.findFirstByTenantIdAndDataSourceIdAndActionAndRevokedAtIsNull(
                TENANT, "ds-order", DataScopeAction.READ))
                .thenReturn(Optional.of(exemption("ds-order", DataScopeAction.READ, "旧豁免")));
        BusinessException duplicated = assertThrows(BusinessException.class,
                () -> service.exempt("ds-order", DataScopeAction.READ, "新理由"));
        assertEquals(400, duplicated.getCode());
        assertTrue(duplicated.getMessage().contains("已有生效豁免"), duplicated.getMessage());
        verify(exemptionRepository, never()).save(any());
    }

    @Test
    void exempt_records_who_and_why() {
        when(dataSourceService.getById("ds-order")).thenReturn(ds("ds-order", "订单", "FORM"));
        when(exemptionRepository.findFirstByTenantIdAndDataSourceIdAndActionAndRevokedAtIsNull(
                TENANT, "ds-order", DataScopeAction.WRITE))
                .thenReturn(Optional.empty());
        when(exemptionRepository.save(any(RowScopeExemption.class))).thenAnswer(inv -> {
            RowScopeExemption saved = inv.getArgument(0);
            saved.setId(7L);
            return saved;
        });

        RowScopeCoverageService.ExemptionView view =
                service.exempt("ds-order", DataScopeAction.WRITE, " 写入口仅有管理员使用 ");

        assertEquals(7L, view.id());
        assertEquals("写入口仅有管理员使用", view.reason());
        assertEquals("admin", view.createdBy());
        ArgumentCaptor<RowScopeExemption> captor = ArgumentCaptor.forClass(RowScopeExemption.class);
        verify(exemptionRepository).save(captor.capture());
        assertEquals(TENANT, captor.getValue().getTenantId());
        assertEquals(DataScopeAction.WRITE, captor.getValue().getAction());
    }

    @Test
    void exempt_rejects_source_type_that_cannot_enforce_scope() {
        doThrow(new BusinessException(400, "数据源类型 SYSTEM 的取数实现不消费筛选条件"))
                .when(dataSourceService).requireScopeConfigurable("ds-sys");

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.exempt("ds-sys", DataScopeAction.READ, "系统源无需范围"));

        assertEquals(400, e.getCode());
        verify(exemptionRepository, never()).save(any());
    }

    @Test
    void revoke_is_soft_and_cannot_happen_twice() {
        RowScopeExemption active = exemption("ds-order", DataScopeAction.READ, "历史遗留");
        active.setId(7L);
        when(exemptionRepository.findByIdAndTenantId(7L, TENANT)).thenReturn(Optional.of(active));
        when(exemptionRepository.save(any(RowScopeExemption.class))).thenAnswer(inv -> inv.getArgument(0));

        RowScopeCoverageService.ExemptionView revoked = service.revoke(7L);

        assertNotNull(revoked.revokedAt());
        assertEquals("admin", revoked.revokedBy());
        verify(exemptionRepository).save(active);

        active.setRevokedAt(LocalDateTime.now());
        BusinessException e = assertThrows(BusinessException.class, () -> service.revoke(7L));
        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("已撤销"), e.getMessage());
    }

    // ==================== 辅助 ====================

    private void stubSources(DataSourceDefinition... sources) {
        when(dataSourceRepository.findByTenantIdAndStatus(TENANT, "ENABLED")).thenReturn(List.of(sources));
    }

    private RowScopeCoverageService.SourceCoverage byId(RowScopeCoverageService.Report report, String id) {
        return report.sources().stream()
                .filter(source -> source.dataSourceId().equals(id))
                .findFirst()
                .orElseThrow();
    }

    private DataSourceDefinition ds(String id, String name, String type) {
        DataSourceDefinition ds = new DataSourceDefinition();
        ds.setId(id);
        ds.setTenantId(TENANT);
        ds.setName(name);
        ds.setType(type);
        ds.setStatus("ENABLED");
        return ds;
    }

    private RowPermission permission(Long id, String name) {
        RowPermission permission = new RowPermission();
        permission.setId(id);
        permission.setTenantId(TENANT);
        permission.setName(name);
        permission.setConditionsJson("[]");
        return permission;
    }

    private RowPermissionSource link(String dataSourceId, Long permissionId) {
        RowPermissionSource link = new RowPermissionSource();
        link.setTenantId(TENANT);
        link.setPermissionId(permissionId);
        link.setDataSourceId(dataSourceId);
        return link;
    }

    private RowPermissionGrant grantEntity(Long permissionId, DataScopeAction action) {
        RowPermissionGrant grant = new RowPermissionGrant();
        grant.setTenantId(TENANT);
        grant.setPermissionId(permissionId);
        grant.setAction(action);
        grant.setSubjectType(DataScopeSubject.ROLE);
        grant.setSubjectKey("clerk");
        return grant;
    }

    private RowScopeExemption exemption(String dataSourceId, DataScopeAction action, String reason) {
        RowScopeExemption exemption = new RowScopeExemption();
        exemption.setTenantId(TENANT);
        exemption.setDataSourceId(dataSourceId);
        exemption.setAction(action);
        exemption.setReason(reason);
        exemption.setCreatedBy("admin");
        return exemption;
    }
}
