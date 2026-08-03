package com.workflow.engine.logic;

/**
 * 白名单中一个可被流程后端逻辑调用的 Bean 方法注册项。
 *
 * @param beanName      Spring Bean 名称
 * @param methodName    方法名
 * @param displayName   展示名（用于设计器下拉），如 {@code syncOrder(String, Integer)}
 * @param parameterCount 方法参数个数（运行时按序传入流程变量映射值时用于校验）
 */
public record RegisteredBeanMethod(String beanName, String methodName, String displayName, int parameterCount) {
}