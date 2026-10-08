package com.workflow.engine.form;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.engine.form.entity.FormData;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.repository.FormDataRepository;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.process.bpmn.InitiatorNodeResolver;
import com.workflow.engine.process.entity.NodeConfig;
import com.workflow.engine.process.repository.NodeConfigRepository;
import com.workflow.engine.logicflow.service.FormLogicBindingService;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.framework.security.domain.LoginUser;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.repository.ProcessDefinition;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * 表单实例数据服务。
 * 管理流程实例关联的表单数据的保存和查询。
 *
 * 版本快照：保存时记录当前表单定义的版本号（form_version），
 * 保证旧数据与旧 schema 对应。
 */
@Service
public class FormDataService {

    private final FormDataRepository formDataRepository;
    private final FormDefinitionRepository formDefRepository;
    private final TenantProvider tenantProvider;
    private final RepositoryService repositoryService;
    private final NodeConfigRepository nodeConfigRepository;
    private final InitiatorNodeResolver initiatorNodeResolver;
    private final ObjectMapper objectMapper;
    /** 表单 × 逻辑编排绑定调度（AFTER_SNAPSHOT 触发点） */
    private final FormLogicBindingService logicBindings;

    public FormDataService(FormDataRepository formDataRepository,
                           FormDefinitionRepository formDefRepository,
                           TenantProvider tenantProvider,
                           RepositoryService repositoryService,
                           NodeConfigRepository nodeConfigRepository,
                           InitiatorNodeResolver initiatorNodeResolver,
                           ObjectMapper objectMapper,
                           FormLogicBindingService logicBindings) {
        this.formDataRepository = formDataRepository;
        this.formDefRepository = formDefRepository;
        this.tenantProvider = tenantProvider;
        this.repositoryService = repositoryService;
        this.nodeConfigRepository = nodeConfigRepository;
        this.initiatorNodeResolver = initiatorNodeResolver;
        this.objectMapper = objectMapper;
        this.logicBindings = logicBindings;
    }

    /**
     * 保存或更新当前表单数据（非快照，用于节点间传递）。
     * 同一 processInstanceId + formDefId 只保留一条当前数据。
     *
     * @param formDefId          表单定义 ID
     * @param processInstanceId  流程实例 ID
     * @param taskId             任务 ID（可选）
     * @param dataJson           表单数据 JSON
     * @return 创建或更新的表单数据记录
     */
    @Transactional
    public FormData save(String formDefId, String processInstanceId, String taskId, String dataJson) {
        String tenantId = tenantProvider.getTenantId();

        // 获取表单定义的当前版本作为快照
        FormDefinition formDef = formDefRepository.findByIdAndTenantId(formDefId, tenantId)
                .orElseThrow(() -> new RuntimeException("Form definition not found: " + formDefId));

        // 查找是否已有当前数据，有则更新，无则创建
        Optional<FormData> existing = formDataRepository
                .findByTenantIdAndProcessInstanceIdAndFormDefIdAndIsSnapshot(
                        tenantId, processInstanceId, formDefId, false);

        FormData formData;
        if (existing.isPresent()) {
            formData = existing.get();
            formData.setDataJson(dataJson);
            formData.setTaskId(taskId);
            formData.setFormVersion(formDef.getVersion());
        } else {
            formData = new FormData();
            formData.setId(UUID.randomUUID().toString().replace("-", ""));
            formData.setTenantId(tenantId);
            formData.setFormDefId(formDefId);
            formData.setFormVersion(formDef.getVersion());
            formData.setProcessInstanceId(processInstanceId);
            formData.setTaskId(taskId);
            formData.setDataJson(dataJson);
            formData.setIsSnapshot(false);
        }

        return formDataRepository.save(formData);
    }

