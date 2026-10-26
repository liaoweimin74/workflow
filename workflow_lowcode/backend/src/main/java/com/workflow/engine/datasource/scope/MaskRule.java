package com.workflow.engine.datasource.scope;

/**
 * 内置脱敏规则集（designs §2.4：不进 sys_dict、不开放自定义，防配置面成为泄漏面）。
 *
 * <p>fail-closed：值为 null 原样透传；非 null 一律先转字符串套规则，形态不符输出全掩
 * {@code ***}——规则解析不了不等于可以不掩。
 */
public enum MaskRule {

    /** 11 位手机号：保留前 3 后 4，中间 4 个 *。 */
    PHONE,

    /** 姓名：保留首字（姓），其余逐字符打 *；单字名原样。 */
    NAME,

    /** 身份证：15/18 位保留前 3 后 4，中间打 *。 */
    ID_CARD,

    /** 车牌：保留省份汉字+字母前缀与末尾 2 位，中间打 *（7/8 位均适用）。 */
    PLATE,

    /** 地理泛化约 500m：经纬度截断到 0.005 度网格；仅支持「lng,lat」字符串形态。 */
    GEO_500M;

    /**
     * 对单元格值施加掩码。
     *
     * @param value 原始值（可为任意类型，非 null 按字符串形态处理）
     * @return 掩码后的值；null 透传
     */
    public Object apply(Object value) {
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value);
        return switch (this) {
            case PHONE -> phone(text);
            case NAME -> name(text);
            case ID_CARD -> idCard(text);
            case PLATE -> plate(text);
            case GEO_500M -> geo(text);
        };
    }

    private static final String FALLBACK = "***";

    /** 唯一支持的手机号形态就是 11 位；长度不符说明数据不是手机号，全掩而不是放行。 */
    private static Object phone(String text) {
        if (text.length() != 11) {
            return FALLBACK;
        }
        return text.substring(0, 3) + "****" + text.substring(7);
    }

    /** 保留姓（首字），其余逐字符打 *；单字与空串没有可掩的部分。 */
    private static Object name(String text) {
        if (text.length() <= 1) {
            return text;
        }
        return text.charAt(0) + "*".repeat(text.length() - 1);
    }

    /** 15/18 位保留前 3 后 4；其余形态全掩。 */
    private static Object idCard(String text) {
        if (text.length() != 15 && text.length() != 18) {
            return FALLBACK;
        }
        return text.substring(0, 3) + "*".repeat(text.length() - 7) + text.substring(text.length() - 4);
    }

    /** 7/8 位均保留前 2（省+发牌字母）与末 2，中间打 *；更短没有可保形态，全掩。 */
    private static Object plate(String text) {
        if (text.length() != 7 && text.length() != 8) {
            return FALLBACK;
        }
        return text.substring(0, 2) + "*".repeat(text.length() - 4) + text.substring(text.length() - 2);
    }

    /** 「lng,lat」截断到 0.005 度网格（≈500m）；解析不了的全掩。 */
    private static Object geo(String text) {
        String[] parts = text.split(",");
        if (parts.length != 2) {
            return FALLBACK;
        }
        try {
            double lng = truncateGrid(parts[0].trim());
            double lat = truncateGrid(parts[1].trim());
            return String.format(java.util.Locale.ROOT, "%.3f,%.3f", lng, lat);
        } catch (NumberFormatException e) {
            return FALLBACK;
        }
    }

    private static double truncateGrid(String number) {
        double value = Double.parseDouble(number);
        if (Double.isNaN(value) || Double.isInfinite(value)) {
            throw new NumberFormatException("non-finite coordinate");
        }
        return Math.floor(value / GRID_DEGREES) * GRID_DEGREES;
    }

    private static final double GRID_DEGREES = 0.005;
}
