package com.workflow.system.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.material.MaterialPackageCodec;
import com.workflow.system.domain.entity.SysMaterial;
import com.workflow.system.domain.entity.SysMenu;
import com.workflow.system.repository.SysMaterialRepository;
import com.workflow.system.repository.SysMenuRepository;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * 远程物料服务（change: remote-materials 一期）。
 *
 * <p>物料 = 单文件 ESM bundle + manifest。bundle 存本地磁盘
 * （{@code workflow.material.storage-path}/{@code yyyy/MM/uuid.ext}），元数据与 manifest 原文落
 * sys_material。同 material_key 重新上传为版本 +1 覆盖，旧文件随即删除（不保留版本链，
 * 回滚靠重传旧包，见 design D5）。
 *
 * <p>bundle 不走通用附件通道：AttachmentService 的扩展名黑名单明确禁 .js（防任意脚本上传），
 * 物料则是有意为之的可执行资产，安全性由上传接口的 material:manage 权限保证（design D3）。
 */
@Service
public class MaterialService {

    private static final Logger log = LoggerFactory.getLogger(MaterialService.class);

    /** 物料 bundle 允许的扩展名（ESM 单文件）。 */
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of("js", "mjs");

    /** manifest 必填字段（remote-material spec：缺失即 400 拒绝）。 */
    private static final List<String> MANIFEST_REQUIRED = List.of("key", "name", "type", "sdkVersion");

    private static final DateTimeFormatter DIR_FORMAT = DateTimeFormatter.ofPattern("yyyy/MM");

    /** 物料包文件名（导出下载用），带时间戳便于多次导出区分。 */
    private static final DateTimeFormatter FILE_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss");

    /** 包清单里的人类可读导出时间。 */
    private static final DateTimeFormatter HUMAN_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final SysMaterialRepository materialRepository;
    private final SysMenuRepository menuRepository;
    private final ObjectMapper objectMapper;

    @Value("${workflow.material.storage-path:./data/materials}")
    private String storagePath;

    @Value("${workflow.material.max-size-mb:5}")
    private long maxSizeMb;

    /** 宿主 SDK 主版本：物料 manifest.sdkVersion 必须与之一致（design D7）。 */
    @Value("${workflow.material.sdk-version:1}")
    private String sdkVersion;

