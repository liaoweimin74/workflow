package com.workflow.engine.module;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.datasource.repository.DataSourceDefinitionRepository;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.engine.form.column.DynamicTableManager;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.logicflow.entity.FormLogicBinding;
import com.workflow.engine.logicflow.entity.LogicFlowDef;
import com.workflow.engine.logicflow.repository.FormLogicBindingRepository;
import com.workflow.engine.logicflow.repository.LogicFlowDefRepository;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.engine.page.repository.PageDefinitionRepository;
import com.workflow.engine.process.entity.NodeConfig;
import com.workflow.engine.process.entity.ProcessDraft;
import com.workflow.engine.process.repository.NodeConfigRepository;
import com.workflow.engine.process.repository.ProcessDraftRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * 模块导入执行服务。覆盖 = 新版本，绝不触碰运行数据。
 *
 * <p>FORM：新版本行（PUBLISHED，旧降 ARCHIVED）+ ensureTable/ensureSubTable + 绑定 upsert；
 * DATA_SOURCE：按 source_key upsert（name 撞唯一键时加 -imported 后缀）；form_id 重映射；
 * LOGIC_FLOW：upsert 后置 PUBLISHED（version+1）；
 * PAGE：新版本行 + data_source_id 与 schema.dataSources[].refId 的 id 重映射；
 * WORKFLOW：草稿态 upsert + 编辑态节点配置重插（不自动部署）。
 * 顺序：固定大类序 + 组内按 manifest 依赖边迭代拓扑，循环依赖报错。
 */
@Service
public class ModuleImportService {

    private static final Logger log = LoggerFactory.getLogger(ModuleImportService.class);

    /** 冲突策略。 */
    public enum Strategy { OVERWRITE, SKIP }

    private final FormDefinitionRepository formDefRepository;
    private final PageDefinitionRepository pageDefRepository;
    private final DataSourceDefinitionRepository dataSourceRepository;
    private final LogicFlowDefRepository logicFlowRepository;
    private final FormLogicBindingRepository bindingRepository;
    private final ProcessDraftRepository processDraftRepository;
    private final NodeConfigRepository nodeConfigRepository;
    private final DynamicTableManager tableManager;
    private final ObjectMapper objectMapper;

    public ModuleImportService(FormDefinitionRepository formDefRepository,
                               PageDefinitionRepository pageDefRepository,
                               DataSourceDefinitionRepository dataSourceRepository,
                               LogicFlowDefRepository logicFlowRepository,
                               FormLogicBindingRepository bindingRepository,
                               ProcessDraftRepository processDraftRepository,
                               NodeConfigRepository nodeConfigRepository,
                               DynamicTableManager tableManager,
                               ObjectMapper objectMapper) {
        this.formDefRepository = formDefRepository;
        this.pageDefRepository = pageDefRepository;
        this.dataSourceRepository = dataSourceRepository;
        this.logicFlowRepository = logicFlowRepository;
        this.bindingRepository = bindingRepository;
        this.processDraftRepository = processDraftRepository;
        this.nodeConfigRepository = nodeConfigRepository;
        this.tableManager = tableManager;
        this.objectMapper = objectMapper;
    }

    /** 单元素导入结果。 */
    public record ElementResult(String type, String key, String status, String message) {
    }

    /** 导入结果。 */
    public record ImportResult(List<ElementResult> results, List<String> warnings) {
    }

    /** 导入动作。 */
    public record ImportAction(String type, String key, String strategy) {
    }

    /** 拓扑排序后的导入清单。 */
    private record Ordered(List<ModuleTypes.ManifestElement> ordered) {
    }

