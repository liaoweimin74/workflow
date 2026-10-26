package com.workflow.system.service.impl;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
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
import com.workflow.system.service.ClientService;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 客户端业务服务（J2，移植 backend-node client.service.ts，语义逐条对齐）。
 *
 * <p>异常码约定（对齐 node ValidationError/BusinessException 双通道）：
 * <ul>
 *   <li>ValidationError（HTTP 200 + body code 400）≙ {@code new BusinessException(400, msg)}；</li>
 *   <li>BusinessException（body code 500）≙ {@code new BusinessException(msg)}。</li>
 * </ul>
 *
 * <p>secret 边界：加解密只发生在本类（{@link ClientCrypto}）；repository 原样存取 config_json；
 * 任何读出口的 config.secret 一律掩码，config_json 原文绝不出 API。
 */
@Service
public class ClientServiceImpl implements ClientService {

    /** 合法渠道类型（顺序即非法类型提示文案的顺序，对齐 node CHANNEL_TYPES.join('/')）。 */
    private static final List<String> CHANNEL_TYPES = List.of("WEB", "H5", "APP", "MP");

    /** secret 读出口固定掩码。 */
    private static final String SECRET_MASK = "******";

    private static final Integer ENABLED = 1;
    private static final Integer DISABLED = 0;

    /** TAB/GRID 分区根（component 约定与前端 menu-shape 的 zone 识别一致；名称同 locked 提示文案）。 */
    private record ZoneSeed(String component, String name, int sortOrder) {
    }

    private static final List<ZoneSeed> MOBILE_ZONE_SEEDS = List.of(
            new ZoneSeed("mzone:tabs", "底部 Tab 区", 1),
            new ZoneSeed("mzone:grid", "工作台宫格区", 2));

    private final SysClientRepository clientRepository;
    private final SysClientChannelRepository channelRepository;
    private final SysMenuRepository menuRepository;
    private final SysRoleRepository roleRepository;
    private final ClientCrypto crypto;
    private final ObjectMapper objectMapper;

    public ClientServiceImpl(SysClientRepository clientRepository,
                             SysClientChannelRepository channelRepository,
                             SysMenuRepository menuRepository,
                             SysRoleRepository roleRepository,
                             ClientCrypto crypto,
                             ObjectMapper objectMapper) {
        this.clientRepository = clientRepository;
        this.channelRepository = channelRepository;
        this.menuRepository = menuRepository;
        this.roleRepository = roleRepository;
        this.crypto = crypto;
        this.objectMapper = objectMapper;
    }

    // ------------------------------------------------------------ 读

    @Override
    public PageResult<ClientVO> listPage(ClientQueryRequest query) {
        int page = query.page() != null ? Math.max(query.page(), 1) : 1;
        int size = query.size() != null ? query.size() : 20; // size<1 → PageRequest IAE（对齐 node assertPageSize）
        PageRequest pageRequest = PageRequest.of(page - 1, size, Sort.by(Sort.Direction.ASC, "id"));
        Page<SysClient> result = clientRepository.findAll(buildListSpec(query), pageRequest);

        List<Long> ids = result.getContent().stream().map(SysClient::getId).toList();
        if (ids.isEmpty()) {
            return new PageResult<>(result.getTotalElements(), page, size, List.of());
        }
        Map<Long, List<SysClientChannel>> byClient = groupChannels(
                channelRepository.findByClientIdInOrderByChannelTypeAsc(ids));
        List<ClientVO> rows = result.getContent().stream()
                .map(row -> toClientVO(row, byClient.getOrDefault(row.getId(), List.of())))
                .toList();
        return new PageResult<>(result.getTotalElements(), page, size, rows);
    }

    private Specification<SysClient> buildListSpec(ClientQueryRequest query) {
        final String keyword = query.keyword() != null && !query.keyword().isEmpty() ? query.keyword() : null;
        final Integer status = query.status();
        return (root, criteriaQuery, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            ps.add(cb.equal(root.get("isDeleted"), 0));
            if (keyword != null) {
                String like = "%" + keyword + "%";
                ps.add(cb.or(cb.like(root.get("name"), like), cb.like(root.get("code"), like)));
            }
            if (status != null) {
                ps.add(cb.equal(root.get("status"), status));
            }
            return cb.and(ps.toArray(new Predicate[0]));
        };
    }