    public MaterialService(SysMaterialRepository materialRepository,
                           SysMenuRepository menuRepository,
                           ObjectMapper objectMapper) {
        this.materialRepository = materialRepository;
        this.menuRepository = menuRepository;
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    void initStorageDir() {
        try {
            Files.createDirectories(Paths.get(storagePath).toAbsolutePath().normalize());
            log.info("[Material] 物料存储目录就绪: {}", Paths.get(storagePath).toAbsolutePath().normalize());
        } catch (IOException e) {
            throw new IllegalStateException("物料存储目录初始化失败: " + storagePath, e);
        }
    }

    // ================= 上传注册 =================

    /**
     * 上传物料：校验 manifest → 落盘 bundle → 建记录或同 key 版本 +1 覆盖。
     *
     * <p>先整体校验再写文件，校验不通过不落盘、不建记录。
     */
    @Transactional
    public SysMaterial upload(MultipartFile bundle, MultipartFile manifestFile, String operator) {
        JsonNode manifest = validateManifest(parseManifestFile(manifestFile));
        byte[] bytes;
        try {
            bytes = bundle == null ? null : bundle.getBytes();
        } catch (IOException e) {
            throw new BusinessException("bundle 读取失败: " + e.getMessage());
        }
        return register(manifest, bytes, extensionOf(bundle == null ? null : bundle.getOriginalFilename()), operator);
    }

    /**
     * 入库一个已校验的物料：manifest → 记录 + bundle 落盘（同 key 版本 +1 覆盖）。
     *
     * <p>上传与导入共用此方法，两条入口的校验必须一致——导入绕过校验就等于往
     * 运行时加载链路里塞进一个加载不了的物料。bundleBytes/bundleExt 已脱离
     * MultipartFile，导入路径从 zip 里拿到的就是字节。
     */
    @Transactional
    public SysMaterial register(JsonNode manifest, byte[] bundleBytes, String bundleExt, String operator) {
        if (bundleBytes == null || bundleBytes.length == 0) {
            throw new BusinessException("缺少 bundle 文件");
        }
        if (!ALLOWED_EXTENSIONS.contains(bundleExt)) {
            throw new BusinessException("bundle 必须为 .js/.mjs 单文件 ESM（当前 ." + bundleExt + "）");
        }
        long maxBytes = maxSizeMb * 1024L * 1024L;
        if (bundleBytes.length > maxBytes) {
            throw new BusinessException("bundle 超过上限 " + maxSizeMb + "MB");
        }

        String key = manifest.get("key").asText().trim();
        String type = manifest.get("type").asText().trim().toUpperCase(Locale.ROOT);

        // 按 key 查（含软删行）：uk_sys_material_key 全表唯一，软删记录仍占位，
        // 若只查未删除的就会当新物料插一行 → 撞唯一键 500（删除后重新上传/导入必然踩到）
        Optional<SysMaterial> existing = materialRepository.findByMaterialKey(key);
        SysMaterial material = existing.orElseGet(SysMaterial::new);
        // 必须在改写前捕获：覆盖上传时 material 与 existing.get() 是同一对象
        String previousPath = existing.map(SysMaterial::getStoragePath).orElse(null);
        if (existing.isEmpty()) {
            material.setMaterialKey(key);
            material.setVersion(1);
        } else {
            material.setVersion(existing.get().getVersion() + 1);
            // 复用软删记录：重新上架即恢复可见，不新建行（新建会撞 key 唯一键）
            material.setIsDeleted(0);
        }
        material.setName(manifest.get("name").asText().trim());
        material.setType(type);
        material.setSdkVersion(manifest.get("sdkVersion").asText().trim());
        material.setManifestJson(manifest.toString());
        material.setStatus(1);

        StoredFile stored = storeBundle(bundleBytes, bundleExt, key);
        material.setStoredName(stored.storedName());
        material.setStoragePath(stored.relativePath());
        material.setFileSize((long) bundleBytes.length);
        material.setCreatedBy(operator);
        material.setUpdatedBy(operator);
        SysMaterial saved = materialRepository.save(material);

        // 覆盖上传：新文件已就位后删除旧文件（失败不影响可用性）
        if (previousPath != null && !previousPath.equals(stored.relativePath())) {
            deleteQuietly(previousPath);
        }
        return saved;
    }

    private JsonNode parseManifestFile(MultipartFile manifestFile) {
        if (manifestFile == null || manifestFile.isEmpty()) {
            throw new BusinessException("缺少 manifest 文件");
        }
        try {
            return parseManifest(manifestFile.getBytes());
        } catch (IOException e) {
            throw new BusinessException("manifest 读取失败：" + e.getMessage());
        }
    }

    /** manifest 文本 → JsonNode。解析不出对象是数据问题（400 一类），不是系统故障。 */
    private JsonNode parseManifest(byte[] manifestBytes) {
        JsonNode manifest;
        try {
            manifest = objectMapper.readTree(manifestBytes);
        } catch (IOException e) {
            throw new BusinessException("manifest 解析失败：" + e.getMessage());
        }
        if (manifest == null || !manifest.isObject()) {
            throw new BusinessException("manifest 必须为 JSON 对象");
        }
        return manifest;
    }

    /**
     * manifest 形状校验（必填字段、type 枚举、WIDGET 的 meta 数组）。
     * <p>返回入参便于链式书写；不合法一律 BusinessException。
     */
    private JsonNode validateManifest(JsonNode manifest) {
        for (String field : MANIFEST_REQUIRED) {
            if (!manifest.hasNonNull(field) || manifest.get(field).asText().isBlank()) {
                throw new BusinessException("manifest 缺少必填字段: " + field);
            }
        }
        String type = manifest.get("type").asText().trim().toUpperCase(Locale.ROOT);
        if (!SysMaterial.TYPE_PAGE.equals(type) && !SysMaterial.TYPE_WIDGET.equals(type)) {
            throw new BusinessException("manifest type 非法: " + type + "（允许 PAGE/WIDGET）");
        }
        if (SysMaterial.TYPE_WIDGET.equals(type)) {
            requireWidgetMeta(manifest.get("meta"));
        }
        return manifest;
    }

    /**
     * WIDGET 的 meta 必须是 {@code [{"field":..,"type":..}, ...]} 有序数组：
     * manifest_json 落 MySQL 的 JSON 列后对象键会按（长度,字节序）重排，
     * 而 meta 的声明顺序就是设计器属性面板的顺序，只能用数组承载。
     */
    private void requireWidgetMeta(JsonNode meta) {
        if (meta == null || !meta.isArray()) {
            throw new BusinessException(
                    "WIDGET 物料 manifest 的 meta 必须是数组，形如 [{\"field\":\"title\",\"type\":\"text\"}]（数组顺序即属性面板顺序）");
        }
        for (JsonNode entry : meta) {
            boolean named = entry != null && entry.isObject()
                    && entry.hasNonNull("field") && !entry.get("field").asText().isBlank()
                    && entry.hasNonNull("type") && !entry.get("type").asText().isBlank();
            if (!named) {
                throw new BusinessException("meta 每一项都必须含 field 与 type，当前为: " + entry);
            }
        }
    }

    // ================= 查询 =================

    public Page<SysMaterial> list(String keyword, String type, Pageable pageable) {
        Specification<SysMaterial> spec = (root, query, cb) -> {
            var predicates = new java.util.ArrayList<jakarta.persistence.criteria.Predicate>();
            predicates.add(cb.equal(root.get("isDeleted"), 0));
            if (StringUtils.hasText(type)) {
                predicates.add(cb.equal(root.get("type"), type.trim().toUpperCase(Locale.ROOT)));
            }
            if (StringUtils.hasText(keyword)) {
                String like = "%" + keyword.trim().toLowerCase(Locale.ROOT) + "%";
                predicates.add(cb.or(cb.like(cb.lower(root.get("name")), like),
                        cb.like(cb.lower(root.get("materialKey")), like)));
            }
            return cb.and(predicates.toArray(new jakarta.persistence.criteria.Predicate[0]));
        };
        return materialRepository.findAll(spec, pageable);
    }

    public SysMaterial requireById(Long id) {
        return materialRepository.findById(id)
                .filter(m -> m.getIsDeleted() == null || m.getIsDeleted() == 0)
                .orElseThrow(() -> new BusinessException(404, "物料不存在"));
    }

    public SysMaterial requireByKey(String key) {
        return materialRepository.findByMaterialKeyAndIsDeleted(key, 0)
                .orElseThrow(() -> new BusinessException(404, "物料不存在: " + key));
    }

    /**
     * 启用的组件型物料（设计器「自定义物料」面板数据源）。
     * 停用的物料不进面板，避免新页面引用到运行时加载不到的组件。
     */
    public List<SysMaterial> listEnabledWidgets() {
        return materialRepository.findByTypeAndStatusAndIsDeletedOrderByCreatedAtDesc(
                SysMaterial.TYPE_WIDGET, 1, 0);
    }

    public List<SysMenu> referencingMenus(SysMaterial material) {
        return menuRepository.findByComponentAndIsDeleted(menuComponentOf(material.getMaterialKey()), 0);
    }

    /** 物料页面的菜单 component 约定形态（design D6）。 */
    public static String menuComponentOf(String materialKey) {
        return "material:" + materialKey;
    }

    /**
     * 覆盖已有菜单指向当前物料：菜单行本身不动（id / 名称 / 目录 / 排序 / 状态 /
     * 角色授权保留），只重写 path、component，并清空 permission——物料入口不需要
     * 页面权限串，残留旧页面的 permission 会让持有该菜单的角色继续获得旧页面读权限。
     */
    @Transactional
    public SysMenu overwriteMenuReference(Long materialId, Long menuId) {
        SysMaterial material = requireById(materialId);
        if (!SysMaterial.TYPE_PAGE.equals(material.getType())) {
            throw new BusinessException(400, "仅页面型物料可挂接菜单");
        }
        SysMenu menu = menuRepository.findById(menuId)
                .orElseThrow(() -> new BusinessException(404, "菜单不存在或已删除"));
        if (menu.getIsDeleted() != null && menu.getIsDeleted() == 1) {
            throw new BusinessException(404, "菜单不存在或已删除");
        }
        if (menu.getMenuType() == null || menu.getMenuType() != 1) {
            throw new BusinessException(400, "仅支持覆盖菜单类型的入口");
        }
        String path = "/material/" + material.getMaterialKey();
        if (path.equals(menu.getPath())) {
            throw new BusinessException(400, "该菜单已指向当前物料");
        }
        menu.setPath(path);
        menu.setComponent(menuComponentOf(material.getMaterialKey()));
        menu.setPermission(null);
        return menuRepository.save(menu);
    }

    // ================= 启停 / 删除 =================

    @Transactional
    public SysMaterial setStatus(Long id, Integer status) {
        SysMaterial material = requireById(id);
        material.setStatus(status);
        return materialRepository.save(material);
    }

    /**
     * 删除物料。被菜单引用且未确认（force=false）时抛 409 并列出引用菜单，
     * 由前端提示用户确认后强制删除（软删记录，bundle 文件保留供审计）。
     */
    @Transactional
    public void delete(Long id, boolean force) {
        SysMaterial material = requireById(id);
        List<SysMenu> refs = referencingMenus(material);
        if (!refs.isEmpty() && !force) {
            String names = refs.stream()
                    .map(m -> m.getMenuName() + "(" + m.getPath() + ")")
                    .reduce((a, b) -> a + "、" + b)
                    .orElse("");
            throw new BusinessException(409, "物料被菜单引用: " + names);
        }
        material.setIsDeleted(1);
        materialRepository.save(material);
    }

    // ================= 导出 / 预检 / 导入（三期 6.1/6.2） =================

    /** 导出结果：下载用的文件名与 zip 字节。 */
    public record ExportResult(String fileName, byte[] zipBytes) {
    }

    /**
     * 预检的单条判定。importable=false 时 reason 说明为什么导不了（形状不合法、
     * SDK 主版本不符、包内条目名与 manifest.key 不一致）；conflict 只说明目标系统
     * 是否已有同 key 物料，由用户决定覆盖还是跳过。
     */
    public record InspectItem(String key, String name, String type, String sdkVersion, Integer version,
                             boolean conflict, Integer existingVersion, boolean importable, String reason) {
    }

    public record InspectResult(String exportedAt, String hostSdkVersion, List<InspectItem> items) {
    }

    /** 导入动作：strategy ∈ OVERWRITE / SKIP；未给出的冲突条目按 SKIP 处理。 */
    public record ImportAction(String key, String strategy) {
    }

    /** 单条导入结果：status = IMPORTED / OVERWRITTEN / SKIPPED / FAILED。 */
    public record ImportItemResult(String key, String name, String status, Integer version, String message) {
    }

    public record ImportResult(List<ImportItemResult> results, List<String> messages) {
    }

    private static final String STRATEGY_OVERWRITE = "OVERWRITE";
    private static final String STRATEGY_SKIP = "SKIP";

    /** 按 id 导出物料包。bundle 文件缺失直接失败——导出一个加载不了的物料没有意义。 */
    public ExportResult exportPackage(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            throw new BusinessException("请至少选择一个物料");
        }
        List<MaterialPackageCodec.BundleMaterial> items = new ArrayList<>();
        Map<String, MaterialPackageCodec.MaterialPayload> payloads = new LinkedHashMap<>();
        for (Long id : ids) {
            SysMaterial material = requireById(id);
            byte[] bundleBytes = readStoredBundleBytes(material);
            String key = material.getMaterialKey();
            items.add(new MaterialPackageCodec.BundleMaterial(key, material.getName(), material.getType(),
                    material.getSdkVersion(), material.getVersion(),
                    MaterialPackageCodec.manifestEntryOf(key), MaterialPackageCodec.bundleEntryOf(key)));
            payloads.put(key, new MaterialPackageCodec.MaterialPayload(material.getManifestJson(), bundleBytes));
        }
        MaterialPackageCodec.MaterialBundle bundle = new MaterialPackageCodec.MaterialBundle(
                MaterialPackageCodec.BUNDLE_KIND, MaterialPackageCodec.SCHEMA_VERSION,
                LocalDateTime.now().format(HUMAN_FORMAT), items);
        try {
            byte[] zip = MaterialPackageCodec.write(bundle, payloads, objectMapper);
            return new ExportResult("materials-" + LocalDateTime.now().format(FILE_FORMAT) + ".zip", zip);
        } catch (IOException e) {
            throw new BusinessException("物料打包失败: " + e.getMessage());
        }
    }