    /** 执行导入。整体事务；物理表 DDL 随平台发布语义隐式提交。 */
    @Transactional
    public ImportResult importModule(String tenantId, String operator, byte[] zipBytes,
                                     List<ImportAction> actions) throws IOException {
        ModulePackageCodec.Package pkg = ModulePackageCodec.read(zipBytes, objectMapper);
        ModuleTypes.ModuleManifest manifest = pkg.manifest();

        Map<String, Strategy> strategies = new HashMap<>();
        for (ImportAction a : actions) {
            strategies.put(a.type() + ":" + a.key(),
                    a.strategy() == null ? Strategy.OVERWRITE : Strategy.valueOf(a.strategy().toUpperCase()));
        }

        Ordered order = topoOrder(manifest);
        Map<String, String> idMap = new HashMap<>();   // "ID:<包内原行id>" → 目标新 id（refId/form_id 重写用）
        List<ElementResult> results = new ArrayList<>();
        for (ModuleTypes.ManifestElement el : order.ordered()) {
            String ref = el.type() + ":" + el.key();
            Strategy strategy = strategies.getOrDefault(ref, Strategy.OVERWRITE);
            if (strategy == Strategy.SKIP) {
                results.add(new ElementResult(el.type(), el.key(), "SKIPPED", "按用户选择跳过"));
                continue;
            }
            try {
                results.add(importElement(tenantId, operator, pkg.payloads().get(ref), idMap));
            } catch (Exception e) {
                log.error("模块元素导入失败: {}", ref, e);
                throw new IllegalStateException("元素导入失败 [" + ref + "]: " + e.getMessage(), e);
            }
        }
        List<String> warnings = new ArrayList<>();
        warnings.add("导入完成。请为表单/页面手工配置菜单入口；工作流为草稿态，请检查后部署。");
        return new ImportResult(results, warnings);
    }

    /** 固定大类序（FORM→DS→LF→PAGE→WF）+ 组内依赖拓扑（迭代推迟）。 */
    private Ordered topoOrder(ModuleTypes.ModuleManifest manifest) {
        Set<String> packageRefs = new LinkedHashSet<>();
        for (ModuleTypes.ManifestElement el : manifest.elements()) {
            packageRefs.add(el.type() + ":" + el.key());
        }
        List<ModuleTypes.ManifestElement> pending = new ArrayList<>(manifest.elements());
        List<ModuleTypes.ManifestElement> ordered = new ArrayList<>();
        Set<String> done = new LinkedHashSet<>();
        boolean progress = true;
        while (!pending.isEmpty() && progress) {
            progress = false;
            var it = pending.iterator();
            while (it.hasNext()) {
                ModuleTypes.ManifestElement el = it.next();
                boolean ready = true;
                for (String dep : el.dependsOn() == null ? List.<String>of() : el.dependsOn()) {
                    if (packageRefs.contains(dep) && !done.contains(dep)) {
                        ready = false;
                        break;
                    }
                }
                if (ready) {
                    ordered.add(el);
                    done.add(el.type() + ":" + el.key());
                    it.remove();
                    progress = true;
                }
            }
        }
        if (!pending.isEmpty()) {
            throw new IllegalArgumentException("模块内存在循环依赖: " + pending.stream()
                    .map(e -> e.type() + ":" + e.key()).toList());
        }
        return new Ordered(ordered);
    }

    private ElementResult importElement(String tenantId, String operator,
                                        ModuleTypes.ElementPayload p, Map<String, String> idMap) {
        return switch (p.type()) {
            case "FORM" -> importForm(tenantId, operator, p, idMap);
            case "DATA_SOURCE" -> importDataSource(tenantId, operator, p, idMap);
            case "LOGIC_FLOW" -> importLogicFlow(tenantId, operator, p, idMap);
            case "PAGE" -> importPage(tenantId, operator, p, idMap);
            case "WORKFLOW" -> importWorkflow(tenantId, operator, p, idMap);
            default -> throw new IllegalArgumentException("未知元素类型: " + p.type());
        };
    }

    // ---------------- FORM ----------------

