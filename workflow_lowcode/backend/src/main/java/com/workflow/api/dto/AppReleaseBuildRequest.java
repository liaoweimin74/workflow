package com.workflow.api.dto;

/**
 * Release 构建触发请求体（Task 9.2）。
 * files 为前端 generatePageUni 的产物（src/... → 文本），构建链路原样转发给
 * app-builder 落盘构建——后端不解释产物内容，快照（snapshot_json）提供
 * client 配置与页面版本，files 提供这一版的实际产物。
 */
public class AppReleaseBuildRequest {

    /** generatePageUni 产物 JSON（键为 src/ 相对路径） */
    private String files;

    public String getFiles() { return files; }
    public void setFiles(String files) { this.files = files; }
}
