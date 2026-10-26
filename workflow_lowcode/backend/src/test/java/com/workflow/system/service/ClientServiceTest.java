package com.workflow.system.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.common.domain.PageResult;
import com.workflow.common.exception.BusinessException;
import com.workflow.framework.security.ClientCrypto;
import com.workflow.system.domain.dto.ChannelUpsertRequest;
import com.workflow.system.domain.dto.ClientCreateRequest;
import com.workflow.system.domain.dto.ClientQueryRequest;
import com.workflow.system.domain.dto.ClientUpdateRequest;
import com.workflow.system.domain.entity.SysClient;
import com.workflow.system.domain.entity.SysClientChannel;
import com.workflow.system.domain.entity.SysMenu;
import com.workflow.system.domain.entity.SysRole;
import com.workflow.system.domain.vo.ChannelTestVO;
import com.workflow.system.domain.vo.ClientChannelVO;
import com.workflow.system.domain.vo.ClientOptionVO;
import com.workflow.system.domain.vo.ClientVO;
import com.workflow.system.repository.SysClientChannelRepository;
import com.workflow.system.repository.SysClientRepository;
import com.workflow.system.repository.SysMenuRepository;
import com.workflow.system.repository.SysRoleRepository;
import com.workflow.system.service.impl.ClientServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.entry;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * ClientService 业务规则单测（J2，纯 Mockito 直构造——对齐 AuthServiceImplMiniprogramTest 惯例）。
 *
 * <p>逐例移植 backend-node test/system/client.service.spec.ts 的语义并加超集
 * （secret 三态边界、portal 保护、MP 校验、D2 分区根播种幂等、testChannel 分支、读出口不泄密）。
 */
class ClientServiceTest {

    /** 32 字节密钥的 base64（对齐 node CLIENT_CRYPTO_KEY 形态）。 */
    private static final String TEST_KEY = "d29ya2Zsb3ctY2xpZW50LWNyeXB0by1kZXYta2V5MzI=";

    private SysClientRepository clientRepository;
    private SysClientChannelRepository channelRepository;
    private SysMenuRepository menuRepository;
    private SysRoleRepository roleRepository;
    private ClientCrypto crypto;
    private ClientServiceImpl service;

    @BeforeEach
    void setUp() {
        clientRepository = mock(SysClientRepository.class);
        channelRepository = mock(SysClientChannelRepository.class);
        menuRepository = mock(SysMenuRepository.class);
        roleRepository = mock(SysRoleRepository.class);
        crypto = new ClientCrypto(TEST_KEY);
        service = new ClientServiceImpl(clientRepository, channelRepository,
                menuRepository, roleRepository, crypto, new ObjectMapper());
        // 默认：分区根已存在（播种 no-op），非播种用例不关心菜单仓储。
        when(menuRepository.countByClientIdAndComponentAndParentIdIsNullAndIsDeleted(
                anyLong(), anyString(), anyInt())).thenReturn(1L);
    }

    // ------------------------------------------------------------ 工具

    private SysClient client(long id, String code, String name, int status) {
        SysClient c = new SysClient();
        c.setId(id);
        c.setCode(code);
        c.setName(name);
        c.setStatus(status);
        return c;
    }

    private SysClientChannel channel(long clientId, String type, int enabled, String configJson) {
        SysClientChannel ch = new SysClientChannel();
        ch.setClientId(clientId);
        ch.setChannelType(type);
        ch.setEnabled(enabled);
        ch.setConfigJson(configJson);
        return ch;
    }

    /**
     * 渠道仓储的「闭包捕获」桩（移植 node spec 的 storedConfigJson 手法）：
     * find 读的是 save 写入后的最新行，覆盖 upsert 首尾两次读取。
     */
    private Map<String, SysClientChannel> stubChannelStore() {
        Map<String, SysClientChannel> store = new HashMap<>();
        when(channelRepository.findByClientIdAndChannelType(anyLong(), anyString()))
                .thenAnswer(inv -> Optional.ofNullable(store.get((String) inv.getArgument(1))));
        when(channelRepository.save(any(SysClientChannel.class))).thenAnswer(inv -> {
            SysClientChannel ch = inv.getArgument(0);
            store.put(ch.getChannelType(), ch);
            return ch;
        });
        return store;
    }