    /** 导入预检：逐条判定冲突/可导性，不落库、不落盘。 */
    public InspectResult inspectPackage(byte[] zipBytes) {
        MaterialPackageCodec.Package pkg = readPackage(zipBytes);
        List<InspectItem> items = new ArrayList<>();
        for (MaterialPackageCodec.BundleMaterial one : pkg.bundle().materials()) {
            MaterialPackageCodec.MaterialPayload payload = pkg.payloads().get(one.key());
            String name = one.name();
            String type = one.type();
            String sdk = one.sdkVersion();
            Integer version = one.version();
            boolean importable = true;
            String reason = null;
            JsonNode manifest = null;
            try {
                manifest = validateManifest(parseManifest(payload.manifestJson().getBytes(StandardCharsets.UTF_8)));
                name = manifest.get("name").asText();
                type = manifest.get("type").asText().toUpperCase(Locale.ROOT);
                sdk = manifest.get("sdkVersion").asText();
            } catch (BusinessException e) {
                importable = false;
                reason = e.getMessage();
            }
            if (importable && manifest != null && !one.key().equals(manifest.get("key").asText().trim())) {
                importable = false;
                reason = "包内条目名 " + one.key() + " 与 manifest.key "
                        + manifest.get("key").asText().trim() + " 不一致";
            }
            if (importable && !sameSdkMajor(sdk)) {
                importable = false;
                reason = "SDK 主版本不符（物料 " + sdk + "，宿主 " + sdkVersion + "），导入后运行时无法加载";
            }
            Optional<SysMaterial> existing = importable
                    ? materialRepository.findByMaterialKeyAndIsDeleted(one.key(), 0)
                    : Optional.empty();
            items.add(new InspectItem(one.key(), name, type, sdk, version, existing.isPresent(),
                    existing.map(SysMaterial::getVersion).orElse(null), importable, reason));
        }
        return new InspectResult(pkg.bundle().exportedAt(), sdkVersion, items);
    }

