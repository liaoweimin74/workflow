package com.workflow.engine.datasource;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.AggregateRowVO;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 内存聚合器（Task 119 仪表盘；移植 Node {@code backend-node/src/engine/datasource/aggregate-rows.ts}）。
 *
 * <p>三类调用方：
 * <ul>
 *   <li>SYSTEM 源：行集本就在内存（systemQuery / BuiltInSystemSourceQueryService）；</li>
 *   <li>API 源：远端返回什么就聚合什么 —— <b>已聚合的行集再聚合是幂等的</b>
 *       （每维度一行时分组结果不变），这正是「远端本身就是聚合接口」也能走
 *       同一条端点的原因（透传 + 幂等归并）；</li>
 *   <li>FORM config 模式（JOIN）：无单表可包，MVP 用行级取数 + 内存聚合兜底。</li>
 * </ul>
 *
 * <p>与 SQL 路径（BizDataQueryBuilder.buildAggregate / SqlTemplateEngine.wrapAggregate）的语义一致：
 * count 计行数；sum/avg/max/min 对数值聚合，null/空串/非数值<b>跳过</b>
 * （SQL 的 SUM/AVG/MAX/MIN 忽略 NULL；空串在数值语境同样不可聚）。
 *
 * <p>错误形态：抛 {@link IllegalArgumentException}（全局处理器映射 HTTP 400），
 * 与 Java 侧其余聚合路径（buildAggregate / wrapAggregate 抛出后统一转 400）一致。
 */
public final class InMemoryAggregateUtil {

    private static final ObjectMapper OM = new ObjectMapper();

    /** 复合维度键分隔符（热力图/交叉分析：group="a,b" → key="va|vb"；对齐 Node {@code COMPOSITE_KEY_SEPARATOR}）。 */
    public static final String COMPOSITE_KEY_SEPARATOR = "|";

    /** 非 "YYYY-MM-*" 前缀判定（命中则跳过 JS Date 解析，与 Node {@code /^\d{4}-\d{2}/} 同源）。 */
    private static final Pattern SQLISH_PREFIX = Pattern.compile("^\\d{4}-\\d{2}");

    /** JS Date.toString() 形态（"Thu Oct 01 2026 02:33:29 GMT+0000"）解析器。 */
    private static final DateTimeFormatter JS_DATE_TO_STRING =
            DateTimeFormatter.ofPattern("EEE MMM dd yyyy HH:mm:ss 'GMT'Z", Locale.US);

    /** 非 "YYYY-MM-*" 来源值的解析尝试顺序（均失败则保留原值，对齐 JS {@code new Date(text)} NaN 语义）。 */
    private static final DateTimeFormatter[] JS_DATE_FORMATS = {
            JS_DATE_TO_STRING, DateTimeFormatter.RFC_1123_DATE_TIME};

    /** JS Date.toString() 尾部时区名括号（"(UTC)" / "(China Standard Time)"），解析前剥离。 */
    private static final Pattern JS_DATE_TAIL = Pattern.compile("\\s*\\([^)]*\\)\\s*$");

    /** 规范化目标格式（对齐 JS {@code toISOString().replace('T',' ').slice(0,19)}，UTC）。 */
    private static final DateTimeFormatter NORMALIZED_DATETIME =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /** 内存聚合入参（对齐 Node {@code InMemoryAggregateOptions}）。 */
    public record AggregateOptions(String group, String agg, String metric,
                                   String timeGrain, String sort, String order, int limit) {}

    private InMemoryAggregateUtil() {}

    /**
     * 拆分 group 参数为维度列（Task 120）：最多两列，逗号分隔，去空格。
     * 单列原样返回；空/超两个/重复均显式报错（与整体显式 400 风格一致）。
     *
     * @throws IllegalArgumentException 空分组/超两列/重复列
     */
    public static List<String> splitGroupColumns(String group) {
        List<String> parts = new ArrayList<>();
        for (String part : group.split(",")) {
            String trimmed = part.trim();
            if (!trimmed.isEmpty()) {
                parts.add(trimmed);
            }
        }
        if (parts.isEmpty()) {
            throw new IllegalArgumentException("分组字段不能为空: " + group);
        }
        if (parts.size() > 2) {
            throw new IllegalArgumentException("分组字段最多支持两个维度: " + group);
        }
        if (new HashSet<>(parts).size() != parts.size()) {
            throw new IllegalArgumentException("分组字段重复: " + group);
        }
        return parts;
    }

