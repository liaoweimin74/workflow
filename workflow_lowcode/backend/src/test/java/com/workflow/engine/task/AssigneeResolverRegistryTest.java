package com.workflow.engine.task;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * AssigneeResolverRegistry 单元测试（Task 72：external 业务系统注册选人函数扩展点；
 * Task 73：中文名唯一 + 元数据清单 + params 双参签名）。
 *
 * <p>验证：Bean 构造注入自动建表、按名查找、未注册/空名返回 empty、registeredNames 清单、
 * 中文名重复启动失败、metadata() 形状、params 第二参透传。
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
        public List<String> resolve(AssigneeResolveContext ctx, Map<String, Object> params) {
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
            public List<String> resolve(AssigneeResolveContext ctx, Map<String, Object> params) {
                return List.of("u-" + ctx.nodeId() + "-" + ctx.variables().get("owner_id"));
            }
        };
        AssigneeResolverRegistry registry = new AssigneeResolverRegistry(List.of(resolver));

        AssigneeResolveContext ctx = new AssigneeResolveContext("node_a", "节点A", "initiator-1",
                Map.of("owner_id", 7));
        List<String> resolved = registry.find("ctx_check").orElseThrow().resolve(ctx, Map.of());

        assertThat(resolved).containsExactly("u-node_a-7");
        assertThat(ctx.initiator()).isEqualTo("initiator-1");
        assertThat(ctx.nodeName()).isEqualTo("节点A");
    }

    @Test
    void constructor_duplicateDisplayName_fails() {
        // 两个不同注册名声明同一中文名 → 启动失败（面板靠中文名区分函数，重复会造成歧义）
        AssigneeResolver a = new FixedResolver("resolver_a", List.of("u-1")) {
            @Override
            public String displayName() {
                return "客户负责人";
            }
        };
        AssigneeResolver b = new FixedResolver("resolver_b", List.of("u-2")) {
            @Override
            public String displayName() {
                return "客户负责人";
            }
        };

        assertThatThrownBy(() -> new AssigneeResolverRegistry(List.of(a, b)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("中文名重复")
                .hasMessageContaining("resolver_a");
    }

    @Test
    void constructor_sameNameReregisterWithSameDisplayName_allowed() {
        // 同名覆盖：与被覆盖者共用槽位，中文名不冲突
        AssigneeResolver a = new FixedResolver("dup", List.of("u-1")) {
            @Override
            public String displayName() {
                return "同名覆盖";
            }
        };
        AssigneeResolver b = new FixedResolver(" dup ", List.of("u-2")) {
            @Override
            public String displayName() {
                return "同名覆盖";
            }
        };
        AssigneeResolverRegistry registry = new AssigneeResolverRegistry(List.of(a, b));

        assertThat(registry.registeredNames()).containsExactly("dup");
        assertThat(registry.find("dup")).containsSame(b);
    }

    @Test
    void metadata_returnsMetaSortedByName_withDefaultsAndParams() {
        AssigneeResolver withMeta = new FixedResolver("b_meta", List.of("u-1")) {
            @Override
            public String displayName() {
                return "项目负责人";
            }

            @Override
            public String description() {
                return "从流程变量解析";
            }

            @Override
            public List<AssigneeParamDef> paramDefs() {
                return List.of(new AssigneeParamDef(
                        "variableName", "流程变量名", "string", true,
                        "如：project_manager_id", "project_manager_id", null, null));
            }
        };
        AssigneeResolver plain = new FixedResolver("a_plain", List.of("u-2"));
        AssigneeResolverRegistry registry = new AssigneeResolverRegistry(List.of(withMeta, plain));

        List<AssigneeResolverRegistry.ResolverMeta> metas = registry.metadata();

        assertThat(metas).hasSize(2);
        assertThat(metas.get(0).name()).isEqualTo("a_plain");
        // 未声明中文名时缺省取注册名
        assertThat(metas.get(0).displayName()).isEqualTo("a_plain");
        assertThat(metas.get(0).description()).isNull();
        assertThat(metas.get(0).params()).isNull();
        assertThat(metas.get(1).displayName()).isEqualTo("项目负责人");
        assertThat(metas.get(1).description()).isEqualTo("从流程变量解析");
        assertThat(metas.get(1).params()).hasSize(1);
        assertThat(metas.get(1).params().get(0).key()).isEqualTo("variableName");
        assertThat(metas.get(1).params().get(0).required()).isTrue();
    }
}
