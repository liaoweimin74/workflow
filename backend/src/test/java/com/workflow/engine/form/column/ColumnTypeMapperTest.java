package com.workflow.engine.form.column;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ColumnTypeMapper 单元测试：组件类型 → 列类型映射。
 */
class ColumnTypeMapperTest {

    @Test
    void mapInputText_returnsVarchar255() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("input", Map.of());
        assertThat(c.getColumnType()).isEqualTo("VARCHAR");
        assertThat(c.getLength()).isEqualTo(255);
    }

    @Test
    void mapTextarea_returnsText() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("textarea", Map.of());
        assertThat(c.getColumnType()).isEqualTo("TEXT");
    }

    @Test
    void mapDate_returnsDate() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("DatePicker", Map.of("type", "date"));
        assertThat(c.getColumnType()).isEqualTo("DATE");
    }

    @Test
    void mapDatetime_returnsDatetime() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("DatePicker", Map.of("type", "datetime"));
        assertThat(c.getColumnType()).isEqualTo("DATETIME");
    }

    @Test
    void mapNumberInteger_returnsInt() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("inputNumber", Map.of());
        assertThat(c.getColumnType()).isEqualTo("INT");
    }

    @Test
    void mapNumberDecimal_returnsDecimal() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("inputNumber", Map.of("precision", 2));
        assertThat(c.getColumnType()).isEqualTo("DECIMAL");
        assertThat(c.getScale()).isEqualTo(2);
    }

    @Test
    void mapSelect_returnsJson() {
        // select 单选/多选统一 JSON 存储：查询走 _text 文本列，主列仅存值用于回显
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("select", Map.of());
        assertThat(c.getColumnType()).isEqualTo("JSON");
        assertThat(c.getLength()).isNull();
    }

    @Test
    void mapSelectMultiple_returnsJson() {
        // select 配置多选后值为数组；VARCHAR 列存 JSON 字符串且读取不反序列化导致回显异常 → 多选 JSON
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("select", Map.of("multiple", true));
        assertThat(c.getColumnType()).isEqualTo("JSON");
        assertThat(c.getLength()).isNull();
    }

    @Test
    void mapCheckbox_returnsJson() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("checkbox", Map.of());
        assertThat(c.getColumnType()).isEqualTo("JSON");
    }

    @Test
    void mapMultiSelect_returnsJson() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("multiSelect", Map.of());
        assertThat(c.getColumnType()).isEqualTo("JSON");
    }

    @Test
    void mapMultiSelectPro_returnsJson() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("multiSelectPro", Map.of());
        assertThat(c.getColumnType()).isEqualTo("JSON");
    }

    @Test
    void mapRate_returnsInt() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("rate", null);
        assertThat(c).isNotNull();
        assertThat(c.getColumnType()).isEqualTo("INT");
    }

    @Test
    void mapColorPicker_returnsVarchar16() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("colorPicker", null);
        assertThat(c).isNotNull();
        assertThat(c.getColumnType()).isEqualTo("VARCHAR");
        assertThat(c.getLength()).isEqualTo(16);
    }

    @Test
    void mapTreeSingle_returnsVarchar255() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("tree", null);
        assertThat(c.getColumnType()).isEqualTo("VARCHAR");
        assertThat(c.getLength()).isEqualTo(255);
    }

    @Test
    void mapTreeMultiple_returnsJson() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("tree", Map.of("showCheckbox", true));
        assertThat(c.getColumnType()).isEqualTo("JSON");
    }

    @Test
    void mapTreeSelectSingle_returnsJson() {
        // elTreeSelect 单选：node-key 值可能是数字，VARCHAR 经后端序列化后回显类型不匹配 → 一律 JSON 保真
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("elTreeSelect", Map.of("multiple", false));
        assertThat(c.getColumnType()).isEqualTo("JSON");
        assertThat(c.getLength()).isNull();
    }

    @Test
    void mapTreeSelectMultiple_returnsJson() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("elTreeSelect", Map.of("multiple", true));
        assertThat(c.getColumnType()).isEqualTo("JSON");
    }

    @Test
    void mapTransfer_returnsJson() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("elTransfer", null);
        assertThat(c.getColumnType()).isEqualTo("JSON");
    }

    @Test
    void mapEditor_returnsText() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("fcEditor", null);
        assertThat(c.getColumnType()).isEqualTo("TEXT");
    }

    @Test
    void mapSignaturePad_returnsText() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("signaturePad", null);
        assertThat(c.getColumnType()).isEqualTo("TEXT");
    }

    @Test
    void mapCascader_returnsJson() {
        // cascader 值为数组（级联路径），须 JSON 存储（VARCHAR 会触发 Java 序列化乱码）
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("cascader", null);
        assertThat(c.getColumnType()).isEqualTo("JSON");
    }

    @Test
    void mapSliderSingleInteger_returnsInt() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("slider", Map.of("min", 0, "max", 10));
        assertThat(c.getColumnType()).isEqualTo("INT");
    }

    @Test
    void mapSliderSingleDecimal_returnsDecimal() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("slider", Map.of("min", 0, "max", 1, "step", 0.1));
        assertThat(c.getColumnType()).isEqualTo("DECIMAL");
        assertThat(c.getLength()).isEqualTo(18);
        assertThat(c.getScale()).isEqualTo(1);
    }

    @Test
    void mapSliderRange_returnsJson() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("slider", Map.of("range", true, "min", 0, "max", 100));
        assertThat(c.getColumnType()).isEqualTo("JSON");
    }

    @Test
    void mapSwitch_returnsTinyint() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("switch", Map.of());
        assertThat(c.getColumnType()).isEqualTo("TINYINT");
    }

    // ----- 系统附件（Task 146）：单/多由文件数量 limit 决定（七点反馈改造） -----

    @Test
    void mapAttachmentSingleLimit1_returnsBigint() {
        // limit==1 → 单文件，值为附件 id 数值 → BIGINT
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("SystemAttachment", Map.of("limit", 1));
        assertThat(c.getColumnType()).isEqualTo("BIGINT");
        assertThat(c.getLength()).isNull();
    }

    @Test
    void mapAttachmentMultiLimit_returnsJson() {
        // limit>1 → 多文件，值为 id 数组 → JSON
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("SystemAttachment", Map.of("limit", 5));
        assertThat(c.getColumnType()).isEqualTo("JSON");
    }

    @Test
    void mapAttachmentUnlimitedLimit0_returnsJson() {
        // limit==0（多文件不限量）→ JSON
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("SystemAttachment", Map.of("limit", 0));
        assertThat(c.getColumnType()).isEqualTo("JSON");
    }

    @Test
    void mapAttachmentMissingLimit_returnsJson() {
        // limit 缺失按多文件兜底（对齐组件 isMulti 的 Number(limit)!==1 与前端 Number(limit)===1 判定）
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("SystemAttachment", Map.of("maxSizeMB", 10));
        assertThat(c.getColumnType()).isEqualTo("JSON");
    }

    @Test
    void mapAttachmentNullProps_returnsJson() {
        // props 为空 → 多文件 JSON 兜底
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("SystemAttachment", null);
        assertThat(c.getColumnType()).isEqualTo("JSON");
    }

    @Test
    void mapAttachmentLegacyMultipleTrue_returnsJson() {
        // 遗留 schema：multiple=true 仍兜底按多文件（即使 limit==1，防旧数据列型漂移）
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("SystemAttachment",
                Map.of("multiple", true, "limit", 1));
        assertThat(c.getColumnType()).isEqualTo("JSON");
    }

    @Test
    void mapAttachmentLimitAsString1_returnsBigint() {
        // limit 以字符串形态落盘时容错解析，仍正确判定单文件
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("SystemAttachment", Map.of("limit", "1"));
        assertThat(c.getColumnType()).isEqualTo("BIGINT");
    }

    // ----- 系统图片（Task 147）：值语义与附件一致（limit 判定共用） -----

    @Test
    void mapImageSingleLimit1_returnsBigint() {
        // limit==1 → 单图，值为图片 id 数值 → BIGINT
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("SystemImage", Map.of("limit", 1));
        assertThat(c.getColumnType()).isEqualTo("BIGINT");
        assertThat(c.getLength()).isNull();
    }

    @Test
    void mapImageMultiLimit_returnsJson() {
        // limit>1 → 多图，值为 id 数组 → JSON
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("SystemImage", Map.of("limit", 9));
        assertThat(c.getColumnType()).isEqualTo("JSON");
    }

    @Test
    void mapImageUnlimitedLimit0_returnsJson() {
        // limit==0（多图不限量）→ JSON
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("SystemImage", Map.of("limit", 0));
        assertThat(c.getColumnType()).isEqualTo("JSON");
    }

    @Test
    void mapImageMissingLimitAndNullProps_returnsJson() {
        // limit 缺失 / props 为空 → 多图 JSON 兜底（对齐组件 isMulti 判定）
        assertThat(ColumnTypeMapper.mapComponentToColumn("SystemImage", Map.of("maxSizeMB", 10)).getColumnType())
                .isEqualTo("JSON");
        assertThat(ColumnTypeMapper.mapComponentToColumn("SystemImage", null).getColumnType())
                .isEqualTo("JSON");
    }

    @Test
    void mapImageLimitAsString1_returnsBigint() {
        // limit 字符串形态容错解析
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("SystemImage", Map.of("limit", "1"));
        assertThat(c.getColumnType()).isEqualTo("BIGINT");
    }

    @Test
    void mapUpload_returnsJson() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("Upload", Map.of());
        assertThat(c.getColumnType()).isEqualTo("JSON");
    }

    @Test
    void mapLookupPicker_returnsVarchar255() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("LookupPicker",
                Map.of("displayField", "name"));
        assertThat(c).isNotNull();
        assertThat(c.getColumnType()).isEqualTo("VARCHAR");
        assertThat(c.getLength()).isEqualTo(255);
    }

    @Test
    void mapLookupPicker_defaultProps_returnsVarchar255() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("LookupPicker", Map.of());
        assertThat(c).isNotNull();
        assertThat(c.getColumnType()).isEqualTo("VARCHAR");
        assertThat(c.getLength()).isEqualTo(255);
    }

    @Test
    void mapUnsupported_returnsNull() {
        assertThat(ColumnTypeMapper.mapComponentToColumn("userPicker", Map.of())).isNull();
        assertThat(ColumnTypeMapper.mapComponentToColumn("deptPicker", Map.of())).isNull();
        assertThat(ColumnTypeMapper.mapComponentToColumn("divider", Map.of())).isNull();
        assertThat(ColumnTypeMapper.mapComponentToColumn("groupContainer", Map.of())).isNull();
    }

    @Test
    void mapSubForm_returnsJson() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("subForm", Map.of());
        assertThat(c).isNotNull();
        assertThat(c.getColumnType()).isEqualTo("JSON");
    }

    @Test
    void mapSubtableComponents_returnsNull_forSubtableBranch() {
        // group/tableForm 由上层子表分支处理，不映射为普通列
        assertThat(ColumnTypeMapper.mapComponentToColumn("group", Map.of())).isNull();
        assertThat(ColumnTypeMapper.mapComponentToColumn("tableForm", Map.of())).isNull();
    }

    @Test
    void crossTypeChange_isRejected() {
        assertThat(ColumnTypeMapper.isCrossTypeChange("VARCHAR", "DECIMAL")).isTrue();
        assertThat(ColumnTypeMapper.isCrossTypeChange("VARCHAR", "TEXT")).isFalse();
        assertThat(ColumnTypeMapper.isCrossTypeChange("VARCHAR", "VARCHAR")).isFalse();
        assertThat(ColumnTypeMapper.isCrossTypeChange("INT", "DECIMAL")).isTrue();
        assertThat(ColumnTypeMapper.isCrossTypeChange("DATE", "DATETIME")).isFalse();
    }

    @Test
    void longtextTypeChangeIsNotCrossCategory() {
        // LONGTEXT 与 TEXT 同类（STRING），允许变更
        assertThat(ColumnTypeMapper.isCrossTypeChange("TEXT", "LONGTEXT")).isFalse();
        assertThat(ColumnTypeMapper.isCrossTypeChange("LONGTEXT", "TEXT")).isFalse();
    }

    @Test
    void allowedColumnType_validation() {
        assertThat(ColumnTypeMapper.isAllowedColumnType("VARCHAR")).isTrue();
        assertThat(ColumnTypeMapper.isAllowedColumnType("TEXT")).isTrue();
        assertThat(ColumnTypeMapper.isAllowedColumnType("DECIMAL")).isTrue();
        assertThat(ColumnTypeMapper.isAllowedColumnType("LONGTEXT")).isTrue();
        assertThat(ColumnTypeMapper.isAllowedColumnType("BLOB")).isFalse();
        assertThat(ColumnTypeMapper.isAllowedColumnType(null)).isFalse();
    }

    @Test
    void mapComponent_recordsComponentType() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("colorPicker", null);
        assertThat(c.getComponentType()).isEqualTo("colorPicker");
    }

    @Test
    void mapPicker_recordsComponentType() {
        List<ColumnConfig> cols = ColumnTypeMapper.mapPickerToColumns("emp_id",
                Map.of("sourceFormKey", "emp_profile", "displayField", "name"));

        assertThat(cols.get(0).getComponentType()).isEqualTo("dataPicker");
        assertThat(cols.get(1).getComponentType()).isEqualTo("dataPickerText");
    }

    @Test
    void mapPicker_returnsTwoColumns_idAndHiddenText() {
        List<ColumnConfig> cols = ColumnTypeMapper.mapPickerToColumns("emp_id",
                Map.of("sourceFormKey", "emp_profile", "displayField", "name", "maxCount", 3));

        assertThat(cols).hasSize(2);
        assertThat(cols.get(0).getKey()).isEqualTo("emp_id");
        assertThat(cols.get(0).getColumnType()).isEqualTo("TEXT");
        assertThat(cols.get(0).getPickerConfig()).contains("emp_profile");
        assertThat(cols.get(0).getPickerConfig()).contains("name");
        assertThat(cols.get(0).getPickerConfig()).contains("maxCount");
        assertThat(cols.get(0).isHidden()).isFalse();

        assertThat(cols.get(1).getKey()).isEqualTo("emp_id_text");
        assertThat(cols.get(1).getColumnType()).isEqualTo("TEXT");
        assertThat(cols.get(1).isHidden()).isTrue();
    }

    @Test
    void mapPicker_singleSemantics_maxCount1() {
        List<ColumnConfig> cols = ColumnTypeMapper.mapPickerToColumns("emp_id",
                Map.of("sourceFormKey", "emp_profile", "displayField", "name", "maxCount", 1));

        assertThat(cols.get(0).getColumnType()).isEqualTo("TEXT");
        assertThat(cols.get(0).getPickerConfig()).contains("\"maxCount\":1");
    }

    @Test
    void mapPicker_missingProps_stillGeneratesTwoColumns() {
        List<ColumnConfig> cols = ColumnTypeMapper.mapPickerToColumns("ref", Map.of());

        assertThat(cols).hasSize(2);
        assertThat(cols.get(0).getKey()).isEqualTo("ref");
        assertThat(cols.get(1).getKey()).isEqualTo("ref_text");
        assertThat(cols.get(1).isHidden()).isTrue();
        // maxCount 缺省为 null（不限）
        assertThat(cols.get(0).getPickerConfig()).contains("\"maxCount\":null");
    }

    @Test
    void mapArrayComponent_checkbox_generatesTwoColumns() {
        List<ColumnConfig> cols = ColumnTypeMapper.mapArrayComponentToColumns("tags", "checkbox", Map.of());

        assertThat(cols).hasSize(2);
        assertThat(cols.get(0).getKey()).isEqualTo("tags");
        assertThat(cols.get(0).getColumnType()).isEqualTo("JSON");
        assertThat(cols.get(1).getKey()).isEqualTo("tags_text");
        assertThat(cols.get(1).getColumnType()).isEqualTo("VARCHAR");
        assertThat(cols.get(1).getLength()).isEqualTo(255);
        assertThat(cols.get(1).isHidden()).isTrue();
    }

    @Test
    void mapArrayComponent_selectMultiple_generatesTwoColumns() {
        List<ColumnConfig> cols = ColumnTypeMapper.mapArrayComponentToColumns("dept", "select",
                Map.of("multiple", true));

        assertThat(cols).hasSize(2);
        assertThat(cols.get(0).getKey()).isEqualTo("dept");
        assertThat(cols.get(0).getColumnType()).isEqualTo("JSON");
        assertThat(cols.get(1).getKey()).isEqualTo("dept_text");
        assertThat(cols.get(1).getColumnType()).isEqualTo("VARCHAR");
        assertThat(cols.get(1).isHidden()).isTrue();
    }

    @Test
    void mapArrayComponent_treeSelectSingle_generatesTwoColumns() {
        List<ColumnConfig> cols = ColumnTypeMapper.mapArrayComponentToColumns("org", "elTreeSelect",
                Map.of("multiple", false));

        assertThat(cols).hasSize(2);
        assertThat(cols.get(0).getKey()).isEqualTo("org");
        assertThat(cols.get(0).getColumnType()).isEqualTo("JSON");
        assertThat(cols.get(1).getKey()).isEqualTo("org_text");
        assertThat(cols.get(1).getColumnType()).isEqualTo("VARCHAR");
        assertThat(cols.get(1).isHidden()).isTrue();
    }

    @Test
    void mapArrayComponent_cascader_generatesTwoColumns() {
        List<ColumnConfig> cols = ColumnTypeMapper.mapArrayComponentToColumns("region", "cascader", Map.of());

        assertThat(cols).hasSize(2);
        assertThat(cols.get(0).getKey()).isEqualTo("region");
        assertThat(cols.get(0).getColumnType()).isEqualTo("JSON");
        assertThat(cols.get(1).getKey()).isEqualTo("region_text");
        assertThat(cols.get(1).getColumnType()).isEqualTo("VARCHAR");
        assertThat(cols.get(1).isHidden()).isTrue();
    }

    @Test
    void mapArrayComponent_selectSingle_generatesTwoColumns() {
        // select 单选与多选统一：主列 JSON + _text 文本列（查询走文本列）
        List<ColumnConfig> cols = ColumnTypeMapper.mapArrayComponentToColumns("grade", "select", Map.of());

        assertThat(cols).hasSize(2);
        assertThat(cols.get(0).getKey()).isEqualTo("grade");
        assertThat(cols.get(0).getColumnType()).isEqualTo("JSON");
        assertThat(cols.get(1).getKey()).isEqualTo("grade_text");
        assertThat(cols.get(1).getColumnType()).isEqualTo("VARCHAR");
        assertThat(cols.get(1).isHidden()).isTrue();
    }
}
