package com.workflow.system.service;

import com.workflow.common.exception.BusinessException;
import com.workflow.system.domain.entity.SysBindCode;
import com.workflow.system.domain.entity.SysClient;
import com.workflow.system.domain.entity.SysUser;
import com.workflow.system.domain.vo.BindCodeVO;
import com.workflow.system.repository.SysBindCodeRepository;
import com.workflow.system.repository.SysClientRepository;
import com.workflow.system.repository.SysUserRepository;
import com.workflow.system.service.impl.BindCodeServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 绑定码服务单元测试（J3，ledger D1 表方案：TTL=expires_at、一次性=used）。
 */
class BindCodeServiceTest {

    private SysBindCodeRepository bindCodeRepository;
    private SysUserRepository userRepository;
    private SysClientRepository clientRepository;
    private BindCodeServiceImpl service;

    @BeforeEach
    void setUp() {
        bindCodeRepository = mock(SysBindCodeRepository.class);
        userRepository = mock(SysUserRepository.class);
        clientRepository = mock(SysClientRepository.class);
        service = new BindCodeServiceImpl(bindCodeRepository, userRepository, clientRepository);

        when(userRepository.findById(9L)).thenReturn(Optional.of(activeUser()));
        when(clientRepository.findById(7L)).thenReturn(Optional.of(activeClient()));
    }

    private SysUser activeUser() {
        SysUser user = new SysUser();
        user.setId(9L);
        user.setUsername("zhangsan");
        user.setStatus(1);
        return user;
    }

    private SysClient activeClient() {
        SysClient client = new SysClient();
        client.setId(7L);
        client.setCode("driver");
        client.setStatus(1);
        return client;
    }

    private SysBindCode record(String code, Long clientId, int used, LocalDateTime expiresAt) {
        SysBindCode record = new SysBindCode();
        record.setCode(code);
        record.setUserId(9L);
        record.setClientId(clientId);
        record.setUsed(used);
        record.setExpiresAt(expiresAt);
        return record;
    }

    // ------------------------------------------------------------ issue

    @Test
    void issue_validUserAndClient_persistsCodeWithTtl() {
        when(bindCodeRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        BindCodeVO vo = service.issue(9L, 7L);

        ArgumentCaptor<SysBindCode> captor = ArgumentCaptor.forClass(SysBindCode.class);
        verify(bindCodeRepository).save(captor.capture());
        SysBindCode saved = captor.getValue();
        // 一次性码：SecureRandom 大写字母数字 12 位（防枚举），TTL 30 分钟
        assertThat(saved.getCode()).matches("^[A-Z0-9]{12}$");
        assertThat(saved.getUserId()).isEqualTo(9L);
        assertThat(saved.getClientId()).isEqualTo(7L);
        assertThat(saved.getUsed()).isZero();
        assertThat(saved.getExpiresAt()).isBetween(
                LocalDateTime.now().plusMinutes(25), LocalDateTime.now().plusMinutes(35));
        assertThat(vo.code()).isEqualTo(saved.getCode());
    }

    @Test
    void issue_userMissingOrDisabled_400() {
        when(userRepository.findById(9L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.issue(9L, 7L))
                .isInstanceOf(BusinessException.class)
                .hasMessage("用户不存在或已停用")
                .extracting(e -> ((BusinessException) e).getCode()).isEqualTo(400);

        SysUser disabled = activeUser();
        disabled.setStatus(0);
        when(userRepository.findById(9L)).thenReturn(Optional.of(disabled));
        assertThatThrownBy(() -> service.issue(9L, 7L))
                .isInstanceOf(BusinessException.class)
                .hasMessage("用户不存在或已停用");
    }

    @Test
    void issue_clientMissingOrDisabled_400() {
        when(clientRepository.findById(7L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.issue(9L, 7L))
                .isInstanceOf(BusinessException.class)
                .hasMessage("客户端不存在或已停用")
                .extracting(e -> ((BusinessException) e).getCode()).isEqualTo(400);
    }

    // ------------------------------------------------------------ consume

    @Test
    void consume_valid_marksUsedAndReturns() {
        SysBindCode valid = record("ABCD1234EF56", 7L, 0, LocalDateTime.now().plusMinutes(10));
        when(bindCodeRepository.findByCode("ABCD1234EF56")).thenReturn(Optional.of(valid));
        when(bindCodeRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        SysBindCode consumed = service.consume("ABCD1234EF56", 7L);

        assertThat(consumed.getUserId()).isEqualTo(9L);
        assertThat(valid.getUsed()).isEqualTo(1);
        verify(bindCodeRepository).save(valid);
    }

    @Test
    void consume_unknownCode_401() {
        when(bindCodeRepository.findByCode("NOPE")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.consume("NOPE", 7L))
                .isInstanceOf(BusinessException.class)
                .hasMessage("绑定码无效或已过期")
                .extracting(e -> ((BusinessException) e).getCode()).isEqualTo(401);
    }

    @Test
    void consume_expired_401_notMarkedUsed() {
        SysBindCode expired = record("OLD1", 7L, 0, LocalDateTime.now().minusMinutes(1));
        when(bindCodeRepository.findByCode("OLD1")).thenReturn(Optional.of(expired));

        assertThatThrownBy(() -> service.consume("OLD1", 7L))
                .isInstanceOf(BusinessException.class)
                .hasMessage("绑定码无效或已过期");
        verify(bindCodeRepository, never()).save(any());
    }

    @Test
    void consume_alreadyUsed_401() {
        SysBindCode used = record("USED", 7L, 1, LocalDateTime.now().plusMinutes(10));
        when(bindCodeRepository.findByCode("USED")).thenReturn(Optional.of(used));

        assertThatThrownBy(() -> service.consume("USED", 7L))
                .isInstanceOf(BusinessException.class)
                .hasMessage("绑定码已被使用");
    }

    @Test
    void consume_wrongClient_401_unifiedMessageAgainstEnumeration() {
        // 端不匹配复用「无效或已过期」消息——不暴露码的真实归属（防枚举）
        SysBindCode otherClient = record("ABC", 2L, 0, LocalDateTime.now().plusMinutes(10));
        when(bindCodeRepository.findByCode("ABC")).thenReturn(Optional.of(otherClient));

        assertThatThrownBy(() -> service.consume("ABC", 7L))
                .isInstanceOf(BusinessException.class)
                .hasMessage("绑定码无效或已过期");
    }
}
