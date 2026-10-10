package com.workflow.engine.form;

import com.workflow.common.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * SerialNumberService 单元测试（Task 3-d）。
 * Mockito 模拟 JdbcTemplate，不依赖数据库；固定时钟保证日期段确定性。
 */
@ExtendWith(MockitoExtension.class)
class SerialNumberServiceTest {

    @Mock
    private JdbcTemplate jdbcTemplate;

    /** 固定时钟：UTC 2025-06-15T10:30 → 东八区 LocalDate 2025-06-15 */
    private static final Clock FIXED_CLOCK =
            Clock.fixed(Instant.parse("2025-06-15T10:30:00Z"), ZoneId.of("Asia/Shanghai"));

    private SerialNumberService service() {
        return new SerialNumberService(jdbcTemplate, FIXED_CLOCK);
    }

    private void stubSeq(long seq) {
        when(jdbcTemplate.queryForList(anyString(), eq(Long.class), any(), any(), any()))
                .thenReturn(List.of(seq));
    }

    // ==================== period 推导 ====================

    @Test
    void periodOf_day_yyyyMMdd() {
        LocalDate date = LocalDate.of(2025, 6, 15);
        assertThat(SerialNumberService.periodOf("day", date)).isEqualTo("20250615");
    }

    @Test
    void periodOf_month_yyyyMM() {
        LocalDate date = LocalDate.of(2025, 6, 15);
        assertThat(SerialNumberService.periodOf("month", date)).isEqualTo("202506");
    }

    @Test
    void periodOf_year_yyyy() {
        LocalDate date = LocalDate.of(2025, 6, 15);
        assertThat(SerialNumberService.periodOf("year", date)).isEqualTo("2025");
    }

    @Test
    void periodOf_never_ALL() {
        LocalDate date = LocalDate.of(2025, 6, 15);
        assertThat(SerialNumberService.periodOf("never", date)).isEqualTo("ALL");
    }

    @Test
    void periodOf_unknownPolicy_fallsBackToAll_neverResets() {
        LocalDate date = LocalDate.of(2025, 6, 15);
        // 未知策略 fail-safe：永不重置（宁可序号增长不可重号）
        assertThat(SerialNumberService.periodOf("quarter", date)).isEqualTo("ALL");
        assertThat(SerialNumberService.periodOf("", date)).isEqualTo("ALL");
        assertThat(SerialNumberService.periodOf(null, date)).isEqualTo("ALL");
    }

    // ==================== 生成格式 ====================

    @Test
    void nextSerial_format_prefixPlusDatePlusPaddedSeq() {
        stubSeq(42L);
        String value = service().nextSerial("t1", "formA.orderNo", "PO", "yyyy-MM-dd", "month", 4);
        assertThat(value).isEqualTo("PO2025-06-150042");
    }

    @Test
    void nextSerial_defaults_BN_yyyyMMdd_day_digits4() {
        stubSeq(7L);
        String value = service().nextSerial("t1", "formA.orderNo", null, null, null, null);
        assertThat(value).isEqualTo("BN202506150007");
    }

    @Test
    void nextSerial_seqBeyondDigits_extendsWithoutTruncation() {
        stubSeq(123456L);
        String value = service().nextSerial("t1", "k", "BN", "yyyyMMdd", "day", 4);
        assertThat(value).isEqualTo("BN20250615123456");
    }

    @Test
    void nextSerial_smallSeq_padsToDigits() {
        stubSeq(7L);
        String value = service().nextSerial("t1", "k", "BN", "yyyyMMdd", "day", 6);
        assertThat(value).isEqualTo("BN20250615000007");
    }

    @Test
    void nextSerial_digitsClampedToTen() {
        stubSeq(5L);
        String value = service().nextSerial("t1", "k", "BN", "yyyyMMdd", "day", 99);
        assertThat(value).isEqualTo("BN202506150000000005");
    }

    @Test
    void nextSerial_invalidDateFormat_fallsBackToYyyyMMdd() {
        stubSeq(1L);
        String value = service().nextSerial("t1", "k", "BN", "abc[[", "day", 4);
        assertThat(value).isEqualTo("BN202506150001");
    }

    @Test
    void nextSerial_timeOnlyDateFormat_fallsBackToYyyyMMdd() {
        // LocalDate 不含时间字段，HH:mm 会抛 UnsupportedTemporalTypeException → 回退
        stubSeq(1L);
        String value = service().nextSerial("t1", "k", "BN", "yyyy-MM-dd HH:mm", "day", 4);
        assertThat(value).isEqualTo("BN202506150001");
    }

    // ==================== 取号与参数 ====================

    @Test
    void nextSerial_upsertAndSelectUseSameKeys() {
        stubSeq(1L);
        service().nextSerial("t1", "formA.orderNo", "BN", "yyyyMMdd", "day", 4);

        verify(jdbcTemplate).update(contains("wf_serial_number"), eq("t1"), eq("formA.orderNo"), eq("20250615"));
        verify(jdbcTemplate).queryForList(contains("wf_serial_number"), eq(Long.class),
                eq("t1"), eq("formA.orderNo"), eq("20250615"));
    }

    @Test
    void nextSerial_unknownPolicy_upsertsWithAllPeriod() {
        stubSeq(1L);
        service().nextSerial("t1", "formA.orderNo", "BN", "yyyyMMdd", "quarter", 4);

        verify(jdbcTemplate).update(contains("wf_serial_number"), eq("t1"), eq("formA.orderNo"), eq("ALL"));
    }

    @Test
    void nextSerial_seqIncreasesAcrossCalls() {
        when(jdbcTemplate.queryForList(anyString(), eq(Long.class), any(), any(), any()))
                .thenReturn(List.of(1L), List.of(2L));

        String first = service().nextSerial("t1", "k", "BN", "yyyyMMdd", "day", 4);
        String second = service().nextSerial("t1", "k", "BN", "yyyyMMdd", "day", 4);

        assertThat(first).isEqualTo("BN202506150001");
        assertThat(second).isEqualTo("BN202506150002");
    }

    // ==================== 参数校验 ====================

    @Test
    void nextSerial_missingTenantId_rejected() {
        assertThatThrownBy(() -> service().nextSerial(null, "k", "BN", "yyyyMMdd", "day", 4))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("tenantId");
    }

    @Test
    void nextSerial_missingSerialKey_rejected() {
        assertThatThrownBy(() -> service().nextSerial("t1", " ", "BN", "yyyyMMdd", "day", 4))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("serialKey");
    }
}
