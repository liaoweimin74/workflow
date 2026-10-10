package com.workflow.engine.logic.config;

/**
 * 后端业务逻辑 - 大模型调用（LLM）节点子配置。
 *
 * <p>调用平台内置 LLM（复用 ai 模块 ChatModel → 内部 OpenAI 兼容网关）：
 *
 * <pre>{@code
 * {
 *   "prompt": "请把以下请假事由归类为 事假/病假/年假/其他 之一，只输出类别词：{{formData.reason}}",
 *   "system": "你是严谨的分类助手，只输出一个词。",
 *   "temperature": 0.2
 * }
 * }</pre>
 *
 * <ul>
 *   <li>prompt：用户提示词，支持 {@code {{var}}} 与点路径取值插值；</li>
 *   <li>system：可选系统提示词（同样支持插值）；</li>
 *   <li>temperature：0~2（可空，空则用平台配置默认）；</li>
 *   <li>模型不保证可用性：网关异常 → 节点失败走 errorAction（可配失败分支）。</li>
 * </ul>
 *
 * <p>输出：{@code { content: "模型文本" }}，未声明 results 时按隐式约定写入 {@code <节点id>}。
 */
public class BackendLlmConfig {

    private String prompt;
    private String system;
    private Double temperature;

    public String getPrompt() { return prompt; }
    public void setPrompt(String prompt) { this.prompt = prompt; }

    public String getSystem() { return system; }
    public void setSystem(String system) { this.system = system; }

    public Double getTemperature() { return temperature; }
    public void setTemperature(Double temperature) { this.temperature = temperature; }
}
