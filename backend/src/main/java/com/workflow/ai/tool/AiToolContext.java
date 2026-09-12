package com.workflow.ai.tool;

import com.workflow.ai.model.PageRef;

import java.util.List;

/**
 * 工具执行上下文（随请求变化）。
 *
 * @param pages 当前用户可访问的页面（用于 open_page 白名单校验）
 */
public record AiToolContext(List<PageRef> pages) {

    public static AiToolContext empty() {
        return new AiToolContext(List.of());
    }
}