    /**
     * 执行导入：逐条独立判定，校验类失败只标记该条 FAILED，其余条目照常入库；
     * 系统级异常（JPA/存储）直接抛出，整批事务回滚，避免"报告说成功了一半、实际半信半疑"。
     */
    @Transactional
    public ImportResult importPackage(byte[] zipBytes, List<ImportAction> actions, String operator) {
        Map<String, String> strategies = new LinkedHashMap<>();
        if (actions != null) {
            for (ImportAction action : actions) {
                String strategy = action.strategy() == null ? STRATEGY_OVERWRITE
                        : action.strategy().trim().toUpperCase(Locale.ROOT);
                if (!STRATEGY_OVERWRITE.equals(strategy) && !STRATEGY_SKIP.equals(strategy)) {
                    throw new BusinessException("未知导入策略: " + strategy + "（仅支持 OVERWRITE/SKIP）");
                }
                strategies.put(action.key(), strategy);
            }
        }

        MaterialPackageCodec.Package pkg = readPackage(zipBytes);
        List<ImportItemResult> results = new ArrayList<>();
        for (MaterialPackageCodec.BundleMaterial one : pkg.bundle().materials()) {
            String key = one.key();
            MaterialPackageCodec.MaterialPayload payload = pkg.payloads().get(key);
            boolean overwrite = STRATEGY_OVERWRITE.equals(strategies.get(key));
            try {
                JsonNode manifest = validateManifest(
                        parseManifest(payload.manifestJson().getBytes(StandardCharsets.UTF_8)));
                if (!key.equals(manifest.get("key").asText().trim())) {
                    throw new BusinessException("包内条目名 " + key + " 与 manifest.key "
                            + manifest.get("key").asText().trim() + " 不一致，已拒绝");
                }
                if (!sameSdkMajor(manifest.get("sdkVersion").asText())) {
                    throw new BusinessException("SDK 主版本不符（物料 " + manifest.get("sdkVersion").asText()
                            + "，宿主 " + sdkVersion + "），已拒绝");
                }
                Optional<SysMaterial> existing = materialRepository.findByMaterialKeyAndIsDeleted(key, 0);
                if (existing.isPresent() && !overwrite) {
                    results.add(new ImportItemResult(key, existing.get().getName(), "SKIPPED",
                            existing.get().getVersion(), "同 key 物料已存在（版本 " + existing.get().getVersion()
                            + "），按选择跳过"));
                    continue;
                }
                SysMaterial saved = register(manifest, payload.bundleBytes(), "js", operator);
                results.add(new ImportItemResult(key, saved.getName(),
                        existing.isPresent() ? "OVERWRITTEN" : "IMPORTED", saved.getVersion(),
                        existing.isPresent() ? "已覆盖，版本 +1" : "导入成功"));
            } catch (BusinessException e) {
                log.warn("[Material] 导入条目失败 key={}: {}", key, e.getMessage());
                results.add(new ImportItemResult(key, one.name(), "FAILED", null, e.getMessage()));
            }
        }
        List<String> messages = new ArrayList<>();
        messages.add("导入的物料默认启用；页面型需自行挂菜单（component=material:<key>），"
                + "组件型在设计器「自定义物料」分组即时可见。");
        return new ImportResult(results, messages);
    }

