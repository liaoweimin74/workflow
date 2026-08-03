package com.workflow.engine.logic.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 类级注解：标注某个 Spring Bean 可被流程的「调用本系统服务」后端逻辑白名单注册。
 * 只有标注了该注解的 Bean，其方法才会被 {@code BackendBeanRegistry} 扫描并允许在运行时被反射调用。
 */
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.TYPE)
public @interface BackendLogicBean {
}