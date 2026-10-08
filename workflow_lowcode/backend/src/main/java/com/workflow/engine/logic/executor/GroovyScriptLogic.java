package com.workflow.engine.logic.executor;

import com.workflow.common.exception.BusinessException;
import groovy.lang.Binding;
import groovy.lang.GroovyShell;
import org.codehaus.groovy.control.CompilerConfiguration;
import org.codehaus.groovy.control.customizers.CompilationCustomizer;
import org.codehaus.groovy.control.customizers.SecureASTCustomizer;
import org.flowable.engine.delegate.DelegateExecution;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

/**
 * Groovy 脚本逻辑执行器（沙箱加固版）。
 *
 * <p>安全边界（本类为全系统唯一 Groovy 入口，流程节点 script 项与逻辑编排共用）：
 * <ul>
 *   <li><b>编译期</b>：{@link SecureASTCustomizer} —— 危险类/包导入黑名单（System、Runtime、
 *       ProcessBuilder、File、NIO、网络、反射、脚本引擎等），危险 receiver 黑名单（System.exit、
 *       Runtime.getRuntime 等），构造器白名单（仅常用安全类型），禁止脚本内定义方法，开启间接引用检查
 *       （全限定名绕过同样被拦）；</li>
 *   <li><b>运行期</b>：脚本在共享守护线程池中执行，超时（默认 5s，可配
 *       {@code workflow.logic.script.timeout-ms}）后 cancel(true) 中断并抛
 *       {@code SCRIPT_TIMEOUT: >Nms}；
 *       内存无独立配额，受 JVM 全局 -Xmx 约束（sandbox 448m）。</li>
 * </ul>
 *
 * <p>流程变量以绑定形式注入上下文，脚本返回值（最后表达式）作为结果，可经
 * {@code resultVar} 写回流程变量 / 编排变量。
 */
public class GroovyScriptLogic {

    /** 脚本执行超时毫秒数（默认 5s，装配时经 workflow.logic.script.timeout-ms 注入）。 */
    private final long timeoutMillis;

    /** 共享守护线程池：超时中断 + 隔离脚本运行线程，避免阻塞引擎线程。 */
    private static final ExecutorScriptRunner RUNNER = new ExecutorScriptRunner();

    public GroovyScriptLogic() {
        this(5_000L);
    }

    public GroovyScriptLogic(long timeoutMillis) {
        this.timeoutMillis = timeoutMillis;
    }

    public Object execute(String script, DelegateExecution execution, Map<String, Object> vars) {
        CompilerConfiguration config = sandboxConfig();
        Binding binding = new Binding();
        if (vars != null) {
            vars.forEach(binding::setVariable);
        }
        GroovyShell shell = new GroovyShell(binding, config);
        try {
            return RUNNER.run(() -> shell.evaluate(script), timeoutMillis);
        } catch (java.util.concurrent.TimeoutException e) {
            throw new BusinessException("SCRIPT_TIMEOUT: >" + timeoutMillis + "ms");
        } catch (java.util.concurrent.ExecutionException e) {
            Throwable cause = e.getCause() != null ? e.getCause() : e;
            // 沙箱拒绝发生在工作线程，经 ExecutionException 包装——优先透出语义
            SecurityException se = findSecurityException(cause);
            if (se != null) {
                throw se;
            }
            throw new RuntimeException("Groovy script execution failed: " + cause.getMessage(), cause);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Groovy script execution interrupted", e);
        } catch (Exception e) {
            // 沙箱拒绝（编译期 SecurityException 被 Groovy 包装）应透出语义而非吞成普通失败
            SecurityException se = findSecurityException(e);
            if (se != null) {
                throw se;
            }
            throw new RuntimeException("Groovy script execution failed", e);
        }
    }

    /** 在异常 cause 链中查找沙箱拒绝痕迹（SecurityException 对象或安全特征消息）。 */
    private static SecurityException findSecurityException(Throwable e) {
        while (e != null) {
            if (e instanceof SecurityException se) {
                return se;
            }
            String message = e.getMessage();
            if (message != null && (message.contains("Groovy sandbox")
                    || message.contains("prevents usage of expression")
                    || message.contains("not allowed"))) {
                return new SecurityException("Groovy sandbox: " + message);
            }
            e = e.getCause();
        }
        return null;
    }

