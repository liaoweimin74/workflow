package com.workflow.system.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;

/**
 * 字典项拖动排序请求。
 * ids = 当前可见子集拖动后的新顺序；后端按此顺序前置，未列出的在册项顺次排在后面，
 * 最后整表归一化 sortOrder = 0..n-1。
 */
public record DictDataSortRequest(
        @NotBlank String dictCode,
        @NotNull List<Long> ids) {
}
