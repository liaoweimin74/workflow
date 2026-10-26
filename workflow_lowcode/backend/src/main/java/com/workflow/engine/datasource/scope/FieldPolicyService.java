package com.workflow.engine.datasource.scope;

import com.workflow.api.dto.AggregateRequest;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataVO;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.framework.security.domain.LoginUser;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 字段策略的生效服务（designs §2.4：生效点在服务端序列化层，不在 SQL 列选——
 * 一次封死详情、导出、开放 API 三条泄漏路径）。
 *
 * <p>判定骨架与行范围同源：管理员/无登录态豁免（{@link DataScopeService#isAdmin}），
 * 主体命中走同一个 {@link DataScopeSubjectResolver}，底表通道的 formKey 反查走
 * {@link DataScopeService#dataSourceIdOfForm}；列策略合并走 {@link FieldPolicies}
 * （链内 grant 覆写基线，跨链 strictest-wins）。
 *
 * <p>受控未授权返回空列策略：行可见集合已是 0 行，列策略无物可掩——
 * 「未授权 = 看不见行」由行范围负责，字段策略只管「看见的行里哪些列收紧」。
 *
 * <p>已知边界：filter/keyword 的列级比对不设防（盲索引问题）——行集已受行范围约束，
 * 且设计口径只要求封「查询结果出口」；聚合是明确的旁路（输出绕过逐列掩码），所以单独封口。
 */
@Service
public class FieldPolicyService {

    private final RowPermissionRepository permissionRepository;
    private final RowPermissionSourceRepository sourceRepository;
    private final RowPermissionGrantRepository grantRepository;
    private final DataScopeSubjectResolver subjectResolver;
    private final DataScopeService dataScopeService;
    private final TenantProvider tenantProvider;

    public FieldPolicyService(RowPermissionRepository permissionRepository,
                              RowPermissionSourceRepository sourceRepository,
                              RowPermissionGrantRepository grantRepository,
                              DataScopeSubjectResolver subjectResolver,
                              DataScopeService dataScopeService,
                              TenantProvider tenantProvider) {
        this.permissionRepository = permissionRepository;
        this.sourceRepository = sourceRepository;
        this.grantRepository = grantRepository;
        this.subjectResolver = subjectResolver;
        this.dataScopeService = dataScopeService;
        this.tenantProvider = tenantProvider;
    }

    /** 当前用户在该数据源的生效列策略（列名 → 策略）；空 = 全列可见。 */
    public Map<String, FieldPolicy> effectivePolicies(String dataSourceId) {
        LoginUser user = DataScopeService.currentUser();
        if (dataSourceId == null || dataSourceId.isBlank() || user == null || DataScopeService.isAdmin(user)) {
            return Map.of();
        }
        String tenantId = tenantProvider.getTenantId();
        List<Long> permissionIds = sourceRepository.findByTenantIdAndDataSourceId(tenantId, dataSourceId).stream()
                .map(RowPermissionSource::getPermissionId)
                .distinct()
                .toList();
        if (permissionIds.isEmpty()) {
            return Map.of();
        }
        Set<String> subjects = subjectResolver.subjectsOf(user);
        if (subjects.isEmpty()) {
            return Map.of();
        }
        List<RowPermissionGrant> grants = grantRepository
                .findByTenantIdAndPermissionIdIn(tenantId, permissionIds).stream()
                .filter(grant -> subjects.contains(grant.subjectRef()))
                .toList();
        if (grants.isEmpty()) {
            return Map.of();
        }
        Set<Long> grantedIds = grants.stream().map(RowPermissionGrant::getPermissionId).collect(Collectors.toSet());
        Map<Long, RowPermission> permissionById = permissionRepository
                .findByTenantIdAndIdIn(tenantId, grantedIds).stream()
                .collect(Collectors.toMap(RowPermission::getId, permission -> permission));
        List<List<FieldPolicy>> chains = new ArrayList<>(grants.size());
        for (RowPermissionGrant grant : grants) {
            RowPermission permission = permissionById.get(grant.getPermissionId());
            if (permission == null) {
                // 授权指向已消失的对象：不贡献列策略（行可见性已由行范围对该 grant 拒绝）
                continue;
            }
            chains.add(FieldPolicies.overlay(
                    FieldPolicies.parse(permission.getFieldPoliciesJson()),
                    FieldPolicies.parse(grant.getFieldPoliciesJson())));
        }
        return FieldPolicies.mergeStrictest(chains);
    }

    /** 底表通道口径：先按 formKey 反查数据源（与行范围同一份反查），再解列策略。 */
    public Map<String, FieldPolicy> effectivePoliciesByFormKey(String formKey) {
        String dataSourceId = dataScopeService.dataSourceIdOfForm(formKey);
        return dataSourceId == null ? Map.of() : effectivePolicies(dataSourceId);
    }

    /** 掩码分页结果（处理 records 行的 data map）；无策略原样返回同一实例。 */
    public BizDataPageVO applyToPage(String dataSourceId, BizDataPageVO page) {
        if (page == null || page.getRecords() == null || page.getRecords().isEmpty()) {
            return page;
        }
        Map<String, FieldPolicy> policies = effectivePolicies(dataSourceId);
        if (policies.isEmpty()) {
            return page;
        }
        page.getRecords().forEach(record -> record.setData(applyToData(record.getData(), policies)));
        return page;
    }

    /** 掩码单条结果。 */
    public BizDataVO applyToRow(String dataSourceId, BizDataVO row) {
        if (row == null) {
            return null;
        }
        Map<String, FieldPolicy> policies = effectivePolicies(dataSourceId);
        if (policies.isEmpty()) {
            return row;
        }
        row.setData(applyToData(row.getData(), policies));
        return row;
    }

    /**
     * 写载荷防御：剔除当前用户列策略覆盖（MASK/HIDDEN）的列，以库中值为准——
     * 否则表单把「138****5678」回填提交会污染真实数据。
     */
    public Map<String, Object> stripForWrite(String dataSourceId, Map<String, Object> data) {
        if (data == null || data.isEmpty()) {
            return data;
        }
        Map<String, FieldPolicy> policies = effectivePolicies(dataSourceId);
        if (policies.isEmpty()) {
            return data;
        }
        Map<String, Object> out = new LinkedHashMap<>(data);
        policies.forEach((column, policy) -> {
            if (policy.access() != FieldAccess.VISIBLE) {
                out.remove(column);
            }
        });
        return out;
    }

    /** 引用显示文本旁路封口：显示列被掩则逐值掩码，被隐则整批无文本（标签通道不绕列策略）。 */
    public Map<String, String> maskResolveTexts(String formKey, String displayField, Map<String, String> texts) {
        if (texts == null || texts.isEmpty() || displayField == null || displayField.isBlank()) {
            return texts;
        }
        FieldPolicy policy = effectivePoliciesByFormKey(formKey).get(displayField);
        if (policy == null || policy.access() == FieldAccess.VISIBLE) {
            return texts;
        }
        if (policy.access() == FieldAccess.HIDDEN) {
            return Map.of();
        }
        Map<String, String> out = new LinkedHashMap<>(texts.size());
        texts.forEach((id, text) -> out.put(id, String.valueOf(policy.rule().apply(text))));
        return out;
    }

    /** 统计泄漏封口：group/metric 命中 MASK/HIDDEN 列直接拒绝（聚合输出绕过逐列掩码）。 */
    public void requireAggregateAllowed(String dataSourceId, AggregateRequest req) {
        if (req == null) {
            return;
        }
        Map<String, FieldPolicy> policies = effectivePolicies(dataSourceId);
        if (policies.isEmpty()) {
            return;
        }
        requireColumnNotCovered(policies, req.getGroup(), "分组列");
        requireColumnNotCovered(policies, req.getMetric(), "聚合列");
    }

    // ==================== 内部 ====================

    private static Map<String, Object> applyToData(Map<String, Object> data, Map<String, FieldPolicy> policies) {
        if (data == null) {
            return null;
        }
        Map<String, Object> out = new LinkedHashMap<>(data);
        policies.forEach((column, policy) -> {
            switch (policy.access()) {
                case HIDDEN -> out.remove(column);
                case MASK -> {
                    if (out.containsKey(column)) {
                        out.put(column, policy.rule().apply(out.get(column)));
                    }
                }
                case VISIBLE -> {
                    // 显式可见 = 不处置
                }
            }
        });
        return out;
    }

    private static void requireColumnNotCovered(Map<String, FieldPolicy> policies, String column, String role) {
        if (column == null || column.isBlank()) {
            return;
        }
        FieldPolicy policy = policies.get(column);
        if (policy != null && policy.access() != FieldAccess.VISIBLE) {
            throw new BusinessException(400, "该列受字段策略限制，不能参与统计: " + role + " " + column);
        }
    }
}
