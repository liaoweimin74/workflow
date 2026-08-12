package com.workflow.api.dto;

import java.util.List;

/**
 * 业务数据分页查询结果。
 */
public class BizDataPageVO {

    private List<BizDataVO> records;
    private long total;
    private int page;
    private int size;

    public BizDataPageVO() {}

    public BizDataPageVO(List<BizDataVO> records, long total, int page, int size) {
        this.records = records;
        this.total = total;
        this.page = page;
        this.size = size;
    }

    public List<BizDataVO> getRecords() { return records; }
    public void setRecords(List<BizDataVO> records) { this.records = records; }

    public long getTotal() { return total; }
    public void setTotal(long total) { this.total = total; }

    public int getPage() { return page; }
    public void setPage(int page) { this.page = page; }

    public int getSize() { return size; }
    public void setSize(int size) { this.size = size; }
}