    @Override
    public List<ClientOptionVO> options() {
        List<SysClient> clients = clientRepository.findAllByOrderByIdAsc();
        if (clients.isEmpty()) {
            return List.of();
        }
        List<Long> ids = clients.stream().map(SysClient::getId).toList();
        // status 原样透传（含停用端 0）；channelTypes 只收已开通渠道。
        // ⚠️ 不带上任何 config 字段——options 是下拉，绝不能泄 config_json。
        Map<Long, List<String>> typesByClient = new LinkedHashMap<>();
        for (SysClientChannel ch : channelRepository.findByClientIdInOrderByChannelTypeAsc(ids)) {
            if (ENABLED.equals(ch.getEnabled())) {
                typesByClient.computeIfAbsent(ch.getClientId(), k -> new ArrayList<>()).add(ch.getChannelType());
            }
        }
        return clients.stream()
                .map(c -> new ClientOptionVO(c.getId(), c.getCode(), c.getName(), c.getStatus(),
                        typesByClient.getOrDefault(c.getId(), List.of())))
                .toList();
    }

    private ClientVO loadClientVO(Long id) {
        SysClient row = requireClient(id);
        List<SysClientChannel> channels = channelRepository.findByClientIdInOrderByChannelTypeAsc(List.of(id));
        return toClientVO(row, channels);
    }

    // ------------------------------------------------------------ 客户端写

    @Override
    @Transactional
    public ClientVO create(ClientCreateRequest dto) {
        if (clientRepository.existsByCode(dto.code())) {
            throw new BusinessException("客户端编码已存在");
        }
        SysClient client = new SysClient();
        client.setCode(dto.code());
        client.setName(dto.name());
        client.setIcon(dto.icon());
        client.setStatus(dto.status() != null ? dto.status() : 1);
        client.setDefaultRoleId(dto.defaultRoleId());
        client.setDefaultMemberGroupId(dto.defaultMemberGroupId());
        SysClient saved = clientRepository.save(client);
        return loadClientVO(saved.getId());
    }

    @Override
    @Transactional
    public ClientVO update(Long id, ClientUpdateRequest dto) {
        SysClient row = requireClient(id);
        boolean changed = false;

        if (dto.code() != null && !dto.code().equals(row.getCode())) {
            // portal 保护：平台端不允许改码（改码会连带影响端上下文识别）。
            if (isPortal(id)) {
                throw new BusinessException("平台端不允许修改编码");
            }
            if (clientRepository.existsByCodeAndIdNot(dto.code(), id)) {
                throw new BusinessException("客户端编码已存在");
            }
            row.setCode(dto.code());
            changed = true;
        }
        if (dto.name() != null && !dto.name().equals(row.getName())) {
            // portal 保护：平台端不允许改名。
            if (isPortal(id)) {
                throw new BusinessException("平台端不允许修改名称");
            }
            row.setName(dto.name());
            changed = true;
        }
        // icon：与 node「?? null 即清除」对齐——A1 表单全量提交，null 视为清除（见 DTO javadoc）
        if (!Objects.equals(row.getIcon(), dto.icon())) {
            row.setIcon(dto.icon());
            changed = true;
        }
        // status 列为 NOT NULL：只有传数字才改（传 null 视为不改），杜绝把状态写空。
        if (dto.status() != null && !dto.status().equals(row.getStatus())) {
            // portal 保护也覆盖经 update 携带的停用（与 setStatus 同口径）。
            if (isPortal(id) && DISABLED.equals(dto.status())) {
                throw new BusinessException("平台端不允许停用");
            }
            row.setStatus(dto.status());
            changed = true;
        }
        if (dto.defaultRoleId() != null) {
            // tasks 3.3：注册默认角色仅可引用本端角色（服务端校验；下拉按端过滤在 /api/roles?clientId=）。
            assertDefaultRoleOnClient(id, dto.defaultRoleId());
            row.setDefaultRoleId(dto.defaultRoleId());
            changed = true;
        }
        if (dto.defaultMemberGroupId() != null) {
            row.setDefaultMemberGroupId(dto.defaultMemberGroupId());
            changed = true;
        }

        if (changed) {
            clientRepository.save(row);
        }
        return loadClientVO(id);
    }

