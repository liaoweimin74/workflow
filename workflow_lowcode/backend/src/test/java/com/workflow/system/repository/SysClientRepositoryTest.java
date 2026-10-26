package com.workflow.system.repository;

import com.workflow.system.domain.entity.SysClient;
import com.workflow.system.domain.entity.SysClientChannel;
import com.workflow.system.domain.entity.SysMenu;
import com.workflow.system.domain.entity.SysRole;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.ActiveProfiles;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 多端地基（J1）——sys_client / sys_client_channel 形状与 sys_menu/sys_role 的
 * client_id 挂端列（multi-client-support，Java 侧重建，对齐 backend-node V50-V52 语义）。
 *
 * <p>注意双轨：本测试只见 JPA 实体生成的 H2 schema（ddl-auto=create-drop，flyway 关闭），
 * 迁移 SQL V71-V73 服务真实 MySQL——两边形状必须一致。
 */
@SpringBootTest
@ActiveProfiles("test")
class SysClientRepositoryTest {

    @Autowired
    private SysClientRepository clientRepository;

    @Autowired
    private SysClientChannelRepository channelRepository;

    @Autowired
    private SysMenuRepository menuRepository;

    @Autowired
    private SysRoleRepository roleRepository;

    private SysClient buildClient(String code, String name) {
        SysClient client = new SysClient();
        client.setCode(code);
        client.setName(name);
        client.setStatus(1);
        return client;
    }

    @Test
    void client_roundtrip_and_findByCode() {
        SysClient saved = clientRepository.saveAndFlush(buildClient("driver-app", "司机端"));
        try {
            Optional<SysClient> found = clientRepository.findByCodeAndIsDeleted("driver-app", 0);
            assertThat(found).isPresent();
            assertThat(found.get().getId()).isEqualTo(saved.getId());
            assertThat(found.get().getName()).isEqualTo("司机端");
            assertThat(found.get().getStatus()).isEqualTo(1);
        } finally {
            clientRepository.delete(saved);
        }
    }

    @Test
    void client_code_is_globally_unique() {
        SysClient first = clientRepository.saveAndFlush(buildClient("uk-code", "端A"));
        try {
            assertThatThrownBy(() -> clientRepository.saveAndFlush(buildClient("uk-code", "端B")))
                    .isInstanceOf(DataIntegrityViolationException.class);
        } finally {
            clientRepository.delete(first);
        }
    }

    @Test
    void channel_matrix_roundtrip_and_same_channel_reusable_across_clients() {
        SysClient a = clientRepository.saveAndFlush(buildClient("chan-a", "端A"));
        SysClient b = clientRepository.saveAndFlush(buildClient("chan-b", "端B"));
        try {
            SysClientChannel aWeb = new SysClientChannel();
            aWeb.setClientId(a.getId());
            aWeb.setChannelType("WEB");
            aWeb.setEnabled(1);
            aWeb.setConfigJson("{\"loginMethods\":[\"PWD\",\"SMS\"]}");
            channelRepository.saveAndFlush(aWeb);

            // 同一渠道在不同端可各自开通（uk 是 (client_id, channel_type)，不是 channel 全局唯一）
            SysClientChannel bWeb = new SysClientChannel();
            bWeb.setClientId(b.getId());
            bWeb.setChannelType("WEB");
            bWeb.setEnabled(0);
            channelRepository.saveAndFlush(bWeb);

            Optional<SysClientChannel> found = channelRepository.findByClientIdAndChannelType(a.getId(), "WEB");
            assertThat(found).isPresent();
            assertThat(found.get().getEnabled()).isEqualTo(1);
            assertThat(found.get().getConfigJson()).contains("loginMethods");
        } finally {
            channelRepository.deleteAll(channelRepository.findByClientIdIn(java.util.List.of(a.getId(), b.getId())));
            clientRepository.delete(a);
            clientRepository.delete(b);
        }
    }

    @Test
    void channel_duplicate_client_channel_pair_violates_uk() {
        SysClient client = clientRepository.saveAndFlush(buildClient("chan-dup", "端Dup"));
        try {
            SysClientChannel first = new SysClientChannel();
            first.setClientId(client.getId());
            first.setChannelType("H5");
            first.setEnabled(1);
            channelRepository.saveAndFlush(first);

            SysClientChannel second = new SysClientChannel();
            second.setClientId(client.getId());
            second.setChannelType("H5");
            second.setEnabled(0);
            assertThatThrownBy(() -> channelRepository.saveAndFlush(second))
                    .isInstanceOf(DataIntegrityViolationException.class);
        } finally {
            channelRepository.deleteAll(channelRepository.findByClientIdIn(java.util.List.of(client.getId())));
            clientRepository.delete(client);
        }
    }

    @Test
    void menu_client_id_defaults_to_portal() {
        SysMenu menu = new SysMenu();
        menu.setMenuName("端隔离测试菜单");
        menu.setMenuType(1);
        menu.setPath("/test/client-scope");
        menu.setSortOrder(99);
        menu.setStatus(1);
        menu.setIsDeleted(0);
        // 不显式设 clientId —— 缺省必须落 portal(1)，存量行为零破坏的关键
        SysMenu saved = menuRepository.saveAndFlush(menu);
        try {
            assertThat(menuRepository.findById(saved.getId()).orElseThrow().getClientId()).isEqualTo(1L);
        } finally {
            menuRepository.delete(saved);
        }
    }

    @Test
    void role_client_id_defaults_to_portal() {
        SysRole role = new SysRole();
        role.setRoleName("端隔离测试角色");
        role.setRoleCode("ROLE_TEST_CLIENT_SCOPE");
        role.setStatus(1);
        role.setIsDeleted(0);
        SysRole saved = roleRepository.saveAndFlush(role);
        try {
            assertThat(roleRepository.findById(saved.getId()).orElseThrow().getClientId()).isEqualTo(1L);
        } finally {
            roleRepository.delete(saved);
        }
    }
}
