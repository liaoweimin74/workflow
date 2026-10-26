package com.workflow.system.service.impl;

import com.workflow.common.exception.BusinessException;
import com.workflow.system.domain.entity.SysClient;
import com.workflow.system.domain.entity.SysUserDevice;
import com.workflow.system.domain.entity.SysUserOpenid;
import com.workflow.system.domain.vo.ClientIdentityVO;
import com.workflow.system.domain.vo.DeviceVO;
import com.workflow.system.repository.SysClientRepository;
import com.workflow.system.repository.SysUserDeviceRepository;
import com.workflow.system.repository.SysUserOpenidRepository;
import com.workflow.system.service.ClientIdentityService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * ClientIdentityService 单元测试（J5a，spec client-login-identity「A4 端身份 Tab」管理链）。
 *
 * <p>钉三块：① 列表按端聚合（openid 绑定 + 推送设备合并、clientId 升序、展示掩码不外泄全值）；
 * ② 管理员解绑（与本人 clientUnbind 同形状同文案，无绑定 400）；
 * ③ 设备吊销（异主=404 防越权、已吊销幂等不多写、不存在 404）。
 * 绑定码签发复用 POST /api/auth/bind-code/issue（J3 已落地，不在本测试面）。
 */
class ClientIdentityServiceTest {

    private static final Long USER_ID = 100L;

    private SysUserOpenidRepository openidRepository;
    private SysUserDeviceRepository deviceRepository;
    private SysClientRepository clientRepository;
    private ClientIdentityService service;

    @BeforeEach
    void setUp() {
        openidRepository = mock(SysUserOpenidRepository.class);
        deviceRepository = mock(SysUserDeviceRepository.class);
        clientRepository = mock(SysClientRepository.class);
        service = new ClientIdentityServiceImpl(openidRepository, deviceRepository, clientRepository);
    }

    // ------------------------------------------------------------ 列表聚合

    @Test
    void listByUser_aggregatesBindingsAndDevices_sortedByClient() {
        when(openidRepository.findByUserIdAndIsDeleted(USER_ID, 0))
                .thenReturn(List.of(binding(11L, 7L, "o7abcd1234ef99", LocalDateTime.of(2026, 10, 1, 8, 0))));
        when(deviceRepository.findByUserIdAndIsDeleted(USER_ID, 0))
                .thenReturn(List.of(
                        device(21L, 7L, "tok7a-longvalue1", "ios", 0),
                        device(22L, 9L, "tok9b-longvalue2", "android", 0)));
        when(clientRepository.findAllById(any())).thenReturn(List.of(
                client(9L, "app-field", "现场端"),
                client(7L, "mp-driver", "司机端")));

        List<ClientIdentityVO> result = service.listByUser(USER_ID);

        assertThat(result).extracting(ClientIdentityVO::clientId).containsExactly(7L, 9L);
        ClientIdentityVO driver = result.get(0);
        assertThat(driver.clientName()).isEqualTo("司机端");
        assertThat(driver.clientCode()).isEqualTo("mp-driver");
        assertThat(driver.openidMasked()).isEqualTo("o7ab****ef99");
        assertThat(driver.boundAt()).isEqualTo(LocalDateTime.of(2026, 10, 1, 8, 0));
        assertThat(driver.devices()).hasSize(1);
        // 无 openid 绑定的端：仅设备行，绑定列为空
        ClientIdentityVO field = result.get(1);
        assertThat(field.openidMasked()).isNull();
        assertThat(field.boundAt()).isNull();
        assertThat(field.devices()).singleElement()
                .satisfies(d -> {
                    assertThat(d.id()).isEqualTo(22L);
                    assertThat(d.platform()).isEqualTo("android");
                    assertThat(d.revoked()).isZero();
                });
    }

    @Test
    void listByUser_masksOpenidAndDeviceToken() {
        when(openidRepository.findByUserIdAndIsDeleted(USER_ID, 0))
                .thenReturn(List.of(binding(11L, 7L, "shortopenid", null)));
        when(deviceRepository.findByUserIdAndIsDeleted(USER_ID, 0))
                .thenReturn(List.of(
                        device(21L, 7L, "abcdefghijklmn", "ios", 0),
                        device(22L, 7L, "shorttok", "android", 0)));
        when(clientRepository.findAllById(any())).thenReturn(List.of(client(7L, "mp", "小程序端")));

        ClientIdentityVO vo = service.listByUser(USER_ID).get(0);

        // 掩码规则钉死：前4 + **** + 后4；长度 ≤8 全 ****（A4 展示链不外泄完整身份值）
        assertThat(vo.openidMasked()).isEqualTo("shor****enid");
        assertThat(vo.devices()).extracting(DeviceVO::deviceTokenMasked)
                .containsExactly("abcd****klmn", "****");
    }

