package com.workflow.system.domain.vo;

import java.util.List;

/** 客户端下拉项（A2 端选择用）：status 原样透传（含停用端），channelTypes 只收已开通渠道，绝不含 config。 */
public record ClientOptionVO(
        Long id,
        String code,
        String name,
        Integer status,
        List<String> channelTypes) {
}
