package com.workflow.engine.datasource.scope;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.common.exception.BusinessException;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 字段策略 JSON 的解析/校验/合并唯一口径（对齐 PageTargetClients 的先例：
 * 同一协议只允许一份实现，保存侧与生效侧共用防漂移）。
 *
 * <p>协议：{@code [{"column":"phone","policy":"MASK","rule":"PHONE"},
 * {"column":"salary","policy":"HIDDEN"}]}；null/空串 = 无策略。
 *
 * <p>保存期即拒绝一切非法形态（未知枚举、MASK 缺规则、同列重复）——脏配置带入生效侧
 * 只能靠 fail-closed 兜底，而静默降级等于策略失效，所以这里一律快速失败。
 */
public final class FieldPolicies {

    /** 列名口径与行权限条件（DataScopeService.COLUMN_PATTERN）同一正则。 */
    private static final Pattern COLUMN_PATTERN = Pattern.compile("^[A-Za-z_][A-Za-z0-9_]{0,63}$");

    private static final ObjectMapper JSON = new ObjectMapper();

    private FieldPolicies() {
    }

    /** 解析 + 形态校验（列名、枚举、MASK 必带规则、同列不得重复）；非法即 400。 */
    public static List<FieldPolicy> parse(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        List<Map<String, Object>> entries;
        try {
            entries = JSON.readValue(json, new com.fasterxml.jackson.core.type.TypeReference<List<Map<String, Object>>>() { });
        } catch (JsonProcessingException e) {
            throw new BusinessException(400, "字段策略不是合法 JSON，请检查配置");
        }
        if (entries == null) {
            return List.of();
        }
        List<FieldPolicy> out = new ArrayList<>(entries.size());
        for (Map<String, Object> entry : entries) {
            out.add(parseEntry(entry));
        }
        requireNoDuplicateColumn(out);
        return List.copyOf(out);
    }

    /** DTO 形态（List<Map>）→ 领域对象：与 parse 同一校验口径，保存侧入口用它。 */
    public static List<FieldPolicy> fromEntries(List<Map<String, Object>> entries) {
        if (entries == null || entries.isEmpty()) {
            return List.of();
        }
        List<FieldPolicy> out = new ArrayList<>(entries.size());
        for (Map<String, Object> entry : entries) {
            out.add(parseEntry(entry));
        }
        requireNoDuplicateColumn(out);
        return List.copyOf(out);
    }

    /** 领域对象 → 回显形态（rule 键只在 MASK 出现；与存储 JSON 的条目结构一致）。 */
    public static List<Map<String, Object>> toJsonEntries(List<FieldPolicy> policies) {
        if (policies == null || policies.isEmpty()) {
            return List.of();
        }
        List<Map<String, Object>> entries = new ArrayList<>(policies.size());
        for (FieldPolicy policy : policies) {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("column", policy.column());
            entry.put("policy", policy.access().name());
            if (policy.rule() != null) {
                entry.put("rule", policy.rule().name());
            }
            entries.add(entry);
        }
        return entries;
    }

    /**
     * 保存期列知晓校验唯一口径：策略列必须被每个关联源声明为输出列。
     *
     * <p>掩码针对的是输出列而非可筛列（所以不用 scopeColumns）；内置列（id/created_at 等）
     * 不在策略范围——护住 rowId 与系统列协议。columnsBySource：源 id → 声明列 key 集；
     * nameResolver：源 id → 报错展示名。消息只在这里拼一次，两侧服务共用防漂移。
     */
    public static void requireColumnsKnown(List<FieldPolicy> policies, Map<String, Set<String>> columnsBySource,
                                           java.util.function.Function<String, String> nameResolver) {
        for (Map.Entry<String, Set<String>> entry : columnsBySource.entrySet()) {
            for (FieldPolicy policy : policies) {
                if (entry.getValue().contains(policy.column())) {
                    continue;
                }
                throw new BusinessException(400, "字段策略列 " + policy.column() + " 在数据源「"
                        + nameResolver.apply(entry.getKey()) + "」上不存在：策略只能针对源已声明的输出列");
            }
        }
    }

    /** 序列化为存储 JSON；空策略写 NULL 列（「没配」与「配了空」在语义上都是无策略）。 */
    public static String writeJson(List<FieldPolicy> policies) {
        if (policies == null || policies.isEmpty()) {
            return null;
        }
        List<Map<String, Object>> entries = toJsonEntries(policies);
        try {
            return JSON.writeValueAsString(entries);
        } catch (JsonProcessingException e) {
            throw new BusinessException(500, "字段策略写入失败");
        }
    }

