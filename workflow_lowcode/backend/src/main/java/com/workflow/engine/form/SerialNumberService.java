package com.workflow.engine.form;

import com.workflow.common.exception.BusinessException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 自动编号流水号生成服务（Task 3-d）。
 *
 * <p>为业务表单 AutoNumber 组件生成 {@code prefix + 日期段 + 补零序号} 格式的流水号，
 * 计数持久化于 {@code wf_serial_number}（V54），按 (tenant_id, serial_key, period) 唯一隔离。
 *
 * <p><b>并发安全策略</b>：INSERT ... ON DUPLICATE KEY UPDATE seq = seq + 1 再 SELECT。
 * 首选取号是单条原子 upsert，天然规避「SELECT ... FOR UPDATE 后表不存在需 upsert 兜底」的两段竞态。
 * upsert 对唯一键行加排他锁并持有至事务提交，并发的下一个取号事务会阻塞等待；
 * 随后的 SELECT 与 upsert 同事务同连接，读到的必然是本事务自增后的 seq。
 * 前提：本方法 {@code @Transactional(REQUIRED)}——从 BizDataService.create 进入时加入业务事务，
 * 独立调用时自开事务，两个分支都保证 upsert 与 SELECT 不跨连接。
 *
 * <p>取号参与业务事务：业务创建回滚时序号回退（不产生空洞，也不浪费号段）。
 */
@Service
public class SerialNumberService {

    private static final Logger log = LoggerFactory.getLogger(SerialNumberService.class);

    /** 业务时区：对齐 BizDataSupport.BIZ_ZONE（东八区，日期段/周期键按此取日） */
    private static final ZoneId BIZ_ZONE = ZoneId.of("Asia/Shanghai");

    private static final String DEFAULT_PREFIX = "BN";
    private static final String DEFAULT_DATE_FORMAT = "yyyyMMdd";
    private static final String DEFAULT_RESET_POLICY = "day";
    private static final int DEFAULT_SEQ_DIGITS = 4;
    private static final int MAX_SEQ_DIGITS = 10;
    /** never（及未知策略）的常量周期键：计数永不重置 */
    private static final String PERIOD_ALL = "ALL";

    /**
     * 取号 upsert：首次插入 seq=1，唯一键冲突时 seq+1。
     * 与 SELECT_SEQ_SQL 必须同事务执行（见类注释并发策略）。
     */
    private static final String UPSERT_SQL = """
            INSERT INTO wf_serial_number (tenant_id, serial_key, period, seq, updated_at)
            VALUES (?, ?, ?, 1, NOW())
            ON DUPLICATE KEY UPDATE seq = seq + 1, updated_at = NOW()
            """;
    private static final String SELECT_SEQ_SQL =
            "SELECT seq FROM wf_serial_number WHERE tenant_id = ? AND serial_key = ? AND period = ?";

    /** 周期键专用 formatter（不可变，线程安全） */
    private static final DateTimeFormatter PERIOD_DAY = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final DateTimeFormatter PERIOD_MONTH = DateTimeFormatter.ofPattern("yyyyMM");
    private static final DateTimeFormatter PERIOD_YEAR = DateTimeFormatter.ofPattern("yyyy");

    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;
    /** dateFormat → formatter 缓存（DateTimeFormatter 不可变线程安全，可全局复用） */
    private final ConcurrentHashMap<String, DateTimeFormatter> formatterCache = new ConcurrentHashMap<>();

    /** ⚠️ 双构造器场景必须显式标注：否则 Spring 多候选回退默认构造 → 启动崩溃（No default constructor found） */
    @Autowired
    public SerialNumberService(JdbcTemplate jdbcTemplate) {
        this(jdbcTemplate, Clock.system(BIZ_ZONE));
    }

    /** 测试专用：注入固定时钟保证日期段确定性 */
    SerialNumberService(JdbcTemplate jdbcTemplate, Clock clock) {
        this.jdbcTemplate = jdbcTemplate;
        this.clock = clock;
    }