    private ElementResult importForm(String tenantId, String operator,
                                     ModuleTypes.ElementPayload p, Map<String, String> idMap) {
        FormDefinition last = formDefRepository
                .findFirstByTenantIdAndKeyOrderByVersionDesc(tenantId, p.key()).orElse(null);
        int newVersion = last == null ? 1 : last.getVersion() + 1;

        // 物理表同步（BUSINESS）：DDL 隐式提交（与发布语义一致），先于元数据写入
        if ("BUSINESS".equals(p.formType()) && p.columnConfig() != null && !p.columnConfig().isBlank()) {
            List<ColumnConfig> columns = parseColumnConfig(p.columnConfig());
            if (!columns.isEmpty()) {
                tableManager.ensureTable(p.key(), columns);
                for (ColumnConfig c : columns) {
                    if (c.getSubColumns() != null && !c.getSubColumns().isEmpty()) {
                        tableManager.ensureSubTable(p.key(), c.getKey(), c.getSubColumns());
                    }
                }
            }
        }

        // 旧 PUBLISHED → ARCHIVED
        formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(tenantId, p.key(), "PUBLISHED")
                .ifPresent(old -> {
                    old.setStatus("ARCHIVED");
                    formDefRepository.save(old);
                });

        FormDefinition f = new FormDefinition();
        f.setId(UUID.randomUUID().toString());
        f.setTenantId(tenantId);
        f.setName(p.name());
        f.setKey(p.key());
        f.setType(p.formType() == null ? "WORKFLOW" : p.formType());
        f.setSchema(p.schema());
        f.setColumnConfig(p.columnConfig());
        f.setProcessKey(p.processKey());
        f.setVersion(newVersion);
        f.setStatus("PUBLISHED");
        f.setPublishedVersion(newVersion);
        f.setCreatedBy(operator);
        FormDefinition saved = formDefRepository.save(f);
        registerId(idMap, p, saved.getId());

        // 触发绑定 upsert（key 引用，无需重映射）
        int bindings = 0;
        if (p.bindings() != null) {
            for (ModuleTypes.ElementPayload.BindingPayload b : p.bindings()) {
                boolean exists = bindingRepository.existsByTenantIdAndFormTypeAndFormKeyAndTriggerTypeAndFlowKey(
                        tenantId, b.formType(), b.formKey(), b.triggerType(), b.flowKey());
                if (!exists) {
                    FormLogicBinding entity = new FormLogicBinding();
                    entity.setId(UUID.randomUUID().toString());
                    entity.setTenantId(tenantId);
                    entity.setFormType(b.formType());
                    entity.setFormKey(b.formKey());
                    entity.setTriggerType(b.triggerType());
                    entity.setFlowKey(b.flowKey());
                    entity.setExecutionMode(b.executionMode() == null ? "SYNC_IN_TX" : b.executionMode());
                    entity.setEnabled(b.enabled() == null || b.enabled());
                    entity.setDescription(b.description());
                    bindingRepository.save(entity);
                    bindings++;
                }
            }
        }
        return new ElementResult("FORM", p.key(), "IMPORTED",
                (last == null ? "新建" : "覆盖") + " v" + newVersion
                        + (bindings > 0 ? "（含 " + bindings + " 条触发绑定）" : ""));
    }

    private List<ColumnConfig> parseColumnConfig(String json) {
        try {
            return objectMapper.readValue(json,
                    objectMapper.getTypeFactory().constructCollectionType(List.class, ColumnConfig.class));
        } catch (IOException e) {
            throw new IllegalStateException("column_config 解析失败: " + e.getMessage(), e);
        }
    }

    // ---------------- DATA_SOURCE ----------------

    private ElementResult importDataSource(String tenantId, String operator,
                                           ModuleTypes.ElementPayload p, Map<String, String> idMap) {
        // SYSTEM/API 为平台/外部资源，不导入
        if (!"FORM".equals(p.dsType()) && !"WORKFLOW".equals(p.dsType())) {
            return new ElementResult("DATA_SOURCE", p.key(), "SKIPPED",
                    "系统/外部类型数据源不随模块导入（" + p.dsType() + "）");
        }
        Optional<DataSourceDefinition> existing = dataSourceRepository
                .findByTenantIdAndSourceKey(tenantId, p.key());
        DataSourceDefinition ds = existing.orElseGet(DataSourceDefinition::new);
        if (existing.isEmpty()) {
            ds.setId(UUID.randomUUID().toString());
            ds.setTenantId(tenantId);
            ds.setType(p.dsType());
            ds.setSourceKey(p.key());
            ds.setFormKey(p.key());
            ds.setStatus("ENABLED");
            ds.setCreatedBy(operator);
            // name 唯一键兜底：被其他 source_key 行占用时加后缀
            String name = p.name();
            if (dataSourceRepository.findByTenantIdAndTypeAndName(tenantId, p.dsType(), name).isPresent()) {
                name = name + "-imported";
            }
            ds.setName(name);
        } else {
            ds.setName(p.name());
        }
        // form_id 重映射：包内原表单行 id → 目标新 id（导入表单时已登记）；包内无该表单时按 key 查目标
        String mappedFormId = p.formId() == null ? null : idMap.get("ID:" + p.formId());
        ds.setFormId(mappedFormId != null ? mappedFormId
                : formDefRepository.findFirstByTenantIdAndKeyOrderByVersionDesc(tenantId, p.key())
                        .map(FormDefinition::getId).orElse(null));
        ds.setParams(p.params());
        DataSourceDefinition saved = dataSourceRepository.save(ds);
        registerId(idMap, p, saved.getId());
        return new ElementResult("DATA_SOURCE", p.key(), "IMPORTED",
                existing.isEmpty() ? "新建（ENABLED）" : "覆盖更新");
    }