    /**
     * 同一授权链内 grant 覆写对象基线：基线全部生效，grant 声明的列以 grant 为准
     * （设计语义词「覆写」：grant 是这条授权的精调，同列上比基线更有发言权）。
     */
    public static List<FieldPolicy> overlay(List<FieldPolicy> baseline, List<FieldPolicy> grantOverride) {
        if (grantOverride == null || grantOverride.isEmpty()) {
            return baseline == null ? List.of() : List.copyOf(baseline);
        }
        Map<String, FieldPolicy> byColumn = new LinkedHashMap<>();
        if (baseline != null) {
            baseline.forEach(p -> byColumn.put(p.column(), p));
        }
        grantOverride.forEach(p -> byColumn.put(p.column(), p));
        return List.copyOf(byColumn.values());
    }

    /**
     * 跨授权链按列取最严（HIDDEN &gt; MASK &gt; VISIBLE，即 FieldAccess 序数最大者）。
     *
     * <p>行集在并集后不可按行分离列策略，取最严是唯一 fail-closed 的合并语义：
     * 一份窄授权永远不会被另一份宽授权放大，配置错误只会更紧不会放松。
     *
     * @return 列名 → 生效策略（VISIBLE 也入表：显式声明的可见参与比较后可能胜出）
     */
    public static Map<String, FieldPolicy> mergeStrictest(List<List<FieldPolicy>> chains) {
        Map<String, FieldPolicy> merged = new LinkedHashMap<>();
        if (chains == null) {
            return merged;
        }
        for (List<FieldPolicy> chain : chains) {
            if (chain == null) {
                continue;
            }
            for (FieldPolicy policy : chain) {
                FieldPolicy current = merged.get(policy.column());
                if (current == null || policy.access().ordinal() > current.access().ordinal()) {
                    merged.put(policy.column(), policy);
                }
            }
        }
        return merged;
    }

    // ==================== 内部 ====================

    private static FieldPolicy parseEntry(Map<String, Object> entry) {
        if (entry == null) {
            throw new BusinessException(400, "字段策略条目不能为空");
        }
        Object columnRaw = entry.get("column");
        if (columnRaw == null || String.valueOf(columnRaw).isBlank()) {
            throw new BusinessException(400, "字段策略缺少列名");
        }
        String column = String.valueOf(columnRaw).trim();
        if (!COLUMN_PATTERN.matcher(column).matches()) {
            throw new BusinessException(400, "字段策略列名非法: " + column);
        }
        Object policyRaw = entry.get("policy");
        if (policyRaw == null || String.valueOf(policyRaw).isBlank()) {
            throw new BusinessException(400, "字段策略缺少处置（VISIBLE/MASK/HIDDEN）");
        }
        FieldAccess access = parseEnum(FieldAccess.class, String.valueOf(policyRaw),
                "字段策略使用了未知处置: ");
        Object ruleRaw = entry.get("rule");
        if (access == FieldAccess.MASK) {
            if (ruleRaw == null || String.valueOf(ruleRaw).isBlank()) {
                throw new BusinessException(400, "字段策略 MASK 必须引用脱敏规则: " + column);
            }
            return new FieldPolicy(column, access,
                    parseEnum(MaskRule.class, String.valueOf(ruleRaw), "字段策略使用了未知脱敏规则: "));
        }
        if (ruleRaw != null && !String.valueOf(ruleRaw).isBlank()) {
            throw new BusinessException(400, "脱敏规则只能配合 MASK 使用: " + column);
        }
        return new FieldPolicy(column, access, null);
    }

    private static void requireNoDuplicateColumn(List<FieldPolicy> policies) {
        List<String> seen = new ArrayList<>(policies.size());
        for (FieldPolicy policy : policies) {
            if (seen.contains(policy.column())) {
                throw new BusinessException(400, "同一列不能重复声明字段策略: " + policy.column());
            }
            seen.add(policy.column());
        }
    }

    private static <E extends Enum<E>> E parseEnum(Class<E> type, String raw, String messagePrefix) {
        try {
            return Enum.valueOf(type, raw.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new BusinessException(400, messagePrefix + raw);
        }
    }
}
