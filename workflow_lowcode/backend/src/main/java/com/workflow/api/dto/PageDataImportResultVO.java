package com.workflow.api.dto;

import java.util.ArrayList;
import java.util.List;

/**
 * 页面数据视图 Excel 导入结果。
 * 单行失败收集不中断（errors.row = Excel 实际行号，表头为第 1 行，首个数据行 = 2）。
 */
public class PageDataImportResultVO {

    /** 读取到的非空数据行总数（不含空行） */
    private int total;

    /** 成功插入行数 */
    private int success;

    /** 失败行数 */
    private int failed;

    /** 跳过的空行数 */
    private int skipped;

    /** 失败明细（row = Excel 行号） */
    private List<RowError> errors = new ArrayList<>();

    public static class RowError {

        /** Excel 实际行号（1-based，表头 = 1） */
        private int row;

        /** 失败原因 */
        private String message;

        public RowError() {}

        public RowError(int row, String message) {
            this.row = row;
            this.message = message;
        }

        public int getRow() { return row; }
        public void setRow(int row) { this.row = row; }

        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }
    }

    public int getTotal() { return total; }
    public void setTotal(int total) { this.total = total; }

    public int getSuccess() { return success; }
    public void setSuccess(int success) { this.success = success; }

    public int getFailed() { return failed; }
    public void setFailed(int failed) { this.failed = failed; }

    public int getSkipped() { return skipped; }
    public void setSkipped(int skipped) { this.skipped = skipped; }

    public List<RowError> getErrors() { return errors; }
    public void setErrors(List<RowError> errors) { this.errors = errors; }
}
