/**
 * AI 基础设施模块
 *
 * <p>提供可复用的 AI 调用能力：
 * <ul>
 *   <li>模型供应商抽象（OpenAI 兼容协议）</li>
 *   <li>非流式 / 流式（SSE）调用</li>
 *   <li>JSON 结构化输出</li>
 *   <li>调用审计</li>
 * </ul>
 *
 * <p>子包 {@code com.workflow.ai.formgen} 承载表单 AI 生成业务场景。
 */
package com.workflow.ai;
