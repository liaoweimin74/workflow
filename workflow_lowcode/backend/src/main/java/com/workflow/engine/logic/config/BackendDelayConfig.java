package com.workflow.engine.logic.config;

/**
 * 后端业务逻辑 - 延时（DELAY）节点子配置。
 *
 * <pre>{@code { "durationMs": 3000 } }</pre>
 *
 * <ul>
 *   <li>durationMs：同步等待毫秒数（1~60000 硬上限：逻辑流在请求线程同步执行，
 *       过长延时会占用容器线程并拖垮吞吐，需要长延时应改用异步调度方案）；</li>
 *   <li>输出 {@code { waitedMs: N }}（实际等待毫秒，≥配置值），未声明 results 时
 *       按隐式约定写入 {@code <节点id>}。</li>
 * </ul>
 */
public class BackendDelayConfig {

    /** 最小延时（毫秒）。 */
    public static final int MIN_MS = 1;
    /** 最大延时（毫秒）——同步引擎硬上限。 */
    public static final int MAX_MS = 60_000;

    private Integer durationMs;

    public Integer getDurationMs() { return durationMs; }
    public void setDurationMs(Integer durationMs) { this.durationMs = durationMs; }
}
