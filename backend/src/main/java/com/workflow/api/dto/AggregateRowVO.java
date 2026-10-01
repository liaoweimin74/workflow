package com.workflow.api.dto;

/**
 * 聚合结果行（Task 119 仪表盘；对齐 Node 侧 {@code AggregateRowVO}：
 * {@code { key: string, value: number }}）。
 *
 * <p>⚠️ {@code value} 用 {@link Number} 而不是 {@code double}：JS 的 number 是统一数值类型，
 * 整数值序列化为 {@code 5} 而非 {@code 5.0}。为让 Jackson 输出与 Node 侧逐字节一致，
 * 值在构造时经 {@link #toJsNumber(Object)} 归一 —— 整数值存 {@link Long}，小数值存 {@link Double}。
 */
public class AggregateRowVO {

    private String key;
    private Number value;

    public AggregateRowVO() {}

    public AggregateRowVO(String key, Number value) {
        this.key = key;
        this.value = value;
    }

    /**
     * SQL/内存聚合行的统一出口（对齐 Node 侧 {@code String(row.__k ?? '')} 与
     * {@code Number(row.__v ?? 0)} 的组合语义）。
     */
    public static AggregateRowVO of(String key, Object rawValue) {
        return new AggregateRowVO(key == null ? "" : key, toJsNumber(rawValue));
    }

    /**
     * 按 JS {@code Number(x ?? 0)} 语义把任意 SQL/JSON 数值归一为可 JSON 序列化的
     * {@link Number}：整数值 → {@link Long}（输出 {@code 5}），小数值 → {@link Double}
     * （输出 {@code 5.5}）；null/空串/不可解析 → 0（SQL 聚合列恒为数值，此处仅防御）。
     */
    public static Number toJsNumber(Object raw) {
        double d;
        if (raw instanceof Number n) {
            d = n.doubleValue();
        } else if (raw == null) {
            d = 0;
        } else {
            String s = String.valueOf(raw).trim();
            if (s.isEmpty()) {
                d = 0;
            } else {
                try {
                    d = Double.parseDouble(s);
                } catch (NumberFormatException e) {
                    d = Double.NaN;
                }
            }
        }
        if (!Double.isFinite(d)) {
            return 0L;
        }
        // JS 整数值不带小数点输出；2^53 以内的整数值才安全转 long（JS number 精度边界一致）
        if (d == Math.rint(d) && Math.abs(d) <= 9007199254740992.0) {
            return (long) d;
        }
        return d;
    }

    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }

    public Number getValue() { return value; }
    public void setValue(Number value) { this.value = value; }
}