    /**
     * 非 "YYYY-MM-*" 前缀的来源值尝试按 JS Date 序列化形态解析，
     * 规范化为 UTC {@code yyyy-MM-dd HH:mm:ss}；全部失败返回 null（调用方保留原值）。
     */
    private static String normalizeJsDate(String text) {
        String candidate = JS_DATE_TAIL.matcher(text).replaceFirst("");
        for (DateTimeFormatter formatter : JS_DATE_FORMATS) {
            try {
                return OffsetDateTime.parse(candidate, formatter)
                        .withOffsetSameInstant(ZoneOffset.UTC).format(NORMALIZED_DATETIME);
            } catch (DateTimeParseException ignored) {
                // 试下一个格式
            }
        }
        return null;
    }

    /**
     * 时间桶 DATE_FORMAT 对应的 Java 侧格式化（与 SQL 模板同语义）。
     *
     * <p>day/month 是纯字符串截断；week 按 ISO 周（MariaDB {@code %x-W%v}：
     * 4 位年份 + 2 位周数，周一为一周起点），逐行移植 Node 的 JS 算法
     * （先滚到本周周四，再按「与同年元旦的天数差」计算周数）。
     */
    public static String bucketKey(String raw, String timeGrain) {
        // 来源值可能是 JS Date.toString() 格式（"Thu Oct 01 2026 02:33:29 GMT+0000"，
        // SYSTEM 源行集序列化的历史格式）：先规范化为 "yyyy-MM-dd HH:mm:ss" 再切桶（Task 120）
        String text = raw;
        if (!SQLISH_PREFIX.matcher(text).find()) {
            String normalized = normalizeJsDate(text);
            if (normalized != null) {
                text = normalized;
            }
        }
        if ("day".equals(timeGrain)) {
            return text.length() > 10 ? text.substring(0, 10) : text;
        }
        if ("month".equals(timeGrain)) {
            return text.length() > 7 ? text.substring(0, 7) : text;
        }
        // week：解析失败原样返回（对齐 JS Date NaN → return raw）
        LocalDate base;
        try {
            base = LocalDate.parse(text.length() > 10 ? text.substring(0, 10) : text);
        } catch (DateTimeParseException | IllegalStateException e) {
            return raw;
        }
        // ISO 8601：周四所在年份为该周年份；先滚到本周周四
        // （JS getUTCDay(): 周日=0..周六=6，0 按 7 处理后与 ISO DayOfWeek 周一=1..周日=7 一致）
        LocalDate target = base.plusDays(4L - base.getDayOfWeek().getValue());
        LocalDate yearStart = LocalDate.of(target.getYear(), 1, 1);
        long days = ChronoUnit.DAYS.between(yearStart, target);
        int week = (int) Math.ceil(((double) days + 1) / 7.0);
        return target.getYear() + "-W" + (week < 10 ? "0" + week : String.valueOf(week));
    }

