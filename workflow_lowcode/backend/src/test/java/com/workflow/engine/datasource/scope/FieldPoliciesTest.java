package com.workflow.engine.datasource.scope;

import com.workflow.common.exception.BusinessException;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 字段策略协议唯一口径：解析校验（保存期把关，防配置面成为泄漏面）、
 * 链内 grant 覆写基线、跨链按列取最严（strictest-wins）。
 */
class FieldPoliciesTest {

    private static FieldPolicy policy(String column, FieldAccess access, MaskRule rule) {
        return new FieldPolicy(column, access, rule);
    }

    // ==================== parse ====================

    @Test
    void parsesFullFormAndRoundTrips() {
        String json = "[{\"column\":\"phone\",\"policy\":\"MASK\",\"rule\":\"PHONE\"},"
                + "{\"column\":\"salary\",\"policy\":\"HIDDEN\"},"
                + "{\"column\":\"name\",\"policy\":\"VISIBLE\"}]";
        List<FieldPolicy> parsed = FieldPolicies.parse(json);
        assertEquals(List.of(
                policy("phone", FieldAccess.MASK, MaskRule.PHONE),
                policy("salary", FieldAccess.HIDDEN, null),
                policy("name", FieldAccess.VISIBLE, null)), parsed);
        // 写回再读必须等价（存储格式稳定）
        assertEquals(parsed, FieldPolicies.parse(FieldPolicies.writeJson(parsed)));
    }

    @Test
    void nullOrBlankJsonMeansNoPolicies() {
        assertTrue(FieldPolicies.parse(null).isEmpty());
        assertTrue(FieldPolicies.parse("  ").isEmpty());
    }

    @Test
    void emptyListWritesNullForStorage() {
        assertNull(FieldPolicies.writeJson(List.of()));
    }

