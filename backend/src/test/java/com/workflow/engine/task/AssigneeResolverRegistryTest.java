package com.workflow.engine.task;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AssigneeResolverRegistry 单元测试（Task 72：external 业务系统注册选人函数扩展点）。
 *
 * <p>验证：Bean 构造注入自动建表、按名查找、未注册/空名返回 empty、registeredNames 清单。
 */
class AssigneeResolverRegistryTest {

    /** 测试用固定选人实现：返回预置用户列表。 */
    private static class FixedResolver implements AssigneeResolver {
        private final String name;
        private final List<String> users;

        private FixedResolver(String name, List<String> users) {
            this.name = name;
            this.users = users;
        }

        @Override
        public String name() {
            return name;
        }

        @Override
        public List<String> resolve(AssigneeResolveContext ctx) {
            return users;
        }
    }

    @Test
    void find_returnsRegisteredResolver() {
        AssigneeResolver resolver = new FixedResolver("crm_owner_resolver", List.of("u-1001"));
        AssigneeResolverRegistry registry = new AssigneeResolverRegistry(List.of(resolver));

        assertThat(registry.find("crm_owner_resolver")).containsSame(resolver);
        assertThat(registry.registeredNames()).containsExactly("crm_owner_resolver");
    }

    @Test
    void find_unregistered_returnsEmpty() {
        AssigneeResolverRegistry registry = new AssigneeResolverRegistry(
                List.of(new FixedResolver("a", List.of())));

        assertThat(registry.find("not_registered")).isEmpty();
    }

    @Test
    void find_blankOrNullName_returnsEmpty() {
        AssigneeResolverRegistry registry = new AssigneeResolverRegistry(List.of());

        assertThat(registry.find("  ")).isEmpty();
        assertThat(registry.find(null)).isEmpty();
    }

    @Test
    void constructor_skipsBlankName_andOverwritesDuplicate() {
        AssigneeResolver first = new FixedResolver("dup", List.of("u-1"));
        AssigneeResolver second = new FixedResolver(" dup ", List.of("u-2"));
        AssigneeResolver noName = new FixedResolver("   ", List.of("u-3"));
        AssigneeResolverRegistry registry = new AssigneeResolverRegistry(List.of(first, second, noName));

        assertThat(registry.registeredNames()).containsExactly("dup");
        assertThat(registry.find("dup")).containsSame(second);
    }

    @Test
    void resolve_receivesContextFields() {
        AssigneeResolver resolver = new AssigneeResolver() {
            @Override
            public String name() {
                return "ctx_check";
            }

            @Override
            public List<String> resolve(AssigneeResolveContext ctx) {
                return List.of("u-" + ctx.nodeId() + "-" + ctx.variables().get("owner_id"));
            }
        };
        AssigneeResolverRegistry registry = new AssigneeResolverRegistry(List.of(resolver));

        AssigneeResolveContext ctx = new AssigneeResolveContext("node_a", "节点A", "initiator-1",
                Map.of("owner_id", 7));
        List<String> resolved = registry.find("ctx_check").orElseThrow().resolve(ctx);

        assertThat(resolved).containsExactly("u-node_a-7");
        assertThat(ctx.initiator()).isEqualTo("initiator-1");
        assertThat(ctx.nodeName()).isEqualTo("节点A");
    }
}
