package com.workflow.engine.datasource.scope;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * 内置脱敏规则集规格（designs §2.4 规则用平台内置：手机/姓名/身份证/车牌/地理泛化）。
 *
 * <p>钉死两件事：①每个规则的精确输出形态；②fail-closed——形态不符全掩，绝不原样放行。
 */
class MaskRuleTest {

    // ==================== PHONE ====================

    @Test
    void phoneKeepsFirst3AndLast4() {
        assertEquals("138****5678", MaskRule.PHONE.apply("13812345678"));
    }

    @Test
    void phoneAppliesToNumericCellToo() {
        // 非 null 一律转字符串套规则：手机号存成数字也不能漏
        assertEquals("138****5678", MaskRule.PHONE.apply(13812345678L));
    }

    @Test
    void phoneMasksWholeValueWhenShapeMismatch() {
        assertEquals("***", MaskRule.PHONE.apply("1381234567"));
        assertEquals("***", MaskRule.PHONE.apply("abc"));
    }

    // ==================== NAME ====================

    @Test
    void nameKeepsSurnameAndStarsRest() {
        assertEquals("张*", MaskRule.NAME.apply("张三"));
        assertEquals("欧***", MaskRule.NAME.apply("欧阳娜娜"));
    }

    @Test
    void nameKeepsSingleChar() {
        assertEquals("王", MaskRule.NAME.apply("王"));
    }

    // ==================== ID_CARD ====================

    @Test
    void idCard18KeepsFirst3Last4() {
        assertEquals("110***********4571", MaskRule.ID_CARD.apply("110101199003074571"));
    }

    @Test
    void idCard15KeepsFirst3Last4() {
        assertEquals("110********7457", MaskRule.ID_CARD.apply("110101900307457"));
    }

    @Test
    void idCardMasksWholeValueWhenShapeMismatch() {
        assertEquals("***", MaskRule.ID_CARD.apply("1101011990030745719"));
    }

    // ==================== PLATE ====================

    @Test
    void plate7KeepsPrefixAndLast2() {
        assertEquals("京A***45", MaskRule.PLATE.apply("京A12345"));
    }

    @Test
    void plate8KeepsPrefixAndLast2() {
        assertEquals("京A****45", MaskRule.PLATE.apply("京AD12345"));
    }

    @Test
    void plateMasksWholeValueWhenTooShort() {
        assertEquals("***", MaskRule.PLATE.apply("京A12"));
    }

    // ==================== GEO_500M ====================

    @Test
    void geoTruncatesToHalfKmGrid() {
        // 0.005 度网格向下取整（≈500m），输出固定 3 位小数
        assertEquals("116.395,39.905", MaskRule.GEO_500M.apply("116.397428,39.90923"));
    }

    @Test
    void geoHandlesNegativeCoordinates() {
        // floor 向更负方向取整：-116.397428 → -116.400（-23280 × 0.005）
        assertEquals("-116.400,-40.005", MaskRule.GEO_500M.apply("-116.397428,-40.003"));
    }

    @Test
    void geoMasksWholeValueWhenShapeMismatch() {
        assertEquals("***", MaskRule.GEO_500M.apply("116.397428"));
        assertEquals("***", MaskRule.GEO_500M.apply("abc,def"));
    }

    // ==================== 公共形态 ====================

    @Test
    void nullPassesThroughEveryRule() {
        for (MaskRule rule : MaskRule.values()) {
            assertNull(rule.apply(null), rule.name() + " 必须 null 透传");
        }
    }
}
