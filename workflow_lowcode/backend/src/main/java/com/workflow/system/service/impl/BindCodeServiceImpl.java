package com.workflow.system.service.impl;

import com.workflow.common.constant.GlobalConstant;
import com.workflow.common.exception.BusinessException;
import com.workflow.system.domain.entity.SysBindCode;
import com.workflow.system.domain.entity.SysClient;
import com.workflow.system.domain.entity.SysUser;
import com.workflow.system.domain.vo.BindCodeVO;
import com.workflow.system.repository.SysBindCodeRepository;
import com.workflow.system.repository.SysClientRepository;
import com.workflow.system.repository.SysUserRepository;
import com.workflow.system.service.BindCodeService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Objects;

/**
 * 绑定码服务实现（J3，表方案）。
 */
@Service
public class BindCodeServiceImpl implements BindCodeService {

    /** 码字符集：大写字母+数字（剔除易混字符 O/0/I/1），仍在 ^[A-Z0-9]{12}$ 形状内。 */
    private static final char[] CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
    private static final int CODE_LENGTH = 12;
    private static final Duration TTL = Duration.ofMinutes(30);

    private final SecureRandom random = new SecureRandom();

    private final SysBindCodeRepository bindCodeRepository;
    private final SysUserRepository userRepository;
    private final SysClientRepository clientRepository;

    public BindCodeServiceImpl(SysBindCodeRepository bindCodeRepository,
                               SysUserRepository userRepository,
                               SysClientRepository clientRepository) {
        this.bindCodeRepository = bindCodeRepository;
        this.userRepository = userRepository;
        this.clientRepository = clientRepository;
    }

    @Override
    @Transactional
    public BindCodeVO issue(Long userId, Long clientId) {
        SysUser user = userRepository.findById(userId)
                .filter(u -> Objects.equals(u.getIsDeleted(), GlobalConstant.DELETED_NO)
                        && Integer.valueOf(1).equals(u.getStatus()))
                .orElseThrow(() -> new BusinessException(400, "用户不存在或已停用"));
        SysClient client = clientRepository.findById(clientId)
                .filter(c -> Objects.equals(c.getIsDeleted(), GlobalConstant.DELETED_NO)
                        && Integer.valueOf(1).equals(c.getStatus()))
                .orElseThrow(() -> new BusinessException(400, "客户端不存在或已停用"));

        SysBindCode record = new SysBindCode();
        record.setCode(randomCode());
        record.setUserId(user.getId());
        record.setClientId(client.getId());
        record.setUsed(0);
        record.setExpiresAt(LocalDateTime.now().plus(TTL));
        bindCodeRepository.save(record);
        return new BindCodeVO(record.getCode(), record.getExpiresAt());
    }

    @Override
    @Transactional
    public SysBindCode consume(String code, Long clientId) {
        SysBindCode record = bindCodeRepository.findByCode(code)
                .orElseThrow(() -> new BusinessException(401, "绑定码无效或已过期"));
        if (Integer.valueOf(1).equals(record.getUsed())) {
            throw new BusinessException(401, "绑定码已被使用");
        }
        // 过期与端不匹配统一「无效或已过期」——不泄露码的真实状态/归属（防枚举）
        if (record.getExpiresAt() == null || record.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new BusinessException(401, "绑定码无效或已过期");
        }
        if (!Objects.equals(clientId, record.getClientId())) {
            throw new BusinessException(401, "绑定码无效或已过期");
        }
        record.setUsed(1);
        return bindCodeRepository.save(record);
    }

    private String randomCode() {
        StringBuilder sb = new StringBuilder(CODE_LENGTH);
        for (int i = 0; i < CODE_LENGTH; i++) {
            sb.append(CODE_ALPHABET[random.nextInt(CODE_ALPHABET.length)]);
        }
        return sb.toString();
    }
}
