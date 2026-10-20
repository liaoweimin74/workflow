package com.workflow.engine.datasource.scope;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.FilterAware;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.framework.security.domain.LoginUser;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 数据范围（DataScope）：按「主体 × 数据源 × 动作」在服务端追加行级过滤条件。
 *
 * <p>施加位置是 {@code DataSourceDefinitionService}——列表/聚合走 {@link #applyRead}，
 * 单条读取与改删走 {@link #conditionFor} 的行校验；出码/前端一律不参与范围判定，
 * 范围只能在服务端成立。
 *
 * <p>语义约定（改动须同步这里的四条不变量）：
 * <ol>
 *   <li><b>默认放行</b>：某数据源没有任何命中规则 = 现状行为（全租户可见），配置是收紧而非开关；</li>
 *   <li><b>交集而非覆盖</b>：范围条件与客户端已传条件 AND 叠加——map 形态按同键写入
 *       （客户端伪造 {@code created_by} 试图越权时服务端值胜出），结构化形态往 conditions
 *       里追加等值条目；OR 组没法在不放宽可见行的前提下叠加，当场 400，不静默改成 AND；</li>
 *   <li><b>最宽优先</b>：同一用户经角色/组织/成员组命中多条规则时取最宽的一条
 *       （ALL &gt; CUSTOM &gt; SELF），与 {@code PermissionEvaluator} 的多角色或语义一致；</li>
 *   <li><b>读写分轴</b>：READ 管列表/聚合/单条，WRITE 管改删；新增不按行校验
 *       （新行还没有归属可比），归功能权限负责。</li>
 * </ol>
 *
 * <p>列名在注入前做标识符校验，取值只能来自服务端解析的模板变量；
 * 非法列/未知变量/空值快速 400，不静默降级为放行。
 */
@Service
public class DataScopeService {

    /** 内置归属列：所有 wf_biz_* 主表固定列（见 DdlBuilder），由新增链路自动写入当前用户 id。 */
    private static final String CREATED_BY_COLUMN = "created_by";

    /** 列名合法格式（同 JOIN_FIELD_PATTERN：首字符允许下划线，上限 64）；范围列名来自配置表，必须挡在 SQL 之前。 */
    private static final Pattern COLUMN_PATTERN = Pattern.compile("^[A-Za-z_][A-Za-z0-9_]{0,63}$");

    private static final Pattern TEMPLATE_PATTERN = Pattern.compile("\\{([A-Za-z][A-Za-z0-9_]*)}");

    /** 管理员豁免（与 PermissionEvaluator / NotificationAdminAuthorization 的双 code 兼容一致）。 */
    private static final List<String> ADMIN_ROLES = List.of("admin", "ROLE_ADMIN");

    /** 规则宽度：数值越小越宽，多主体命中取最宽。 */
    private static final Map<DataScopeType, Integer> PERMISSIVENESS =
            Map.of(DataScopeType.ALL, 0, DataScopeType.CUSTOM, 1, DataScopeType.SELF, 2);

    private final WfDataScopeRepository scopeRepository;
    private final DataScopeSubjectResolver subjectResolver;
    private final ObjectMapper objectMapper;
    private final TenantProvider tenantProvider;

    public DataScopeService(WfDataScopeRepository scopeRepository,
                            DataScopeSubjectResolver subjectResolver,
                            ObjectMapper objectMapper,
                            TenantProvider tenantProvider) {
        this.scopeRepository = scopeRepository;
        this.subjectResolver = subjectResolver;
        this.objectMapper = objectMapper;
        this.tenantProvider = tenantProvider;
    }

    // ==================== 施加 ====================

    /**
     * 对查询请求施加当前用户的读范围（无规则/管理员 = 原样返回）。
     *
     * @param dataSourceId 数据源 id（范围配置的寻址键）
     * @param request      携带 filter 的查询请求（列表或聚合）
     */
    public void applyRead(String dataSourceId, FilterAware request) {
        apply(dataSourceId, DataScopeAction.READ, request);
    }

    /**
     * 把某动作的范围条件叠加到已带条件的请求上（列表/聚合与「按 id 反查是否在范围内」共用）。
     */
    public void apply(String dataSourceId, DataScopeAction action, FilterAware request) {
        if (request == null) {
            return;
        }
        Map<String, Object> condition = conditionFor(dataSourceId, action);
        if (condition.isEmpty()) {
            return;
        }
        request.setFilter(composeFilter(request.getFilter(), condition));
    }

    /**
     * 当前用户在某数据源某动作上的生效条件（列 → 值）；空 Map = 不受限。
     *
     * <p>暴露成独立方法是「范围可预览、可复用于单条与写校验」的前提：
     * 单条读取与改删没有 filter 通道，需要拿同一份条件去按 id 反查归属。
     */
    public Map<String, Object> conditionFor(String dataSourceId, DataScopeAction action) {
        return conditionFor(dataSourceId, action, currentUser());
    }

    /** 指定主体的生效条件（管理端「预览/诊断」用；与施加路径同一实现，避免预览与实际不一致）。 */
    public Map<String, Object> conditionFor(String dataSourceId, DataScopeAction action, LoginUser user) {
        Map<String, Object> out = new LinkedHashMap<>();
        WfDataScope effective = effectiveRule(dataSourceId, action, user);
        if (effective == null) {
            return out;
        }
        switch (effective.getScopeType()) {
            case ALL -> {
                return out;
            }
            case SELF -> out.put(CREATED_BY_COLUMN, requireUserId(user));
            case CUSTOM -> out.put(requireColumn(effective.getScopeColumn()),
                    resolveTemplate(effective.getScopeValue(), user));
        }
        return out;
    }

    /** 命中集合（主体标识）——预览接口用它解释「这个用户能匹配到哪些规则」。 */
    public Set<String> subjectsOf(LoginUser user) {
        return subjectResolver.subjectsOf(user);
    }

    /**
     * 当前用户命中的最宽规则；null = 无限制（无命中或命中 ALL）。
     */
    public WfDataScope effectiveRule(String dataSourceId, DataScopeAction action, LoginUser user) {
        if (dataSourceId == null || dataSourceId.isBlank() || user == null || isAdmin(user)) {
            return null;
        }
        Set<String> subjects = subjectResolver.subjectsOf(user);
        if (subjects.isEmpty()) {
            return null;
        }
        List<WfDataScope> rules = scopeRepository.findByTenantIdAndDataSourceIdAndAction(
                tenantProvider.getTenantId(), dataSourceId, action);
        WfDataScope best = null;
        for (WfDataScope rule : rules) {
            if (rule == null || rule.getScopeType() == null || !subjects.contains(rule.subjectRef())) {
                continue;
            }
            if (best == null || width(rule) < width(best)) {
                best = rule;
            }
        }
        return best;
    }

    /** 命中的全部规则（含未生效的那些），供管理端解释「为什么是这个结果」。 */
    public List<WfDataScope> matchedRules(String dataSourceId, DataScopeAction action, LoginUser user) {
        if (dataSourceId == null || dataSourceId.isBlank() || user == null) {
            return List.of();
        }
        Set<String> subjects = subjectResolver.subjectsOf(user);
        return scopeRepository.findByTenantIdAndDataSourceIdAndAction(
                        tenantProvider.getTenantId(), dataSourceId, action).stream()
                .filter(r -> r != null && subjects.contains(r.subjectRef()))
                .toList();
    }

    // ==================== 配置读写（管理端） ====================

    public List<WfDataScope> list(String dataSourceId) {
        return scopeRepository.findByTenantIdAndDataSourceIdOrderBySubjectTypeAscSubjectKeyAsc(
                tenantProvider.getTenantId(), dataSourceId);
    }

    /**
     * 保存一条规则（同主体同动作覆盖）。
     * SELF/ALL 会清空列与值，避免残留配置在下一次改成 CUSTOM 时被误用。
     */
    @Transactional
    public WfDataScope save(String dataSourceId, DataScopeAction action, DataScopeSubject subjectType,
                            String subjectKey, DataScopeType scopeType, String scopeColumn, String scopeValue) {
        if (dataSourceId == null || dataSourceId.isBlank()) {
            throw new BusinessException(400, "数据源 id 不能为空");
        }
        if (action == null) {
            throw new BusinessException(400, "数据范围动作不能为空（READ / WRITE）");
        }
        if (subjectType == null) {
            throw new BusinessException(400, "数据范围主体不能为空");
        }
        if (subjectKey == null || subjectKey.isBlank()) {
            throw new BusinessException(400, "数据范围主体标识不能为空");
        }
        if (scopeType == null) {
            throw new BusinessException(400, "数据范围类型不能为空");
        }
        String trimmedKey = subjectKey.trim();
        if (subjectType != DataScopeSubject.ROLE && !trimmedKey.matches("\\d{1,20}")) {
            throw new BusinessException(400, "主体 " + subjectType + " 的标识必须是数字 id: " + subjectKey);
        }
        String tenantId = tenantProvider.getTenantId();
        WfDataScope entity = scopeRepository.findByTenantIdAndDataSourceIdAndActionAndSubjectTypeAndSubjectKey(
                        tenantId, dataSourceId, action, subjectType, trimmedKey)
                .orElseGet(WfDataScope::new);
        entity.setTenantId(tenantId);
        entity.setDataSourceId(dataSourceId);
        entity.setAction(action);
        entity.setSubjectType(subjectType);
        entity.setSubjectKey(trimmedKey);
        entity.setScopeType(scopeType);
        if (scopeType == DataScopeType.CUSTOM) {
            entity.setScopeColumn(requireColumn(scopeColumn));
            entity.setScopeValue(requireTemplate(scopeValue));
        } else {
            entity.setScopeColumn(null);
            entity.setScopeValue(null);
        }
        return scopeRepository.save(entity);
    }

    @Transactional
    public void delete(Long id) {
        scopeRepository.deleteById(id);
    }

    // ==================== 内部 ====================

    private int width(WfDataScope rule) {
        return PERMISSIVENESS.getOrDefault(rule.getScopeType(), 9);
    }

    private String requireColumn(String column) {
        if (column == null || column.isBlank()) {
            throw new BusinessException(400, "数据范围缺少列名");
        }
        if (!COLUMN_PATTERN.matcher(column).matches()) {
            throw new BusinessException(400, "数据范围列名非法: " + column);
        }
        return column;
    }

    private String requireTemplate(String value) {
        if (value == null || value.isBlank()) {
            throw new BusinessException(400, "数据范围缺少取值（支持 {userId} / {username} / {orgId} 或字面量）");
        }
        return value;
    }

    private String requireUserId(LoginUser user) {
        if (user == null || user.getUserId() == null) {
            throw new BusinessException(403, "数据范围需要登录用户身份");
        }
        return String.valueOf(user.getUserId());
    }

    /**
     * 解析值模板：{@code {userId}} / {@code {username}} / {@code {orgId}}，其余原样当字面量。
     * 未知变量与解析后为空一律拒绝——静默放行等于范围失效。
     */
    private String resolveTemplate(String template, LoginUser user) {
        if (template == null || template.isBlank()) {
            throw new BusinessException(400, "数据范围缺少取值，无法为该主体施加过滤");
        }
        Matcher m = TEMPLATE_PATTERN.matcher(template);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            String name = m.group(1);
            String resolved = switch (name) {
                case "userId" -> requireUserId(user);
                case "username" -> user.getUsername() == null ? "" : user.getUsername();
                case "orgId" -> user.getOrgId() == null ? "" : String.valueOf(user.getOrgId());
                default -> throw new BusinessException(400, "数据范围取值使用了未知变量: {" + name + "}");
            };
            if (resolved.isEmpty()) {
                throw new BusinessException(400, "数据范围变量 {" + name + "} 当前用户无取值，请改用其他列或调整配置");
            }
            m.appendReplacement(out, Matcher.quoteReplacement(resolved));
        }
        m.appendTail(out);
        String value = out.toString();
        if (value.isBlank()) {
            throw new BusinessException(400, "数据范围取值解析为空: " + template);
        }
        return value;
    }

    /**
     * 把范围条件叠加进调用方 filter，产出下游三个 SQL 生成器都认的形状。
     *
     * <p>三个生成器（BizDataQueryBuilder / JoinSqlGenerator / SqlTemplateEngine）共用同一形状判定：
     * filter 里一旦出现 {@code conditions}，就只走结构化分支并 <b>忽略其余顶层键</b>。
     * 直接把范围条件当顶层键并进去（旧写法）在结构化筛选下等于不施加范围。
     *
     * <p>组合规则：
     * <ul>
     *   <li>调用方空 filter：原样写范围条件（map 形态，等值 AND）。</li>
     *   <li>调用方 map 形态：同键服务端胜出，范围条件覆盖调用方的同名列取值。</li>
     *   <li>调用方结构化 AND 组：把范围条件作为等值叶子追加进同一 AND 组。</li>
     *   <li>调用方结构化 OR 组：拒绝。把叶子并进 OR 组会把语义从 OR 改成 AND（放大可见行），
     *       范围控制宁可报错也不能静默放宽；OR 与范围的正式组合要等第二通道（范围条件独立成段）落地。</li>
     * </ul>
     *
     * <p>同列冲突：调用方已按 {@code created_by} 筛选且与范围值不同时，AND 结果为空集，
     * 属预期（他明确要别人的行，而范围不给），不是 bug。
     */
    private String composeFilter(String callerFilterJson, Map<String, Object> condition) {
        Map<String, Object> caller = parseFilter(callerFilterJson);
        if (caller.isEmpty()) {
            return writeFilter(condition);
        }
        Object conditions = caller.get("conditions");
        if (conditions == null) {
            Map<String, Object> merged = new LinkedHashMap<>(caller);
            merged.putAll(condition);
            return writeFilter(merged);
        }
        if (!(conditions instanceof List<?> callerConditions)) {
            throw new BusinessException(400, "筛选参数 conditions 必须为数组");
        }
        String logic = String.valueOf(caller.getOrDefault("logic", "AND"));
        if (!"AND".equalsIgnoreCase(logic)) {
            throw new BusinessException(400,
                    "该数据源已配置数据范围，OR 组合筛选暂不可用（范围条件无法在不放宽可见行的前提下与 OR 组合）；"
                            + "请改用 AND 筛选，或调整该数据源的范围配置");
        }
        List<Object> composed = new ArrayList<Object>(callerConditions);
        condition.forEach((column, value) -> composed.add(Map.of(
                "column", column, "op", "eq", "value", value)));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("logic", "AND");
        out.put("conditions", composed);
        return writeFilter(out);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseFilter(String filterJson) {
        if (filterJson == null || filterJson.isBlank()) {
            return new LinkedHashMap<>();
        }
        try {
            Map<String, Object> map = objectMapper.readValue(filterJson, Map.class);
            return map == null ? new LinkedHashMap<>() : new LinkedHashMap<>(map);
        } catch (JsonProcessingException e) {
            // 交给下游按原有语义报「filter 格式非法」，此处不改变错误口径
            throw new BusinessException(400, "筛选参数 filter 格式非法，应为 JSON 对象");
        }
    }

    private String writeFilter(Map<String, Object> filters) {
        try {
            return objectMapper.writeValueAsString(filters);
        } catch (JsonProcessingException e) {
            throw new BusinessException(500, "数据范围条件写入失败");
        }
    }

    private LoginUser currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof LoginUser loginUser) {
            return loginUser;
        }
        return null;
    }

    private boolean isAdmin(LoginUser user) {
        return user.getRoles() != null && user.getRoles().stream().anyMatch(ADMIN_ROLES::contains);
    }
}