    /**
     * 保存任务审批时的表单快照（每次创建新记录，不可变）；
     * 落库后触发 AFTER_SNAPSHOT 绑定的逻辑编排（失败语义同 AFTER_*：SYNC_IN_TX 回滚 / AFTER_COMMIT 留痕）。
     *
     * @param formDefId          表单定义 ID
     * @param processInstanceId  流程实例 ID
     * @param taskId             任务 ID
     * @param dataJson           表单数据 JSON
     * @return 创建的快照记录
     */
    @Transactional
    public FormData saveSnapshot(String formDefId, String processInstanceId, String taskId, String dataJson) {
        String tenantId = tenantProvider.getTenantId();

        FormDefinition formDef = formDefRepository.findByIdAndTenantId(formDefId, tenantId)
                .orElseThrow(() -> new RuntimeException("Form definition not found: " + formDefId));

        FormData snapshot = new FormData();
        snapshot.setId(UUID.randomUUID().toString().replace("-", ""));
        snapshot.setTenantId(tenantId);
        snapshot.setFormDefId(formDefId);
        snapshot.setFormVersion(formDef.getVersion());
        snapshot.setProcessInstanceId(processInstanceId);
        snapshot.setTaskId(taskId);
        snapshot.setDataJson(dataJson);
        snapshot.setIsSnapshot(true);

        FormData saved = formDataRepository.save(snapshot);

        // 快照后置编排：formData = dataJson 解析结果（解析失败不阻断快照，formData 传 null）
        Map<String, Object> formDataMap = parseFormDataQuietly(dataJson);
        logicBindings.dispatch(tenantId, FormLogicBindingService.FORM_TYPE_WORKFLOW, formDef.getKey(),
                FormLogicBindingService.TRIG_AFTER_SNAPSHOT,
                logicBindings.buildVars(FormLogicBindingService.FORM_TYPE_WORKFLOW, formDef.getKey(),
                        FormLogicBindingService.TRIG_AFTER_SNAPSHOT, "SNAPSHOT", saved.getId(),
                        formDataMap, null));
        return saved;
    }

    /** dataJson → Map（宽松解析：失败返回 null，避免快照保存被脏数据阻断）。 */
    private Map<String, Object> parseFormDataQuietly(String dataJson) {
        if (dataJson == null || dataJson.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(dataJson,
                    objectMapper.getTypeFactory().constructMapType(LinkedHashMap.class, String.class, Object.class));
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 获取单条表单数据。
     */
    public FormData getById(String id) {
        String tenantId = tenantProvider.getTenantId();
        return formDataRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new RuntimeException("Form data not found: " + id));
    }

    /**
     * 按流程实例和表单定义查询当前表单数据（非快照）。
     */
    public Optional<FormData> findByProcessInstance(String processInstanceId, String formDefId) {
        String tenantId = tenantProvider.getTenantId();
        return formDataRepository
                .findByTenantIdAndProcessInstanceIdAndFormDefIdAndIsSnapshot(
                        tenantId, processInstanceId, formDefId, false);
    }

    /**
     * 按 taskId 查询审批快照。
     */
    public Optional<FormData> findByTaskId(String taskId) {
        String tenantId = tenantProvider.getTenantId();
        return formDataRepository
                .findByTenantIdAndTaskIdAndIsSnapshotOrderByCreatedAtDesc(tenantId, taskId, true)
                .stream()
                .findFirst();
    }

    /**
     * 按流程实例查询所有表单数据（含快照）。
     */
    public List<FormData> findByProcessInstance(String processInstanceId) {
        String tenantId = tenantProvider.getTenantId();
        return formDataRepository
                .findByTenantIdAndProcessInstanceId(tenantId, processInstanceId);
    }

    /**
     * 按流程实例查询所有审批快照（按时间倒序）。
     */
    public List<FormData> findSnapshotsByProcessInstance(String processInstanceId) {
        String tenantId = tenantProvider.getTenantId();
        return formDataRepository
                .findByTenantIdAndProcessInstanceIdAndIsSnapshotOrderByCreatedAtDesc(
                        tenantId, processInstanceId, true);
    }

    /**
     * 更新当前表单数据（非快照）。
     */
    @Transactional
    public FormData update(String id, String dataJson) {
        String tenantId = tenantProvider.getTenantId();
        FormData formData = formDataRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new RuntimeException("Form data not found: " + id));

        formData.setDataJson(dataJson);

        return formDataRepository.save(formData);
    }

