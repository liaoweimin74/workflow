package com.workflow.engine.form.bizdata;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.engine.form.SerialNumberService;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 业务表单创建路径「自动编号」填充钩子（Task 3-d）。
 *
 * <p>规则：已发布业务表单中组件 type=AutoNumber 且提交值为空（null/空白）的字段，
 * 由后端生成流水号（prefix + 日期段 + 补零序号）就地填充，随后按正常列写入业务表。
 *
 * <p>AutoNumber 字段识别（两级）：
 * <ol>
 *   <li>一级：column_config 组件类型（{@code componentType=AutoNumber}）——设计器列映射
 *       对每个真实字段都持久化 componentType，BizDataContext 已解析，零额外查询；</li>
 *   <li>二级兜底：一级为空时递归遍历 form-create schema（children / props.rule /
 *       props.columns[].rule，对齐 FormDefinitionService.collectUnknownComponentTypes 的遍历写法）
 *       取 {@code type='AutoNumber'} 的 field。</li>
 * </ol>
 *
 * <p>props（prefix/dateFormat/resetPolicy/seqDigits）唯一来源是表单 schema，
 * 两级识别命中后统一从 schema 取值；schema 缺失/解析失败/字段无 props 时逐项走
 * SerialNumberService 缺省值（BN / yyyyMMdd / day / 4）。
 *
 * <p>serialKey 约定 {@code formKey + '.' + fieldKey}：不同表单同名字段不共享计数
 * （防跨表单重号）；同一表单跨发布版本复用同 key，计数自然连续。
 *
 * <p><b>容错约定</b>：钩子绝不阻断业务数据创建——schema 读取/解析失败降级为空
 * （props 走默认值），单字段取号失败仅 log.warn 跳过该字段，外层再兜底一层 catch-all。
 */
@Service
public class AutoNumberHook {

    private static final Logger log = LoggerFactory.getLogger(AutoNumberHook.class);

    /** 表单 schema 中自动编号组件的 type（与设计器/发布白名单一致） */
    private static final String COMPONENT_TYPE = "AutoNumber";

    private final FormDefinitionRepository formDefRepository;
    private final SerialNumberService serialNumberService;
    private final ObjectMapper objectMapper;

    public AutoNumberHook(FormDefinitionRepository formDefRepository,
                          SerialNumberService serialNumberService,
                          ObjectMapper objectMapper) {
        this.formDefRepository = formDefRepository;
        this.serialNumberService = serialNumberService;
        this.objectMapper = objectMapper;
    }

    /** 自动编号组件 props（schema 提取；null 项由 SerialNumberService 落缺省值） */
    record AutoNumberProps(String prefix, String dateFormat, String resetPolicy, Integer seqDigits) {
        static final AutoNumberProps DEFAULT = new AutoNumberProps(null, null, null, null);
    }

    /**
     * 为业务数据创建填充自动编号字段（就地修改 data）。
     *
     * @param formKey  业务表单 key
     * @param tenantId 租户 id
     * @param ctx      已加载的业务表单上下文（含 column_config 解析结果，供一级识别）
     * @param data     提交数据（可变；仅对值为 null/空白的 AutoNumber 字段填充，已有值不覆盖）
     */
    public void fill(String formKey, String tenantId, BizDataContext ctx, Map<String, Object> data) {
        if (data == null || data.isEmpty()) {
            return;
        }
        try {
            // 一级识别：column_config 组件类型（ctx 已带，无额外查询）
            List<String> fromColumnConfig = fromColumnConfig(ctx);
            // schema：props 的唯一来源 + 一级为空时的兜底识别（失败降级空 map → props 全走默认值）
            Map<String, AutoNumberProps> schemaProps = collectFromSchema(formKey, tenantId);

            List<String> targets = !fromColumnConfig.isEmpty()
                    ? fromColumnConfig
                    : List.copyOf(schemaProps.keySet());
            if (targets.isEmpty()) {
                return;
            }

            for (String field : targets) {
                Object current = data.get(field);
                if (current != null && !String.valueOf(current).isBlank()) {
                    continue; // 已有提交值：幂等，不覆盖
                }
                String serialKey = formKey + "." + field;
                try {
                    AutoNumberProps props = schemaProps.getOrDefault(field, AutoNumberProps.DEFAULT);
                    String value = serialNumberService.nextSerial(tenantId, serialKey,
                            props.prefix(), props.dateFormat(), props.resetPolicy(), props.seqDigits());
                    data.put(field, value);
                } catch (Exception e) {
                    // 单字段取号失败不阻断创建（保守：宁缺号不阻断业务）
                    log.warn("自动编号生成失败，跳过字段填充 formKey={} field={} serialKey={}",
                            formKey, field, serialKey, e);
                }
            }
        } catch (Exception e) {
            log.warn("自动编号钩子执行失败（不阻断创建）formKey={}", formKey, e);
        }
    }