    @Test
    void listByUser_noIdentity_returnsEmptyList() {
        when(openidRepository.findByUserIdAndIsDeleted(USER_ID, 0)).thenReturn(List.of());
        when(deviceRepository.findByUserIdAndIsDeleted(USER_ID, 0)).thenReturn(List.of());

        assertThat(service.listByUser(USER_ID)).isEmpty();
    }

    // ------------------------------------------------------------ 管理员解绑

    @Test
    void adminUnbind_marksBindingDeleted() {
        SysUserOpenid b = binding(11L, 7L, "openid-x", null);
        when(openidRepository.findByClientIdAndUserIdAndIsDeleted(7L, USER_ID, 0))
                .thenReturn(Optional.of(b));

        service.adminUnbind(USER_ID, 7L);

        assertThat(b.getIsDeleted()).isEqualTo(1);
        verify(openidRepository).save(b);
    }

    @Test
    void adminUnbind_noBinding_throws400() {
        when(openidRepository.findByClientIdAndUserIdAndIsDeleted(7L, USER_ID, 0))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.adminUnbind(USER_ID, 7L))
                .isInstanceOf(BusinessException.class)
                .hasMessage("该端暂无身份绑定")
                .extracting(e -> ((BusinessException) e).getCode()).isEqualTo(400);
        verify(openidRepository, never()).save(any());
    }

    // ------------------------------------------------------------ 设备吊销

    @Test
    void revokeDevice_marksRevoked() {
        SysUserDevice d = device(21L, 7L, "tok-long-value", "ios", 0);
        when(deviceRepository.findById(21L)).thenReturn(Optional.of(d));

        service.revokeDevice(USER_ID, 21L);

        assertThat(d.getRevoked()).isEqualTo(1);
        verify(deviceRepository).save(d);
    }

    @Test
    void revokeDevice_otherUsersDevice_throws404() {
        SysUserDevice d = device(21L, 7L, "tok-long-value", "ios", 0);
        d.setUserId(999L); // 异主设备：与不存在同响应，防越权探测
        when(deviceRepository.findById(21L)).thenReturn(Optional.of(d));

        assertThatThrownBy(() -> service.revokeDevice(USER_ID, 21L))
                .isInstanceOf(BusinessException.class)
                .hasMessage("设备记录不存在")
                .extracting(e -> ((BusinessException) e).getCode()).isEqualTo(404);
        verify(deviceRepository, never()).save(any());
    }

    @Test
    void revokeDevice_alreadyRevoked_idempotentNoSave() {
        when(deviceRepository.findById(21L)).thenReturn(Optional.of(device(21L, 7L, "tok", "ios", 1)));

        assertThatCode(() -> service.revokeDevice(USER_ID, 21L)).doesNotThrowAnyException();
        verify(deviceRepository, never()).save(any());
    }

    @Test
    void revokeDevice_notFound_throws404() {
        when(deviceRepository.findById(21L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.revokeDevice(USER_ID, 21L))
                .isInstanceOf(BusinessException.class)
                .hasMessage("设备记录不存在")
                .extracting(e -> ((BusinessException) e).getCode()).isEqualTo(404);
    }

    // ------------------------------------------------------------ 构造 helper

    private static SysUserOpenid binding(Long id, Long clientId, String openid, LocalDateTime boundAt) {
        SysUserOpenid b = new SysUserOpenid();
        b.setId(id);
        b.setUserId(USER_ID);
        b.setClientId(clientId);
        b.setOpenid(openid);
        b.setCreatedAt(boundAt);
        return b;
    }

    private static SysUserDevice device(Long id, Long clientId, String token, String platform, Integer revoked) {
        SysUserDevice d = new SysUserDevice();
        d.setId(id);
        d.setUserId(USER_ID);
        d.setClientId(clientId);
        d.setDeviceToken(token);
        d.setPlatform(platform);
        d.setRevoked(revoked);
        return d;
    }

    private static SysClient client(Long id, String code, String name) {
        SysClient c = new SysClient();
        c.setId(id);
        c.setCode(code);
        c.setName(name);
        return c;
    }
}