    /**
     * 对行集做分组聚合，产出与 SQL 路径同形的 {@code {key, value}} 行集。
     *
     * <p>维度 key 缺失/为 null 的行跳过（SQL 的 GROUP BY 不含 NULL 之外的语义由
     * 调用方数据形态决定，Node 侧 {@code rawKey === null || undefined → continue}；
     * Task 120 双维度时任一维度为 null 即整行跳过）；
     * count 计行数（含指标列取不到数值的行）；其余聚合跳过不可数值的行。
     */
    public static List<AggregateRowVO> aggregateRowsInMemory(List<Map<String, Object>> rows,
                                                             AggregateOptions options) {
        String group = options.group();
        String agg = options.agg();
        String metric = options.metric();
        String timeGrain = options.timeGrain();
        Map<String, Long> counts = new LinkedHashMap<>();
        Map<String, double[]> numeric = new HashMap<>();

        // Task 120：group 支持逗号双维度（"a,b"），key 用 '|' 拼接；timeGrain 只作用于第一列
        List<String> groupColumns =
                "__all__".equals(group) ? List.of("__all__") : splitGroupColumns(group);

        if (rows != null) {
            for (Map<String, Object> row : rows) {
                if (row == null) {
                    continue;
                }
                // 保留维度：整表聚合成单值，所有行进同一组（KPI 无分组场景）
                List<String> rawParts = new ArrayList<>(groupColumns.size());
                boolean hasNull = false;
                for (int i = 0; i < groupColumns.size(); i++) {
                    String column = groupColumns.get(i);
                    Object rawKey = "__all__".equals(column) ? "__all__" : row.get(column);
                    if (rawKey == null) {
                        // 任一维度为 null 的行跳过
                        hasNull = true;
                        break;
                    }
                    String raw = rawKey instanceof java.util.Date date
                            ? date.toInstant().atZone(java.time.ZoneId.of("UTC"))
                            .toLocalDateTime()
                            .format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"))
                            : String.valueOf(rawKey);
                    // 时间桶只套在第一列（时间×其他维度的热力图主场景）
                    String keyed = timeGrain != null && i == 0 ? bucketKey(raw, timeGrain) : raw;
                    rawParts.add(keyed);
                }
                if (hasNull) {
                    continue;
                }
                String key = String.join(COMPOSITE_KEY_SEPARATOR, rawParts);

                counts.merge(key, 1L, Long::sum);
                if (!"count".equals(agg)) {
                    Double value = toNumber(row.get(metric == null ? "" : metric));
                    if (value == null) {
                        continue;
                    }
                    double[] bucket = numeric.get(key);
                    if (bucket == null) {
                        bucket = new double[]{value, value, value, 0};
                    }
                    bucket[0] += value;                        // sum
                    bucket[1] = Math.max(bucket[1], value);    // max
                    bucket[2] = Math.min(bucket[2], value);    // min
                    bucket[3] += 1;                            // n
                    numeric.put(key, bucket);
                }
            }
        }

        List<AggregateRowVO> out = new ArrayList<>(counts.size());
        for (Map.Entry<String, Long> entry : counts.entrySet()) {
            String key = entry.getKey();
            long count = entry.getValue();
            double value;
            if ("count".equals(agg)) {
                value = count;
            } else {
                double[] bucket = numeric.get(key);
                if (bucket == null || bucket[3] == 0) {
                    value = 0;
                } else {
                    switch (agg == null ? "" : agg) {
                        case "sum" -> value = bucket[0];
                        case "avg" -> value = bucket[3] == 0 ? 0 : bucket[0] / bucket[3];
                        case "max" -> value = bucket[1];
                        default -> value = bucket[2]; // min
                    }
                }
            }
            out.add(new AggregateRowVO(key, AggregateRowVO.toJsNumber(round(value))));
        }

        String sortKey = options.sort() == null || options.sort().isBlank()
                ? "key" : options.sort().trim().toLowerCase();
        if (!"key".equals(sortKey) && !"value".equals(sortKey)) {
            throw new IllegalArgumentException("非法聚合排序字段: " + options.sort());
        }
        String dir = options.order() == null || options.order().isBlank()
                ? "asc" : options.order().toLowerCase();
        if (!"asc".equals(dir) && !"desc".equals(dir)) {
            throw new IllegalArgumentException("非法排序方向: " + options.order());
        }
        out.sort((a, b) -> {
            int cmp;
            if ("key".equals(sortKey)) {
                cmp = a.getKey().compareTo(b.getKey());
            } else {
                cmp = Double.compare(a.getValue().doubleValue(), b.getValue().doubleValue());
            }
            return "asc".equals(dir) ? cmp : -cmp;
        });

        // slice(0, limit) 语义：limit 超出行数时截断到行数（对齐 Node slice 的钳制行为）
        return options.limit() > 0
                ? new ArrayList<>(out.subList(0, Math.min(options.limit(), out.size())))
                : out;
    }

