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
 * <p>「没挂即不受控」意味着漏挂一条数据源就是一个静默缺口，所以需要一个反向查询：
 * 列出全部启用、且可施加范围（FORM/SQL）的数据源，按读写轴分别回答「有没有人会被约束」。
 * 覆盖的判定是「关联对象在该轴至少有一条授权」——只关联对象但没有任何授权，谁也约束不到。
 *
 * <p>豁免不是关闭告警，而是把「接受缺口」这个决定留痕：理由必填，撤销只软撤销。
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

    /** 当前租户启用且可施加范围的数据源 × 读写轴覆盖明细。 */
    public Report report() {
        String tenantId = tenantProvider.getTenantId();
        List<DataSourceDefinition> sources = dataSourceRepository.findByTenantIdAndStatus(tenantId, STATUS_ENABLED)
                .stream()
                .filter(source -> DataSourceDefinitionService.isScopeEnforceableType(source.getType()))
                .sorted(Comparator.comparing(DataSourceDefinition::getName)
                        .thenComparing(DataSourceDefinition::getId))
                .toList();
        if (sources.isEmpty()) {
            return new Report(List.of(), 0, 0, 0, 0);
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
        Map<DataScopeAction, Set<Long>> grantedByAction = grantRepository.findByTenantId(tenantId).stream()
                .collect(Collectors.groupingBy(RowPermissionGrant::getAction,
                        Collectors.mapping(RowPermissionGrant::getPermissionId, Collectors.toSet())));
        Map<String, RowScopeExemption> exemptionByAxis = exemptionRepository
                .findByTenantIdAndRevokedAtIsNull(tenantId).stream()
                .collect(Collectors.toMap(exemption -> axisKey(exemption.getDataSourceId(), exemption.getAction()),
                        Function.identity(), (left, right) -> left));

        List<SourceCoverage> rows = new ArrayList<>(sources.size());
        int covered = 0;
        int exempt = 0;
        int gap = 0;
        for (DataSourceDefinition source : sources) {
            Set<Long> linked = linkedBySource.getOrDefault(source.getId(), Set.of());
            AxisCoverage read = axis(source.getId(), DataScopeAction.READ, linked,
                    grantedByAction, permissions, exemptionByAxis);
            AxisCoverage write = axis(source.getId(), DataScopeAction.WRITE, linked,
                    grantedByAction, permissions, exemptionByAxis);
            for (AxisCoverage axis : List.of(read, write)) {
                switch (axis.status()) {
                    case COVERED -> covered++;
                    case EXEMPT -> exempt++;
                    case GAP -> gap++;
                }
            }
            rows.add(new SourceCoverage(source.getId(), source.getName(), source.getType(), read, write));
        }
        return new Report(rows, covered + exempt + gap, covered, exempt, gap);
    }

    /** 全部豁免记录（含已撤销），按新到旧；撤销记录保留理由与撤销人。 */
    public List<ExemptionView> exemptions() {
        String tenantId = tenantProvider.getTenantId();
        return exemptionRepository.findByTenantIdOrderByIdDesc(tenantId).stream()
                .map(this::toView)
                .toList();
    }

    /** 登记一条豁免：同一数据源同一轴只能有一条生效记录，撤销后重新豁免会产生新行。 */
    @Transactional
    public ExemptionView exempt(String dataSourceId, DataScopeAction action, String reason) {
        if (dataSourceId == null || dataSourceId.isBlank()) {
            throw new BusinessException(400, "数据源 id 不能为空");
        }
        if (action == null) {
            throw new BusinessException(400, "豁免动作不能为空（READ / WRITE）");
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
        exemptionRepository.findFirstByTenantIdAndDataSourceIdAndActionAndRevokedAtIsNull(
                        tenantId, dataSourceId, action)
                .ifPresent(existing -> {
                    throw new BusinessException(400, "该数据源此动作已有生效豁免（id " + existing.getId() + "）");
                });

        RowScopeExemption exemption = new RowScopeExemption();
        exemption.setTenantId(tenantId);
        exemption.setDataSourceId(dataSourceId);
        exemption.setAction(action);
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

    private AxisCoverage axis(String dataSourceId, DataScopeAction action, Set<Long> linked,
                              Map<DataScopeAction, Set<Long>> grantedByAction,
                              Map<Long, RowPermission> permissions,
                              Map<String, RowScopeExemption> exemptionByAxis) {
        Set<Long> granted = grantedByAction.getOrDefault(action, Set.of());
        List<Long> coveredIds = linked.stream().filter(granted::contains).sorted().toList();
        List<String> names = coveredIds.stream()
                .map(id -> permissions.containsKey(id) ? permissions.get(id).getName() : "#" + id)
                .toList();
        RowScopeExemption exemption = exemptionByAxis.get(axisKey(dataSourceId, action));
        RowScopeCoverageStatus status = !names.isEmpty() ? RowScopeCoverageStatus.COVERED
                : exemption != null ? RowScopeCoverageStatus.EXEMPT
                : RowScopeCoverageStatus.GAP;
        return new AxisCoverage(action, status, names,
                exemption == null ? null : toView(exemption));
    }

    private String axisKey(String dataSourceId, DataScopeAction action) {
        return dataSourceId + "|" + action;
    }

    private ExemptionView toView(RowScopeExemption exemption) {
        return new ExemptionView(exemption.getId(), exemption.getDataSourceId(), exemption.getAction(),
                exemption.getReason(), exemption.getCreatedBy(), exemption.getCreatedAt(),
                exemption.getRevokedBy(), exemption.getRevokedAt());
    }

    private static String currentUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && StringUtils.hasText(auth.getName()) ? auth.getName() : "anonymous";
    }

    public record Report(List<SourceCoverage> sources, int totalAxes, int coveredAxes, int exemptAxes, int gapAxes) {
    }

    public record SourceCoverage(String dataSourceId, String name, String type,
                                 AxisCoverage read, AxisCoverage write) {
    }

    public record AxisCoverage(DataScopeAction action, RowScopeCoverageStatus status,
                               List<String> permissionNames, ExemptionView exemption) {
    }

    /** 豁免记录视图；{@code revokedAt != null} 表示已撤销。 */
    public record ExemptionView(Long id, String dataSourceId, DataScopeAction action, String reason,
                                String createdBy, LocalDateTime createdAt,
                                String revokedBy, LocalDateTime revokedAt) {
    }
}
