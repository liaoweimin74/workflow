package com.workflow.ai.model;

/**
 * 可跳转页面引用。
 *
 * @param path  前端路由路径（如 /form）
 * @param label 中文名称（如 表单管理）
 */
public record PageRef(String path, String label) {
}