    /** 解包：格式问题统一转成 400，让控制器不必处理 IOException。 */
    private MaterialPackageCodec.Package readPackage(byte[] zipBytes) {
        try {
            return MaterialPackageCodec.read(zipBytes, objectMapper);
        } catch (IOException e) {
            throw new BusinessException(400, "物料包不可用: " + e.getMessage());
        }
    }

    private byte[] readStoredBundleBytes(SysMaterial material) {
        Path file = resolveStoredFile(material);
        if (!Files.exists(file)) {
            throw new BusinessException(404, "物料 bundle 文件缺失: " + material.getMaterialKey());
        }
        try {
            return Files.readAllBytes(file);
        } catch (IOException e) {
            throw new BusinessException("物料 bundle 读取失败: " + material.getMaterialKey() + " " + e.getMessage());
        }
    }

    /** sdkVersion 主版本比较（design D7）：宿主与物料主版本必须相等，否则运行时必然加载失败。 */
    private boolean sameSdkMajor(String materialSdkVersion) {
        String mine = majorOf(sdkVersion);
        String theirs = majorOf(materialSdkVersion);
        return mine != null && mine.equals(theirs);
    }

    private static String majorOf(String version) {
        if (version == null) {
            return null;
        }
        String trimmed = version.trim();
        int dot = trimmed.indexOf('.');
        String head = dot < 0 ? trimmed : trimmed.substring(0, dot);
        return head.isBlank() ? null : head;
    }

