package com.workflow.engine.datasource.scope;

import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.DataSourceDefinitionService;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.datasource.repository.DataSourceDefinitionRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 覆盖度盘点与豁免留痕。
 *
 * <p>v3 语义下「未关联 = 不受控（全量可见）」，所以盘点的对象是数据源本身：
 * 列出全部启用、且可施加范围（FORM/SQL）的数据源，回答「它受不受数据权限控制、控制后有没有人被授到」。
 * 豁免不是关闭告警，而是把「接受这个数据源不受控」的决定留痕：理由必填，撤销只软撤销。
 */
@Service
public class RowScopeCoverageService {

    private static final String STATUS_ENABLED = "ENABLED";
    private static final int REASON_MAX_LENGTH = 500;

    private final DataSourceDefinitionRepository dataSourceRepository;
    private final DataSourceDefinitionService dataSourceService;
    private final RowPermissionRepository permissionRepository;
    private final RowPermissionSourceRepository sourceRepository;
    private final RowPermissionGrantRepository grantRepository;
    private final RowScopeExemptionRepository exemptionRepository;
    private final TenantProvider tenantProvider;

    public RowScopeCoverageService(DataSourceDefinitionRepository dataSourceRepository,
                                   DataSourceDefinitionService dataSourceService,
                                   RowPermissionRepository permissionRepository,
                                   RowPermissionSourceRepository sourceRepository,
                                   RowPermissionGrantRepository grantRepository,
                                   RowScopeExemptionRepository exemptionRepository,
                                   TenantProvider tenantProvider) {
        this.dataSourceRepository = dataSourceRepository;
        this.dataSourceService = dataSourceService;
        this.permissionRepository = permissionRepository;
        this.sourceRepository = sourceRepository;
        this.grantRepository = grantRepository;
        this.exemptionRepository = exemptionRepository;
        this.tenantProvider = tenantProvider;
    }

    /** 当前租户启用且可施加范围的数据源覆盖明细。 */
    public Report report() {
        String tenantId = tenantProvider.getTenantId();
        List<DataSourceDefinition> sources = dataSourceRepository.findByTenantIdAndStatus(tenantId, STATUS_ENABLED)
                .stream()
                .filter(source -> DataSourceDefinitionService.isScopeEnforceableType(source.getType()))
                .sorted(Comparator.comparing(DataSourceDefinition::getName)
                        .thenComparing(DataSourceDefinition::getId))
                .toList();
        if (sources.isEmpty()) {
            return new Report(List.of(), 0, 0, 0, 0, 0);
        }

        Map<String, Set<Long>> linkedBySource = sourceRepository.findByTenantId(tenantId).stream()
                .collect(Collectors.groupingBy(RowPermissionSource::getDataSourceId,
                        Collectors.mapping(RowPermissionSource::getPermissionId,
                                Collectors.toCollection(LinkedHashSet::new))));
        Set<Long> permissionIds = linkedBySource.values().stream()
                .flatMap(Set::stream)
                .collect(Collectors.toSet());
        Map<Long, RowPermission> permissions = permissionIds.isEmpty() ? Map.of()
                : permissionRepository.findByTenantIdAndIdIn(tenantId, permissionIds).stream()
                .collect(Collectors.toMap(RowPermission::getId, Function.identity()));
        Set<Long> grantedPermissionIds = grantRepository.findByTenantId(tenantId).stream()
                .map(RowPermissionGrant::getPermissionId)
                .collect(Collectors.toSet());
        Map<String, RowScopeExemption> exemptionBySource = exemptionRepository
                .findByTenantIdAndRevokedAtIsNull(tenantId).stream()
                .collect(Collectors.toMap(RowScopeExemption::getDataSourceId,
                        Function.identity(), (left, right) -> left));

        List<SourceCoverage> rows = new ArrayList<>(sources.size());
        int covered = 0;
        int noGrant = 0;
        int exempt = 0;
        int gap = 0;
        for (DataSourceDefinition source : sources) {
            Coverage coverage = coverage(source.getId(), linkedBySource.getOrDefault(source.getId(), Set.of()),
                    grantedPermissionIds, permissions, exemptionBySource.get(source.getId()));
            switch (coverage.status()) {
                case COVERED -> covered++;
                case NO_GRANT -> noGrant++;
                case EXEMPT -> exempt++;
                case GAP -> gap++;
            }
            rows.add(new SourceCoverage(source.getId(), source.getName(), source.getType(), coverage));
        }
        return new Report(rows, sources.size(), covered, noGrant, exempt, gap);
    }