    @Override
    @Transactional
    public void setStatus(Long id, Integer status) {
        SysClient row = requireClient(id);
        // portal 保护：平台端不允许停用（停用等于关掉整个管理入口）。
        if (isPortal(id) && DISABLED.equals(status)) {
            throw new BusinessException("平台端不允许停用");
        }
        row.setStatus(status);
        clientRepository.save(row);
    }

    /**
     * 默认角色归属校验（tasks 3.3）：角色必须属于该客户端。
     * 400 码（node ValidationError 的等价形态：HTTP 200 + body code 400）。
     */
    private void assertDefaultRoleOnClient(Long clientId, Long roleId) {
        SysRole role = roleRepository.findById(roleId).orElse(null);
        if (role == null) {
            throw new BusinessException(400, "默认角色不存在");
        }
        if (!clientId.equals(role.getClientId())) {
            throw new BusinessException(400, "默认角色必须属于本端");
        }
    }

    // ------------------------------------------------------------ 渠道

    @Override
    @Transactional
    public ClientChannelVO upsertChannel(Long clientId, ChannelUpsertRequest dto) {
        String channelType = dto.channelType();
        assertChannelType(channelType);
        Integer enabled = dto.enabled();

        Map<String, Object> config = new LinkedHashMap<>();
        if (dto.config() != null) {
            config.putAll(dto.config());
        }

        SysClientChannel existing = channelRepository.findByClientIdAndChannelType(clientId, channelType).orElse(null);

        // secret 边界：掩码回传=保留原密文；有明文=加密；空=清除。
        Object raw = config.get("secret");
        if (raw == null || (raw instanceof String s && s.isEmpty())) {
            config.remove("secret");
        } else if (SECRET_MASK.equals(raw)) {
            Object prev = existing == null ? null : parseConfig(existing.getConfigJson()).get("secret");
            if (prev instanceof String ps && !ps.isEmpty()) {
                config.put("secret", ps); // 已是密文，原样保留
            } else {
                config.remove("secret");
            }
        } else {
            config.put("secret", crypto.encrypt(String.valueOf(raw)));
        }

        // MP 开通必填 appid/secret（校验放在 secret 解析之后：掩码保留也算有值）。
        if ("MP".equals(channelType) && ENABLED.equals(enabled)) {
            if (!(config.get("appid") instanceof String appid) || appid.trim().isEmpty()) {
                throw new BusinessException(400, "小程序渠道 appid 不能为空");
            }
            if (!(config.get("secret") instanceof String secret) || secret.isEmpty()) {
                throw new BusinessException(400, "小程序渠道 secret 不能为空");
            }
        }

        SysClientChannel entity = existing != null ? existing : new SysClientChannel();
        entity.setClientId(clientId);
        entity.setChannelType(channelType);
        entity.setEnabled(enabled);
        entity.setConfigJson(writeJson(config));
        channelRepository.save(entity);

        // 开通移动渠道 = 该端采用移动形态：幂等播种两个锁定分区根（4.4 零代码链——
        // 「新建端→配渠道→配端菜单」必须全程可配置，分区根若无生成路径则端建树死锁。
        // WEB-only 端不播种；重复开通/停用再开通都不产生第二组）。
        if (ENABLED.equals(enabled) && !"WEB".equals(channelType)) {
            seedMobileZoneRoots(clientId);
        }

        SysClientChannel stored = channelRepository.findByClientIdAndChannelType(clientId, channelType).orElse(null);
        if (stored == null) {
            throw new BusinessException("渠道写入失败");
        }
        return toChannelVO(stored);
    }

    private void seedMobileZoneRoots(Long clientId) {
        for (ZoneSeed seed : MOBILE_ZONE_SEEDS) {
            if (menuRepository.countByClientIdAndComponentAndParentIdIsNullAndIsDeleted(clientId, seed.component(), 0) == 0) {
                SysMenu root = new SysMenu();
                root.setClientId(clientId);
                root.setParentId(null);
                root.setMenuName(seed.name());
                root.setMenuType(0);
                root.setComponent(seed.component());
                root.setSortOrder(seed.sortOrder());
                root.setStatus(1);
                root.setIsDeleted(0);
                menuRepository.save(root);
            }
        }
    }

