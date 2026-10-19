package com.workflow.system.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.MaterialDTO;
import com.workflow.api.dto.PageResponse;
import com.workflow.common.domain.R;
import com.workflow.common.exception.BusinessException;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.framework.security.permission.PermissionEvaluator;
import com.workflow.system.domain.entity.SysMaterial;
import com.workflow.system.domain.entity.SysMenu;
import com.workflow.system.service.MaterialScaffoldService;
import com.workflow.system.service.MaterialService;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * 远程物料接口（change: remote-materials 一期）。
 *
 * <p>管理侧（上传/启停/删除）要求 material:manage 权限（管理员角色默认持有）；
 * 列表/详情要求登录；bundle 下载为公开读（ESM import() 无法携带 Authorization 头，
 * 见 design D3——泄露面仅代码本身，数据访问仍由物料运行时的 API 调用鉴权兜底）。
 */
@RestController
@RequestMapping("/api/materials")
public class MaterialController {

    /** 物料管理权限标识（V57 菜单 material:manage）。 */
    public static final String PERMISSION_MANAGE = "material:manage";

    private final MaterialService materialService;
    private final MaterialScaffoldService materialScaffoldService;
    private final PermissionEvaluator permissionEvaluator;
    private final ObjectMapper objectMapper;

    public MaterialController(MaterialService materialService,
                              MaterialScaffoldService materialScaffoldService,
                              PermissionEvaluator permissionEvaluator,
                              ObjectMapper objectMapper) {
        this.materialService = materialService;
        this.materialScaffoldService = materialScaffoldService;
        this.permissionEvaluator = permissionEvaluator;
        this.objectMapper = objectMapper;
    }

    /** 上传物料（multipart：bundle=ESM 文件、manifest=物料清单 JSON）。 */
    @PostMapping
    public R<MaterialDTO> upload(@RequestParam("bundle") MultipartFile bundle,
                                 @RequestParam("manifest") MultipartFile manifest) {
        requireManage();
        SysMaterial saved = materialService.upload(bundle, manifest, currentUsername());
        return R.ok(MaterialDTO.of(saved));
    }

    @GetMapping
    public R<PageResponse<MaterialDTO>> list(@RequestParam(defaultValue = "1") int page,
                                             @RequestParam(defaultValue = "20") int size,
                                             @RequestParam(required = false) String keyword,
                                             @RequestParam(required = false) String type) {
        PageRequest pageable = PageRequest.of(Math.max(page, 1) - 1, size);
        Page<SysMaterial> result = materialService.list(keyword, type, pageable);
        List<MaterialDTO> dtos = result.getContent().stream().map(MaterialDTO::of).toList();
        return R.ok(new PageResponse<>(dtos, result.getNumber() + 1, result.getSize(), result.getTotalElements()));
    }

    @GetMapping("/{id}")
    public R<Map<String, Object>> detail(@PathVariable Long id) {
        return R.ok(toDetail(materialService.requireById(id)));
    }

    /** 运行时加载器入口：按 key 取 manifest 与下载地址（菜单 component=material:&lt;key&gt;）。 */
    @GetMapping("/by-key/{key}")
    public R<Map<String, Object>> detailByKey(@PathVariable String key) {
        return R.ok(toDetail(materialService.requireByKey(key)));
    }

    /**
     * 启用的组件型物料列表（二期 5.2：设计器「自定义物料」面板）。
     * 登录即可读（与列表/详情同级），载荷带 manifest.meta，属性面板据此动态渲染配置控件。
     */
    @GetMapping("/widgets")
    public R<List<Map<String, Object>>> widgets() {
        return R.ok(materialService.listEnabledWidgets().stream().map(this::toWidgetItem).toList());
    }

    @PutMapping("/{id}/status")
    public R<MaterialDTO> setStatus(@PathVariable Long id, @RequestParam Integer status) {
        requireManage();
        if (status == null || (status != 0 && status != 1)) {
            throw new BusinessException(400, "status 只能为 0（停用）或 1（启用）");
        }
        return R.ok(MaterialDTO.of(materialService.setStatus(id, status)));
    }

