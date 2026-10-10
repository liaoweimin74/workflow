package com.workflow.engine.logic.config;

/**
 * 后端业务逻辑 - 数据映射（TRANSFORM）节点子配置。
 *
 * <p>JSON 模板编译：{@code {{var.path}}} 占位符产出新对象，替代用户写 Groovy 的场景。
 * 占位符两种形态（编译语义不同）：
 *
 * <pre>{@code
 * {
 *   "template": "{\"name\": {{formData.person_name}}, \"summary\": \"姓名 {{formData.person_name}} 共 {{total}} 条\"}"
 * }
 * }</pre>
 *
 * <ul>
 *   <li>值位占位符（占位符独占 JSON 值位置，如 {@code "k": {{var.sub}}}）：注入变量原始值
 *       （对象/数组/数值/布尔原样保留类型）；变量不存在注入 null；</li>
 *   <li>字符串内占位符（如 {@code "共 {{total}} 条"}）：toString 插值，缺失替换空串；</li>
 *   <li>编译产物须为合法 JSON（对象或数组），否则节点失败（配置错误尽早暴露）。</li>
 * </ul>
 *
 * <p>输出：编译后的 Map/List，未声明 results 时按隐式约定写入 {@code <节点id>}。
 */
public class BackendTransformConfig {

    private String template;

    public String getTemplate() { return template; }
    public void setTemplate(String template) { this.template = template; }
}
