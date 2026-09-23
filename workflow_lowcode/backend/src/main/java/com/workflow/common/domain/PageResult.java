package com.workflow.common.domain;

import java.io.Serializable;
import java.util.List;

public class PageResult<T> implements Serializable {
    private long total;
    private int page;
    private int size;
    private List<T> rows;

    public PageResult() {}

    public PageResult(long total, int page, int size, List<T> rows) {
        this.total = total;
        this.page = page;
        this.size = size;
        this.rows = rows;
    }

    public long getTotal() { return total; }
    public void setTotal(long total) { this.total = total; }
    public int getPage() { return page; }
    public void setPage(int page) { this.page = page; }
    public int getSize() { return size; }
    public void setSize(int size) { this.size = size; }
    public List<T> getRows() { return rows; }
    public void setRows(List<T> rows) { this.rows = rows; }
}