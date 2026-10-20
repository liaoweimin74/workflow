package com.workflow.engine.datasource.scope;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.FilterAware;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.framework.security.domain.LoginUser;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 行权限（RowPermission）：按「角色 × 动作」把权限对象叠加到数据源查询上。
 *
 * <p>模型是三层：{@link RowPermission}（一组 AND 条件 + 名称）通过 {@link RowPermissionSource}
 * 关联到若干数据源，再通过 {@link RowPermissionGrant} 授予角色并指定 READ/WRITE 轴。
 * 授权的唯一写入口是「角色管理 → 数据权限」；这里只负责读取与施加。
 * 施加位置是 {@code DataSourceDefinitionService}——列表/聚合走 {@link #applyRead}，
 * 单条读取与改删走按 id 反查归属；出码/前端一律不参与范围判定，范围只能在服务端成立。
 *
 * <p>语义约定（改动须同步这里的四条不变量）：
 * <ol>
 *   <li><b>默认放行</b>：某数据源没有任何命中授权 = 现状行为（全租户可见）；「全部可见」靠不授予表达，
 *       不再有 ALL 通配配置。对象条件为空数组同样视为不受限（显式放行）。</li>
 *   <li><b>并集</b>：同一用户经多个角色命中多个权限对象时取 OR；对象内部的条件按 AND。
 *       这不是「取最宽的一条」——两个对象分别放开两批行，用户应当两批都看得到。</li>
 *   <li><b>交集叠加</b>：并集条件与客户端 filter 始终 AND，走独立保留键 {@link FilterAware#ROW_SCOPE_KEY}，
 *       客户端自带的是 map 还是 OR 结构化筛选都不影响；客户端传入的同名保留键先被丢弃。
 *       列名在注入前做标识符校验，取值只能来自服务端解析的模板变量。</li>
 *   <li><b>读写分轴</b>：READ 管列表/聚合/单条，WRITE 管改删；新增不按行校验
 *       （新行还没有归属可比），归功能权限负责。</li>
 * </ol>
 */
@Service
public class DataScopeService {

    /** 列名合法格式（同 JOIN_FIELD_PATTERN：首字符允许下划线，上限 64）；列名来自配置，必须挡在 SQL 之前。 */
    private static final Pattern COLUMN_PATTERN = Pattern.compile("^[A-Za-z_][A-Za-z0-9_]{0,63}$");

    private static final Pattern TEMPLATE_PATTERN = Pattern.compile("\\{([A-Za-z][A-Za-z0-9_]*)}");

    /** 条件叶子支持的运算符（与三个 SQL 生成器的结构化筛选同一协议）。 */
    private static final Set<String> ALLOWED_OPS =
            Set.of("eq", "ne", "like", "in", "range", "isempty", "isnotempty");

    /** 管理员豁免（与 PermissionEvaluator / NotificationAdminAuthorization 的双 code 兼容一致）。 */
    private static final List<String> ADMIN_ROLES = List.of("admin", "ROLE_ADMIN");

    private final RowPermissionRepository permissionRepository;
    private final RowPermissionSourceRepository sourceRepository;
    private final RowPermissionGrantRepository grantRepository;
    private final DataScopeSubjectResolver subjectResolver;
    private final DataScopeVariables variables;
    private final ObjectMapper objectMapper;
    private final TenantProvider tenantProvider;

    public DataScopeService(RowPermissionRepository permissionRepository,
                            RowPermissionSourceRepository sourceRepository,
                            RowPermissionGrantRepository grantRepository,
                            DataScopeSubjectResolver subjectResolver,
                            DataScopeVariables variables,
                            ObjectMapper objectMapper,
                            TenantProvider tenantProvider) {
        this.permissionRepository = permissionRepository;
        this.sourceRepository = sourceRepository;
        this.grantRepository = grantRepository;
        this.subjectResolver = subjectResolver;
        this.variables = variables;
        this.objectMapper = objectMapper;
        this.tenantProvider = tenantProvider;
    }

    // ==================== 施加 ====================

    /** 对查询请求施加当前用户的读范围（无授权/管理员 = 原样返回）。 */
    public void applyRead(String dataSourceId, FilterAware request) {
        apply(dataSourceId, DataScopeAction.READ, request);
    }

    /** 把某动作的并集条件叠加到已带条件的请求上（列表/聚合共用）。 */
    public void apply(String dataSourceId, DataScopeAction action, FilterAware request) {
        applyAll(dataSourceId, List.of(action), request);
    }

    /**
     * 多动作叠加（交集）：按 id 反查归属时，读范围与写范围必须同时满足。
     * 每个动作各自是「组间 OR、组内 AND」，交集按笛卡尔积展开成新的组。
     */
    public void applyAll(String dataSourceId, Collection<DataScopeAction> actions, FilterAware request) {
        if (request == null) {
            return;
        }
        List<List<Map<String, Object>>> groups = scopeGroups(dataSourceId, actions);
        if (groups.isEmpty()) {
            stripRowScope(request);
            return;
        }
        request.setFilter(composeFilter(request.getFilter(), groups));
    }

    /** 当前用户在某数据源某动作上的生效条件组；空 List = 不受限。 */
    public List<List<Map<String, Object>>> scopeGroups(String dataSourceId, DataScopeAction action) {
        return scopeGroups(dataSourceId, action, currentUser());
    }

    /** 多个动作的生效条件组交集；某个动作不受限时结果只受其余动作约束。 */
    public List<List<Map<String, Object>>> scopeGroups(String dataSourceId, Collection<DataScopeAction> actions) {
        List<List<Map<String, Object>>> combined = null;
        for (DataScopeAction action : new LinkedHashSet<>(actions)) {
            List<List<Map<String, Object>>> groups = scopeGroups(dataSourceId, action);
            if (groups.isEmpty()) {
                continue;
            }
            combined = combined == null ? groups : crossProduct(combined, groups);
        }
        return combined == null ? List.of() : combined;
    }

    private static List<List<Map<String, Object>>> crossProduct(List<List<Map<String, Object>>> left,
                                                               List<List<Map<String, Object>>> right) {
        List<List<Map<String, Object>>> out = new ArrayList<>(left.size() * right.size());
        for (List<Map<String, Object>> l : left) {
            for (List<Map<String, Object>> r : right) {
                List<Map<String, Object>> merged = new ArrayList<>(l.size() + r.size());
                merged.addAll(l);
                merged.addAll(r);
                out.add(merged);
            }
        }
        return out;
    }

    /** 指定主体的生效条件组（施加路径的唯一出口，「当前用户」与「指定用户」走同一实现）。 */
    public List<List<Map<String, Object>>> scopeGroups(String dataSourceId, DataScopeAction action, LoginUser user) {
        return resolveGroups(appliedPermissions(dataSourceId, action, user), user);
    }

    /** 当前用户在该数据源是否有生效范围（用于「是否存在单条归属校验」的快速判断）。 */
    public boolean hasScope(String dataSourceId, DataScopeAction action) {
        return !scopeGroups(dataSourceId, action).isEmpty();
    }

    private List<RowPermission> appliedPermissions(String dataSourceId, DataScopeAction action, LoginUser user) {
        if (dataSourceId == null || dataSourceId.isBlank() || action == null || user == null || isAdmin(user)) {
            return List.of();
        }
        Set<String> subjects = subjectResolver.subjectsOf(user);
        if (subjects.isEmpty()) {
            return List.of();
        }
        String tenantId = tenantProvider.getTenantId();
        List<Long> permissionIds = sourceRepository.findByTenantIdAndDataSourceId(tenantId, dataSourceId).stream()
                .map(RowPermissionSource::getPermissionId)
                .distinct()
                .toList();
        if (permissionIds.isEmpty()) {
            return List.of();
        }
        Set<Long> grantedIds = grantRepository
                .findByTenantIdAndPermissionIdInAndAction(tenantId, permissionIds, action).stream()
                .filter(g -> subjects.contains(g.subjectRef()))
                .map(RowPermissionGrant::getPermissionId)
                .collect(Collectors.toSet());
        if (grantedIds.isEmpty()) {
            return List.of();
        }
        return permissionRepository.findByTenantIdAndIdIn(tenantId, grantedIds).stream()
                .sorted(Comparator.comparing(RowPermission::getId))
                .toList();
    }

    private List<List<Map<String, Object>>> resolveGroups(List<RowPermission> permissions, LoginUser user) {
        List<List<Map<String, Object>>> groups = new ArrayList<>();
        for (RowPermission permission : permissions) {
            List<Map<String, Object>> conditions = parseConditions(permission.getConditionsJson());
            if (conditions.isEmpty()) {
                // 显式放行对象命中：并集里只要有一条不受限，整体就不受限
                return List.of();
            }
            groups.add(resolveConditions(conditions, user));
        }
        return groups;
    }

    // ==================== 内部 ====================

    private Map<String, Object> leaf(String column, String op, Object value) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("column", column);
        out.put("op", op);
        out.put("value", value);
        return out;
    }

    /** 读取已存条件（管理端展示用）；空串视为无条件。 */
    public List<Map<String, Object>> parseStoredConditions(String conditionsJson) {
        return parseConditions(conditionsJson);
    }

    private List<Map<String, Object>> parseConditions(String conditionsJson) {
        if (conditionsJson == null || conditionsJson.isBlank()) {
            return List.of();
        }
        try {
            List<Map<String, Object>> list = objectMapper.readValue(
                    conditionsJson, new TypeReference<List<Map<String, Object>>>() { });
            return list == null ? List.of() : list;
        } catch (JsonProcessingException e) {
            throw new BusinessException(500, "行权限对象条件不是合法 JSON，请检查配置");
        }
    }

    private String writeConditions(List<Map<String, Object>> conditions) {
        try {
            return objectMapper.writeValueAsString(conditions);
        } catch (JsonProcessingException e) {
            throw new BusinessException(500, "行权限条件写入失败");
        }
    }

    /**
     * 保存期校验：结构、列名、运算符、取值形态（对象级权限管理复用，不解析用户模板）。
     * 空条件对象在 v2 保存入口一律拒绝——「全部可见」靠不关联表达，不靠一条空条件。
     */
    public List<Map<String, Object>> validateConditions(List<Map<String, Object>> conditions) {
        if (conditions == null || conditions.isEmpty()) {
            throw new BusinessException(400, "权限对象至少需要一条条件；全部可见请直接不关联权限对象");
        }
        List<Map<String, Object>> out = new ArrayList<>(conditions.size());
        for (Map<String, Object> condition : conditions) {
            if (condition == null || condition.get("column") == null) {
                throw new BusinessException(400, "行权限条件缺少列名");
            }
            String column = requireColumn(String.valueOf(condition.get("column")));
            String op = normalizeOp(condition);
            Object value = condition.get("value");
            validateRawValue(value, op);
            out.add(leaf(column, op, value));
        }
        return out;
    }

    /** 逐叶解析模板并校验列/运算符；非法配置快速失败，绝不静默降级为放行。 */
    private List<Map<String, Object>> resolveConditions(List<Map<String, Object>> conditions, LoginUser user) {
        if (conditions.isEmpty()) {
            return List.of();
        }
        List<Map<String, Object>> out = new ArrayList<>(conditions.size());
        for (Map<String, Object> condition : conditions) {
            if (condition == null || condition.get("column") == null) {
                throw new BusinessException(400, "行权限条件缺少列名");
            }
            String column = requireColumn(String.valueOf(condition.get("column")));
            String op = normalizeOp(condition);
            Object value = resolveValue(condition.get("value"), op, user);
            validateResolvedValue(value, op);
            out.add(leaf(column, op, value));
        }
        return out;
    }

    private String normalizeOp(Map<String, Object> condition) {
        String op = condition.get("op") == null ? "eq" : String.valueOf(condition.get("op")).toLowerCase();
        if (!ALLOWED_OPS.contains(op)) {
            throw new BusinessException(400, "行权限条件使用了未知运算符: " + op);
        }
        return op;
    }

    /** 保存期形态校验：生成器对空列表/形状不符的叶子会直接跳过，跳过等于静默放行，必须当场拒绝。 */
    private void validateRawValue(Object value, String op) {
        if ("isempty".equals(op) || "isnotempty".equals(op)) {
            return;
        }
        if (value == null) {
            throw new BusinessException(400, "行权限条件缺少取值");
        }
        if (value instanceof List<?> list) {
            if ("in".equals(op)) {
                if (list.isEmpty()) {
                    throw new BusinessException(400, "行权限条件 op=in 的取值必须是非空列表");
                }
                for (Object item : list) {
                    if (item == null) {
                        throw new BusinessException(400, "行权限条件 op=in 的列表取值不能包含空值");
                    }
                    if (item instanceof String text) {
                        requireValueExpression(text, op);
                    }
                }
                return;
            }
            if ("range".equals(op)) {
                if (list.size() != 2 || list.get(0) == null || list.get(1) == null) {
                    throw new BusinessException(400, "行权限条件 op=range 的取值必须是两个非空值");
                }
                for (Object item : list) {
                    if (item instanceof String text) {
                        requireValueExpression(text, op);
                    }
                }
                return;
            }
            throw new BusinessException(400, "行权限条件 op=" + op + " 不能使用列表取值");
        }
        if (value instanceof String text) {
            // 单个字符串能当列表用的唯一情形：整个取值就是一个集合变量，由 in 展开
            if (("in".equals(op) || "range".equals(op)) && !isWholeListVariable(text)) {
                throw new BusinessException(400, "行权限条件 op=" + op + " 需要列表取值");
            }
            requireValueExpression(text, op);
        }
    }

    /** 解析期形态校验：函数可能把单值变成列表，必须在求值之后检查。 */
    private void validateResolvedValue(Object value, String op) {
        if ("isempty".equals(op) || "isnotempty".equals(op)) {
            return;
        }
        if ("in".equals(op)) {
            if (!(value instanceof List<?> list) || list.isEmpty()) {
                throw new BusinessException(400, "行权限条件 op=in 的取值必须是非空列表");
            }
            return;
        }
        if ("range".equals(op)) {
            if (!(value instanceof List<?> range) || range.size() != 2
                    || range.get(0) == null || range.get(1) == null) {
                throw new BusinessException(400, "行权限条件 op=range 的取值必须是两个非空值");
            }
            return;
        }
        if (value instanceof List<?>) {
            throw new BusinessException(400, "行权限条件 op=" + op + " 不能使用列表取值");
        }
        if (value == null) {
            throw new BusinessException(400, "行权限条件缺少取值");
        }
    }

    private Object resolveValue(Object value, String op, LoginUser user) {
        if (value instanceof List<?> list) {
            List<Object> resolved = new ArrayList<>(list.size());
            for (Object item : list) {
                appendResolved(resolved, resolveScalar(item, op, user));
            }
            return resolved;
        }
        return resolveScalar(value, op, user);
    }

    /**
     * 一项解析出多个值（集合变量）时并入列表，而不是嵌套成一项：
     * 列表形状是 {@code in} 运算符的语义，不是某种取值的专属形态，
     * 所以 {@code in: 5, {orgIdSubtree}} 这种混写展开后仍然是一维的 id 列表。
     */
    private static void appendResolved(List<Object> target, Object resolved) {
        if (resolved instanceof List<?> expanded) {
            target.addAll(expanded);
            return;
        }
        target.add(resolved);
    }

    private Object resolveScalar(Object value, String op, LoginUser user) {
        if (value instanceof String text) {
            // 与保存期同一份校验：直接写库或协议变更后的脏配置在求值前就拒，绝不带病拼 SQL
            requireValueExpression(text, op);
            return resolveTemplate(text, user);
        }
        if (value == null) {
            if ("isempty".equals(op) || "isnotempty".equals(op)) {
                return null;
            }
            throw new BusinessException(400, "行权限条件缺少取值");
        }
        return value;
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

    /** 保存期取值校验：变量必须在白名单内；集合变量只能独占一项且配 in；其余按字面量。 */
    private String requireValueExpression(String value, String op) {
        if (value == null || value.isBlank()) {
            throw new BusinessException(400, "数据范围缺少取值（支持字面量与 "
                    + "{userId} / {username} / {orgId} / {orgIdSubtree} 变量）");
        }
        String wholeVariable = wholeVariableName(value);
        boolean listVariable = wholeVariable != null && DataScopeVariables.isListVariable(wholeVariable);
        Matcher m = TEMPLATE_PATTERN.matcher(value);
        while (m.find()) {
            String name = m.group(1);
            if (!DataScopeVariables.KNOWN.contains(name)) {
                throw new BusinessException(400, "数据范围取值使用了未知变量: {" + name + "}");
            }
            if (DataScopeVariables.isListVariable(name) && !listVariable) {
                throw new BusinessException(400,
                        "集合变量 {" + name + "} 要展开成一批 id，只能独占整个取值，不能与其他文字拼接: " + value);
            }
        }
        if (listVariable && !"in".equals(op)) {
            throw new BusinessException(400, "集合变量 {" + wholeVariable + "} 展开为多个取值，只能配合 in 使用");
        }
        return value;
    }

    /** 整个取值就是一个变量时返回变量名；带别的文字（或多个变量）返回 null。 */
    private static String wholeVariableName(String value) {
        Matcher m = TEMPLATE_PATTERN.matcher(value.trim());
        return m.matches() ? m.group(1) : null;
    }

    /** 整个取值就是一个集合变量（单个字符串也能当列表用的唯一情形）。 */
    private static boolean isWholeListVariable(String value) {
        String name = wholeVariableName(value);
        return name != null && DataScopeVariables.isListVariable(name);
    }

    /**
     * 解析取值：整串就是一个变量时直接求值（集合变量在这里展开成 id 列表），
     * 其余按字符串就地替换标量变量，未知变量与解析后为空一律拒绝——静默放行等于范围失效。
     */
    private Object resolveTemplate(String template, LoginUser user) {
        if (template == null || template.isBlank()) {
            throw new BusinessException(400, "数据范围缺少取值，无法为该主体施加过滤");
        }
        String wholeVariable = wholeVariableName(template);
        if (wholeVariable != null) {
            return variables.resolve(wholeVariable, user);
        }
        Matcher m = TEMPLATE_PATTERN.matcher(template);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            String name = m.group(1);
            if (DataScopeVariables.isListVariable(name)) {
                // 保存期已拒这一形，这里兜住直接写库或协议变更后的脏配置
                throw new BusinessException(400,
                        "集合变量 {" + name + "} 要展开成一批 id，只能独占整个取值，不能与其他文字拼接: " + template);
            }
            String resolved = String.valueOf(variables.resolve(name, user));
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
     * 把并集条件写入调用方 filter 的保留键，客户端自带同名键先移除。
     *
     * <p>保留键与调用方 filter 的原有形态互不干扰：三个 SQL 生成器先处理保留键（独立 AND 段），
     * 其余顶层键（map 形态或 conditions 形态）照旧。这样客户端 OR 筛选不再需要为范围让步。
     */
    private String composeFilter(String callerFilterJson, List<List<Map<String, Object>>> groups) {
        Map<String, Object> caller = parseFilter(callerFilterJson);
        caller.remove(FilterAware.ROW_SCOPE_KEY);
        caller.put(FilterAware.ROW_SCOPE_KEY, groups);
        return writeFilter(caller);
    }

    /** 无生效范围时也要丢弃客户端伪造的保留键，保证该通道只由服务端写入。 */
    private void stripRowScope(FilterAware request) {
        String json = request.getFilter();
        if (json == null || !json.contains(FilterAware.ROW_SCOPE_KEY)) {
            return;
        }
        Map<String, Object> caller = parseFilter(json);
        if (caller.remove(FilterAware.ROW_SCOPE_KEY) != null) {
            request.setFilter(writeFilter(caller));
        }
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
