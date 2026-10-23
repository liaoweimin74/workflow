package com.workflow.ai.aiconfig;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.ai.config.AiProperties;
import com.workflow.ai.config.SandboxAiConfigBridge;
import com.workflow.ai.exception.AiException;
import com.workflow.ai.model.ChatMessage;
import com.workflow.ai.model.ChatOptions;
import com.workflow.ai.provider.OpenAiCompatibleChatModel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

/**
 * 大模型动态配置服务：读取（含静态回退合成）、保存（单行 upsert，
 * 密钥留空即保持不变）、连通性测试（允许测试未保存的草稿配置）。
 */
@Service
public class AiConfigService {

    private static final Logger log = LoggerFactory.getLogger(AiConfigService.class);

    private final SysAiConfigRepository repo;
    private final AiProperties properties;
    private final ObjectMapper objectMapper;

    public AiConfigService(SysAiConfigRepository repo, AiProperties properties, ObjectMapper objectMapper) {
        this.repo = repo;
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    /**
     * 当前生效配置：DB 行优先；无行返回 {@code null}（由调用方回退静态默认）。
     * DB 配置与静态默认指向同一端点时，继承沙箱桥接的附加请求头
     * （X-Token 等），保证「页面未改端点只调参数」场景下内置网关仍可用。
     */
    public EffectiveLlmConfig effective() {
        SysAiConfig row = repo.findTopByIsDeletedOrderByIdDesc(0);
        if (row == null) {
            return null;
        }
        EffectiveLlmConfig staticCfg = staticSnapshot();
        boolean sameEndpoint = staticCfg.baseUrl() != null
                && staticCfg.baseUrl().equals(trimToNull(row.getBaseUrl()));
        Map<String, String> headers = sameEndpoint
                ? staticCfg.extraHeaders() : Map.of();
        return new EffectiveLlmConfig(
                row.getEnabled() == null || row.getEnabled(),
                trimToNull(row.getBaseUrl()),
                trimToNull(row.getApiKey()),
                trimToNull(row.getModel()),
                row.getTemperature() != null ? row.getTemperature() : staticCfg.temperature(),
                row.getMaxTokens() != null ? row.getMaxTokens() : staticCfg.maxTokens(),
                row.getConnectTimeoutMs() != null ? row.getConnectTimeoutMs() : staticCfg.connectTimeoutMs(),
                row.getReadTimeoutMs() != null ? row.getReadTimeoutMs() : staticCfg.readTimeoutMs(),
                headers,
                "数据库配置");
    }

    /**
     * 全平台统一的「生效配置」解析：DB 行优先；无行/读库异常回退静态快照。
     *
     * <p>调用方（助手对话、表单生成、用量记录）一律用它判定 AI 可用性并回填模型名，
     * 不再直接读静态 {@link AiProperties}——静态开关只描述「内置网关默认」，
     * 不得拦掉页面里已保存的模型配置。
     */
    public EffectiveLlmConfig resolve() {
        try {
            EffectiveLlmConfig db = effective();
            if (db != null) {
                return db;
            }
        } catch (Exception e) {
            log.warn("读取动态模型配置失败，回退静态配置: {}", e.getMessage());
        }
        return staticSnapshot();
    }

    /** GET VO：DB 行或静态默认合成；apiKey 一律脱敏。 */
    public AiConfigVO get() {
        EffectiveLlmConfig staticCfg = staticSnapshot();
        SysAiConfig row = repo.findTopByIsDeletedOrderByIdDesc(0);
        AiConfigVO vo = new AiConfigVO();
        if (row != null) {
            vo.setEnabled(row.getEnabled() == null || row.getEnabled());
            vo.setBaseUrl(trimToNull(row.getBaseUrl()));
            vo.setApiKeyMasked(mask(row.getApiKey()));
            vo.setHasApiKey(row.getApiKey() != null && !row.getApiKey().isBlank());
            vo.setModel(trimToNull(row.getModel()));
            vo.setTemperature(row.getTemperature());
            vo.setMaxTokens(row.getMaxTokens());
            vo.setConnectTimeoutMs(row.getConnectTimeoutMs());
            vo.setReadTimeoutMs(row.getReadTimeoutMs());
            vo.setSource("数据库配置");
            vo.setUpdatedAt(row.getUpdatedAt());
        } else {
            vo.setEnabled(staticCfg.enabled());
            vo.setBaseUrl(staticCfg.baseUrl());
            vo.setApiKeyMasked(mask(staticCfg.apiKey()));
            vo.setHasApiKey(staticCfg.apiKey() != null && !staticCfg.apiKey().isBlank());
            vo.setModel(staticCfg.model());
            vo.setTemperature(staticCfg.temperature());
            vo.setMaxTokens(staticCfg.maxTokens());
            vo.setConnectTimeoutMs(staticCfg.connectTimeoutMs());
            vo.setReadTimeoutMs(staticCfg.readTimeoutMs());
            vo.setSource("环境与默认配置（页面尚未保存过）");
        }
        vo.getStaticDefaults().put("baseUrl", staticCfg.baseUrl());
        vo.getStaticDefaults().put("model", staticCfg.model());
        return vo;
    }

    /** 保存（单行 upsert）；apiKey 留空=保持不变，"-"=清空。保存即生效。 */
    @Transactional
    public AiConfigVO save(AiConfigSaveRequest req) {
        SysAiConfig row = repo.findTopByIsDeletedOrderByIdDesc(0);
        boolean isNew = row == null;
        if (isNew) {
            row = new SysAiConfig();
        }
        String submitted = req.getApiKey() == null ? null : req.getApiKey().trim();
        String resolved;
        if (submitted == null || submitted.isEmpty()) {
            if (isNew) {
                // 新建行且未填密钥：继承静态默认（env/yml/沙箱桥接），避免 DB 行
                // 生效后把开箱即用的内置密钥顶掉导致调用突然失败
                resolved = staticSnapshot().apiKey();
            } else {
                resolved = row.getApiKey();                      // 留空 = 保持
            }
        } else if ("-".equals(submitted)) {
            resolved = null;                                     // 显式清空
        } else {
            resolved = submitted;
        }
        row.setEnabled(req.getEnabled() == null || req.getEnabled());
        row.setBaseUrl(req.getBaseUrl().trim());
        row.setApiKey(resolved);
        row.setModel(req.getModel().trim());
        row.setTemperature(req.getTemperature());
        row.setMaxTokens(req.getMaxTokens());
        row.setConnectTimeoutMs(req.getConnectTimeoutMs() == null ? 5000 : req.getConnectTimeoutMs());
        row.setReadTimeoutMs(req.getReadTimeoutMs() == null ? 120000 : req.getReadTimeoutMs());
        String user = currentUser();
        row.setUpdatedBy(user);
        if (isNew) {
            row.setCreatedBy(user);
        }
        repo.save(row);
        log.info("大模型配置已更新 by {}: model={}, baseUrl={}", user, row.getModel(), row.getBaseUrl());
        return get();
    }

    /**
     * 连通性测试：请求字段覆盖当前生效配置（DB 优先回退静态），不落库。
     * 发送极小 completion（maxTokens 16）验证端点/密钥/模型三要素。
     */
    public AiConfigTestResult test(AiConfigTestRequest req) {
        EffectiveLlmConfig base;
        try {
            base = effective();
        } catch (Exception e) {
            base = staticSnapshot();
        }
        if (base == null) {
            base = staticSnapshot();
        }
        String baseUrl = trimToNull(req.getBaseUrl()) != null ? req.getBaseUrl().trim() : base.baseUrl();
        String apiKey = trimToNull(req.getApiKey()) != null ? req.getApiKey().trim() : base.apiKey();
        String model = trimToNull(req.getModel()) != null ? req.getModel().trim() : base.model();
        if (baseUrl == null || !baseUrl.matches("^https?://.+")) {
            return AiConfigTestResult.failure("端点地址须以 http(s):// 开头", model);
        }
        Map<String, String> headers = baseUrl.equals(base.baseUrl()) ? base.extraHeaders() : Map.of();
        EffectiveLlmConfig cfg = new EffectiveLlmConfig(true, baseUrl, apiKey, model,
                base.temperature(), 16, 5000, 60000, headers, "连通性测试");
        OpenAiCompatibleChatModel probe = DynamicChatModel.build(cfg, objectMapper);
        long t0 = System.currentTimeMillis();
        try {
            probe.complete(List.of(ChatMessage.user("ping，回复 pong 两个字母即可")),
                    new ChatOptions(0.0, 16, false, null));
            return AiConfigTestResult.success(System.currentTimeMillis() - t0, model);
        } catch (AiException e) {
            return AiConfigTestResult.failure(e.getMessage(), model);
        } catch (Exception e) {
            return AiConfigTestResult.failure("连接失败: " + e.getMessage(), model);
        }
    }

    /** 静态默认快照（含沙箱桥接，幂等）。 */
    private EffectiveLlmConfig staticSnapshot() {
        SandboxAiConfigBridge.apply(properties);
        return DynamicChatModel.fromProperties(properties, "环境与默认配置");
    }

    private static String trimToNull(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    /** 密钥脱敏：保留前 2 后 2；过短统一 ****。 */
    static String mask(String key) {
        if (key == null || key.isBlank()) {
            return null;
        }
        String t = key.trim();
        if (t.length() <= 6) {
            return "****";
        }
        return t.substring(0, 2) + "****" + t.substring(t.length() - 2);
    }

    private static String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.getName() != null ? auth.getName() : "system";
    }
}