    /** 全部豁免记录（含已撤销），按新到旧；撤销记录保留理由与撤销人。 */
    public List<ExemptionView> exemptions() {
        String tenantId = tenantProvider.getTenantId();
        return exemptionRepository.findByTenantIdOrderByIdDesc(tenantId).stream()
                .map(this::toView)
                .toList();
    }

    /** 登记一条豁免：同一数据源只能有一条生效记录，撤销后重新豁免会产生新行。 */
    @Transactional
    public ExemptionView exempt(String dataSourceId, String reason) {
        if (dataSourceId == null || dataSourceId.isBlank()) {
            throw new BusinessException(400, "数据源 id 不能为空");
        }
        String trimmedReason = reason == null ? "" : reason.trim();
        if (trimmedReason.isEmpty()) {
            throw new BusinessException(400, "豁免理由不能为空：留痕必须说明为什么接受这个缺口");
        }
        if (trimmedReason.length() > REASON_MAX_LENGTH) {
            throw new BusinessException(400, "豁免理由最长 " + REASON_MAX_LENGTH + " 个字符");
        }
        // 不存在 → 404；不可施加范围的类型 → 400：这类源本来就不在覆盖度口径里
        dataSourceService.requireScopeConfigurable(dataSourceId);
        String tenantId = tenantProvider.getTenantId();
        exemptionRepository.findFirstByTenantIdAndDataSourceIdAndRevokedAtIsNull(tenantId, dataSourceId)
                .ifPresent(existing -> {
                    throw new BusinessException(400, "该数据源已有生效豁免（id " + existing.getId() + "）");
                });

        RowScopeExemption exemption = new RowScopeExemption();
        exemption.setTenantId(tenantId);
        exemption.setDataSourceId(dataSourceId);
        exemption.setReason(trimmedReason);
        exemption.setCreatedBy(currentUsername());
        exemption.setUpdatedBy(currentUsername());
        return toView(exemptionRepository.save(exemption));
    }

    /** 软撤销：写 revokedAt/revokedBy，记录不删。 */
    @Transactional
    public ExemptionView revoke(Long id) {
        String tenantId = tenantProvider.getTenantId();
        RowScopeExemption exemption = exemptionRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new BusinessException(404, "豁免记录不存在: " + id));
        if (exemption.getRevokedAt() != null) {
            throw new BusinessException(400, "该豁免已撤销");
        }
        exemption.setRevokedAt(LocalDateTime.now());
        exemption.setRevokedBy(currentUsername());
        exemption.setUpdatedBy(currentUsername());
        return toView(exemptionRepository.save(exemption));
    }

    private Coverage coverage(String dataSourceId, Set<Long> linked,
                              Set<Long> grantedPermissionIds,
                              Map<Long, RowPermission> permissions,
                              RowScopeExemption exemption) {
        if (linked.isEmpty()) {
            RowScopeCoverageStatus status = exemption != null
                    ? RowScopeCoverageStatus.EXEMPT : RowScopeCoverageStatus.GAP;
            return new Coverage(status, List.of(), exemption == null ? null : toView(exemption));
        }
        List<String> names = linked.stream()
                .map(id -> permissions.containsKey(id) ? permissions.get(id).getName() : "#" + id)
                .sorted()
                .toList();
        boolean anyGranted = linked.stream().anyMatch(grantedPermissionIds::contains);
        RowScopeCoverageStatus status = anyGranted
                ? RowScopeCoverageStatus.COVERED : RowScopeCoverageStatus.NO_GRANT;
        return new Coverage(status, names, exemption == null ? null : toView(exemption));
    }

    private ExemptionView toView(RowScopeExemption exemption) {
        return new ExemptionView(exemption.getId(), exemption.getDataSourceId(),
                exemption.getReason(), exemption.getCreatedBy(), exemption.getCreatedAt(),
                exemption.getRevokedBy(), exemption.getRevokedAt());
    }

    private static String currentUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && StringUtils.hasText(auth.getName()) ? auth.getName() : "anonymous";
    }

    public record Report(List<SourceCoverage> sources, int totalSources, int coveredSources,
                         int noGrantSources, int exemptSources, int gapSources) {
    }

    public record SourceCoverage(String dataSourceId, String name, String type, Coverage coverage) {
    }

    public record Coverage(RowScopeCoverageStatus status, List<String> permissionNames,
                           ExemptionView exemption) {
    }

    /** 豁免记录视图；{@code revokedAt != null} 表示已撤销。 */
    public record ExemptionView(Long id, String dataSourceId, String reason,
                                String createdBy, LocalDateTime createdAt,
                                String revokedBy, LocalDateTime revokedAt) {
    }
}
