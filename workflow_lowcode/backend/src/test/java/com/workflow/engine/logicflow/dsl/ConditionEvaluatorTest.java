package com.workflow.engine.logicflow.dsl;

import com.workflow.common.exception.BusinessException;
import com.workflow.engine.logic.parse.VariableResolver;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ConditionEvaluatorTest {

    private final VariableResolver resolver = new VariableResolver();

    // ------------------------------------------------------------------
    // EQ / NE：数值可解析优先，否则字符串
    // ------------------------------------------------------------------

    @Test
    void eq_numericPriorityWhenBothParsable() {
        assertThat(ConditionEvaluator.evaluate("amount", "EQ", "100", Map.of("amount", 100), resolver)).isTrue();
        // "100" 与 "100.0" 数值相等
        assertThat(ConditionEvaluator.evaluate("amount", "EQ", "100.0", Map.of("amount", 100), resolver)).isTrue();
        assertThat(ConditionEvaluator.evaluate("amount", "EQ", "99", Map.of("amount", 100), resolver)).isFalse();
    }

    @Test
    void eq_stringFallbackWhenNotNumeric() {
        assertThat(ConditionEvaluator.evaluate("status", "EQ", "PASS", Map.of("status", "PASS"), resolver)).isTrue();
        // 字符串比较大小写敏感
        assertThat(ConditionEvaluator.evaluate("status", "EQ", "pass", Map.of("status", "PASS"), resolver)).isFalse();
    }

    @Test
    void ne_isNegationOfEq() {
        assertThat(ConditionEvaluator.evaluate("status", "NE", "PASS", Map.of("status", "FAIL"), resolver)).isTrue();
        assertThat(ConditionEvaluator.evaluate("status", "NE", "PASS", Map.of("status", "PASS"), resolver)).isFalse();
        // 数值形态不相等
        assertThat(ConditionEvaluator.evaluate("amount", "NE", "100", Map.of("amount", 99), resolver)).isTrue();
    }

    // ------------------------------------------------------------------
    // GT / LT / GTE / LTE
    // ------------------------------------------------------------------

    @Test
    void numericCompare() {
        assertThat(ConditionEvaluator.evaluate("amount", "GT", "100", Map.of("amount", 150), resolver)).isTrue();
        assertThat(ConditionEvaluator.evaluate("amount", "GT", "100", Map.of("amount", 100), resolver)).isFalse();
        assertThat(ConditionEvaluator.evaluate("amount", "GTE", "100", Map.of("amount", 100), resolver)).isTrue();
        assertThat(ConditionEvaluator.evaluate("amount", "LT", "100", Map.of("amount", 99.5), resolver)).isTrue();
        assertThat(ConditionEvaluator.evaluate("amount", "LTE", "100", Map.of("amount", 100.0), resolver)).isTrue();
        assertThat(ConditionEvaluator.evaluate("amount", "LTE", "100", Map.of("amount", 101), resolver)).isFalse();
    }

    @Test
    void stringCompareWhenEitherSideNotNumeric() {
        assertThat(ConditionEvaluator.evaluate("name", "GT", "aaa", Map.of("name", "bbb"), resolver)).isTrue();
        assertThat(ConditionEvaluator.evaluate("name", "LT", "zzz", Map.of("name", "bbb"), resolver)).isTrue();
        // 一侧数值一侧文本 → 退化为字符串比较（"10" < "abc"）
        assertThat(ConditionEvaluator.evaluate("v", "GT", "abc", Map.of("v", 10), resolver)).isFalse();
        assertThat(ConditionEvaluator.evaluate("v", "LT", "abc", Map.of("v", 10), resolver)).isTrue();
    }

    @Test
    void decimalPrecision() {
        assertThat(ConditionEvaluator.evaluate("price", "GTE", "10.50", Map.of("price", 10.5), resolver)).isTrue();
        assertThat(ConditionEvaluator.evaluate("price", "GT", "10.49", Map.of("price", 10.5), resolver)).isTrue();
    }

    // ------------------------------------------------------------------
    // value 支持 {{var}} 占位符
    // ------------------------------------------------------------------

    @Test
    void valuePlaceholderResolvedBeforeCompare() {
        Map<String, Object> vars = new java.util.HashMap<>();
        vars.put("env", "prod");
        vars.put("expected", "prod");
        assertThat(ConditionEvaluator.evaluate("env", "EQ", "{{expected}}", vars, resolver)).isTrue();
        vars.put("expected", "test");
        assertThat(ConditionEvaluator.evaluate("env", "EQ", "{{expected}}", vars, resolver)).isFalse();
    }

    @Test
    void missingPlaceholderResolvesToEmptyString() {
        assertThat(ConditionEvaluator.evaluate("v", "EQ", "{{missing}}", Map.of("v", "x"), resolver)).isFalse();
        assertThat(ConditionEvaluator.evaluate("v", "NE", "{{missing}}", Map.of("v", "x"), resolver)).isTrue();
    }

    // ------------------------------------------------------------------
    // EMPTY / NOT_EMPTY：判 null 或空白串
    // ------------------------------------------------------------------

    @Test
    void emptyAndNotEmpty() {
        assertThat(ConditionEvaluator.evaluate("ghost", "EMPTY", null, Map.of(), resolver)).isTrue();
        assertThat(ConditionEvaluator.evaluate("blank", "EMPTY", null, Map.of("blank", "  "), resolver)).isTrue();
        assertThat(ConditionEvaluator.evaluate("blank", "EMPTY", null, Map.of("blank", ""), resolver)).isTrue();
        assertThat(ConditionEvaluator.evaluate("v", "EMPTY", null, Map.of("v", "x"), resolver)).isFalse();
        assertThat(ConditionEvaluator.evaluate("ghost", "NOT_EMPTY", null, Map.of(), resolver)).isFalse();
        assertThat(ConditionEvaluator.evaluate("v", "NOT_EMPTY", null, Map.of("v", "x"), resolver)).isTrue();
    }

    // ------------------------------------------------------------------
    // 缺失变量 / operator 大小写 / 未知 operator
    // ------------------------------------------------------------------

    @Test
    void missingVariableTreatedAsEmptyStringForCompare() {
        assertThat(ConditionEvaluator.evaluate("ghost", "EQ", "", Map.of(), resolver)).isTrue();
        assertThat(ConditionEvaluator.evaluate("ghost", "EQ", "x", Map.of(), resolver)).isFalse();
    }

    @Test
    void operatorCaseInsensitive() {
        assertThat(ConditionEvaluator.evaluate("amount", "eq", "100", Map.of("amount", 100), resolver)).isTrue();
        assertThat(ConditionEvaluator.evaluate("amount", "Gt", "100", Map.of("amount", 150), resolver)).isTrue();
        assertThat(ConditionEvaluator.evaluate("ghost", "not_empty", null, Map.of(), resolver)).isFalse();
    }

    @Test
    void unknownOperatorThrowsBusinessException() {
        assertThatThrownBy(() -> ConditionEvaluator.evaluate("v", "LIKE", "x", Map.of("v", "x"), resolver))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("UNKNOWN_CONDITION_OPERATOR")
                .hasMessageContaining("LIKE");
        assertThatThrownBy(() -> ConditionEvaluator.evaluate("v", null, "x", Map.of("v", "x"), resolver))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void booleanVariableComparesAsString() {
        assertThat(ConditionEvaluator.evaluate("flag", "EQ", "true", Map.of("flag", true), resolver)).isTrue();
        assertThat(ConditionEvaluator.evaluate("flag", "EQ", "false", Map.of("flag", true), resolver)).isFalse();
    }
}