    @Test
    void rejectsMalformedJsonWith400() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> FieldPolicies.parse("{not-json"));
        assertEquals(400, ex.getCode());
    }

    @Test
    void rejectsIllegalColumnNames() {
        assertThrows(BusinessException.class, () -> FieldPolicies.parse(
                "[{\"column\":\"a b\",\"policy\":\"HIDDEN\"}]"));
        assertThrows(BusinessException.class, () -> FieldPolicies.parse(
                "[{\"column\":\"手机号\",\"policy\":\"HIDDEN\"}]"));
        assertThrows(BusinessException.class, () -> FieldPolicies.parse(
                "[{\"policy\":\"HIDDEN\"}]"));
    }

    @Test
    void acceptsPolicyAndRuleCaseInsensitivelyButRejectsUnknownValues() {
        assertEquals(List.of(policy("phone", FieldAccess.MASK, MaskRule.PHONE)),
                FieldPolicies.parse("[{\"column\":\"phone\",\"policy\":\"mask\",\"rule\":\"phone\"}]"));
        assertThrows(BusinessException.class, () -> FieldPolicies.parse(
                "[{\"column\":\"phone\",\"policy\":\"DELETE\"}]"));
        assertThrows(BusinessException.class, () -> FieldPolicies.parse(
                "[{\"column\":\"phone\",\"policy\":\"MASK\",\"rule\":\"HOME_ADDRESS\"}]"));
    }

    @Test
    void maskRequiresRuleAndOtherAccessesForbidRule() {
        assertThrows(BusinessException.class, () -> FieldPolicies.parse(
                "[{\"column\":\"phone\",\"policy\":\"MASK\"}]"));
        assertThrows(BusinessException.class, () -> FieldPolicies.parse(
                "[{\"column\":\"phone\",\"policy\":\"HIDDEN\",\"rule\":\"PHONE\"}]"));
        assertThrows(BusinessException.class, () -> FieldPolicies.parse(
                "[{\"column\":\"phone\"}]"));
    }

    @Test
    void rejectsDuplicateColumnInOneList() {
        BusinessException ex = assertThrows(BusinessException.class, () -> FieldPolicies.parse(
                "[{\"column\":\"phone\",\"policy\":\"HIDDEN\"},{\"column\":\"phone\",\"policy\":\"VISIBLE\"}]"));
        assertEquals(400, ex.getCode());
    }

    // ==================== overlay（链内：grant 覆写对象基线） ====================

    @Test
    void grantOverridesBaselineOnSameColumnAndKeepsOthers() {
        List<FieldPolicy> baseline = List.of(
                policy("phone", FieldAccess.MASK, MaskRule.PHONE),
                policy("salary", FieldAccess.HIDDEN, null));
        List<FieldPolicy> grant = List.of(policy("phone", FieldAccess.VISIBLE, null));
        Map<String, FieldPolicy> overlaid = FieldPolicies.overlay(baseline, grant).stream()
                .collect(java.util.stream.Collectors.toMap(FieldPolicy::column, p -> p));
        assertEquals(FieldAccess.VISIBLE, overlaid.get("phone").access());
        assertEquals(FieldAccess.HIDDEN, overlaid.get("salary").access());
    }

    @Test
    void grantNullKeepsBaselineUnchanged() {
        List<FieldPolicy> baseline = List.of(policy("phone", FieldAccess.MASK, MaskRule.PHONE));
        assertEquals(baseline, FieldPolicies.overlay(baseline, null));
    }

    // ==================== mergeStrictest（跨链取最严） ====================

    @Test
    void mergesColumnWiseTakingStrictest() {
        List<List<FieldPolicy>> chains = List.of(
                List.of(policy("phone", FieldAccess.MASK, MaskRule.PHONE),
                        policy("name", FieldAccess.VISIBLE, null)),
                List.of(policy("phone", FieldAccess.HIDDEN, null)));
        Map<String, FieldPolicy> merged = FieldPolicies.mergeStrictest(chains);
        // 窄授权不被宽授权放大：phone 两处命中，HIDDEN 胜
        assertEquals(FieldAccess.HIDDEN, merged.get("phone").access());
        assertNull(merged.get("phone").rule());
        assertEquals(FieldAccess.VISIBLE, merged.get("name").access());
    }

    @Test
    void maskWinsOverVisibleAndKeepsWinnerRule() {
        List<List<FieldPolicy>> chains = List.of(
                List.of(policy("idcard", FieldAccess.VISIBLE, null)),
                List.of(policy("idcard", FieldAccess.MASK, MaskRule.ID_CARD)));
        Map<String, FieldPolicy> merged = FieldPolicies.mergeStrictest(chains);
        assertEquals(FieldAccess.MASK, merged.get("idcard").access());
        assertEquals(MaskRule.ID_CARD, merged.get("idcard").rule());
    }

    // ==================== fromEntries / toJsonEntries（DTO 形态 ↔ 领域对象） ====================

    @Test
    void fromEntriesValidatesSameProtocolAsParse() {
        List<Map<String, Object>> entries = List.of(
                Map.of("column", "phone", "policy", "mask", "rule", "phone"),
                Map.of("column", "salary", "policy", "HIDDEN"));
        assertEquals(List.of(
                policy("phone", FieldAccess.MASK, MaskRule.PHONE),
                policy("salary", FieldAccess.HIDDEN, null)), FieldPolicies.fromEntries(entries));

        // 形态非法与 parse 同一口径快速失败
        assertThrows(BusinessException.class, () -> FieldPolicies.fromEntries(
                List.of(Map.of("column", "phone", "policy", "MASK"))));
        assertThrows(BusinessException.class, () -> FieldPolicies.fromEntries(
                List.of(Map.of("column", "phone", "policy", "MASK"),
                        Map.of("column", "phone", "policy", "HIDDEN"))));
    }

    @Test
    void nullOrEmptyEntriesMeanNoPolicies() {
        assertTrue(FieldPolicies.fromEntries(null).isEmpty());
        assertTrue(FieldPolicies.fromEntries(List.of()).isEmpty());
    }

    @Test
    void toJsonEntriesEchoesColumnPolicyRule() {
        List<Map<String, Object>> out = FieldPolicies.toJsonEntries(
                List.of(policy("phone", FieldAccess.MASK, MaskRule.PHONE),
                        policy("salary", FieldAccess.HIDDEN, null)));
        assertEquals("phone", out.get(0).get("column"));
        assertEquals("MASK", out.get(0).get("policy"));
        assertEquals("PHONE", out.get(0).get("rule"));
        assertEquals("HIDDEN", out.get(1).get("policy"));
        assertTrue(!out.get(1).containsKey("rule"));
        assertTrue(FieldPolicies.toJsonEntries(List.of()).isEmpty());
    }
}
