package com.workflow.api.dto;

/**
 * 页面模板导入结果（bundle 内逐条按 key upsert 的统计）。
 */
public class PageTemplateImportResultDTO {

    private int created;
    private int updated;

    public PageTemplateImportResultDTO() {}

    public PageTemplateImportResultDTO(int created, int updated) {
        this.created = created;
        this.updated = updated;
    }

    public int getCreated() { return created; }
    public void setCreated(int created) { this.created = created; }

    public int getUpdated() { return updated; }
    public void setUpdated(int updated) { this.updated = updated; }
}