    /**
     * 数值提取：null/空串/非有限数 → null（与 SQL 忽略 NULL 的语义对齐）。
     */
    private static Double toNumber(Object raw) {
        if (raw == null) {
            return null;
        }
        if (raw instanceof Number number) {
            double d = number.doubleValue();
            return Double.isFinite(d) ? d : null;
        }
        String text = String.valueOf(raw).trim();
        if (text.isEmpty()) {
            return null;
        }
        try {
            double d = Double.parseDouble(text);
            return Double.isFinite(d) ? d : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** 4 位小数舍入（对齐 JS {@code Math.round(value * 10000) / 10000}）；非有限数 → 0。 */
    private static double round(double value) {
        if (!Double.isFinite(value)) {
            return 0;
        }
        return Math.round(value * 10000.0) / 10000.0;
    }

    /**
     * 内存版结构化筛选（SYSTEM / API 聚合路径用；这两类源的数据不在 SQL 层）。
     *
     * <p>运算符语义与 BizDataQueryBuilder / SqlTemplateEngine 的筛选一致：
     * eq/ne/like/in/range/isempty/isnotempty；旧格式 {@code {col: value}} 等价于 eq-AND。
     * 列不存在时该条条件按「不命中」处理（源没这列 = 行集里取不到值）。
     */
    public static List<Map<String, Object>> applyInMemoryFilter(List<Map<String, Object>> rows,
                                                                String filterJson) {
        if (filterJson == null || filterJson.isBlank()) {
            return rows;
        }
        Object parsed;
        try {
            parsed = OM.readValue(filterJson, Object.class);
        } catch (Exception e) {
            throw new IllegalArgumentException("筛选条件不是合法 JSON");
        }
        if (!(parsed instanceof Map<?, ?> filters)) {
            throw new IllegalArgumentException("筛选条件不是合法 JSON");
        }

        if (!(filters.get("conditions") instanceof List<?> conditions)) {
            // 旧格式：等值 AND
            List<Map<String, Object>> out = new ArrayList<>();
            if (rows != null) {
                for (Map<String, Object> row : rows) {
                    if (matchesLegacyAll(row, filters)) {
                        out.add(row);
                    }
                }
            }
            return out;
        }

        String logic = String.valueOf(filters.get("logic") == null ? "AND" : filters.get("logic"))
                .toUpperCase().equals("AND") ? "AND" : "OR";
        List<Map<?, ?>> items = new ArrayList<>();
        for (Object c : conditions) {
            if (c instanceof Map<?, ?> m) {
                items.add(m);
            }
        }
        List<Map<String, Object>> out = new ArrayList<>();
        if (rows != null) {
            for (Map<String, Object> row : rows) {
                boolean hit = "AND".equals(logic)
                        ? items.stream().allMatch(c -> testCondition(row, c))
                        : items.stream().anyMatch(c -> testCondition(row, c));
                if (hit) {
                    out.add(row);
                }
            }
        }
        return out;
    }

    /** 旧格式：每条 {@code String(row[column] ?? '') === String(value)} 都成立才保留。 */
    private static boolean matchesLegacyAll(Map<String, Object> row, Map<?, ?> filters) {
        for (Map.Entry<?, ?> e : filters.entrySet()) {
            String column = String.valueOf(e.getKey());
            Object cell = row.get(column);
            String text = cell == null ? "" : String.valueOf(cell);
            if (!text.equals(String.valueOf(e.getValue()))) {
                return false;
            }
        }
        return true;
    }

    /** 单条结构化条件求值（对齐 Node {@code test}，列不存在按「不命中」）。 */
    private static boolean testCondition(Map<String, Object> row, Map<?, ?> condition) {
        Object columnObj = condition.get("column");
        String column = columnObj == null ? "null" : String.valueOf(columnObj);
        Object cell = row.get(column);
        String text = cell == null ? "" : String.valueOf(cell);
        String op = condition.get("op") == null ? "eq" : String.valueOf(condition.get("op")).toLowerCase();
        Object value = condition.get("value");
        return switch (op) {
            case "eq" -> value != null && text.equals(String.valueOf(value));
            case "ne" -> !(value != null && text.equals(String.valueOf(value)));
            case "like" -> value != null && text.contains(String.valueOf(value));
            case "in" -> value instanceof List<?> list
                    && list.stream().anyMatch(item -> String.valueOf(item).equals(text));
            case "range" -> {
                if (!(value instanceof List<?> range) || range.size() != 2) {
                    yield false;
                }
                Double numeric = toNumber(cell);
                if (numeric == null) {
                    yield false;
                }
                Double low = toNumber(range.get(0));
                Double high = toNumber(range.get(1));
                yield low != null && high != null && numeric >= low && numeric <= high;
            }
            case "isempty" -> text.isEmpty();
            case "isnotempty" -> !text.isEmpty();
            default -> false;
        };
    }
}