    private ChannelUpsertRequest upsert(String type, int enabled, Map<String, Object> config) {
        return new ChannelUpsertRequest(type, enabled, config);
    }

    // ------------------------------------------------------------ create

    @Test
    void create_duplicateCode_throwsBusiness客户端编码已存在() {
        when(clientRepository.existsByCode("dup")).thenReturn(true);

        assertThatThrownBy(() -> service.create(new ClientCreateRequest("dup", "重复端", null, null, null, null)))
                .isInstanceOf(BusinessException.class)
                .hasMessage("客户端编码已存在");
        verify(clientRepository, never()).save(any());
    }

    @Test
    void create_success_returnsVoWithEmptyChannels() {
        when(clientRepository.existsByCode("app1")).thenReturn(false);
        when(clientRepository.save(any(SysClient.class))).thenAnswer(inv -> {
            SysClient c = inv.getArgument(0);
            c.setId(42L);
            return c;
        });
        when(clientRepository.findById(42L)).thenReturn(Optional.of(client(42L, "app1", "应用端", 1)));
        when(channelRepository.findByClientIdInOrderByChannelTypeAsc(List.of(42L))).thenReturn(List.of());

        ClientVO vo = service.create(new ClientCreateRequest("app1", "应用端", null, null, null, null));

        assertThat(vo.id()).isEqualTo(42L);
        assertThat(vo.code()).isEqualTo("app1");
        assertThat(vo.name()).isEqualTo("应用端");
        assertThat(vo.status()).isEqualTo(1);
        assertThat(vo.channels()).isEmpty();
    }

    // ------------------------------------------------------------ portal 保护

    @Test
    void setStatus_portal_rejected() {
        when(clientRepository.findById(1L)).thenReturn(Optional.of(client(1L, "portal", "平台端", 1)));

        assertThatThrownBy(() -> service.setStatus(1L, 0))
                .isInstanceOf(BusinessException.class)
                .hasMessage("平台端不允许停用");
        verify(clientRepository, never()).save(any());
    }

    @Test
    void update_portal_rejects_code_name_and_disable() {
        when(clientRepository.findById(1L)).thenAnswer(inv ->
                Optional.of(client(1L, "portal", "平台端", 1)));

        assertThatThrownBy(() -> service.update(1L, new ClientUpdateRequest("x", null, null, null, null, null)))
                .isInstanceOf(BusinessException.class).hasMessage("平台端不允许修改编码");
        assertThatThrownBy(() -> service.update(1L, new ClientUpdateRequest(null, "改名", null, null, null, null)))
                .isInstanceOf(BusinessException.class).hasMessage("平台端不允许修改名称");
        assertThatThrownBy(() -> service.update(1L, new ClientUpdateRequest(null, null, null, 0, null, null)))
                .isInstanceOf(BusinessException.class).hasMessage("平台端不允许停用");
    }

    @Test
    void update_codeChanged_conflictCheck() {
        when(clientRepository.findById(7L)).thenReturn(Optional.of(client(7L, "old", "旧端", 1)));
        when(clientRepository.existsByCodeAndIdNot("taken", 7L)).thenReturn(true);

        assertThatThrownBy(() -> service.update(7L, new ClientUpdateRequest("taken", null, null, null, null, null)))
                .isInstanceOf(BusinessException.class).hasMessage("客户端编码已存在");
    }

    // ------------------------------------------------------------ 默认角色归属（tasks 3.3）

