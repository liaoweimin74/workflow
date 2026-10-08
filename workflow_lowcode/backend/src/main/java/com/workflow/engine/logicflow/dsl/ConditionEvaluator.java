package com.workflow.engine.logicflow.dsl;

import com.workflow.common.exception.BusinessException;
import com.workflow.engine.logic.parse.VariableResolver;

import java.math.BigDecimal;
import java.util.Locale;
import java.util.Map;

/**
 * CONDITION 节点条件求值器（纯静态，无状态）。
 *
 * <p>语义：
 * <ul>
 *   <li>变量值取 {@code vars.get(variable)}；</li>
 *   <li>value 先经 {@link VariableResolver#resolve} 展开 {@code {{var}}} 占位符；</li>
 *   <li>GT/LT/GTE/LTE：双方均可解析为数值则数值比较，否则字符串 compareTo；</li>
 *   <li>EQ/NE：数值可解析优先按数值（"100" 与 "100.0" 相等），否则字符串；</li>
 *   <li>EMPTY/NOT_EMPTY：判 null 或空白串（不含 {{}} 展开，直接看变量原始值）；</li>
 *   <li>operator 大小写不敏感；未知 operator 抛 {@link BusinessException}。</li>
 * </ul>
 */
public final class ConditionEvaluator {

    private ConditionEvaluator() {
    }

    public static boolean evaluate(String variable, String operator, String value,
                                   Map<String, Object> vars, VariableResolver resolver) {
        if (operator == null || operator.isBlank()) {
            throw new BusinessException("CONDITION_OPERATOR_REQUIRED: operator is blank");
        }
        String op = operator.trim().toUpperCase(Locale.ROOT);
        Object left = vars != null ? vars.get(variable) : null;

        switch (op) {
            case "EMPTY", "NOT_EMPTY" -> {
                boolean empty = left == null || String.valueOf(left).isBlank();
                return "EMPTY".equals(op) == empty;
            }
            case "EQ", "NE" -> {
                boolean equals = compare(left, resolveValue(value, vars, resolver)) == 0;
                return "EQ".equals(op) == equals;
            }
            case "GT", "LT", "GTE", "LTE" -> {
                int cmp = compare(left, resolveValue(value, vars, resolver));
                return switch (op) {
                    case "GT" -> cmp > 0;
                    case "LT" -> cmp < 0;
                    case "GTE" -> cmp >= 0;
                    default -> cmp <= 0;
                };
            }
            default -> throw new BusinessException("UNKNOWN_CONDITION_OPERATOR: " + operator);
        }
    }

    /** value 支持 {{var}} 占位符（先展开再比较）；null 视为 null 字面量。 */
    private static String resolveValue(String value, Map<String, Object> vars, VariableResolver resolver) {
        if (value == null) {
            return null;
        }
        return resolver != null ? resolver.resolve(value, vars) : value;
    }

    /**
     * 比较规则：双方均可解析为数值 → 数值比较；否则字符串比较（null 归一为空串）。
     *
     * @return 负数/0/正数，语义同 {@link Comparable#compareTo}
     */
    private static int compare(Object left, String right) {
        String leftText = left == null ? "" : String.valueOf(left);
        String rightText = right == null ? "" : right;

        BigDecimal leftNumber = tryParse(leftText);
        BigDecimal rightNumber = tryParse(rightText);
        if (leftNumber != null && rightNumber != null) {
            return leftNumber.compareTo(rightNumber);
        }
        return leftText.compareTo(rightText);
    }

    /** 可解析数值（整数/小数/科学计数）返回 BigDecimal，否则 null。 */
    private static BigDecimal tryParse(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        try {
            return new BigDecimal(text.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
