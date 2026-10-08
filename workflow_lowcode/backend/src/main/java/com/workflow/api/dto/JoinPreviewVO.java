package com.workflow.api.dto;

import java.util.List;

/** config 模式 JOIN SQL 预览结果 */
public record JoinPreviewVO(String sql, List<Object> params) {}