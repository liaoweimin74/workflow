package com.workflow.api.dto;

import java.util.List;

/**
 * 页面模板 bundle（导出响应 / 导入请求同构）。
 * schema 用 Object 承载（HTTP 层由 Jackson 3 绑定为 Map/List，落库前由服务侧序列化为字符串）。
 */
public class PageTemplateBundleDTO {

    private String kind;
    private Integer schemaVersion;
    private List<Item> templates;

    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }

    public Integer getSchemaVersion() { return schemaVersion; }
    public void setSchemaVersion(Integer schemaVersion) { this.schemaVersion = schemaVersion; }

    public List<Item> getTemplates() { return templates; }
    public void setTemplates(List<Item> templates) { this.templates = templates; }

    /** 单个模板条目 */
    public static class Item {
        private String key;
        private String name;
        /** 模板形态：full / skeleton（缺省 full） */
        private String kind;
        private Object schema;

        public String getKey() { return key; }
        public void setKey(String key) { this.key = key; }

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getKind() { return kind; }
        public void setKind(String kind) { this.kind = kind; }

        public Object getSchema() { return schema; }
        public void setSchema(Object schema) { this.schema = schema; }
    }
}
