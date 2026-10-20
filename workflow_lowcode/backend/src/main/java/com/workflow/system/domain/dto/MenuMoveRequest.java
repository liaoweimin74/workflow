package com.workflow.system.domain.dto;

/**
 * 菜单拖动调整（层级 + 排序）。
 *
 * index 语义：目标父级「排除被移动节点后」的子项列表中的插入位置（0 起，超出范围按端点截断）；
 * 为 null 时追加到末尾。同父级重排与跨父级移动走同一套语义，前端只需给出落点。
 */
public record MenuMoveRequest(
        Long parentId,
        Integer index) {
}
