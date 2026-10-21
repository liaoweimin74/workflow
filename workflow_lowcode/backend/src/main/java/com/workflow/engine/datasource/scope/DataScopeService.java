package com.workflow.engine.datasource.scope;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.FilterAware;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.datasource.repository.DataSourceDefinitionRepository;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.framework.security.domain.LoginUser;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
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
 * 行权限（RowPermission）v3：「授权 = 赋予可见行」的白名单模型。
 *
 * <p>模型是三层：{@link RowPermission}（一组 AND 条件 + 名称）通过 {@link RowPermissionSource}
 * 关联到若干数据源，再通过 {@link RowPermissionGrant} 授予角色。
 * 授权的唯一写入口是「角色管理 → 数据权限」；这里只负责读取与施加。
 * 施加位置有两处，都调本类、条件构造出口只有本类一处：
 * {@code DataSourceDefinitionService}（数据源通道：列表/聚合/单条/改删）与
 * {@code BizDataScopeGuard}（业务表单底表通道：{@code /api/v1/biz-data/**} 的同类入口）；
 * 出码/前端一律不参与范围判定，范围只能在服务端成立。
 *
 * <p>语义约定（改动须同步这里的五条不变量）：
 * <ol>
 *   <li><b>关联即受控</b>：数据源被任意权限对象关联就进入受控状态；从未关联 = 现状行为（全租户可见），
 *       「不受数据权限控制」靠不关联表达。</li>
 *   <li><b>授权即赋予</b>：角色在受控数据源的可见行 = 它被授权对象之并集（对象间 OR，对象内 AND）；
 *       一条都没命中 = <b>0 行</b>。「未授权」不再是放行而是拒绝——这正是「授权」一词的本义。</li>
 *   <li><b>空条件对象 = 全部行</b>：把空条件对象授给某角色，该角色在该数据源看全部行；
 *       并集里只要命中一条不受限，整体不受限。</li>
 *   <li><b>看即能操作</b>：行可见性同时管读与改删——列表/聚合/单条与修改/删除按同一集合判定，
 *       看不到的行改不到也删不掉；新增不按行校验（新行还没有归属可比），归功能权限负责。</li>
 *   <li><b>保留键通道</b>：可见集合与客户端 filter 始终 AND，走独立保留键 {@link FilterAware#ROW_SCOPE_KEY}：
 *       键缺席 = 不受限，值为空数组 = 拒绝一切（生成器拼 {@code 1 = 0}），非空 = 条件组。
 *       客户端传入的同名键先被丢弃，该通道只由服务端写入；
 *       列名在注入前做标识符校验，取值只能来自服务端解析的模板变量。</li>
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
    private final DataSourceDefinitionRepository dataSourceRepository;

    public DataScopeService(RowPermissionRepository permissionRepository,
                            RowPermissionSourceRepository sourceRepository,
                            RowPermissionGrantRepository grantRepository,
                            DataScopeSubjectResolver subjectResolver,
                            DataScopeVariables variables,
                            ObjectMapper objectMapper,
                            TenantProvider tenantProvider,
                            DataSourceDefinitionRepository dataSourceRepository) {
        this.permissionRepository = permissionRepository;
        this.sourceRepository = sourceRepository;
        this.grantRepository = grantRepository;
        this.subjectResolver = subjectResolver;
        this.variables = variables;
        this.objectMapper = objectMapper;
        this.tenantProvider = tenantProvider;
        this.dataSourceRepository = dataSourceRepository;
    }

    // ==================== 施加 ====================

    /** 把当前用户在某数据源的可见集合叠加到请求上（不受限 = 原样返回并丢弃伪造保留键）。 */
    public void apply(String dataSourceId, FilterAware request) {
        if (request == null) {
            return;
        }
        EffectiveScope scope = effectiveScope(dataSourceId, currentUser());
        if (scope.unrestricted()) {
            stripRowScope(request);
            return;
        }
        request.setFilter(composeFilter(request.getFilter(), scope.groups()));
    }

    /** 当前用户在该数据源是否被范围约束（受控未授权 = true；无登录态/管理员/不受控 = false）。 */
    public boolean hasScope(String dataSourceId) {
        return !effectiveScope(dataSourceId, currentUser()).unrestricted();
    }

    /**
     * 业务表单底表通道（{@code /api/v1/biz-data/**}）的施加入口：先按 formKey 反查它的数据源，
     * 再走与数据源通道同一份判定。
     *
     * <p>「管理数据」页、表单里的数据引用选择器读的是 {@code wf_biz_<formKey>} 物理表本身，
     * 而权限对象挂在数据源上；同一张表两条通道若只有后者收紧，等于没收紧。
     * 查不到数据源 = 该表没有被任何数据源描述过，自然不受控。
     */
    public void applyByFormKey(String formKey, FilterAware request) {
        String dataSourceId = dataSourceIdOfForm(formKey);
        if (dataSourceId == null) {
            if (request != null) {
                stripRowScope(request);
            }
            return;
        }
        apply(dataSourceId, request);
    }

    /** 该表单底表通道是否受控（受控才需要付一次带条件的反查成本）。 */
    public boolean hasScopeByFormKey(String formKey) {
        String dataSourceId = dataSourceIdOfForm(formKey);
        return dataSourceId != null && hasScope(dataSourceId);
    }

    /** 读取已存条件（管理端展示用）；空串视为无条件。 */
    public List<Map<String, Object>> parseStoredConditions(String conditionsJson) {
        return parseConditions(conditionsJson);
    }

    /**
     * 保存期校验：结构、列名、运算符、取值形态（对象级权限管理复用，不解析用户模板）。
     * 空条件在 v3 是合法形态：「全部行」授权对象。
     */
    public List<Map<String, Object>> validateConditions(List<Map<String, Object>> conditions) {
        if (conditions == null || conditions.isEmpty()) {
            return List.of();
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

    // ==================== 判定 ====================

    /**
     * 当前用户在某数据源的可见集合。
     *
     * <p>无登录态返回不受限：内部链路（无安全上下文的系统取数）不因范围判定报错；
     * 面向用户的请求都带主体，走受控判定。
     */
    private EffectiveScope effectiveScope(String dataSourceId, LoginUser user) {
        if (dataSourceId == null || dataSourceId.isBlank() || user == null || isAdmin(user)) {
            return EffectiveScope.UNRESTRICTED;
        }
        String tenantId = tenantProvider.getTenantId();
        List<Long> permissionIds = sourceRepository.findByTenantIdAndDataSourceId(tenantId, dataSourceId).stream()
                .map(RowPermissionSource::getPermissionId)
                .distinct()
                .toList();
        if (permissionIds.isEmpty()) {
            return EffectiveScope.UNRESTRICTED;
        }
        Set<String> subjects = subjectResolver.subjectsOf(user);
        Set<Long> grantedIds = subjects.isEmpty() ? Set.of() : grantRepository
                .findByTenantIdAndPermissionIdIn(tenantId, permissionIds).stream()
                .filter(g -> subjects.contains(g.subjectRef()))
                .map(RowPermissionGrant::getPermissionId)
                .collect(Collectors.toSet());
        if (grantedIds.isEmpty()) {
            return EffectiveScope.DENIED;
        }
        List<RowPermission> permissions = permissionRepository.findByTenantIdAndIdIn(tenantId, grantedIds).stream()
                .sorted(Comparator.comparing(RowPermission::getId))
                .toList();
        if (permissions.isEmpty()) {
            // 授权指向已消失的对象：受控数据源上不静默放行，按拒绝处理
            return EffectiveScope.DENIED;
        }
        List<List<Map<String, Object>>> groups = new ArrayList<>(permissions.size());
        for (RowPermission permission : permissions) {
            List<Map<String, Object>> conditions = parseConditions(permission.getConditionsJson());
            if (conditions.isEmpty()) {
                // 空条件对象 = 全部行：并集里只要有一条不受限，整体不受限
                return EffectiveScope.UNRESTRICTED;
            }
            groups.add(resolveConditions(conditions, user));
        }
        return EffectiveScope.of(groups);
    }

    // ==================== 内部 ====================

    /**
     * formKey → 描述该业务表的数据源 id（租户内 formKey 唯一，与 {@code DataSourceSyncListener}
     * / {@code ModuleExportService} 的既有约定一致）。
     */
    private String dataSourceIdOfForm(String formKey) {
        if (formKey == null || formKey.isBlank()) {
            return null;
        }
        return dataSourceRepository
                .findByTenantIdAndFormKey(tenantProvider.getTenantId(), formKey)
                .map(DataSourceDefinition::getId)
                .orElse(null);
    }

    private static boolean isAdmin(LoginUser user) {
        return user.getRoles() != null && user.getRoles().stream().anyMatch(ADMIN_ROLES::contains);
    }

    private Map<String, Object> leaf(String column, String op, Object value) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("column", column);
        out.put("op", op);
        out.put("value", value);
        return out;
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

    /** 逐叶解析模板并校验列/运算符；非法配置快速失败，绝不静默降级为放行。 */
    private List<Map<String, Object>> resolveConditions(List<Map<String, Object>> conditions, LoginUser user) {
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
     * 把可见集合写入调用方 filter 的保留键，客户端自带同名键先移除。
     *
     * <p>保留键与调用方 filter 的原有形态互不干扰：三个 SQL 生成器先处理保留键（独立 AND 段），
     * 其余顶层键（map 形态或 conditions 形态）照旧。这样客户端 OR 筛选不再需要为范围让步。
     * {@code groups} 传空数组即拒绝一切（生成器拼 {@code 1 = 0}）。
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

    /** 三态可见集合：不受限（groups=null，键缺席）/ 拒绝一切（groups=空数组）/ 条件组。 */
    private record EffectiveScope(List<List<Map<String, Object>>> groups) {

        static final EffectiveScope UNRESTRICTED = new EffectiveScope(null);
        static final EffectiveScope DENIED = new EffectiveScope(List.of());

        static EffectiveScope of(List<List<Map<String, Object>>> groups) {
            return new EffectiveScope(groups);
        }

        boolean unrestricted() {
            return groups == null;
        }
    }
}