    // ---------------- LOGIC_FLOW ----------------

    private ElementResult importLogicFlow(String tenantId, String operator,
                                          ModuleTypes.ElementPayload p, Map<String, String> idMap) {
        Optional<LogicFlowDef> existing = logicFlowRepository.findByTenantIdAndFlowKey(tenantId, p.key());
        LogicFlowDef lf;
        String action;
        if (existing.isEmpty()) {
            lf = new LogicFlowDef();
            lf.setId(UUID.randomUUID().toString());
            lf.setTenantId(tenantId);
            lf.setFlowKey(p.key());
            lf.setVersion(0);
            action = "新建";
        } else {
            lf = existing.get();
            action = "覆盖";
        }
        lf.setName(p.name());
        lf.setDescription(p.description());
        // SUBFLOW 节点的 flowId 为逻辑流 id 引用 → 重映射为目标环境新 id（组内拓扑保证被依赖流先导入）
        lf.setDslJson(remapSubflowIds(p.dsl(), idMap));
        lf.setStatus("PUBLISHED");
        lf.setVersion(lf.getVersion() + 1);
        LogicFlowDef saved = logicFlowRepository.save(lf);
        registerId(idMap, p, saved.getId());
        return new ElementResult("LOGIC_FLOW", p.key(), "IMPORTED", action + "（已发布）");
    }

    /** 重写逻辑流 DSL 中 SUBFLOW 节点的 flowId（id 引用 → 目标新 id）。 */
    private String remapSubflowIds(String dslJson, Map<String, String> idMap) {
        if (dslJson == null || dslJson.isBlank()) {
            return dslJson;
        }
        try {
            JsonNode root = objectMapper.readTree(dslJson);
            JsonNode nodes = root.path("nodes");
            boolean changed = false;
            if (nodes.isArray()) {
                for (JsonNode node : nodes) {
                    String type = node.path("type").asText("");
                    JsonNode config = node.get("config");
                    if ("SUBFLOW".equals(type) && config != null && config.isObject()
                            && config.has("flowId") && config.get("flowId").isTextual()) {
                        String mapped = idMap.get("ID:" + config.get("flowId").asText());
                        if (mapped != null && !mapped.equals(config.get("flowId").asText())) {
                            ((ObjectNode) config).put("flowId", mapped);
                            changed = true;
                        }
                    }
                }
            }
            return changed ? objectMapper.writeValueAsString(root) : dslJson;
        } catch (IOException e) {
            throw new IllegalStateException("逻辑流 DSL 解析失败: " + e.getMessage(), e);
        }
    }

    // ---------------- PAGE ----------------

    private ElementResult importPage(String tenantId, String operator,
                                     ModuleTypes.ElementPayload p, Map<String, String> idMap) {
        PageDefinition last = pageDefRepository
                .findFirstByTenantIdAndKeyOrderByVersionDesc(tenantId, p.key()).orElse(null);
        int newVersion = last == null ? 1 : last.getVersion() + 1;

        // id 重映射：data_source_id 与 schema.dataSources[].refId
        String newDataSourceId = remapDsId(p.dataSourceId(), idMap, tenantId);
        String newSchema = remapSchemaRefIds(p.schema(), idMap);

        pageDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(tenantId, p.key(), "PUBLISHED")
                .ifPresent(old -> {
                    old.setStatus("ARCHIVED");
                    pageDefRepository.save(old);
                });

        PageDefinition page = new PageDefinition();
        page.setId(UUID.randomUUID().toString());
        page.setTenantId(tenantId);
        page.setName(p.name());
        page.setKey(p.key());
        page.setType(p.pageType() == null ? "PAGE" : p.pageType());
        page.setFormKey(p.formKey());
        page.setDataSourceId(newDataSourceId);
        page.setSchema(newSchema);
        page.setVersion(newVersion);
        page.setStatus("PUBLISHED");
        page.setPublishedVersion(newVersion);
        page.setCreatedBy(operator);
        pageDefRepository.save(page);
        registerId(idMap, p, page.getId());
        return new ElementResult("PAGE", p.key(), "IMPORTED",
                (last == null ? "新建" : "覆盖") + " v" + newVersion);
    }