    @Test
    void update_defaultRole_missing_400() {
        when(clientRepository.findById(7L)).thenReturn(Optional.of(client(7L, "app", "应用端", 1)));
        when(roleRepository.findById(5L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.update(7L, new ClientUpdateRequest(null, null, null, null, 5L, null)))
                .isInstanceOf(BusinessException.class)
                .hasMessage("默认角色不存在")
                .extracting(e -> ((BusinessException) e).getCode()).isEqualTo(400);
    }

    @Test
    void update_defaultRole_wrongClient_400() {
        when(clientRepository.findById(7L)).thenReturn(Optional.of(client(7L, "app", "应用端", 1)));
        SysRole role = new SysRole();
        role.setId(5L);
        role.setClientId(1L); // portal 角色
        when(roleRepository.findById(5L)).thenReturn(Optional.of(role));

        assertThatThrownBy(() -> service.update(7L, new ClientUpdateRequest(null, null, null, null, 5L, null)))
                .isInstanceOf(BusinessException.class)
                .hasMessage("默认角色必须属于本端")
                .extracting(e -> ((BusinessException) e).getCode()).isEqualTo(400);
    }

    // ------------------------------------------------------------ 渠道：类型与 MP 校验

    @Test
    void upsertChannel_illegalType_400() {
        assertThatThrownBy(() -> service.upsertChannel(7L, upsert("FOO", 1, Map.of())))
                .isInstanceOf(BusinessException.class)
                .hasMessage("渠道类型非法，仅支持 WEB/H5/APP/MP")
                .extracting(e -> ((BusinessException) e).getCode()).isEqualTo(400);
    }

    @Test
    void upsertChannel_MP_enabled_missingAppid_400() {
        stubChannelStore();

        assertThatThrownBy(() -> service.upsertChannel(7L, upsert("MP", 1, Map.of())))
                .isInstanceOf(BusinessException.class)
                .hasMessage("小程序渠道 appid 不能为空")
                .extracting(e -> ((BusinessException) e).getCode()).isEqualTo(400);
    }

    @Test
    void upsertChannel_MP_enabled_missingSecret_400() {
        stubChannelStore();

        assertThatThrownBy(() -> service.upsertChannel(7L, upsert("MP", 1, Map.of("appid", "wx_id"))))
                .isInstanceOf(BusinessException.class)
                .hasMessage("小程序渠道 secret 不能为空")
                .extracting(e -> ((BusinessException) e).getCode()).isEqualTo(400);
    }

    // ------------------------------------------------------------ 渠道：secret 三态边界

    @Test
    void upsertChannel_secretPlaintext_encryptedAtRest_maskedOnRead() throws Exception {
        Map<String, SysClientChannel> store = stubChannelStore();

        Map<String, Object> config = new LinkedHashMap<>();
        config.put("appid", "wx_id");
        config.put("secret", "plain_secret_123");
        ClientChannelVO vo = service.upsertChannel(7L, upsert("MP", 1, config));

        assertThat(vo.channelType()).isEqualTo("MP");
        assertThat(vo.config()).contains(entry("secret", "******"));
        // 落库的是密文：既不含明文，appid 明文保留
        String stored = store.get("MP").getConfigJson();
        assertThat(stored).doesNotContain("plain_secret_123");
        assertThat(stored).contains("wx_id");
        // 且可解回明文（密文格式自洽）
        assertThat(crypto.decrypt(new ObjectMapper().readValue(stored, Map.class).get("secret").toString()))
                .isEqualTo("plain_secret_123");
    }

    @Test
    void upsertChannel_secretMask_keepsPreviousCiphertext() {
        String prevCipher = crypto.encrypt("old_secret");
        Map<String, SysClientChannel> store = stubChannelStore();
        store.put("MP", channel(7L, "MP", 1,
                "{\"appid\":\"wx_id\",\"secret\":\"" + prevCipher + "\"}"));

        ClientChannelVO vo = service.upsertChannel(7L, upsert("MP", 1,
                Map.of("appid", "wx_id", "secret", "******")));

        assertThat(vo.config()).contains(entry("secret", "******"));
        // 掩码回传 = 原密文保留（不是掩码字面量落库、也不是被清除）
        assertThat(store.get("MP").getConfigJson())
                .doesNotContain("******")
                .contains(prevCipher);
    }

    @Test
    void upsertChannel_secretAbsentOrEmpty_clears() {
        Map<String, SysClientChannel> store = stubChannelStore();
        store.put("MP", channel(7L, "MP", 1, "{\"secret\":\"whatever\"}"));

        service.upsertChannel(7L, upsert("MP", 0, Map.of("appid", "wx_id")));

        assertThat(store.get("MP").getConfigJson()).doesNotContain("secret");
    }

    @Test
    void upsertChannel_maskWithNoPrevious_secretDropped() {
        Map<String, SysClientChannel> store = stubChannelStore();

        ClientChannelVO vo = service.upsertChannel(7L, upsert("MP", 0, Map.of("secret", "******")));

        assertThat(vo.config()).doesNotContainKey("secret");
        assertThat(store.get("MP").getConfigJson()).doesNotContain("secret");
    }

    // ------------------------------------------------------------ 渠道：D2 分区根播种

    @Test
    void upsertChannel_mobileEnabled_seedsZoneRootsTabsThenGrid() {
        stubChannelStore();
        when(menuRepository.countByClientIdAndComponentAndParentIdIsNullAndIsDeleted(
                eq(7L), eq("mzone:tabs"), eq(0))).thenReturn(0L);
        when(menuRepository.countByClientIdAndComponentAndParentIdIsNullAndIsDeleted(
                eq(7L), eq("mzone:grid"), eq(0))).thenReturn(0L);
        when(menuRepository.save(any(SysMenu.class))).thenAnswer(inv -> inv.getArgument(0));

        service.upsertChannel(7L, upsert("H5", 1, Map.of()));

        ArgumentCaptor<SysMenu> captor = ArgumentCaptor.forClass(SysMenu.class);
        verify(menuRepository, org.mockito.Mockito.times(2)).save(captor.capture());
        SysMenu tabs = captor.getAllValues().get(0);
        assertThat(tabs.getComponent()).isEqualTo("mzone:tabs");
        assertThat(tabs.getMenuName()).isEqualTo("底部 Tab 区");
        assertThat(tabs.getParentId()).isNull();
        assertThat(tabs.getMenuType()).isEqualTo(0);
        assertThat(tabs.getClientId()).isEqualTo(7L);
        SysMenu grid = captor.getAllValues().get(1);
        assertThat(grid.getComponent()).isEqualTo("mzone:grid");
        assertThat(grid.getMenuName()).isEqualTo("工作台宫格区");
    }

    @Test
    void upsertChannel_zoneRootsAlreadyExist_noDuplicateSeed() {
        stubChannelStore();

        service.upsertChannel(7L, upsert("APP", 1, Map.of()));

        verify(menuRepository, never()).save(any());
    }

    @Test
    void upsertChannel_webEnabled_orDisabled_noSeed() {
        stubChannelStore();

        service.upsertChannel(7L, upsert("WEB", 1, Map.of()));
        service.upsertChannel(7L, upsert("H5", 0, Map.of()));

        verify(menuRepository, never()).countByClientIdAndComponentAndParentIdIsNullAndIsDeleted(
                anyLong(), anyString(), anyInt());
        verify(menuRepository, never()).save(any());
    }

    // ------------------------------------------------------------ testChannel

    @Test
    void testChannel_missingOrDisabled_notOpened() {
        when(channelRepository.findByClientIdAndChannelType(7L, "WEB")).thenReturn(Optional.empty());
        ChannelTestVO missing = service.testChannel(7L, "WEB");
        assertThat(missing.ok()).isFalse();
        assertThat(missing.msg()).isEqualTo("渠道未开通");

        when(channelRepository.findByClientIdAndChannelType(7L, "WEB"))
                .thenReturn(Optional.of(channel(7L, "WEB", 0, "{}")));
        assertThat(service.testChannel(7L, "WEB").msg()).isEqualTo("渠道未开通");
    }

    @Test
    void testChannel_illegalType_400() {
        assertThatThrownBy(() -> service.testChannel(7L, "FOO"))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getCode()).isEqualTo(400);
    }

