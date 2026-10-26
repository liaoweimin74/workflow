package com.workflow.system.service.impl;

import com.workflow.common.constant.GlobalConstant;
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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;

/**
 * A4 端身份管理链实现（J5a）。
 *
 * <p>数据源 = sys_user_openid（V75 泛化后按 clientId 隔离）+ sys_user_device；
 * 只列该账号实际有过身份的端（无绑定无设备的端不出行）。
 */
@Service
public class ClientIdentityServiceImpl implements ClientIdentityService {

    private final SysUserOpenidRepository openidRepository;
    private final SysUserDeviceRepository deviceRepository;
    private final SysClientRepository clientRepository;

    public ClientIdentityServiceImpl(SysUserOpenidRepository openidRepository,
                                     SysUserDeviceRepository deviceRepository,
                                     SysClientRepository clientRepository) {
        this.openidRepository = openidRepository;
        this.deviceRepository = deviceRepository;
        this.clientRepository = clientRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public List<ClientIdentityVO> listByUser(Long userId) {
        Map<Long, SysUserOpenid> bindingByClient = openidRepository
                .findByUserIdAndIsDeleted(userId, GlobalConstant.DELETED_NO).stream()
                // uk(client_id, user_id) 保证同端单行；merge 仅作防御
                .collect(Collectors.toMap(SysUserOpenid::getClientId, b -> b, (a, b) -> a));
        Map<Long, List<SysUserDevice>> devicesByClient = deviceRepository
                .findByUserIdAndIsDeleted(userId, GlobalConstant.DELETED_NO).stream()
                .collect(Collectors.groupingBy(SysUserDevice::getClientId));

        Set<Long> clientIds = new TreeSet<>();
        clientIds.addAll(bindingByClient.keySet());
        clientIds.addAll(devicesByClient.keySet());
        if (clientIds.isEmpty()) {
            return List.of();
        }

        Map<Long, SysClient> clients = clientRepository.findAllById(clientIds).stream()
                .collect(Collectors.toMap(SysClient::getId, c -> c));

        List<ClientIdentityVO> result = new ArrayList<>();
        for (Long clientId : clientIds) { // TreeSet = clientId 升序
            SysClient client = clients.get(clientId);
            if (client == null) {
                continue; // 端记录缺失（理论上外键完整）：防御性跳过，不出半行
            }
            SysUserOpenid binding = bindingByClient.get(clientId);
            List<DeviceVO> deviceVos = devicesByClient.getOrDefault(clientId, List.of()).stream()
                    .sorted(Comparator.comparing(SysUserDevice::getId))
                    .map(d -> new DeviceVO(d.getId(), d.getPlatform(), mask(d.getDeviceToken()),
                            d.getRevoked(), d.getLastLoginAt()))
                    .collect(Collectors.toList());
            result.add(new ClientIdentityVO(clientId, client.getName(), client.getCode(),
                    binding == null ? null : mask(binding.getOpenid()),
                    binding == null ? null : binding.getCreatedAt(),
                    deviceVos));
        }
        return result;
    }

    @Override
    @Transactional
    public void adminUnbind(Long userId, Long clientId) {
        SysUserOpenid binding = openidRepository
                .findByClientIdAndUserIdAndIsDeleted(clientId, userId, GlobalConstant.DELETED_NO)
                .orElseThrow(() -> new BusinessException(400, "该端暂无身份绑定"));
        binding.setIsDeleted(1); // 与本人 clientUnbind 同形状：软删保留审计
        openidRepository.save(binding);
    }

    @Override
    @Transactional
    public void revokeDevice(Long userId, Long deviceId) {
        SysUserDevice device = deviceRepository.findById(deviceId)
                .filter(d -> userId.equals(d.getUserId()))
                // 异主与不存在同码同文案：不暴露设备是否存在（防越权探测）
                .orElseThrow(() -> new BusinessException(404, "设备记录不存在"));
        if (device.getRevoked() != null && device.getRevoked() == GlobalConstant.DELETED_YES) {
            return; // 幂等：已吊销不再落写
        }
        device.setRevoked(GlobalConstant.DELETED_YES);
        deviceRepository.save(device);
    }

    /** 展示掩码 = 前4 + **** + 后4；长度 ≤8 全 ****（A4 展示链不外泄完整身份值）。 */
    private static String mask(String value) {
        if (value == null) {
            return null;
        }
        if (value.length() <= 8) {
            return "****";
        }
        return value.substring(0, 4) + "****" + value.substring(value.length() - 4);
    }
}