    /**
     * 取下一个流水号。
     *
     * @param tenantId    租户 id（计数隔离维度之一）
     * @param serialKey   序列标识（约定 formKey + '.' + fieldKey，防跨表单同名字段重号）
     * @param prefix      前缀（null/空白用 BN）
     * @param dateFormat  日期段格式（null/空白用 yyyyMMdd；非法格式回退 yyyyMMdd 不抛错）
     * @param resetPolicy 重置策略 day/month/year/never（null/空白用 day；
     *                    未知值按 never 兜底——宁可序号持续增长也不产生重号）
     * @param seqDigits   序号补零位数（null/小于 1 用 4；大于 10 截到 10；
     *                    序号超出位数时自然扩展不截断）
     * @return prefix + dateFormat(今天) + 补零序号，如 {@code BN202506150042}
     * @throws BusinessException 租户或序列标识缺失（编程错误，由调用方容错约定兜底）
     */
    @Transactional
    public String nextSerial(String tenantId, String serialKey, String prefix,
                             String dateFormat, String resetPolicy, Integer seqDigits) {
        if (tenantId == null || tenantId.isBlank()) {
            throw new BusinessException(400, "自动编号缺少租户上下文（tenantId）");
        }
        if (serialKey == null || serialKey.isBlank()) {
            throw new BusinessException(400, "自动编号缺少序列标识（serialKey）");
        }
        String pfx = prefix == null || prefix.isBlank() ? DEFAULT_PREFIX : prefix;
        String fmt = dateFormat == null || dateFormat.isBlank() ? DEFAULT_DATE_FORMAT : dateFormat.trim();
        String policy = resetPolicy == null || resetPolicy.isBlank()
                ? DEFAULT_RESET_POLICY : resetPolicy.trim().toLowerCase();
        int digits = seqDigits == null || seqDigits < 1 ? DEFAULT_SEQ_DIGITS : Math.min(seqDigits, MAX_SEQ_DIGITS);

        LocalDate today = LocalDate.now(clock);
        String period = periodOf(policy, today);

        jdbcTemplate.update(UPSERT_SQL, tenantId, serialKey, period);
        List<Long> rows = jdbcTemplate.queryForList(SELECT_SEQ_SQL, Long.class, tenantId, serialKey, period);
        long seq = rows.isEmpty() ? 1L : rows.get(0);

        return pfx + formatDate(today, fmt) + String.format("%0" + digits + "d", seq);
    }

    /**
     * resetPolicy → 周期键：day=yyyyMMdd / month=yyyyMM / year=yyyy；
     * never 与未知策略一律 ALL（永不重置，fail-safe 防重号）。
     * 包内可见供单元测试；入参假定已经过 nextSerial 归一化（null 视为未识别 → ALL）。
     */
    static String periodOf(String resetPolicy, LocalDate date) {
        return switch (resetPolicy == null ? "" : resetPolicy) {
            case "day" -> date.format(PERIOD_DAY);
            case "month" -> date.format(PERIOD_MONTH);
            case "year" -> date.format(PERIOD_YEAR);
            default -> PERIOD_ALL;
        };
    }

    /**
     * 日期段格式化：DateTimeFormatter 不可变线程安全，按 pattern 缓存复用；
     * 非法 pattern（构造抛 IllegalArgumentException）或含时间字段（LocalDate 不支持，
     * format 抛 UnsupportedTemporalTypeException）一律回退 yyyyMMdd 并记 warn。
     */
    private String formatDate(LocalDate date, String pattern) {
        try {
            return formatterCache.computeIfAbsent(pattern, DateTimeFormatter::ofPattern).format(date);
        } catch (Exception e) {
            log.warn("自动编号日期格式非法，回退 yyyyMMdd: {}", pattern, e);
            formatterCache.remove(pattern);
            return date.format(PERIOD_DAY);
        }
    }
}