    @Test
    void testChannel_webAndH5_openedMeansOk() {
        when(channelRepository.findByClientIdAndChannelType(7L, "WEB"))
                .thenReturn(Optional.of(channel(7L, "WEB", 1, "{}")));
        ChannelTestVO vo = service.testChannel(7L, "WEB");
        assertThat(vo.ok()).isTrue();
        assertThat(vo.msg()).isEqualTo("连通正常");
    }

    @Test
    void testChannel_app_requiresDownloadUrlAndMinVersion() {
        when(channelRepository.findByClientIdAndChannelType(7L, "APP"))
                .thenReturn(Optional.of(channel(7L, "APP", 1, "{\"downloadUrl\":\"https://x/app.apk\"}")));
        ChannelTestVO lack = service.testChannel(7L, "APP");
        assertThat(lack.ok()).isFalse();
        assertThat(lack.msg()).isEqualTo("APP 渠道缺少 downloadUrl/minVersion");

        when(channelRepository.findByClientIdAndChannelType(7L, "APP"))
                .thenReturn(Optional.of(channel(7L, "APP", 1,
                        "{\"downloadUrl\":\"https://x/app.apk\",\"minVersion\":\"1.0.0\"}")));
        assertThat(service.testChannel(7L, "APP").ok()).isTrue();
    }