    /**
     * 保存发起页草稿（processInstanceId 为 null 的表单数据）。
     * 同一 formDefId 只保留一条草稿，再次保存为更新。
     *
     * @param formDefId 表单定义 ID
     * @param dataJson  表单数据 JSON
     * @return 保存的草稿记录
     */
    @Transactional
    public FormData saveDraft(String formDefId, String dataJson) {
        String tenantId = tenantProvider.getTenantId();

        FormDefinition formDef = formDefRepository.findByIdAndTenantId(formDefId, tenantId)
                .orElseThrow(() -> new RuntimeException("Form definition not found: " + formDefId));

        Optional<FormData> existing = formDataRepository
                .findByTenantIdAndFormDefIdAndProcessInstanceIdIsNullAndIsSnapshot(tenantId, formDefId, false);

        FormData formData;
        if (existing.isPresent()) {
            formData = existing.get();
            formData.setDataJson(dataJson);
            formData.setFormVersion(formDef.getVersion());
        } else {
            formData = new FormData();
            formData.setId(UUID.randomUUID().toString().replace("-", ""));
            formData.setTenantId(tenantId);
            formData.setFormDefId(formDefId);
            formData.setFormVersion(formDef.getVersion());
            formData.setProcessInstanceId(null);
            formData.setTaskId(null);
            formData.setDataJson(dataJson);
            formData.setIsSnapshot(false);
            formData.setCreatedBy(currentUserId()); // 草稿箱按创建人隔离（Task 130f）
        }

        return formDataRepository.save(formData);
    }

    /**
     * 查询发起页草稿。
     *
     * @param formDefId 表单定义 ID
     * @return 草稿记录，无草稿返回 empty
     */
    public Optional<FormData> findDraft(String formDefId) {
        String tenantId = tenantProvider.getTenantId();
        return formDataRepository
                .findByTenantIdAndFormDefIdAndProcessInstanceIdIsNullAndIsSnapshot(tenantId, formDefId, false);
    }

    /**
     * 清除发起页草稿（发起成功后调用）。
     *
     * @param formDefId 表单定义 ID
     */
    @Transactional
    public void clearDraft(String formDefId) {
        String tenantId = tenantProvider.getTenantId();
        formDataRepository
                .findByTenantIdAndFormDefIdAndProcessInstanceIdIsNullAndIsSnapshot(tenantId, formDefId, false)
                .ifPresent(formDataRepository::delete);
    }

    // ==================== 草稿箱（Task 130f，对齐 Node listMyDrafts/deleteMyDraft） ====================

    /** 草稿箱列表项（字段面与 Node DraftBoxItemVO 逐字段一致）。 */
    public Map<String, Object> draftBoxItem(FormData d, String formName, String[] owner) {
        Map<String, Object> vo = new LinkedHashMap<>();
        vo.put("id", d.getId());
        vo.put("formDefId", d.getFormDefId());
        vo.put("formName", formName);
        vo.put("processDefId", owner[0]);
        vo.put("processKey", owner[1]);
        vo.put("processName", owner[2]);
        vo.put("processVersion", owner[3] == null ? null : Integer.valueOf(owner[3]));
        vo.put("dataJson", d.getDataJson());
        vo.put("createdAt", d.getCreatedAt());
        vo.put("updatedAt", d.getUpdatedAt());
        return vo;
    }

