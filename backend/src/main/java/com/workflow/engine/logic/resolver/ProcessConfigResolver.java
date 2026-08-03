package com.workflow.engine.logic.resolver;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.engine.logic.config.BackendLogicItemConfig;
import com.workflow.engine.process.entity.NodeConfig;
import com.workflow.engine.process.entity.ProcessDraft;
import com.workflow.engine.process.repository.NodeConfigRepository;
import com.workflow.engine.process.repository.ProcessDraftRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 进程内节点后端逻辑配置解析器 (带 TTL 缓存)。
 *
 * <p>由 {@code processDefinitionId} 反查流程草稿 {@code draftId}，再加载该草稿下所有 {@link NodeConfig}，
 * 解析 {@code config_json} 中的 {@code backendLogic[]}，按 {@code nodeId} 组织成 map。
 * 结果按进程内 {@link ConcurrentHashMap} + TTL（默认 5 分钟）缓存，避免每次引擎事件都命中数据库。
 */
public class ProcessConfigResolver {

    private static final Logger log = LoggerFactory.getLogger(ProcessConfigResolver.class);
    private static final long DEFAULT_TTL_MILLIS = 5 * 60 * 1000L;
    private static final String BACKEND_LOGIC_FIELD = "backendLogic";

    private final ProcessDraftRepository processDraftRepository;
    private final NodeConfigRepository nodeConfigRepository;
    private final ObjectMapper objectMapper;
    private final Map<String, CacheEntry> cache = new ConcurrentHashMap<>();

    public ProcessConfigResolver(ProcessDraftRepository processDraftRepository,
                                 NodeConfigRepository nodeConfigRepository,
                                 ObjectMapper objectMapper) {
        this.processDraftRepository = processDraftRepository;
        this.nodeConfigRepository = nodeConfigRepository;
        this.objectMapper = objectMapper;
    }

    /**
     * 解析给定 {@code processDefinitionId} 下所有节点的后端逻辑配置。
     * 返回 {@code nodeId -> List<BackendLogicItemConfig>}；无配置时返回空 map。
     */
    public Map<String, List<BackendLogicItemConfig>> resolve(String processDefinitionId) {
        if (processDefinitionId == null || processDefinitionId.isBlank()) {
            return Collections.emptyMap();
        }
        long now = System.currentTimeMillis();
        CacheEntry entry = cache.get(processDefinitionId);
        if (entry != null && now - entry.createdAt() < DEFAULT_TTL_MILLIS) {
            return entry.value();
        }

        Map<String, List<BackendLogicItemConfig>> resolved = doResolve(processDefinitionId);
        // 覆盖缓存，并原子地重写时间戳；简单实现直接重建。
        cache.put(processDefinitionId, new CacheEntry(now, resolved));
        return resolved;
    }

    private Map<String, List<BackendLogicItemConfig>> doResolve(String processDefinitionId) {
        Map<String, List<BackendLogicItemConfig>> result = new HashMap<>();
        ProcessDraft draft = processDraftRepository.findByProcessDefinitionId(processDefinitionId).orElse(null);
        if (draft == null) {
            log.debug("No draft found for processDefinitionId={}", processDefinitionId);
            return result;
        }
        String draftId = draft.getId();
        List<NodeConfig> configs = nodeConfigRepository.findByProcessDefId(draftId);
        for (NodeConfig nc : configs) {
            List<BackendLogicItemConfig> items = parseBackendLogic(nc.getConfigJson());
            if (items != null && !items.isEmpty()) {
                result.put(nc.getNodeId(), items);
            }
        }
        return result;
    }

    private List<BackendLogicItemConfig> parseBackendLogic(String configJson) {
        if (configJson == null || configJson.isBlank()) {
            return null;
        }
        try {
            JsonNode root = objectMapper.readTree(configJson);
            JsonNode array = root.get(BACKEND_LOGIC_FIELD);
            if (array == null || !array.isArray() || array.isEmpty()) {
                return null;
            }
            List<BackendLogicItemConfig> items = new ArrayList<>();
            for (JsonNode node : array) {
                items.add(objectMapper.treeToValue(node, BackendLogicItemConfig.class));
            }
            return items;
        } catch (Exception e) {
            log.warn("Failed to parse backendLogic from configJson: {}", e.getMessage());
            return null;
        }
    }

    /** 缓存条目：值 + 创建时间戳。用于 TTL 淘汰。 */
    private record CacheEntry(long createdAt, Map<String, List<BackendLogicItemConfig>> value) {
    }
}