    @Test
    void testChannel_MP_decryptable_but_noExternalNet() {
        String cipher = crypto.encrypt("secret123");
        when(channelRepository.findByClientIdAndChannelType(7L, "MP"))
                .thenReturn(Optional.of(channel(7L, "MP", 1,
                        "{\"appid\":\"wx_id\",\"secret\":\"" + cipher + "\"}")));
        ChannelTestVO vo = service.testChannel(7L, "MP");
        assertThat(vo.ok()).isFalse();
        assertThat(vo.msg()).isEqualTo("无法验证小程序连通性（未接入外网）");

        // 缺 appid/secret 直接报配置缺失（密文不可解时 decrypt 抛异常 → 500 面，与 node 同形，此处钉配置校验）
        when(channelRepository.findByClientIdAndChannelType(7L, "MP"))
                .thenReturn(Optional.of(channel(7L, "MP", 1, "{}")));
        ChannelTestVO lack = service.testChannel(7L, "MP");
        assertThat(lack.ok()).isFalse();
        assertThat(lack.msg()).isEqualTo("小程序渠道缺少 appid/secret");
    }

    // ------------------------------------------------------------ 读出口防泄

    @Test
    void listPage_masksSecret_neverLeaksRawConfig() {
        SysClient c = client(9L, "c9", "端9", 1);
        Page<SysClient> page = new PageImpl<>(List.of(c));
        when(clientRepository.findAll(any(Specification.class), any(Pageable.class))).thenReturn(page);
        when(channelRepository.findByClientIdInOrderByChannelTypeAsc(List.of(9L)))
                .thenReturn(List.of(channel(9L, "MP", 1,
                        "{\"appid\":\"wx\",\"secret\":\"CIPHER_SENTINEL\"}")));

        PageResult<ClientVO> result = service.listPage(new ClientQueryRequest(null, null, 1, 20));

        ClientChannelVO ch = result.getRows().get(0).channels().get(0);
        assertThat(ch.config()).contains(entry("secret", "******"));
        assertThat(ch.config()).doesNotContainKey("CIPHER_SENTINEL");
        assertThat(result.getRows().get(0).code()).isEqualTo("c9");
    }

    @Test
    void listPage_sizeBelowOne_throws() {
        assertThatThrownBy(() -> service.listPage(new ClientQueryRequest(null, null, 1, 0)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void options_statusPassthrough_andNoConfigLeak() {
        when(clientRepository.findAllByOrderByIdAsc()).thenReturn(List.of(
                client(2L, "c2", "停用端", 0),
                client(3L, "c3", "无渠道端", 0)));
        SysClientChannel web = channel(2L, "WEB", 1, "{\"secret\":\"PLAINTEXT_SENTINEL\"}");
        SysClientChannel off = channel(2L, "APP", 0, "{}");
        when(channelRepository.findByClientIdInOrderByChannelTypeAsc(List.of(2L, 3L)))
                .thenReturn(List.of(web, off));

        List<ClientOptionVO> options = service.options();

        // status 原样透传（含停用端 0）；channelTypes 只收已开通渠道
        assertThat(options).hasSize(2);
        assertThat(options.get(0).channelTypes()).containsExactly("WEB");
        assertThat(options.get(1).channelTypes()).isEmpty();
        assertThat(options.get(0).status()).isZero();
    }

    // ------------------------------------------------------------ 客户端不存在

    @Test
    void requireClient_notFound() {
        when(clientRepository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.setStatus(99L, 1))
                .isInstanceOf(BusinessException.class)
                .hasMessage("客户端不存在: 99");
    }
}