    /**
     * 草稿箱：当前用户的全部发起页草稿（附表单名 + 发起流程反查）。
     *
     * <p>流程反查语义对齐 Node resolveStartFormOwners：ACTIVE 且最新版的部署定义，
     * 发起人节点表单 &gt; 流程级（__PROCESS__）表单；同 key 只留最新版、
     * 同表单命中首个 key（先到先得）。
     */
    public List<Map<String, Object>> listMyDrafts(String userId) {
        String tenantId = tenantProvider.getTenantId();
        List<FormData> drafts = formDataRepository.listMyDrafts(tenantId, userId);
        if (drafts.isEmpty()) return List.of();

        // 表单名回填（批量；草稿数量有限，findAllById 后内存过滤租户）
        Map<String, String> formNameById = new HashMap<>();
        List<String> formIds = drafts.stream().map(FormData::getFormDefId).distinct().toList();
        for (FormDefinition f : formDefRepository.findAllById(formIds)) {
            if (tenantId.equals(f.getTenantId())) formNameById.put(f.getId(), f.getName());
        }

        Map<String, String[]> ownerByFormId = resolveStartFormOwners();

        List<Map<String, Object>> out = new ArrayList<>(drafts.size());
        for (FormData d : drafts) {
            out.add(draftBoxItem(d, formNameById.get(d.getFormDefId()),
                    ownerByFormId.get(d.getFormDefId())));
        }
        return out;
    }

    /** 删除草稿箱里的指定草稿（仅本人的发起页草稿可删；不可删返回 false → 404）。 */
    @Transactional
    public boolean deleteMyDraft(String id, String userId) {
        String tenantId = tenantProvider.getTenantId();
        Optional<FormData> row = formDataRepository.findByIdAndTenantId(id, tenantId);
        if (row.isEmpty()) return false;
        FormData d = row.get();
        if (d.getProcessInstanceId() != null) return false;
        if (Boolean.TRUE.equals(d.getIsSnapshot())) return false;
        if (d.getCreatedBy() == null || !d.getCreatedBy().equals(userId)) return false;
        formDataRepository.delete(d);
        return true;
    }

    /**
     * 全部 ACTIVE 最新版部署定义的「发起表单 → 定义」映射。
     * owner 数组：[processDefId, processKey, processName, version]。
     */
    private Map<String, String[]> resolveStartFormOwners() {
        List<ProcessDefinition> defs = repositoryService.createProcessDefinitionQuery()
                .active()
                .latestVersion()
                .orderByProcessDefinitionKey().asc()
                .list();
        if (defs.isEmpty()) return Map.of();

        Map<String, String[]> ownerByFormId = new LinkedHashMap<>();
        for (ProcessDefinition def : defs) {
            // 与 ProcessDefinitionController.resolveFormDefIds 同构：发起人节点表单 > __PROCESS__
            List<NodeConfig> configs = nodeConfigRepository.findByProcessDefinitionId(def.getId());
            String processFormDefId = null;
            for (NodeConfig nc : configs) {
                if ("__PROCESS__".equals(nc.getNodeId())) {
                    processFormDefId = extractFormDefId(nc.getConfigJson());
                    break;
                }
            }
            String effective = processFormDefId;
            String initiatorNodeId = initiatorNodeResolver.resolve(def.getId());
            if (initiatorNodeId != null) {
                for (NodeConfig nc : configs) {
                    if (initiatorNodeId.equals(nc.getNodeId())) {
                        String f = extractFormDefId(nc.getConfigJson());
                        if (f != null) effective = f;
                        break;
                    }
                }
            }
            if (effective == null || ownerByFormId.containsKey(effective)) continue;
            ownerByFormId.put(effective, new String[]{
                    def.getId(), def.getKey(), def.getName(), String.valueOf(def.getVersion())});
        }
        return ownerByFormId;
    }

    /** 当前登录用户 id（对齐 ProcessInstanceController.getCurrentUserId；无登录态返回 null）。 */
    private String currentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof LoginUser loginUser) {
            return String.valueOf(loginUser.getUserId());
        }
        return null;
    }

    /** 从 NodeConfig config_json 提取 form.formDefId（无效/缺失返回 null）。 */
    private String extractFormDefId(String configJson) {
        if (configJson == null || configJson.isBlank()) return null;
        try {
            JsonNode form = objectMapper.readTree(configJson).get("form");
            if (form == null || !form.has("formDefId")) return null;
            String val = form.get("formDefId").asText();
            return val == null || val.isEmpty() ? null : val;
        } catch (Exception e) {
            return null;
        }
    }
}