    // ================= bundle 读取 =================

    /**
     * 运行时加载用的 bundle 文件。key 不存在或已停用一律 404（停用即不可加载，
     * 与前端加载器的停用判断形成双重保障）。
     */
    public Resource loadBundle(String key) {
        SysMaterial material = materialRepository.findByMaterialKeyAndIsDeleted(key, 0)
                .orElseThrow(() -> new BusinessException(404, "物料不存在: " + key));
        if (material.getStatus() == null || material.getStatus() != 1) {
            throw new BusinessException(404, "物料已停用，不可用: " + key);
        }
        Path file = resolveStoredFile(material);
        Resource resource = new FileSystemResource(file);
        if (!resource.exists()) {
            throw new BusinessException(404, "物料 bundle 文件缺失: " + key);
        }
        return resource;
    }

    public String currentSdkVersion() {
        return sdkVersion;
    }

    // ================= 存储 =================

    private record StoredFile(String storedName, String relativePath) {
    }

    private StoredFile storeBundle(byte[] bundleBytes, String ext, String key) {
        // 存储名服务端生成（uuid.ext），物料 key 不参与文件名，杜绝路径穿越
        String storedName = UUID.randomUUID().toString().replace("-", "") + "." + ext;
        String relative = LocalDate.now().format(DIR_FORMAT) + "/" + storedName;
        Path target = Paths.get(storagePath).toAbsolutePath().normalize().resolve(relative);
        try {
            Files.createDirectories(target.getParent());
            Files.write(target, bundleBytes);
        } catch (IOException e) {
            throw new BusinessException("bundle 落盘失败: " + e.getMessage());
        }
        log.info("[Material] bundle 已存储 key={} path={} size={}", key, relative, bundleBytes.length);
        return new StoredFile(storedName, relative);
    }

    private Path resolveStoredFile(SysMaterial material) {
        Path root = Paths.get(storagePath).toAbsolutePath().normalize();
        Path file = root.resolve(material.getStoragePath()).normalize();
        if (!file.startsWith(root)) {
            throw new BusinessException(404, "物料 bundle 路径非法: " + material.getMaterialKey());
        }
        return file;
    }

    private void deleteQuietly(String relativePath) {
        try {
            Files.deleteIfExists(Paths.get(storagePath).toAbsolutePath().normalize().resolve(relativePath));
        } catch (IOException e) {
            log.warn("[Material] 旧 bundle 删除失败（不影响可用性）: {}", relativePath);
        }
    }

    private static String extensionOf(String filename) {
        if (filename == null) {
            return "";
        }
        int dot = filename.lastIndexOf('.');
        return dot < 0 ? "" : filename.substring(dot + 1).toLowerCase(Locale.ROOT);
    }
}
