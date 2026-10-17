package com.workflow.api.dto;

/**
 * 页面模板保存/更新请求。
 * save 端点走 key upsert（覆盖更新）；PUT 端点按 id 更新，null 字段不更新。
 */
public class PageTemplateSaveRequest {

    private String name;
    private String key;
    private String schema;
    /** 模板形态：full（缺省）/skeleton（骨架，数据源槽位化） */
    private String kind;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }

    public String getSchema() { return schema; }
    public void setSchema(String schema) { this.schema = schema; }

    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
}
