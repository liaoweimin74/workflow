package com.workflow.system.domain.vo;

import java.util.Map;

/** 渠道 VO：config 是解析后的对象（非 config_json 原文），secret 有值即掩码、无值不带键。 */
public record ClientChannelVO(
        String channelType,
        Integer enabled,
        Map<String, Object> config) {
}
