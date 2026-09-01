package com.workflow.notification.store;

import com.workflow.notification.model.ChannelConfig;
import com.workflow.notification.model.ChannelType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * 渠道配置 Repository
 */
public interface ChannelConfigRepository extends JpaRepository<ChannelConfig, Long> {

    List<ChannelConfig> findByChannel(ChannelType channel);

    Optional<ChannelConfig> findByChannelAndConfigKey(ChannelType channel, String configKey);
}