    /** 数据源 id 重映射：包内原行 id → 目标新 id；未命中（包内不含该数据源）时按原 id 直查目标，兜底原值。 */
    private String remapDsId(String packageDsId, Map<String, String> idMap, String tenantId) {
        if (packageDsId == null || packageDsId.isBlank()) {
            return packageDsId;
        }
        String mapped = idMap.get("ID:" + packageDsId);
        if (mapped != null) {
            return mapped;
        }
        return dataSourceRepository.findByIdAndTenantId(packageDsId, tenantId)
                .map(DataSourceDefinition::getId).orElse(packageDsId);
    }

    /** 重写页面 schema JSON 中 dataSources[].refId（id 引用 → 目标新 id）。 */
    private String remapSchemaRefIds(String schema, Map<String, String> idMap) {
        if (schema == null || schema.isBlank()) {
            return schema;
        }
        try {
            JsonNode root = objectMapper.readTree(schema);
            JsonNode arr = root.path("dataSources");
            boolean changed = false;
            if (arr.isArray() && root instanceof ObjectNode obj) {
                ArrayNode out = objectMapper.createArrayNode();
                for (JsonNode entry : arr) {
                    JsonNode refId = entry.get("refId");
                    if (refId != null && refId.isTextual()) {
                        String mapped = idMap.get("ID:" + refId.asText());
                        if (mapped != null && !mapped.equals(refId.asText())) {
                            ((ObjectNode) entry).put("refId", mapped);
                            changed = true;
                        }
                    }
                    out.add(entry);
                }
                obj.set("dataSources", out);
            }
            return changed ? objectMapper.writeValueAsString(root) : schema;
        } catch (IOException e) {
            throw new IllegalStateException("页面 schema 解析失败: " + e.getMessage(), e);
        }
    }

    /** 登记包内原行 id → 目标新 id 映射（页面 refId / 数据源 form_id 重写依赖）。 */
    private void registerId(Map<String, String> idMap, ModuleTypes.ElementPayload p, String newId) {
        if (p.sourceId() != null && !p.sourceId().isBlank()) {
            idMap.put("ID:" + p.sourceId(), newId);
        }
    }

    // ---------------- WORKFLOW ----------------

    private ElementResult importWorkflow(String tenantId, String operator,
                                         ModuleTypes.ElementPayload p, Map<String, String> idMap) {
        Optional<ProcessDraft> existing = processDraftRepository.findByTenantIdAndKey(tenantId, p.key());
        ProcessDraft pd;
        String action;
        if (existing.isEmpty()) {
            pd = new ProcessDraft();
            pd.setId(UUID.randomUUID().toString());
            pd.setTenantId(tenantId);
            pd.setKey(p.key());
            pd.setVersion(0);
            action = "新建";
        } else {
            pd = existing.get();
            action = "覆盖";
        }
        pd.setName(p.name());
        pd.setDescription(p.description());
        pd.setBpmnXml(p.bpmnXml());
        pd.setStatus("DRAFT");
        pd.setProcessDefinitionId(null);
        pd.setDeployId(null);
        pd.setDeployedXml(null);
        pd.setDeployedConfigHash(null);
        pd.setLastDeployedAt(null);
        pd.setCreatedBy(operator);
        ProcessDraft saved = processDraftRepository.save(pd);

        // 编辑态节点配置重插
        nodeConfigRepository.deleteByProcessDefIdAndProcessDefinitionIdIsNull(saved.getId());
        int count = 0;
        if (p.nodeConfigs() != null) {
            for (ModuleTypes.ElementPayload.NodeConfigPayload nc : p.nodeConfigs()) {
                NodeConfig entity = new NodeConfig();
                entity.setId(UUID.randomUUID().toString());
                entity.setTenantId(tenantId);
                entity.setProcessDefId(saved.getId());
                entity.setProcessDefinitionId(null);
                entity.setNodeId(nc.nodeId());
                entity.setNodeType(nc.nodeType());
                entity.setConfigJson(nc.configJson());
                nodeConfigRepository.save(entity);
                count++;
            }
        }
        return new ElementResult("WORKFLOW", p.key(), "IMPORTED",
                action + "（草稿态，" + count + " 个节点配置，需手工部署）");
    }
}