    /**
     * 删除物料。被菜单引用且 force 非 true 时返回 409，消息含引用菜单清单，
     * 前端确认后带 force=true 重发。
     */
    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id,
                          @RequestParam(defaultValue = "false") boolean force) {
        requireManage();
        materialService.delete(id, force);
        return R.ok();
    }

    /** bundle 公开读（SecurityConfig 对该路径 permitAll），Content-Type 必须为 ESM 可导入类型。 */
    @GetMapping(value = "/{key}/bundle", produces = "application/javascript;charset=UTF-8")
    public ResponseEntity<Resource> bundle(@PathVariable String key) {
        Resource resource = materialService.loadBundle(key);
        return ResponseEntity.ok()
                .contentType(new MediaType("application", "javascript", java.nio.charset.StandardCharsets.UTF_8))
                .body(resource);
    }

    // ================= 导出 / 预检 / 导入（三期 6.1/6.2） =================

    /** 导出请求体：物料 id 清单（管理页多选）。 */
    public record ExportReq(List<Long> ids) {
    }

    /** 导出物料包（zip 流下载）。 */
    @PostMapping("/export")
    public ResponseEntity<byte[]> export(@RequestBody ExportReq req) {
        requireManage();
        MaterialService.ExportResult result = materialService.exportPackage(
                req == null || req.ids() == null ? List.of() : req.ids());
        return ResponseEntity.ok()
                .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + result.fileName() + "\"")
                .header(org.springframework.http.HttpHeaders.ACCESS_CONTROL_EXPOSE_HEADERS,
                        org.springframework.http.HttpHeaders.CONTENT_DISPOSITION)
                .contentType(MediaType.parseMediaType("application/zip"))
                .body(result.zipBytes());
    }

    /** 导入预检：返回逐条冲突/可导性判定，不落库。 */
    @PostMapping(value = "/inspect", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public R<MaterialService.InspectResult> inspect(@RequestParam("file") MultipartFile file) throws IOException {
        requireManage();
        return R.ok(materialService.inspectPackage(bytes(file)));
    }

    /**
     * 导入执行。冲突条目的处置走 multipart 字段 {@code actions}（JSON 数组串
     * {@code [{"key":"..","strategy":"OVERWRITE|SKIP"}]}）——表单上传带不了嵌套对象，
     * 与模块导入保持同一约定。
     */
    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public R<MaterialService.ImportResult> imports(@RequestParam("file") MultipartFile file,
                                                  @RequestParam(value = "actions", required = false) String actionsJson)
            throws IOException {
        requireManage();
        return R.ok(materialService.importPackage(bytes(file), parseActions(actionsJson), currentUsername()));
    }

    /** 物料工程模板（骨架 + 示例源码 + 教程与规范），供线下开发物料的工程起点。 */
    @GetMapping("/scaffold-template")
    public ResponseEntity<byte[]> scaffoldTemplate() {
        requireManage();
        MaterialScaffoldService.Template result = materialScaffoldService.build();
        return ResponseEntity.ok()
                .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + result.fileName() + "\"")
                .header(org.springframework.http.HttpHeaders.ACCESS_CONTROL_EXPOSE_HEADERS,
                        org.springframework.http.HttpHeaders.CONTENT_DISPOSITION)
                .contentType(MediaType.parseMediaType("application/zip"))
                .body(result.zipBytes());
    }

    private static byte[] bytes(MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(400, "缺少物料包文件");
        }
        return file.getBytes();
    }

    private List<MaterialService.ImportAction> parseActions(String actionsJson) {
        List<MaterialService.ImportAction> actions = new java.util.ArrayList<>();
        if (actionsJson == null || actionsJson.isBlank()) {
            return actions;
        }
        JsonNode parsed;
        try {
            parsed = objectMapper.readTree(actionsJson);
        } catch (Exception e) {
            throw new BusinessException(400, "actions 不是合法 JSON 数组: " + e.getMessage());
        }
        if (!parsed.isArray()) {
            throw new BusinessException(400, "actions 必须是 JSON 数组");
        }
        for (JsonNode one : parsed) {
            if (one == null || !one.isObject() || !one.hasNonNull("key")) {
                throw new BusinessException(400, "actions 每一项必须含 key 字段: " + one);
            }
            actions.add(new MaterialService.ImportAction(one.get("key").asText().trim(),
                    one.hasNonNull("strategy") ? one.get("strategy").asText() : null));
        }
        return actions;
    }

    /** 宿主 SDK 主版本随详情返回，前端加载前做兼容性判断（design D7）。 */
    private Map<String, Object> toDetail(SysMaterial material) {
        JsonNode manifest;
        try {
            manifest = objectMapper.readTree(material.getManifestJson());
        } catch (Exception e) {
            throw new BusinessException("manifest 读取失败: " + e.getMessage());
        }
        List<SysMenu> menus = materialService.referencingMenus(material);
        // LinkedHashMap：菜单 path/name 可为空，Map.of 遇 null 值会抛 NPE
        Map<String, Object> detail = new java.util.LinkedHashMap<>();
        detail.put("id", material.getId());
        detail.put("materialKey", material.getMaterialKey());
        detail.put("name", material.getName());
        detail.put("type", material.getType());
        detail.put("version", material.getVersion());
        detail.put("sdkVersion", material.getSdkVersion());
        detail.put("status", material.getStatus());
        detail.put("fileSize", material.getFileSize());
        detail.put("manifest", toPlainJson(manifest));
        detail.put("downloadUrl", "/api/materials/" + material.getMaterialKey() + "/bundle");
        detail.put("hostSdkVersion", materialService.currentSdkVersion());
        detail.put("referencedMenus", menus.stream().map(m -> {
            Map<String, Object> one = new java.util.LinkedHashMap<String, Object>();
            one.put("menuId", m.getId());
            one.put("menuName", m.getMenuName());
            one.put("path", m.getPath());
            return one;
        }).toList());
        return detail;
    }

    /** 面板项载荷：标识与 manifest.meta（meta 缺失给空列表，属性面板自然为空，不阻塞面板项展示）。 */
    private Map<String, Object> toWidgetItem(SysMaterial material) {
        Map<String, Object> one = new java.util.LinkedHashMap<>();
        one.put("id", material.getId());
        one.put("materialKey", material.getMaterialKey());
        one.put("name", material.getName());
        one.put("version", material.getVersion());
        one.put("sdkVersion", material.getSdkVersion());
        one.put("meta", parseMeta(material.getManifestJson()));
        return one;
    }

    /**
     * manifest.meta → 配置项列表（每项含 field，即写入节点 rule.props 的字段名）。
     * <p>数组形态是现行协议：列表顺序就是设计器属性面板顺序。
     * 对象形态兼容协议定稿前上传的旧物料——manifest_json 是 MySQL 的 JSON 列，
     * 对象键序入库时已按（长度,字节序）重排，这部分顺序只能尽力而为。
     */
    private java.util.List<Map<String, Object>> parseMeta(String manifestJson) {
        java.util.List<Map<String, Object>> fields = new java.util.ArrayList<>();
        try {
            JsonNode meta = objectMapper.readTree(manifestJson).get("meta");
            if (meta == null) {
                return fields;
            }
            if (meta.isArray()) {
                for (JsonNode entry : meta) {
                    if (isConfigurable(entry) && entry.hasNonNull("field")) {
                        fields.add(toMetaField(entry.get("field").asText(), entry));
                    }
                }
            } else if (meta.isObject()) {
                meta.fields().forEachRemaining(e -> {
                    if (isConfigurable(e.getValue())) {
                        fields.add(toMetaField(e.getKey(), e.getValue()));
                    }
                });
            }
            return fields;
        } catch (Exception e) {
            return java.util.List.of();
        }
    }

    private boolean isConfigurable(JsonNode decl) {
        return decl != null && decl.isObject() && decl.hasNonNull("type") && !decl.get("type").asText().isBlank();
    }

    /** field 置于首位，其余键（label/type/default/options）原样转纯 Java 值 */
    private Map<String, Object> toMetaField(String name, JsonNode decl) {
        Map<String, Object> one = new java.util.LinkedHashMap<>();
        one.put("field", name);
        decl.fields().forEachRemaining(e -> {
            if (!"field".equals(e.getKey())) {
                one.put(e.getKey(), toPlainJson(e.getValue()));
            }
        });
        return one;
    }

    /**
     * Jackson 2 的 JsonNode 先转纯 Java 结构（Map/List/标量）再进响应体。
     * <p>响应由 Spring Boot 4 的 Jackson 3（tools.jackson）序列化，它不认识 com.fasterxml 的
     * JsonNode，会把节点当普通 POJO 输出成 {"array":false,"containerNode":true,…}，
     * manifest/meta 原文因此全部失真。
     */
    private Object toPlainJson(JsonNode node) {
        try {
            return node == null || node.isNull() ? Map.of() : objectMapper.convertValue(node, Object.class);
        } catch (Exception e) {
            return Map.of();
        }
    }

    private void requireManage() {
        if (!permissionEvaluator.hasPermission(PERMISSION_MANAGE)) {
            throw new BusinessException(403, "需要物料管理权限（" + PERMISSION_MANAGE + "）");
        }
    }

    private String currentUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof LoginUser loginUser) {
            return loginUser.getUsername();
        }
        return null;
    }
}