    private CompilerConfiguration sandboxConfig() {
        SecureASTCustomizer secure = new SecureASTCustomizer();

        // 危险类/包导入黑名单
        secure.setDisallowedImports(List.of(
                "java.lang.System",
                "java.lang.Runtime",
                "java.lang.ProcessBuilder",
                "java.lang.Thread",
                "java.lang.ThreadGroup",
                "java.lang.ClassLoader",
                "java.lang.reflect",
                "java.io.File",
                "java.io",
                "java.nio",
                "java.net",
                "javax.script",
                "groovy.lang.MetaClass",
                "groovy.util.Eval",
                "groovy.json",
                "java.security"));
        secure.setIndirectImportCheckEnabled(true);

        // 危险 receiver 黑名单（java.lang 自动导入，无法只靠 import 黑名单拦截简单名调用）
        secure.setReceiversBlackList(List.of(
                "java.lang.System",
                "java.lang.Runtime",
                "java.lang.ProcessBuilder",
                "java.lang.Thread",
                "java.lang.ClassLoader",
                "groovy.util.Eval"));

        // 构造器白名单（Groovy 5 已移除内置 API，自实现 customizer）
        // java.lang.Object 必放行：Groovy 为脚本类隐式生成超类构造调用
        ConstructorWhitelistCustomizer ctorWhitelist = new ConstructorWhitelistCustomizer(Set.of(
                "java.lang.Object",
                "java.lang.String",
                "java.lang.StringBuilder",
                "java.lang.RuntimeException",
                "java.lang.Exception",
                "java.lang.IllegalArgumentException",
                "java.lang.IllegalStateException",
                "java.lang.ArithmeticException",
                "java.lang.NumberFormatException",
                "java.math.BigDecimal",
                "java.math.BigInteger",
                "java.util.ArrayList",
                "java.util.HashMap",
                "java.util.LinkedHashMap",
                "java.util.HashSet",
                "java.util.Date"));

        // 禁止脚本内方法定义（防递归/防隐藏入口）
        secure.setMethodDefinitionAllowed(false);
        // 禁止闭包（防嵌套隐藏入口；表达式拼接能力不受影响）
        secure.setClosuresAllowed(false);

        CompilerConfiguration config = new CompilerConfiguration();
        config.addCompilationCustomizers(secure, ctorWhitelist);
        return config;
    }

    /** 构造器白名单 customizer：仅放行白名单内的类型实例化，其余直接拒编译。 */
    private static final class ConstructorWhitelistCustomizer extends CompilationCustomizer {

        private final java.util.Set<String> allowed;

        ConstructorWhitelistCustomizer(java.util.Set<String> allowed) {
            super(org.codehaus.groovy.control.CompilePhase.CONVERSION);
            this.allowed = allowed;
        }

        @Override
        public void call(org.codehaus.groovy.control.SourceUnit source,
                         org.codehaus.groovy.classgen.GeneratorContext context,
                         org.codehaus.groovy.ast.ClassNode classNode) {
            classNode.visitContents(new org.codehaus.groovy.ast.GroovyClassVisitor() {
                @Override
                public void visitClass(org.codehaus.groovy.ast.ClassNode node) {
                }

                @Override
                public void visitConstructor(org.codehaus.groovy.ast.ConstructorNode node) {
                    check(node);
                }

                @Override
                public void visitMethod(org.codehaus.groovy.ast.MethodNode node) {
                    check(node);
                }

                @Override
                public void visitField(org.codehaus.groovy.ast.FieldNode node) {
                }

                @Override
                public void visitProperty(org.codehaus.groovy.ast.PropertyNode node) {
                }

                private void check(org.codehaus.groovy.ast.MethodNode node) {
                    if (node.getCode() != null) {
                        node.getCode().visit(new org.codehaus.groovy.ast.CodeVisitorSupport() {
                            @Override
                            public void visitConstructorCallExpression(
                                    org.codehaus.groovy.ast.expr.ConstructorCallExpression call) {
                                // CONVERSION 阶段类型名可能是简单名（未解析 import）；
                                // 与白名单条目做全名/后缀双向匹配
                                String typeName = call.getType().getName();
                                boolean ok = allowed.contains(typeName)
                                        || allowed.stream().anyMatch(a -> a.endsWith("." + typeName));
                                if (!ok) {
                                    throw new SecurityException(
                                            "Groovy sandbox: constructor not allowed: " + typeName);
                                }
                                super.visitConstructorCallExpression(call);
                            }
                        });
                    }
                }
            });
        }
    }

    /** 共享脚本执行器：daemon 线程 + 超时取消。 */
    private static final class ExecutorScriptRunner {

        private final ExecutorService executor = Executors.newCachedThreadPool(r -> {
            Thread t = new Thread(r, "groovy-logic-sandbox");
            t.setDaemon(true);
            return t;
        });

        Object run(java.util.function.Supplier<Object> task, long timeoutMillis)
                throws Exception {
            Future<Object> future = executor.submit(() -> task.get());
            try {
                return future.get(timeoutMillis, TimeUnit.MILLISECONDS);
            } catch (java.util.concurrent.TimeoutException e) {
                future.cancel(true);
                throw e;
            }
        }
    }
}
