package com.workflow.notification.subscription;

import com.workflow.notification.channel.EncryptionUtil;
import com.workflow.notification.model.ChannelConfig;
import com.workflow.notification.model.ChannelType;
import com.workflow.notification.store.ChannelConfigRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 渠道配置服务
 *
 * <p>管理渠道运行时配置：保存时敏感字段（键名含 key/secret/password/token）加密落库，
 * 读取时解密返回。支持按渠道查询配置是否已设置（用于渠道可用性判断）。
 */
@Service
public class ChannelConfigService {

    private final ChannelConfigRepository configRepository;
    private final EncryptionUtil encryptionUtil;

    public ChannelConfigService(ChannelConfigRepository configRepository, EncryptionUtil encryptionUtil) {
        this.configRepository = configRepository;
        this.encryptionUtil = encryptionUtil;
    }

    /**
     * 保存渠道配置（整批覆盖：先删后插，保证与提交的键集合一致）。
     * 敏感键值加密存储。
     */
    @Transactional
    public void save(ChannelType channel, Map<String, String> config) {
        // 先删除该渠道全部既有配置，再写入新配置（覆盖语义）
        List<ChannelConfig> existing = configRepository.findByChannel(channel);
        configRepository.deleteAll(existing);

        if (config != null) {
            for (Map.Entry<String, String> entry : config.entrySet()) {
                String key = entry.getKey();
                if (key == null || key.isBlank()) continue;
                String value = entry.getValue();
                if (value == null) continue;

                boolean sensitive = isSensitive(key);
                ChannelConfig row = new ChannelConfig();
                row.setChannel(channel);
                row.setConfigKey(key.trim());
                row.setConfigValue(sensitive ? encryptionUtil.encrypt(value) : value);
                row.setEncrypted(sensitive);
                configRepository.save(row);
            }
        }
    }

    /**
     * 读取渠道全部配置（解密后）。
     */
    public Map<String, String> getAll(ChannelType channel) {
        return configRepository.findByChannel(channel).stream()
                .collect(Collectors.toMap(
                        ChannelConfig::getConfigKey,
                        c -> Boolean.TRUE.equals(c.getEncrypted())
                                ? encryptionUtil.decrypt(c.getConfigValue())
                                : c.getConfigValue(),
                        (a, b) -> a));
    }

    /**
     * 渠道是否有非空配置（至少一条配置即视为已配置）。
     */
    public boolean isConfigured(ChannelType channel) {
        return configRepository.findByChannel(channel).stream()
                .anyMatch(c -> c.getConfigValue() != null && !c.getConfigValue().isEmpty());
    }

    /**
     * 判断配置键是否属于敏感字段（需加密存储）。
     * 约定：键名包含 key/secret/password/token 的均视为敏感。
     */
    private boolean isSensitive(String key) {
        String lower = key.toLowerCase(Locale.ROOT);
        return lower.contains("key") || lower.contains("secret")
                || lower.contains("password") || lower.contains("token");
    }
}
