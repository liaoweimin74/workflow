package com.workflow.api.dto;

import java.util.List;

/**
 * 聚合结果（Task 119 仪表盘；对齐 Node 侧 {@code AggregateResultVO} 与
 * {@code aggregateResultVO(rows)}）。
 *
 * <p>{@code total} = 分组数（rows.size()），给上层判断空态用，
 * 不与行级分页的 total 混淆。
 */
public class AggregateResultVO {

    private List<AggregateRowVO> rows;
    private int total;

    public AggregateResultVO() {}

    public AggregateResultVO(List<AggregateRowVO> rows, int total) {
        this.rows = rows;
        this.total = total;
    }

    /** 对齐 Node {@code aggregateResultVO}：total = rows.length。 */
    public static AggregateResultVO of(List<AggregateRowVO> rows) {
        return new AggregateResultVO(rows, rows == null ? 0 : rows.size());
    }

    public List<AggregateRowVO> getRows() { return rows; }
    public void setRows(List<AggregateRowVO> rows) { this.rows = rows; }

    public int getTotal() { return total; }
    public void setTotal(int total) { this.total = total; }
}