    /** 一级识别：column_config 中 componentType=AutoNumber 的字段 key 列表。 */
    private List<String> fromColumnConfig(BizDataContext ctx) {
        if (ctx == null || ctx.columns() == null || ctx.columns().isEmpty()) {
            return List.of();
        }
        return ctx.columns().stream()
                .filter(c -> COMPONENT_TYPE.equalsIgnoreCase(c.getComponentType() == null
                        ? "" : c.getComponentType().trim()))
                .map(ColumnConfig::getKey)
                .filter(key -> key != null && !key.isBlank())
                .toList();
    }

    /**
     * 读取已发布表单 schema，递归收集 type=AutoNumber 的 field → props。
     * 表单不存在/未发布/schema 空 → 空 map；解析异常 → 空 map（降级默认 props）。
     */
    private Map<String, AutoNumberProps> collectFromSchema(String formKey, String tenantId) {
        try {
            FormDefinition published = formDefRepository
                    .findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(tenantId, formKey, "PUBLISHED")
                    .orElse(null);
            if (published == null || published.getSchema() == null || published.getSchema().isBlank()) {
                return Map.of();
            }
            JsonNode root = objectMapper.readTree(published.getSchema());
            JsonNode rules = root.isArray() ? root : root.path("rule");
            Map<String, AutoNumberProps> out = new LinkedHashMap<>();
            collectAutoNumberRules(rules, out);
            return out;
        } catch (Exception e) {
            log.warn("自动编号 schema 解析失败，props 走默认值 formKey={}", formKey, e);
            return Map.of();
        }
    }

    /**
     * 递归遍历 rule 数组收集 AutoNumber 字段。
     * 遍历结构对齐 FormDefinitionService.collectUnknownComponentTypes：
     * children（布局容器）/ props.rule（子表单）/ props.columns[].rule（子表）。
     */
    private void collectAutoNumberRules(JsonNode rules, Map<String, AutoNumberProps> out) {
        if (rules == null || !rules.isArray()) {
            return;
        }
        for (JsonNode field : rules) {
            if (field.isObject() && COMPONENT_TYPE.equals(field.path("type").asText("").trim())) {
                String key = field.path("field").asText("").trim();
                if (!key.isEmpty() && !out.containsKey(key)) {
                    out.put(key, readProps(field.path("props")));
                }
            }
            collectAutoNumberRules(field.path("children"), out);
            collectAutoNumberRules(field.path("props").path("rule"), out);
            JsonNode columns = field.path("props").path("columns");
            if (columns.isArray()) {
                for (JsonNode column : columns) {
                    collectAutoNumberRules(column.path("rule"), out);
                }
            }
        }
    }

    /** 从组件 props 节点提取配置；缺项留 null 由 SerialNumberService 落默认值。 */
    private AutoNumberProps readProps(JsonNode props) {
        if (props == null || props.isMissingNode()) {
            return AutoNumberProps.DEFAULT;
        }
        String prefix = props.path("prefix").asText(null);
        String dateFormat = props.path("dateFormat").asText(null);
        String resetPolicy = props.path("resetPolicy").asText(null);
        int rawDigits = props.path("seqDigits").asInt(0);
        Integer seqDigits = rawDigits > 0 ? rawDigits : null;
        return new AutoNumberProps(prefix, dateFormat, resetPolicy, seqDigits);
    }
}