    @Override
    public ChannelTestVO testChannel(Long clientId, String channelType) {
        assertChannelType(channelType);
        SysClientChannel channel = channelRepository.findByClientIdAndChannelType(clientId, channelType).orElse(null);
        if (channel == null || !ENABLED.equals(channel.getEnabled())) {
            return new ChannelTestVO(false, "渠道未开通");
        }

        Map<String, Object> config = parseConfig(channel.getConfigJson());
        return switch (channelType) {
            // WEB/H5 无外部依赖：已开通即视为连通。
            case "WEB", "H5" -> new ChannelTestVO(true, "连通正常");
            case "APP" -> {
                Object downloadUrl = config.get("downloadUrl");
                Object minVersion = config.get("minVersion");
                if (!(downloadUrl instanceof String url) || url.trim().isEmpty()
                        || minVersion == null || String.valueOf(minVersion).isEmpty()) {
                    yield new ChannelTestVO(false, "APP 渠道缺少 downloadUrl/minVersion");
                }
                yield new ChannelTestVO(true, "连通正常");
            }
            case "MP" -> {
                Object appid = config.get("appid");
                Object rawSecret = config.get("secret");
                String secret = rawSecret instanceof String ? crypto.decrypt((String) rawSecret) : null;
                if (!(appid instanceof String id) || id.trim().isEmpty()
                        || secret == null || secret.trim().isEmpty()) {
                    yield new ChannelTestVO(false, "小程序渠道缺少 appid/secret");
                }
                // ⚠️ 无外网环境不真正调用微信 API（简报允许）：解密可达性通过后，
                //    返回不可达而非发起阻塞请求。真实连通探测在具备出网条件时接入。
                yield new ChannelTestVO(false, "无法验证小程序连通性（未接入外网）");
            }
            default -> new ChannelTestVO(false, "未知渠道类型");
        };
    }

    // ------------------------------------------------------------ 内部

    /** channelType ∈ 集合，否则 400（HTTP 200 + body code 400）。 */
    private void assertChannelType(String channelType) {
        if (!CHANNEL_TYPES.contains(channelType)) {
            throw new BusinessException(400, "渠道类型非法，仅支持 " + String.join("/", CHANNEL_TYPES));
        }
    }

    private boolean isPortal(Long id) {
        return id != null && id == SysClient.PORTAL_CLIENT_ID;
    }

    private SysClient requireClient(Long id) {
        SysClient row = clientRepository.findById(id).orElse(null);
        if (row == null) {
            throw new BusinessException("客户端不存在: " + id);
        }
        return row;
    }

    private Map<Long, List<SysClientChannel>> groupChannels(List<SysClientChannel> channels) {
        Map<Long, List<SysClientChannel>> byClient = new LinkedHashMap<>();
        for (SysClientChannel ch : channels) {
            byClient.computeIfAbsent(ch.getClientId(), k -> new ArrayList<>()).add(ch);
        }
        return byClient;
    }

    private Map<String, Object> parseConfig(String json) {
        if (json == null || json.isEmpty()) {
            return new LinkedHashMap<>();
        }
        try {
            JsonNode node = objectMapper.readTree(json);
            if (node.isObject()) {
                return objectMapper.convertValue(node, new TypeReference<LinkedHashMap<String, Object>>() {
                });
            }
        } catch (JsonProcessingException | IllegalArgumentException e) {
            // config_json 非法 JSON（不该发生）——降级为空对象，读出口不崩。
        }
        return new LinkedHashMap<>();
    }

    private String writeJson(Map<String, Object> config) {
        try {
            return objectMapper.writeValueAsString(config);
        } catch (JsonProcessingException e) {
            throw new BusinessException("渠道配置序列化失败");
        }
    }

    /** 渠道行 → VO：secret 有值即掩码，无值则不带 secret 字段。config_json 原文不外泄。 */
    private ClientChannelVO toChannelVO(SysClientChannel row) {
        Map<String, Object> config = parseConfig(row.getConfigJson());
        Object secret = config.get("secret");
        if (secret instanceof String s && !s.isEmpty()) {
            config.put("secret", SECRET_MASK);
        } else {
            config.remove("secret");
        }
        return new ClientChannelVO(row.getChannelType(), row.getEnabled(), config);
    }

    private ClientVO toClientVO(SysClient row, List<SysClientChannel> channels) {
        return new ClientVO(
                row.getId(),
                row.getCode(),
                row.getName(),
                row.getIcon(),
                row.getStatus(),
                row.getDefaultRoleId(),
                row.getDefaultMemberGroupId(),
                channels.stream().map(this::toChannelVO).toList());
    }
}
