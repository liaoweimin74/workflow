package com.workflow.engine.logic;

import com.workflow.engine.logic.annotation.BackendLogicBean;
import org.springframework.context.ApplicationContext;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * 本系统服务（Bean 类型逻辑）的白名单注册表。
 *
 * <p>构造时从 Spring {@link ApplicationContext} 扫描所有标注 {@link BackendLogicBean} 的 Bean，
 * 收集其公开方法为 {@link RegisteredBeanMethod}。只有注册过的方法才能被设计器选择并在运行时被调用
 * （spec：未注册方法不可调用，运行时拒绝执行并记录错误）。
 */
public class BackendBeanRegistry {

    private final List<RegisteredBeanMethod> methods;
    private final ApplicationContext applicationContext;

    public BackendBeanRegistry(ApplicationContext applicationContext) {
        this.applicationContext = applicationContext;
        Map<String, Object> beans = applicationContext.getBeansWithAnnotation(BackendLogicBean.class);
        List<RegisteredBeanMethod> collected = new ArrayList<>();
        beans.forEach((beanName, bean) -> collectBeanMethods(beanName, bean.getClass(), collected));
        // 稳定顺序：按 bean 名、方法名排序，保证返回清单确定性。
        collected.sort(Comparator
                .comparing(RegisteredBeanMethod::beanName)
                .thenComparing(RegisteredBeanMethod::methodName));
        this.methods = List.copyOf(collected);
    }

    private void collectBeanMethods(String beanName, Class<?> beanClass, List<RegisteredBeanMethod> out) {
        for (Method method : beanClass.getMethods()) {
            if (method.getDeclaringClass() == Object.class) {
                continue;
            }
            out.add(new RegisteredBeanMethod(
                    beanName,
                    method.getName(),
                    buildDisplayName(method),
                    method.getParameterCount()
            ));
        }
    }

    private String buildDisplayName(Method method) {
        Class<?>[] params = method.getParameterTypes();
        StringBuilder sb = new StringBuilder(method.getName()).append('(');
        for (int i = 0; i < params.length; i++) {
            if (i > 0) {
                sb.append(", ");
            }
            sb.append(params[i].getSimpleName());
        }
        return sb.append(')').toString();
    }

    /** 返回全部已注册的 Bean 方法。 */
    public Collection<RegisteredBeanMethod> listMethods() {
        return methods;
    }

    /**
     * 按 beanName + methodName 查找白名单方法；未注册时抛出 {@link IllegalArgumentException}（白名单拒绝）。
     */
    public RegisteredBeanMethod require(String beanName, String methodName) {
        return methods.stream()
                .filter(m -> m.beanName().equals(beanName) && m.methodName().equals(methodName))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "Backend logic bean method not registered: " + beanName + "." + methodName));
    }

    /**
     * 校验参数个数并反射调用白名单 Bean 方法。
     *
     * <p>运行时根据 {@code beanName} 从 {@link ApplicationContext} 获取 Bean 实例，按方法名定位公开方法，
     * 将 {@code args} 按序传入调用。返回方法返回值（void 返回 null）。参数个数与注册时不一致时
     * 抛出 {@link IllegalArgumentException}（spec：INVALID_PARAMETER_COUNT 校验错误）。
     *
     * @param beanName  Spring Bean 名称
     * @param methodName 白名单方法名
     * @param args       按序传入的方法参数
     * @return 方法返回值，无返回则为 null
     */
    public Object invoke(String beanName, String methodName, Object[] args) {
        RegisteredBeanMethod rbm = require(beanName, methodName);
        if (args.length != rbm.parameterCount()) {
            throw new IllegalArgumentException(
                    "INVALID_PARAMETER_COUNT: bean " + rbm.beanName() + "." + rbm.methodName()
                            + " expects " + rbm.parameterCount() + " params but got " + args.length);
        }
        Object bean = applicationContext.getBean(rbm.beanName());
        Method method = Arrays.stream(bean.getClass().getMethods())
                .filter(m -> m.getName().equals(rbm.methodName()))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException(
                        "Registered method no longer present: " + rbm.beanName() + "." + rbm.methodName()));
        try {
            return method.invoke(bean, args);
        } catch (IllegalAccessException | InvocationTargetException e) {
            throw new RuntimeException("Failed to invoke backend logic bean method "
                    + rbm.beanName() + "." + rbm.methodName(), e);
        }
    }
}